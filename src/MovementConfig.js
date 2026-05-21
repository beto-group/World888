// ─── MovementConfig.js ───────────────────────────────────────────────────────
// All movement constants in one place — Apex Legends physics values.
// No external dependencies. Called after Babylon.js is loaded (uses window.BABYLON).
// Replaces CharacterConstants.js.
// ─────────────────────────────────────────────────────────────────────────────

function createMovementConfig(normalHeight, crouchHeight, radius) {
  const SPRINT = 5.7;

  const cfg = {
    // ── Capsule ──────────────────────────────────────────────────────────────
    normalCharacterHeight: normalHeight,
    crouchCharacterHeight: crouchHeight,
    characterRadius:       radius,

    // ── Base Speeds (Apex Legends values) ────────────────────────────────────
    walkSpeed:   3.8,
    runSpeed:    SPRINT,
    crouchSpeed: 1.75,
    inAirSpeed:  4.2,

    // ── Jump ─────────────────────────────────────────────────────────────────
    jumpHeight:       1.35,
    sprintJumpHeight: 1.65,

    // ── B-Hop ────────────────────────────────────────────────────────────────
    bHopWindow:        0.18,
    bHopBoostFactor:   1.22,
    bHopMaxChainSpeed: SPRINT * 1.55,

    // ── Tap Strafe ───────────────────────────────────────────────────────────
    tapStrafeAirAccel: 30.0,
    tapStrafeMaxAdd:   3.8,
    tapStrafeMinSpeed: 3.5,

    // ── Wall Bounce ──────────────────────────────────────────────────────────
    wallBounceMinSpeed:    4.0,
    wallBounceBoostFactor: 1.3,
    wallBounceWindow:      0.12,

    // ── Super Glide ──────────────────────────────────────────────────────────
    superGlideSpeed:  10.3,
    superGlideWindow: 0.14,

    // ── Landing Shock ────────────────────────────────────────────────────────
    landingShockMinFall:   8.0,
    landingShockDuration:  0.45,
    landingShockSpeedMult: 0.45,

    // ── Sliding ──────────────────────────────────────────────────────────────
    slideInitialBoost:            1.5,
    slideFriction:                0.985,
    slideMinSpeed:                1.2,
    slideJumpForwardBoostFactor:  1.8,
    staticSlideVelocityThreshold: 0.1,

    // ── Slope Sliding ────────────────────────────────────────────────────────
    slopeSlideAccelerationScale: 22.0,
    maxSlopeSlideSpeed:          SPRINT * 2.4,
    minSlopeAngleForAccel:       2.0,

    // ── Fall → Slide ─────────────────────────────────────────────────────────
    minFallDistanceForBoost:        0.5,
    minFallDistanceForLandingSlide: 0.3,
    fallDistanceToSpeedScale:       2.8,
    maxSlideSpeedFromFall:          SPRINT * 1.9,

    // ── Core & Camera ────────────────────────────────────────────────────────
    characterGravity:    new window.BABYLON.Vector3(0, -20, 0),
    turnSpeed:           0.18,
    normalCameraOffsetY: normalHeight * 0.4,
    crouchCameraOffsetY: crouchHeight * 0.4,

    // ── Internal helpers ─────────────────────────────────────────────────────
    forwardLocalSpace:          new window.BABYLON.Vector3(0, 0, 1),
    maxDotProductForSlopeAccel: 1.0,
  };

  // Derived slope threshold
  if (cfg.minSlopeAngleForAccel > 0) {
    cfg.maxDotProductForSlopeAccel = Math.cos(cfg.minSlopeAngleForAccel * (Math.PI / 180));
  } else {
    cfg.maxDotProductForSlopeAccel = 0.9999;
  }

  return cfg;
}

return { createMovementConfig };
