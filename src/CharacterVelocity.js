// --- Character Velocity Calculation (Defined Inline) ---
// Contains the critical fix for jumpedFromSlide flag handling
function _calculateDesiredVelocity(
    deltaTime, supportInfo, characterOrientation, currentVelocity, // Core physics inputs
    stateVariables, constants, characterController,                // Required objects/state
    getNextState, updateVisualState, logDebug                       // Required helper functions
) {
    // Determine/update state FIRST - this might change stateVariables.state
    // It will also set justLandedIntoSlide correctly if landing occurs
    const previousFrameState = stateVariables.state; // Store state before getNextState potentially changes it
    getNextState(supportInfo); // This updates stateVariables.state and flags like justLandedIntoSlide
    const currentFrameState = stateVariables.state; // Get the potentially updated state

    // Common calculations
    const upWorld = constants.characterGravity.normalizeToNew().scale(-1);
    const m = new window.BABYLON.Matrix();
    characterOrientation.toRotationMatrix(m);
    const forwardWorld = window.BABYLON.Vector3.TransformCoordinates(constants.forwardLocalSpace, m);
    let outputVelocity = window.BABYLON.Vector3.Zero();
    let currentSpeed;


    // --- Calculate velocity based on the CURRENT state for THIS frame ---
    switch (currentFrameState) {
        case "ON_GROUND": {
            // --- ON_GROUND Logic ---
            if (stateVariables.isCrouching) {
                currentSpeed = constants.crouchSpeed;
                if (stateVariables.isSprinting) stateVariables.isSprinting = false; // Cannot sprint while crouched
            } else {
                // Check if sprinting should start/stop
                const shouldSprint = stateVariables.isShiftPressed && stateVariables.inputDirection.z > 0;
                if (shouldSprint !== stateVariables.isSprinting) {
                    logDebug("[CharSprint]", `${shouldSprint ? 'Engaging' : 'Disengaging'} Sprint (ON_GROUND check)`);
                    stateVariables.isSprinting = shouldSprint;
                }
                currentSpeed = stateVariables.isSprinting ? constants.runSpeed : constants.walkSpeed;
            }

            // Calculate target velocity based on input and speed
            let targetVelocity = stateVariables.inputDirection.scale(currentSpeed);
            targetVelocity = window.BABYLON.Vector3.TransformCoordinates(targetVelocity, m); // To world space

            // Project onto ground plane (using average surface normal if available)
            const surfaceNormal = supportInfo.averageSurfaceNormal || upWorld;
            const projectedVelocity = targetVelocity.subtract(surfaceNormal.scale(window.BABYLON.Vector3.Dot(targetVelocity, surfaceNormal) / surfaceNormal.lengthSquared()));

            // Clamp magnitude to current speed
            const speedMagnitude = projectedVelocity.length();
            if (speedMagnitude > 0.001) {
                projectedVelocity.normalize().scaleInPlace(currentSpeed);
            } else {
                projectedVelocity.set(0, 0, 0); // No input, stop
            }

            // Use CharacterController's built-in movement calculation (handles slopes, etc.)
            outputVelocity = characterController.calculateMovement(
                deltaTime, forwardWorld, surfaceNormal, currentVelocity,
                supportInfo.averageSurfaceVelocity || window.BABYLON.Vector3.Zero(), // Ground velocity
                projectedVelocity, // Desired velocity relative to ground
                upWorld
            );

             // --- Refinement: Ensure velocity is truly parallel to the ground ---
            const finalSurfaceNormal = supportInfo.averageSurfaceNormal || upWorld;
            const relativeVelocity = outputVelocity.subtract(supportInfo.averageSurfaceVelocity || window.BABYLON.Vector3.Zero());
            const normalDot = window.BABYLON.Vector3.Dot(relativeVelocity, finalSurfaceNormal);
             if (Math.abs(normalDot) > 1e-4) {
                 relativeVelocity.subtractInPlace(finalSurfaceNormal.scale(normalDot / finalSurfaceNormal.lengthSquared()));
             }
            outputVelocity = relativeVelocity.add(supportInfo.averageSurfaceVelocity || window.BABYLON.Vector3.Zero());


            return outputVelocity;
        } // End ON_GROUND case

        case "SLIDING": {
            // --- SLIDE INITIALIZATION FRAME (Landing) ---
            if (stateVariables.justLandedIntoSlide) {
                logDebug("[CharSlide]", `CalcVel: LANDING INTO SLIDE FRAME.`);
                let initialSlideDirectionWorld = null;
                const matrix = new window.BABYLON.Matrix();
                stateVariables.characterTargetOrientation.toRotationMatrix(matrix);

                if (stateVariables.slideDirectionIntentLocal.lengthSquared() > 0.01) {
                    initialSlideDirectionWorld = window.BABYLON.Vector3.TransformCoordinates(stateVariables.slideDirectionIntentLocal, matrix).normalize();
                    stateVariables.slideDirectionIntentLocal.set(0, 0, 0);
                    logDebug("[CharSlide]", ` -> Using Intentional Direction: ${initialSlideDirectionWorld.toString()}`);
                } else {
                    initialSlideDirectionWorld = forwardWorld.normalizeToNew();
                    logDebug("[CharSlide]", ` -> Using Automatic Forward Direction: ${initialSlideDirectionWorld.toString()}`);
                }

                let calculatedSpeed = constants.runSpeed;
                if (stateVariables.fallStartY !== null) {
                    const landingY = characterController.getPosition().y;
                    const fallDistance = Math.max(0, stateVariables.fallStartY - landingY);
                    logDebug("[CharSlide]", ` -> Fall Calc: StartY=${stateVariables.fallStartY.toFixed(2)}, LandY=${landingY.toFixed(2)}, Dist=${fallDistance.toFixed(2)}`);

                    if (fallDistance > constants.minFallDistanceForBoost) {
                        const speedFromFallRaw = constants.runSpeed + (Math.sqrt(fallDistance) * constants.fallDistanceToSpeedScale);
                        const speedFromFallClamped = Math.min(speedFromFallRaw, constants.maxSlideSpeedFromFall);
                        const landingHorizontalVel = new window.BABYLON.Vector3(currentVelocity.x, 0, currentVelocity.z);
                        const landingHorizontalSpeed = landingHorizontalVel.length();
                        const blendFactor = 0.5;
                        calculatedSpeed = window.BABYLON.Scalar.Lerp(landingHorizontalSpeed, speedFromFallClamped, blendFactor);
                        calculatedSpeed = Math.max(calculatedSpeed, constants.runSpeed);
                        calculatedSpeed = Math.min(calculatedSpeed, constants.maxSlideSpeedFromFall);
                        logDebug("[CharSlide]", ` -> Applied Fall Boost. SpeedFromFallClamped: ${speedFromFallClamped.toFixed(2)}, LandingHorizSpeed: ${landingHorizontalSpeed.toFixed(2)}, Blended Speed: ${calculatedSpeed.toFixed(2)}`);
                    } else {
                         logDebug("[CharSlide]", ` -> Fall distance <= ${constants.minFallDistanceForBoost}. Using base run speed: ${calculatedSpeed.toFixed(2)}`);
                    }
                } else {
                     logDebug("[CharSlide]", ` -> No valid fallStartY. Using base run speed: ${calculatedSpeed.toFixed(2)}`);
                }

                stateVariables.slideVelocity.copyFrom(initialSlideDirectionWorld.scale(calculatedSpeed));
                stateVariables.slideVelocity.y = currentVelocity.y; // Preserve vertical velocity from landing impact

                logDebug("[CharSlide]", ` >> Initial slide velocity calculated and stored: ${stateVariables.slideVelocity.toString()}`);
                stateVariables.justLandedIntoSlide = false; // Consume flag AFTER calculation
                updateVisualState();

                logDebug("[CharSlide]", ` << CalcVel: RETURNING INITIAL BOOST VELOCITY FOR LANDING FRAME.`);
                return stateVariables.slideVelocity.clone(); // Use calculated boost velocity THIS FRAME
            }

             // --- STATIC CROUCH SLIDE INITIALIZATION FRAME ---
             const justStartedStaticSlide = (previousFrameState === "ON_GROUND" && currentFrameState === "SLIDING");
             // Check if input handler already set a boost velocity
             if (justStartedStaticSlide && stateVariables.slideVelocity.lengthSquared() > constants.staticSlideVelocityThreshold * constants.staticSlideVelocityThreshold) {
                 logDebug("[CharSlide]", `CalcVel: STATIC CROUCH SLIDE INITIATION FRAME.`);
                 logDebug("[CharSlide]", ` >> Using pre-calculated boost velocity from input: ${stateVariables.slideVelocity.toString()}`);
                 stateVariables.slideVelocity.y = currentVelocity.y; // Preserve current Y
                 logDebug("[CharSlide]", ` << CalcVel: RETURNING STATIC BOOST VELOCITY FOR INITIATION FRAME.`);
                 return stateVariables.slideVelocity.clone(); // Use the boost velocity THIS FRAME
             }


            // --- NORMAL SLIDING FRAME (After initialization) ---
            logDebug("[CharSlide]", `CalcVel: NORMAL SLIDE FRAME.`);

            // Check for termination via key release
            const crouchHeld = stateVariables.isSlidingKeyDown || stateVariables.pressedKeys.has('c');
            if (!crouchHeld) {
                 logDebug("[CharSlide]", `Slide termination condition met (Keys Released). Transitioning to ON_GROUND.`);
                 stateVariables.state = "ON_GROUND";
                 stateVariables.isCrouching = false; // Attempt to stand
                 updateVisualState();
                 stateVariables.slideVelocity.set(0, 0, 0);
                 logDebug("[CharSlide]", ` << CalcVel: Recalculating as ON_GROUND after key release.`);
                 return _calculateDesiredVelocity(deltaTime, supportInfo, characterOrientation, currentVelocity, stateVariables, constants, characterController, getNextState, updateVisualState, logDebug); // Recalculate for this frame
            }

            // Apply friction to the horizontal component of the stored slide velocity
            let horizontalVel = new window.BABYLON.Vector3(stateVariables.slideVelocity.x, 0, stateVariables.slideVelocity.z);
            const speedBeforeFriction = horizontalVel.length();
            if (speedBeforeFriction > 0.01) {
                const frictionMultiplier = Math.pow(constants.slideFriction, deltaTime * 60);
                horizontalVel.scaleInPlace(frictionMultiplier);
                stateVariables.slideVelocity.x = horizontalVel.x;
                stateVariables.slideVelocity.z = horizontalVel.z;
            }
            const currentHorizontalSpeed = horizontalVel.length();
            logDebug("[CharSlide]", ` -> Sliding. Speed After Friction: ${currentHorizontalSpeed.toFixed(2)}, Stored Vel: ${stateVariables.slideVelocity.toString()}`);

            // Check for termination via low speed
            if (currentHorizontalSpeed < constants.slideMinSpeed) {
                logDebug("[CharSlide]", `Slide termination condition met (Low Speed: ${currentHorizontalSpeed.toFixed(2)} < ${constants.slideMinSpeed}). Transitioning to ON_GROUND.`);
                 stateVariables.state = "ON_GROUND";
                 stateVariables.isCrouching = true; // Remain crouching
                 updateVisualState();
                 stateVariables.slideVelocity.set(0, 0, 0);
                 logDebug("[CharSlide]", ` << CalcVel: Recalculating as ON_GROUND (crouched) after low speed.`);
                 return _calculateDesiredVelocity(deltaTime, supportInfo, characterOrientation, currentVelocity, stateVariables, constants, characterController, getNextState, updateVisualState, logDebug); // Recalculate for this frame
             }

            // Preserve current vertical velocity (let gravity/integrate handle it)
            stateVariables.slideVelocity.y = currentVelocity.y;

            logDebug("[CharSlide]", ` << CalcVel: RETURNING NORMAL SLIDE VELOCITY.`);
            return stateVariables.slideVelocity.clone(); // Return friction-applied velocity

        } // End SLIDING case

        case "IN_AIR": {
            // --- IN_AIR Logic ---
            currentSpeed = constants.inAirSpeed;
            let desiredAirVelocity = stateVariables.inputDirection.scale(currentSpeed);
            desiredAirVelocity = window.BABYLON.Vector3.TransformCoordinates(desiredAirVelocity, m);

            // Apply air control using calculateMovement (if suitable) or simpler approach
            outputVelocity = characterController.calculateMovement(
                deltaTime, forwardWorld, upWorld, currentVelocity,
                window.BABYLON.Vector3.Zero(), desiredAirVelocity, upWorld
            );

            // Apply Gravity explicitly
            outputVelocity.addInPlace(constants.characterGravity.scale(deltaTime));

            return outputVelocity;
        } // End IN_AIR case

        case "START_JUMP": {
            // --- START_JUMP Logic (Impulse Calculation) ---
            const effectiveJumpHeight = stateVariables.isSprinting ? constants.sprintJumpHeight : constants.jumpHeight;
            logDebug("[CharJump]", `CalcVel: Calculating Jump Impulse. IsSprinting=${stateVariables.isSprinting}, EffectiveHeight=${effectiveJumpHeight.toFixed(2)}, JumpedFromSlide=${stateVariables.jumpedFromSlide}`); // Log flag state HERE

            const jumpSpeed = Math.sqrt(2 * constants.characterGravity.length() * effectiveJumpHeight);
            const currentUpVel = currentVelocity.dot(upWorld);
            const impulseMagnitude = Math.max(0, jumpSpeed - currentUpVel);
            const verticalJumpImpulse = upWorld.scale(impulseMagnitude);

            logDebug("[CharJump]", ` -> Applying Vertical Jump Impulse: TargetSpeed=${jumpSpeed.toFixed(3)}, CurrentUpVel=${currentUpVel.toFixed(3)}, ImpulseMag=${impulseMagnitude.toFixed(3)}, ImpulseVec=${verticalJumpImpulse.toString()}`);

            let finalJumpVelocity = currentVelocity.clone();
            finalJumpVelocity.addInPlace(verticalJumpImpulse);

            // Apply horizontal boost if jumping from a slide (flag checked HERE)
            if (stateVariables.jumpedFromSlide) {
                const boostMagnitude = constants.runSpeed * (constants.slideJumpForwardBoostFactor - 1.0);
                const horizontalBoostImpulse = forwardWorld.normalizeToNew().scale(boostMagnitude);
                logDebug("[CharJump/Slide]", ` -> Applying Slide Jump Horizontal Boost: Factor=${constants.slideJumpForwardBoostFactor}, AddSpeed=${boostMagnitude.toFixed(3)}, ImpulseVec=${horizontalBoostImpulse.toString()}`);
                finalJumpVelocity.addInPlace(horizontalBoostImpulse);
                // ***** THE FIX: DO NOT RESET THE FLAG HERE *****
                // The flag should persist until landing.
                // stateVariables.jumpedFromSlide = false; // <-- REMOVED/COMMENTED OUT
            }

            logDebug("[CharJump]", ` << CalcVel: RETURNING JUMP IMPULSE VELOCITY.`);
            return finalJumpVelocity; // Return velocity post-impulse
        } // End START_JUMP case

        default: {
            // Fallback for unknown states
            // console.warn("[CharacterLogic: Velocity] Reached fallback in _calculateDesiredVelocity. State:", currentFrameState);
            return currentVelocity.add(constants.characterGravity.scale(deltaTime)); // Apply gravity at least
        } // End default case
    } // End switch (currentFrameState)
} // End _calculateDesiredVelocity

// Export if this is in its own module file
return { _calculateDesiredVelocity };