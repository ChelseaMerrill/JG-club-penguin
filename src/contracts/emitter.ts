/**
 * Used by every track: Phaser scenes and DOM overlays share the one
 * `gameEvents` instance built from this shape.
 */
export interface TypedEmitter<M extends object> {
  on<K extends keyof M>(type: K, handler: (payload: M[K]) => void): () => void;
  off<K extends keyof M>(type: K, handler: (payload: M[K]) => void): void;
  once<K extends keyof M>(type: K, handler: (payload: M[K]) => void): () => void;
  emit<K extends keyof M>(type: K, ...args: M[K] extends void ? [] : [M[K]]): void;
}

/**
 * A minimal synchronous typed event emitter (hand-written: no Phaser or
 * eventemitter3 dependency, so `src/contracts` stays importable from plain
 * Node tests).
 *
 * Delivery is synchronous, in subscription order. Handlers are snapshotted
 * before each emit, so calling `off` from inside a handler never skips a
 * remaining handler for that same emit, and a nested `emit` (called from
 * inside a handler) delivers depth-first before the outer emit's remaining
 * handlers run.
 *
 * Handlers are stored in a `Set`: subscribing the same function twice for
 * the same event type registers it once, not twice. `once` returns its own
 * unsubscribe function; calling `off(type, originalHandler)` does not remove
 * a still-pending `once` subscription, because `once` wraps the original
 * handler in a new function that `off` never sees. A handler removed with
 * `off` during an emit still receives that emit: the handler set is
 * snapshotted before delivery starts.
 *
 * A handler that throws is isolated: `emit` reports the error via
 * `console.error` and continues delivering to the remaining handlers, so one
 * throwing listener can never abort a producer's own work (e.g. sign-out).
 */
export function createEmitter<M extends object>(): TypedEmitter<M> {
  type Handler<K extends keyof M> = (payload: M[K]) => void;
  const handlers = new Map<keyof M, Set<Handler<keyof M>>>();

  function on<K extends keyof M>(type: K, handler: Handler<K>): () => void {
    let set = handlers.get(type) as Set<Handler<K>> | undefined;
    if (!set) {
      set = new Set();
      handlers.set(type, set as Set<Handler<keyof M>>);
    }
    set.add(handler);
    return () => off(type, handler);
  }

  function off<K extends keyof M>(type: K, handler: Handler<K>): void {
    (handlers.get(type) as Set<Handler<K>> | undefined)?.delete(handler);
  }

  function once<K extends keyof M>(type: K, handler: Handler<K>): () => void {
    const unsubscribe = on(type, (payload) => {
      unsubscribe();
      handler(payload);
    });
    return unsubscribe;
  }

  function emit<K extends keyof M>(type: K, ...args: M[K] extends void ? [] : [M[K]]): void {
    const set = handlers.get(type) as Set<Handler<K>> | undefined;
    if (!set) return;
    const payload = args[0] as M[K];
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[gameEvents] handler for "${String(type)}" threw`, err);
      }
    }
  }

  return { on, off, once, emit };
}
