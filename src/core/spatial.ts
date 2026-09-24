export interface Spatial {
  x: number;
  y: number;
  r: number;
  /** Query stamp used for de-duplication; owned by the hash. */
  _q: number;
}

/**
 * Uniform grid spatial hash. Rebuilt each step (cheap: O(n)); queries are
 * O(cells touched). Designed for hundreds of enemies with dozens of balls.
 */
export class SpatialHash<T extends Spatial> {
  private cells: T[][];
  private used: number[] = [];
  private stamp = 1;
  readonly cols: number;
  readonly rows: number;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
    readonly originY = -200,
  ) {
    this.cols = Math.ceil(width / cellSize) + 2;
    this.rows = Math.ceil((height - originY) / cellSize) + 2;
    this.cells = Array.from({ length: this.cols * this.rows }, () => []);
  }

  clear(): void {
    for (const i of this.used) this.cells[i].length = 0;
    this.used.length = 0;
  }

  private cx(x: number): number {
    const c = Math.floor(x / this.cellSize) + 1;
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private cy(y: number): number {
    const c = Math.floor((y - this.originY) / this.cellSize) + 1;
    return c < 0 ? 0 : c >= this.rows ? this.rows - 1 : c;
  }

  insert(item: T): void {
    const x0 = this.cx(item.x - item.r);
    const x1 = this.cx(item.x + item.r);
    const y0 = this.cy(item.y - item.r);
    const y1 = this.cy(item.y + item.r);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * this.cols + x;
        const cell = this.cells[i];
        if (cell.length === 0) this.used.push(i);
        cell.push(item);
      }
    }
  }

  /** Collect items whose bounding circle may intersect the query circle. */
  query(x: number, y: number, r: number, out: T[]): T[] {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = this.cx(x - r);
    const x1 = this.cx(x + r);
    const y0 = this.cy(y - r);
    const y1 = this.cy(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = this.cells[cy * this.cols + cx];
        for (let k = 0; k < cell.length; k++) {
          const it = cell[k];
          if (it._q === s) continue;
          it._q = s;
          const dx = it.x - x;
          const dy = it.y - y;
          const rr = it.r + r;
          if (dx * dx + dy * dy <= rr * rr) out.push(it);
        }
      }
    }
    return out;
  }
}
