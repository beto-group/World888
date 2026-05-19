const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

// Keep all imports from your original overhead code
const { loadScript } = await dc.require(folderPath + "/src/LoadScript.js");
const { CharacterLogic } = await dc.require(folderPath + "/src/CharacterLogic.js");
const { SpherePipSpawner } = await dc.require(folderPath + "/src/SpherePipSpawner.jsx");
const { PaneLogic } = await dc.require(folderPath + "/src/PaneLogic.js");
const { applyPhysicsToMesh, initializeHavokPhysics } = await dc.require(folderPath + "/src/HavokPhysics.js");
const { Multiplayer } = await dc.require(folderPath + "/src/Multiplayer.js");

// Script URLs
const BABYLON_URL = "https://cdn.babylonjs.com/babylon.js?v=7.5.0";
const GLTF_LOADER_URL = "https://cdn.babylonjs.com/loaders/babylon.glTFFileLoader.min.js?v=7.5.0";
const HAVOK_UMD_URL = "https://cdn.babylonjs.com/havok/HavokPhysics_umd.js?v=7.5.0";
const HAVOK_WASM_URL = "https://cdn.babylonjs.com/havok/HavokPhysics.wasm?v=7.5.0";

// --- SceneLoader Module ---

function initBabylonEngineAndScene(canvasRef) {
    if (!window.BABYLON) { console.error("SceneLoader.init: FATAL - Babylon.js not loaded."); return null; }
    const canvas = canvasRef?.current;
    if (!canvas) { console.error("SceneLoader.init: Canvas reference missing or null."); return null; }

    const engine = new window.BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        antialias: true
    });

    engine.uniqueId = engine.uniqueId || (Math.random() * 1000).toFixed(0);
    // console.log(`SceneLoader.init: Engine created (ID: ${engine.uniqueId}).`);

    if (!engine._gl) {
        console.error(`SceneLoader.init: Engine (ID: ${engine.uniqueId}) creation failed (no WebGL context?). Disposing.`);
        engine.dispose();
        return null;
    }

    const contextLostHandler = (event) => {
        console.warn(`SceneLoader: WebGL context LOST for engine (ID: ${engine.uniqueId}).`);
        event.preventDefault();
        if (!engine.isDisposed) {
            engine._onContextLost(event);
        }
    };
    const contextRestoredHandler = () => {
        // console.log(`SceneLoader: WebGL context RESTORED for engine (ID: ${engine.uniqueId}).`);
        if (!engine.isDisposed) {
            engine._onContextRestored();
        }
    };

    canvas.removeEventListener("webglcontextlost", canvas._previousContextLostHandler || (() => {}));
    canvas.removeEventListener("webglcontextrestored", canvas._previousContextRestoredHandler || (() => {}));

    canvas.addEventListener("webglcontextlost", contextLostHandler, false);
    canvas.addEventListener("webglcontextrestored", contextRestoredHandler, false);

    canvas._previousContextLostHandler = contextLostHandler;
    canvas._previousContextRestoredHandler = contextRestoredHandler;

    // console.log(`SceneLoader.init: Creating new BABYLON.Scene for engine (ID: ${engine.uniqueId})...`);
    const scene = new window.BABYLON.Scene(engine);
    scene.clearColor = new window.BABYLON.Color4(0.1, 0.1, 0.1, 1);
    scene.autoClear = true;
    scene.autoClearDepthAndStencil = true;
    // console.log(`SceneLoader.init: Scene created for engine (ID: ${engine.uniqueId}).`);

    return { engine, scene, canvas };
}

