// --- Character Velocity Calculation ---
// Apex Legends movement mechanics:
//   - B-Hopping, Tap Strafing, Wall Bounce, Super Glide, Landing Shock
//   - Slope-enhanced sliding, Sprint auto-engage

function _calculateDesiredVelocity(
    deltaTime, supportInfo, characterOrientation, currentVelocity,
    stateVariables, constants, characterController,
    getNextState, updateVisualState, logDebug
) {
    const previousFrameState = stateVariables.state;
    getNextState(supportInfo);
    const currentFrameState = stateVariables.state;

    // ─── Common setup ─────────────────────────────────────────────────────────
    const upWorld = constants.characterGravity.normalizeToNew().scale(-1);
    const m = new window.BABYLON.Matrix();
    characterOrientation.toRotationMatrix(m);
    const forwardWorld = window.BABYLON.Vector3.TransformCoordinates(constants.forwardLocalSpace, m);
    let outputVelocity = window.BABYLON.Vector3.Zero();

    // Effective speed modifier from landing shock
    const shockMult = (stateVariables.landingShockTimer > 0)
        ? constants.landingShockSpeedMult
        : 1.0;

    // ─── State machine ────────────────────────────────────────────────────────
    switch (currentFrameState) {

        // ══════════════════════════════════════════════════════════════════════
        case "ON_GROUND": {
            // Decrement landing shock timer
            if (stateVariables.landingShockTimer > 0) {
                stateVariables.landingShockTimer = Math.max(0, stateVariables.landingShockTimer - deltaTime);
            }

            let currentSpeed;
            if (stateVariables.isCrouching) {
                currentSpeed = constants.crouchSpeed * shockMult;
                stateVariables.isSprinting = false;
            } else {
                // Auto-sprint: Shift + forward = sprint (Apex default)
                const shouldSprint = stateVariables.isShiftPressed && stateVariables.inputDirection.z > 0;
                if (shouldSprint !== stateVariables.isSprinting) {
                    stateVariables.isSprinting = shouldSprint;
                }
                currentSpeed = (stateVariables.isSprinting ? constants.runSpeed : constants.walkSpeed) * shockMult;
            }

            let targetVelocity = stateVariables.inputDirection.scale(currentSpeed);
            targetVelocity = window.BABYLON.Vector3.TransformCoordinates(targetVelocity, m);

            let surfaceNormal = supportInfo.averageSurfaceNormal || upWorld;
            if (surfaceNormal.lengthSquared() < 0.0001) surfaceNormal = upWorld;

            const projectedVelocity = targetVelocity.subtract(
                surfaceNormal.scale(window.BABYLON.Vector3.Dot(targetVelocity, surfaceNormal) / surfaceNormal.lengthSquared())
            );
            const speedMag = projectedVelocity.length();
            if (speedMag > 0.001) {
                projectedVelocity.normalize().scaleInPlace(currentSpeed);
            } else {
                projectedVelocity.set(0, 0, 0);
            }

            outputVelocity = characterController.calculateMovement(
                deltaTime, forwardWorld, surfaceNormal, currentVelocity,
                supportInfo.averageSurfaceVelocity || window.BABYLON.Vector3.Zero(),
                projectedVelocity, upWorld
            );

            // Ensure velocity is truly parallel to ground
            let finalSN = supportInfo.averageSurfaceNormal || upWorld;
            if (finalSN.lengthSquared() < 0.0001) finalSN = upWorld;
            const relVel = outputVelocity.subtract(supportInfo.averageSurfaceVelocity || window.BABYLON.Vector3.Zero());
            const nDot = window.BABYLON.Vector3.Dot(relVel, finalSN);
            if (nDot < -1e-4) {
                relVel.subtractInPlace(finalSN.scale(nDot / finalSN.lengthSquared()));
            }
            outputVelocity = relVel.add(supportInfo.averageSurfaceVelocity || window.BABYLON.Vector3.Zero());

            return outputVelocity;
        }

        // ══════════════════════════════════════════════════════════════════════
        case "SLIDING": {

            // ── Landing into slide ────────────────────────────────────────────
            if (stateVariables.justLandedIntoSlide) {
                let initialSlideDir = null;
                const mat = new window.BABYLON.Matrix();
                stateVariables.characterTargetOrientation.toRotationMatrix(mat);

                if (stateVariables.slideDirectionIntentLocal.lengthSquared() > 0.01) {
                    initialSlideDir = window.BABYLON.Vector3.TransformCoordinates(
                        stateVariables.slideDirectionIntentLocal, mat).normalize();
                    stateVariables.slideDirectionIntentLocal.set(0, 0, 0);
                } else {
                    initialSlideDir = forwardWorld.normalizeToNew();
                }

                let calcSpeed = constants.runSpeed;
                if (stateVariables.fallStartY !== null) {
                    const landY = characterController.getPosition().y;
                    const fallDist = Math.max(0, stateVariables.fallStartY - landY);

                    if (fallDist > constants.minFallDistanceForBoost) {
                        const raw = constants.runSpeed + (Math.sqrt(fallDist) * constants.fallDistanceToSpeedScale);
                        const clamped = Math.min(raw, constants.maxSlideSpeedFromFall);
                        const horizSpeed = new window.BABYLON.Vector3(currentVelocity.x, 0, currentVelocity.z).length();
                        calcSpeed = window.BABYLON.Scalar.Lerp(horizSpeed, clamped, 0.5);
                        calcSpeed = Math.max(calcSpeed, constants.runSpeed);
                        calcSpeed = Math.min(calcSpeed, constants.maxSlideSpeedFromFall);
                    }
                }

                stateVariables.slideVelocity.copyFrom(initialSlideDir.scale(calcSpeed));
                stateVariables.slideVelocity.y = currentVelocity.y;
                stateVariables.justLandedIntoSlide = false;
                updateVisualState();
                return stateVariables.slideVelocity.clone();
            }

            // ── Static crouch slide init ──────────────────────────────────────
            const justStartedStatic = (previousFrameState === "ON_GROUND" && currentFrameState === "SLIDING");
            if (justStartedStatic && stateVariables.slideVelocity.lengthSquared() >
                constants.staticSlideVelocityThreshold * constants.staticSlideVelocityThreshold) {
                stateVariables.slideVelocity.y = currentVelocity.y;
                return stateVariables.slideVelocity.clone();
            }

            // ── Terminate: key released ───────────────────────────────────────
            const crouchHeld = stateVariables.isSlidingKeyDown || stateVariables.pressedKeys.has('c');
            if (!crouchHeld) {
                stateVariables.state = "ON_GROUND";
                stateVariables.isCrouching = false;
                updateVisualState();
                stateVariables.slideVelocity.set(0, 0, 0);
                return _calculateDesiredVelocity(deltaTime, supportInfo, characterOrientation, currentVelocity,
                    stateVariables, constants, characterController, getNextState, updateVisualState, logDebug);
            }

            // ── Normal sliding frame ──────────────────────────────────────────
            // Slope acceleration: project gravity onto the slope plane
            let sN = supportInfo.averageSurfaceNormal || upWorld;
            if (sN.lengthSquared() < 0.0001) sN = upWorld;
            
            const gravProj = constants.characterGravity.subtract(
                sN.scale(window.BABYLON.Vector3.Dot(constants.characterGravity, sN) / sN.lengthSquared())
            );
            const slopeAccelMag = gravProj.length();
            if (slopeAccelMag > 0.01) {
                const slopeDir = gravProj.normalize();
                const slopeContrib = slopeDir.scale(slopeAccelMag * constants.slopeSlideAccelerationScale * deltaTime);
                stateVariables.slideVelocity.addInPlace(slopeContrib);
            }

            // Friction
            let hVel = new window.BABYLON.Vector3(stateVariables.slideVelocity.x, 0, stateVariables.slideVelocity.z);
            if (hVel.length() > 0.01) {
                const frictionMult = Math.pow(constants.slideFriction, deltaTime * 60);
                hVel.scaleInPlace(frictionMult);
                // Clamp to max slope speed
                const hSpeed = hVel.length();
                if (hSpeed > constants.maxSlopeSlideSpeed) {
                    hVel.normalize().scaleInPlace(constants.maxSlopeSlideSpeed);
                }
                stateVariables.slideVelocity.x = hVel.x;
                stateVariables.slideVelocity.z = hVel.z;
            }

            const currentHorizSpeed = new window.BABYLON.Vector3(stateVariables.slideVelocity.x, 0, stateVariables.slideVelocity.z).length();

            // Terminate: low speed
            if (currentHorizSpeed < constants.slideMinSpeed) {
                stateVariables.state = "ON_GROUND";
                stateVariables.isCrouching = true;
                updateVisualState();
                stateVariables.slideVelocity.set(0, 0, 0);
                return _calculateDesiredVelocity(deltaTime, supportInfo, characterOrientation, currentVelocity,
                    stateVariables, constants, characterController, getNextState, updateVisualState, logDebug);
            }

            stateVariables.slideVelocity.y = currentVelocity.y;
            return stateVariables.slideVelocity.clone();
        }

        // ══════════════════════════════════════════════════════════════════════
        case "IN_AIR": {

            // ── B-Hop detection: just transitioned from ground and bHopTimer is live ──
            if (previousFrameState !== "IN_AIR" && stateVariables.bHopTimer > 0 && stateVariables.wantBHop) {
                stateVariables.wantBHop = false;
                // Horizontal momentum carry with boost
                const horizVel = new window.BABYLON.Vector3(currentVelocity.x, 0, currentVelocity.z);
                const horizSpeed = horizVel.length();
                if (horizSpeed > 0.1) {
                    const boosted = Math.min(horizSpeed * constants.bHopBoostFactor, constants.bHopMaxChainSpeed);
                    const boostDir = horizVel.normalize().scaleInPlace(boosted);
                    const jumpSpeed = Math.sqrt(2 * constants.characterGravity.length() * constants.jumpHeight);
                    outputVelocity = new window.BABYLON.Vector3(boostDir.x, jumpSpeed, boostDir.z);
                    return outputVelocity;
                }
            }

            // ── Super Glide ───────────────────────────────────────────────────
            if (stateVariables.superGlideActive) {
                stateVariables.superGlideActive = false;
                const sgDir = new window.BABYLON.Vector3(forwardWorld.x, 0, forwardWorld.z).normalize();
                outputVelocity = sgDir.scale(constants.superGlideSpeed);
                outputVelocity.y = Math.sqrt(2 * constants.characterGravity.length() * constants.jumpHeight * 0.5);
                return outputVelocity;
            }

            // ── Tap Strafe ────────────────────────────────────────────────────
            const horizCurrent = new window.BABYLON.Vector3(currentVelocity.x, 0, currentVelocity.z);
            const horizCurrentSpeed = horizCurrent.length();

            let desiredAirVelocity = stateVariables.inputDirection.scale(constants.inAirSpeed);
            desiredAirVelocity = window.BABYLON.Vector3.TransformCoordinates(desiredAirVelocity, m);

            // Detect a tap strafe (sign flip on lateral input above min speed)
            const lastX = stateVariables.lastInputDir ? stateVariables.lastInputDir.x : 0;
            const currX = stateVariables.inputDirection.x;
            const tapStrafed = (lastX !== 0 && currX !== 0 && Math.sign(lastX) !== Math.sign(currX))
                && horizCurrentSpeed > constants.tapStrafeMinSpeed;

            if (tapStrafed) {
                // Apply a burst in the new lateral direction
                const rightWorld = window.BABYLON.Vector3.Cross(upWorld, forwardWorld).normalize();
                const burstDir = rightWorld.scale(currX); // +1 = right, -1 = left
                const addSpeed = Math.min(constants.tapStrafeMaxAdd, constants.tapStrafeAirAccel * deltaTime);
                const tapImpulse = burstDir.scale(addSpeed);

                outputVelocity = characterController.calculateMovement(
                    deltaTime, forwardWorld, upWorld, currentVelocity,
                    window.BABYLON.Vector3.Zero(), desiredAirVelocity, upWorld
                );
                outputVelocity.addInPlace(tapImpulse);
            } else {
                outputVelocity = characterController.calculateMovement(
                    deltaTime, forwardWorld, upWorld, currentVelocity,
                    window.BABYLON.Vector3.Zero(), desiredAirVelocity, upWorld
                );
            }

            // Wall Bounce: detect if horizontal velocity flipped from last frame (collision)
            if (stateVariables.lastHorizVelWorld) {
                const lastH = stateVariables.lastHorizVelWorld;
                const curH = new window.BABYLON.Vector3(currentVelocity.x, 0, currentVelocity.z);
                const lastHLen = lastH.length();
                const curHLen = curH.length();
                if (lastHLen > 0.1 && curHLen > 0.1) {
                    const dotPrev = window.BABYLON.Vector3.Dot(lastH.normalizeToNew(), curH.normalizeToNew());
                    // If dot < -0.3, velocity reversed → likely hit a wall
                    if (dotPrev < -0.3 && curHLen > constants.wallBounceMinSpeed) {
                        stateVariables.wallBounceTimer = constants.wallBounceWindow;
                        stateVariables.wallBouncePreVel = lastH.clone();
                    }
                }
            }
            stateVariables.lastHorizVelWorld = new window.BABYLON.Vector3(currentVelocity.x, 0, currentVelocity.z);

            // Apply gravity
            outputVelocity.addInPlace(constants.characterGravity.scale(deltaTime));

            // Update lastInputDir for next frame tap-strafe detection
            stateVariables.lastInputDir = stateVariables.inputDirection.clone();

            return outputVelocity;
        }

        // ══════════════════════════════════════════════════════════════════════
        case "START_JUMP": {

            // ── Wall Bounce Jump ──────────────────────────────────────────────
            if (stateVariables.wallBounceTimer > 0 && stateVariables.wallBouncePreVel) {
                stateVariables.wallBounceTimer = 0;
                // Redirect momentum 90° from the collision (perpendicular to wall)
                const preH = stateVariables.wallBouncePreVel;
                const preHLen = preH.length();
                const perpH = window.BABYLON.Vector3.Cross(upWorld, preH.normalizeToNew()).normalizeToNew(); // 90° turn
                const bounceSpeed = preHLen * constants.wallBounceBoostFactor;
                const jumpSpd = Math.sqrt(2 * constants.characterGravity.length() * constants.jumpHeight);
                stateVariables.wallBouncePreVel = null;
                return new window.BABYLON.Vector3(
                    perpH.x * bounceSpeed, jumpSpd, perpH.z * bounceSpeed
                );
            }

            // ── Super Glide trigger ───────────────────────────────────────────
            if (stateVariables.superGlideTimer > 0) {
                stateVariables.superGlideActive = true;
                stateVariables.superGlideTimer = 0;
            }

            // ── Standard jump with B-Hop check ───────────────────────────────
            const effectiveJumpHeight = stateVariables.isSprinting
                ? constants.sprintJumpHeight
                : constants.jumpHeight;

            const jumpSpeed = Math.sqrt(2 * constants.characterGravity.length() * effectiveJumpHeight);
            const currentUpVel = currentVelocity.dot(upWorld);
            const impulseMag = Math.max(0, jumpSpeed - currentUpVel);
            const vertImpulse = upWorld.scale(impulseMag);

            let finalJumpVel = currentVelocity.clone();
            finalJumpVel.addInPlace(vertImpulse);

            // Slide jump forward boost
            if (stateVariables.jumpedFromSlide) {
                const boostMag = constants.runSpeed * (constants.slideJumpForwardBoostFactor - 1.0);
                finalJumpVel.addInPlace(forwardWorld.normalizeToNew().scale(boostMag));
            }

            return finalJumpVel;
        }

        // ══════════════════════════════════════════════════════════════════════
        default:
            return currentVelocity.add(constants.characterGravity.scale(deltaTime));
    }
}

return { _calculateDesiredVelocity };