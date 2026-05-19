const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

// --- Babylon Engine & Scene Initialization ---
function initBabylonEngineAndScene(canvasRef) {
    // Pre-conditions
    if (!window.BABYLON) { console.error("SceneLoader.init: FATAL - Babylon.js not loaded."); return null; }
    const canvas = canvasRef?.current; // Get canvas element early
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

    // Remove any previous event listeners to prevent duplicates
    canvas.removeEventListener("webglcontextlost", canvas._previousContextLostHandler || (() => {}));
    canvas.removeEventListener("webglcontextrestored", canvas._previousContextRestoredHandler || (() => {}));

    // Add the new listeners and store references for proper removal
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

/**
 * Loads GLB objects into the scene, returning both the root node and a list of valid meshes.
 * @param {BABYLON.Scene} scene The Babylon.js scene to load into.
 * @param {object} glbConfig Configuration for the GLB file.
 * @returns {Promise<{glbRootNode: BABYLON.Mesh | null, allImportedMeshes: BABYLON.Mesh[]}>}
 */
async function loadSceneObjects(scene, glbConfig) {
    // Pre-condition
    if (!window.BABYLON?.SceneLoader) { throw new Error("loadSceneObjects: Babylon.js SceneLoader not available."); }
    if (!scene || scene.isDisposed) { throw new Error(`loadSceneObjects: Scene is invalid or disposed.`); }

    const { url, path, file } = glbConfig;
    const allImportedMeshes = [];
    let glbRootNode = null;

    try {
        const cleanUrl = url.split('?')[0];
        const result = await window.BABYLON.SceneLoader.ImportMeshAsync("", cleanUrl, file, scene, null, ".glb");
        // console.log(`SceneLoader.loadObjects: GLB loaded. Processing ${result.meshes.length} meshes/nodes...`);

        for (const mesh of result.meshes) {
            if (!mesh || mesh.isDisposed()) {
                // console.log(`SceneLoader.loadObjects: Skipping null/disposed mesh.`);
                continue;
            };
            if (mesh.name === "__root__") {
                glbRootNode = mesh;
                // console.log(`SceneLoader.loadObjects: Identified root mesh: ${mesh.name}`);
                if (mesh instanceof window.BABYLON.Mesh || mesh instanceof window.BABYLON.TransformNode) {
                    allImportedMeshes.push(mesh);
                }
                continue;
            }

            if (!(mesh instanceof window.BABYLON.Mesh)) {
                // console.log(`SceneLoader.loadObjects: Skipping non-mesh node "${mesh.name}" for position/index validation (likely a TransformNode).`);
                allImportedMeshes.push(mesh);
                continue;
            }

            // --- Mesh Validation (only for actual BABYLON.Mesh instances) ---
            const hasPositions = mesh.getVerticesData(window.BABYLON.VertexBuffer.PositionKind);
            const hasIndices = mesh.getIndices();
            let isValid = true;
            if (!hasPositions || hasPositions.length === 0) {
                console.warn(`SceneLoader.loadObjects: Mesh ${mesh.name} has NO POSITION data. Disposing.`);
                mesh.dispose();
                isValid = false;
            }
            if (!hasIndices || hasIndices.length === 0) {
                console.warn(`SceneLoader.loadObjects: Mesh ${mesh.name} has NO INDEX data. This might be unexpected, but not necessarily invalid.`);
            }

            if (isValid) {
                mesh.isPickable = false;
                allImportedMeshes.push(mesh);
            }
        } // End for loop

    } catch (err) {
        console.error(`SceneLoader.loadObjects: Failed during GLB loading or mesh processing for scene (Engine ID: ${scene?.getEngine()?.uniqueId}):`, err);
        throw err;
    }

    return { glbRootNode, allImportedMeshes };
}

// --- Main sceneLoader Export ---
async function sceneLoader({ canvasRef, glbConfig = {
  url: "https://raw.githubusercontent.com/beto-group/beto.assets/main/",
  path: "",
  file: "scene888.glb"
} }) {
    let engine = null;
    let scene = null;
    let canvas = null;

    // Keep track of the observable to remove it on cleanup
    let onBeforeRenderObserver = null;

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
        if (canvas) {
            camera.attachControl(canvas, true);
        } else {
            console.warn("Canvas not available, camera control not attached.");
        }
        camera.wheelPrecision = 50;
        // console.log("Camera setup complete.");

        const light = new window.BABYLON.HemisphericLight("light", new window.BABYLON.Vector3(0, 1, 0), scene);
        light.intensity = 0.7;
        // console.log("Light setup complete.");

        const { glbRootNode, allImportedMeshes } = await loadSceneObjects(scene, glbConfig);
        // console.log(`After loadSceneObjects: glbRootNode found: ${!!glbRootNode}, total imported meshes/nodes: ${allImportedMeshes.length}`);

        if (glbRootNode) {
            glbRootNode.rotation = window.BABYLON.Vector3.Zero();
            glbRootNode.position = window.BABYLON.Vector3.Zero();
            glbRootNode.scaling = new window.BABYLON.Vector3(44, 44, 44);
            camera.target = glbRootNode.absolutePosition;
            // console.log(`GLB Root Node ("${glbRootNode.name}") set to be static at origin and scaled by 44x. Camera target set.`);
        } else {
            console.warn("No __root__ node found in GLB. Camera target defaulted to Zero.");
            camera.target = window.BABYLON.Vector3.Zero();
        }

        const rotatingNodesWithSpeeds = [];

        let obeliskMesh = null;
        let obeliskOriginalY = 0;
        let hoverTime = 0;
        const hoverAmplitude = 5;
        const hoverFrequency = 1.5;

        const minSpeed = 0.001;
        const maxSpeed = 0.01;

        // console.log(`--- Starting mesh selection for rotation and TransformNode creation ---`);
        let meshesFoundForRotation = 0;

        allImportedMeshes.forEach((mesh) => {
            if (mesh instanceof window.BABYLON.Mesh && mesh.name !== "__root__" && glbRootNode) {
                // console.log(`    -> Processing mesh "${mesh.name}" for orbital rotation.`);

                const rotator = new window.BABYLON.TransformNode(`rotator_${mesh.name}`, scene);
                rotator.position = window.BABYLON.Vector3.Zero();
                rotator.rotation = window.BABYLON.Vector3.Zero();
                rotator.parent = glbRootNode; // Parent to the main scaled root node

                // Reparent the actual mesh to this new rotator node.
                // setParent will attempt to maintain the mesh's world position.
                mesh.setParent(rotator);
                // console.log(`    -> Reparented mesh "${mesh.name}" to new rotator "${rotator.name}".`);

                const randomSpeed = minSpeed + (Math.random() * (maxSpeed - minSpeed));
                rotatingNodesWithSpeeds.push({ node: rotator, speed: randomSpeed });
                // console.log(`    -> Added "${rotator.name}" to rotation list with speed: ${randomSpeed.toFixed(4)}`);
                meshesFoundForRotation++;

                if (mesh.name === "obelisk") {
                    obeliskMesh = mesh;
                    obeliskOriginalY = mesh.position.y;
                    // console.log(`    -> Identified "obelisk" mesh for hovering. Original LOCAL Y (relative to rotator): ${obeliskOriginalY.toFixed(4)}`);
                }
            } else {
                const parentName = mesh.parent ? mesh.parent.name : "none";
                // console.log(`    -> SKIPPING "${mesh.name}" for rotation. (Is BABYLON.Mesh: ${mesh instanceof window.BABYLON.Mesh}. Is Root Node: ${mesh.name === "__root__"}. Parent: ${parentName}).`);
            }
        });

        // console.log(`--- Finished mesh selection. Found ${meshesFoundForRotation} meshes and created ${rotatingNodesWithSpeeds.length} dedicated rotators. ---`);
        if (meshesFoundForRotation === 0) {
            console.warn("No meshes found for rotation! The GLB structure might be different than expected, or meshes are not actual BABYLON.Mesh instances or not properly linked.");
            console.warn("Consider inspecting your GLB file's hierarchy using a tool like https://gltf.report/ or https://sandbox.babylonjs.com/ to understand its structure.");
        }

        // Attach the animation logic to the scene's onBeforeRenderObservable.
        // This observable will fire as long as the engine's render loop (managed by WorldLogic) is running.
        onBeforeRenderObserver = scene.onBeforeRenderObservable.add(() => {
            // Optional: Log every 60 frames to confirm render loop is active
            // if (frameCounter % 60 === 0) {
            //     console.log(`Scene.onBeforeRenderObservable active. Rotating ${rotatingNodesWithSpeeds.length} nodes.`);
            // }
            // frameCounter++; // Uncomment if you uncomment the above debug log

            // --- Orbital Rotation Effect ---
            if (rotatingNodesWithSpeeds.length > 0) {
                rotatingNodesWithSpeeds.forEach((item) => {
                    item.node.rotate(window.BABYLON.Axis.Y, item.speed, window.BABYLON.Space.LOCAL);
                });
            }

            // --- Hovering effect for the 'obelisk' mesh ---
            if (obeliskMesh) {
                const deltaTime = engine.getDeltaTime() / 1000;
                hoverTime += deltaTime * hoverFrequency;
                const yOffset = hoverAmplitude * Math.sin(hoverTime);
                obeliskMesh.position.y = obeliskOriginalY + yOffset;
            }
        });

        // console.log("--- sceneLoader function completed. Animation logic set up. ---");

        return {
            engine: engine,
            scene: scene,
            environmentMeshes: allImportedMeshes,
            glbRootNode: glbRootNode,
            cleanup: () => {
                // console.log("--- Initiating SceneLoader cleanup ---");
                // Remove the onBeforeRenderObservable observer
                if (onBeforeRenderObserver) {
                    scene?.onBeforeRenderObservable.remove(onBeforeRenderObserver);
                    onBeforeRenderObserver = null;
                    // console.log("Removed onBeforeRenderObservable observer.");
                }

                // Dispose the scene and engine if they exist and are not already disposed.
                // WorldLogic's cleanup function will also attempt this, but it's good to be safe.
                if (scene && !scene.isDisposed) {
                    scene.dispose();
                    // console.log("Scene disposed by SceneLoader cleanup.");
                }
                if (engine && !engine.isDisposed) {
                    // Important: Do NOT stop render loop or remove resize listener here,
                    // as WorldLogic manages that. Just dispose the engine.
                    engine.dispose();
                    // console.log(`Engine (ID: ${engine.uniqueId}) disposed by SceneLoader cleanup.`);
                } else {
                    // console.log("Engine already disposed or not initialized during SceneLoader cleanup.");
                }
                // Nullify references that are local to sceneLoader
                engine = null;
                scene = null;
                // console.log("--- SceneLoader cleanup complete ---");
            }
        };
    } catch (err) {
        console.error("--- sceneLoader encountered a fatal error ---", err);
        // Ensure observers are cleaned up even on error
        if (onBeforeRenderObserver) {
            scene?.onBeforeRenderObservable.remove(onBeforeRenderObserver);
            onBeforeRenderObserver = null;
        }

        // Dispose scene and engine on error
        if (scene && !scene.isDisposed) {
            scene.dispose();
        }
        if (engine && !engine.isDisposed) {
            engine.dispose();
        }
        engine = null;
        scene = null;
        throw err; // Re-throw the error to indicate failure
    }
}

// Export the sceneLoader function
return { sceneLoader };