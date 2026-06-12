const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/World888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
const { CameraLogic } = await dc.require(folderPath + "/src/CameraLogic.js");
const { createConstants } = await dc.require(folderPath + "/src/CharacterConstants.js");
const { _calculateDesiredVelocity } = await dc.require(folderPath + "/src/CharacterVelocity.js");

// --- Input Modules ---

function setupBasicMovementInput(stateVariables, logDebug) {
    logDebug("[InputMod:Move]", "Init");
    const keys = { w: [0,0,1], arrowup: [0,0,1], s: [0,0,-1], arrowdown: [0,0,-1], a: [-1,0,0], arrowleft: [-1,0,0], d: [1,0,0], arrowright: [1,0,0] };
    function getLocalDirectionForKey(key) { const dir = keys[key]; return dir ? new window.BABYLON.Vector3(...dir) : null; }
    function updateSlideIntentIfNeeded(source) {
        const isAirborne = stateVariables.state === "IN_AIR" || stateVariables.state === "START_JUMP";
        const mightSlide = stateVariables.wantSlideOnLand || (isAirborne && stateVariables.isCrouching);
        if (isAirborne && mightSlide) {
            if (stateVariables.inputDirection.lengthSquared() > 0.01) {
                const previousIntentStr = stateVariables.slideDirectionIntentLocal.toString();
                stateVariables.slideDirectionIntentLocal.copyFrom(stateVariables.inputDirection).normalize();
                if(previousIntentStr !== stateVariables.slideDirectionIntentLocal.toString()) logDebug("[CharSlide]", `(${source}) Updated mid-air slide intent: ${stateVariables.slideDirectionIntentLocal.toString()}`);
            } else if (stateVariables.slideDirectionIntentLocal.lengthSquared() > 0) {
                stateVariables.slideDirectionIntentLocal.set(0, 0, 0);
                logDebug("[CharSlide]", `(${source}) Cleared mid-air slide intent (no WASD held).`);
            }
        }
    }
    function handleKeyDown(key) {
        const localDir = getLocalDirectionForKey(key); if (!localDir) return false;
        switch (key) { case 'w': case 'arrowup': stateVariables.inputDirection.z = 1; break; case 's': case 'arrowdown': stateVariables.inputDirection.z = -1; break; case 'a': case 'arrowleft': stateVariables.inputDirection.x = -1; break; case 'd': case 'arrowright': stateVariables.inputDirection.x = 1; break; }
        logDebug("[InputMod:Move]", `Down: ${key}. Dir: ${stateVariables.inputDirection.toString()}`);
        updateSlideIntentIfNeeded(`KeyDown:${key}`);
        return true;
    }
    function handleKeyUp(key) {
        const dir = keys[key]; if (!dir) return false;
        switch (key) { case 'w': case 'arrowup': if (stateVariables.inputDirection.z === 1) stateVariables.inputDirection.z = 0; break; case 's': case 'arrowdown': if (stateVariables.inputDirection.z === -1) stateVariables.inputDirection.z = 0; break; case 'a': case 'arrowleft': if (stateVariables.inputDirection.x === -1) stateVariables.inputDirection.x = 0; break; case 'd': case 'arrowright': if (stateVariables.inputDirection.x === 1) stateVariables.inputDirection.x = 0; break; }
        logDebug("[InputMod:Move]", `Up: ${key}. Dir: ${stateVariables.inputDirection.toString()}`);
        updateSlideIntentIfNeeded(`KeyUp:${key}`);
        return true;
    }
    function resetInput() {
        if (stateVariables.inputDirection.x !== 0 || stateVariables.inputDirection.z !== 0) { logDebug("[InputMod:Move]", "Resetting input dir."); stateVariables.inputDirection.set(0, 0, 0); }
        if (stateVariables.slideDirectionIntentLocal.lengthSquared() > 0) { logDebug("[InputMod:Move]", "Resetting slide intent."); stateVariables.slideDirectionIntentLocal.set(0, 0, 0); }
    }
    return { handleKeyDown, handleKeyUp, resetInput };
}

function setupJumpInput(stateVariables, attemptJumpTrigger, logDebug) {
    logDebug("[InputMod:Jump]", "Init"); const isMac = navigator.platform.toUpperCase().includes('MAC');
    function handleKeyDown(key) { if (key === ' ' || key === 'j') { logDebug("[CharJump]", `${key === ' ' ? 'Space' : 'J'} pressed. Held(Before): ${stateVariables.isJumpKeyHeld}`); attemptJumpTrigger(key === ' ' ? 'SpaceKey' : 'JKey'); stateVariables.isJumpKeyHeld = true; return true; } return false; }
    function handleKeyUp(key) { if (key === ' ' || key === 'j') { logDebug("[CharJump]", `${key === ' ' ? 'Space' : 'J'} released. Held=false`); stateVariables.isJumpKeyHeld = false; return true; } return false; }
    function handlePointerEvent(pointerInfo) { if (pointerInfo.type === window.BABYLON.PointerEventTypes.POINTERWHEEL) { const event = pointerInfo.event; const scrollDown = isMac ? (event.deltaY < 0) : (event.deltaY > 0); if (scrollDown) { logDebug("[CharInput]", `Scroll Down Detected.`); if (event && typeof event.preventDefault === 'function') event.preventDefault(); const canJump = (stateVariables.state === "ON_GROUND" || stateVariables.state === "SLIDING" || stateVariables.justLanded); if (canJump && !stateVariables.wantJump) { logDebug("[CharInput]", `>> Triggering jump via scroll.`); attemptJumpTrigger(`MouseScrollDown`); } else { logDebug("[CharInput]", `>> Scroll jump ignored.`); } return true; } } return false; }
    function resetInput() { if (stateVariables.wantJump || stateVariables.isJumpKeyHeld) { logDebug("[InputMod:Jump]", "Resetting jump state."); stateVariables.wantJump = false; stateVariables.isJumpKeyHeld = false; } }
    return { handleKeyDown, handleKeyUp, handlePointerEvent, resetInput };
}

