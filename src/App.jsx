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

function WorldView(props = {}) {
  const { initialPasscode: _initialPasscode } = props;

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
  const [loadError, setLoadError] = useState(null); // Track any initialization errors
  const stateRefs = useRef({}).current;

  // Passcode authentication states
  // If initialPasscode is provided (web bundle), seed it immediately and skip the status check
  const [passcode, setPasscode] = useState(_initialPasscode || null);
  const [passcodeError, setPasscodeError] = useState(null);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(_initialPasscode ? false : true);
  const [isHost, setIsHost] = useState(false);

  // Memoize glbBasePath to prevent unnecessary re-renders
  const glbBasePath = useMemo(() => {
    return `${folderPath}/assets/glb/`;
  }, []);

  // Fetch server status on mount to check if passcode is auto-discoverable (localhost/Obsidian)
  useEffect(() => {
    // If we already have a passcode from props (web bundle), skip the status check entirely
    if (_initialPasscode) return;

    const adapter = dc?.app?.vault?.adapter;
    const isBrowser = !adapter || typeof adapter.exists !== 'function';
    
    // Check if passcode is provided in the URL query params
    const urlParams = new URLSearchParams(window.location.search);
    const queryPasscode = urlParams.get('passcode');
    if (queryPasscode) {
      const cleanPasscode = queryPasscode.trim().toUpperCase();
      if (cleanPasscode.match(/^888-[A-Z0-9]{4}$/i)) {
        localStorage.setItem('w888_passcode', cleanPasscode);
        setPasscode(cleanPasscode);
        setIsHost(false);
        setCheckingStatus(false);
        // Clean URL parameters from the address bar for aesthetic cleanliness
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
    }

    if (!isBrowser) {
      setCheckingStatus(false);
      setIsHost(true);
      return;
    }

    let host = window.location.hostname;
    if (host === 'obsidian.md' || !host) {
      host = 'localhost';
    }

    const requestSecure = async (url, options = {}) => {
      try {
        if (typeof window !== 'undefined' && typeof window.require === 'function') {
          const obsidian = window.require('obsidian');
          if (obsidian && typeof obsidian.requestUrl === 'function') {
            const res = await obsidian.requestUrl({
              url: url,
              method: options.method || 'GET',
              headers: options.headers || {},
              body: typeof options.body === 'object' ? JSON.stringify(options.body) : options.body
            });
            return {
              ok: res.status >= 200 && res.status < 300,
              status: res.status,
              json: async () => res.json,
              text: async () => res.text
            };
          }
        }
      } catch (_) {}
      return fetch(url, options);
    };

    requestSecure(`http://${host}:8885/status`)
      .then(res => res.json())
      .then(data => {
        if (data.ok) {
          if (data.passcode) {
            setPasscode(data.passcode);
            setIsHost(true);
            setCheckingStatus(false);
          } else {
            setIsHost(false);
            const saved = localStorage.getItem('w888_passcode');
            if (saved) {
              setPasscode(saved);
              setCheckingStatus(false);
            } else {
              setShowPasscodeModal(true);
              setCheckingStatus(false);
            }
          }
        } else {
          setCheckingStatus(false);
        }
      })
      .catch(() => {
        setCheckingStatus(false);
      });
  }, []);

  // Listen for authentication failures
  useEffect(() => {
    const handleAuthFailed = () => {
      setPasscodeError("Invalid room passcode. Access denied.");
      localStorage.removeItem('w888_passcode');
      if (worldResourcesRef.current) {
        try { worldResourcesRef.current.cleanup(); } catch (_) {}
        setWorldResources(null);
        worldResourcesRef.current = null;
      }
      setIsLoadingWorld(false);
      setShowPasscodeModal(true);
    };
    window.addEventListener('w888_auth_failed', handleAuthFailed);
    return () => window.removeEventListener('w888_auth_failed', handleAuthFailed);
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
    // Don't start loading until user confirms and passcode is verified (if needed)
    if (showLoadingConfirm || !isLoadingWorld || checkingStatus || showPasscodeModal) {
      return;
    }

    let isMounted = true; // Flag to prevent state updates on unmounted component

    //console.log("WorldView: Mounting and initializing WorldLogic...");

    // Ensure canvasRef is populated before calling WorldLogic
    if (!canvasRef.current) {
      console.warn("WorldView: canvasRef is null initially in useEffect.");
    }

    WorldLogic({ canvasRef, glbBasePath, passcode }) // Pass the ref object, GLB base path, and passcode
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
          setWorldResources(null);
          setLoadError(err.message || String(err) || "Unknown error occurred during world initialization.");
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
  }, [glbBasePath, isLoadingWorld, showLoadingConfirm, checkingStatus, showPasscodeModal, passcode]); // Re-run if GLB base path changes or loading state changes

  const handlePasscodeSubmit = (e) => {
    e.preventDefault();
    const inputVal = e.target.elements.passcodeInput.value.trim().toUpperCase();
    if (!inputVal) {
      setPasscodeError("Passcode cannot be empty");
      return;
    }
    // Simple format validation: 888-XXXX
    if (!inputVal.startsWith('888-') && inputVal.length === 4) {
      const formatted = `888-${inputVal}`;
      localStorage.setItem('w888_passcode', formatted);
      setPasscode(formatted);
      setPasscodeError(null);
      setShowPasscodeModal(false);
    } else if (inputVal.match(/^888-[A-Z0-9]{4}$/i)) {
      localStorage.setItem('w888_passcode', inputVal);
      setPasscode(inputVal);
      setPasscodeError(null);
      setShowPasscodeModal(false);
    } else {
      setPasscodeError("Invalid format. Must be like 888-A4F3");
    }
  };

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
      {/* Show passcode prompt if authentication is required */}
      {showPasscodeModal && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at center, rgba(16, 12, 32, 0.9) 0%, rgba(5, 5, 10, 0.98) 100%)',
          backdropFilter: 'blur(20px)',
          zIndex: 10001,
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
          color: '#ffffff'
        }}>
          <form onSubmit={handlePasscodeSubmit} style={{
            background: 'rgba(20, 20, 30, 0.6)',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
            padding: '40px 48px',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '440px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            backdropFilter: 'blur(10px)'
          }}>
            {/* Header */}
            <div>
              <h2 style={{
                fontSize: '28px',
                fontWeight: '800',
                background: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 50%, #6d28d9 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: '0 0 8px 0',
                letterSpacing: '-0.5px'
              }}>WORLD 888</h2>
              <p style={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '14px',
                margin: 0,
                lineHeight: '1.5'
              }}>Enter Room Passcode to join multiplayer</p>
            </div>

            {/* Input Field */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
              <label htmlFor="passcodeInput" style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: '600',
                color: 'rgba(255, 255, 255, 0.4)'
              }}>Passcode (Format: 888-XXXX)</label>
              <input
                id="passcodeInput"
                name="passcodeInput"
                type="text"
                maxLength={8}
                placeholder="888-A4F3"
                autoComplete="off"
                autoFocus
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  border: passcodeError ? '1px solid #ef4444' : '1px solid rgba(139, 92, 246, 0.3)',
                  borderRadius: '12px',
                  padding: '14px 18px',
                  fontSize: '18px',
                  color: '#ffffff',
                  outline: 'none',
                  textAlign: 'center',
                  letterSpacing: '3px',
                  fontFamily: 'monospace',
                  transition: 'border-color 0.2s, box-shadow 0.2s'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#8b5cf6';
                  e.target.style.boxShadow = '0 0 0 3px rgba(139, 92, 246, 0.25)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = passcodeError ? '#ef4444' : 'rgba(139, 92, 246, 0.3)';
                  e.target.style.boxShadow = 'none';
                }}
              />
              {passcodeError && (
                <div style={{
                  color: '#ef4444',
                  fontSize: '13px',
                  fontWeight: '500',
                  marginTop: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  <span>⚠️</span> {passcodeError}
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button type="submit" style={{
              background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
              border: 'none',
              borderRadius: '12px',
              padding: '14px',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(124, 58, 237, 0.3)',
              transition: 'transform 0.1s, box-shadow 0.2s, opacity 0.2s'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(124, 58, 237, 0.45)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.3)';
              e.currentTarget.style.transform = 'none';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'translateY(1px)';
            }}
            >
              Verify & Connect
            </button>
          </form>
        </div>
      )}

      {/* Show loading confirmation popup */}
      {showLoadingConfirm && !showPasscodeModal && (
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
              allowedScreenModes={["browser", "window", "character", "web"]}
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
                `Multiplayer Active (${worldResources.multiplayerResources.instanceId.slice(-6)})${passcode ? ` · Room: ${passcode}` : ''}` :
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
          
          {/* Status Text or Error */}
          {loadError ? (
            <div style={{
              color: '#ef4444',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              padding: '12px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              marginTop: '16px',
              fontSize: '14px',
              maxWidth: '80%',
              wordBreak: 'break-word'
            }}>
              <strong>Error Loading World:</strong><br/>
              {loadError}
              <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                If you opened this file directly in a browser, please ensure you run the local server first (`node server/world888-server.js`) to serve the GLB files.
              </div>
            </div>
          ) : (
            <>
              {/* Bouncing Dots */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '4px'
              }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.32s' }}></div>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '-0.16s' }}></div>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6', animation: 'bounce 1.4s infinite ease-in-out both' }}></div>
              </div>
              
              <span style={{ 
                fontSize: '13px', 
                color: 'rgba(255, 255, 255, 0.4)',
                marginTop: '8px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                Building environment and loading assets...
              </span>
            </>
          )}
          
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