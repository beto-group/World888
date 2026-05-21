// ─── PlayerState.js ──────────────────────────────────────────────────────────
// Single source of truth for a player's runtime state.
// Plain JS object — no Babylon dependency at the module level.
// Vector3s are allocated on first use (after Babylon is available).
// ─────────────────────────────────────────────────────────────────────────────

function createPlayerState(id) {
  id = id || 'local';
  return {
    id,

    // ── State machine ────────────────────────────────────────────────────────
    // 'IN_AIR' | 'ON_GROUND' | 'START_JUMP' | 'SLIDING'
    state: 'IN_AIR',

    // ── Movement flags ───────────────────────────────────────────────────────
    isCrouching:      false,
    isSprinting:      false,
    isShiftPressed:   false,
    isSlidingKeyDown: false,

    // ── Jump flags ───────────────────────────────────────────────────────────
    wantJump:       false,
    isJumpKeyHeld:  false,
    justLanded:     false,
    jumpedFromSlide: false,

    // ── Input ────────────────────────────────────────────────────────────────
    // These are Babylon Vector3 — allocated by the first system that inits state
    inputDirection:  null,      // Vector3(0,0,0) local space
    characterTargetOrientation: null, // Quaternion.Identity()

    // Pressed key set for multi-key tracking
    pressedKeys: new Set(),

    // ── Slide ────────────────────────────────────────────────────────────────
    wantSlideOnLand:           false,
    justLandedIntoSlide:       false,
    slideVelocity:             null,  // Vector3
    slideDirectionIntentLocal: null,  // Vector3

    // ── Fall / landing tracking ───────────────────────────────────────────────
    fallStartY:  null,
    lastGroundY: null,

    // ── Apex mechanic timers ─────────────────────────────────────────────────
    bHopTimer:         0,      // counts down after landing
    wantBHop:          false,
    wallBounceTimer:   0,      // window after wall collision
    wallBouncePreVel:  null,   // Vector3 snapshot before wall hit
    superGlideTimer:   0,      // window at mantle peak
    superGlideActive:  false,
    landingShockTimer: 0,      // speed penalty duration after hard fall
    mantleTimer:       0,      // rapid Y-rise detection
    lastPosY:          null,
    lastInputDir:      null,   // for tap-strafe detection (prev frame)
    lastHorizVelWorld: null,   // for wall-bounce detection (Vector3)
  };
}

/**
 * Ensure all Babylon Vector3 / Quaternion fields are allocated.
 * Call this once AFTER Babylon is loaded (window.BABYLON available).
 */
function initPlayerStateVectors(ps) {
  const V3 = window.BABYLON.Vector3;
  const Q  = window.BABYLON.Quaternion;

  if (!ps.inputDirection)             ps.inputDirection             = V3.Zero();
  if (!ps.characterTargetOrientation) ps.characterTargetOrientation = Q.Identity();
  if (!ps.slideVelocity)              ps.slideVelocity              = V3.Zero();
  if (!ps.slideDirectionIntentLocal)  ps.slideDirectionIntentLocal  = V3.Zero();
  // lastHorizVelWorld and wallBouncePreVel are allocated on first use
}

return { createPlayerState, initPlayerStateVectors };