async function loadSceneObjects(scene, glbConfig) {
    if (!window.BABYLON?.SceneLoader) { throw new Error("loadSceneObjects: Babylon.js SceneLoader not available."); }
    if (!scene || scene.isDisposed) { throw new Error(`loadSceneObjects: Scene is invalid or disposed.`); }

    const { url, path, file } = glbConfig;
    const allImportedNodes = [];
    let glbRootNode = null;

    // Construct paths
    const fullRemotePath = `${url}${path}${file}`;
    const isRemoteFile = fullRemotePath.startsWith('http');
    
    let glbUrl = fullRemotePath;
    
    // If it's a remote file, try to cache it locally first
    if (isRemoteFile) {
        // Get component file path to determine local cache location
        // Use dc.resolvePath to get the actual component file location, not the current file
        const localCachePath = `${folderPath}/assets/glb/${file}`;
        
        // console.log(`SceneLoader.loadObjects: Remote file detected. Cache path: ${localCachePath}`);
        
        // Check if file exists locally
        const adapter = dc.app.vault.adapter;
        const localExists = await adapter.exists(localCachePath);
        
        if (localExists) {
            // console.log(`SceneLoader.loadObjects: Using cached local file: ${localCachePath}`);
            glbUrl = adapter.getResourcePath(localCachePath);
        } else {
            // console.log(`SceneLoader.loadObjects: File not cached. Downloading from: ${fullRemotePath}`);
            try {
                // Download the file
                const response = await fetch(fullRemotePath);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const arrayBuffer = await response.arrayBuffer();
                
                // Ensure directory exists
                const cacheDir = `${folderPath}/assets/glb`;
                if (!(await adapter.exists(cacheDir))) {
                    // console.log(`SceneLoader.loadObjects: Creating cache directory: ${cacheDir}`);
                    await adapter.mkdir(cacheDir);
                }
                
                // Save to vault (convert ArrayBuffer to binary string for Obsidian)
                const uint8Array = new Uint8Array(arrayBuffer);
                await adapter.writeBinary(localCachePath, uint8Array);
                // console.log(`SceneLoader.loadObjects: File cached successfully to: ${localCachePath}`);
                
                // Now use the cached file
                glbUrl = adapter.getResourcePath(localCachePath);
            } catch (downloadError) {
                console.warn(`SceneLoader.loadObjects: Failed to cache file. Falling back to direct URL load.`, downloadError);
                glbUrl = fullRemotePath; // Fall back to direct URL
            }
        }
    } else {
        // Local file - use vault adapter
        glbUrl = dc.app.vault.adapter.getResourcePath(fullRemotePath);
    }

    // console.log(`SceneLoader.loadObjects: Loading GLB from: ${glbUrl}`);
    try {
        const cleanGlbUrl = glbUrl.split('?')[0];
        const lastSlash = cleanGlbUrl.lastIndexOf("/");
        const rootUrl = cleanGlbUrl.substring(0, lastSlash + 1);
        const sceneFilename = cleanGlbUrl.substring(lastSlash + 1);
        const result = await window.BABYLON.SceneLoader.ImportMeshAsync("", rootUrl, sceneFilename, scene, null, ".glb");
        // console.log(`SceneLoader.loadObjects: GLB loaded. Processing ${result.meshes.length} meshes/nodes...`);

        for (const node of result.meshes) {
            if (!node || node.isDisposed()) {
                // console.log(`SceneLoader.loadObjects: Skipping null/disposed node.`);
                continue;
            };
            if (node.name === "__root__") {
                glbRootNode = node;
                // console.log(`SceneLoader.loadObjects: Identified root node: ${node.name}.`);
                allImportedNodes.push(node);
                continue;
            }

            if (node instanceof window.BABYLON.Mesh) {
                const hasPositions = node.getVerticesData(window.BABYLON.VertexBuffer.PositionKind);
                const hasIndices = node.getIndices();
                let isValid = true;
                if (!hasPositions || hasPositions.length === 0) {
                    console.warn(`SceneLoader.loadObjects: Mesh ${node.name} has NO POSITION data. Disposing.`);
                    node.dispose();
                    isValid = false;
                }
                if (!hasIndices || hasIndices.length === 0) {
                    console.warn(`SceneLoader.loadObjects: Mesh ${node.name} has NO INDEX data. This might be unexpected, but not necessarily invalid.`);
                }
                if (isValid) {
                    node.isPickable = false;
                    allImportedNodes.push(node);
                }
            } else if (node instanceof window.BABYLON.TransformNode) {
                // console.log(`SceneLoader.loadObjects: Added TransformNode "${node.name}".`);
                allImportedNodes.push(node);
            } else {
                console.warn(`SceneLoader.loadObjects: Unknown node type for "${node.name}". Skipping.`);
            }
        }

    } catch (err) {
        console.error(`SceneLoader.loadObjects: Failed during GLB loading or node processing for scene (Engine ID: ${scene?.getEngine()?.uniqueId}):`, err);
        throw err;
    }

    return { glbRootNode, allImportedMeshes: allImportedNodes };
}

