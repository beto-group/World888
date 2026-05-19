/** @jsx h */
const { h, render } = dc.preact;
const { useState, useEffect, useRef, useCallback } = dc;

// Import Node.js modules for external window creation (optional - graceful fallback)
let BrowserWindow = null;
let os = null;
try {
  const electron = require('@electron/remote') || require('electron').remote || {};
  BrowserWindow = electron.BrowserWindow;
  os = require('os');
} catch (e) {
  // Electron modules not available
}


/*==============================================================================
  GLOBAL Z-INDEX MANAGEMENT
==============================================================================*/
let highestZIndex = 10000;
const DEFAULT_FALLBACK_ZINDEX = 10000;

function updateHighestZIndex() {
  let max = 0;
  document.querySelectorAll('.fresh-pip').forEach((el) => {
    let computedZStr = window.getComputedStyle(el).zIndex;
    // If computed style returns "auto" or is empty, use the inline style or a default
    let z = (computedZStr === "auto" || computedZStr === "")
      ? (parseInt(el.style.zIndex, 10) || DEFAULT_FALLBACK_ZINDEX)
      : (parseInt(computedZStr, 10) || 0);
    //console.log("[updateHighestZIndex] Found element:", el, "with computed zIndex:", computedZStr, "=> parsed:", z);
    if (z > max) {
      max = z;
    }
  });
  if (max < DEFAULT_FALLBACK_ZINDEX) {
    //console.log("[updateHighestZIndex] No high zIndex found. Using fallback", DEFAULT_FALLBACK_ZINDEX);
    max = DEFAULT_FALLBACK_ZINDEX;
  }
  highestZIndex = max;
  //console.log("[updateHighestZIndex] Updated highest z-index to:", highestZIndex);
  return highestZIndex;
}

function bringToFront(container, fallback = 0) {
  updateHighestZIndex();
  if (fallback && highestZIndex < fallback) {
    highestZIndex = fallback;
    //console.log("[bringToFront] Applied fallback value:", fallback);
  }
  highestZIndex++;
  // Use setProperty with !important so that it overrides other styles.
  container.style.setProperty("z-index", highestZIndex, "important");
  let computed = window.getComputedStyle(container).zIndex;
  let forcedReflow = container.offsetHeight; // Force a reflow.
  //console.log([bringToFront] Container brought to front. New inline zIndex: ${highestZIndex} (computed: ${computed}). Forced reflow: ${forcedReflow});
}

/*==============================================================================
  HELPER FUNCTIONS FOR APPLYING SCREEN MODES WITH DEBUGGING
==============================================================================*/
function updateCanvasSize(container) {
  const canvas = container.querySelector("canvas");
  if (canvas) {
    //console.log("[updateCanvasSize] Before update - CSS size:", canvas.style.width, canvas.style.height);
    //console.log("[updateCanvasSize] Before update - Attributes: width =", canvas.width, "height =", canvas.height);
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;
    canvas.width = newWidth;
    canvas.height = newHeight;
    //console.log("[updateCanvasSize] After update - Container size:", newWidth, newHeight);
   // console.log("[updateCanvasSize] After update - Canvas attributes:", canvas.width, canvas.height);
  } else {
    console.warn("[updateCanvasSize] No canvas found inside container.");
  }
}

function resetScreenMode(container, defaultStyle, originalParentRefForWindow, originalParentRefForPiP) {
  //console.log("[resetScreenMode] Resetting screen mode for container:", container);
  if (originalParentRefForWindow.current) {
    //console.log("[resetScreenMode] Reparenting container from window mode to original parent:", originalParentRefForWindow.current);
    originalParentRefForWindow.current.appendChild(container);
    originalParentRefForWindow.current = null;
  }
  if (originalParentRefForPiP.current) {
    //console.log("[resetScreenMode] Reparenting container from PiP mode to original parent:", originalParentRefForPiP.current);
    originalParentRefForPiP.current.appendChild(container);
    originalParentRefForPiP.current = null;
    if (container._pipDragAttached) {
      container.removeEventListener("mousedown", container._pipDragAttached.dragStart);
      window.removeEventListener("mousemove", container._pipDragAttached.dragMove);
      window.removeEventListener("mouseup", container._pipDragAttached.dragEnd);
      delete container._pipDragAttached;
      delete container._pipDragging;
    }
    if (container._pipResizers) {
      container._pipResizers.forEach((handle) => handle.remove());
      delete container._pipResizers;
    }
    delete container._pipReset;
  }
  container.style.cssText = defaultStyle;
  //console.log("[resetScreenMode] Container style reset to default:", container.style.cssText);
  let forcedReflow = container.offsetHeight;
  //console.log("[resetScreenMode] Forced reflow value:", forcedReflow);
}

function applyBrowserMode(container) {
  if (!document.fullscreenElement) {
    // console.log("[applyBrowserMode] Requesting fullscreen for container.");
    const fullscreenPromise = container.requestFullscreen?.() ||
      container.webkitRequestFullscreen?.() ||
      container.mozRequestFullScreen?.() ||
      container.msRequestFullscreen?.();
    
    if (fullscreenPromise && fullscreenPromise.then) {
      fullscreenPromise
        .then(() => console.log("[applyBrowserMode] Fullscreen entered successfully"))
        .catch(err => console.error("[applyBrowserMode] Fullscreen request failed:", err));
    }
  } else {
    // console.log("[applyBrowserMode] Exiting fullscreen mode.");
    document.exitFullscreen?.();
  }
}

