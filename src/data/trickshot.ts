import { localize } from '../i18n/content';

/**
 * Trickshot: a puzzle mode. Each stage is a fixed board of crystals and arena devices, cleared with
 * a handful of single-ball shots. Nothing moves and nothing attacks: the challenge is the angle.
 *
 * Crystal kinds:
 * - `crystal` shatters on any touch and lets the ball fly on.
 * - `armored` takes two hits; the first one turns the ball away.
 * - `bank` only shatters for a ball that has already bounced (walls, bumpers, armor); a direct hit glances off.
 * - `bomb` shatters and cracks every crystal within `BOMB_RADIUS`.
 * - `key` shatters and opens every gate on the board.
 *
 * Every stage stores a `solution` (aim angles in degrees, found by `scripts/trickshot-solve.ts`) that
 * clears it in `par` shots; `tests/arcade.test.ts` replays each one, so a layout change that breaks a
 * stage cannot ship.
 */
export type CrystalKind = 'crystal' | 'armored' | 'bank' | 'bomb' | 'key';

export interface StageDef {
  id: string;
  chapter: number;
  name: string;
  /** One line shown before the first shot. */
  tip: string;
  /** Shots allowed. */
  shots: number;
  /** Shots for three stars (two stars: one more). */
  par: number;
  /** Bounces drawn by the aim preview. */
  preview: number;
  /** Bounces a shot may make before the ball fizzles out (walls, rails, bumpers and armor all count). */
  bounces: number;
  targets: [CrystalKind, number, number][];
  bumpers?: [number, number, number][];
  deflectors?: [number, number, number, number][];
  walls?: [number, number, number, number][];
  /** Walls that open when a key crystal shatters. */
  gates?: [number, number, number, number][];
  portals?: [number, number, number, number][];
  wells?: [number, number, number, number][];
  boosters?: [number, number, number][];
  /** Aim angles (degrees) that clear the stage in `par` shots. */
  solution: number[];
}

export interface ChapterDef {
  id: string;
  n: number;
  name: string;
  /** Arena skin the chapter is played on. */
  arena: string;
  color: string;
}

export const CRYSTAL_RADIUS: Record<CrystalKind, number> = { crystal: 15, armored: 17, bank: 16, bomb: 16, key: 15 };
export const CRYSTAL_HP: Record<CrystalKind, number> = { crystal: 1, armored: 2, bank: 1, bomb: 1, key: 1 };
export const BOMB_RADIUS = 105;
/** Seconds a trickshot ball may fly before it is called home. */
export const TRICK_FLIGHT = 11;

export const CHAPTERS: ChapterDef[] = [
  { id: 'ch1', n: 1, name: 'First Light', arena: 'proving', color: '#7ef0d2' },
  { id: 'ch2', n: 2, name: 'Rift Geometry', arena: 'rift', color: '#c77dff' },
  { id: 'ch3', n: 3, name: 'The Spire', arena: 'spire', color: '#ffd166' },
];