// Main sceneLoader Export function
async function sceneLoader({ canvasRef, glbConfig = {
  url: "https://raw.githubusercontent.com/beto-group/beto.assets/main/",
  path: "DATACORE/WORLD888/",
  file: "scene888.glb",
  groundOptions: {
    enable: true,
    size: 2000,
    yPosition: 4, 
    color: [0.4, 0.4, 0.4], 
    subdivisions: 10,
    makeInvisible: true // <<< ADDED THIS OPTION
  }
} }) {
    let engine = null;
    let scene = null;
    let canvas = null;
    let onBeforeRenderObserver = null;

    const animatedVisualMeshes = []; 

    try {
        // console.log("--- sceneLoader function started ---");

        const engineAndScene = initBabylonEngineAndScene(canvasRef);
        if (!engineAndScene || !engineAndScene.engine || !engineAndScene.scene) {
            throw new Error("SceneLoader main: Failed to initialize Engine and Scene.");
        }
        engine = engineAndScene.engine;
        scene = engineAndScene.scene;
        canvas = engineAndScene.canvas;

        const camera = new window.BABYLON.ArcRotateCamera("camera", Math.PI / 2, Math.PI / 2.5, 1000, window.BABYLON.Vector3.Zero(), scene);
        if (canvas) camera.attachControl(canvas, true);
        camera.wheelPrecision = 50;
        // console.log("Camera setup complete.");

        const light = new window.BABYLON.HemisphericLight("light", new window.BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.7;
        // console.log("Light setup complete.");

        let groundMesh = null;
        if (glbConfig.groundOptions && glbConfig.groundOptions.enable) {
            // console.log("SceneLoader: Creating ground mesh...");
            groundMesh = window.BABYLON.MeshBuilder.CreateGround("sceneGround", {
                width: glbConfig.groundOptions.size || 1000,
                height: glbConfig.groundOptions.size || 1000,
                subdivisions: glbConfig.groundOptions.subdivisions || 2
            }, scene);
            
            groundMesh.position.y = glbConfig.groundOptions.yPosition !== undefined ? glbConfig.groundOptions.yPosition : 0;

            // --- MODIFICATION: Make ground invisible if option is set ---
            if (glbConfig.groundOptions.makeInvisible) {
                groundMesh.isVisible = false;
                // console.log("SceneLoader: Ground mesh set to invisible.");
            } else {
                 // Only create and assign material if it's visible
                const groundMaterial = new window.BABYLON.StandardMaterial("groundMaterial", scene);
                if (glbConfig.groundOptions.color && Array.isArray(glbConfig.groundOptions.color) && glbConfig.groundOptions.color.length === 3) {
                    groundMaterial.diffuseColor = new window.BABYLON.Color3(...glbConfig.groundOptions.color);
                } else {
                    groundMaterial.diffuseColor = new window.BABYLON.Color3(0.3, 0.5, 0.3); // Default green-ish
                }
                groundMaterial.specularColor = new window.BABYLON.Color3(0.1, 0.1, 0.1);
                groundMesh.material = groundMaterial;
            }
            // --- END MODIFICATION ---
            
            groundMesh.isPickable = false; 
            // console.log(`SceneLoader: Ground mesh created at Y: ${groundMesh.position.y}, Size: ${glbConfig.groundOptions.size || 1000}x${glbConfig.groundOptions.size || 1000}. Visible: ${groundMesh.isVisible}`);
        }

        const { glbRootNode, allImportedMeshes } = await loadSceneObjects(scene, glbConfig);
        // console.log(`After loadSceneObjects: glbRootNode found: ${!!glbRootNode}, total imported meshes/nodes: ${allImportedMeshes.length}`);

        const environmentMeshesForPhysics = [...allImportedMeshes];
        if (groundMesh) {
            environmentMeshesForPhysics.push(groundMesh);
        }


        const SCENE_SCALE = 11; 

        if (glbRootNode) {
            glbRootNode.rotation = window.BABYLON.Vector3.Zero();
            glbRootNode.position = window.BABYLON.Vector3.Zero();
            glbRootNode.scaling = new window.BABYLON.Vector3(SCENE_SCALE, SCENE_SCALE, SCENE_SCALE);
            camera.target = glbRootNode.absolutePosition;
            // console.log(`GLB Root Node ("${glbRootNode.name}") set to be static at origin and scaled by ${SCENE_SCALE}x. Camera target set.`);
        } else {
            console.warn("No __root__ node found in GLB. Camera target defaulted to Zero.");
            camera.target = window.BABYLON.Vector3.Zero();
        }

        const rotatingMeshesWithSpeeds = [];

        let obeliskMesh = null;
        let obeliskOriginalY = 0;
        let hoverTime = 0;
        const hoverAmplitude = 0.05; 
        const hoverFrequency = 1.5;

        const minSpeed = 0.001;
        const maxSpeed = 0.01;

        // console.log(`--- Starting mesh selection for rotation ---`);
        let meshesProcessedForAnimation = 0;

        allImportedMeshes.forEach((node) => { 
            if (node instanceof window.BABYLON.Mesh && node.parent === glbRootNode) {
                // console.log(`    -> Selected mesh "${node.name}" (Parent: ${node.parent?.name}) for orbital rotation.`);

                const randomSpeed = minSpeed + (Math.random() * (maxSpeed - minSpeed));
                rotatingMeshesWithSpeeds.push({ mesh: node, speed: randomSpeed });
                animatedVisualMeshes.push(node); 
                // console.log(`    -> Added "${node.name}" to rotation list with speed: ${randomSpeed.toFixed(4)}. Also added to animatedVisualMeshes.`);
                meshesProcessedForAnimation++;

                if (node.name === "obelisk") {
                    obeliskMesh = node;
                    obeliskOriginalY = node.position.y; 
                    // console.log(`    -> Identified "obelisk" mesh for hovering. Original LOCAL Y (relative to glbRootNode): ${obeliskOriginalY.toFixed(4)}`);
                }
            } else {
                const parentName = node.parent ? node.parent.name : "none";
                if (node !== groundMesh) { 
                    // console.log(`    -> SKIPPING "${node.name}" for rotation. (Is BABYLON.Mesh: ${node instanceof window.BABYLON.Mesh}. Is Root Node: ${node.name === "__root__"}. Parent: ${parentName}).`);
                }
            }
        });

        // console.log(`--- Finished node selection. Processed ${meshesProcessedForAnimation} meshes for animation. ---`);
        if (meshesProcessedForAnimation === 0 && allImportedMeshes.some(m => m instanceof window.BABYLON.Mesh && m.parent === glbRootNode)) {
            console.warn("No actual BABYLON.Mesh instances that are direct children of '__root__' were selected for animation. Verify GLB hierarchy.");
        }


        onBeforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
            if (rotatingMeshesWithSpeeds.length > 0) {
                rotatingMeshesWithSpeeds.forEach((item) => {
                    item.mesh.rotate(window.BABYLON.Axis.Y, item.speed, window.BABYLON.Space.WORLD);
                    item.mesh.computeWorldMatrix(true);
                    if (item.mesh.physicsAggregate && item.mesh.physicsAggregate.body.motionType === window.BABYLON.PhysicsMotionType.KINEMATIC) {
                        const absolutePosition = item.mesh.getAbsolutePosition();
                        const absoluteRotation = item.mesh.absoluteRotationQuaternion;
                        item.mesh.physicsAggregate.body.setTargetTransform(absolutePosition, absoluteRotation);
                    }
                });
            }

            if (obeliskMesh) {
                const deltaTime = engine.getDeltaTime() / 1000;
                hoverTime += deltaTime * hoverFrequency;
                const localYOffset = hoverAmplitude * Math.sin(hoverTime);
                obeliskMesh.position.y = obeliskOriginalY + localYOffset;
                obeliskMesh.computeWorldMatrix(true); 
                if (obeliskMesh.physicsAggregate && obeliskMesh.physicsAggregate.body.motionType === window.BABYLON.PhysicsMotionType.KINEMATIC) {
                    const absolutePosition = obeliskMesh.getAbsolutePosition();
                    const absoluteRotation = obeliskMesh.absoluteRotationQuaternion;
                    obeliskMesh.physicsAggregate.body.setTargetTransform(absolutePosition, absoluteRotation);
                }
            }
        });

        // console.log("--- sceneLoader function completed. Animation logic set up. ---");

        return {
            engine: engine,
            scene: scene,
            environmentMeshes: environmentMeshesForPhysics,
            glbRootNode: glbRootNode,
            animatedVisualMeshes: animatedVisualMeshes,
            cleanup: () => {
                // console.log("--- Initiating SceneLoader cleanup ---");
                if (onBeforeRenderObserver) {
                    scene?.onBeforeRenderObservable.remove(onBeforeRenderObserver);
                    onBeforeRenderObserver = null;
                    // console.log("Removed onBeforeRenderObservable observer.");
                }
                if (scene && !scene.isDisposed) {
                    scene.dispose();
                    // console.log("Scene disposed by SceneLoader cleanup.");
                }
                if (engine && !engine.isDisposed) {
                    engine.dispose();
                    // console.log(`Engine (ID: ${engine.uniqueId}) disposed by SceneLoader cleanup.`);
                } else {
                    // console.log("Engine already disposed or not initialized during SceneLoader cleanup.");
                }
                engine = null;
                scene = null;
                // console.log("--- SceneLoader cleanup complete ---");
            }
        };
    } catch (err) {
        console.error("--- sceneLoader encountered a fatal error ---", err);
        if (onBeforeRenderObserver) {
            scene?.onBeforeRenderObservable.remove(onBeforeRenderObserver);
            onBeforeRenderObserver = null;
        }
        if (scene && !scene.isDisposed) {
            scene.dispose();
        }
        if (engine && !engine.isDisposed) {
            engine.dispose();
        }
        engine = null;
        scene = null;
        throw err;
    }
}