function applyWindowStyle(container) {
  //console.log("[applyWindowStyle] Applying window style to container:", container);
  Object.assign(container.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100vw",
    height: "100vh",
    backgroundColor: "#222"
  });
  //console.log("[applyWindowStyle] Container style after update:", container.style.cssText);
  //console.log("[applyWindowStyle] Computed style:", getComputedStyle(container).cssText);
  let reflowValue = container.offsetHeight;
  //console.log("[applyWindowStyle] Forced reflow value:", reflowValue);
  updateCanvasSize(container);
  bringToFront(container, 9999);
  setTimeout(() => {
    if (window.myBabylonEngine) {
      //console.log("[applyWindowStyle] Resizing Babylon engine. Container dimensions:", container.clientWidth, container.clientHeight);
      window.myBabylonEngine.resize();
    } else {
      console.warn("[applyWindowStyle] Babylon engine (window.myBabylonEngine) not found.");
    }
  }, 50);
}

function applyPipStyle(container) {
  //console.log("[applyPipStyle] Applying PiP style to container:", container);
  Object.assign(container.style, {
    position: "fixed",
    top: "calc(100% - 300px - 10px)",
    left: "calc(100% - 400px - 10px)",
    width: "400px",
    height: "300px",
    backgroundColor: "#222",
    border: "2px solid #444",
    borderRadius: "4px",
    cursor: "move"
  });
  //console.log("[applyPipStyle] Container style after PiP update:", container.style.cssText);
  let forced = container.offsetHeight;
  //console.log("[applyPipStyle] Forced reflow value:", forced);
}

function applyScreenMode(mode, container, originalParentRefForWindow, originalParentRefForPiP, defaultStyle) {
  if (!container) return;
//   console.log("[applyScreenMode] Mode requested:", mode, "for container:", container);
  const tokens = mode.trim().split(/\s+/);
  if (tokens.includes("reset")) {
    resetScreenMode(container, defaultStyle, originalParentRefForWindow, originalParentRefForPiP);
    return;
  }
  if (tokens.includes("browser")) {
    // console.log("[applyScreenMode] Applying browser mode");
    applyBrowserMode(container);
    return;
  }
  if (tokens.includes("window") || tokens.includes("pip")) {
    if (tokens.includes("window")) {
      if (!originalParentRefForWindow.current) {
        originalParentRefForWindow.current = container.parentNode;
        //console.log("[applyScreenMode] Stored original window parent:", originalParentRefForWindow.current);
      }
      document.body.appendChild(container);
      //console.log("[applyScreenMode] Container appended to document.body for window mode.");
      applyWindowStyle(container);
    }
    if (tokens.includes("pip")) {
      if (!originalParentRefForPiP.current) {
        originalParentRefForPiP.current = container.parentNode;
        //console.log("[applyScreenMode] Stored original PiP parent:", originalParentRefForPiP.current);
      }
      document.body.appendChild(container);
      container._pipReset = function() {
        resetScreenMode(container, defaultStyle, originalParentRefForWindow, originalParentRefForPiP);
      };
      applyPipStyle(container);
      setupPipDrag(container);
      setupPipCornerResizers(container);
    }
  }
  //console.log(`[applyScreenMode] Applied mode: ${mode}`);
}

/*==============================================================================
  DRAG & RESIZE SETUP FOR PIP CONTAINERS WITH DEBUGGING
==============================================================================*/
function setupPipDrag(container) {
  if (container._pipDragAttached) return;
  const dragHandlers = {
    dragStart: (e) => {
      //console.log("[setupPipDrag] Drag start event:", e);
      bringToFront(container);
      container._active = true;
      container._pipDragging = true;
      container._pipStartX = e.clientX;
      container._pipStartY = e.clientY;
      container._pipOrigTop = parseInt(getComputedStyle(container).top, 10) || 0;
      container._pipOrigLeft = parseInt(getComputedStyle(container).left, 10) || 0;
      //console.log(`[setupPipDrag] Drag started at (${e.clientX}, ${e.clientY}). Original position: top ${container._pipOrigTop}, left ${container._pipOrigLeft}`);
    },
    dragMove: (e) => {
      if (!container._pipDragging) return;
      const deltaX = e.clientX - container._pipStartX;
      const deltaY = e.clientY - container._pipStartY;
      container.style.top = `${container._pipOrigTop + deltaY}px`;
      container.style.left = `${container._pipOrigLeft + deltaX}px`;
      //console.log(`[setupPipDrag] Drag move: top ${container.style.top}, left ${container.style.left}`);
    },
    dragEnd: (e) => {
      container._pipDragging = false;
      container._active = false;
      //console.log(`[setupPipDrag] Drag ended. Final position: top ${container.style.top}, left ${container.style.left}`);
      setTimeout(() => {
        bringToFront(container);
      }, 0);
    }
  };
  container.addEventListener("mousedown", dragHandlers.dragStart);
  window.addEventListener("mousemove", dragHandlers.dragMove);
  window.addEventListener("mouseup", dragHandlers.dragEnd);
  container._pipDragAttached = dragHandlers;
}

