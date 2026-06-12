const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/World888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
const fileName = activeFile;

const { useEffect } = dc;
 
function SpherePipSpawner({ scene, helperRef }) {
  useEffect(() => {
	if (!scene) return;
 
	// Define positions for each sphere – enigmatic black orbs above ground
	const sphereConfigs = [
	  {
		name: "interactiveSphere_0",
		position: new window.BABYLON.Vector3(10, 8, -10), // Raised above ground
		pip: {
		  filePath: fileName,
		  header: "ViewComponent",
		  functionName: "WorldView",
		  options: {
			width: "555px",
			height: "388px",
			top: "calc(100% - 444px - 10px)",
			left: "calc(100% - 565px - 10px)"
		  }
		}
	  },
	  {
		name: "interactiveSphere_1",
		position: new window.BABYLON.Vector3(13, 10, -12), // Raised above ground
		pip: {
		  filePath: fileName,
		  header: "ViewComponent",
		  functionName: "WorldView",
		  options: {
			width: "555px",
			height: "388px",
			top: "calc(100% - 444px - 10px)",
			left: "33px"
		  }
		}
	  },
	  {
		name: "interactiveSphere_2",
		position: new window.BABYLON.Vector3(15, 9, -9), // Raised above ground
		pip: {
		  filePath: fileName,
		  header: "ViewComponent",
		  functionName: "WorldView",
		  options: {
			width: "555px",
			height: "388px",
			top: "33px",
			left: "calc(100% - 555px - 10px)"
		  }
		}
	  }
	];
 
    const spheres = [];
    const observers = [];

    // Ensure there's a subtle glow layer for the purple emissive aura (create once per scene)
    if (!scene._betoGlowLayer && window.BABYLON?.GlowLayer) {
      try {
        scene._betoGlowLayer = new window.BABYLON.GlowLayer('betoGlow', scene, { mainTextureSamples: 0 });
        scene._betoGlowLayer.intensity = 0.55;
        // Small tweak for a softer purple halo
        scene._betoGlowLayer.customEmissiveColorSelector = (mesh, subMesh, material, result) => {
          if (material && material.emissiveColor) {
            result.set(material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b, 1.0);
            return true;
          }
          return false;
        };
      } catch (e) {
        console.warn('SpherePipSpawner: Failed to create GlowLayer:', e);
      }
    }

    // Helper to spawn the pip view when a sphere is clicked.
    function spawnPipForSphere(pipConfig) {
      // Use the helperRef passed down from WorldView.
      if (helperRef && helperRef.current && typeof helperRef.current.spawnCustomPiP === "function") {
        helperRef.current.spawnCustomPiP(
          pipConfig.filePath,
          pipConfig.header,
          pipConfig.functionName,
          pipConfig.options
        );
      } else {
        console.warn("ScreenModeHelper.spawnCustomPiP is not available via helperRef.");
      }
    }

    // Create each sphere and set up an action to spawn the pip upon picking.
    sphereConfigs.forEach((config, index) => {
      const sphere = window.BABYLON.MeshBuilder.CreateSphere(config.name, { diameter: 2.2, segments: 32 }, scene);
      sphere.position = config.position;
      sphere.isPickable = true;

      // PBR material for deeper black and better emissive response
      const mat = new window.BABYLON.PBRMaterial(`${config.name}_pbr`, scene);
      // Very dark base (nearly black) with tiny purple tint
      mat.albedoColor = new window.BABYLON.Color3(0.03, 0.02, 0.04);
      mat.metallic = 0.12;
      mat.roughness = 0.45;
      // Strong emissive purple for glow layer to pick up
      mat.emissiveColor = new window.BABYLON.Color3(0.38, 0.12, 0.65);
      // Slight micro-surface for subtle sheen
      if (mat.microSurface !== undefined) mat.microSurface = 0.9;
      // Slight transparency for depth (but keep visually solid)
      mat.alpha = 0.96;
      sphere.material = mat;

      // Bobbing animation - keep a handle to the observer so we can remove it on cleanup
      sphere._baseY = sphere.position.y;
      const obs = scene.onBeforeRenderObservable.add(() => {
        const t = performance.now() * 0.001 + index * 0.3;
        sphere.position.y = sphere._baseY + Math.sin(t * 1.6) * 0.35;
      });
      observers.push(obs);

      // ActionManager for interactions: click to spawn PiP, hover to change cursor
      sphere.actionManager = new window.BABYLON.ActionManager(scene);
      // Click -> spawn
      sphere.actionManager.registerAction(
        new window.BABYLON.ExecuteCodeAction(window.BABYLON.ActionManager.OnPickTrigger, () => {
          spawnPipForSphere(config.pip);
        })
      );

      // Pointer over/out to update cursor (use canvas if available)
      sphere.actionManager.registerAction(
        new window.BABYLON.ExecuteCodeAction(window.BABYLON.ActionManager.OnPointerOverTrigger, (evt) => {
          try { const canvas = scene.getEngine().getRenderingCanvas(); if (canvas) canvas.style.cursor = 'pointer'; } catch (e) {}
        })
      );
      sphere.actionManager.registerAction(
        new window.BABYLON.ExecuteCodeAction(window.BABYLON.ActionManager.OnPointerOutTrigger, (evt) => {
          try { const canvas = scene.getEngine().getRenderingCanvas(); if (canvas) canvas.style.cursor = 'crosshair'; } catch (e) {}
        })
      );

      spheres.push(sphere);
    });

    // Clean up: on component unmount, dispose of all created spheres and observers.
    return () => {
      observers.forEach((o) => { try { scene.onBeforeRenderObservable.remove(o); } catch (e) {} });
      spheres.forEach((s) => {
        try { if (s) s.dispose(); } catch (e) {}
      });
      // Reset canvas cursor to default
      try { const canvas = scene.getEngine().getRenderingCanvas(); if (canvas) canvas.style.cursor = ''; } catch (e) {}
    };
  }, [scene, helperRef]);
 
  // This component renders no DOM elements.
  return null;
}
 
return { SpherePipSpawner };
