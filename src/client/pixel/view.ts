// Where the room sits on the canvas, and the room drawn flat. The desks, bean bags, kiosks, stairs
// and meeting room are the same ones the 3D office builds, straight out of src/shared/layout.ts:
// nothing here is new geometry, it's that file's metres seen from above. So a floor that grows a
// back office row, or a desk that moves, moves here too with nothing to keep in step.

import { BEANBAGS, DESK_SIZE, FLOOR, KIOSK, LOFT, MEETING_ROOM, MEETING_TABLE, STAIRS, STATIONS, builtDesks, wingMinZ, type DeskDef } from '../../shared/layout';

/** Metres to pixels, and where the room's north-west corner lands. */
export interface View {
  scale: number;
  ox: number;
  oy: number;
  /** The room's own bounds in metres, the back office included once it's built out. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** The room as big as it fits in `w`×`h` pixels, with `pad` pixels of street around it. */
export function fit(w: number, h: number, wing: number, pad = 18): View {
  const minZ = wing > 0 ? wingMinZ(wing) : FLOOR.minZ;
  const span = { x: FLOOR.maxX - FLOOR.minX, z: FLOOR.maxZ - minZ };
  // A pane can be laid out at nothing at all for a frame (the page opening, a phone turning). Drawn
  // at the negative scale that gives, every rounded corner throws, so the floor never comes back.
  const scale = Math.max(0.5, Math.min((w - pad * 2) / span.x, (h - pad * 2) / span.z));
  return {
    scale,
    ox: (w - span.x * scale) / 2 - FLOOR.minX * scale,
    oy: (h - span.z * scale) / 2 - minZ * scale,
    minX: FLOOR.minX,
    minZ,
    maxX: FLOOR.maxX,
    maxZ: FLOOR.maxZ,
  };
}

export const px = (v: View, x: number): number => v.ox + x * v.scale;
export const py = (v: View, z: number): number => v.oy + z * v.scale;
/** A length in metres, in pixels. */
export const pm = (v: View, m: number): number => m * v.scale;

/** A rectangle given in metres, as canvas pixels. */
function rect(v: View, x0: number, z0: number, x1: number, z1: number): [number, number, number, number] {
  return [px(v, x0), py(v, z0), pm(v, x1 - x0), pm(v, z1 - z0)];
}

function round(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** A desk's footprint in metres: at rotY 0 or PI it lies across x, at ±PI/2 across z. */
export function deskRect(desk: DeskDef): { x0: number; z0: number; x1: number; z1: number } {
  const across = Math.abs(Math.cos(desk.rotY)) > 0.5;
  const w = across ? DESK_SIZE.width : DESK_SIZE.depth;
  const d = across ? DESK_SIZE.depth : DESK_SIZE.width;
  return { x0: desk.x - w / 2, z0: desk.z - d / 2, x1: desk.x + w / 2, z1: desk.z + d / 2 };
}

/**
 * Where the worker at `desk` stands or sits, in metres. A desk seats them on its +z side before
 * rotation (the office's own deskSeat rule), a bean bag and a meeting chair are sat on where they
 * are, and a board agent stands `KIOSK.stand` behind its kiosk.
 */
export function seatOf(desk: DeskDef): { x: number; z: number } {
  const out = desk.station ? KIOSK.stand : desk.beanbag || desk.room ? 0 : DESK_SIZE.depth / 2 + 0.45;
  return { x: desk.x + Math.sin(desk.rotY) * out, z: desk.z + Math.cos(desk.rotY) * out };
}

/** The floor, the carpets and everything standing on them. Workers go on top, in people.ts. */
export function drawRoom(g: CanvasRenderingContext2D, v: View, wing: number) {
  // The floorboards, with the walls as one thick outline — the office's own ink border.
  g.fillStyle = '#f6e3c5';
  g.fillRect(...rect(v, v.minX, v.minZ, v.maxX, v.maxZ));
  boards(g, v);

  // The lounge carpet under the loft, and the meeting room's glass box with its table.
  g.fillStyle = '#e8d3b4';
  g.fillRect(...rect(v, LOFT.minX, LOFT.minZ, LOFT.maxX, LOFT.maxZ));
  g.strokeStyle = '#7fb3c8';
  g.lineWidth = Math.max(2, pm(v, 0.14));
  g.strokeRect(...rect(v, MEETING_ROOM.minX, MEETING_ROOM.minZ, MEETING_ROOM.maxX, MEETING_ROOM.maxZ));
  // The door in its north wall, painted back over the glass.
  g.strokeStyle = '#e8d3b4';
  g.beginPath();
  g.moveTo(px(v, MEETING_ROOM.door.x0), py(v, MEETING_ROOM.minZ));
  g.lineTo(px(v, MEETING_ROOM.door.x1), py(v, MEETING_ROOM.minZ));
  g.stroke();
  g.fillStyle = '#c99a63';
  round(g, ...rect(v, MEETING_TABLE.x - MEETING_TABLE.width / 2, MEETING_TABLE.z - MEETING_TABLE.depth / 2, MEETING_TABLE.x + MEETING_TABLE.width / 2, MEETING_TABLE.z + MEETING_TABLE.depth / 2), pm(v, 0.25));
  g.fill();

  stairs(g, v);
  for (const desk of builtDesks(wing)) drawDesk(g, v, desk);
  for (const bag of BEANBAGS) drawBeanbag(g, v, bag);
  for (const station of STATIONS) drawStation(g, v, station);

  // The walls last, over the carpets that run up to them.
  g.strokeStyle = '#3a2d21';
  g.lineWidth = Math.max(3, pm(v, 0.3));
  g.strokeRect(...rect(v, v.minX, v.minZ, v.maxX, v.maxZ));
}

/** Floorboards: a line every two metres, faint enough to read desks over. */
function boards(g: CanvasRenderingContext2D, v: View) {
  g.strokeStyle = 'rgba(58, 45, 33, .07)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = v.minX + 2; x < v.maxX; x += 2) {
    g.moveTo(px(v, x), py(v, v.minZ));
    g.lineTo(px(v, x), py(v, v.maxZ));
  }
  g.stroke();
}

function stairs(g: CanvasRenderingContext2D, v: View) {
  const step = (STAIRS.toX - STAIRS.fromX) / STAIRS.steps;
  g.fillStyle = '#d9bf9a';
  g.fillRect(...rect(v, STAIRS.fromX, STAIRS.minZ, STAIRS.toX, STAIRS.maxZ));
  g.strokeStyle = 'rgba(58, 45, 33, .25)';
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 1; i < STAIRS.steps; i++) {
    const x = px(v, STAIRS.fromX + step * i);
    g.moveTo(x, py(v, STAIRS.minZ));
    g.lineTo(x, py(v, STAIRS.maxZ));
  }
  g.stroke();
}

