// WorldView.js
const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

// Import React/Preact hooks.
const { useState, useEffect, useRef, useMemo } = dc;
const { WorldLogic } = await dc.require(
  folderPath + "/src/WorldLogic.js"
);
const { ScreenModeHelper } = await dc.require(
  folderPath + "/src/ScreenModeHelper.jsx"
);
const { preventDefaultInputs } = await dc.require(
  folderPath + "/src/PreventDefaultInputs.js"
);
const { LoadingConfirmation } = await dc.require(
  folderPath + "/src/LoadingConfirmation.jsx"
);

function WorldView() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const helperRef = useRef(null); // For ScreenModeHelper communication
  const originalParentRefForWindow = useRef(null);
  const originalParentRefForPiP = useRef(null);
  const [worldResources, setWorldResources] = useState(null);
  const worldResourcesRef = useRef(null); // Ref to hold resources specifically for cleanup access
  const [isFullTab, setIsFullTab] = useState(true); // Start in full-tab mode
  const [showLoadingConfirm, setShowLoadingConfirm] = useState(true); // Show confirmation popup
  const [isLoadingWorld, setIsLoadingWorld] = useState(false); // Track loading state
  const stateRefs = useRef({}).current;

  // Memoize glbBasePath to prevent unnecessary re-renders
  const glbBasePath = useMemo(() => {
    return `${folderPath}/assets/glb/`;
  }, []);

  // Initialize preventDefaultInputs to block all commands
  const { handleFocus, handleBlur, handleKeyDown } = preventDefaultInputs({
    viewRef: containerRef
  });

  // Helper functions for full-tab mode
  function findNearestAncestorWithClass(element, className) {
    if (!element) return null;
    let current = element.parentNode;
    while (current) {
      if (current.classList && current.classList.contains(className)) {
        return current;
      }
      current = current.parentNode;
    }
    return null;
  }

  function findDirectChildByClass(parent, className) {
    if (!parent) return null;
    for (const child of parent.children) {
      if (child.classList && child.classList.contains(className)) {
        return child;
      }
    }
    return null;
  }

  // Full-tab mode setup
  useEffect(() => {
    if (!isFullTab || !containerRef.current) return;

    const container = containerRef.current;
    const targetPaneContent = findNearestAncestorWithClass(
      container,
      "workspace-leaf-content"
    );

    if (!targetPaneContent) {
      console.warn('WorldView: No workspace-leaf-content found');
      return;
    }

    const contentWrapper =
      findDirectChildByClass(targetPaneContent, "view-content") ||
      targetPaneContent;

    // Save original state
    stateRefs.originalParent = container.parentNode;
    stateRefs.placeholder = document.createElement("div");
    stateRefs.placeholder.style.display = "none";
    container.parentNode.insertBefore(stateRefs.placeholder, container);

    // Inject status bar suppression stylesheet
    const styleId = "world888-fulltab-style";
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      styleEl.innerHTML = `
        /* Hide global status bar and view footers */
        .status-bar, .view-footer, .workspace-leaf-content-footer { 
          display: none !important; 
        }
        
        /* Expand workspace-leaf-content to edge-to-edge container */
        .workspace-leaf-content { 
          padding: 0 !important; 
          margin: 0 !important; 
          border-radius: 0 !important; 
        }
      `;
      document.head.appendChild(styleEl);
    }

    stateRefs.parentPositionInfo = {
      element: contentWrapper,
      original: window.getComputedStyle(contentWrapper).position,
    };

    if (stateRefs.parentPositionInfo.original === "static") {
      contentWrapper.style.position = "relative";
    }

    // Move container to full-tab
    contentWrapper.appendChild(container);

    Object.assign(container.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      zIndex: "9998",
      overflow: "auto",
    });

    //console.log('WorldView: Full-tab mode activated');

    // Cleanup on unmount or when exiting full-tab
    return () => {
      // Don't cleanup if we're in browser fullscreen mode
      if (document.fullscreenElement === container) {
       // console.log('WorldView: Skipping full-tab cleanup - container is in fullscreen');
        return;
      }
      
      // Don't cleanup if container has been moved to document.body by another mode (window, pip, character)
      if (container.parentNode === document.body) {
       // console.log('WorldView: Skipping full-tab cleanup - container moved to body by another mode');
        return;
      }
      
      if (stateRefs.placeholder?.parentNode) {
        stateRefs.placeholder.parentNode.replaceChild(
          container,
          stateRefs.placeholder
        );
        stateRefs.placeholder = null;
      }

      const el = document.getElementById(styleId);
      if (el) el.remove();

      if (stateRefs.parentPositionInfo?.element) {
        if (stateRefs.parentPositionInfo.original === "static") {
          stateRefs.parentPositionInfo.element.style.position = "";
        }
        stateRefs.parentPositionInfo = null;
      }

      container.style.cssText = "";
     // console.log('WorldView: Full-tab mode deactivated');
    };
  }, [isFullTab]);

  // Handle world loading after user confirmation
  const handleLoadWorld = () => {
    setShowLoadingConfirm(false);
    setIsLoadingWorld(true);
  };

  useEffect(() => {
    // Don't start loading until user confirms
    if (showLoadingConfirm || !isLoadingWorld) {
      return;
    }

    let isMounted = true; // Flag to prevent state updates on unmounted component

    //console.log("WorldView: Mounting and initializing WorldLogic...");

    // Ensure canvasRef is populated before calling WorldLogic
    if (!canvasRef.current) {
      console.warn("WorldView: canvasRef is null initially in useEffect.");
    }

    WorldLogic({ canvasRef, glbBasePath }) // Pass the ref object and GLB base path
      .then((resources) => {
        if (isMounted) {
          console.log("WorldView: World resources initialized.", resources);
          if (resources.multiplayerResources) {
            if (resources.multiplayerResources.isBroadcastChannel) {
             // console.log("WorldView: Multiplayer (BroadcastChannel) is active. Instance ID:", resources.multiplayerResources.instanceId);
            } else {
              console.log("WorldView: Multiplayer (Unknown Type) is active.");
            }
          } else {
            console.warn("WorldView: Multiplayer is not active or failed to initialize.");
          }
          setWorldResources(resources);
          worldResourcesRef.current = resources; // Store in ref for cleanup access
        } else {
         // console.log("WorldView: Component unmounted before WorldLogic resolved. Cleaning up resources early.");
          resources?.cleanup(); // Use optional chaining
        }
      })
      .catch((err) => {
        console.error("WorldView: Error initializing world:", err);
        if (isMounted) {
          setWorldResources(null); // Indicate error state if needed
        }
      });

    // Cleanup function for when the WorldView component unmounts
    return () => {
      isMounted = false;
    //   console.log("WorldView: Unmounting component. Triggering cleanup...");

      // Cleanup WorldLogic resources
      if (worldResourcesRef.current && typeof worldResourcesRef.current.cleanup === 'function') {
        // console.log("WorldView: Calling cleanup function from worldResourcesRef.");
        worldResourcesRef.current.cleanup();
      } else {
        console.warn("WorldView: Cleanup function not found on unmount via worldResourcesRef.");
        if (worldResources && typeof worldResources.cleanup === 'function') {
          console.warn("WorldView: Attempting cleanup via state variable (might be stale).");
          worldResources.cleanup();
        }
      }
      worldResourcesRef.current = null; // Clear the ref after cleanup attempt

      // Call handleBlur to ensure commands are restored
      handleBlur();
      //console.log("WorldView: preventDefaultInputs cleanup completed.");
    };
  }, [glbBasePath, isLoadingWorld, showLoadingConfirm]); // Re-run if GLB base path changes or loading state changes

  // Render logic
  return (
    <div
      ref={containerRef}
      tabIndex={0} // Make the container focusable
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        outline: "none",
        background: "#000",
        cursor: "crosshair", // Subtle crosshair cursor on the container
      }}
    >
      {/* Show loading confirmation popup */}
      {showLoadingConfirm && (
        <LoadingConfirmation 
          onConfirm={handleLoadWorld}
          onCancel={() => setShowLoadingConfirm(false)}
        />
      )}

      {/* Ensure canvas has a ref */}
  <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

      {/* Conditional rendering based on worldResources */}
      {worldResources ? (
        <>
          {/* Render SpherePipSpawner */}
          {worldResources.scene && worldResources.SpherePipSpawner && (
            <worldResources.SpherePipSpawner scene={worldResources.scene} helperRef={helperRef} />
          )}

          {/* Render ScreenModeHelper */}
          {worldResources.engine && (
            <ScreenModeHelper
              helperRef={helperRef}
              containerRef={containerRef}
              defaultStyle="position: relative; width: 100%; height: 400px;"
              originalParentRefForWindow={originalParentRefForWindow}
              originalParentRefForPiP={originalParentRefForPiP}
              allowedScreenModes={["browser", "window", "character"]}
              engine={worldResources.engine}
              onModeChange={(mode) => {
                // When ScreenModeHelper switches modes, inform WorldView so it can
                // ensure the container returns to full-tab mode on exit and keep state.
                // Browser mode (fullscreen) should KEEP fullTab active since it doesn't move the DOM
                // Only exit fullTab for modes that actually reparent the container (window, pip, character)
                // console.log("[WorldView] onModeChange called with mode:", mode);
                if (mode === 'default') {
                  setIsFullTab(true); // Return to fullTab
                } else if (mode === 'browser') {
                  // Browser mode (fullscreen) - KEEP fullTab active, don't move the container
                  setIsFullTab(true);
                } else {
                  // Other modes (window, pip, character) - exit fullTab
                  setIsFullTab(false);
                }
              }}
            />
          )}

          {/* Display multiplayer status */}
          <div style={{ 
            position: 'absolute', 
            bottom: '16px', 
            left: '16px', 
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'white', 
            backgroundColor: 'rgba(0, 0, 0, 0.6)', 
            padding: '10px 16px', 
            borderRadius: '8px', 
            fontSize: '13px', 
            zIndex: 10,
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}>
            <dc.Icon 
              icon={worldResources.multiplayerResources ? "users" : "user-x"} 
              style={{ 
                fontSize: "16px", 
                color: worldResources.multiplayerResources ? "rgba(16, 185, 129, 0.8)" : "rgba(255, 255, 255, 0.5)" 
              }} 
            />
            <span style={{ fontWeight: '500' }}>
              {worldResources.multiplayerResources ?
                (worldResources.multiplayerResources.isBroadcastChannel ? `Multiplayer Active (${worldResources.multiplayerResources.instanceId.slice(-6)})` : 'Multiplayer Active') :
                'Single Player'}
            </span>
          </div>
        </>
      ) : isLoadingWorld && !showLoadingConfirm ? (
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: 'translate(-50%, -50%)', 
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          color: 'white',
          background: '#0a0a0a',
          padding: '48px 64px',
          borderRadius: '16px',
          border: '1px solid rgba(139, 92, 246, 0.15)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(139, 92, 246, 0.1)',
          minWidth: '320px',
          textAlign: 'center'
        }}>
          {/* Animated Icon */}
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: '#000000',
            border: '2px solid rgba(139, 92, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(139, 92, 246, 0.15)'
          }}>
            <dc.Icon 
              icon="loader" 
              style={{ 
                width: '40px', 
                height: '40px', 
                color: '#8b5cf6',
                animation: 'spin 2s linear infinite'
              }} 
            />
          </div>
          
          {/* Title */}
          <div style={{ 
            fontSize: '24px', 
            fontWeight: '700',
            letterSpacing: '-0.5px',
            color: '#ffffff',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            Initializing World 888
          </div>
          
          {/* Bouncing Dots */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginTop: '4px'
          }}>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'bounce 1.4s infinite ease-in-out both',
              animationDelay: '-0.32s'
            }}></div>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'bounce 1.4s infinite ease-in-out both',
              animationDelay: '-0.16s'
            }}></div>
            <div style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: '#8b5cf6',
              animation: 'bounce 1.4s infinite ease-in-out both'
            }}></div>
          </div>
          
          {/* Status Text */}
          <span style={{ 
            fontSize: '13px', 
            color: 'rgba(255, 255, 255, 0.4)',
            marginTop: '8px',
            fontFamily: 'system-ui, -apple-system, sans-serif'
          }}>
            Building environment and loading assets...
          </span>
          
          {/* Animations */}
          <style>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            
            @keyframes bounce {
              0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
              40% { transform: scale(1); opacity: 1; }
            }
          `}</style>
        </div>
      ) : null}
    </div>
  );
}

return { WorldView };