// ─── InputSystem.js ──────────────────────────────────────────────────────────
// Handles ALL keyboard / pointer input for the player character.
// Emits EventBus events — NEVER directly mutates PlayerState or calls other systems.
//
// ★ BUG FIX: The old system called event.stopPropagation() on Babylon KeyboardInfo
//   objects (not real DOM events), causing a TypeError that froze all input.
//   This system ALWAYS calls DOM methods only on kbInfo.event (the real DOM event).
//
// Emitted events:
//   input:keydown     { key: string }
//   input:keyup       { key: string }
//   input:scroll      { direction: 'up'|'down' }
//   input:pointerlock { locked: boolean }
// ─────────────────────────────────────────────────────────────────────────────

const activeFile = dc.resolvePath("WORLD 888.md") || "_RESOURCES/DATACORE/_DONE/WORLD 888/WORLD 888.md";
const folderPath = activeFile.substring(0, activeFile.lastIndexOf('/'));
const { EventBus } = await dc.require(folderPath + "/src/EventBus.js");

const InputSystem = (() => {
  // Keys that we handle for game movement/actions
  const ACTION_KEYS = new Set([
    'w','s','a','d',
    'arrowup','arrowdown','arrowleft','arrowright',
    ' ', 'shift', 'j', 'c', 'control', 'tab'
  ]);

  // Detect platform for scroll direction
  const IS_MAC = (typeof navigator !== 'undefined')
    ? navigator.platform.toUpperCase().includes('MAC')
    : false;

  let _scene         = null;
  let _canvasRef     = null;
  let _isLocked      = false;
  let _kbObserver    = null;
  let _ptrObserver   = null;

  // ── Pointer Lock ─────────────────────────────────────────────────────────

  function _requestLock() {
    const canvas = _canvasRef?.current;
    if (!canvas || _isLocked) return;
    const req = canvas.requestPointerLock || canvas.mozRequestPointerLock || canvas.webkitRequestPointerLock;
    if (req) req.call(canvas);
  }

  function _exitLock() {
    const exit = document.exitPointerLock || document.mozExitPointerLock || document.webkitExitPointerLock;
    if (exit) exit.call(document);
  }

  function _onPointerLockChange() {
    const canvas = _canvasRef?.current;
    const locked = (
      document.pointerLockElement === canvas ||
      document.mozPointerLockElement === canvas ||
      document.webkitPointerLockElement === canvas
    );
    if (locked !== _isLocked) {
      _isLocked = locked;
      EventBus.emit('input:pointerlock', { locked });
    }
  }

  // ── Keyboard ─────────────────────────────────────────────────────────────

  function _onBabylonKeyboard(kbInfo) {
    // kbInfo is a Babylon KeyboardInfo object.
    // kbInfo.event is the REAL DOM KeyboardEvent — only call DOM methods on this.
    const domEvent = kbInfo?.event;
    if (!domEvent || !domEvent.key) return;

    const key  = domEvent.key.toLowerCase();
    const isDown = kbInfo.type === window.BABYLON.KeyboardEventTypes.KEYDOWN;

    // Tab: toggle camera mode + reset input (handle before lock check)
    if (isDown && key === 'tab') {
      if (typeof domEvent.preventDefault  === 'function') domEvent.preventDefault();
      if (typeof domEvent.stopPropagation === 'function') domEvent.stopPropagation();
      EventBus.emit('input:tab', {});
      return;
    }

    // All other action keys only when pointer-locked
    if (!_isLocked) return;
    if (!ACTION_KEYS.has(key)) return;

    if (typeof domEvent.preventDefault  === 'function') domEvent.preventDefault();
    if (typeof domEvent.stopPropagation === 'function') domEvent.stopPropagation();

    EventBus.emit(isDown ? 'input:keydown' : 'input:keyup', { key });
  }

  // ── Pointer / Scroll ─────────────────────────────────────────────────────

  function _onBabylonPointer(ptrInfo) {
    if (!_isLocked) return;
    if (ptrInfo.type !== window.BABYLON.PointerEventTypes.POINTERWHEEL) return;

    const e = ptrInfo.event;
    // Scroll direction is platform-dependent
    const scrollDown = IS_MAC ? (e.deltaY < 0) : (e.deltaY > 0);
    if (typeof e.preventDefault === 'function') e.preventDefault();

    EventBus.emit('input:scroll', { direction: scrollDown ? 'down' : 'up' });
  }

  // ── Canvas click → request pointer lock ──────────────────────────────────

  function _onCanvasClick() {
    if (!_isLocked) _requestLock();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function initialize(scene, canvasRef) {
    _scene     = scene;
    _canvasRef = canvasRef;

    // Babylon observers
    _kbObserver  = scene.onKeyboardObservable.add(_onBabylonKeyboard);
    _ptrObserver = scene.onPointerObservable.add(_onBabylonPointer);

    // Canvas click → request lock
    const canvas = canvasRef?.current;
    if (canvas) {
      canvas.addEventListener('click', _onCanvasClick);
      canvas.tabIndex = 0;
    }

    // Pointer lock change listeners
    document.addEventListener('pointerlockchange',       _onPointerLockChange, false);
    document.addEventListener('mozpointerlockchange',    _onPointerLockChange, false);
    document.addEventListener('webkitpointerlockchange', _onPointerLockChange, false);

    return api;
  }

  function isPointerLocked() { return _isLocked; }
  function requestLock()     { _requestLock(); }
  function exitLock()        { _exitLock(); }

  function dispose() {
    if (_scene) {
      if (_kbObserver)  _scene.onKeyboardObservable.remove(_kbObserver);
      if (_ptrObserver) _scene.onPointerObservable.remove(_ptrObserver);
    }
    const canvas = _canvasRef?.current;
    if (canvas) canvas.removeEventListener('click', _onCanvasClick);

    document.removeEventListener('pointerlockchange',       _onPointerLockChange, false);
    document.removeEventListener('mozpointerlockchange',    _onPointerLockChange, false);
    document.removeEventListener('webkitpointerlockchange', _onPointerLockChange, false);

    if (_isLocked) _exitLock();
    _scene = null; _canvasRef = null; _isLocked = false;
    _kbObserver = null; _ptrObserver = null;
  }

  const api = { initialize, isPointerLocked, requestLock, exitLock, dispose };
  return api;
})();

return { InputSystem };
