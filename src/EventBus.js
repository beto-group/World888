// ─── EventBus.js ─────────────────────────────────────────────────────────────
// Singleton typed pub/sub. Zero external dependencies.
// All systems communicate exclusively through this — no direct cross-system calls.
//
// Event Catalog:
//   input:keydown        { key: string }
//   input:keyup          { key: string }
//   input:scroll         { direction: 'up'|'down' }
//   input:pointerlock    { locked: boolean }
//   player:stateChange   { prev: string, next: string }
//   player:velocity      { vx, vy, vz }
//   player:position      { x, y, z }
//   player:crouch        { isCrouching: boolean }
//   player:jump          { source: string }
//   camera:offsetY       { y: number }
//   camera:modeChange    { mode: 'first'|'third' }
//   engine:beforeRender  { dt: number }
//   engine:dispose       {}
// ─────────────────────────────────────────────────────────────────────────────

const EventBus = (() => {
  /** @type {Record<string, Array<{fn: Function, ctx: any, once: boolean}>>} */
  const _channels = {};

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} fn
   * @param {any} [ctx]  - optional `this` context for `fn`
   * @returns {Function} unsubscribe function
   */
  function on(event, fn, ctx) {
    if (!_channels[event]) _channels[event] = [];
    const entry = { fn, ctx: ctx || null, once: false };
    _channels[event].push(entry);
    return () => _remove(event, entry);
  }

  /**
   * Subscribe once — auto-unsubscribes after first call.
   */
  function once(event, fn, ctx) {
    if (!_channels[event]) _channels[event] = [];
    const entry = { fn, ctx: ctx || null, once: true };
    _channels[event].push(entry);
    return () => _remove(event, entry);
  }

  /**
   * Unsubscribe a specific handler.
   */
  function off(event, fn) {
    if (!_channels[event]) return;
    _channels[event] = _channels[event].filter(e => e.fn !== fn);
  }

  function _remove(event, entry) {
    if (!_channels[event]) return;
    const idx = _channels[event].indexOf(entry);
    if (idx !== -1) _channels[event].splice(idx, 1);
  }

  /**
   * Emit an event to all subscribers.
   * Errors in handlers are caught and logged — one bad handler never kills the pipeline.
   */
  function emit(event, data) {
    const channel = _channels[event];
    if (!channel || channel.length === 0) return;

    // Snapshot to avoid mutation issues during iteration
    const snapshot = channel.slice();
    for (const entry of snapshot) {
      try {
        entry.fn.call(entry.ctx, data);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
      if (entry.once) _remove(event, entry);
    }
  }

  /**
   * Remove all listeners for an event (or all events if none given).
   */
  function clear(event) {
    if (event) {
      delete _channels[event];
    } else {
      const keys = Object.keys(_channels);
      for (const k of keys) delete _channels[k];
    }
  }

  /** Debug: list all active event channels and listener counts. */
  function debug() {
    return Object.fromEntries(
      Object.entries(_channels).map(([k, v]) => [k, v.length])
    );
  }

  return { on, once, off, emit, clear, debug };
})();

return { EventBus };
