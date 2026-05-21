// ─── WorldLogic.js (v2) ──────────────────────────────────────────────────────
// Thin orchestrator — loads scripts, loads scene, wires Engine.
// All game logic lives in Engine.js and the individual systems.
// Was 684 lines → now ~140 lines.
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const { loadScript }      = await dc.require(folderPath + "/src/LoadScript.js");
const { Engine }          = await dc.require(folderPath + "/src/Engine.js");
const { SpherePipSpawner } = await dc.require(folderPath + "/src/SpherePipSpawner.jsx");
const { PaneLogic }       = await dc.require(folderPath + "/src/PaneLogic.js");
const { PhysicsSystem }   = await dc.require(folderPath + "/src/PhysicsSystem.js");
const { SceneLoader }     = await dc.require(folderPath + "/src/SceneLoader.js");

// CDN URLs — pinned to 7.5.0 for stability
const BABYLON_URL    = "https://cdn.babylonjs.com/babylon.js?v=7.5.0";
const GLTF_URL       = "https://cdn.babylonjs.com/loaders/babylon.glTFFileLoader.min.js?v=7.5.0";
const HAVOK_UMD_URL  = "https://cdn.babylonjs.com/havok/HavokPhysics_umd.js?v=7.5.0";
const HAVOK_WASM_URL = "https://cdn.babylonjs.com/havok/HavokPhysics.wasm?v=7.5.0";

// Default GLB config
const DEFAULT_GLB = {
  url:  "https://raw.githubusercontent.com/beto-group/beto.assets/main/",
  path: "DATACORE/WORLD888/",
  file: "scene888.glb",
  groundOptions: {
    enable: true, size: 2000, yPosition: 4,
    color: [0.4, 0.4, 0.4], subdivisions: 10, makeInvisible: true,
  },
};
const SCENE_SCALE = 11;

// ── GLB + Scene objects loader ───────────────────────────────────────────────

async function _loadGLBIntoScene(scene, glbConfig) {
  return SceneLoader.loadIntoScene(scene, glbConfig, folderPath);
}

// ── Main WorldLogic function ─────────────────────────────────────────────────

function WorldLogic({ canvasRef, glbBasePath = 'assets/glb/', passcode = null }) {
  return new Promise(async (resolve, reject) => {
    let gameEngine = null;
    let engineResources = null;
    let resizeHandler = null;

    const cleanup = () => {
      try { if (resizeHandler) window.removeEventListener('resize', resizeHandler); } catch (_) {}
      try { if (gameEngine) gameEngine.dispose(); } catch (_) {}
      gameEngine = null; engineResources = null; resizeHandler = null;
    };

    try {
      // ── Stage 0: Load external scripts ────────────────────────────────
      if (!window.BABYLON) {
        await loadScript(BABYLON_URL);
      }
      if (!window.BABYLON?.GLTFFileLoader) {
        await loadScript(GLTF_URL);
      }

      // Load Havok WASM + UMD
      const wasmRes = await fetch(HAVOK_WASM_URL);
      if (!wasmRes.ok) throw new Error(`Havok WASM fetch failed: ${wasmRes.status}`);
      const wasmBuffer = await wasmRes.arrayBuffer();

      if (!window.HavokPhysics) {
        await loadScript(HAVOK_UMD_URL);
      }
      if (typeof window.HavokPhysics !== 'function') {
        throw new Error('window.HavokPhysics not a function after load.');
      }
      window.HK = await window.HavokPhysics({ wasmBinary: wasmBuffer });

      // ── Stage 1: Init Engine (Babylon scene + all systems) ────────────
      gameEngine = Engine.create();
      
      const adapter = dc?.app?.vault?.adapter;
      const isBrowser = !adapter || typeof adapter.exists !== 'function';
      const catGlbUrl = isBrowser ? '/glb/cat.glb' : adapter.getResourcePath(`${folderPath}/assets/glb/cat.glb`);
      
      engineResources = await gameEngine.init(canvasRef, passcode, catGlbUrl);
      const { engine, scene, camera, displayCapsule, applyPhysicsToMesh } = engineResources;

      // ── Stage 2: Load GLB world geometry ─────────────────────────────
      const { glbRootNode, environmentMeshes, animatedMeshes, sceneCleanup } =
        await _loadGLBIntoScene(scene, DEFAULT_GLB);

      // Scale and position world
      if (glbRootNode) {
        glbRootNode.rotation = window.BABYLON.Vector3.Zero();
        glbRootNode.position = window.BABYLON.Vector3.Zero();
        glbRootNode.scaling  = new window.BABYLON.Vector3(SCENE_SCALE, SCENE_SCALE, SCENE_SCALE);
      }

      // ── Stage 3: Apply physics to environment ─────────────────────────
      const animatedSet = new Set(animatedMeshes);
      let physicsCount  = 0;

      for (const node of environmentMeshes) {
        if (!node || node.isDisposed()) continue;
        if (!(node instanceof window.BABYLON.Mesh) || node.getTotalVertices() === 0) continue;

        const isAnimated = animatedSet.has(node);
        const opts = isAnimated
          ? { mass: 0, restitution: 0.1, friction: 0.5, motionType: window.BABYLON.PhysicsMotionType.KINEMATIC }
          : { mass: 0, restitution: 0.1, friction: 0.5, motionType: window.BABYLON.PhysicsMotionType.STATIC };

        try {
          const agg = applyPhysicsToMesh({ mesh: node, scene, shapeType: 'MESH', options: opts });
          if (agg) {
            physicsCount++;
            if (!isAnimated) node.freezeWorldMatrix();
          }
        } catch (e) {
          console.warn('[WorldLogic] Physics apply error for', node.name, e);
        }
      }

      if (physicsCount === 0 && environmentMeshes.some(m => m instanceof window.BABYLON.Mesh)) {
        console.warn('[WorldLogic] ⚠️ No physics aggregates applied — collisions will fail!');
      }

      // ── Stage 4: Window resize ────────────────────────────────────────
      resizeHandler = () => { if (engine && !engine.isDisposed) engine.resize(); };
      window.addEventListener('resize', resizeHandler);

      // ── Resolve ───────────────────────────────────────────────────────
      resolve({
        engine,
        scene,
        characterComponents: {
          camera,
          displayCapsule,
          cameraControls:   engineResources.cameraControls,
          controlState:     engineResources.controlState,
          isOnGround:       () => engineResources.controlState?.getState() === 'ON_GROUND',
          getCurrentState:  () => engineResources.controlState?.getState(),
          getIsCrouching:   () => engineResources.controlState?.isCrouching() ?? false,
        },
        multiplayerResources: {
          isBroadcastChannel: true,
          instanceId: engineResources.multiplayerInstanceId || 'unknown',
        },
        SpherePipSpawner,
        cleanup,
      });

    } catch (err) {
      console.error('[WorldLogic] Fatal error:', err);
      cleanup();
      reject(err);
    }
  });
}

return { WorldLogic };