const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/World888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

async function initializeHavokPhysics(scene) {
   return new Promise((resolve, reject) => {
    if (!window.BABYLON) { return reject(new Error("HavokPhysics: Babylon.js not available.")); }
    if (!window.HK) { return reject(new Error("HavokPhysics: Havok module (window.HK) not initialized.")); }
    if (!scene || scene.isDisposed) { return reject(new Error("HavokPhysics: Scene is invalid or disposed.")); }
    try {
        // console.log("HavokPhysics: Enabling physics plugin for the scene...");
        if (scene.getPhysicsEngine() && !(scene.getPhysicsEngine().getPlugin() instanceof window.BABYLON.HavokPlugin)) {
            console.warn("HavokPhysics: Disabling existing physics engine before enabling Havok.");
            scene.disablePhysicsEngine();
        }
        if (!scene.isPhysicsEnabled() || !(scene.getPhysicsEngine()?.getPlugin() instanceof window.BABYLON.HavokPlugin)) {
            const gravity = new window.BABYLON.Vector3(0, -9.81, 0);
            const hkPlugin = new window.BABYLON.HavokPlugin(true, window.HK);
            scene.enablePhysics(gravity, hkPlugin);
            // console.log("HavokPhysics: Havok physics enabled successfully.");
        } else {
            // console.log("HavokPhysics: Havok physics already enabled on this scene.");
        }
        resolve();
    } catch (error) {
        console.error("HavokPhysics: Error enabling physics plugin:", error);
        reject(error);
    }
  });
}

function applyHavokPhysicsInternal(mesh, scene, shapeType = window.BABYLON.PhysicsShapeType.BOX, options = { mass: 0, restitution: 0.1, friction: 0.5 }) {
    // Pre-conditions checks
    if (!mesh || mesh.isDisposed()) { console.warn("ApplyPhysicsInternal: Null or disposed mesh."); return null; }
    if (!scene || scene.isDisposed || !scene.isPhysicsEnabled()) { console.warn(`ApplyPhysicsInternal: Scene invalid or physics not enabled for mesh ${mesh.name}.`); return null; }
    if (!window.BABYLON?.PhysicsAggregate) { console.error("ApplyPhysicsInternal: BABYLON.PhysicsAggregate not found."); return null; }

    // ENSURE MESH HAS GEOMETRY
    if (!(mesh instanceof window.BABYLON.Mesh) || mesh.getTotalVertices() === 0) {
        // console.log(`ApplyPhysicsInternal: Skipping mesh ${mesh.name} because it has no geometry (vertices: 0).`);
        return null;
    }

    if (mesh.physicsAggregate) { mesh.physicsAggregate.dispose(); }

    try {
        mesh.computeWorldMatrix(true);
        mesh.refreshBoundingInfo(true);

        // *** ADDED CLEAR LOGGING ON FAILURE ***
        // console.log(`ApplyPhysicsInternal: Creating Aggregate for ${mesh.name}, Shape: ${Object.keys(window.BABYLON.PhysicsShapeType).find(key => window.BABYLON.PhysicsShapeType[key] === shapeType) || 'Unknown'}, Options:`, JSON.stringify(options));
        const aggregate = new window.BABYLON.PhysicsAggregate(mesh, shapeType, options, scene);

        // *** Check if aggregate was actually created ***
        if (!aggregate || !aggregate.body) { // Checking aggregate.body might be more reliable
             console.error(`ApplyPhysicsInternal: FAILED to create valid PhysicsAggregate body for ${mesh.name}. Shape type or mesh geometry might be invalid for Havok.`);
             if(aggregate?.dispose) aggregate.dispose(); // Dispose partial aggregate if possible
             mesh.physicsAggregate = null; // Ensure it's null
             return null; // Explicitly return null on failure
        }

        mesh.physicsAggregate = aggregate;
        // console.log(`ApplyPhysicsInternal: PhysicsAggregate created successfully for ${mesh.name}.`);
        return aggregate; // Return the aggregate on success

    } catch (error) {
        console.error(`ApplyPhysicsInternal: EXCEPTION creating PhysicsAggregate for mesh ${mesh.name}:`, error);
        if (mesh.physicsAggregate) { mesh.physicsAggregate.dispose(); mesh.physicsAggregate = null; }
        return null; // Return null on exception
    }
}

function applyPhysicsToMesh({ mesh, scene, shapeType = "BOX", options = { mass: 0, restitution: 0.1, friction: 0.5 } }) {
    // ... (previous shapeTypeMap and checks) ...
    if (!window.BABYLON?.PhysicsShapeType) { console.error("ApplyPhysics: BABYLON.PhysicsShapeType not found."); return null; }
    const shapeTypeMap = { BOX: window.BABYLON.PhysicsShapeType.BOX, MESH: window.BABYLON.PhysicsShapeType.MESH, CAPSULE: window.BABYLON.PhysicsShapeType.CAPSULE, SPHERE: window.BABYLON.PhysicsShapeType.SPHERE, CYLINDER: window.BABYLON.PhysicsShapeType.CYLINDER, CONVEX_HULL: window.BABYLON.PhysicsShapeType.CONVEX_HULL };
    const selectedShapeType = shapeTypeMap[shapeType.toUpperCase()];
    if (selectedShapeType === undefined) { console.warn(`ApplyPhysics: Unknown shapeType "${shapeType}". Defaulting to BOX.`); return applyHavokPhysicsInternal(mesh, scene, window.BABYLON.PhysicsShapeType.BOX, options); }
    // Add specific checks for required options based on shapeType if needed

    return applyHavokPhysicsInternal(mesh, scene, selectedShapeType, options);
}

return { initializeHavokPhysics, applyPhysicsToMesh };