function setupPipCornerResizers(container) {
  if (container._pipResizers) return;
  const corners = [
    { corner: "topLeft", style: { top: "0", left: "0", width: "30px", height: "30px", cursor: "nwse-resize" } },
    { corner: "topRight", style: { top: "0", right: "0", width: "30px", height: "30px", cursor: "nesw-resize" } },
    { corner: "bottomRight", style: { bottom: "0", right: "0", width: "30px", height: "30px", cursor: "nwse-resize" } },
    { corner: "bottomLeft", style: { bottom: "0", left: "0", width: "30px", height: "30px", cursor: "nesw-resize" } }
  ];
  const resizers = [];
  corners.forEach(({ corner, style }) => {
    const resizer = document.createElement("div");
    resizer.className = "pip-resizer";
    Object.assign(resizer.style, {
      position: "absolute",
      background: "transparent",
      border: "none",
      ...style,
      zIndex: 10500
    });
    resizer.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      e.preventDefault();
      //console.log(`[setupPipCornerResizers] Mousedown on resizer at corner: ${corner}`, e);
      bringToFront(container);
      container._active = true;
      resizer._resizing = true;
      resizer._startX = e.clientX;
      resizer._startY = e.clientY;
      const computed = getComputedStyle(container);
      resizer._origWidth = parseInt(computed.width, 10);
      resizer._origHeight = parseInt(computed.height, 10);
      resizer._origTop = parseInt(computed.top, 10);
      resizer._origLeft = parseInt(computed.left, 10);
      resizer._corner = corner;
      //console.log([setupPipCornerResizers] Resize started at corner: ${corner}. Original dimensions: ${resizer._origWidth}x${resizer._origHeight} at (${resizer._origLeft}, ${resizer._origTop}));
    });
    resizers.push(resizer);
    container.appendChild(resizer);
  });
  container._pipResizers = resizers;
  
  const resizeMove = (e) => {
    if (!container._pipResizers) return;
    container._pipResizers.forEach((resizer) => {
      if (!resizer._resizing) return;
      const deltaX = e.clientX - resizer._startX;
      const deltaY = e.clientY - resizer._startY;
      let newWidth = resizer._origWidth;
      let newHeight = resizer._origHeight;
      let newLeft = resizer._origLeft;
      let newTop = resizer._origTop;
      switch (resizer._corner) {
        case "bottomRight":
          newWidth = Math.max(200, resizer._origWidth + deltaX);
          newHeight = Math.max(150, resizer._origHeight + deltaY);
          break;
        case "bottomLeft":
          newWidth = Math.max(200, resizer._origWidth - deltaX);
          newHeight = Math.max(150, resizer._origHeight + deltaY);
          newLeft = resizer._origLeft + deltaX;
          break;
        case "topRight":
          newWidth = Math.max(200, resizer._origWidth + deltaX);
          newHeight = Math.max(150, resizer._origHeight - deltaY);
          newTop = resizer._origTop + deltaY;
          break;
        case "topLeft":
          newWidth = Math.max(200, resizer._origWidth - deltaX);
          newHeight = Math.max(150, resizer._origHeight - deltaY);
          newLeft = resizer._origLeft + deltaX;
          newTop = resizer._origTop + deltaY;
          break;
      }
      container.style.width = `${newWidth}px`;
      container.style.height = `${newHeight}px`;
      container.style.top = `${newTop}px`;
      container.style.left = `${newLeft}px`;
      //console.log([setupPipCornerResizers] Resizing: new dimensions ${newWidth}x${newHeight}, new position (${newLeft}, ${newTop}));
    });
  };
  
  const resizeEnd = () => {
    if (container._pipResizers) {
      container._pipResizers.forEach((resizer) => {
        resizer._resizing = false;
      });
      container._active = false;
      //console.log("[setupPipCornerResizers] Resize ended. Final container style:", container.style.cssText);
    }
  };
  
  window.addEventListener("mousemove", resizeMove);
  window.addEventListener("mouseup", () => {
    setTimeout(() => {
      bringToFront(container);
    }, 0);
    resizeEnd();
  });
}