function setupSprintInput(stateVariables, logDebug) {
    logDebug("[InputMod:Sprint]", "Init");
    function handleKeyDown(key) { if (key === 'shift') { if (!stateVariables.isShiftPressed) logDebug("[CharSprint]", `Shift pressed.`); stateVariables.isShiftPressed = true; return true; } return false; }
    function handleKeyUp(key) { if (key === 'shift') { if (stateVariables.isShiftPressed) logDebug("[CharSprint]", `Shift released.`); stateVariables.isShiftPressed = false; return true; } return false; }
    function resetInput() { if (stateVariables.isShiftPressed) { logDebug("[InputMod:Sprint]", "Resetting sprint key."); stateVariables.isShiftPressed = false; } stateVariables.isSprinting = false; }
    return { handleKeyDown, handleKeyUp, resetInput };
}

function setupCrouchSlideInput(stateVariables, characterController, constants, updateVisualState, logDebug) {
    logDebug("[InputMod:CrouchSlide]", "Init");
    const isCrouchKey = (key) => key === 'c' || key === 'control';
    function handleKeyDown(key) {
        const isMovementKey = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key);
        const crouchKey = isCrouchKey(key);

        if (isMovementKey && stateVariables.state === "ON_GROUND" && stateVariables.isCrouching && characterController.getVelocity().lengthSquared() < constants.staticSlideVelocityThreshold) {
            const canSprintSlide = (stateVariables.isSprinting || (stateVariables.isShiftPressed && stateVariables.inputDirection.z > 0)) && stateVariables.inputDirection.lengthSquared() > 0.1;
            if (!canSprintSlide) {
                 logDebug("[CharSlide]", `Static crouch + move key '${key}' -> slide.`); stateVariables.state = "SLIDING"; stateVariables.isSprinting = false;
                 const m = new window.BABYLON.Matrix(); stateVariables.characterTargetOrientation.toRotationMatrix(m);
                 const slideDirWorld = window.BABYLON.Vector3.TransformCoordinates(stateVariables.inputDirection.normalizeToNew(), m);
                 stateVariables.slideVelocity.copyFrom(slideDirWorld.scale(constants.runSpeed * constants.slideInitialBoost));
                 logDebug("[CharSlide]", ` >> Static slide boost velocity set in input handler: ${stateVariables.slideVelocity.toString()}`);
                 updateVisualState(); return true;
            }
        }

        if (!crouchKey) return false;
        const isToggleKey = (key === 'c');
        logDebug("[CharCrouch/Slide]", `${key} pressed. State: ${stateVariables.state}, WantSlide: ${stateVariables.wantSlideOnLand}`);
        if (!isToggleKey) stateVariables.isSlidingKeyDown = true;

        const canSprintSlide = stateVariables.state === "ON_GROUND" && (stateVariables.isSprinting || (stateVariables.isShiftPressed && stateVariables.inputDirection.z > 0)) && stateVariables.inputDirection.lengthSquared() > 0.1;
        if (canSprintSlide) {
            logDebug("[CharSlide]", `Sprint-Slide initiated by '${key}'.`); stateVariables.state = "SLIDING"; stateVariables.isCrouching = true; stateVariables.isSprinting = false;
            stateVariables.slideVelocity.copyFrom(characterController.getVelocity());
            const m = new window.BABYLON.Matrix(); stateVariables.characterTargetOrientation.toRotationMatrix(m);
            const fwdWorld = window.BABYLON.Vector3.TransformCoordinates(constants.forwardLocalSpace, m);
            stateVariables.slideVelocity.addInPlace(fwdWorld.scale(constants.runSpeed * (constants.slideInitialBoost - 1.0)));
            logDebug("[CharSlide]", ` >> Sprint slide boost velocity set in input handler: ${stateVariables.slideVelocity.toString()}`);
            updateVisualState();
        } else if (stateVariables.state === "IN_AIR" || stateVariables.state === "START_JUMP") {
            logDebug("[CharCrouch/Slide]", `Key '${key}' mid-air -> wantSlideOnLand=true.`); stateVariables.wantSlideOnLand = true;
            if (stateVariables.inputDirection.lengthSquared() > 0.01) {
                stateVariables.slideDirectionIntentLocal.copyFrom(stateVariables.inputDirection).normalize();
                logDebug("[CharSlide]", `Captured mid-air slide intent (from crouch press: ${key}): ${stateVariables.slideDirectionIntentLocal.toString()}`);
            } else if (stateVariables.slideDirectionIntentLocal.lengthSquared() < 0.01) {
                 logDebug("[CharSlide]", `No WASD held on mid-air crouch press (${key}). Slide intent remains zero.`);
                 stateVariables.slideDirectionIntentLocal.set(0,0,0); // Ensure it's zero if no input
            }
            if (!stateVariables.isCrouching) { stateVariables.isCrouching = true; logDebug("[CharCrouch]", `Visually crouching mid-air.`); updateVisualState(); }
        } else if (stateVariables.state === "ON_GROUND") {
            if (isToggleKey) {
                if (!stateVariables.isCrouching) { stateVariables.isCrouching = true; logDebug("[CharCrouch]", `Toggle Crouch ON ('c').`); updateVisualState(); }
                else if (!stateVariables.pressedKeys.has('control')) { stateVariables.isCrouching = false; logDebug("[CharCrouch]", `Toggle Crouch OFF ('c').`); updateVisualState(); }
            } else {
                 if (!stateVariables.isCrouching) { stateVariables.isCrouching = true; logDebug("[CharCrouch]", `Holding Control.`); updateVisualState(); }
            }
        }
        return true;
    }
    function handleKeyUp(key) {
        if (!isCrouchKey(key)) return false;
        const isToggleKey = (key === 'c');
        const isAirborneBeforeStandCheck = stateVariables.state === "IN_AIR" || stateVariables.state === "START_JUMP";
        let stoodUpMidAir = false;

        if (isToggleKey) {
            logDebug("[CharCrouch]", "'c' released.");
            // Toggle key ('c') does not un-crouch on release. Un-crouch is handled on the next key press.
        } else {
            logDebug("[CharCrouch/Slide]", `Control released.`); stateVariables.isSlidingKeyDown = false;
            // Uncrouch if 'control' is released, even if currently sliding (which cancels the slide)
            if (stateVariables.isCrouching && !stateVariables.pressedKeys.has('c') && (stateVariables.state === "ON_GROUND" || isAirborneBeforeStandCheck || stateVariables.state === "SLIDING")) {
                 logDebug("[CharCrouch]", `Released Control, attempting to stand.`); stateVariables.isCrouching = false;
                 if(isAirborneBeforeStandCheck) {
                     logDebug("[CharSlide]", "Standing mid-air via Ctrl release, cancelling slide intent.");
                     stateVariables.wantSlideOnLand = false; stateVariables.slideDirectionIntentLocal.set(0,0,0); stoodUpMidAir = true;
                 }
                 updateVisualState();
            }
        }
        // Note: slideDirectionIntentLocal is updated by the basic movement handlers if still airborne+crouching/wanting slide
        return true;
    }
    function resetInput(keysBeforeClear = []) {
        logDebug("[InputMod:CrouchSlide]", "Resetting state.");
        stateVariables.wantSlideOnLand = false; stateVariables.justLandedIntoSlide = false; stateVariables.isSlidingKeyDown = false;
        if (stateVariables.slideDirectionIntentLocal.lengthSquared() > 0) {
             logDebug("[InputMod:CrouchSlide]", "Resetting slide intent."); stateVariables.slideDirectionIntentLocal.set(0, 0, 0);
        }
        if (stateVariables.state === "SLIDING") {
            stateVariables.state = "ON_GROUND"; stateVariables.slideVelocity.set(0, 0, 0);
            stateVariables.isCrouching = keysBeforeClear.includes('c') || keysBeforeClear.includes('control'); // Stay crouched if either was held
            updateVisualState();
        } else if (stateVariables.isCrouching) {
             // Stand up only if crouch was *only* initiated by the key released by the reset (e.g. tab)
             // and not maintained by another crouch key ('c' or 'control') that might still be conceptually held.
             // This logic gets complex with toggle ('c') vs hold ('control').
             // Simplification: If reset happens while crouching, check if 'c' or 'control' were held BEFORE reset.
             // If NEITHER were held before reset (unlikely but possible), stand up. More likely, we check if ONLY 'control' was held and reset clears it.
             const cHeldBefore = keysBeforeClear.includes('c');
             const ctrlHeldBefore = keysBeforeClear.includes('control');
             if (ctrlHeldBefore && !cHeldBefore) { // If only control was held, stand up on reset
                 stateVariables.isCrouching = false; updateVisualState();
                 logDebug("[InputMod:CrouchSlide]", "Standing up on reset (was holding only Ctrl).");
             } else {
                 logDebug("[InputMod:CrouchSlide]", `Staying crouched on reset (CtrlHeld:${ctrlHeldBefore}, CHeld:${cHeldBefore})`);
             }
        }
    }
    return { handleKeyDown, handleKeyUp, resetInput };
}


