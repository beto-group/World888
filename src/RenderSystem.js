// ─── RenderSystem.js ─────────────────────────────────────────────────────────
// Syncs the visual display capsule to the physics character controller position.
// Replaces the renderUpdateCallback inside CharacterLogic.js.
//
// Listens to: player:position, player:velocity (for orientation)
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const { EventBus } = await dc.require(folderPath + "/src/EventBus.js");

const RenderSystem = (() => {
  let _scene           = null;
  let _cc              = null;   // PhysicsCharacterController
  let _capsule         = null;   // display mesh
  let _movementSystem  = null;   // to read config + state
  let _renderObserver  = null;
  let _animations      = {};
  let _currentAnim     = null;

  function _onBeforeRender() {
    if (!_cc || !_capsule) return;

    const cfg = _movementSystem?.getConfig();
    const ps  = _movementSystem?.getPlayerState();
    if (!cfg || !ps) return;

    const ctrlPos          = _cc.getPosition();
    const normalHeight     = cfg.normalCharacterHeight;
    const visualBaseHeight = _capsule.metadata?.baseHeight || normalHeight;
    const visualHeight     = visualBaseHeight * _capsule.scaling.y;
    const ctrlBottomY      = ctrlPos.y - (normalHeight / 2);
    const targetCenterY    = ctrlBottomY + (visualHeight / 2);

    _capsule.position.set(ctrlPos.x, targetCenterY, ctrlPos.z);

    // Smooth rotation toward character orientation
    if (!_capsule.rotationQuaternion) {
      _capsule.rotationQuaternion = window.BABYLON.Quaternion.Identity();
    }
    window.BABYLON.Quaternion.SlerpToRef(
      _capsule.rotationQuaternion,
      ps.characterTargetOrientation,
      cfg.turnSpeed,
      _capsule.rotationQuaternion
    );

    // Update Animations
    const vel = _cc.getVelocity();
    const speed2D = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
    const state = _movementSystem.controlState.getState();
    const isSprinting = _movementSystem.controlState.isSprinting();

    let targetAnimName = null;
    let animSpeedRatio = 1.0;

    if (state === 'ON_GROUND' && speed2D > 0.1) {
      if (isSprinting) {
        targetAnimName = 'Running';
        animSpeedRatio = Math.min(speed2D / cfg.runSpeed, 1.5);
      } else {
        targetAnimName = 'Walking';
        animSpeedRatio = Math.max(0.5, speed2D / cfg.walkSpeed);
      }
    }

    if (targetAnimName && _animations[targetAnimName]) {
      const nextAnim = _animations[targetAnimName];
      if (_currentAnim !== nextAnim) {
        if (_currentAnim) _currentAnim.stop();
        _currentAnim = nextAnim;
        _currentAnim.play(true);
      }
      _currentAnim.speedRatio = animSpeedRatio;
    } else {
      if (_currentAnim && _currentAnim.isPlaying) {
        // Since there is no idle animation, just stop or pause it.
        // Pausing and resetting to frame 0 makes it look like a default pose.
        _currentAnim.pause();
        _currentAnim.goToFrame(0);
        _currentAnim = null; // Clear so we restart next time
      }
    }
  }

  function initialize(scene, characterController, displayCapsule, movementSystem, animations) {
    _scene          = scene;
    _cc             = characterController;
    _capsule        = displayCapsule;
    _movementSystem = movementSystem;
    _animations     = animations || {};

    // Run AFTER MovementSystem's insertFirst observer
    _renderObserver = scene.onBeforeRenderObservable.add(_onBeforeRender);
    return api;
  }

  function dispose() {
    if (_scene && _renderObserver) _scene.onBeforeRenderObservable.remove(_renderObserver);
    _renderObserver = null;
    _scene = null; _cc = null; _capsule = null; _movementSystem = null; _animations = {}; _currentAnim = null;
  }

  const api = { initialize, dispose };
  return api;
})();

return { RenderSystem };