// --- Main WorldLogic Function ---
function WorldLogic({ canvasRef, glbBasePath = 'assets/glb/' }) {
  const logicInstanceId = (Math.random() * 1000).toFixed(0);
  const logPrefix = `WorldLogic [${logicInstanceId}]:`;

//   console.log(`${logPrefix} Starting with GLB base path: ${glbBasePath}`);

  return new Promise(async (resolveWorldLogic, rejectWorldLogic) => {
    let engine = null;
    let scene = null;
    let characterComponents = null;
    let keyboardObserver = null;
    let sceneDisposeObserver = null;
    let multiplayerResources = null;
    let resizeHandler = null;
    let sceneLoaderCleanupFn = null;

    let worldCleanup = () => {
        const cleanupPrefix = `${logPrefix} Preliminary Cleanup:`;
        // console.log(`${cleanupPrefix} Running preliminary cleanup...`);

        if (engine && typeof engine.stopRenderLoop === 'function') {
            try { engine.stopRenderLoop(); } catch (e) { console.warn(`${cleanupPrefix} Error stopping render loop:`, e); }
        }
        if (resizeHandler) { try { window.removeEventListener("resize", resizeHandler); resizeHandler = null; } catch(e) { console.warn(`${cleanupPrefix} Error removing resize listener:`, e); } }
         try {
             const currentCanvas = canvasRef?.current;
             if (currentCanvas && currentCanvas._attachedWheelHandler) { currentCanvas.removeEventListener("wheel", currentCanvas._attachedWheelHandler); delete currentCanvas._attachedWheelHandler; console.log(`${cleanupPrefix} Removed wheel listener.`); }
              if (currentCanvas && currentCanvas._attachedKeydownHandler) { currentCanvas.removeEventListener("keydown", currentCanvas._attachedKeydownHandler); delete currentCanvas._attachedKeydownHandler; console.log(`${cleanupPrefix} Removed keydown listener.`); }
         } catch (e) { console.warn(`${cleanupPrefix} Error removing canvas listeners:`, e); }

        if (sceneLoaderCleanupFn && typeof sceneLoaderCleanupFn === 'function') { try { sceneLoaderCleanupFn(); } catch (e) { console.warn(`${cleanupPrefix} Error during sceneLoader cleanup:`, e); } }

        if (characterComponents && typeof characterComponents.cleanup === 'function') { try { characterComponents.cleanup(); } catch(e) { console.warn(`${cleanupPrefix} Error during character cleanup:`, e); } }
        try { if (scene && keyboardObserver) scene.onKeyboardObservable.remove(keyboardObserver); } catch(e) { console.warn(`${cleanupPrefix} Error removing keyboard observer:`, e); }
        try { if (scene && sceneDisposeObserver) scene.onDisposeObservable.remove(sceneDisposeObserver); } catch(e) { console.warn(`${cleanupPrefix} Error removing scene dispose observer:`, e); }

        if (engine && typeof engine.dispose === 'function' && !engine.isDisposed) {
            //  console.log(`${cleanupPrefix} Disposing engine...`);
             try { engine.dispose(); } catch (e) { console.warn(`${cleanupPrefix} Error during engine disposal:`, e); }
        } else { 
            // console.log(`${cleanupPrefix} Engine already null, disposed, or invalid.`);
            }

        engine = null; scene = null; characterComponents = null; keyboardObserver = null;
        sceneDisposeObserver = null; multiplayerResources = null; sceneLoaderCleanupFn = null;
        // console.log(`${cleanupPrefix} Preliminary cleanup finished.`);
    };

    try {
      console.log(`${logPrefix} Stage 0: Loading Babylon.js and Havok Physics...`);
      
      if (!window.BABYLON) {
        await loadScript(BABYLON_URL).catch(err => { throw new Error(`Stage 0 Failed - Load Babylon.js: ${err.message}`); });
      }
      
      // Check if GLTF/GLB loader is present
      const isGltfRegistered = !!window.BABYLON.GLTFFileLoader;
      if (!isGltfRegistered) {
        await loadScript(GLTF_LOADER_URL).catch(err => { throw new Error(`Stage 0 Failed - Load GLTF Loader: ${err.message}`); });
      }

      const wasmResponse = await fetch(HAVOK_WASM_URL);
      if (!wasmResponse.ok) throw new Error(`Stage 0 Failed - Fetch WASM: HTTP status ${wasmResponse.status}`);
      const havokWasmBuffer = await wasmResponse.arrayBuffer();
      
      if (!window.HavokPhysics) {
        await loadScript(HAVOK_UMD_URL).catch(err => { throw new Error(`Stage 0 Failed - Load Havok UMD: ${err.message}`); });
      }
      
      if (typeof window.HavokPhysics !== 'function') throw new Error("Stage 0 Failed - window.HavokPhysics not found.");
      const havokModule = await window.HavokPhysics({ wasmBinary: havokWasmBuffer });
      window.HK = havokModule;
    //   console.log(`${logPrefix} Stage 0: Babylon.js and Havok Physics loaded.`);

    //   console.log(`${logPrefix} Stage 1: Initializing scene and loading GLB...`);
      // Create custom glbConfig with the remote URL (will be cached locally by loadSceneObjects)
      const customGlbConfig = {
        url: "https://raw.githubusercontent.com/beto-group/beto.assets/main/",
        path: "DATACORE/WORLD888/",
        file: "scene888.glb",
        groundOptions: {
          enable: true,
          size: 2000,
          yPosition: 4,
          color: [0.4, 0.4, 0.4],
          subdivisions: 10,
          makeInvisible: true
        }
      };
      const sceneResources = await sceneLoader({ canvasRef, glbConfig: customGlbConfig });
      engine = sceneResources.engine;
      scene = sceneResources.scene;
      const environmentMeshes = sceneResources.environmentMeshes; 
      const animatedVisualMeshes = sceneResources.animatedVisualMeshes; 
      sceneLoaderCleanupFn = sceneResources.cleanup;

      if (!engine || engine.isDisposed) throw new Error("Stage 1 Failed - Engine invalid after sceneLoader.");
      if (!scene || scene.isDisposed) throw new Error("Stage 1 Failed - Scene invalid after sceneLoader.");
    //   console.log(`${logPrefix} Stage 1: Scene and GLB (and potentially ground) loaded.`);

    //   console.log(`${logPrefix} Stage 2: Initializing Havok Physics...`);
       await initializeHavokPhysics(scene).catch(err => { throw new Error(`Stage 2 Failed - initializeHavokPhysics: ${err.message}`); });
       await new Promise(resolve => setTimeout(resolve, 10)); 
       if (!scene.isPhysicsEnabled()) {
            console.error(`${logPrefix} Verification failed: scene.isPhysicsEnabled() is false.`);
            const physicsEnginePlugin = scene.getPhysicsEngine()?.getPlugin();
             console.error(`${logPrefix} Current physics engine plugin:`, physicsEnginePlugin);
            throw new Error("Stage 2 Failed - Verification: Physics not enabled after initialization.");
       }
    //    console.log(`${logPrefix} Stage 2: Havok Physics initialized.`);

    //   console.log(`${logPrefix} Stage 3: Applying physics to environment meshes...`);
      let physicsAppliedCount = 0;
      if (!Array.isArray(environmentMeshes)) {
           console.warn(`${logPrefix} environmentMeshes is not an array. Skipping physics application.`);
      } else {
          const animatedMeshSet = new Set(animatedVisualMeshes);

          for (const node of environmentMeshes) { 
              if (!node || node.isDisposed()) continue;
              
              if (!(node instanceof window.BABYLON.Mesh) || node.getTotalVertices() === 0) {
                  // Skip auxiliary nodes or empty meshes quietly
                  continue;
              }
              
              if (!scene.isPhysicsEnabled()) { console.error(`${logPrefix} Physics became disabled before mesh ${node.name}! Aborting.`); break; }

              let physicsAggregate = null;
              try {
                    if (animatedMeshSet.has(node)) { 
                        physicsAggregate = applyPhysicsToMesh({
                            mesh: node,
                            scene,
                            shapeType: "MESH", 
                            options: { mass: 0, restitution: 0.1, friction: 0.5, motionType: window.BABYLON.PhysicsMotionType.KINEMATIC } 
                        });
                        if (physicsAggregate) {
                            node.physicsAggregate = physicsAggregate; 
                            physicsAppliedCount++;
                        }
                    } else {
                        physicsAggregate = applyPhysicsToMesh({
                            mesh: node,
                            scene,
                            shapeType: "MESH", 
                            options: { mass: 0, restitution: 0.1, friction: 0.5, motionType: window.BABYLON.PhysicsMotionType.STATIC } 
                        });
                        if (physicsAggregate) {
                            physicsAppliedCount++;
                            node.freezeWorldMatrix(); 
                        }
                    }
              } catch (physicsErr) {
                   console.error(`${logPrefix} EXCEPTION applying physics to mesh ${node.name}:`, physicsErr);
              }
          }
          
          if (physicsAppliedCount === 0 && environmentMeshes.filter(m => m instanceof window.BABYLON.Mesh).length > 0) {
               console.warn(`${logPrefix} WARNING: No physics aggregates successfully applied to any meshes! Collisions WILL fail.`);
          }
      }
    //   console.log(`${logPrefix} Stage 3: Physics applied to environment meshes.`);

    //   console.log(`${logPrefix} Stage 4: Initializing Character Logic...`);
      try {
          characterComponents = CharacterLogic.initialize(scene, canvasRef);
          if (!characterComponents) throw new Error("CharacterLogic.initialize returned null/undefined.");
      } catch (charError) {
           console.error(`${logPrefix} Error during CharacterLogic.initialize:`, charError);
           throw new Error(`Stage 4 Failed - Character init: ${charError.message}`);
      }
    //   console.log(`${logPrefix} Stage 4: Character Logic initialized.`);

    //   console.log(`${logPrefix} Stage 5: Setting up input listeners and observers...`);
      const currentCanvas = canvasRef.current;
      if (!currentCanvas) { throw new Error("Stage 5 Failed - canvasRef is null."); }
      currentCanvas.tabIndex = 0; 
      
      currentCanvas._attachedWheelHandler = (e) => e.preventDefault(); 
      currentCanvas._attachedKeydownHandler = (e) => { 
          if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
            e.preventDefault();
          }
      };
      currentCanvas.addEventListener("wheel", currentCanvas._attachedWheelHandler, { passive: false });
      currentCanvas.addEventListener("keydown", currentCanvas._attachedKeydownHandler, { passive: false });
     
      keyboardObserver = scene.onKeyboardObservable.add((kbInfo) => {
           if (kbInfo.type === window.BABYLON.KeyboardEventTypes.KEYDOWN) {
                const key = kbInfo.event.key.toLowerCase();
                if (key === "e") { /* ... e key logic ... */ }
                else if (key === "i") { /* ... i key logic ... */ }
            }
      });
  
      sceneDisposeObserver = scene.onDisposeObservable.add(() => {
        const disposePrefix = `${logPrefix} SceneDispose:`;
        // console.log(`${disposePrefix} Cleaning up observers/components during scene dispose...`);
        try { scene?.onKeyboardObservable.remove(keyboardObserver); keyboardObserver = null;} catch(e) { console.warn(`${disposePrefix} Error removing keyboard observer:`, e); }
        try { characterComponents?.cleanup(); } catch(e) { console.warn(`${disposePrefix} Error during character cleanup:`, e); }
        // console.log(`${disposePrefix} Scene dispose cleanup finished.`);
      });
    //   console.log(`${logPrefix} Stage 5: Input listeners and observers set up.`);

    //   console.log(`${logPrefix} Stage 6: Initializing Multiplayer...`);
      try {
        multiplayerResources = await Multiplayer.initialize({ scene, canvasRef, characterComponents });
        // console.log(`${logPrefix} Stage 6: Multiplayer initialized successfully.`);

        engine.runRenderLoop(() => { if (scene?.isReady() && !engine?.isDisposed) scene.render(); });
        resizeHandler = () => { if (engine && !engine.isDisposed) engine.resize(); };
        window.addEventListener("resize", resizeHandler);
        // console.log(`${logPrefix} Stage 6: Render loop started.`);

        worldCleanup = () => {
             const finalCleanupPrefix = `${logPrefix} FinalCleanup [Multiplayer]:`;
            //  console.log(`${finalCleanupPrefix} Running...`);
             try { if (engine && typeof engine.stopRenderLoop === 'function') engine.stopRenderLoop(); } catch(e) { console.warn(`${finalCleanupPrefix} Error stopping render loop:`, e); }
             if(resizeHandler) { try { window.removeEventListener("resize", resizeHandler); } catch(e) { console.warn(`${finalCleanupPrefix} Error removing resize:`, e); } }
              try {
                  const currentCanvas = canvasRef?.current;
                  if (currentCanvas && currentCanvas._attachedWheelHandler) { currentCanvas.removeEventListener("wheel", currentCanvas._attachedWheelHandler); delete currentCanvas._attachedWheelHandler; }
                  if (currentCanvas && currentCanvas._attachedKeydownHandler) { currentCanvas.removeEventListener("keydown", currentCanvas._attachedKeydownHandler); delete currentCanvas._attachedKeydownHandler; }
              } catch (e) { console.warn(`${finalCleanupPrefix} Error removing canvas listeners:`, e); }
             if (sceneLoaderCleanupFn && typeof sceneLoaderCleanupFn === 'function') { try { sceneLoaderCleanupFn(); } catch(e) { console.warn(`${finalCleanupPrefix} Error in sceneLoader cleanup:`, e); } sceneLoaderCleanupFn = null; }
             try { if (scene && sceneDisposeObserver) scene.onDisposeObservable.remove(sceneDisposeObserver); } catch(e) { console.warn(`${finalCleanupPrefix} Error removing dispose observer:`, e); }
             try { if (scene && keyboardObserver) scene.onKeyboardObservable.remove(keyboardObserver); } catch(e) { console.warn(`${finalCleanupPrefix} Error removing keyboard observer:`, e); }
             if (characterComponents && typeof characterComponents.cleanup === 'function') { try { characterComponents.cleanup(); } catch(e) { console.warn(`${finalCleanupPrefix} Error in character cleanup:`, e); } }
             if (multiplayerResources && typeof multiplayerResources.cleanup === 'function') { try { multiplayerResources.cleanup(); } catch(e) { console.warn(`${finalCleanupPrefix} Error in multiplayer cleanup:`, e); } }
             if (engine && !engine.isDisposed) { try { engine.dispose(); } catch(e) { console.warn(`${finalCleanupPrefix} Error disposing engine:`, e); } }
             engine = null; scene = null; multiplayerResources = null; resizeHandler = null; characterComponents = null; keyboardObserver = null; sceneDisposeObserver = null;
            //  console.log(`${finalCleanupPrefix} Finished.`);
        };
      } catch (multiplayerErr) {
        console.warn(`${logPrefix} Failed to initialize multiplayer: ${multiplayerErr.message}. Proceeding without multiplayer functionality.`);
        multiplayerResources = null;

        engine.runRenderLoop(() => { if (scene?.isReady() && !engine?.isDisposed) scene.render(); });
        resizeHandler = () => { if (engine && !engine.isDisposed) engine.resize(); };
        window.addEventListener("resize", resizeHandler);
        // console.log(`${logPrefix} Stage 6: Render loop started (without multiplayer).`);

        worldCleanup = () => {
            const finalCleanupPrefix = `${logPrefix} FinalCleanup [No Multiplayer]:`;
            //  console.log(`${finalCleanupPrefix} Running...`);
             try { if (engine && typeof engine.stopRenderLoop === 'function') engine.stopRenderLoop(); } catch(e) { console.warn(`${finalCleanupPrefix} Error stopping render loop:`, e); }
             if(resizeHandler) { try { window.removeEventListener("resize", resizeHandler); } catch(e) { console.warn(`${finalCleanupPrefix} Error removing resize:`, e); } }
              try {
                  const currentCanvas = canvasRef?.current;
                  if (currentCanvas && currentCanvas._attachedWheelHandler) { currentCanvas.removeEventListener("wheel", currentCanvas._attachedWheelHandler); delete currentCanvas._attachedWheelHandler; }
                  if (currentCanvas && currentCanvas._attachedKeydownHandler) { currentCanvas.removeEventListener("keydown", currentCanvas._attachedKeydownHandler); delete currentCanvas._attachedKeydownHandler; }
              } catch (e) { console.warn(`${finalCleanupPrefix} Error removing canvas listeners:`, e); }
             if (sceneLoaderCleanupFn && typeof sceneLoaderCleanupFn === 'function') { try { sceneLoaderCleanupFn(); } catch(e) { console.warn(`${finalCleanupPrefix} Error in sceneLoader cleanup:`, e); } sceneLoaderCleanupFn = null; }
             try { if (scene && sceneDisposeObserver) scene.onDisposeObservable.remove(sceneDisposeObserver); } catch(e) { console.warn(`${finalCleanupPrefix} Error removing dispose observer:`, e); }
             try { if (scene && keyboardObserver) scene.onKeyboardObservable.remove(keyboardObserver); } catch(e) { console.warn(`${finalCleanupPrefix} Error removing keyboard observer:`, e); }
             if (characterComponents && typeof characterComponents.cleanup === 'function') { try { characterComponents.cleanup(); } catch(e) { console.warn(`${finalCleanupPrefix} Error in character cleanup:`, e); } }
             if (engine && !engine.isDisposed) { try { engine.dispose(); } catch(e) { console.warn(`${finalCleanupPrefix} Error disposing engine:`, e); } }
             engine = null; scene = null; resizeHandler = null; characterComponents = null; keyboardObserver = null; sceneDisposeObserver = null;
            //  console.log(`${finalCleanupPrefix} Finished.`);
        };
      }
      
    //   console.log(`${logPrefix} All stages completed. Resolving WorldLogic.`);
      resolveWorldLogic({
        engine: engine,
        scene: scene,
        characterComponents: characterComponents,
        SpherePipSpawner: SpherePipSpawner,
        multiplayerResources: multiplayerResources,
        cleanup: worldCleanup
      });

    } catch (error) {
      console.error(`${logPrefix} Catastrophic failure at [${error.message?.split(' - ')[0] || 'Unknown Stage'}]. Error:`, error);
      worldCleanup(); 
      rejectWorldLogic(error);
    }
  });
}

return { WorldLogic };