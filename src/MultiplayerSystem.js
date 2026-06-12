// ─── MultiplayerSystem.js ────────────────────────────────────────────────────
// Handles dual-transport multiplayer:
//   1. BroadcastChannel  — same machine, same browser (Obsidian tabs)
//   2. SSE + HTTP POST   — cross-device / Obsidian ↔ Browser via localhost:8885
//
// Ghost models: cat.glb with a unique per-player color tint
// Listens to:  player:position, player:velocity (EventBus)
// Emits:       nothing — manages remote ghost rendering directly
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/World888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));

const { EventBus } = await dc.require(folderPath + "/src/EventBus.js");

const MultiplayerSystem = (() => {
  const CHANNEL_NAME    = 'obsidian-world-builder-sync';
  const SERVER_PORT     = 8885;
  const SEND_INTERVAL   = 50;    // ms between state broadcasts
  const PRUNE_INTERVAL  = 8000;  // ms between stale player prunes
  const STALE_THRESHOLD = 5000;  // ms with no message = stale player

  let _scene          = null;
  let _movementSystem = null;
  let _passcode       = null;
  let _instanceId     = null;
  let _catGlbUrl      = null;  // URL to cat.glb for ghost models
  let _channel        = null;  // BroadcastChannel
  let _sse            = null;  // EventSource
  let _serverBase     = null;  // http://localhost:8885 or null
  let _cleanedUp      = false;

  let _sendTimer  = null;
  let _pruneTimer = null;
  let _sceneDisposeObserver = null;

  const _remotePlayers = new Map();
  let _unsubs = [];
  let _lastPos = { x: 0, y: 0, z: 0 };
  let _lastVel = { vx: 0, vy: 0, vz: 0 };

  // ── Color generation ─────────────────────────────────────────────────────

  function _idToColor(id) {
    // Hash player ID to a hue, then convert HSL → RGB
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) & 0xFFFFFF;
    }
    const hue = ((hash % 360) + 360) % 360;
    const s = 0.75, l = 0.65;
    // HSL to RGB
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
    const m = l - c / 2;
    let r, g, b;
    if      (hue < 60)  { r = c; g = x; b = 0; }
    else if (hue < 120) { r = x; g = c; b = 0; }
    else if (hue < 180) { r = 0; g = c; b = x; }
    else if (hue < 240) { r = 0; g = x; b = c; }
    else if (hue < 300) { r = x; g = 0; b = c; }
    else                { r = c; g = 0; b = x; }
    return new window.BABYLON.Color3(r + m, g + m, b + m);
  }

  function _tintMeshes(meshes, color) {
    // Apply a color overlay to all meshes in a loaded GLB
    meshes.forEach(mesh => {
      if (!mesh.material) return;
      try {
        // PBRMaterial
        if (mesh.material.albedoColor !== undefined) {
          mesh.material = mesh.material.clone(`ghost_mat_${mesh.name}`);
          mesh.material.albedoColor = color;
          mesh.material.alpha = 0.85;
        }
        // StandardMaterial
        else if (mesh.material.diffuseColor !== undefined) {
          mesh.material = mesh.material.clone(`ghost_mat_${mesh.name}`);
          mesh.material.diffuseColor = color;
          mesh.material.alpha = 0.85;
        }
      } catch (_) {}
    });
  }

  // ── Ghost management ──────────────────────────────────────────────────────

  function _getOrCreateGhost(id) {
    if (_remotePlayers.has(id)) return _remotePlayers.get(id);

    const color = _idToColor(id);

    // Start with a thin invisible root transform node as placeholder
    const root = new window.BABYLON.TransformNode(`ghostRoot_${id}`, _scene);
    root.setEnabled(false); // hidden until model loads

    const entry = {
      root,
      mesh:        null,  // loaded GLB root mesh
      anims:       {},    // animation groups keyed by name
      currentAnim: null,
      lastSeen:    Date.now(),
      lastState:   null,
      color,
    };
    _remotePlayers.set(id, entry);

    // Async load cat.glb for this ghost
    if (_catGlbUrl && window.BABYLON?.SceneLoader) {
      const cleanUrl  = _catGlbUrl.split('?')[0];
      const lastSlash = cleanUrl.lastIndexOf('/');
      const rootUrl   = cleanUrl.substring(0, lastSlash + 1);
      const filename  = cleanUrl.substring(lastSlash + 1);

      window.BABYLON.SceneLoader.ImportMeshAsync('', rootUrl, filename, _scene, null, '.glb')
        .then(result => {
          if (_cleanedUp || !_remotePlayers.has(id)) {
            // Already disposed — clean up the loaded model
            result.meshes.forEach(m => { try { m.dispose(); } catch (_) {} });
            result.animationGroups.forEach(ag => { try { ag.dispose(); } catch (_) {} });
            return;
          }

          const glbRoot = result.meshes.find(m => m.name === '__root__') || result.meshes[0];
          if (glbRoot) {
            glbRoot.parent = root;
            glbRoot.position.y = -0.9; // feet to bottom of capsule
            root.setEnabled(true);
          }

          // Apply unique color tint to all meshes
          _tintMeshes(result.meshes, color);

          // Store animation groups
          result.animationGroups.forEach(ag => {
            ag.stop();
            entry.anims[ag.name] = ag;
          });

          entry.mesh = glbRoot;

          // Start idle/walk anim immediately
          _playGhostAnim(entry, 'Walking');
        })
        .catch(err => {
          console.warn(`[MultiplayerSystem] Failed to load ghost model for ${id.slice(-6)}:`, err);
          // Fallback: show a tinted capsule
          if (!_cleanedUp && _remotePlayers.has(id)) {
            const cap = window.BABYLON.MeshBuilder.CreateCapsule(
              `ghostCap_${id}`, { height: 1.8, radius: 0.5, subdivisions: 4 }, _scene
            );
            cap.parent = root;
            cap.isPickable = false;
            const mat = new window.BABYLON.StandardMaterial(`ghostCapMat_${id}`, _scene);
            mat.diffuseColor = color;
            mat.alpha = 0.75;
            cap.material = mat;
            cap.rotationQuaternion = window.BABYLON.Quaternion.Identity();
            entry.mesh = cap;
            root.setEnabled(true);
          }
        });
    } else {
      // No cat.glb URL — use colored capsule immediately
      const cap = window.BABYLON.MeshBuilder.CreateCapsule(
        `ghostCap_${id}`, { height: 1.8, radius: 0.5, subdivisions: 4 }, _scene
      );
      cap.parent = root;
      cap.isPickable = false;
      const mat = new window.BABYLON.StandardMaterial(`ghostCapMat_${id}`, _scene);
      mat.diffuseColor = color;
      mat.alpha = 0.75;
      cap.material = mat;
      cap.rotationQuaternion = window.BABYLON.Quaternion.Identity();
      entry.mesh = cap;
      root.setEnabled(true);
    }

    return entry;
  }

  function _playGhostAnim(entry, name) {
    if (!entry.anims) return;
    const target = entry.anims[name] || entry.anims['Walking'];
    if (!target || target === entry.currentAnim) return;
    if (entry.currentAnim) entry.currentAnim.stop();
    target.play(true);
    entry.currentAnim = target;
  }

  function _updateGhost(data) {
    if (!data?.id || data.id === _instanceId) return;
    const entry = _getOrCreateGhost(data.id);
    entry.lastSeen = Date.now();

    // Update position via the root transform node
    if (data.position) {
      entry.root.position.set(data.position.x, data.position.y, data.position.z);
    }

    // Update orientation
    if (data.orientation) {
      const q = data.orientation;
      if (!entry.root.rotationQuaternion) {
        entry.root.rotationQuaternion = window.BABYLON.Quaternion.Identity();
      }
      entry.root.rotationQuaternion.set(q.x, q.y, q.z, q.w);
    }

    // Crouch scale
    const scaleY = data.isCrouching ? 0.5 : 1.0;
    if (Math.abs(entry.root.scaling.y - scaleY) > 0.01) {
      entry.root.scaling.y = scaleY;
    }

    // Animation based on state
    if (data.state !== entry.lastState) {
      entry.lastState = data.state;
      if (data.isSliding || data.state === 'SLIDING') {
        _playGhostAnim(entry, 'Walking');
      } else if (data.isSprinting && !data.isCrouching) {
        _playGhostAnim(entry, 'Running');
      } else if (data.state === 'ON_GROUND') {
        _playGhostAnim(entry, 'Walking');
      } else {
        _playGhostAnim(entry, 'Walking');
      }
    }
  }

  function _removeGhost(id) {
    const entry = _remotePlayers.get(id);
    if (!entry) return;
    // Stop all anims
    Object.values(entry.anims).forEach(ag => { try { ag.stop(); ag.dispose(); } catch (_) {} });
    // Dispose all children of root
    if (entry.root) {
      entry.root.getChildMeshes().forEach(m => { try { m.dispose(); } catch (_) {} });
      try { entry.root.dispose(); } catch (_) {}
    }
    _remotePlayers.delete(id);
  }

  function _pruneStale() {
    const now = Date.now();
    for (const [id, entry] of _remotePlayers) {
      if (now - entry.lastSeen > STALE_THRESHOLD) _removeGhost(id);
    }
  }

  // ── BroadcastChannel (same-device tabs) ──────────────────────────────────

  function _setupChannel() {
    if (typeof BroadcastChannel === 'undefined') return null;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.onmessage = (evt) => {
      if (_cleanedUp) return;
      const data = evt.data;
      if (!data || data.id === _instanceId) return;
      if (data.passcode !== _passcode) return;
      if (data.type === 'PLAYER_STATE')   _updateGhost(data);
      else if (data.type === 'PLAYER_LEFT') _removeGhost(data.id);
    };
    ch.onmessageerror = (err) => console.warn('[MultiplayerSystem] BroadcastChannel error:', err);
    return ch;
  }

  // ── SSE transport (cross-device / Browser ↔ Obsidian) ────────────────────
  // IMPORTANT: Always try localhost:8885 regardless of window.location.hostname.
  // In Obsidian, the hostname is 'obsidian.md' but the server is on the same machine.

  async function _detectServer() {
    try {
      const res = await fetch(`http://localhost:${SERVER_PORT}/status`, {
        signal: AbortSignal.timeout(2000)
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.ok ? `http://localhost:${SERVER_PORT}` : null;
    } catch (_) {
      return null;
    }
  }

  function _setupSSE(baseUrl) {
    if (!baseUrl || typeof EventSource === 'undefined') return null;
    const url = `${baseUrl}/events?id=${_instanceId}&passcode=${encodeURIComponent(_passcode)}`;
    const es = new EventSource(url);
    es.onmessage = (evt) => {
      if (_cleanedUp) return;
      try {
        const data = JSON.parse(evt.data);
        if (!data) return;
        if (data.type === 'UPDATE_STATE' && data.senderId !== _instanceId) {
          const p = data.payload || {};
          _updateGhost({
            id:          data.senderId,
            position:    p.position,
            orientation: p.orientation,
            isCrouching: p.isCrouching,
            isSprinting: p.isSprinting,
            isSliding:   p.isSliding,
            state:       p.state,
          });
        } else if (data.type === 'PLAYER_LEFT' && data.senderId !== _instanceId) {
          _removeGhost(data.senderId);
        }
      } catch (_) {}
    };
    es.onerror = () => {
      if (!_cleanedUp) console.warn('[MultiplayerSystem] SSE error — will auto-retry.');
    };
    return es;
  }

  // ── Send state (both transports) ──────────────────────────────────────────

  function _sendState() {
    if (_cleanedUp) return;
    const snap = _getLocalSnapshot();
    if (!snap) return;

    // 1. BroadcastChannel (same device)
    if (_channel) {
      try { _channel.postMessage(snap); } catch (_) {}
    }

    // 2. HTTP POST to server (cross-device/Obsidian↔Browser)
    if (_serverBase) {
      const body = JSON.stringify({
        id:          snap.id,
        name:        `Player_${snap.id.slice(-4)}`,
        position:    snap.position,
        rotation:    snap.orientation?.y ?? 0,
        orientation: snap.orientation,
        isCrouching: snap.isCrouching,
        isSprinting: snap.isSprinting,
        isSliding:   snap.isSliding,
        state:       snap.state,
      });
      fetch(`${_serverBase}/sync`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'x-passcode': _passcode },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ── Local state snapshot ─────────────────────────────────────────────────

  function _getLocalSnapshot() {
    const ps = _movementSystem?.getPlayerState();
    if (!ps) return null;
    return {
      type:        'PLAYER_STATE',
      id:          _instanceId,
      passcode:    _passcode,
      state:       ps.state,
      isCrouching: ps.isCrouching,
      isSprinting: ps.isSprinting,
      isSliding:   ps.state === 'SLIDING',
      position:    _lastPos,
      velocity:    _lastVel,
      orientation: ps.characterTargetOrientation
        ? { x: ps.characterTargetOrientation.x, y: ps.characterTargetOrientation.y,
            z: ps.characterTargetOrientation.z, w: ps.characterTargetOrientation.w }
        : { x: 0, y: 0, z: 0, w: 1 },
      ts: Date.now(),
    };
  }

  // ── EventBus listeners ────────────────────────────────────────────────────

  function _onPosition(pos) { _lastPos = pos; }
  function _onVelocity(vel) { _lastVel = vel; }

  // ── Public API ────────────────────────────────────────────────────────────

  function initialize({ scene, movementSystem, passcode, catGlbUrl }) {
    _scene          = scene;
    _movementSystem = movementSystem;
    _passcode       = passcode;
    _catGlbUrl      = catGlbUrl || null;
    _instanceId     = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

    // 1. Same-device BroadcastChannel
    _channel = _setupChannel();

    // 2. Always try to find the local server (works from both Obsidian and browser)
    const _pollForServer = () => {
      if (_cleanedUp || _serverBase) return;
      _detectServer().then(baseUrl => {
        if (_cleanedUp || _serverBase) return;
        if (baseUrl) {
          _serverBase = baseUrl;
          _sse = _setupSSE(baseUrl);
          console.log('[MultiplayerSystem] SSE connected to server at', baseUrl);
        } else {
          // If we haven't found it yet, try again in 3 seconds
          setTimeout(_pollForServer, 3000);
        }
      });
    };
    
    // Start polling immediately
    _pollForServer();

    // Timers
    _sendTimer  = setInterval(_sendState, SEND_INTERVAL);
    _pruneTimer = setInterval(_pruneStale, PRUNE_INTERVAL);

    // EventBus
    _unsubs.push(EventBus.on('player:position', _onPosition));
    _unsubs.push(EventBus.on('player:velocity', _onVelocity));

    // Cleanup when scene is disposed
    _sceneDisposeObserver = scene.onDisposeObservable.addOnce(() => dispose());

    return api;
  }

  function getInstanceId()        { return _instanceId; }
  function isConnectedToServer()  { return !!_serverBase; }

  function dispose() {
    if (_cleanedUp) return;
    _cleanedUp = true;

    // Announce departure
    if (_channel) {
      try {
        _channel.postMessage({ type: 'PLAYER_LEFT', id: _instanceId, passcode: _passcode });
        _channel.onmessage = null;
        _channel.close();
        _channel = null;
      } catch (_) {}
    }
    if (_serverBase) {
      try {
        fetch(`${_serverBase}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-passcode': _passcode },
          body: JSON.stringify({ id: _instanceId }),
          keepalive: true,
        }).catch(() => {});
      } catch (_) {}
    }
    if (_sse) { try { _sse.close(); } catch (_) {} _sse = null; }

    clearInterval(_sendTimer);
    clearInterval(_pruneTimer);
    _sendTimer = null; _pruneTimer = null;

    for (const u of _unsubs) u();
    _unsubs = [];

    // Dispose all ghosts
    for (const [id] of _remotePlayers) _removeGhost(id);
    _remotePlayers.clear();

    if (_scene && _sceneDisposeObserver) {
      _scene.onDisposeObservable.remove(_sceneDisposeObserver);
    }
    _scene = null; _movementSystem = null;
  }

  const api = { initialize, getInstanceId, isConnectedToServer, dispose };
  return api;
})();

return { MultiplayerSystem };
