// ─── Engine.js ───────────────────────────────────────────────────────────────
// The game engine entry point.
// Owns: Babylon engine + scene lifecycle, system init order, cleanup.
// Does NOT contain any game logic — it only wires systems together.
//
// Usage:
//   const engine = Engine.create();
//   await engine.init(canvasRef, glbConfig, passcode);
//   // ... later
//   engine.dispose();
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/World888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const { EventBus }          = await dc.require(folderPath + "/src/EventBus.js");
const { InputSystem }       = await dc.require(folderPath + "/src/InputSystem.js");
const { PhysicsSystem }     = await dc.require(folderPath + "/src/PhysicsSystem.js");
const { MovementSystem }    = await dc.require(folderPath + "/src/MovementSystem.js");
const { CameraSystem }      = await dc.require(folderPath + "/src/CameraSystem.js");
const { RenderSystem }      = await dc.require(folderPath + "/src/RenderSystem.js");
const { MultiplayerSystem } = await dc.require(folderPath + "/src/MultiplayerSystem.js");
const { createMovementConfig } = await dc.require(folderPath + "/src/MovementConfig.js");

const Engine = (() => {

  function create() {
    let _babylonEngine  = null;
    let _scene          = null;
    let _isDisposed     = false;

    // ── Babylon engine + scene init ────────────────────────────────────────

    function _initBabylon(canvasRef) {
      if (!window.BABYLON) throw new Error('[Engine] Babylon.js not loaded.');
      const canvas = canvasRef?.current;
      if (!canvas) throw new Error('[Engine] Canvas ref is null.');

      const eng = new window.BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil:   true,
        antialias: true,
      });

      if (!eng._gl) {
        eng.dispose();
        throw new Error('[Engine] WebGL context unavailable.');
      }

      // Context loss handling
      const onLost = (e) => {
        console.warn('[Engine] WebGL context lost.');
        e.preventDefault();
        if (!eng.isDisposed) eng._onContextLost(e);
      };
      const onRestored = () => {
        if (!eng.isDisposed) eng._onContextRestored();
      };
      canvas.addEventListener('webglcontextlost',      onLost,      false);
      canvas.addEventListener('webglcontextrestored',  onRestored,  false);
      canvas._w888_lostH     = onLost;
      canvas._w888_restoredH = onRestored;

      const scene = new window.BABYLON.Scene(eng);
      scene.clearColor = new window.BABYLON.Color4(0.08, 0.08, 0.1, 1);
      scene.autoClear  = true;
      scene.autoClearDepthAndStencil = true;

      // We intentionally do NOT start the render loop here because we need to await async assets (like the character GLB)
      // before attaching a camera. Starting the loop here causes a 'No camera defined' crash.

      return { eng, scene };
    }

    // ── Character setup ────────────────────────────────────────────────────

    async function _createCharacter(scene, catGlbUrl) {
      const NORMAL_H = 1.8;
      const RADIUS   = 0.5;
      const CROUCH_H = NORMAL_H / 2;
      const START    = new window.BABYLON.Vector3(-4.0, 33.0, -16.0);

      // Ambient light
      const light = new window.BABYLON.HemisphericLight(
        'w888_light', new window.BABYLON.Vector3(0, 1, 0), scene
      );
      light.intensity = 0.8;

      // Visual capsule
      const capsule = window.BABYLON.MeshBuilder.CreateCapsule(
        'CharacterDisplay',
        { height: NORMAL_H, radius: RADIUS, subdivisions: 4, updatable: true },
        scene
      );
      capsule.position.copyFrom(START);
      capsule.rotationQuaternion = window.BABYLON.Quaternion.Identity();
      capsule.checkCollisions = false;
      capsule.isPickable      = false;
      capsule.metadata        = { baseHeight: NORMAL_H };
      capsule.isVisible       = false; // Hide the capsule

      let animations = {};

      if (catGlbUrl) {
        try {
          const cleanUrl = catGlbUrl.split('?')[0];
          const lastSlash = cleanUrl.lastIndexOf('/');
          const rootUrl = cleanUrl.substring(0, lastSlash + 1);
          const filename = cleanUrl.substring(lastSlash + 1);

          const result = await window.BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, filename, scene, null, '.glb');
          
          const rootNode = result.meshes.find(m => m.name === '__root__');
          if (rootNode) {
            rootNode.parent = capsule;
            rootNode.position.y = -NORMAL_H / 2; // Move feet to bottom of capsule
            // Scale and rotate if necessary, but assume default for now
            rootNode.rotation = new window.BABYLON.Vector3(0, Math.PI, 0); // Face -Z (Babylon default +Z might be backwards for the model)
          }

          if (result.animationGroups) {
            result.animationGroups.forEach(ag => {
              ag.stop(); // Stop all animations initially
              animations[ag.name] = ag;
            });
          }
        } catch (err) {
          console.error('[Engine] Failed to load character model:', err);
        }
      }

      // Physics controller
      const cc = PhysicsSystem.createCharacterController(START, NORMAL_H, RADIUS, scene);

      return { capsule, cc, light, START, NORMAL_H, CROUCH_H, RADIUS, animations };
    }

    // ── Main init ─────────────────────────────────────────────────────────

    async function init(canvasRef, passcode, catGlbUrl) {
      // 1. Babylon engine + scene
      const { eng, scene } = _initBabylon(canvasRef);
      _babylonEngine = eng;
      _scene         = scene;

      // 2. Physics (Havok must already be loaded by SceneLoader)
      await PhysicsSystem.initHavok(scene);

      // 3. Character
      const char = await _createCharacter(scene, catGlbUrl);

      // 4. Movement config
      const cfg = createMovementConfig(char.NORMAL_H, char.CROUCH_H, char.RADIUS);

      // 5. Input system
      InputSystem.initialize(scene, canvasRef);

      // 6. Camera
      CameraSystem.initialize(scene, canvasRef, char.capsule, char.START);
      const camera = CameraSystem.getCamera();
      if (scene.activeCamera !== camera) scene.activeCamera = camera;

      // 7. Movement (depends on camera for orientation read)
      MovementSystem.initialize(scene, camera, char.cc, char.capsule, cfg);

      // 8. Render (syncs visual capsule to physics controller)
      RenderSystem.initialize(scene, char.cc, char.capsule, MovementSystem, char.animations);

      // 9. Multiplayer
      MultiplayerSystem.initialize({ scene, movementSystem: MovementSystem, passcode, catGlbUrl });

      // Emit scene ready
      EventBus.emit('engine:ready', { scene, engine: eng });

      // Start the render loop now that the camera and everything else is initialized
      eng.runRenderLoop(() => {
        if (!scene.isDisposed) scene.render();
      });
      
      // Force a resize now that the DOM has likely settled after the async loads
      eng.resize();

      return {
        engine: eng,
        scene,
        camera,
        displayCapsule:       char.capsule,
        characterController:  char.cc,
        light:                char.light,
        // Expose for SceneLoader (GLB loading + physics)
        applyPhysicsToMesh: PhysicsSystem.applyPhysicsToMesh,
        // Expose for UI / Multiplayer status
        controlState:         MovementSystem.controlState,
        multiplayerInstanceId: MultiplayerSystem.getInstanceId?.() || null,
        cameraControls: {
          isPointerLocked: () => InputSystem.isPointerLocked(),
          toggleCameraMode: () => EventBus.emit('input:tab', {}),
          getCurrentMode:   () => CameraSystem.getMode(),
          setTargetOffsetY: (y) => EventBus.emit('camera:offsetY', { y }),
        },
        cleanup: dispose,
      };
    }

    // ── Dispose ───────────────────────────────────────────────────────────

    function dispose() {
      if (_isDisposed) return;
      _isDisposed = true;

      try { MultiplayerSystem.dispose(); } catch (e) { console.warn('[Engine] Multiplayer dispose error:', e); }
      try { RenderSystem.dispose();      } catch (e) { console.warn('[Engine] Render dispose error:', e); }
      try { MovementSystem.dispose();    } catch (e) { console.warn('[Engine] Movement dispose error:', e); }
      try { CameraSystem.dispose();      } catch (e) { console.warn('[Engine] Camera dispose error:', e); }
      try { InputSystem.dispose();       } catch (e) { console.warn('[Engine] Input dispose error:', e); }
      try { PhysicsSystem.dispose();     } catch (e) { console.warn('[Engine] Physics dispose error:', e); }

      EventBus.clear();

      if (_scene && !_scene.isDisposed) {
        try { _scene.dispose(); } catch (e) { console.warn('[Engine] Scene dispose error:', e); }
      }
      if (_babylonEngine && !_babylonEngine.isDisposed) {
        try { _babylonEngine.dispose(); } catch (e) { console.warn('[Engine] Babylon engine dispose error:', e); }
      }

      _scene = null;
      _babylonEngine = null;
      EventBus.emit('engine:dispose', {});
    }

    return { init, dispose };
  }

  return { create };
})();

return { Engine };