function drawDesk(g: CanvasRenderingContext2D, v: View, desk: DeskDef) {
  const r = deskRect(desk);
  g.fillStyle = '#d9a86c';
  round(g, ...rect(v, r.x0, r.z0, r.x1, r.z1), pm(v, 0.1));
  g.fill();
  g.strokeStyle = '#8a6336';
  g.lineWidth = 1.5;
  g.stroke();
  // The laptop on it, a small dark slab in the middle: what the office shows a worker's terminal on.
  g.fillStyle = '#4a5c6a';
  round(g, px(v, desk.x - 0.33), py(v, desk.z - 0.22), pm(v, 0.66), pm(v, 0.44), 2);
  g.fill();
}

function drawBeanbag(g: CanvasRenderingContext2D, v: View, bag: DeskDef) {
  g.fillStyle = '#c8b7f0';
  g.beginPath();
  g.ellipse(px(v, bag.x), py(v, bag.z), pm(v, 0.5), pm(v, 0.42), 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#8d79c6';
  g.lineWidth = 1.5;
  g.stroke();
}

function drawStation(g: CanvasRenderingContext2D, v: View, station: DeskDef) {
  g.fillStyle = '#b9c6cf';
  round(g, px(v, station.x - KIOSK.width / 2), py(v, station.z - KIOSK.depth / 2), pm(v, KIOSK.width), pm(v, KIOSK.depth), 2);
  g.fill();
  g.strokeStyle = '#5d6b75';
  g.lineWidth = 1.5;
  g.stroke();
}
