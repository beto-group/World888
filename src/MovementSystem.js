// ─── MovementSystem.js ───────────────────────────────────────────────────────
// Complete Apex Legends movement state machine + velocity calculator.
// Replaces CharacterLogic.js + CharacterVelocity.js.
//
// Listens to:  input:keydown, input:keyup, input:scroll, input:tab, input:pointerlock
// Emits:       player:stateChange, player:velocity, player:position, player:crouch,
//              camera:offsetY
//
// DESIGN:
//   - _ps (PlayerState)  is the single mutable state object
//   - _cfg (MovementConfig) is read-only
//   - All velocity computations are pure functions (receive state, return Vector3)
//   - Input handlers only set intent flags on _ps — physics tick reads them
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const { EventBus }               = await dc.require(folderPath + "/src/EventBus.js");
const { createPlayerState,
        initPlayerStateVectors } = await dc.require(folderPath + "/src/PlayerState.js");
const { createMovementConfig }   = await dc.require(folderPath + "/src/MovementConfig.js");

const MovementSystem = (() => {
  // ── Private state ────────────────────────────────────────────────────────
  let _ps  = null;   // PlayerState
  let _cfg = null;   // MovementConfig
  let _cc  = null;   // PhysicsCharacterController
  let _cam = null;   // BABYLON.FreeCamera (for reading rotation.y)
  let _capsule = null;  // display mesh
  let _scene   = null;
  let _renderObserver = null;
  let _unsubs = [];  // EventBus unsubscribe functions

  // ── Helpers ───────────────────────────────────────────────────────────────

  const V3  = () => window.BABYLON.Vector3;
  const DOT = (a, b) => window.BABYLON.Vector3.Dot(a, b);

  function _log(msg) {
    // Flip to true to enable verbose debug logging
    if (false) console.log('[MovementSystem]', msg);
  }

  function _orientMatrix() {
    const m = new window.BABYLON.Matrix();
    _ps.characterTargetOrientation.toRotationMatrix(m);
    return m;
  }

  function _forwardWorld() {
    return window.BABYLON.Vector3.TransformCoordinates(_cfg.forwardLocalSpace, _orientMatrix());
  }

  function _upWorld() {
    const g = _cfg.characterGravity.normalizeToNew().scale(-1);
    return g;
  }

  // ── Visual / camera state update ─────────────────────────────────────────

  function _updateVisuals() {
    if (!_capsule) return;
    const targetH = _ps.isCrouching ? _cfg.crouchCharacterHeight : _cfg.normalCharacterHeight;
    const baseH   = _capsule.metadata?.baseHeight || _cfg.normalCharacterHeight;
    const scaleY  = baseH > 0.01 ? targetH / baseH : 1.0;
    if (Math.abs(_capsule.scaling.y - scaleY) > 0.01) {
      _capsule.scaling.y = scaleY;
    }
    const offsetY = _ps.isCrouching ? _cfg.crouchCameraOffsetY : _cfg.normalCameraOffsetY;
    EventBus.emit('camera:offsetY', { y: offsetY });
  }

  // ── Input handlers (called from EventBus listeners) ──────────────────────

  function _handleKeyDown({ key }) {
    const ps  = _ps;
    const cfg = _cfg;

    switch (key) {
      // ── WASD / Arrow movement ──────────────────────────────────────────
      case 'w': case 'arrowup':    ps.inputDirection.z =  1; break;
      case 's': case 'arrowdown':  ps.inputDirection.z = -1; break;
      case 'a': case 'arrowleft':  ps.inputDirection.x = -1; break;
      case 'd': case 'arrowright': ps.inputDirection.x =  1; break;

      // ── Sprint ────────────────────────────────────────────────────────
      case 'shift':
        ps.isShiftPressed = true;
        break;

      // ── Jump / B-Hop / Wall Bounce / Super Glide ──────────────────────
      case ' ':
      case 'j':
        _triggerJump(key === ' ' ? 'SpaceKey' : 'JKey');
        ps.isJumpKeyHeld = true;
        break;

      // ── Crouch / Slide ────────────────────────────────────────────────
      case 'c':
        _handleCrouchKeyDown('c');
        break;
      case 'control':
        ps.isSlidingKeyDown = true;
        _handleCrouchKeyDown('control');
        break;
    }

    // Track held keys
    if (!ps.pressedKeys.has(key)) ps.pressedKeys.add(key);

    // Update slide intent if airborne
    _updateAirSlideIntent('KeyDown:' + key);
  }

  function _handleKeyUp({ key }) {
    const ps = _ps;

    switch (key) {
      case 'w': case 'arrowup':    if (ps.inputDirection.z ===  1) ps.inputDirection.z = 0; break;
      case 's': case 'arrowdown':  if (ps.inputDirection.z === -1) ps.inputDirection.z = 0; break;
      case 'a': case 'arrowleft':  if (ps.inputDirection.x === -1) ps.inputDirection.x = 0; break;
      case 'd': case 'arrowright': if (ps.inputDirection.x ===  1) ps.inputDirection.x = 0; break;
      case 'shift':    ps.isShiftPressed = false; break;
      case ' ': case 'j': ps.isJumpKeyHeld = false; break;
      case 'c':        _handleCrouchKeyUp('c');       break;
      case 'control':  _handleCrouchKeyUp('control'); break;
    }

    ps.pressedKeys.delete(key);
    _updateAirSlideIntent('KeyUp:' + key);
  }

  function _handleScrollDown() {
    // Scroll-down = jump (same as old system)
    const ps = _ps;
    const canJump = ps.state === 'ON_GROUND' || ps.state === 'SLIDING' || ps.justLanded;
    if (canJump && !ps.wantJump) _triggerJump('MouseScrollDown');
  }

  function _handleTab() {
    // Tab clears all held keys and resets input — camera mode toggle is handled by CameraSystem
    const ps = _ps;
    const keysHeld = Array.from(ps.pressedKeys);
    ps.pressedKeys.clear();
    ps.inputDirection.set(0, 0, 0);
    ps.isShiftPressed = false;
    ps.isJumpKeyHeld  = false;
    ps.isSlidingKeyDown = false;
    ps.wantJump = false;
    // Keep crouch state — 'c' is a toggle and tab shouldn't force stand
    if (ps.state === 'SLIDING') {
      ps.state = 'ON_GROUND';
      ps.slideVelocity.set(0, 0, 0);
      _updateVisuals();
    }
    ps.slideDirectionIntentLocal.set(0, 0, 0);
    ps.wantSlideOnLand = false;
    _log('Tab: input reset');
  }

  function _handlePointerLock({ locked }) {
    if (!locked) {
      // Release pointer lock → clear all input to prevent stuck keys
      _handleTab();
    }
  }

  // ── Crouch / Slide helpers ────────────────────────────────────────────────

  function _handleCrouchKeyDown(key) {
    const ps  = _ps;
    const cfg = _cfg;
    const isToggle = (key === 'c');
    const airborne = ps.state === 'IN_AIR' || ps.state === 'START_JUMP';

    // Check sprint-slide: on ground, sprinting forward, crouch pressed
    const canSprintSlide = (
      ps.state === 'ON_GROUND' &&
      (ps.isSprinting || (ps.isShiftPressed && ps.inputDirection.z > 0)) &&
      ps.inputDirection.lengthSquared() > 0.1
    );

    if (canSprintSlide) {
      ps.state = 'SLIDING';
      ps.isCrouching = true;
      ps.isSprinting = false;
      // Seed slide velocity from current + forward boost
      ps.slideVelocity.copyFrom(_cc.getVelocity());
      const fwd = _forwardWorld();
      ps.slideVelocity.addInPlace(fwd.scale(cfg.runSpeed * (cfg.slideInitialBoost - 1.0)));
      EventBus.emit('player:stateChange', { prev: 'ON_GROUND', next: 'SLIDING' });
      _updateVisuals();
      return;
    }

    if (airborne) {
      // Mid-air crouch → flag slide-on-land
      ps.wantSlideOnLand = true;
      if (ps.inputDirection.lengthSquared() > 0.01) {
        ps.slideDirectionIntentLocal.copyFrom(ps.inputDirection).normalize();
      }
      if (!ps.isCrouching) {
        ps.isCrouching = true;
        _updateVisuals();
      }
      return;
    }

    if (ps.state === 'ON_GROUND') {
      if (isToggle) {
        // 'c' toggles
        if (!ps.isCrouching) {
          ps.isCrouching = true;
        } else if (!ps.pressedKeys.has('control')) {
          // Only uncrouch if ctrl isn't also held
          ps.isCrouching = false;
        }
      } else {
        // 'control' = hold crouch
        if (!ps.isCrouching) ps.isCrouching = true;
      }
      _updateVisuals();
    }
  }

  function _handleCrouchKeyUp(key) {
    const ps = _ps;
    const isToggle = (key === 'c');
    const airborne = ps.state === 'IN_AIR' || ps.state === 'START_JUMP';

    if (isToggle) {
      // 'c' released — toggle doesn't un-crouch on release
      return;
    }

    // 'control' released — stand up if 'c' isn't also held
    ps.isSlidingKeyDown = false;
    const shouldStand = ps.isCrouching && !ps.pressedKeys.has('c');
    if (shouldStand && (ps.state === 'ON_GROUND' || airborne || ps.state === 'SLIDING')) {
      ps.isCrouching = false;
      if (airborne) {
        ps.wantSlideOnLand = false;
        ps.slideDirectionIntentLocal.set(0, 0, 0);
      }
      if (ps.state === 'SLIDING') {
        ps.state = 'ON_GROUND';
        ps.slideVelocity.set(0, 0, 0);
        EventBus.emit('player:stateChange', { prev: 'SLIDING', next: 'ON_GROUND' });
      }
      _updateVisuals();
    }
  }

  function _updateAirSlideIntent(source) {
    const ps = _ps;
    const airborne = ps.state === 'IN_AIR' || ps.state === 'START_JUMP';
    const mightSlide = ps.wantSlideOnLand || (airborne && ps.isCrouching);
    if (!airborne || !mightSlide) return;

    if (ps.inputDirection.lengthSquared() > 0.01) {
      ps.slideDirectionIntentLocal.copyFrom(ps.inputDirection).normalize();
    } else if (ps.slideDirectionIntentLocal.lengthSquared() > 0) {
      ps.slideDirectionIntentLocal.set(0, 0, 0);
    }
  }

  // ── Jump ─────────────────────────────────────────────────────────────────

  function _triggerJump(source) {
    const ps  = _ps;
    const cfg = _cfg;
    _log(`Jump attempt: ${source} state=${ps.state}`);

    if (ps.state === 'ON_GROUND' || ps.state === 'SLIDING' || ps.justLanded) {
      ps.wantJump = true;
      const canSprintJump = ps.isShiftPressed && ps.inputDirection.z > 0 && !ps.isCrouching && ps.state !== 'SLIDING';
      ps.isSprinting = canSprintJump;
      EventBus.emit('player:jump', { source });
    } else if (ps.state === 'IN_AIR') {
      if (ps.bHopTimer > 0) {
        ps.wantBHop = true;
        _log('B-Hop armed');
      }
      if (ps.wallBounceTimer > 0) {
        ps.wantJump = true;
        _log('Wall Bounce jump!');
      }
      if (ps.superGlideTimer > 0) {
        ps.wantJump = true;
        _log('Super Glide triggered!');
      }
    }
  }

  // ── State Machine ─────────────────────────────────────────────────────────

  function _getNextState(supportInfo) {
    const ps  = _ps;
    const cfg = _cfg;
    const supported = supportInfo.supportedState === window.BABYLON.CharacterSupportedState.SUPPORTED;
    const prev = ps.state;
    let next = prev;

    function goAirborne(reason) {
      next = 'IN_AIR';
      if (prev !== 'IN_AIR' && ps.lastGroundY !== null) {
        ps.fallStartY = ps.lastGroundY;
      } else if (ps.fallStartY === null) {
        ps.fallStartY = _cc.getPosition().y;
      }
      // Clear slide intent unless actively holding crouch
      if (reason === 'FellOffEdge' && !ps.wantSlideOnLand && !ps.isCrouching) {
        ps.slideDirectionIntentLocal.set(0, 0, 0);
      }
    }

    switch (prev) {
      case 'IN_AIR':
        if (supported) {
          ps.justLanded   = true;
          ps.isSprinting  = false;
          const landY     = _cc.getPosition().y;
          const fallDist  = ps.fallStartY !== null ? Math.max(0, ps.fallStartY - landY) : 0;
          const holdCrouch = ps.pressedKeys.has('c') || ps.isSlidingKeyDown;
          const hasIntent  = ps.slideDirectionIntentLocal.lengthSquared() > 0.01;
          let slid = false;

          if (ps.wantSlideOnLand && hasIntent) {
            next = 'SLIDING'; slid = true;
          } else if (ps.jumpedFromSlide && holdCrouch) {
            next = 'SLIDING'; slid = true;
          } else if (holdCrouch && fallDist > cfg.minFallDistanceForBoost) {
            next = 'SLIDING'; slid = true;
          } else if (ps.wantSlideOnLand && !hasIntent && holdCrouch) {
            next = 'SLIDING'; slid = true;
          } else {
            next = 'ON_GROUND';
            ps.isCrouching        = holdCrouch;
            ps.justLandedIntoSlide = false;
            if (hasIntent) ps.slideDirectionIntentLocal.set(0, 0, 0);
          }

          if (slid) {
            ps.isCrouching        = true;
            ps.justLandedIntoSlide = true;
          }

          // Resets
          ps.fallStartY       = null;
          ps.lastGroundY      = null;
          ps.wantSlideOnLand  = false;
          ps.jumpedFromSlide  = false;

          // B-Hop window
          ps.bHopTimer = cfg.bHopWindow;
          ps.wantBHop  = false;

          // Landing shock
          if (fallDist >= cfg.landingShockMinFall) {
            ps.landingShockTimer = cfg.landingShockDuration;
          }

          _updateVisuals();
        }
        break;

      case 'ON_GROUND':
      case 'SLIDING':
        ps.justLanded         = false;
        ps.justLandedIntoSlide = false;
        if (!supported) {
          goAirborne('FellOffEdge');
        } else if (ps.wantJump) {
          ps.jumpedFromSlide = (prev === 'SLIDING');
          next = 'START_JUMP';
        } else if (prev === 'SLIDING' && !ps.isCrouching) {
          next = 'ON_GROUND';
          ps.slideVelocity.set(0, 0, 0);
        }
        break;

      case 'START_JUMP':
        ps.justLanded  = false;
        ps.justLandedIntoSlide = false;
        ps.wantJump    = false;
        goAirborne('Jump');
        break;

      default:
        console.warn('[MovementSystem] Unknown state:', prev);
        next = 'IN_AIR';
        ps.wantSlideOnLand = false;
        ps.justLandedIntoSlide = false;
        ps.slideDirectionIntentLocal.set(0, 0, 0);
        ps.isCrouching = false;
        ps.fallStartY  = null;
        ps.lastGroundY = null;
        ps.justLanded  = false;
        ps.jumpedFromSlide = false;
        ps.wantJump    = false;
        ps.isSlidingKeyDown = false;
        _updateVisuals();
    }

    if (next !== prev) {
      _log(`State: ${prev} → ${next}`);
      ps.state = next;
      EventBus.emit('player:stateChange', { prev, next });
    }
  }

  // ── Velocity Calculation (pure — no side effects except updating timers) ──

  function _calculateVelocity(dt, supportInfo, currentVelocity) {
    const ps  = _ps;
    const cfg = _cfg;
    const V   = window.BABYLON.Vector3;

    // 1. Camera orientation matrix (for input relative to camera)
    const camMatrix = new window.BABYLON.Matrix();
    window.BABYLON.Matrix.RotationYToRef(_cam.rotation.y, camMatrix);

    // 2. Compute movement intent in world space
    const inputWorld = window.BABYLON.Vector3.TransformCoordinates(ps.inputDirection, camMatrix);
    inputWorld.y = 0;

    // 3. Update character orientation if there is input
    if (inputWorld.lengthSquared() > 0.001) {
      const MathJS = Math; // safeguard
      const angle = MathJS.atan2(inputWorld.x, inputWorld.z);
      window.BABYLON.Quaternion.FromEulerAnglesToRef(0, angle, 0, ps.characterTargetOrientation);
    }

    const m          = _orientMatrix(); // Character's actual orientation
    const up         = _upWorld();
    const forward    = window.BABYLON.Vector3.TransformCoordinates(cfg.forwardLocalSpace, m); // Character's forward
    const camForward = window.BABYLON.Vector3.TransformCoordinates(cfg.forwardLocalSpace, camMatrix); // Camera's forward
    const shockMult  = ps.landingShockTimer > 0 ? cfg.landingShockSpeedMult : 1.0;

    let output = V.Zero();

    switch (ps.state) {

      // ── ON_GROUND ─────────────────────────────────────────────────────
      case 'ON_GROUND': {
        if (ps.landingShockTimer > 0) {
          ps.landingShockTimer = Math.max(0, ps.landingShockTimer - dt);
        }

        let speed;
        if (ps.isCrouching) {
          speed = cfg.crouchSpeed * shockMult;
          ps.isSprinting = false;
        } else {
          const shouldSprint = ps.isShiftPressed && ps.inputDirection.z > 0;
          ps.isSprinting = shouldSprint;
          speed = (ps.isSprinting ? cfg.runSpeed : cfg.walkSpeed) * shockMult;
        }

        let target = ps.inputDirection.scale(speed);
        target = V.TransformCoordinates(target, camMatrix);

        let sn = supportInfo.averageSurfaceNormal || up;
        if (sn.lengthSquared() < 0.0001) sn = up;

        // Project target onto surface plane
        const proj = target.subtract(sn.scale(DOT(target, sn) / sn.lengthSquared()));
        const pLen = proj.length();
        if (pLen > 0.001) {
          proj.normalize().scaleInPlace(speed);
        } else {
          proj.set(0, 0, 0);
        }

        output = _cc.calculateMovement(
          dt, forward, sn, currentVelocity,
          supportInfo.averageSurfaceVelocity || V.Zero(),
          proj, up
        );

        // Cancel only downward relative velocity (preserve step-up)
        const sv = supportInfo.averageSurfaceVelocity || V.Zero();
        const rel = output.subtract(sv);
        let fsn = supportInfo.averageSurfaceNormal || up;
        if (fsn.lengthSquared() < 0.0001) fsn = up;
        const nDot = DOT(rel, fsn);
        if (nDot < -1e-4) {
          rel.subtractInPlace(fsn.scale(nDot / fsn.lengthSquared()));
        }
        output = rel.add(sv);
        break;
      }

      // ── SLIDING ───────────────────────────────────────────────────────
      case 'SLIDING': {
        if (ps.landingShockTimer > 0) {
          ps.landingShockTimer = Math.max(0, ps.landingShockTimer - dt);
        }

        let sv = ps.slideVelocity;
        let sn = supportInfo.averageSurfaceNormal || up;
        if (sn.lengthSquared() < 0.0001) sn = up;

        // Slope accel
        const gravDir = cfg.characterGravity.normalizeToNew();
        const slopeAccel = DOT(gravDir, sn);
        if (slopeAccel > 0 && slopeAccel < cfg.maxDotProductForSlopeAccel) {
          const slopeVec = gravDir.subtract(sn.scale(DOT(gravDir, sn))).normalize();
          const slopeAdd = slopeVec.scale(cfg.slopeSlideAccelerationScale * slopeAccel * dt);
          sv.addInPlace(slopeAdd);
          const spd = sv.length();
          if (spd > cfg.maxSlopeSlideSpeed) sv.normalize().scaleInPlace(cfg.maxSlopeSlideSpeed);
        }

        // Landing slide init
        if (ps.justLandedIntoSlide) {
          const landingDir = (() => {
            if (ps.slideDirectionIntentLocal.lengthSquared() > 0.01) {
              return V.TransformCoordinates(ps.slideDirectionIntentLocal.normalizeToNew(), camMatrix);
            }
            const cv = currentVelocity.clone(); cv.y = 0;
            return cv.length() > 0.1 ? cv.normalizeToNew() : forward.clone();
          })();

          const fallDist = ps.fallStartY !== null ? Math.max(0, ps.fallStartY - _cc.getPosition().y) : 0;
          const fallBonus = Math.min(fallDist * cfg.fallDistanceToSpeedScale, cfg.maxSlideSpeedFromFall - cfg.runSpeed);
          const initSpd   = Math.min(cfg.runSpeed * cfg.slideInitialBoost + fallBonus, cfg.maxSlideSpeedFromFall);
          sv.copyFrom(landingDir.scale(initSpd));
          ps.slideDirectionIntentLocal.set(0, 0, 0);
          ps.justLandedIntoSlide = false;
        }

        // Friction
        const framesAt60 = dt * 60;
        sv.scaleInPlace(Math.pow(cfg.slideFriction, framesAt60));

        // Stop slide when slow enough
        if (sv.length() < cfg.slideMinSpeed) {
          ps.state = 'ON_GROUND';
          ps.slideVelocity.set(0, 0, 0);
          EventBus.emit('player:stateChange', { prev: 'SLIDING', next: 'ON_GROUND' });
          output = V.Zero();
        } else {
          // Wall-bounce detection
          if (ps.lastHorizVelWorld) {
            const prev2D = ps.lastHorizVelWorld.clone(); prev2D.y = 0;
            const cur2D  = sv.clone(); cur2D.y = 0;
            const prevLen = prev2D.length();
            const curLen  = cur2D.length();
            if (prevLen > cfg.wallBounceMinSpeed && curLen < prevLen * 0.6) {
              ps.wallBounceTimer  = cfg.wallBounceWindow;
              ps.wallBouncePreVel = prev2D.clone();
            }
          }
          ps.lastHorizVelWorld = sv.clone();

          output = _cc.calculateMovement(
            dt, forward, sn, currentVelocity,
            supportInfo.averageSurfaceVelocity || V.Zero(),
            sv, up
          );
        }
        break;
      }

      // ── START_JUMP ────────────────────────────────────────────────────
      case 'START_JUMP': {
        const wasSlide = ps.jumpedFromSlide;
        const jumpH    = (ps.isSprinting && !wasSlide) ? cfg.sprintJumpHeight : cfg.jumpHeight;
        const jumpVel  = Math.sqrt(2 * Math.abs(cfg.characterGravity.y) * jumpH);

        let horiz;
        if (wasSlide && ps.slideVelocity.lengthSquared() > 0.01) {
          // Slide-jump: preserve slide momentum + forward boost
          const sv2d = ps.slideVelocity.clone(); sv2d.y = 0;
          const boost = forward.scale(sv2d.length() * (cfg.slideJumpForwardBoostFactor - 1.0));
          horiz = sv2d.add(boost);
          const maxSpd = cfg.runSpeed * cfg.slideJumpForwardBoostFactor;
          if (horiz.length() > maxSpd) horiz.normalize().scaleInPlace(maxSpd);
          ps.slideVelocity.set(0, 0, 0);
          ps.isCrouching = false;
          _updateVisuals();
        } else if (ps.wantBHop) {
          // B-Hop: preserve horizontal momentum with speed boost
          const cur2D = currentVelocity.clone(); cur2D.y = 0;
          const boosted = cur2D.length() * cfg.bHopBoostFactor;
          horiz = cur2D.normalize().scaleInPlace(Math.min(boosted, cfg.bHopMaxChainSpeed));
          ps.wantBHop = false;
        } else if (ps.wallBouncePreVel && ps.wallBounceTimer > 0) {
          // Wall Bounce: redirect velocity
          const preVelNorm = ps.wallBouncePreVel.normalizeToNew();
          const camFwd2D   = camForward.clone(); camFwd2D.y = 0;
          if (camFwd2D.length() > 0.001) camFwd2D.normalize();
          const bounceDir  = preVelNorm.add(camFwd2D).normalize();
          const preSpd     = ps.wallBouncePreVel.length();
          horiz = bounceDir.scale(preSpd * cfg.wallBounceBoostFactor);
          ps.wallBouncePreVel  = null;
          ps.wallBounceTimer   = 0;
        } else if (ps.superGlideTimer > 0) {
          // Super Glide
          horiz = forward.scale(cfg.superGlideSpeed);
          ps.superGlideTimer = 0;
        } else {
          // Normal jump
          horiz = V.TransformCoordinates(ps.inputDirection.scale(cfg.runSpeed), camMatrix);
          horiz.y = 0;
        }

        output = new window.BABYLON.Vector3(horiz.x, jumpVel, horiz.z);

        // Tap-strafe detection (input direction changed this frame in air)
        // Applied on top of jump velocity
        if (ps.lastInputDir) {
          const curDir2D = ps.inputDirection.clone(); curDir2D.y = 0;
          const changed  = !curDir2D.equalsWithEpsilon(ps.lastInputDir, 0.05);
          const hspd     = output.clone(); hspd.y = 0;
          if (changed && hspd.length() >= cfg.tapStrafeMinSpeed) {
            const right = camForward.cross(up).normalize();
            const tapX  = ps.inputDirection.x;
            const strafeBoost = right.scale(tapX * cfg.tapStrafeAirAccel * dt);
            output.addInPlace(strafeBoost);
            const newH = output.clone(); newH.y = 0;
            const maxH = hspd.length() + cfg.tapStrafeMaxAdd;
            if (newH.length() > maxH) newH.normalize().scaleInPlace(maxH);
            output.x = newH.x; output.z = newH.z;
          }
        }

        break;
      }

      // ── IN_AIR ───────────────────────────────────────────────────────
      case 'IN_AIR': {
        // Air strafing with capped acceleration
        const airTarget = V.TransformCoordinates(ps.inputDirection.scale(cfg.inAirSpeed), camMatrix);
        airTarget.y = 0;
        const curH = currentVelocity.clone(); curH.y = 0;

        // Tap-strafe
        if (ps.lastInputDir) {
          const curDir2D = ps.inputDirection.clone(); curDir2D.y = 0;
          const changed  = !curDir2D.equalsWithEpsilon(ps.lastInputDir, 0.05);
          if (changed && curH.length() >= cfg.tapStrafeMinSpeed) {
            const right       = camForward.cross(up).normalize();
            const tapX        = ps.inputDirection.x;
            const strafeBoost = right.scale(tapX * cfg.tapStrafeAirAccel * dt);
            const boosted     = curH.add(strafeBoost);
            const maxH        = curH.length() + cfg.tapStrafeMaxAdd;
            if (boosted.length() > maxH) boosted.normalize().scaleInPlace(maxH);
            output = new window.BABYLON.Vector3(boosted.x, currentVelocity.y, boosted.z);
          } else {
            output = currentVelocity.clone();
          }
        } else {
          output = currentVelocity.clone();
        }

        // Gravity
        output.y += cfg.characterGravity.y * dt;

        // Wall-bounce detection
        const cur2D = currentVelocity.clone(); cur2D.y = 0;
        if (ps.lastHorizVelWorld) {
          const prev2D  = ps.lastHorizVelWorld;
          const prevLen = prev2D.length();
          if (prevLen > cfg.wallBounceMinSpeed && cur2D.length() < prevLen * 0.6) {
            ps.wallBounceTimer  = cfg.wallBounceWindow;
            ps.wallBouncePreVel = prev2D.normalizeToNew().scale(prevLen);
          }
        }
        ps.lastHorizVelWorld = cur2D.clone();

        // Super-glide mantle detection
        if (supportInfo.supportedState === window.BABYLON.CharacterSupportedState.SUPPORTED) {
          const yRise = (ps.lastPosY !== null) ? (_cc.getPosition().y - ps.lastPosY) : 0;
          const riseThresh = 0.08 * dt * 60;
          if (yRise > riseThresh) ps.mantleTimer = 0.25;
        }
        ps.lastPosY = _cc.getPosition().y;

        if (ps.mantleTimer > 0) {
          ps.mantleTimer = Math.max(0, ps.mantleTimer - dt);
          if (Math.abs(currentVelocity.y) < 0.5 && ps.state !== 'ON_GROUND') {
            ps.superGlideTimer = cfg.superGlideWindow;
            ps.mantleTimer = 0;
          }
        }
        if (ps.superGlideTimer > 0) {
          ps.superGlideTimer = Math.max(0, ps.superGlideTimer - dt);
        }

        break;
      }
    }

    // Store last input direction for tap-strafe next frame
    ps.lastInputDir = ps.inputDirection.clone();
    ps.lastInputDir.y = 0;

    return output;
  }

  // ── Physics tick (runs every render frame) ────────────────────────────────

  function _onBeforeRender() {
    if (!_scene?.deltaTime || !_ps || !_cc) return;

    // Only run physics when pointer is locked (game active)
    // CameraSystem tracks lock state via input:pointerlock — we check it via InputSystem
    if (!_isLocked) return;

    const dt = Math.min(_scene.deltaTime / 1000.0, 0.033);
    const support = _cc.checkSupport(dt, _cfg.characterGravity.normalizeToNew());
    const curVel  = _cc.getVelocity();
    const curPos  = _cc.getPosition();

    // Track ground Y
    const grounded = support.supportedState === window.BABYLON.CharacterSupportedState.SUPPORTED;
    if ((_ps.state === 'ON_GROUND' || _ps.state === 'SLIDING') && grounded) {
      _ps.lastGroundY = curPos.y;
    }

    // B-hop countdown
    if (_ps.bHopTimer > 0) {
      _ps.bHopTimer = Math.max(0, _ps.bHopTimer - dt);
      if (_ps.bHopTimer <= 0) _ps.wantBHop = false;
    }

    // Wall-bounce countdown
    if (_ps.wallBounceTimer > 0) {
      _ps.wallBounceTimer = Math.max(0, _ps.wallBounceTimer - dt);
      if (_ps.wallBounceTimer <= 0) _ps.wallBouncePreVel = null;
    }

    _getNextState(support);

    const vel = _calculateVelocity(dt, support, curVel);
    _cc.setVelocity(vel);
    _cc.integrate(dt, support, _cfg.characterGravity);

    EventBus.emit('player:velocity', { vx: vel.x, vy: vel.y, vz: vel.z });
    EventBus.emit('player:position', { x: curPos.x, y: curPos.y, z: curPos.z });
  }

  // pointer lock state mirrored locally so physics tick can gate itself
  let _isLocked = false;

  // ── Public API ────────────────────────────────────────────────────────────

  function initialize(scene, camera, characterController, displayCapsule, cfg) {
    _scene   = scene;
    _cam     = camera;
    _cc      = characterController;
    _capsule = displayCapsule;
    _cfg     = cfg;

    _ps = createPlayerState('local');
    initPlayerStateVectors(_ps);

    // Subscribe to input events
    _unsubs.push(EventBus.on('input:keydown',    _handleKeyDown));
    _unsubs.push(EventBus.on('input:keyup',      _handleKeyUp));
    _unsubs.push(EventBus.on('input:scroll',     ({ direction }) => { if (direction === 'down') _handleScrollDown(); }));
    _unsubs.push(EventBus.on('input:tab',        _handleTab));
    _unsubs.push(EventBus.on('input:pointerlock', ({ locked }) => { _isLocked = locked; _handlePointerLock({ locked }); }));

    // Physics tick — insertFirst so it runs before camera
    _renderObserver = scene.onBeforeRenderObservable.add(_onBeforeRender, undefined, true);

    _updateVisuals();
    return api;
  }

  function getPlayerState() { return _ps; }
  function getConfig()      { return _cfg; }

  function dispose() {
    if (_scene && _renderObserver) {
      _scene.onBeforeRenderObservable.remove(_renderObserver);
    }
    for (const unsub of _unsubs) unsub();
    _unsubs = [];
    _renderObserver = null;
    _ps  = null; _cfg = null; _cc = null;
    _cam = null; _capsule = null; _scene = null;
  }

  const api = {
    initialize,
    getPlayerState,
    getConfig,
    dispose,
    // Convenience state accessors for Multiplayer
    controlState: {
      getState:       () => _ps?.state,
      isSprinting:    () => _ps?.isSprinting ?? false,
      isCrouching:    () => _ps?.isCrouching ?? false,
      isSliding:      () => _ps?.state === 'SLIDING',
      inputDirection: () => _ps?.inputDirection?.clone?.() ?? window.BABYLON.Vector3.Zero(),
      getVelocity:    () => _ps ? window.BABYLON.Vector3.Zero() : window.BABYLON.Vector3.Zero(),
    },
  };
  return api;
})();

return { MovementSystem };
