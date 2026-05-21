// In CharacterConstants.js (or wherever createConstants is defined)

function createConstants(normalCharacterHeight, crouchCharacterHeight, characterRadius) {
    const runSpeedBase = 5.7; // Apex sprint: 5.7 m/s

    const constants = {
        // ─── Base Speeds (Apex Legends values) ───────────────────────────────────
        walkSpeed:   3.8,          // Apex base walk
        runSpeed:    runSpeedBase, // Apex sprint
        crouchSpeed: 1.75,         // Apex crouch-walk
        inAirSpeed:  4.2,          // Slightly above walk for responsive air strafes

        // ─── Jump ────────────────────────────────────────────────────────────────
        jumpHeight:       1.35,    // Standard Apex jump feel
        sprintJumpHeight: 1.65,    // Sprint jump gives a slight extra height

        // ─── B-Hopping ───────────────────────────────────────────────────────────
        bHopWindow:       0.18,              // Seconds after landing where jump re-press gives bhop boost
        bHopBoostFactor:  1.22,              // Horizontal speed multiplier on a successful b-hop
        bHopMaxChainSpeed: runSpeedBase * 1.55, // Hard cap on chained b-hop horizontal speed

        // ─── Tap Strafing ────────────────────────────────────────────────────────
        tapStrafeAirAccel: 30.0,   // Instantaneous lateral accel burst (m/s²)
        tapStrafeMaxAdd:   3.8,    // Max speed added above current horizontal on a single tap
        tapStrafeMinSpeed: 3.5,    // Only triggers if moving this fast horizontally (prevents accidental trigger)

        // ─── Wall Bounce ─────────────────────────────────────────────────────────
        wallBounceMinSpeed:   4.0, // Min horizontal speed to detect a wall bounce
        wallBounceBoostFactor: 1.3, // Redirect speed multiplier
        wallBounceWindow:      0.12,// Jump-press window (seconds) after wall collision to activate

        // ─── Super Glide ─────────────────────────────────────────────────────────
        superGlideSpeed:  10.3,    // Forward velocity on a successful super-glide (Apex: 10.3 m/s)
        superGlideWindow: 0.14,    // Jump must be pressed within this window of mantle peak

        // ─── Landing Shock ───────────────────────────────────────────────────────
        landingShockMinFall:    8.0, // Fall distance (m) that triggers a landing shock
        landingShockDuration:   0.45,// Seconds the slow-down lasts
        landingShockSpeedMult:  0.45,// Speed multiplier during shock (45% of normal)

        // ─── Sliding ─────────────────────────────────────────────────────────────
        slideInitialBoost: 1.5,    // Multiplier for sprint/static slides
        slideFriction:     0.985,  // Friction factor per 1/60th sec (high = long slides like Apex)
        slideMinSpeed:     1.2,    // Speed below which sliding stops
        slideJumpForwardBoostFactor: 1.8,  // Forward boost on slide-jump
        staticSlideVelocityThreshold: 0.1, // Max speed to initiate a static-crouch slide

        // ─── Slope Sliding ───────────────────────────────────────────────────────
        slopeSlideAccelerationScale: 22.0,        // Downhill slide acceleration (higher = more Apex downhill feel)
        maxSlopeSlideSpeed:          runSpeedBase * 2.4, // Max speed achievable sliding downhill
        minSlopeAngleForAccel:       2.0,         // Degrees below which slope doesn't help

        // ─── Landing / Falling → Slide ───────────────────────────────────────────
        minFallDistanceForBoost:        0.5,
        minFallDistanceForLandingSlide: 0.3,
        fallDistanceToSpeedScale:       2.8,
        maxSlideSpeedFromFall:          runSpeedBase * 1.9,

        // ─── Core & Camera ───────────────────────────────────────────────────────
        characterGravity:    new window.BABYLON.Vector3(0, -20, 0), // Snappier Apex-feel gravity
        turnSpeed:           0.18,
        normalCameraOffsetY: normalCharacterHeight * 0.4,
        crouchCameraOffsetY: crouchCharacterHeight * 0.4,

        // ─── Internal ────────────────────────────────────────────────────────────
        forwardLocalSpace:          new window.BABYLON.Vector3(0, 0, 1),
        maxDotProductForSlopeAccel: 1.0,
        DEBUG_JUMP:   false,
        DEBUG_SPRINT: false,
        DEBUG_CROUCH: false,
        DEBUG_SLIDE:  false,
    };

    // Derived: slope accel dot-product threshold
    if (constants.minSlopeAngleForAccel > 0) {
        constants.maxDotProductForSlopeAccel = Math.cos(constants.minSlopeAngleForAccel * (Math.PI / 180.0));
    } else {
        constants.maxDotProductForSlopeAccel = 0.9999;
    }
    constants.maxDotProductForSlopeAccel = constants.maxDotProductForSlopeAccel ?? 1.0;

    return constants;
}

return { createConstants };