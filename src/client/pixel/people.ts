// The workers on top of the room: one little character at its desk, in the colour the office already
// gave it, doing what its status says it's doing. The statuses are the same seven the 2D list spells
// out in words (STATUS_LABEL), so nothing new has to be reported for this view to be right.

import { isAsleep } from '../../shared/status';
import type { WorkerInfo } from '../../shared/protocol';
import type { DeskDef } from '../../shared/layout';
import { pm, px, py, seatOf, type View } from './view';

/** Where a drawn worker is on the canvas, for a click or a hover to find it. */
export interface Hit {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** The ring round a character, and the bubble over its head: how a worker looks at a glance. */
const LOOK: Record<string, { ring: string; bubble?: string }> = {
  starting: { ring: '#f4a261' },
  idle: { ring: '#8a7f73' },
  working: { ring: '#2a9d8f' },
  needs_input: { ring: '#ef476f', bubble: '🙋' },
  done: { ring: '#06d6a0', bubble: '✅' },
  exited: { ring: '#9aa5ad', bubble: '💤' },
  offline: { ring: '#9aa5ad', bubble: '💤' },
};

/**
 * One worker, at the seat its desk gives it. `t` is the page's clock in milliseconds, the only thing
 * that moves: a worker mid-turn bobs as if typing, one waiting on you pulses, and one that has
 * finished hops, so which desks need you is clear without reading a word.
 */
export function drawWorker(g: CanvasRenderingContext2D, v: View, w: WorkerInfo, desk: DeskDef, t: number): Hit {
  const seat = seatOf(desk);
  const look = LOOK[w.status] ?? LOOK.idle;
  const asleep = isAsleep(w.status);
  const beat = t / 1000;
  // Up and down: a small type-bob while it works, a real hop once it's done, still otherwise.
  const hop = w.status === 'working' ? Math.sin(beat * 9) * 0.5 : w.status === 'done' ? Math.abs(Math.sin(beat * 3)) * 3.5 : 0;
  const x = px(v, seat.x);
  const y = py(v, seat.z) - hop;
  // Bigger than the metre and a bit a person really takes up: at a whole floor on one screen a
  // true-to-scale character is a dot, and who is at which desk is the point of this view.
  const r = Math.max(10, pm(v, 0.62));

  // A shadow on the floor, so the character reads as standing on it rather than painted over it.
  g.fillStyle = 'rgba(58, 45, 33, .18)';
  g.beginPath();
  g.ellipse(x, py(v, seat.z) + r * 0.75, r * 0.85, r * 0.32, 0, 0, Math.PI * 2);
  g.fill();

  // One waiting on someone gets a halo that breathes, the loudest thing in the room.
  if (w.status === 'needs_input') {
    g.fillStyle = `rgba(239, 71, 111, ${0.3 + Math.sin(beat * 4) * 0.18})`;
    g.beginPath();
    g.arc(x, y, r * (2 + Math.sin(beat * 4) * 0.2), 0, Math.PI * 2);
    g.fill();
  }

  // The body: a rounded block in the worker's own colour, with the status as its outline.
  g.fillStyle = asleep ? '#cdd4d9' : w.color;
  g.beginPath();
  g.roundRect(x - r * 0.72, y - r * 0.1, r * 1.44, r * 1.5, r * 0.45);
  g.fill();
  g.strokeStyle = look.ring;
  g.lineWidth = Math.max(2, r * 0.22);
  g.stroke();

  // The head, and two dots for eyes once there's room for them to land anywhere sensible.
  g.fillStyle = '#ffe3c2';
  g.beginPath();
  g.arc(x, y - r * 0.55, r * 0.62, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(58, 45, 33, .55)';
  g.lineWidth = 1.5;
  g.stroke();
  if (r > 9) {
    g.fillStyle = '#3a2d21';
    const eye = asleep ? r * 0.1 : r * 0.12;
    for (const dx of [-r * 0.22, r * 0.22]) {
      g.beginPath();
      g.ellipse(x + dx, y - r * 0.58, eye, asleep ? 1 : eye, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  if (look.bubble) bubble(g, x, y - r * 1.5, r, look.bubble);
  return { id: w.id, x, y, r: r * 1.3 };
}

/** The little speech bubble over a head: what it wants, in one character. */
function bubble(g: CanvasRenderingContext2D, x: number, y: number, r: number, text: string) {
  const size = Math.max(11, r * 1.3);
  g.font = `${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y - size * 0.3);
}

/** Its name under it, on a plate, so a busy pod is still readable. */
export function drawName(g: CanvasRenderingContext2D, hit: Hit, name: string, scale: number) {
  const size = Math.max(9, Math.min(13, scale * 0.42));
  g.font = `700 ${size}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const y = hit.y + hit.r * 0.95;
  const w = g.measureText(name).width + 8;
  g.fillStyle = 'rgba(255, 241, 222, .82)';
  g.beginPath();
  g.roundRect(hit.x - w / 2, y - 1, w, size + 4, 4);
  g.fill();
  g.fillStyle = '#3a2d21';
  g.fillText(name, hit.x, y + 1);
}

/** The worker a click at (x, y) lands on, nearest first, or none. */
export function hitAt(hits: Hit[], x: number, y: number): Hit | undefined {
  let best: Hit | undefined;
  let bestD = Infinity;
  for (const h of hits) {
    const d = (h.x - x) ** 2 + (h.y - y) ** 2;
    if (d <= h.r ** 2 && d < bestD) {
      best = h;
      bestD = d;
    }
  }
  return best;
}