/*==============================================================================
  DYNAMIC PIP SPAWNING VIA FreshPip COMPONENT
==============================================================================*/
function FreshPip({ onClose, filePath, functionName, customStyle = {} }) {
  const containerRef = useRef(null);
  const [LoadedComponent, setLoadedComponent] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const dynamicModule = await dc.require(filePath);
        const Component = dynamicModule[functionName];
        setLoadedComponent(() => Component);
      } catch (error) {
        console.error("Error loading component:", error);
      }
    })();
  }, [filePath, functionName]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("pointerdown", () => {
        bringToFront(container);
        container._active = true;
      }, true);
      setupPipDrag(container);
      setupPipCornerResizers(container);
    }
  }, []);

  const defaultPipStyle = {
    position: "fixed",
    top: "calc(100% - 330px - 10px)",
    left: "calc(100% - 440px - 10px)",
    width: "440px",
    height: "330px",
    backgroundColor: "#222",
    border: "2px solid #444",
    borderRadius: "4px",
    cursor: "move",
    boxSizing: "border-box",
    padding: "0px",
    overflow: "hidden",
    zIndex: DEFAULT_FALLBACK_ZINDEX
  };

  const mergedStyle = { ...defaultPipStyle, ...customStyle };

  return (
    h(
      "div",
      {
        ref: containerRef,
        className: "fresh-pip",
        style: mergedStyle
      },
      h(
        "button",
        {
          style: {
            position: "absolute",
            top: "4px",
            right: "4px",
            zIndex: "33100",
            cursor: "pointer",
            background: "transparent",
            border: "none",
            color: "white",
            fontSize: "16px"
          },
          onClick: onClose
        },
        "X"
      ),
      LoadedComponent
        ? h(LoadedComponent, {
            style: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }
          })
        : h(
            "div",
            {
              style: { 
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0, 
                color: "white", textAlign: "center", lineHeight: mergedStyle.height 
              }
            },
            "Loading..."
          )
    )
  );
}

// --- ENHANCED: External Window Creator for WORLD 888 ---
async function createExternalWindow() {
  if (!BrowserWindow) {
    console.error("[createExternalWindow] BrowserWindow not available.");
    if (typeof Notice !== 'undefined') new Notice("External window mode requires Electron with remote module enabled.", 5000);
    return null;
  }

  try {
    const isMac = os && os.platform() === 'darwin';
    
    const externalWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 700,
      minHeight: 500,
      title: '✨ WORLD 888 - External View',
      backgroundColor: '#0D0D1A',
      frame: isMac ? false : true,
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      vibrancy: isMac ? 'ultra-dark' : undefined,
      hasShadow: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        enableRemoteModule: true
      },
      show: false
    });
    
    // Resolve absolute path to assets/player_viewer.html
    const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
    const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
    const absFolderPath = dc.app.vault.adapter.getFullPath 
      ? dc.app.vault.adapter.getFullPath(folderPath) 
      : dc.app.vault.adapter.basePath + '/' + folderPath;
      
    const fs = require('fs');
    const path = require('path');
    
    const htmlPath = path.join(absFolderPath, "assets", "player_viewer.html");
    const glbPath = path.join(absFolderPath, "assets", "glb", "scene888.glb");
    
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Inject the local GLB file fallback directly into the HTML to prevent location.search parsing issues in data URLs
    const fileGlbUrl = "file://" + glbPath;
    htmlContent = htmlContent.replace(
      "const glbUrl = urlParams.get('glb');",
      `const glbUrl = urlParams.get('glb') || "${fileGlbUrl}";`
    );

    externalWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
    externalWindow._requestedMode = null;
    
    try {
      const electron = require('electron');
      const ipcMain = electron.ipcMain || (electron.remote && electron.remote.ipcMain);
      
      if (ipcMain && typeof ipcMain.on === 'function') {
        const switchModeHandler = (event, mode) => {
          if (event.sender === externalWindow.webContents) {
            externalWindow._requestedMode = mode;
          }
        };
        ipcMain.on('switch-mode', switchModeHandler);
        externalWindow._ipcHandler = switchModeHandler;
        externalWindow._ipcMain = ipcMain;
      }
    } catch (e) {}
    
    externalWindow.once('ready-to-show', () => {
      externalWindow.show();
      if (typeof Notice !== 'undefined') new Notice("✨ External window opened!", 3000);
    });
    
    externalWindow.on('closed', () => {
      if (externalWindow._ipcHandler && externalWindow._ipcMain) {
        try {
          externalWindow._ipcMain.removeListener('switch-mode', externalWindow._ipcHandler);
        } catch (e) {}
      }
    });
    return externalWindow;
  } catch (error) {
    console.error("[createExternalWindow] Failed:", error);
    if (typeof Notice !== 'undefined') new Notice('Failed to open external window: ' + error.message, 5000);
    return null;
  }
}

const WEB_SERVER_PORT = 8885;

// Persist server on Node.js global so it survives Datacore hot-reloads.
// If global.__w888_server already exists it's the live server from a previous load.
if (typeof global.__w888_server === 'undefined') {
  global.__w888_server = null;
}

function _buildServer(folderPath) {
  const http = require('http');
  const fs   = require('fs');
  const path = require('path');

  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const decodedUrl = decodeURIComponent(req.url.split('?')[0]);

    // --- IPC Bridge: Popup -> Host via global callback ---
    if (req.method === 'POST' && decodedUrl === '/sync') {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          // Route via the global sync handler set by ScreenModeHelper when spawning window
          if (typeof global.__w888_syncHandler === 'function') {
            global.__w888_syncHandler(payload);
          } else {
            // Fallback: broadcast directly (works if same origin)
            const bc = new BroadcastChannel("obsidian-world-builder-sync");
            bc.postMessage(payload);
            bc.close();
          }
        } catch(e) {}
        res.writeHead(200);
        res.end('ok');
      });
      return;
    }

    const filePath = path.join(folderPath, "assets", decodedUrl);
    const relative = path.relative(path.join(folderPath, "assets"), filePath);
    const isInsideAssets = relative && !relative.startsWith('..') && !path.isAbsolute(relative);

    if (!isInsideAssets) { res.writeHead(403); res.end("Forbidden"); return; }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) { res.writeHead(404); res.end("File Not Found"); return; }

      const headers = { 'Content-Type': 'text/html' };
      if (filePath.endsWith('.glb'))  headers['Content-Type'] = 'model/gltf-binary';
      else if (filePath.endsWith('.js'))   headers['Content-Type'] = 'application/javascript';
      else if (filePath.endsWith('.css'))  headers['Content-Type'] = 'text/css';
      else if (filePath.endsWith('.json')) headers['Content-Type'] = 'application/json';

      if (filePath.endsWith('.html')) {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        headers['Pragma'] = 'no-cache';
        headers['Expires'] = '0';
      }

      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return server;
}

