// Simplified (mitten) hands in hand-local units: origin at the wrist, +x towards the fingertips,
// +y = thumb side. Each shape returns { back, front } paths: `back` is drawn before a held prop,
// `front` (thumb / wrapping fingertips) after it, so hands read as actually holding things.
import { tube } from './util.js';

const cache = new Map();

function P(d) { return new Path2D(d); }

function build(kind, tap = 0) {
  switch (kind) {
    case 'open': return {
      back: P('M -6 -14 C 14 -16 38 -16 54 -13 C 64 -11 69 -5 67 1 C 65 8 58 11 50 11 L 26 13 L -6 15 Z'),
      front: P('M 6 9 C 16 12 28 21 35 29 C 39 34 34 39 29 35 C 21 28 12 22 3 17 Z'),
      lines: [[40, -6, 63, -6], [40, 2, 62, 3]],
    };
    case 'open-up': return {
      back: P('M -6 13 C 16 14 40 13 56 11 C 64 10 70 13 70 8 C 70 2 62 -6 50 -7 L 20 -11 L -6 -13 Z'),
      front: P('M 8 10 C 18 18 30 22 38 20 C 42 19 41 14 36 13 C 28 12 18 10 8 7 Z'),
      lines: [[34, 4, 60, 6]],
    };
    case 'fist': return {
      back: P('M -6 -15 C 10 -18 30 -20 40 -14 C 48 -9 49 6 42 13 C 36 18 22 18 12 16 L -6 15 Z'),
      front: P('M 12 6 C 22 3 32 5 36 9 C 38 14 33 17 27 16 C 20 15 14 13 10 11 Z'),
      lines: [[29, -7, 41, -3]],
    };
    case 'point': {
      const back = P('M -6 -15 C 8 -17 26 -18 34 -13 C 40 -8 42 6 36 12 C 30 17 18 17 10 16 L -6 15 Z');
      tube(back, { x: 26, y: -9 }, { x: 66, y: -9 }, 6.8, 5.6);
      return { back, front: P('M 12 2 C 20 -2 30 -2 34 2 C 36 6 30 9 24 8 C 18 7 13 6 11 5 Z'), lines: [] };
    }
    case 'chin': { // loose fist under the chin, index finger resting along the jaw
      const back = P('M -6 -15 C 8 -18 26 -19 34 -14 C 41 -9 43 5 37 12 C 31 17 18 17 10 16 L -6 15 Z');
      tube(back, { x: 30, y: -10 }, { x: 48, y: -16 }, 6.6, 5.8);
      return { back, front: P('M 12 3 C 20 0 30 0 34 4 C 36 8 30 11 24 10 C 18 9 13 8 11 6 Z'), lines: [[26, -2, 38, 0]] };
    }
    case 'grip': return {
      back: P('M -6 -15 C 12 -18 34 -18 46 -12 C 56 -6 56 8 48 13 C 40 17 24 16 14 16 L -6 15 Z'),
      front: P('M 6 7 C 18 1 34 -1 42 3 C 46 6 42 11 36 11 C 26 11 16 13 8 15 Z'),
      lines: [],
    };
    case 'cup': return { // fingers wrap the front of a cup; thumb behind
      back: P('M -6 -15 C 6 -17 14 -18 20 -16 L 20 15 L -6 15 Z'),
      front: P('M 8 -16 C 22 -19 40 -18 46 -12 C 52 -4 52 8 46 14 C 40 18 24 18 10 16 Z'),
      lines: [[24, -6, 46, -5], [24, 4, 46, 5]],
    };
    case 'phone': { // palm behind the phone, thumb angled onto the screen, fingertips round the far edge
      const front = new Path2D();
      tube(front, { x: 8, y: 22 }, { x: 30 + tap * 5, y: 9 - tap * 2 }, 7.2, 6);
      for (const x of [18, 31, 44]) tube(front, { x, y: -17 }, { x: x + 3, y: -26 }, 5.6, 5.2);
      return { back: P('M -6 -16 C 10 -20 30 -22 44 -20 C 52 -19 54 -10 52 0 L 50 18 C 40 22 20 24 6 22 L -6 15 Z'), front, lines: [] };
    }
    default: return { // relax
      back: P('M -6 -14 C 12 -17 32 -18 45 -14 C 57 -10 61 -1 58 7 C 55 13.5 46 15 39 12.5 C 32 11 25 13.5 17 15.5 L -6 15 Z'),
      front: P('M 1 7 C 12 7 22 11 26 16.5 C 29 21 25.5 25.5 20 24 C 13 22 6 18.5 -1 15 Z'),
      lines: [],
    };
  }
}

export function handShape(kind, tap = 0) {
  const key = kind + ':' + tap;
  let s = cache.get(key);
  if (!s) { s = build(kind, tap); cache.set(key, s); }
  return s;
}
