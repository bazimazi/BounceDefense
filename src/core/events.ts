type Handler<P> = (payload: P) => void;

/** Minimal typed event bus. */
export class EventBus<E extends object> {
  private handlers: { [K in keyof E]?: Handler<E[K]>[] } = {};

  on<K extends keyof E>(key: K, fn: Handler<E[K]>): () => void {
    const list = (this.handlers[key] ??= []);
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  }

  emit<K extends keyof E>(key: K, payload: E[K]): void {
    const list = this.handlers[key];
    if (!list) return;
    for (const fn of list.slice()) fn(payload);
  }

  clear(): void {
    this.handlers = {};
  }
}
