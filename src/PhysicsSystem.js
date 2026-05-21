// ─── PhysicsSystem.js ────────────────────────────────────────────────────────
// Owns Havok plugin init + PhysicsCharacterController lifecycle.
// Replaces the Havok setup spread across HavokPhysics.js and CharacterLogic.js.
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const PhysicsSystem = (() => {
  let _characterController = null;
  let _scene = null;

  // ── Havok Plugin Initialisation ─────────────────────────────────────────

  async function initHavok(scene) {
    _scene = scene;
    if (!window.BABYLON) throw new Error('PhysicsSystem: Babylon.js not loaded.');
    if (!window.HK)      throw new Error('PhysicsSystem: window.HK (Havok WASM) not ready.');
    if (!scene || scene.isDisposed) throw new Error('PhysicsSystem: Scene invalid.');

    // If a non-Havok engine is active, disable it first
    const existing = scene.getPhysicsEngine();
    if (existing && !(existing.getPlugin() instanceof window.BABYLON.HavokPlugin)) {
      console.warn('[PhysicsSystem] Replacing existing physics engine with Havok.');
      scene.disablePhysicsEngine();
    }

    if (!scene.isPhysicsEnabled() || !(scene.getPhysicsEngine()?.getPlugin() instanceof window.BABYLON.HavokPlugin)) {
      const gravity  = new window.BABYLON.Vector3(0, -9.81, 0);
      const hkPlugin = new window.BABYLON.HavokPlugin(true, window.HK);
      scene.enablePhysics(gravity, hkPlugin);
    }
  }

  // ── PhysicsAggregate Helper ────────────────────────────────────────────

  function applyPhysicsToMesh({ mesh, scene, shapeType = 'BOX', options = { mass: 0, restitution: 0.1, friction: 0.5 } }) {
    if (!window.BABYLON?.PhysicsShapeType) {
      console.error('[PhysicsSystem] BABYLON.PhysicsShapeType not found.');
      return null;
    }

    const shapeMap = {
      BOX:          window.BABYLON.PhysicsShapeType.BOX,
      MESH:         window.BABYLON.PhysicsShapeType.MESH,
      CAPSULE:      window.BABYLON.PhysicsShapeType.CAPSULE,
      SPHERE:       window.BABYLON.PhysicsShapeType.SPHERE,
      CYLINDER:     window.BABYLON.PhysicsShapeType.CYLINDER,
      CONVEX_HULL:  window.BABYLON.PhysicsShapeType.CONVEX_HULL,
    };

    const bShape = shapeMap[shapeType.toUpperCase()];
    if (bShape === undefined) {
      console.warn(`[PhysicsSystem] Unknown shapeType "${shapeType}" — defaulting to BOX.`);
      return _createAggregate(mesh, scene, window.BABYLON.PhysicsShapeType.BOX, options);
    }
    return _createAggregate(mesh, scene, bShape, options);
  }

  function _createAggregate(mesh, scene, bShape, options) {
    if (!mesh || mesh.isDisposed()) return null;
    if (!scene || scene.isDisposed || !scene.isPhysicsEnabled()) return null;
    if (!(mesh instanceof window.BABYLON.Mesh) || mesh.getTotalVertices() === 0) return null;

    if (mesh.physicsAggregate) mesh.physicsAggregate.dispose();

    try {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo(true);
      const agg = new window.BABYLON.PhysicsAggregate(mesh, bShape, options, scene);
      if (!agg || !agg.body) {
        if (agg?.dispose) agg.dispose();
        mesh.physicsAggregate = null;
        return null;
      }
      mesh.physicsAggregate = agg;
      return agg;
    } catch (err) {
      console.error(`[PhysicsSystem] Error creating aggregate for "${mesh.name}":`, err);
      if (mesh.physicsAggregate) { mesh.physicsAggregate.dispose(); mesh.physicsAggregate = null; }
      return null;
    }
  }

  // ── Character Controller ────────────────────────────────────────────────

  function createCharacterController(startPos, capsuleHeight, capsuleRadius, scene) {
    _characterController = new window.BABYLON.PhysicsCharacterController(
      startPos,
      { capsuleHeight, capsuleRadius },
      scene
    );
    return _characterController;
  }

  function getCharacterController() { return _characterController; }

  function disposeCharacterController() {
    if (!_characterController) return;
    try {
      const ccScene = (typeof _characterController.getScene === 'function')
        ? _characterController.getScene() : null;
      if (!ccScene || (typeof ccScene.getPhysicsEngine === 'function' && ccScene.getPhysicsEngine())) {
        _characterController.dispose();
      }
    } catch (e) {
      console.warn('[PhysicsSystem] Error disposing character controller:', e);
    }
    _characterController = null;
  }

  function dispose() {
    disposeCharacterController();
    _scene = null;
  }

  return {
    initHavok,
    applyPhysicsToMesh,
    createCharacterController,
    getCharacterController,
    disposeCharacterController,
    dispose,
  };
})();

return { PhysicsSystem };
