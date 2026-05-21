const CameraLogic = (() => {
  // --- Camera Setup ---
  function setupCamera(scene, canvasRef, initialPosition = new window.BABYLON.Vector3(0, 5, -10)) {
    const camera = new window.BABYLON.FreeCamera("camera1", initialPosition, scene);
    camera.minZ = 0.2;
    camera.maxZ = 500;
    camera.angularSensibility = 4000;
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];
    camera.checkCollisions = true;
    camera.ellipsoid = new window.BABYLON.Vector3(0.3, 0.3, 0.3);

    return camera;
  }

  // --- Camera Mode, Pointer Lock, and Collision Management ---
  function setupCameraControls(scene, canvasRef, camera, displayCapsule) {
    let currentCameraMode = "third";
    let isPointerLocked = false;
    const thirdPersonDistance = 8;
    const thirdPersonHeightOffset = 2.5;
    const thirdPersonTargetOffset = 1.0;
    const firstPersonHeadOffset = new window.BABYLON.Vector3(0, (1.8 / 2) - 0.2, 0.1);
    const minCameraRaycastDist = 1.0;

    // Attach camera controls
    camera.attachControl(canvasRef.current, false);

    // Pointer lock handlers
    const requestLock = () => {
      if (canvasRef.current && !isPointerLocked) {
        canvasRef.current.requestPointerLock =
          canvasRef.current.requestPointerLock ||
          canvasRef.current.mozRequestPointerLock ||
          canvasRef.current.webkitRequestPointerLock;
        if (canvasRef.current.requestPointerLock) {
          canvasRef.current.requestPointerLock();
        }
      }
    };

    const exitLock = () => {
      document.exitPointerLock =
        document.exitPointerLock ||
        document.mozExitPointerLock ||
        document.webkitExitPointerLock;
      if (document.exitPointerLock) {
        document.exitPointerLock();
      }
    };

    const toggleCameraMode = () => {
      currentCameraMode = currentCameraMode === "third" ? "first" : "third";
    };

    const handlePointerLockChange = () => {
      if (
        document.pointerLockElement === canvasRef.current ||
        document.mozPointerLockElement === canvasRef.current ||
        document.webkitPointerLockElement === canvasRef.current
      ) {
        isPointerLocked = true;
        if (!camera.inputs.attached.mouse) {
          camera.inputs.attachInput(camera.inputs.attached.mouse);
        }
      } else {
        isPointerLocked = false;
      }
    };

    const canvasClickHandler = () => {
      if (!isPointerLocked) {
        requestLock();
      }
    };

    if (canvasRef.current) {
      canvasRef.current.addEventListener("click", canvasClickHandler);
    }

    document.addEventListener("pointerlockchange", handlePointerLockChange, false);
    document.addEventListener("mozpointerlockchange", handlePointerLockChange, false);
    document.addEventListener("webkitpointerlockchange", handlePointerLockChange, false);

    const isMeshCameraBlocker = (mesh) => {
      return mesh !== displayCapsule;
    };

    // Camera positioning in render loop
    const renderObserver = scene.onBeforeRenderObservable.add(() => {
      const currentControllerPos = displayCapsule.position;
      const currentMode = currentCameraMode;
      if (currentMode === "first") {
        const headOffset = firstPersonHeadOffset;
        const headPosWorld = displayCapsule.position.add(
          window.BABYLON.Vector3.TransformNormal(headOffset, displayCapsule.getWorldMatrix())
        );
        camera.position.copyFrom(headPosWorld);
      } else {
        const distance = thirdPersonDistance;
        const heightOffset = thirdPersonHeightOffset;
        const targetOffset = thirdPersonTargetOffset;
        const minRaycastDist = minCameraRaycastDist;
        const isBlocker = isMeshCameraBlocker;

        const characterRootPos = currentControllerPos;
        const lookAtPoint = characterRootPos.add(new window.BABYLON.Vector3(0, targetOffset, 0));
        const cameraBackward = camera.getDirection(window.BABYLON.Vector3.Backward());
        let desiredPosition = lookAtPoint.add(cameraBackward.scale(distance));
        const ray = new window.BABYLON.Ray(
          lookAtPoint,
          desiredPosition.subtract(lookAtPoint).normalize(),
          distance
        );
        const hit = scene.pickWithRay(ray, isBlocker);
        let targetPosition;
        if (hit && hit.hit && hit.pickedPoint && hit.pickedMesh) {
          targetPosition = hit.pickedPoint.add(ray.direction.scale(-0.1));
        } else {
          targetPosition = desiredPosition;
        }
        let distToLookAt = window.BABYLON.Vector3.Distance(targetPosition, lookAtPoint);
        if (distToLookAt < minRaycastDist) {
          targetPosition = lookAtPoint.add(ray.direction.scale(minRaycastDist));
        }
        // Remove frame-rate dependent Lerp to prevent high-speed rubber-banding
        camera.position.copyFrom(targetPosition);
      }
    });
    // NOTE: The renderObserver is added without insertFirst, so it naturally runs after CharacterLogic 
    // IF CharacterLogic uses insertFirst=true, OR we just let CharacterLogic insertFirst.

    return {
      getCurrentMode: () => currentCameraMode,
      toggleCameraMode,
      getThirdPersonDistance: () => thirdPersonDistance,
      getThirdPersonHeightOffset: () => thirdPersonHeightOffset,
      getThirdPersonTargetOffset: () => thirdPersonTargetOffset,
      getFirstPersonHeadOffset: () => firstPersonHeadOffset,
      getMinCameraRaycastDist: () => minCameraRaycastDist,
      isMeshCameraBlocker,
      isPointerLocked: () => isPointerLocked,
      requestLock,
      exitLock,
      cleanup: () => {
        if (canvasRef.current) {
          canvasRef.current.removeEventListener("click", canvasClickHandler);
        }
        camera.detachControl(canvasRef.current);
        document.removeEventListener("pointerlockchange", handlePointerLockChange, false);
        document.removeEventListener("mozpointerlockchange", handlePointerLockChange, false);
        document.removeEventListener("webkitpointerlockchange", handlePointerLockChange, false);
        if (isPointerLocked) {
          exitLock();
        }
        scene.onBeforeRenderObservable.remove(renderObserver);
      },
    };
  }

  // --- Main Initialization ---
  function initialize(scene, canvasRef, displayCapsule, initialPosition) {
    const camera = setupCamera(scene, canvasRef, initialPosition);
    const cameraControlsManager = setupCameraControls(scene, canvasRef, camera, displayCapsule);
    if (canvasRef.current) {
      canvasRef.current.focus();
    //   console.log("CameraLogic: Canvas focused. Click canvas to lock pointer.");
    }
    return {
      camera,
      cameraControls: cameraControlsManager,
      cleanup: () => {
        cameraControlsManager.cleanup();
        if (camera) {
          camera.dispose();
        }
      },
    };
  }

  return { initialize };
})();

return { CameraLogic };