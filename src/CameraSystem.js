// ─── CameraSystem.js ─────────────────────────────────────────────────────────
// Camera setup, pointer lock management, first/third person modes.
// Replaces CameraLogic.js.
//
// Listens to:  camera:offsetY, camera:modeChange, input:tab, input:pointerlock
// Emits:       camera:modeChange
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/World888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const { EventBus } = await dc.require(folderPath + "/src/EventBus.js");

const CameraSystem = (() => {
  let _camera          = null;
  let _scene           = null;
  let _canvasRef       = null;
  let _displayCapsule  = null;
  let _renderObserver  = null;
  let _targetOffsetY   = 0;
  let _currentMode     = 'third';  // 'first' | 'third'
  let _unsubs          = [];

  // Camera geometry constants (declared here but initialized inside initialize() to avoid
  // referencing window.BABYLON before Babylon.js has loaded)
  const THIRD_DIST           = 8;
  const THIRD_HEIGHT_OFFSET  = 2.5;
  const THIRD_TARGET_OFFSET  = 1.0;
  let FIRST_HEAD_OFFSET    = null; // initialized lazily in initialize()
  const MIN_RAYCAST_DIST     = 1.0;

  // ── Render loop ──────────────────────────────────────────────────────────

  function _onBeforeRender() {
    if (!_camera || !_displayCapsule) return;

    const capsulePos = _displayCapsule.position;

    if (_currentMode === 'first') {
      const headWorld = capsulePos.add(
        window.BABYLON.Vector3.TransformNormal(FIRST_HEAD_OFFSET, _displayCapsule.getWorldMatrix())
      );
      _camera.position.copyFrom(headWorld);
    } else {
      const lookAt      = capsulePos.add(new window.BABYLON.Vector3(0, THIRD_TARGET_OFFSET, 0));
      const camBackward = _camera.getDirection(window.BABYLON.Vector3.Backward());
      let   desired     = lookAt.add(camBackward.scale(THIRD_DIST));

      // Wall-clip correction via raycast
      const ray = new window.BABYLON.Ray(
        lookAt,
        desired.subtract(lookAt).normalize(),
        THIRD_DIST
      );
      const hit = _scene.pickWithRay(ray, mesh => mesh !== _displayCapsule);
      let target;
      if (hit?.hit && hit.pickedPoint && hit.pickedMesh) {
        target = hit.pickedPoint.add(ray.direction.scale(-0.1));
      } else {
        target = desired;
      }
      // Clamp minimum distance
      if (window.BABYLON.Vector3.Distance(target, lookAt) < MIN_RAYCAST_DIST) {
        target = lookAt.add(ray.direction.scale(MIN_RAYCAST_DIST));
      }
      _camera.position.copyFrom(target);
    }
  }

  // ── EventBus handlers ────────────────────────────────────────────────────

  function _onCameraOffsetY({ y }) {
    _targetOffsetY = y;
    // offsetY adjusts where the camera tracks the character center
    // Currently handled by moving capsulePos in RenderSystem — camera just follows
  }

  function _onTabPress() {
    const prev = _currentMode;
    _currentMode = prev === 'third' ? 'first' : 'third';
    EventBus.emit('camera:modeChange', { mode: _currentMode });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function initialize(scene, canvasRef, displayCapsule, startPos) {
    _scene          = scene;
    _canvasRef      = canvasRef;
    _displayCapsule = displayCapsule;

    // Initialize BABYLON-dependent constants now that Babylon.js is loaded
    FIRST_HEAD_OFFSET = new window.BABYLON.Vector3(0, (1.8 / 2) - 0.2, 0.1);

    // Create FreeCamera
    _camera = new window.BABYLON.FreeCamera('world888_camera', startPos, scene);
    _camera.minZ              = 0.2;
    _camera.maxZ              = 500;
    _camera.angularSensibility = 4000;
    _camera.keysUp             = [];
    _camera.keysDown           = [];
    _camera.keysLeft           = [];
    _camera.keysRight          = [];
    _camera.checkCollisions    = true;
    _camera.ellipsoid          = new window.BABYLON.Vector3(0.3, 0.3, 0.3);

    // Attach controls (mouse look)
    _camera.attachControl(canvasRef.current, false);

    if (canvasRef.current) canvasRef.current.focus();

    // Render observer — runs AFTER MovementSystem (which uses insertFirst)
    _renderObserver = scene.onBeforeRenderObservable.add(_onBeforeRender);

    // EventBus
    _unsubs.push(EventBus.on('camera:offsetY', _onCameraOffsetY));
    _unsubs.push(EventBus.on('input:tab',      _onTabPress));

    if (scene.activeCamera !== _camera) scene.activeCamera = _camera;

    return api;
  }

  function getCamera()   { return _camera; }
  function getMode()     { return _currentMode; }
  function setMode(m)    { _currentMode = m; EventBus.emit('camera:modeChange', { mode: m }); }

  function dispose() {
    if (_scene && _renderObserver) _scene.onBeforeRenderObservable.remove(_renderObserver);
    for (const u of _unsubs) u();
    _unsubs = [];
    if (_camera) {
      _camera.detachControl(_canvasRef?.current);
      _camera.dispose();
    }
    _camera = null; _scene = null; _canvasRef = null; _displayCapsule = null;
    _renderObserver = null;
  }

  const api = { initialize, getCamera, getMode, setMode, dispose };
  return api;
})();

return { CameraSystem };
