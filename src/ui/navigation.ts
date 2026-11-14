interface BackGuard {
  when: () => boolean;
  /** `direct`: Back left this entry itself, rather than passing through it from a page above. */
  act: (direct: boolean) => void;
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

/**
 * One history entry per page; browser, touch, keyboard and Android Back share the same guards.
 *
 * Entries are only ever added for a tap (with user activation). A guard that stops a Back
 * returns to its entry by traversing forward, never by pushing it again: Chromium marks
 * entries added without user activation as skippable, so a re-pushed run would let the next
 * browser or Android WebView Back jump straight past the game and out of it.
 */
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
  /**
   * A history step we issued to return to an entry (a guard re-arming its run, or undoing a
   * Forward onto a retired dialog); its popstate is ignored.
   */
  private bounce: { session: string; id: number; depth: number } | null = null;
  /** Entries opened while a bounce is in flight; pushing then would prune the entries ahead. */
  private deferred: Entry[] = [];
  private watchdog = 0;

  constructor() {
    window.addEventListener('popstate', e => this.pop(e.state));
    // Native bridge (the Android shell): Back arrives as a cancelable DOM event; leaving it
    // uncancelled lets the host do its default (leave the app from Home).
    document.addEventListener('backbutton', e => {
      if (this.back()) { e.preventDefault(); e.stopPropagation(); }
    });
  }

  get busy(): boolean { return this.pending || !!this.operation || !!this.bounce || this.inputLocked; }
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
    this.push(entry);
  }

  private push(entry: Entry): void {
    if (this.bounce) {
      this.deferred = this.deferred.filter(e => e.depth < entry.depth);
      this.deferred.push(entry);
    } else history.pushState(this.state(entry), '');
  }

  /** The bounce landed (or was abandoned): open the entries tapped meanwhile. */
  private settleBounce(): void {
    this.bounce = null;
    const deferred = this.deferred;
    this.deferred = [];
    for (const entry of deferred) if (this.entries.get(entry.id) === entry) history.pushState(this.state(entry), '');
  }

  /**
   * Swap the current page for a sibling at the same depth (bottom-bar tabs): no new history
   * entry, so Back from any tab returns to Battle instead of retracing every tab visited.
   */
  replace(key: string, restore: () => void, options: Omit<View, 'key' | 'restore'> = {}): void {
    if (this.restoring) return;
    const from = this.current;
    if (!from || from.depth === 0 || from.key === key || this.operation || this.pending || this.bounce) {
      this.view(key, restore, options);
      return;
    }
    const entry: Entry = { key, restore, ...options, id: ++this.serial, depth: from.depth };
    for (const [id, old] of this.entries) if (old.depth >= entry.depth) this.entries.delete(id);
    this.entries.set(entry.id, entry);
    this.current = entry;
    this.direction = 'replace';
    history.replaceState(this.state(entry), '');
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
    // While a bounce is in flight, history.state still describes the entry being left.
    const depth = this.bounce?.depth ?? this.read(history.state)?.depth ?? this.current?.depth ?? 0;
    this.session = `${Date.now()}-${++this.serial}`;
    this.entries.clear();
    this.deferred = [];
    const root: Entry = { key: 'home', restore: restoreHome, id: ++this.serial, depth: 0 };
    const children: Entry[] = child ? [{ ...child, id: ++this.serial, depth: 1 }] : [];
    this.current = children[0] ?? root;
    this.pending = false;
    if (depth > 0) {
      this.operation = { root, children };
      this.traverse(-depth);
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
    if (this.pending || this.operation || this.bounce || (this.inputLocked && !explicit)) return true;
    if (!this.current || this.current.key === 'home') return false;
    this.lockInput();
    if (steps === 1 && this.current.guard?.when()) {
      this.current.guard.act(true);
    } else {
      this.pending = true;
      this.traverse(-Math.min(steps, this.current.depth));
    }
    return true;
  }

  /**
   * Scripted traversals are asynchronous and not guaranteed: WebKit keeps only the last one
   * queued in a task, and Firefox lets a pushState in the same task cancel it. history.state
   * changes in the same task that fires popstate, so if neither happened in time, the step
   * was dropped. Recover instead of waiting forever with Back disabled.
   */
  private traverse(delta: number): void {
    window.clearTimeout(this.watchdog);
    this.watchdog = window.setTimeout(() => this.recover(), 800);
    // go(0) would reload the page; recover() settles whatever was waiting on the step.
    if (delta) history.go(delta);
  }

  private recover(): void {
    const state = this.read(history.state);
    if (this.operation) {
      // Still above the root of the retired stack: walk down again. At the root, commit.
      if (state && state.depth > 0) this.traverse(-state.depth);
      else this.pop(history.state);
    } else if (this.bounce && state && state.session === this.bounce.session && state.id !== this.bounce.id && state.depth !== this.bounce.depth) {
      this.traverse(this.bounce.depth - state.depth);
    } else {
      // A dropped Back simply did not happen; the player can press it again.
      this.pending = false;
      this.settleBounce();
    }
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

  /** A tap that changes the page (Pause) is not undone by a Back already on its way. */
  hold(): void {
    this.lockInput();
  }

  private lockInput(): void {
    this.inputLocked = true;
    window.clearTimeout(this.unlockTimer);
    this.unlockTimer = window.setTimeout(() => { this.inputLocked = false; }, 180);
  }

  /**
   * Return to `target` after a Back landed at depth `landing` below it. The entries in between
   * are still ahead in the session history, so traverse forward to them. A Back pressed while the
   * step is in flight is absorbed (history is corrected once it is quiet), and the watchdog
   * retries a dropped step.
   */
  private rearm(target: Entry, landing: number): void {
    this.current = target;
    this.pending = false;
    if (target.depth <= landing) return;
    this.bounce = { session: this.session, id: target.id, depth: target.depth };
    this.traverse(target.depth - landing);
  }

  private pop(value: unknown): void {
    window.clearTimeout(this.watchdog);
    const state = this.read(value);
    const bounce = this.bounce;
    if (bounce) {
      if (state?.session === bounce.session && state.id === bounce.id) { this.settleBounce(); return; }
      // Another traversal moved history elsewhere: a quick second Back, or one of our own steps
      // queued behind it. Steps are relative, so one issued now could overshoot once the queue
      // drains (onto a page left ahead, like Settings above the run). Wait until history is
      // quiet, then step to the entry once more from wherever it really is.
      this.watchdog = window.setTimeout(() => this.recover(), 60);
      return;
    }
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
    // One traversal can skip several entries (a long-press history menu, engines that merge
    // queued steps, or Chromium skipping entries it considers unactivated). Entries are left
    // deepest-first, so the first active guard stops the traversal: a live run is never
    // dropped by landing on Home, and a draft is never left without its prompt.
    const landing = state?.depth ?? 0;
    const stop = backward ? [from, ...[...this.entries.values()].filter(e => e.depth > landing && e.depth < from.depth)
      .sort((a, b) => b.depth - a.depth)].find(e => e.guard?.when()) : undefined;
    if (backward && stop) {
      this.rearm(stop, landing);
      this.lockInput();
      if (stop !== from) {
        this.direction = 'back';
        this.restoring = true;
        try { stop.restore(); from.cancel?.(); } finally { this.restoring = false; }
      }
      stop.guard!.act(stop === from);
      return;
    }
    const target = state?.session === this.session ? this.entries.get(state.id) : undefined;
    if (!target || (target.valid && !target.valid())) {
      // Forward onto a dialog whose question no longer applies (a discard prompt after the
      // draft was applied) steps back to the page the player was on instead of leaving it.
      if (target && from && state && state.depth > from.depth && this.entries.get(from.id) === from && (!from.valid || from.valid())) {
        this.bounce = { session: this.session, id: from.id, depth: from.depth };
        this.traverse(from.depth - state.depth);
        return;
      }
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