export const STAGES: StageDef[] = [
  // ---------------------------------------------------------------- chapter 1: First Light
  {
    id: 't1', chapter: 1, name: 'Opening Shot', tip: 'Crystals shatter and let the ball fly on. Line them up.',
    shots: 3, par: 1, preview: 2, bounces: 3,
    targets: [['crystal', 270, 620], ['crystal', 270, 470], ['crystal', 270, 320], ['crystal', 270, 170]],
    solution: [-90],
  },
  {
    id: 't2', chapter: 1, name: 'Angles', tip: 'Every crystal on one line: find it.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['crystal', 376, 607], ['crystal', 439, 471], ['crystal', 502, 335], ['crystal', 160, 560]],
    solution: [-64.25, -112],
  },
  {
    id: 't3', chapter: 1, name: 'Off the Wall', tip: 'The wall hides the prize. Bank off the side.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['crystal', 270, 330], ['crystal', 200, 250], ['crystal', 340, 250]],
    walls: [[150, 420, 390, 420]],
    solution: [-117.25, -154.5],
  },
  {
    id: 't4', chapter: 1, name: 'Bank Crystals', tip: 'Ringed crystals only break after a bounce.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['bank', 270, 560], ['bank', 160, 380], ['bank', 380, 380], ['crystal', 270, 200]],
    solution: [-132.25, -90],
  },
  {
    id: 't5', chapter: 1, name: 'Bumper Alley', tip: 'Bumpers kick the ball away faster.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['crystal', 90, 200], ['crystal', 450, 200], ['crystal', 270, 160], ['bank', 270, 450]],
    bumpers: [[170, 420, 26], [370, 420, 26], [270, 300, 26]],
    solution: [-143, -118.5],
  },
  {
    id: 't6', chapter: 1, name: 'Pockets', tip: 'Two pockets, one shot each... or one clever one.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['crystal', 80, 300], ['crystal', 80, 220], ['crystal', 460, 300], ['crystal', 460, 220]],
    walls: [[150, 180, 150, 400], [390, 180, 390, 400], [20, 400, 110, 400], [430, 400, 520, 400]],
    solution: [-108, -72],
  },
  {
    id: 't7', chapter: 1, name: 'Armor', tip: 'Armored crystals need two hits and turn the ball away.',
    shots: 6, par: 4, preview: 2, bounces: 3,
    targets: [['armored', 200, 330], ['armored', 340, 330], ['crystal', 270, 180], ['crystal', 110, 200], ['crystal', 430, 200]],
    solution: [-122, -139.25, -155.75, -77.25],
  },
  {
    id: 't8', chapter: 1, name: 'Chain Reaction', tip: 'A bomb crystal cracks everything around it.',
    shots: 3, par: 1, preview: 2, bounces: 3,
    targets: [['bomb', 270, 300], ['crystal', 190, 260], ['crystal', 350, 260], ['crystal', 230, 210], ['crystal', 310, 210], ['bomb', 400, 180], ['crystal', 470, 140], ['crystal', 470, 230]],
    walls: [[200, 480, 340, 480]],
    solution: [-135],
  },
  // ---------------------------------------------------------------- chapter 2: Rift Geometry
  {
    id: 't9', chapter: 2, name: 'Wormhole', tip: 'Portals carry the ball, and its heading, across the board.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['crystal', 270, 200], ['crystal', 220, 160], ['crystal', 320, 160]],
    walls: [[160, 280, 380, 280], [160, 120, 160, 280], [380, 120, 380, 280]],
    portals: [[100, 600, 270, 250]],
    solution: [-18.5, -126],
  },
  {
    id: 't10', chapter: 2, name: 'Gravity', tip: 'Gravity wells bend the ball. Watch the preview curve.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['crystal', 120, 260], ['crystal', 420, 260], ['crystal', 270, 180], ['bank', 270, 500]],
    wells: [[270, 380, 90, 900]],
    solution: [-148.5, -40.5],
  },
  {
    id: 't11', chapter: 2, name: 'Lock and Key', tip: 'The key crystal opens every gate.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['key', 450, 500], ['crystal', 270, 200], ['crystal', 220, 240], ['crystal', 320, 240]],
    walls: [[170, 300, 170, 140], [370, 300, 370, 140]],
    gates: [[170, 300, 370, 300]],
    solution: [-45.75, -138.25],
  },
  {
    id: 't12', chapter: 2, name: 'Deflection', tip: 'Angled rails redirect the ball cleanly.',
    shots: 5, par: 3, preview: 2, bounces: 3,
    targets: [['crystal', 80, 180], ['crystal', 460, 180], ['bank', 270, 260], ['crystal', 270, 520]],
    deflectors: [[60, 420, 180, 360], [480, 420, 360, 360]],
    solution: [-152, -90, -137.25],
  },
  {
    id: 't13', chapter: 2, name: 'Accelerator', tip: 'Boost pads make the ball faster. It still bends the same way.',
    shots: 5, par: 3, preview: 2, bounces: 3,
    targets: [['armored', 140, 200], ['armored', 400, 200], ['crystal', 270, 140]],
    boosters: [[270, 600, 40]],
    wells: [[270, 300, 80, 700]],
    solution: [-123.75, -35, -137.25],
  },
  {
    id: 't14', chapter: 2, name: 'Two Doors', tip: 'Two portals, two rooms.',
    shots: 4, par: 2, preview: 2, bounces: 3,
    targets: [['crystal', 90, 170], ['crystal', 450, 170], ['bank', 90, 250], ['bank', 450, 250]],
    walls: [[20, 320, 180, 320], [180, 320, 180, 130], [360, 320, 520, 320], [360, 320, 360, 130]],
    portals: [[200, 620, 100, 210], [340, 620, 440, 210]],
    solution: [-112.75, -67.5],
  },
  {
    id: 't15', chapter: 2, name: 'Slingshot', tip: 'Skim the well to whip the ball around.',
    shots: 4, par: 2, preview: 1, bounces: 3,
    targets: [['crystal', 110, 160], ['crystal', 430, 160], ['bomb', 270, 140], ['crystal', 200, 130], ['crystal', 340, 130]],
    wells: [[150, 420, 100, 1100], [390, 420, 100, 1100]],
    walls: [[200, 300, 340, 300]],
    solution: [-145.75, -80.75],
  },
  {
    id: 't16', chapter: 2, name: 'Vault', tip: 'Crack the armor, then the vault opens.',
    shots: 5, par: 3, preview: 1, bounces: 3,
    targets: [['armored', 270, 520], ['key', 270, 400], ['crystal', 220, 180], ['crystal', 320, 180], ['bomb', 270, 230]],
    walls: [[170, 300, 170, 130], [370, 300, 370, 130]],
    gates: [[170, 300, 370, 300]],
    solution: [-138.75, -90, -90],
  },
  // ---------------------------------------------------------------- chapter 3: The Spire
  {
    id: 't17', chapter: 3, name: 'Needle', tip: 'A narrow gap. Aim true.',
    shots: 4, par: 3, preview: 1, bounces: 3,
    targets: [['crystal', 270, 180], ['crystal', 150, 180], ['crystal', 390, 180], ['bank', 270, 330]],
    walls: [[40, 400, 250, 400], [290, 400, 500, 400]],
    solution: [-122.5, -59, -119.5],
  },
  {
    id: 't18', chapter: 3, name: 'Ricochet Hall', tip: 'Many walls, one path.',
    shots: 3, par: 2, preview: 1, bounces: 3,
    targets: [['crystal', 100, 150], ['crystal', 440, 150], ['crystal', 270, 450], ['bank', 270, 150]],
    walls: [[120, 300, 250, 360], [420, 300, 290, 360], [200, 220, 340, 220]],
    bumpers: [[90, 520, 22], [450, 520, 22]],
    solution: [-36.75, -66.25],
  },
  {
    id: 't19', chapter: 3, name: 'Armory', tip: 'Armor everywhere. Make every bounce count.',
    shots: 5, par: 4, preview: 1, bounces: 3,
    targets: [['armored', 150, 300], ['armored', 390, 300], ['armored', 270, 200], ['bank', 270, 420], ['crystal', 80, 150], ['crystal', 460, 150]],
    solution: [-141, -141.5, -113.75, -141.75],
  },
  {
    id: 't20', chapter: 3, name: 'Domino', tip: 'One bomb leads to another.',
    shots: 3, par: 2, preview: 1, bounces: 3,
    targets: [['bomb', 120, 560], ['bomb', 200, 470], ['bomb', 290, 390], ['bomb', 380, 310], ['crystal', 460, 230], ['crystal', 440, 300], ['armored', 270, 150]],
    walls: [[60, 640, 200, 640]],
    solution: [-89.75, -54.25],
  },
  {
    id: 't21', chapter: 3, name: 'Event Horizon', tip: 'Three wells. The straight line is never the answer.',
    shots: 4, par: 3, preview: 1, bounces: 3,
    targets: [['crystal', 270, 160], ['crystal', 100, 300], ['crystal', 440, 300], ['bank', 270, 330], ['armored', 270, 560]],
    wells: [[150, 450, 90, 900], [390, 450, 90, 900], [270, 250, 80, 800]],
    solution: [-138, -90, -107.75],
  },
  {
    id: 't22', chapter: 3, name: 'Keymaster', tip: 'Two keys, two vaults... and one gate set.',
    shots: 4, par: 3, preview: 1, bounces: 3,
    targets: [['key', 80, 520], ['crystal', 100, 170], ['crystal', 440, 170], ['bank', 270, 170], ['armored', 270, 420]],
    walls: [[60, 260, 200, 260], [340, 260, 470, 260], [200, 260, 200, 120], [340, 260, 340, 120]],
    gates: [[200, 230, 340, 230]],
    portals: [[460, 620, 100, 220]],
    solution: [-134.75, -90, -143],
  },
  {
    id: 't23', chapter: 3, name: 'Labyrinth', tip: 'Portals, rails and a locked heart.',
    shots: 5, par: 4, preview: 1, bounces: 3,
    targets: [['key', 460, 420], ['crystal', 270, 170], ['bomb', 230, 200], ['crystal', 310, 200], ['armored', 120, 300], ['bank', 420, 250]],
    walls: [[180, 260, 360, 260], [180, 260, 180, 130], [360, 260, 360, 130]],
    gates: [[180, 130, 360, 130]],
    deflectors: [[40, 560, 150, 500]],
    portals: [[80, 380, 270, 150]],
    solution: [-32.5, -67, -105.75, -105.75],
  },
  {
    id: 't24', chapter: 3, name: 'Summit', tip: 'Everything you have learned, at once.',
    shots: 5, par: 4, preview: 1, bounces: 3,
    targets: [['key', 90, 460], ['bomb', 270, 170], ['crystal', 225, 140], ['crystal', 315, 140], ['armored', 450, 330], ['bank', 270, 420], ['crystal', 460, 160], ['bank', 80, 200]],
    walls: [[190, 250, 190, 120], [350, 250, 350, 120]],
    gates: [[190, 250, 350, 250]],
    wells: [[270, 600, 70, 600]],
    bumpers: [[440, 500, 24]],
    solution: [-134.5, -20.25, -55.75, -117.75],
  },
];

export const STAGE_MAP: Record<string, StageDef> = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const CHAPTER_MAP: Record<number, ChapterDef> = Object.fromEntries(CHAPTERS.map((c) => [c.n, c]));
export const MAX_STARS = STAGES.length * 3;

/** Stars for a clear in `shots` shots: three at par, two one shot over, otherwise one. */
export function starsFor(stage: StageDef, shots: number): number {
  if (shots <= stage.par) return 3;
  if (shots <= stage.par + 1) return 2;
  return 1;
}

localize('stage', STAGES, ['name', 'tip']);
localize('chapter', CHAPTERS, ['name']);