function startLocalWebServer(folderPath) {
  // If we already have a healthy server running, reuse it
  if (global.__w888_server && global.__w888_server.listening) {
    console.log('[ScreenModeHelper] Reusing existing web server on port', WEB_SERVER_PORT);
    return;
  }

  // Close any stale reference
  if (global.__w888_server && !global.__w888_server.listening) {
    try { global.__w888_server.close(); } catch(e) {}
    global.__w888_server = null;
  }

  try {
    const server = _buildServer(folderPath);
    global.__w888_server = server;

    server.listen(WEB_SERVER_PORT, () => {
      console.log(`[ScreenModeHelper] Local web server started on port ${WEB_SERVER_PORT}`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        // Port taken by a previous un-closeable process — try to kill & retry once
        console.warn(`[ScreenModeHelper] Port ${WEB_SERVER_PORT} busy. Attempting forced restart...`);
        const http = require('http');
        // Send shutdown signal to old server (it won't have /shutdown, but the request forces a socket close)
        const req = http.request({ host: 'localhost', port: WEB_SERVER_PORT, path: '/__kill', method: 'GET' });
        req.on('error', () => {});
        req.end();
        // Mark as not-listening so next call rebuilds
        global.__w888_server = null;
      } else {
        console.error("[ScreenModeHelper] Local web server error:", err);
        global.__w888_server = null;
      }
    });
  } catch (e) {
    console.error("[ScreenModeHelper] Failed to start local web server:", e);
  }
}

