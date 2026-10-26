// The pixel office (/pixel): the floor seen from above, with a little character at every desk. It is
// the 2D view's third shape — /lite lists the workers, the 3D office lets you walk among them, and
// this one is the room at a glance, for a screen the 3D is too heavy for but a list too flat.
//
// It draws from the same store the other two read, and opens the same windows (terminals, the boards,
// the queue), so it adds a canvas and nothing else: no message of its own, no state of its own.

import './pixel.css';
import { Net } from './net';
import { AVATAR_COLORS, loadProfile, store } from './state';
import { randomLook } from '../shared/avatar';
import { cloneLabel } from '../shared/floors';
import { ROOF } from '../shared/rooftop';
import { DESK_BY_ID, nextFreeSeat } from '../shared/layout';
import { isAsleep } from '../shared/status';
import type { FloorInfo } from '../shared/protocol';
import { $, closeAllModals, h, toast } from './ui/dom';
import { openTerminal, routeTerminalMessage } from './ui/terminal';
import { openChanges, routeChangesMessage } from './ui/changes';
import { routeWorktreeMessage } from './ui/prompt';
import { openBoard } from './ui/boards';
import type { BoardActions } from './ui/github/prompts';
import { openPull, routePullMessage } from './ui/pull';
import { openQueue } from './ui/queue';
import { openAsk } from './ui/ask';
import { openMeeting, type MeetingPreset } from './ui/meeting';
import { openSignIns } from './ui/signins';
import { byUrgency, waitingInOrder, waitingLabel } from './nextup';
import { repoChoices } from './shared/hiring';
import { renderTitle } from './shared/title';
import { drawName, drawWorker, hitAt, type Hit } from './pixel/people';
import { drawRoom, fit, type View } from './pixel/view';

const saved = loadProfile();
store.profile = { name: saved?.name ?? 'Guest', color: saved?.color ?? AVATAR_COLORS[1], look: saved?.look ?? randomLook() };
const net = new Net(() => store.profile, () => null, true);

/** The server version this page was loaded with, to notice an upgrade under us. */
let bootVersion = '';

net.onStatus((up) => $('conn').classList.toggle('hidden', up));
net.onMessage((msg) => {
  store.apply(msg);
  routeTerminalMessage(msg);
  routeChangesMessage(msg);
  routePullMessage(msg);
  routeWorktreeMessage(msg);
  switch (msg.t) {
    case 'welcome':
      if (!bootVersion) bootVersion = msg.version;
      else if (msg.version !== bootVersion) return location.reload();
      offTheRoof();
      break;
    case 'floor.enter':
      offTheRoof();
      break;
    case 'toast':
      toast(msg.text, msg.level);
      break;
    case 'signins.needed':
      openSignIns(net, msg.why);
      break;
  }
});

/** There is no roof to draw here: down to the first floor that isn't still cloning. */
function offTheRoof() {
  if (store.floor !== ROOF) return;
  const to = store.floors.find((f) => !f.cloning);
  if (to) net.send({ t: 'floor.go', floor: to.id });
}

// ---- The floor you're on ------------------------------------------------------------------------
const floorSelect = $('floor') as HTMLSelectElement;
const floorLabel = (f: FloorInfo) => `${f.name}${f.cloning ? ` (${cloneLabel(f.clone)})` : f.waiting ? ` · 🙋 ${f.waiting}` : ''}`;

function renderFloors() {
  const options = store.floors.map((f) => h('option', { value: f.id, disabled: !!f.cloning }, floorLabel(f)));
  if (!store.floors.length) options.push(h('option', { value: '' }, 'No floors yet'));
  floorSelect.replaceChildren(...options);
  floorSelect.value = store.floor ?? '';
  floorSelect.disabled = store.floors.length < 2;
  renderTitle();
}
floorSelect.addEventListener('change', () => {
  if (floorSelect.value && floorSelect.value !== store.floor) net.send({ t: 'floor.go', floor: floorSelect.value });
});
store.on('floors', renderFloors);
store.on('floor', renderFloors);

// ---- The room ----------------------------------------------------------------------------------
const canvas = $('room') as HTMLCanvasElement;
const g = canvas.getContext('2d')!;
/** Where each worker was last drawn, for a click or a hover to land on one. */
let hits: Hit[] = [];
let view: View = fit(1, 1, 0);

/** The size the canvas was last laid out at, to notice the pane changing without a window resize. */
let sized = { w: 0, h: 0 };

function resize() {
  const box = canvas.parentElement!.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  sized = { w: box.width, h: box.height };
  canvas.width = Math.max(1, Math.round(box.width * dpr));
  canvas.height = Math.max(1, Math.round(box.height * dpr));
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  view = fit(box.width, box.height, store.floorPlan.wing);
}
window.addEventListener('resize', resize);

function frame(t: number) {
  // Asked for first: a frame that throws must not take the loop down with it, or the room is gone
  // for good and only a reload brings it back.
  requestAnimationFrame(frame);
  const box = canvas.parentElement!.getBoundingClientRect();
  if (Math.abs(box.width - sized.w) > 1 || Math.abs(box.height - sized.h) > 1) resize();
  g.clearRect(0, 0, canvas.width, canvas.height);
  drawRoom(g, view, store.floorPlan.wing);

  // The ones that need you drawn last, so their halo is never under another character.
  hits = [];
  const workers = byUrgency(store.workers.values()).reverse();
  for (const w of workers) {
    const desk = DESK_BY_ID.get(w.deskId);
    if (desk) hits.push(drawWorker(g, view, w, desk, t));
  }
  for (const hit of hits) {
    const w = store.workers.get(hit.id);
    if (w) drawName(g, hit, w.name, view.scale);
  }
}

