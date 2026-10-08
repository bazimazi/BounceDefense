interface BackGuard {
  when: () => boolean;
  act: () => void;
}

interface View {
  key: string;
  restore: () => void;
  guard?: BackGuard;
  valid?: () => boolean;
  cancel?: () => void;
}

interface Entry extends View {
  id: number;
  depth: number;
}

interface NavigationState {
  bounceDefense: true;
  session: string;
  id: number;
  depth: number;
}

/** One history entry per page; browser, touch and keyboard Back share the same guards. */
export class Navigation {
  direction: 'forward' | 'back' | 'replace' = 'forward';
  private session = '';
  private serial = 0;
  private entries = new Map<number, Entry>();
  private current: Entry | null = null;
  private root: (() => void) | null = null;
  private restoring = false;
  private pending = false;
  private inputLocked = false;
  private unlockTimer = 0;
  private operation: { root: Entry; children: Entry[] } | null = null;

  constructor() {
    window.addEventListener('popstate', e => this.pop(e.state));
    // Optional embedding bridge: forward native Back as a cancelable DOM event.
    document.addEventListener('backbutton', e => {
      if (this.back()) { e.preventDefault(); e.stopPropagation(); }
    });
  }

  get busy(): boolean { return this.pending || !!this.operation || this.inputLocked; }
  get key(): string { return this.current?.key ?? 'home'; }

  view(key: string, restore: () => void, options: Omit<View, 'key' | 'restore'> = {}): void {
    if (this.restoring) return;
    const view = { key, restore, ...options };
    if (this.current?.key === key) {
      this.direction = 'replace';
      Object.assign(this.current, view);
      return;
    }
    const entry = { ...view, id: ++this.serial, depth: (this.current?.depth ?? 0) + 1 };
    this.direction = 'forward';
    // Run completion can happen while Home is collapsing an earlier history stack.
    if (this.operation) {
      entry.depth = this.operation.children.length + 1;
      this.operation.children.push(entry);
      this.current = entry;
      return;
    }
    for (const [id, old] of this.entries) if (old.depth >= entry.depth) this.entries.delete(id);
    this.entries.set(entry.id, entry);
    this.current = entry;
    history.pushState(this.state(entry), '');
  }

  /** Retire a finished run (and its dialogs), preserving a single Home entry beneath Results. */
  reset(restoreHome: () => void, child?: View): void {
    if (this.restoring) return;
    this.direction = child ? 'forward' : 'back';
    this.root = restoreHome;
    if (this.operation) {
      this.operation.children = child ? [{ ...child, id: ++this.serial, depth: 1 }] : [];
      this.current = this.operation.children[0] ?? this.operation.root;
      return;
    }
    const depth = this.read(history.state)?.depth ?? this.current?.depth ?? 0;
    this.session = `${Date.now()}-${++this.serial}`;
    this.entries.clear();
    const root: Entry = { key: 'home', restore: restoreHome, id: ++this.serial, depth: 0 };
    const children: Entry[] = child ? [{ ...child, id: ++this.serial, depth: 1 }] : [];
    this.current = children[0] ?? root;
    this.pending = false;
    if (depth > 0) {
      this.operation = { root, children };
      history.go(-depth);
    } else this.commitReset(root, children);
  }

  /** Returns false at Home, allowing the browser/webview's normal exit behavior. */
  back(steps = 1): boolean {
    return this.requestBack(steps, false);
  }

  /** Explicit Resume/Cancel buttons are new actions, even just after pressing Back. */
  dismiss(steps = 1): boolean {
    return this.requestBack(steps, true);
  }

  private requestBack(steps: number, explicit: boolean): boolean {
    if (this.pending || this.operation || (this.inputLocked && !explicit)) return true;
    if (!this.current || this.current.key === 'home') return false;
    this.lockInput();
    if (steps === 1 && this.current.guard?.when()) {
      this.current.guard.act();
    } else {
      this.pending = true;
      history.go(-Math.min(steps, this.current.depth));
    }
    return true;
  }

  private read(value: unknown): NavigationState | null {
    const s = value as Partial<NavigationState> | null;
    return s?.bounceDefense === true && typeof s.session === 'string' && Number.isSafeInteger(s.id) &&
      Number.isSafeInteger(s.depth) && s.depth! >= 0 ? s as NavigationState : null;
  }

  private state(entry: Entry): NavigationState {
    return { bounceDefense: true, session: this.session, id: entry.id, depth: entry.depth };
  }

  private commitReset(root: Entry, children: Entry[]): void {
    this.entries.set(root.id, root);
    history.replaceState(this.state(root), '');
    for (const child of children) {
      this.entries.set(child.id, child);
      history.pushState(this.state(child), '');
    }
    this.current = children.at(-1) ?? root;
    this.operation = null;
    this.pending = false;
  }

  private lockInput(): void {
    this.inputLocked = true;
    window.clearTimeout(this.unlockTimer);
    this.unlockTimer = window.setTimeout(() => { this.inputLocked = false; }, 180);
  }

  private rearm(from: Entry, depth: number): void {
    // Rebuild any skipped parents synchronously. An asynchronous history.forward()
    // can be cancelled by another hardware Back press and leave input stuck.
    const parents = [...this.entries.values()].filter(e => e.depth > depth && e.depth <= from.depth).sort((a, b) => a.depth - b.depth);
    for (const entry of parents) history.pushState(this.state(entry), '');
    this.current = from;
    this.pending = false;
  }

  private pop(value: unknown): void {
    const state = this.read(value);
    const operation = this.operation;
    if (operation) {
      this.commitReset(operation.root, operation.children);
      return;
    }
    const from = this.current;
    const backward = from && (!state || state.depth < from.depth);
    const requested = this.pending;
    this.pending = false;
    if (backward && this.inputLocked && !requested) {
      this.rearm(from, state?.depth ?? 0);
      return;
    }
    // popstate arrives AFTER history has moved. Restore the guarded entry before
    // opening Pause or a discard dialog, so the new layer has the correct parent.
    if (backward && from.guard?.when()) {
      this.rearm(from, state?.depth ?? 0);
      this.lockInput();
      from.guard.act();
      return;
    }
    const target = state?.session === this.session ? this.entries.get(state.id) : undefined;
    if (!target || (target.valid && !target.valid())) {
      // Forward after a completed run, or old entries after reload, must never
      // resurrect a World, an obsolete dialog, or an unapplied talent draft.
      if (this.root) {
        this.reset(this.root);
        this.restoring = true;
        try { this.root(); } finally { this.restoring = false; }
      }
      return;
    }
    this.current = target;
    this.direction = backward ? 'back' : 'forward';
    if (backward) this.lockInput();
    this.restoring = true;
    try {
      target.restore();
      if (backward) from.cancel?.();
    } finally { this.restoring = false; }
  }
}