// --- Character Logic IIFE ---

const CharacterLogic = (() => {
    function setupInputHandling(scene, canvasRef, cameraControlsManager, stateVariables, characterController, constants, attemptJumpTrigger, updateVisualState, logDebug) {
        logDebug("[CharLogic:Input]", "Setup...");
        const movementInput = setupBasicMovementInput(stateVariables, logDebug);
        const jumpInput = setupJumpInput(stateVariables, attemptJumpTrigger, logDebug);
        const sprintInput = setupSprintInput(stateVariables, logDebug);
        const crouchSlideInput = setupCrouchSlideInput(stateVariables, characterController, constants, updateVisualState, logDebug);
        const inputModules = [movementInput, jumpInput, sprintInput, crouchSlideInput];

        function processKey(key, isDown) {
             if (!cameraControlsManager?.isPointerLocked()) return;
             const action = isDown ? 'Pressed' : 'Released';
             const changed = isDown ? !stateVariables.pressedKeys.has(key) : stateVariables.pressedKeys.delete(key);
             if (isDown && changed) stateVariables.pressedKeys.add(key);
             if (changed) logDebug("[KeyPress]", `${action}: ${key}. Held: ${Array.from(stateVariables.pressedKeys).join(',')}`);

             for (const module of inputModules) {
                 if (isDown ? module.handleKeyDown(key) : module.handleKeyUp(key)) return;
             }
        }

        function keyboardInputCallback(kbInfo) {
            const event = kbInfo.event;
            if (!event || !event.key) return;
            const key = event.key.toLowerCase();
            const actionKeys = ['w','s','a','d','arrowup','arrowdown','arrowleft','arrowright',' ','shift','j','c','control','tab'];

            if (kbInfo.type === window.BABYLON.KeyboardEventTypes.KEYDOWN && key === 'tab') {
                logDebug("[CharInput]", 'Tab pressed. Toggling camera/resetting input.'); 
                if (event && typeof event.preventDefault === 'function') event.preventDefault();
                if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                cameraControlsManager?.toggleCameraMode?.();
                const keysBeforeClear = Array.from(stateVariables.pressedKeys);
                stateVariables.pressedKeys.clear(); logDebug("[KeyPress]", `Keys cleared via tab. Were: ${keysBeforeClear.join(',')}`);
                inputModules.forEach(m => m.resetInput(keysBeforeClear));
                return;
            }

            if (actionKeys.includes(key) && key !== 'tab' && cameraControlsManager?.isPointerLocked()) {
                 if (event && typeof event.preventDefault === 'function') event.preventDefault();
                 if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
                 processKey(key, kbInfo.type === window.BABYLON.KeyboardEventTypes.KEYDOWN);
            }
        }
        function pointerInputCallback(pointerInfo) { if (cameraControlsManager?.isPointerLocked()) jumpInput.handlePointerEvent(pointerInfo); }

        logDebug("[CharLogic:Input]", "Registering observers...");
        const keyboardObserver = scene.onKeyboardObservable.add(keyboardInputCallback);
        const pointerObserver = scene.onPointerObservable.add(pointerInputCallback);
        if (canvasRef.current) canvasRef.current.tabIndex = 0;

        return { cleanup: () => { logDebug("[CharLogic:Input]", "Cleanup."); scene?.onKeyboardObservable.remove(keyboardObserver); scene?.onPointerObservable.remove(pointerObserver); } };
    }

    function setupEnvironment(scene, canvasRef) {
        //console.log("[CharacterLogic:Env]", "Setup...");
        const light = new window.BABYLON.HemisphericLight("light", new window.BABYLON.Vector3(0, 1, 0), scene); light.intensity = 0.8;
        const normalCharacterHeight = 1.8, characterRadius = 0.5, crouchCharacterHeight = normalCharacterHeight / 2;
        const charStartPos = new window.BABYLON.Vector3(-4.0, 33.0, -16.0);

        const displayCapsule = window.BABYLON.MeshBuilder.CreateCapsule("CharacterDisplay", { height: normalCharacterHeight, radius: characterRadius, subdivisions: 4, updatable: true }, scene);
        displayCapsule.position.copyFrom(charStartPos); displayCapsule.rotationQuaternion = window.BABYLON.Quaternion.Identity();
        displayCapsule.checkCollisions = false; displayCapsule.isPickable = false; displayCapsule.metadata = { baseHeight: normalCharacterHeight };

        const characterController = new window.BABYLON.PhysicsCharacterController(charStartPos, { capsuleHeight: normalCharacterHeight, capsuleRadius: characterRadius }, scene);
        //console.log("[CharacterLogic:Env]", "Setup complete.");
        return { light, displayCapsule, characterController, charStartPos, normalCharacterHeight, crouchCharacterHeight, characterRadius };
    }


    function setupMovementAndPhysicsUpdates(scene, camera, displayCapsule, characterController, cameraControlsManager, canvasRef, constants) {
        
        const ENABLE_ALL_DEBUG_LOGS = false; // Set to 'true' to enable logs, 'false' to disable all logDebug output

        
        function logDebug(prefix, message) {
            if (ENABLE_ALL_DEBUG_LOGS) { // If the master switch is off, return immediately
                const debugFlags = { "[CharJump]": constants.DEBUG_JUMP, "[CharSprint]": constants.DEBUG_SPRINT, "[CharCrouch]": constants.DEBUG_CROUCH, "[CharSlide]": constants.DEBUG_SLIDE };
                const shouldLog = debugFlags[prefix] || (prefix === "[CharJump/Slide]" && (constants.DEBUG_JUMP || constants.DEBUG_SLIDE)) || prefix.startsWith("[InputMod:") || prefix.startsWith("[CharLogic:") || prefix.startsWith("[CharState]") || prefix.startsWith("[KeyPress]") || prefix.startsWith("[CharLandCheck]");
                if (shouldLog) console.log(`${prefix} ${message}`);
            }
        }

        logDebug("[CharLogic:Movement]", "Setup...");
        const normalCharacterHeight = displayCapsule.metadata.baseHeight;
        const crouchCharacterHeight = normalCharacterHeight / 2;

        const stateVariables = {
            state: "IN_AIR", wantJump: false, isJumpKeyHeld: false, justLanded: false,
            isSprinting: false, isShiftPressed: false, isCrouching: false, isSlidingKeyDown: false,
            jumpedFromSlide: false,
            inputDirection: new window.BABYLON.Vector3(0, 0, 0),
            characterTargetOrientation: window.BABYLON.Quaternion.Identity(),
            slideVelocity: new window.BABYLON.Vector3(0, 0, 0), pressedKeys: new Set(),
            wantSlideOnLand: false, justLandedIntoSlide: false, slideDirectionIntentLocal: new window.BABYLON.Vector3(0, 0, 0),
            fallStartY: null, lastGroundY: null,
            // ── Apex mechanics ──────────────────────────────────────────────────
            bHopTimer:      0,     // Counts down after landing; jump in this window = bhop
            wantBHop:       false, // Set when jump is pressed while bHopTimer is live
            wallBounceTimer: 0,    // Window after wall collision for redirect-jump
            wallBouncePreVel: null,// Horizontal velocity captured just before wall hit
            superGlideTimer:  0,   // Window at peak of mantle for super-glide
            superGlideActive: false,
            landingShockTimer: 0,  // Remaining seconds of speed penalty after hard landing
            lastInputDir:     null,// For tap-strafe detection (prev frame input)
            lastHorizVelWorld: null,// For wall-bounce detection
            mantleTimer:      0,   // Tracks rapid Y-rise (mantle detection)
            lastPosY:         null, // For mantle peak detection
        };

        function updateVisualState() {
            const targetVisualHeight = stateVariables.isCrouching ? crouchCharacterHeight : normalCharacterHeight;
            const baseMeshHeight = displayCapsule.metadata.baseHeight || normalCharacterHeight;
            const targetScaleY = baseMeshHeight > 0.01 ? targetVisualHeight / baseMeshHeight : 1.0;
            if (Math.abs(displayCapsule.scaling.y - targetScaleY) > 0.01) {
                logDebug("[CharCrouch/Slide]", `Update visual scale. Crouch: ${stateVariables.isCrouching}, State: ${stateVariables.state}, TargetScaleY: ${targetScaleY.toFixed(2)}`);
                displayCapsule.scaling.y = targetScaleY;
            }
            const targetCameraOffset = stateVariables.isCrouching ? constants.crouchCameraOffsetY : constants.normalCameraOffsetY;
            cameraControlsManager?.setTargetOffsetY?.(targetCameraOffset);
        }

        function attemptJumpTrigger(triggerSource) {
            logDebug("[CharJump]", `Attempt via ${triggerSource}. State=${stateVariables.state}, Landed=${stateVariables.justLanded}, Crouch=${stateVariables.isCrouching}`);
            if (stateVariables.state === "ON_GROUND" || stateVariables.state === "SLIDING" || stateVariables.justLanded) {
                stateVariables.wantJump = true;
                logDebug("[CharJump]", `  >> Set wantJump = true`);
                const canSprintJump = stateVariables.isShiftPressed && stateVariables.inputDirection.z > 0 && !stateVariables.isCrouching && stateVariables.state !== "SLIDING";
                stateVariables.isSprinting = canSprintJump;
            } else if (stateVariables.state === "IN_AIR") {
                // B-Hop: player pressed jump while in air — flag it so velocity calc can use it on next landing frame
                if (stateVariables.bHopTimer > 0) {
                    stateVariables.wantBHop = true;
                    logDebug("[CharJump]", `  >> B-Hop armed (timer=${stateVariables.bHopTimer.toFixed(3)})`);
                }
                // Wall Bounce: player pressed jump during wall-bounce window
                if (stateVariables.wallBounceTimer > 0) {
                    stateVariables.wantJump = true;
                    logDebug("[CharJump]", `  >> Wall Bounce jump triggered!`);
                }
                // Super Glide: player pressed jump during mantle peak window
                if (stateVariables.superGlideTimer > 0) {
                    stateVariables.wantJump = true;
                    logDebug("[CharJump]", `  >> Super Glide triggered!`);
                }
            } else {
                logDebug("[CharJump]", `  >> Not setting wantJump.`);
            }
        }

        function getNextState(supportInfo) {
            const isOnGroundOrJustLanded = supportInfo.supportedState === window.BABYLON.CharacterSupportedState.SUPPORTED;
            const previousState = stateVariables.state;
            let nextState = previousState;

            const transitionToAirborne = (reason) => {
                if (previousState !== "IN_AIR") logDebug("[CharState]", `Transition ${previousState} -> IN_AIR (${reason}).`);
                nextState = "IN_AIR";
                if (previousState !== "IN_AIR" && stateVariables.lastGroundY !== null) { stateVariables.fallStartY = stateVariables.lastGroundY; if (previousState !== "START_JUMP") logDebug("[CharState]", `  Set fallStartY=${stateVariables.fallStartY.toFixed(2)} (from lastGroundY)`);
                } else if (stateVariables.fallStartY === null) { stateVariables.fallStartY = characterController.getPosition().y; logDebug("[CharState]", `  Set fallStartY=${stateVariables.fallStartY.toFixed(2)} (current pos)`); }
                if (reason === 'FellOffEdge' && !stateVariables.wantSlideOnLand && !stateVariables.isCrouching) { // Clear intent only if not actively holding crouch mid-air
                     if (stateVariables.slideDirectionIntentLocal.lengthSquared() > 0) { stateVariables.slideDirectionIntentLocal.set(0, 0, 0); logDebug("[CharSlide]", "  Reset slide direction intent (fell off edge without crouch held)."); }
                }
            };

            switch (previousState) {
                case "IN_AIR":
                    if (isOnGroundOrJustLanded) {
                        stateVariables.justLanded = true; stateVariables.isSprinting = false;
                        const landingY = characterController.getPosition().y;
                        const fallDistance = stateVariables.fallStartY !== null ? Math.max(0, stateVariables.fallStartY - landingY) : 0;
                        const isHoldingCrouchKey = stateVariables.pressedKeys.has('c') || stateVariables.isSlidingKeyDown;
                        const hasDirectionIntent = stateVariables.slideDirectionIntentLocal.lengthSquared() > 0.01;
                        const wantsSlideIntentFlag = stateVariables.wantSlideOnLand;
                        const wasJumpFromSlide = stateVariables.jumpedFromSlide;

                        logDebug("[CharLandCheck]", `Landing. FallDist: ${fallDistance.toFixed(3)}, CrouchHeld: ${isHoldingCrouchKey}, HasDirIntent: ${hasDirectionIntent}, WantsSlideFlag: ${wantsSlideIntentFlag}, JumpedFromSlide: ${wasJumpFromSlide}`);

                        let slideInitiated = false;
                        if (wantsSlideIntentFlag && hasDirectionIntent) { logDebug("[CharState]", ` -> Decision: SLIDE (Mid-air crouch intent 'wantSlideOnLand' + Direction)`); nextState = "SLIDING"; slideInitiated = true;
                        } else if (wasJumpFromSlide && isHoldingCrouchKey) { logDebug("[CharState]", ` -> Decision: SLIDE (Jumped from slide + Crouch held)`); nextState = "SLIDING"; slideInitiated = true;
                        } else if (isHoldingCrouchKey && fallDistance > constants.minFallDistanceForBoost) { logDebug("[CharState]", ` -> Decision: SLIDE (Automatic fall boost + Crouch held)`); nextState = "SLIDING"; slideInitiated = true;
                        } else if (wantsSlideIntentFlag && !hasDirectionIntent && isHoldingCrouchKey) { logDebug("[CharState]", ` -> Decision: SLIDE (Mid-air crouch intent 'wantSlideOnLand' but no Dir, Crouch held)`); nextState = "SLIDING"; slideInitiated = true; // Slide forward if no intent specified but wanted slide
                        } else {
                            logDebug("[CharState]", ` -> Decision: NORMAL LANDING (ON_GROUND)`); nextState = "ON_GROUND";
                            stateVariables.isCrouching = isHoldingCrouchKey; stateVariables.justLandedIntoSlide = false;
                            if (hasDirectionIntent) { stateVariables.slideDirectionIntentLocal.set(0, 0, 0); logDebug("[CharSlide]", ` Cleared slide intent on normal landing.`); } // Clear intent if landing normally
                        }

                        if (slideInitiated) {
                            stateVariables.isCrouching = true; stateVariables.justLandedIntoSlide = true;
                            logDebug("[CharState]", "   (Setting justLandedIntoSlide = true)");
                            // If slide initiated WITHOUT specific direction intent, default to forward AFTER this state check
                            if (!hasDirectionIntent && stateVariables.slideDirectionIntentLocal.lengthSquared() < 0.01) {
                                logDebug("[CharSlide]", "   No specific intent for landing slide, will use forward/impact.");
                                // _calculateDesiredVelocity should handle defaulting direction now
                            }
                        }

                        stateVariables.fallStartY = null; stateVariables.lastGroundY = null;
                        stateVariables.wantSlideOnLand = false; stateVariables.jumpedFromSlide = false;

                        // ── B-Hop: open the window on every landing ──────────────────────
                        stateVariables.bHopTimer = constants.bHopWindow;
                        stateVariables.wantBHop = false;

                        // ── Landing Shock: penalise hard landings ────────────────────────
                        if (fallDistance >= constants.landingShockMinFall) {
                            stateVariables.landingShockTimer = constants.landingShockDuration;
                            logDebug("[CharLandCheck]", `Landing shock! Fall=${fallDistance.toFixed(1)}m, Duration=${constants.landingShockDuration}s`);
                        }

                        updateVisualState();
                    }
                    break;
                case "ON_GROUND":
                case "SLIDING":
                    stateVariables.justLanded = false; stateVariables.justLandedIntoSlide = false;
                    if (!isOnGroundOrJustLanded) { transitionToAirborne('FellOffEdge');
                    } else if (stateVariables.wantJump) {
                        logDebug("[CharJump]", `Jump Triggered from ${previousState}.`);
                        stateVariables.jumpedFromSlide = (previousState === "SLIDING");
                        logDebug("[CharJump]", `   (Setting jumpedFromSlide = ${stateVariables.jumpedFromSlide})`);
                        nextState = "START_JUMP";
                    } else if (previousState === "SLIDING" && !stateVariables.isCrouching) { // Added: Exit slide if no longer crouching
                        logDebug("[CharState]", `Exiting SLIDE state because no longer crouching.`);
                        nextState = "ON_GROUND";
                        stateVariables.slideVelocity.set(0,0,0);
                    }
                    break;
                case "START_JUMP":
                    stateVariables.justLanded = false; stateVariables.justLandedIntoSlide = false; stateVariables.wantJump = false;
                    transitionToAirborne('Jump');
                    break;
                default:
                    console.warn("[CharState] Unknown state:", previousState, "-> Resetting to IN_AIR"); nextState = "IN_AIR";
                    Object.assign(stateVariables, { wantSlideOnLand: false, justLandedIntoSlide: false, slideDirectionIntentLocal: new window.BABYLON.Vector3(0,0,0), isCrouching: false, fallStartY: null, lastGroundY: null, justLanded: false, jumpedFromSlide: false, wantJump: false, isSlidingKeyDown: false });
                    updateVisualState();
                    break;
            }

            if (nextState !== previousState) { logDebug("[CharState]", `Applied: ${previousState} -> ${nextState}`); stateVariables.state = nextState; }
        }

        function physicsUpdateCallback() {
            if (!scene?.deltaTime || !cameraControlsManager?.isPointerLocked()) return;
            const dt = Math.min(scene.deltaTime / 1000.0, 0.033);

            window.BABYLON.Quaternion.FromEulerAnglesToRef(0, camera.rotation.y, 0, stateVariables.characterTargetOrientation);

            const support = characterController.checkSupport(dt, constants.characterGravity.normalizeToNew());
            const currentVelocity = characterController.getVelocity();
            const currentPos = characterController.getPosition();

            // Track last ground Y
            if ((stateVariables.state === "ON_GROUND" || stateVariables.state === "SLIDING") &&
                support.supportedState === window.BABYLON.CharacterSupportedState.SUPPORTED) {
                stateVariables.lastGroundY = currentPos.y;
            }

            // ── B-Hop window countdown (starts when landing, counts down in air) ──
            if (stateVariables.bHopTimer > 0) {
                stateVariables.bHopTimer = Math.max(0, stateVariables.bHopTimer - dt);
                if (stateVariables.bHopTimer <= 0) stateVariables.wantBHop = false;
            }

            // ── Wall-bounce window countdown ──────────────────────────────────
            if (stateVariables.wallBounceTimer > 0) {
                stateVariables.wallBounceTimer = Math.max(0, stateVariables.wallBounceTimer - dt);
                if (stateVariables.wallBounceTimer <= 0) stateVariables.wallBouncePreVel = null;
            }

            // ── Super-glide mantle detection ──────────────────────────────────
            // Detect a rapid Y rise while supported (= ledge step-up / mantle)
            const isSupported = support.supportedState === window.BABYLON.CharacterSupportedState.SUPPORTED;
            if (isSupported && stateVariables.lastPosY !== null) {
                const yRise = currentPos.y - stateVariables.lastPosY;
                const riseThreshold = 0.08 * dt * 60; // ~0.08 m per frame at 60 fps = ~4.8 m/s rise
                if (yRise > riseThreshold) {
                    // Rapid rise: set mantle timer
                    stateVariables.mantleTimer = 0.25; // 250ms mantle window
                }
            }
            stateVariables.lastPosY = currentPos.y;

            // Super glide: at peak of mantle (mantleTimer counting down, Y vel near 0)
            if (stateVariables.mantleTimer > 0) {
                stateVariables.mantleTimer = Math.max(0, stateVariables.mantleTimer - dt);
                const upVel = currentVelocity.y;
                if (Math.abs(upVel) < 0.5 && stateVariables.state !== "ON_GROUND") {
                    // Near peak — open super-glide window
                    stateVariables.superGlideTimer = constants.superGlideWindow;
                    stateVariables.mantleTimer = 0;
                }
            }
            if (stateVariables.superGlideTimer > 0) {
                stateVariables.superGlideTimer = Math.max(0, stateVariables.superGlideTimer - dt);
            }

            // ── Landing shock: triggered in getNextState on hard landings ─────
            // (landingShockTimer is decremented inside _calculateDesiredVelocity ON_GROUND case)

            const desiredLinearVelocity = _calculateDesiredVelocity(
                dt, support, stateVariables.characterTargetOrientation, currentVelocity,
                stateVariables, constants, characterController, getNextState,
                updateVisualState, logDebug
            );

            characterController.setVelocity(desiredLinearVelocity);
            characterController.integrate(dt, support, constants.characterGravity);
        }

        function renderUpdateCallback() {
            physicsUpdateCallback(); // Run logic in render loop to match monitor Hz

            const currentControllerPos = characterController.getPosition();
            const physicsHeight = normalCharacterHeight;
            const visualHeight = (displayCapsule.metadata.baseHeight || normalCharacterHeight) * displayCapsule.scaling.y;
            const controllerBottomY = currentControllerPos.y - (physicsHeight / 2);
            const targetVisualCenterY = controllerBottomY + (visualHeight / 2);

            displayCapsule.position.set(currentControllerPos.x, targetVisualCenterY, currentControllerPos.z);

            if (!displayCapsule.rotationQuaternion) displayCapsule.rotationQuaternion = window.BABYLON.Quaternion.Identity();
            window.BABYLON.Quaternion.SlerpToRef(displayCapsule.rotationQuaternion, stateVariables.characterTargetOrientation, constants.turnSpeed, displayCapsule.rotationQuaternion);
        }

        logDebug("[CharLogic:Movement]", "Registering observers...");
        // Insert first so Character updates BEFORE Camera, eliminating the 1-frame camera tracking lag
        const renderObserver = scene.onBeforeRenderObservable.add(renderUpdateCallback, undefined, true);
        const inputHandler = setupInputHandling(scene, canvasRef, cameraControlsManager, stateVariables, characterController, constants, attemptJumpTrigger, updateVisualState, logDebug);
        if (!inputHandler) return null;

        updateVisualState();

        const controlAPI = {
            isOnGround: () => stateVariables.state === "ON_GROUND" || stateVariables.state === "SLIDING",
            checkGroundContact: () => characterController.checkSupport(0.001, constants.characterGravity.normalizeToNew()).supportedState === window.BABYLON.CharacterSupportedState.SUPPORTED,
            getCurrentState: () => stateVariables.state,
            getPressedKeys: () => Array.from(stateVariables.pressedKeys),
            getIsCrouching: () => stateVariables.isCrouching,
            getIsSliding: () => stateVariables.state === "SLIDING",
            controlState: {
                getState: () => stateVariables.state, isSprinting: () => stateVariables.isSprinting, isShiftPressed: () => stateVariables.isShiftPressed,
                isCrouching: () => stateVariables.isCrouching, isSliding: () => stateVariables.state === "SLIDING",
                inputDirection: () => stateVariables.inputDirection.clone(), getVelocity: () => characterController.getVelocity().clone()
            },
            cleanup: () => {
                 logDebug("[CharLogic:Movement]", "Cleanup...");
                 if (inputHandler && typeof inputHandler.cleanup === 'function') { try { inputHandler.cleanup(); } catch(e) { console.warn("[CharLogic:Movement] Error in input cleanup:", e); } }
                 try { if (scene && renderObserver) scene.onBeforeRenderObservable.remove(renderObserver); } catch(e) { console.warn("[CharLogic:Movement] Error removing render observer:", e); }
                 stateVariables.pressedKeys.clear();
                 logDebug("[CharLogic:Movement]", "Cleanup finished.");
            },
        };
        logDebug("[CharLogic:Movement]", "Setup complete.");
        return controlAPI;
    }

    function initialize(scene, canvasRef) {
        //console.log("[CharacterLogic] Initializing...");
        if (!scene || !canvasRef) { console.error("[CharacterLogic] Init failed: Scene or CanvasRef missing."); return null; }

        const env = setupEnvironment(scene, canvasRef);
        if (!env?.displayCapsule || !env?.characterController) { console.error("[CharacterLogic] Env setup failed."); if (env?.light && typeof env.light.dispose === 'function') env.light.dispose(); return null; }

        const constants = createConstants(env.normalCharacterHeight, env.crouchCharacterHeight, env.characterRadius);
        if(!constants) { console.error("[CharacterLogic] Failed to create constants."); if (env.characterController && typeof env.characterController.dispose === 'function') env.characterController.dispose(); if (env.displayCapsule && typeof env.displayCapsule.dispose === 'function') env.displayCapsule.dispose(); if (env.light && typeof env.light.dispose === 'function') env.light.dispose(); return null; }

        let cameraLogic = null;
        try { cameraLogic = CameraLogic.initialize(scene, canvasRef, env.displayCapsule, env.charStartPos); }
        catch (error) { console.error("[CharacterLogic] Error CameraLogic.initialize:", error); if (env.characterController && typeof env.characterController.dispose === 'function') env.characterController.dispose(); if (env.displayCapsule && typeof env.displayCapsule.dispose === 'function') env.displayCapsule.dispose(); if (env.light && typeof env.light.dispose === 'function') env.light.dispose(); return null; }

        if (!cameraLogic?.camera || !cameraLogic?.cameraControls) { console.error("[CharacterLogic] CRITICAL: CameraLogic init failed."); if (cameraLogic && typeof cameraLogic.cleanup === 'function') cameraLogic.cleanup(); if (env.characterController && typeof env.characterController.dispose === 'function') env.characterController.dispose(); if (env.displayCapsule && typeof env.displayCapsule.dispose === 'function') env.displayCapsule.dispose(); if (env.light && typeof env.light.dispose === 'function') env.light.dispose(); return null; }
        //console.log("[CharacterLogic] CameraLogic initialized.");
        if (scene.activeCamera !== cameraLogic.camera) scene.activeCamera = cameraLogic.camera;

        const movementComponents = setupMovementAndPhysicsUpdates(scene, cameraLogic.camera, env.displayCapsule, env.characterController, cameraLogic.cameraControls, canvasRef, constants);
        if (!movementComponents) { console.error("[CharacterLogic] Movement setup failed."); if (cameraLogic && typeof cameraLogic.cleanup === 'function') cameraLogic.cleanup(); if (env.characterController && typeof env.characterController.dispose === 'function') env.characterController.dispose(); if (env.displayCapsule && typeof env.displayCapsule.dispose === 'function') env.displayCapsule.dispose(); if (env.light && typeof env.light.dispose === 'function') env.light.dispose(); return null; }

        //console.log("[CharacterLogic] Initialization complete.");
        return {
            camera: cameraLogic.camera, displayCapsule: env.displayCapsule, characterController: env.characterController,
            cameraControls: cameraLogic.cameraControls, ...movementComponents,
            cleanup: () => {
                //console.log("[CharacterLogic] Cleanup...");
                if (movementComponents && typeof movementComponents.cleanup === 'function') { try { movementComponents.cleanup(); } catch(e) { console.warn("[CharacterLogic] Error in movement cleanup:", e); } }
                if (cameraLogic && typeof cameraLogic.cleanup === 'function') { try { cameraLogic.cleanup(); } catch(e) { console.warn("[CharacterLogic] Error in camera cleanup:", e); } }
                if (env.characterController && typeof env.characterController.dispose === 'function') {
                    try {
                        const ccScene = (typeof env.characterController.getScene === 'function') ? env.characterController.getScene() : null;
                        if (!ccScene || (typeof ccScene.getPhysicsEngine === 'function' && ccScene.getPhysicsEngine())) {
                            env.characterController.dispose();
                        }
                    } catch(e) {
                        console.warn("[CharacterLogic] Error disposing controller:", e);
                    }
                }
                if (env.displayCapsule && typeof env.displayCapsule.dispose === 'function') { try { env.displayCapsule.dispose(); } catch(e) { console.warn("[CharacterLogic] Error disposing capsule:", e); } }
                if (env.light && typeof env.light.dispose === 'function') { try { env.light.dispose(); } catch(e) { console.warn("[CharacterLogic] Error disposing light:", e); } }
                //console.log("[CharacterLogic] Cleanup finished.");
            },
        };
    }

    return { initialize };
})();

// Final export for the component
return { CharacterLogic };