/*==============================================================================
  SCENEHELPER / SCREENMODEHELPER COMPONENT
==============================================================================*/
const ScreenModeHelper = ({
  helperRef,
  initialMode = "default",
  containerRef,
  defaultStyle,
  originalParentRefForWindow,
  originalParentRefForPiP,
  allowedScreenModes = ["browser", "window", "character", "web"],
  engine,
  onModeChange // optional callback to inform parent (WorldView) about mode changes
}) => {
  const [activeMode, setActiveMode] = useState(allowedScreenModes.includes(initialMode) ? initialMode : "default");
  const previousModeRef = useRef("default"); // Track the previous mode before entering browser fullscreen
  const activeModeRef = useRef(activeMode); // Track activeMode in a ref for event handlers
  const isEnteringFullscreenRef = useRef(false); // Flag to prevent race conditions

  // Keep ref in sync with state
  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  const externalWindowRef = useRef(null);

  const openExternalWindow = useCallback(async () => {
    if (externalWindowRef.current && !externalWindowRef.current.isDestroyed()) {
      externalWindowRef.current.focus();
      return true;
    }

    const win = await createExternalWindow();
    if (win) {
      externalWindowRef.current = win;
      if (containerRef.current) {
        containerRef.current.style.visibility = 'hidden';
      }
      return true;
    }
    return false;
  }, [containerRef]);

  const closeExternalWindow = useCallback(() => {
    if (externalWindowRef.current && !externalWindowRef.current.isDestroyed()) {
      externalWindowRef.current.close();
      externalWindowRef.current = null;
    }
    if (containerRef.current) {
      containerRef.current.style.visibility = 'visible';
    }
  }, [containerRef]);

  const toggleMode = async (mode) => {
    // console.log("[ScreenModeHelper] Toggling mode. Current mode:", activeMode, "Requested mode:", mode);
    let newMode = activeMode;
    
    // Close external window if we are switching away from window mode
    if (activeMode === "window" && mode !== "window") {
      closeExternalWindow();
    }
    
    if (mode === "pip") {
      if (activeMode === "pip") {
        newMode = "default";
        activeModeRef.current = "default"; // Update ref immediately
        resetScreenMode(containerRef.current, defaultStyle, originalParentRefForWindow, originalParentRefForPiP);
      } else {
        newMode = "pip";
        activeModeRef.current = "pip"; // Update ref immediately
        applyScreenMode("pip", containerRef.current, originalParentRefForWindow, originalParentRefForPiP, defaultStyle);
      }
    } else if (mode === "character") {
      // Spawn a new player instance in a real, external OS window using Electron BrowserWindow
      try {
        const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
        const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
        
        // Use local web server to avoid ERR_BLOCKED_BY_CLIENT file:// restrictions
        const absFolder = dc.app.vault.adapter.getFullPath 
          ? dc.app.vault.adapter.getFullPath(folderPath) 
          : dc.app.vault.adapter.basePath + '/' + folderPath;
        startLocalWebServer(absFolder);
        
        const targetUrl = `http://localhost:8885/player_viewer.html?t=${Date.now()}&glb=http://localhost:8885/glb/scene888.glb`;
        
        const remote = require('@electron/remote') || require('electron').remote;
        if (!remote || !remote.BrowserWindow) {
          throw new Error("Electron remote is not available.");
        }
        
        const playerWindow = new remote.BrowserWindow({
          title: "World 888 - Player Viewer",
          width: 800,
          height: 600,
          frame: true,
          transparent: false,
          backgroundColor: "#0b0b14",
          webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true,
            webSecurity: false
          }
        });
        
        // --- Establish Cross-Origin Multiplayer Bridge ---
        // 1. Popup -> Host: register a global function that the /sync HTTP handler calls
        global.__w888_syncHandler = (payload) => {
          try {
            const bc = new BroadcastChannel("obsidian-world-builder-sync");
            bc.postMessage(payload);
            bc.close();
          } catch (e) {}
        };

        // 2. Host -> Popup: listen on BroadcastChannel and inject into the popup via executeJavaScript
        const hostBc = new BroadcastChannel("obsidian-world-builder-sync");
        hostBc.onmessage = (event) => {
          if (playerWindow && !playerWindow.isDestroyed()) {
            playerWindow.webContents.executeJavaScript(`
              if (window.handleExternalSync) {
                window.handleExternalSync(${JSON.stringify(event.data)});
              }
            `).catch(() => {});
          } else {
            hostBc.close();
          }
        };

        playerWindow.on('closed', () => {
          hostBc.close();
          global.__w888_syncHandler = null;
        });
        
        playerWindow.loadURL(targetUrl);
        playerWindow.once('ready-to-show', () => {
          playerWindow.show();
          if (typeof Notice !== 'undefined') new Notice("✨ Secondary player window opened!", 3000);
        });
        
      } catch (e) {
        console.error("[ScreenModeHelper] Failed to spawn external player window:", e);
        // Fallback to DOM-based spawnCustomPiP if Electron is not available
        const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
        const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
        const pipOptions = {
          width: "555px",
          height: "388px",
          top: "calc(100% - 388px - 20px)",
          left: "calc(100% - 555px - 20px)"
        };
        spawnCustomPiP(folderPath + "/src/App.jsx", "Character Screen", "WorldView", pipOptions);
      }
      return; // Don't change activeMode, just spawn and return
    } else if (mode === "browser") {
      if (activeMode === "browser") {
        // Exiting browser fullscreen - call applyBrowserMode again to exit fullscreen
        newMode = "default"; // This will trigger onModeChange to restore fullTab
        isEnteringFullscreenRef.current = false; // Clear the flag
        activeModeRef.current = "default"; // Update ref immediately
        // console.log("[ScreenModeHelper] Exiting browser mode, calling applyBrowserMode to exit fullscreen");
        applyScreenMode("browser", containerRef.current, originalParentRefForWindow, originalParentRefForPiP, defaultStyle);
      } else {
        // Entering browser fullscreen
        previousModeRef.current = activeMode; // Remember where we came from
        newMode = "browser";
        activeModeRef.current = "browser"; // Update ref immediately BEFORE setting flag and requesting fullscreen
        isEnteringFullscreenRef.current = true; // Set flag BEFORE applying mode
        // console.log("[ScreenModeHelper] Setting flag and entering browser fullscreen mode, activeModeRef now:", activeModeRef.current);
        applyScreenMode("browser", containerRef.current, originalParentRefForWindow, originalParentRefForPiP, defaultStyle);
      }
    } else if (mode === "window") {
      if (activeMode === "window") {
        newMode = "default";
        activeModeRef.current = "default"; // Update ref immediately
        closeExternalWindow();
      } else {
        newMode = "window";
        activeModeRef.current = "window"; // Update ref immediately
        const success = await openExternalWindow();
        if (!success) {
          newMode = "default";
          activeModeRef.current = "default";
        }
      }
    } else if (mode === "web") {
      try {
        const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
        const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
        const absFolder = dc.app.vault.adapter.getFullPath 
          ? dc.app.vault.adapter.getFullPath(folderPath) 
          : dc.app.vault.adapter.basePath + '/' + folderPath;
        
        startLocalWebServer(absFolder);
        
        const targetUrl = `http://localhost:8885/player_viewer.html?glb=http://localhost:8885/glb/scene888.glb`;
        
        const { shell } = require('electron');
        shell.openExternal(targetUrl);
        
        if (typeof Notice !== 'undefined') new Notice("🌐 Opened player in web browser!", 3000);
      } catch (e) {
        console.error("[ScreenModeHelper] Failed to open in web browser:", e);
      }
      return; // Don't change activeMode state, just open in browser and return
    }
    setActiveMode(newMode);
    // Note: activeModeRef is updated immediately above for all modes now
    // Inform parent that the mode changed (WorldView will restore full-tab when newMode === 'default')
    try { if (typeof onModeChange === 'function') onModeChange(newMode); } catch (e) { console.warn('[ScreenModeHelper] onModeChange callback threw:', e); }
  };

  useEffect(() => {
    let observer;
    let resizeTimeout;
    if (containerRef.current && engine) {
      observer = new ResizeObserver((entries) => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          entries.forEach((entry) => {
            const { width } = entry.contentRect;
            let scalingFactor;
            if (activeMode === "pip") {
              scalingFactor = 0.25;
            } else if (activeMode === "window" || activeMode === "browser") {
              scalingFactor = 1 / (window.devicePixelRatio || 1);
            } else {
              const baseWidth = 400;
              scalingFactor = baseWidth / width;
              scalingFactor = Math.max(0.25, Math.min(scalingFactor, 1));
              scalingFactor = scalingFactor / (window.devicePixelRatio || 1);
              scalingFactor = Math.max(0.001, scalingFactor);
            }
            engine.setHardwareScalingLevel(scalingFactor);
            engine.resize();
            //console.log("[ResizeObserver] Updated engine scaling level:", scalingFactor, "for width:", width);
          });
        }, 300);
      });
      observer.observe(containerRef.current);
      //console.log("[ResizeObserver] Observer attached to container.");
    }
    return () => {
      if (observer && containerRef.current) {
        observer.unobserve(containerRef.current);
      }
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, [containerRef, engine, activeMode]);

  // Listen for fullscreen changes to auto-exit browser mode when user presses ESC
  useEffect(() => {
    const handleFullscreenChange = () => {
      const currentMode = activeModeRef.current;
      const isEntering = isEnteringFullscreenRef.current;
      const inFullscreen = !!document.fullscreenElement;
      
    //   console.log("[ScreenModeHelper] Fullscreen change detected. activeMode:", currentMode, "fullscreenElement:", inFullscreen, "isEntering flag:", isEntering);
      
      // If we just entered fullscreen, clear the entering flag
      if (isEntering && inFullscreen) {
        // console.log("[ScreenModeHelper] Fullscreen successfully entered, clearing flag");
        isEnteringFullscreenRef.current = false;
        return; // Don't process further, this is expected
      }
      
      // If we exited fullscreen and we're in browser mode, update state to default
      if (currentMode === "browser" && !inFullscreen && !isEntering) {
        // console.log("[ScreenModeHelper] Fullscreen exited, updating mode to default");
        // Directly update the state without calling toggleMode to avoid double-toggling
        setActiveMode("default");
        // Inform parent
        try { 
          if (typeof onModeChange === 'function') {
            onModeChange("default"); 
          }
        } catch (e) { 
          console.warn('[ScreenModeHelper] onModeChange callback threw:', e); 
        }
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
    };
  }, [onModeChange]); // Only depend on onModeChange, use refs for everything else

  // Monitor external window state and handle switch-mode callbacks
  useEffect(() => {
    if (activeMode !== 'window' || !externalWindowRef.current) return;
    
    const checkExternalWindow = () => {
      const extWindow = externalWindowRef.current;
      if (extWindow && extWindow.isDestroyed()) {
        let requestedMode = extWindow._requestedMode || extWindow._externalWindowRequestedMode;
        
        if (!requestedMode) {
          try {
            const stored = localStorage.getItem('_externalWindowRequestedMode');
            if (stored) {
              const data = JSON.parse(stored);
              if (Date.now() - data.timestamp < 5000) {
                requestedMode = data.mode;
              }
              localStorage.removeItem('_externalWindowRequestedMode');
            }
          } catch (e) {}
        }
        
        if (containerRef.current) containerRef.current.style.visibility = 'visible';
        externalWindowRef.current = null;
        
        if (requestedMode === 'fullTab') {
          requestedMode = 'default';
        }
        
        if (requestedMode && requestedMode !== 'window') {
          setTimeout(() => toggleMode(requestedMode), 100);
        } else {
          setActiveMode("default");
          try { if (typeof onModeChange === 'function') onModeChange("default"); } catch (e) {}
        }
      }
    };

    const interval = setInterval(checkExternalWindow, 500);
    return () => clearInterval(interval);
  }, [activeMode, containerRef, toggleMode, onModeChange]);

  // Clean up external window on unmount
  useEffect(() => {
    return () => {
      if (externalWindowRef.current && !externalWindowRef.current.isDestroyed()) {
        externalWindowRef.current.close();
      }
    };
  }, []);

  const iconStyle = { width: "24px", height: "24px" };
  
  const modeIcons = {
    browser: activeMode === "browser" ? "minimize" : "maximize-2", // Show minimize when active, maximize when inactive
    window: "square",
    pip: "picture-in-picture-2",
    default: "circle",
    character: "user",
    web: "globe"
  };

  const buttonStyle = (isActive) => ({
    width: "44px",
    height: "44px",
    marginRight: "8px",
    cursor: "pointer",
    backgroundColor: isActive ? "rgba(139, 92, 246, 0.3)" : "rgba(0, 0, 0, 0.6)",
    border: isActive ? "1px solid rgba(139, 92, 246, 0.5)" : "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    transition: "all 0.2s ease",
    backdropFilter: "blur(10px)",
    pointerEvents: "auto", // Ensure buttons can receive clicks
    userSelect: "none", // Prevent text selection
    WebkitUserSelect: "none",
    MozUserSelect: "none",
    outline: "none", // Remove focus outline
  });

  const modesToDisplay = allowedScreenModes.filter((mode) => mode !== "none");

  useEffect(() => {
    if (helperRef) {
      helperRef.current = { toggleMode, spawnCustomPiP };
      //console.log("[ScreenModeHelper] Helper reference updated.");
    }
  }, [helperRef, toggleMode]);

  function spawnCustomPiP(filePath, header, functionName, options = {}) {
    //console.log("[spawnCustomPiP] Spawning custom PiP for", { filePath, header, functionName, options });
    updateHighestZIndex();
    highestZIndex = Math.max(highestZIndex, 9999);
    highestZIndex++;
    const hostDiv = document.createElement("div");
    hostDiv.classList.add("fresh-pip");
    hostDiv.style.position = "fixed";
    document.body.appendChild(hostDiv);
   // console.log("[spawnCustomPiP] Host div appended to document.body. Initial inline zIndex (pre-update):", hostDiv.style.zIndex);
  
    const closeFreshPiP = () => {
      render(null, hostDiv);
      if (hostDiv.parentNode) hostDiv.parentNode.removeChild(hostDiv);
      //console.log("[spawnCustomPiP] Fresh Pip closed.");
    };
  
    const defaultCustomStyle = {
      width: "440px",
      height: "330px",
      top: "calc(100% - 330px - 10px)",
      left: "calc(100% - 440px - 10px)"
    };
  
    const customStyle = { ...defaultCustomStyle, ...options };
  
    render(
      h(FreshPip, { onClose: closeFreshPiP, filePath, header, functionName, customStyle }),
      hostDiv
    );
    let forced = hostDiv.offsetHeight;
    //console.log("[spawnCustomPiP] Forced reflow value for host div:", forced);
    bringToFront(hostDiv, 9999);
  
    setTimeout(() => {
      const computed = window.getComputedStyle(hostDiv);
      const topVal = parseFloat(computed.top) || 0;
      const leftVal = parseFloat(computed.left) || 0;
      hostDiv.style.top = `${topVal + 1}px`;
      hostDiv.style.left = `${leftVal + 1}px`;
      //console.log("[spawnCustomPiP] Fake move applied. New position:", hostDiv.style.top, hostDiv.style.left);
      setTimeout(() => {
        hostDiv.style.top = `${topVal}px`;
        hostDiv.style.left = `${leftVal}px`;
        //console.log("[spawnCustomPiP] Fake move reverted. Reverted to position:", hostDiv.style.top, hostDiv.style.left);
      }, 50);
    }, 0);
  
    //console.log("[spawnCustomPiP] Spawned custom PiP with final inline zIndex:", hostDiv.style.zIndex);
  }
  
  return (
    <div 
      onClickCapture={(e) => {
        // Capture phase - runs before bubble phase
        // console.log("[ScreenModeHelper] Container click CAPTURE phase, target:", e.target.tagName);
      }}
      onMouseDownCapture={(e) => {
        // Prevent parent container from stealing focus
        if (e.target.tagName === 'BUTTON') {
        //   console.log("[ScreenModeHelper] Button mousedown in capture phase, preventing parent focus");
        }
      }}
      style={{ 
        position: "absolute", 
        top: "16px", 
        right: "16px", 
        zIndex: 10, 
        display: "flex",
        gap: "8px",
        padding: "8px",
        background: "rgba(0, 0, 0, 0.3)",
        borderRadius: "12px",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        pointerEvents: "auto", // Ensure pointer events work
        userSelect: "none", // Prevent text selection
      }}>
      {modesToDisplay.map((mode) => {
        // Create better tooltip text
        let tooltipText = mode.charAt(0).toUpperCase() + mode.slice(1) + " Mode";
        if (mode === "browser") {
          tooltipText = activeMode === "browser" ? "Exit Fullscreen (ESC)" : "Enter Fullscreen";
        } else if (mode === "web") {
          tooltipText = "Open in Default Web Browser";
        }
        
        return (
          <button
            key={mode}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // Prevent default (focus behavior)
              e.stopPropagation();
              console.log("[ScreenModeHelper] Button mousedown for mode:", mode);
              toggleMode(mode); // Trigger immediately on mousedown
            }}
            style={buttonStyle(activeMode === mode)}
            title={tooltipText}
          >
            <dc.Icon 
              icon={modeIcons[mode]} 
              style={{ 
                fontSize: "20px", 
                color: activeMode === mode ? "#8b5cf6" : "rgba(255, 255, 255, 0.7)",
                pointerEvents: "none", // Let clicks pass through icon to button
              }} 
            />
          </button>
        );
      })}
      {activeMode === "pip" && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            // console.log("[ScreenModeHelper] Close PiP button clicked");
            toggleMode("pip"); // Trigger immediately on mousedown
          }}
          style={buttonStyle(false)}
          title="Close Pip"
        >
          <dc.Icon 
            icon="x" 
            style={{ 
              fontSize: "20px", 
              color: "rgba(255, 255, 255, 0.7)",
              pointerEvents: "none",
            }} 
          />
        </button>
      )}
    </div>
  );
};

return { ScreenModeHelper };