function at(e: MouseEvent): { x: number; y: number } {
  const box = canvas.getBoundingClientRect();
  return { x: e.clientX - box.left, y: e.clientY - box.top };
}
canvas.addEventListener('click', (e) => {
  const p = at(e);
  const hit = hitAt(hits, p.x, p.y);
  if (hit) openWorker(hit.id);
});
canvas.addEventListener('mousemove', (e) => {
  const p = at(e);
  canvas.style.cursor = hitAt(hits, p.x, p.y) ? 'pointer' : 'default';
});

// ---- Workers -----------------------------------------------------------------------------------
function renderStatus() {
  const list = byUrgency(store.workers.values());
  $('waiting-now').textContent = waitingLabel(waitingInOrder(list));
  const f = store.currentFloor();
  const p = store.project;
  $('floor-meta').textContent = p
    ? [p.branch && `⎇ ${p.branch}`, f?.repo ?? p.dir, `🧑‍💻 ${list.length} at work`].filter(Boolean).join(' · ')
    : store.floors.length
      ? ''
      : 'Add a project from the elevator in the 3D office.';
  renderTitle();
}
store.on('workers', renderStatus);
store.on('project', renderStatus);
store.on('floorPlan', resize);

/** Its terminal, waking it up first if it's asleep — the same as walking up to its desk and pressing E. */
function openWorker(id: string) {
  const w = store.workers.get(id);
  if (!w) return;
  if (isAsleep(w.status)) net.send({ t: 'worker.resume', workerId: id });
  openTerminal(net, id, () => openChanges(net, id, () => openWorker(id)), undefined, { keypad: true });
}

// ---- New work ----------------------------------------------------------------------------------
/** With `issue`, the worker the prompt goes to takes that GitHub issue. */
function sendToWorker(title: string, text: { context?: string; initial?: string } = {}, issue?: number) {
  if (!store.project) return toast('Pick a floor first', 'warn');
  const desk = nextFreeSeat((id) => !!store.workerAtDesk(id), store.floorPlan.wing)?.id;
  const awake = [...store.workers.values()].filter((w) => w.kind === 'agent' && !isAsleep(w.status));
  if (!desk && !awake.length) return toast('Every desk and bean bag is taken — send a worker home first', 'warn');
  openAsk({
    title,
    ...text,
    newDesk: desk ? DESK_BY_ID.get(desk)!.label : undefined,
    workers: awake.map((w) => ({ id: w.id, name: w.name, color: w.color, status: w.status })),
    worktreeOption: !!store.project.branch,
    providerOption: true,
    repoOptions: repoChoices(),
    onSubmit: (prompt, to, worktree, provider, model, effort, repos) => {
      if (to) net.send({ t: 'worker.prompt', workerId: to, prompt, issue });
      else if (desk) net.send({ t: 'worker.spawn', deskId: desk, prompt, worktree, provider, model, effort, issue, repos: repos?.length ? repos : undefined });
    },
  });
}

// ---- The boards, the queue and the meeting room --------------------------------------------------
function boardActions(): BoardActions {
  return {
    queue: (prompt, title, issue, provider, model, effort) => net.send({ t: 'queue.add', prompt, title, issue, provider, model, effort }),
    assign: (prompt, title, issue) => sendToWorker(`🤖 ${title}`, { initial: prompt }, issue),
    ask: (context, title) => sendToWorker(`✍️ ${title}`, { context }),
    // The desk is right there on the canvas, but its terminal is what the walk would be for.
    goToDesk: (deskId) => {
      const w = store.workerAtDesk(deskId);
      if (!w) return;
      closeAllModals();
      openWorker(w.id);
    },
    meeting: (preset) => showMeeting(preset),
  };
}

function showMeeting(preset?: MeetingPreset) {
  openMeeting(
    net,
    {
      openTerminal: openWorker,
      openPr: (id) => {
        const w = store.workers.get(id);
        if (!w) return;
        const it = w.pr && store.pulls.items.find((p) => p.number === w.pr!.number);
        if (it) openPull(it, net, boardActions());
        else if (w.pr) window.open(w.pr.url, '_blank', 'noopener');
        else net.send({ t: 'worker.pr', workerId: id });
      },
    },
    preset,
  );
}

$('btn-issues').addEventListener('click', () => openBoard('issues', net, boardActions()));
$('btn-pulls').addEventListener('click', () => openBoard('pulls', net, boardActions()));
$('btn-queue').addEventListener('click', () => openQueue(net, { openTerminal: openWorker }));
$('btn-new').addEventListener('click', () => sendToWorker('✨ New task'));

function renderNav() {
  const count = (id: string, n: number) => ($(id).querySelector('.n')!.textContent = n ? String(n) : '');
  count('btn-issues', store.issues.items.filter((i) => i.state === 'OPEN').length);
  count('btn-pulls', store.pulls.items.filter((p) => p.state === 'OPEN').length);
  count('btn-queue', store.queue.tasks.filter((t) => t.status !== 'done').length);
}
store.on('issues', renderNav);
store.on('pulls', renderNav);
store.on('queue', renderNav);

// ---- In ----------------------------------------------------------------------------------------
void (async () => {
  try {
    const res = await fetch('/api/whoami', { cache: 'no-store' });
    if (res.status === 401) return void (location.href = '/login?next=/pixel');
    const { me } = (await res.json()) as { me?: typeof store.me };
    if (me) store.me = me;
  } catch {
    // the welcome message says it too
  }
  if (store.me.account) store.profile.name = store.me.account.name;
  net.connect();
})();

renderFloors();
renderStatus();
renderNav();
resize();
requestAnimationFrame(frame);

// Debug handle for quick checks from the console / headless screenshots.
(window as any).__pixel = { store, net, hits: () => hits };
