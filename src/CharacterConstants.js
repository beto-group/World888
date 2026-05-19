// In CharacterConstants.js (or wherever createConstants is defined)

function createConstants(normalCharacterHeight, crouchCharacterHeight, characterRadius) {
    const runSpeedBase = 7.7;

    const constants = {
        // --- Existing Movement & Jump ---
        walkSpeed: 4.4,
        runSpeed: runSpeedBase,
        crouchSpeed: 2.2,
        inAirSpeed: 3.8,
        jumpHeight: 1.5,
        sprintJumpHeight: 2.2,

        // --- Sliding General ---
        slideInitialBoost: 1.44, // Multiplier for sprint/static slides ONLY
        slideFriction: 0.97,     // Friction factor per 1/60th sec (closer to 1 = less friction)
        slideMinSpeed: 1.5,      // Speed below which sliding stops
        slideJumpForwardBoostFactor: 1.77, // Multiplier applied to *runSpeed* for forward boost on slide jump
        staticSlideVelocityThreshold: 0.1, // Max speed to initiate slide from static crouch + move
        // (Optional - Add if you want input control during slide)
        // slideControlFactor: 25.0, // How much WASD influences slide direction (higher = more control)

        // --- Landing/Falling -> Slide ---
        minFallDistanceForBoost: 0.5,          // Min fall height for speed *boost* above runSpeed on landing slide.
        minFallDistanceForLandingSlide: 0.3,   // Min fall height to trigger *any* landing slide (if crouched).
        fallDistanceToSpeedScale: 2.5,         // How much sqrt(fall distance) scales added speed boost.
        maxSlideSpeedFromFall: runSpeedBase * 1.8, // Max speed achievable purely from fall boost blend.

        // --- Sliding Slope Physics (ADDED) ---
        slopeSlideAccelerationScale: 15.0, // How strongly gravity influences slide speed on slopes.
        maxSlopeSlideSpeed: runSpeedBase * 2.2, // Absolute maximum speed achievable while sliding downhill (relative to run speed).
        minSlopeAngleForAccel: 2.0,       // Minimum slope angle (degrees) to trigger acceleration. 0 means any slope helps.

        // --- Core & Camera ---
        characterGravity: new window.BABYLON.Vector3(0, -18, 0),
        turnSpeed: 0.15,
        normalCameraOffsetY: normalCharacterHeight * 0.4,
        crouchCameraOffsetY: crouchCharacterHeight * 0.4,

        // --- Internal / Debug ---
        forwardLocalSpace: new window.BABYLON.Vector3(0, 0, 1),
        maxDotProductForSlopeAccel: 1.0, // Default, calculated below (ADDED)
        DEBUG_JUMP: true,
        DEBUG_SPRINT: true,
        DEBUG_CROUCH: true,
        DEBUG_SLIDE: true,
    };

    // --- Calculate Derived Constants (ADDED/MODIFIED) ---
    if (constants.minSlopeAngleForAccel > 0) {
        constants.maxDotProductForSlopeAccel = Math.cos(constants.minSlopeAngleForAccel * (Math.PI / 180.0));
    } else {
        // Use a value slightly less than 1 for numerical stability if min angle is 0
        constants.maxDotProductForSlopeAccel = 0.9999;
    }
    // Safety fallback
    constants.maxDotProductForSlopeAccel = constants.maxDotProductForSlopeAccel ?? 1.0;

    return constants;
}

return { createConstants };