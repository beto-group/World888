const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

// Import loadScript from the separate module.
const { loadScript } = await dc.require(
  folderPath + "/src/LoadScript.js"
);
// Import applyPhysicsToMesh from the HavokPhysics module.
const { applyPhysicsToMesh } = await dc.require(
  folderPath + "/src/HavokPhysics.js"
);

// Create a placeholder for PaneLogic.
const PaneLogic = {};
// Initialize the active pane property.
PaneLogic.activePane = null;

/**
 * Async function to retrieve the media resource URL.
 */
PaneLogic.requireMediaFile = async (path) => {
  const mediaFile = await app.vault.getFileByPath(path);
  return app.vault.getResourcePath(mediaFile);
};

/**
 * Loads the lottie-web library.
 */
PaneLogic.loadLottie = function(loadScript) {
  return new Promise((resolve, reject) => {
    if (window.lottie || window.bodymovin) {
      window.lottie = window.lottie || window.bodymovin;
      return resolve(window.lottie);
    }
    loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.10.1/lottie.min.js",
      () => {
        setTimeout(() => {
          if (window.lottie || window.bodymovin) {
            window.lottie = window.lottie || window.bodymovin;
            resolve(window.lottie);
          } else {
            reject(new Error("lottie not available after script load."));
          }
        }, 100);
      },
      () => reject(new Error("Failed to load lottie-web library."))
    );
  });
};

/**
 * Creates a pane from a media file.
 */
PaneLogic.createPane = async function({ scene, filePath, position = new window.BABYLON.Vector3(0, 2, 5), loadScript }) {
  try {
    const mediaURL = await PaneLogic.requireMediaFile(filePath);
    const isLottie = filePath.toLowerCase().endsWith(".json");

    if (isLottie) {
      const lottie = await PaneLogic.loadLottie(loadScript);
      const lottieContainer = document.createElement("div");
      lottieContainer.style.width = "300px";
      lottieContainer.style.height = "300px";
      lottieContainer.style.position = "absolute";
      lottieContainer.style.top = "-9999px";
      document.body.appendChild(lottieContainer);

      lottie.loadAnimation({
        container: lottieContainer,
        renderer: "canvas",
        loop: true,
        autoplay: true,
        path: mediaURL,
      });

      await new Promise((resolve) => setTimeout(resolve, 500));
      const renderedCanvas = lottieContainer.querySelector("canvas");
      if (renderedCanvas) {
        const dynamicTexture = new window.BABYLON.DynamicTexture("lottieTexture", renderedCanvas, scene, false);
        const pane = window.BABYLON.MeshBuilder.CreatePlane("lottiePane", { width: 4, height: 4 }, scene);
        pane.position = position;
        const mat = new window.BABYLON.StandardMaterial("lottieMat", scene);
        mat.diffuseTexture = dynamicTexture;
        pane.material = mat;
        applyPhysicsToMesh({
          mesh: pane,
          scene,
          shapeType: "BOX",
          options: { mass: 0, restitution: 0.1 }
        });
        scene.onBeforeRenderObservable.add(() => dynamicTexture.update());
        document.body.removeChild(lottieContainer);
        return pane;
      } else {
        document.body.removeChild(lottieContainer);
        throw new Error("Lottie canvas not found.");
      }
    } else {
      const pane = window.BABYLON.MeshBuilder.CreatePlane("imagePane", { width: 4, height: 4 }, scene);
      pane.position = position;
      const mat = new window.BABYLON.StandardMaterial("imageMat", scene);
      mat.diffuseTexture = new window.BABYLON.Texture(mediaURL, scene);
      mat.emissiveColor = new window.BABYLON.Color3(1, 1, 1);
      pane.material = mat;
      applyPhysicsToMesh({
        mesh: pane,
        scene,
        shapeType: "BOX",
        options: { mass: 0, restitution: 0.1 }
      });
      return pane;
    }
  } catch (err) {
    // console.error("PaneLogic.createPane encountered an error:", err);
    throw err;
  }
};

PaneLogic.getOverlayScreenPosition = function(scene, pane) {
  const engine = scene.getEngine();
  const camera = scene.activeCamera;
  let basePos = pane.position.clone();

  if (pane.name === "initialInteractionPane") {
    basePos.addInPlace(new window.BABYLON.Vector3(0, 1, 0));
  } else {
    basePos.addInPlace(new window.BABYLON.Vector3(0, -0.5, 0));
  }

  const screenPos = window.BABYLON.Vector3.Project(
    basePos,
    window.BABYLON.Matrix.Identity(),
    scene.getTransformMatrix(),
    camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
  );
  return screenPos;
};

/**
 * Creates a modal media input overlay.
 */
PaneLogic.showMediaInputOverlay = function(scene, defaultFilePath, activePane) {
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.top = "20%";
  overlay.style.left = "50%";
  overlay.style.transform = "translate(-50%, -20%)";
  overlay.style.background = "rgba(0, 0, 0, 0.8)";
  overlay.style.padding = "20px";
  overlay.style.zIndex = "1000";
  overlay.style.borderRadius = "8px";
  overlay.style.color = "#fff";

  const label = document.createElement("p");
  label.innerText = "Enter file path (e.g., scripts/aquarium/img/back.png or a Lottie JSON file):";
  overlay.appendChild(label);

  const input = document.createElement("input");
  input.type = "text";
  input.value = defaultFilePath || "scripts/aquarium/img/back.png";
  input.style.width = "100%";
  input.style.padding = "8px";
  input.style.marginBottom = "10px";
  overlay.appendChild(input);

  const buttonDiv = document.createElement("div");
  buttonDiv.style.textAlign = "right";

  const cancelBtn = document.createElement("button");
  cancelBtn.innerText = "Cancel";
  cancelBtn.style.marginRight = "10px";
  const submitBtn = document.createElement("button");
  submitBtn.innerText = "Submit";

  buttonDiv.appendChild(cancelBtn);
  buttonDiv.appendChild(submitBtn);
  overlay.appendChild(buttonDiv);

  document.body.appendChild(overlay);
  input.focus();

  cancelBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  submitBtn.addEventListener("click", async () => {
    const filePath = input.value.trim();
    document.body.removeChild(overlay);
    try {
      await PaneLogic.handleMediaSubmit({ scene, filePath, loadScript, pane: activePane });
    } catch (err) {
      console.error("Error updating pane media:", err);
    }
  });
};

/**
 * Handles media interaction on an interactive pane.
 */
PaneLogic.handleMediaInteractionForPane = function({ scene, pane, defaultFilePath, loadScript }) {
  PaneLogic.activePane = pane;
  PaneLogic.showMediaInputOverlay(scene, defaultFilePath, pane);
};

/**
 * Creates a blank interactive pane that can be updated later.
 */
PaneLogic.createInteractionPane = function({ scene, position, width = 4, height = 4 }) {
  const pane = window.BABYLON.MeshBuilder.CreatePlane("interactionPane", { width, height }, scene);
  pane.position = position;
  const mat = new window.BABYLON.StandardMaterial("paneMat", scene);
  mat.diffuseColor = new window.BABYLON.Color3(1, 0, 0);
  mat.backFaceCulling = false;
  pane.material = mat;
  applyPhysicsToMesh({
    mesh: pane,
    scene,
    shapeType: "BOX",
    options: { mass: 0, restitution: 0.1 }
  });
  return pane;
};

return { PaneLogic };