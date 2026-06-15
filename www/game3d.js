/* ============================================================
   Dice Match 3D — plays solver-verified designed levels.
   All game rules live in engine.js; this file only renders and
   animates the events that engine.applyMove() produces, so what
   you play exactly matches what the solver verified.
   ============================================================ */

const S = 1.0;                         // die size / cell spacing
const LEVELS = window.LEVELS || [];
const NUM = LEVELS.length;

// ---- THREE setup ----------------------------------------------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1230);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404060, 0.95));
const sun = new THREE.DirectionalLight(0xffffff, 0.7);
sun.position.set(5, 12, 7);
scene.add(sun);

// The board is always framed as if it were FRAME_DIM cells across, so a
// single die keeps a constant on-screen size as levels grow: small boards
// sit with margin around them, the largest board fills the frame. This is
// what makes the map visibly "widen" with level instead of auto-fitting.
const FRAME_DIM = 6;
let floor = null;
let camDim = FRAME_DIM * S;

function placeCamera() {
  const stage = document.getElementById("stage");
  const aspect = stage.clientHeight ? stage.clientWidth / stage.clientHeight : 1;
  // pull back on narrow (portrait) screens so the board width still fits
  const widen = Math.min(1.6, Math.max(1, 1 / aspect));
  const d = camDim * widen;
  camera.position.set(0, d * 1.3 + 2.5, d * 1.15 + 3);
  camera.lookAt(0, 0, 0);
}

function setupScene(rows, cols) {
  camDim = Math.max(rows, cols, FRAME_DIM) * S;
  placeCamera();
  if (floor) { scene.remove(floor); floor.geometry.dispose(); }
  floor = new THREE.Mesh(
    new THREE.PlaneGeometry(cols * S + 1, rows * S + 1),
    new THREE.MeshLambertMaterial({ color: 0x120c26 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.001;
  scene.add(floor);
}

function resize() {
  const stage = document.getElementById("stage");
  const w = stage.clientWidth, h = stage.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  placeCamera();
}
window.addEventListener("resize", resize);

// ---- pip textures + die mesh ----------------------------------
const PIP_SLOTS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_COLOR = { 2: "#f4a259", 3: "#2ec4b6", 4: "#4895ef", 5: "#ef476f", 6: "#9b5de5", 1: "#e9c46a" };
const texCache = {};
function pipTexture(value) {
  if (texCache[value]) return texCache[value];
  const N = 128, cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = FACE_COLOR[value] || "#ddd";
  roundRect(ctx, 4, 4, N - 8, N - 8, 22); ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 4; ctx.stroke();
  const pos = [0.27, 0.5, 0.73];
  ctx.fillStyle = "#fffdf5";
  for (const slot of PIP_SLOTS[value]) {
    ctx.beginPath();
    ctx.arc(pos[slot % 3] * N, pos[(slot / 3) | 0] * N, N * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  texCache[value] = tex;
  return tex;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const dieGeo = new THREE.BoxGeometry(1, 1, 1);
const edgeGeo = new THREE.EdgesGeometry(dieGeo);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 });

// material order: +x(east) -x(west) +y(top) -y(bottom) +z(south) -z(north)
function createDieMesh(d) {
  const mats = [d.east, d.west, d.top, d.bottom, d.south, d.north].map(
    (v) => new THREE.MeshLambertMaterial({ map: pipTexture(v) })
  );
  const mesh = new THREE.Mesh(dieGeo, mats);
  mesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
  return mesh;
}

// ---- character -------------------------------------------------
function createCharacter(bodyColor, hornColor) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), new THREE.MeshLambertMaterial({ color: bodyColor }));
  body.position.y = 0.26; g.add(body);
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const pupMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  for (const dx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), eyeMat);
    eye.position.set(dx, 0.32, 0.2); g.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), pupMat);
    pup.position.set(dx, 0.32, 0.255); g.add(pup);
  }
  const hornMat = new THREE.MeshLambertMaterial({ color: hornColor });
  for (const dx of [-0.12, 0.12]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 10), hornMat);
    horn.position.set(dx, 0.5, 0); horn.rotation.z = dx > 0 ? -0.3 : 0.3; g.add(horn);
  }
  return g;
}
// P1 red, P2 cyan — must match the controller colours in style.css
const PLAYER_COLORS = [
  { body: 0xe63946, horn: 0x7a1020 },
  { body: 0x4cc9f0, horn: 0x1a6fa0 },
];
const characters = [
  createCharacter(PLAYER_COLORS[0].body, PLAYER_COLORS[0].horn),
  createCharacter(PLAYER_COLORS[1].body, PLAYER_COLORS[1].horn),
];
characters.forEach((c) => scene.add(c));

// ---- game state -----------------------------------------------
// mode: "1p" (level progression) | "2p" (shared-board battle)
const game = { mode: "1p", idx: 1, st: null, meshAt: [], par: 0 };
// per-player {r,c}; 1P uses only index 0 and mirrors game.st.char
function charRC(pi) { return game.mode === "2p" ? game.st.chars[pi] : game.st.char; }
function activePlayers() { return game.mode === "2p" ? [0, 1] : [0]; }

function cellCenter(r, c) {
  const st = game.st;
  return new THREE.Vector3((c - (st.cols - 1) / 2) * S, 0.5, (r - (st.rows - 1) / 2) * S);
}
function charPosOn(r, c) { const p = cellCenter(r, c); p.y = 1.0; return p; }

function clearMeshes() {
  for (const row of game.meshAt) for (const m of row) if (m) { scene.remove(m); disposeMesh(m); }
}
function disposeMesh(mesh) {
  mesh.traverse((m) => {
    if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => mm.dispose && mm.dispose());
  });
}

// (re)build all die meshes for the current game.st board
function buildBoardMeshes() {
  if (game.meshAt.length) clearMeshes();
  setupScene(game.st.rows, game.st.cols);
  game.meshAt = Array.from({ length: game.st.rows }, () => Array(game.st.cols).fill(null));
  for (let r = 0; r < game.st.rows; r++)
    for (let c = 0; c < game.st.cols; c++) {
      const d = game.st.board[r][c];
      if (d) { const m = createDieMesh(d); m.position.copy(cellCenter(r, c)); scene.add(m); game.meshAt[r][c] = m; }
    }
}

function loadLevel(idx) {
  game.mode = "1p";
  const data = LEVELS[idx - 1];
  game.idx = idx;
  game.st = Engine.stateFromLevel(data);
  game.par = data.par;
  buildBoardMeshes();
  characters[0].visible = true;
  characters[1].visible = false;
  characters[0].position.copy(charPosOn(game.st.char.r, game.st.char.c));
  clearLocks();
  setMode2pUI(false);
  updateHUD();
}

// 2P battle: widest recommended board, scattered dice, two players race to
// clear the most dice. No level progression — replay from the menu/reset.
const BATTLE = { rows: 8, cols: 8, fill: 0.5 };
function startBattle() {
  game.mode = "2p";
  game.st = Engine.makeBattleState(BATTLE.rows, BATTLE.cols, { fill: BATTLE.fill });
  buildBoardMeshes();
  characters.forEach((c) => (c.visible = true));
  for (const pi of [0, 1]) characters[pi].position.copy(charPosOn(game.st.chars[pi].r, game.st.chars[pi].c));
  clearLocks();
  setMode2pUI(true);
  updateHUD();
}

function updateHUD() {
  if (game.mode === "2p") {
    document.getElementById("p1score").textContent = game.st.scores[0];
    document.getElementById("p2score").textContent = game.st.scores[1];
    document.getElementById("battle-left").textContent = Engine.countDice(game.st);
    return;
  }
  document.getElementById("level").textContent = game.idx;
  document.getElementById("left").textContent = Engine.countDice(game.st);
  document.getElementById("par").textContent = game.par;
}

// toggle which HUD / control set is visible
function setMode2pUI(is2p) {
  document.body.classList.toggle("mode-2p", is2p);
}

// ---- tween manager --------------------------------------------
const tweens = [];
function addTween(dur, onUpdate, onDone) {
  const start = performance.now();
  tweens.push({
    step(now) {
      let t = (now - start) / dur;
      if (t >= 1) { onUpdate(1); onDone && onDone(); return true; }
      onUpdate(t); return false;
    },
  });
}
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function charArc(pi, from, to, dur, cb) {
  const ch = characters[pi];
  addTween(dur, (t) => {
    const e = easeInOut(t);
    ch.position.lerpVectors(from, to, e);
    ch.position.y = from.y * (1 - e) + to.y * e + Math.sin(t * Math.PI) * 0.32;
  }, cb);
}

// ---- event playback (drives visuals from engine events) -------
function dirOf(from, to) {
  if (to.r < from.r) return "north";
  if (to.r > from.r) return "south";
  if (to.c > from.c) return "east";
  return "west";
}

function animTumble(ev, cb) {
  const from = ev.from, to = ev.to;
  const carried = ev.carried || [ev.player || 0]; // chars riding the rolled die
  const mesh = game.meshAt[from.r][from.c];
  const d = dirOf(from, to);
  const fc = cellCenter(from.r, from.c);
  let axis, pivot;
  if (d === "east") { axis = new THREE.Vector3(0, 0, -1); pivot = new THREE.Vector3(fc.x + 0.5, 0, fc.z); }
  else if (d === "west") { axis = new THREE.Vector3(0, 0, 1); pivot = new THREE.Vector3(fc.x - 0.5, 0, fc.z); }
  else if (d === "south") { axis = new THREE.Vector3(1, 0, 0); pivot = new THREE.Vector3(fc.x, 0, fc.z + 0.5); }
  else { axis = new THREE.Vector3(-1, 0, 0); pivot = new THREE.Vector3(fc.x, 0, fc.z - 0.5); }

  const startPos = mesh.position.clone(), startQuat = mesh.quaternion.clone();
  const charTo = charPosOn(to.r, to.c);
  const charFroms = carried.map((pi) => characters[pi].position.clone());
  const q = new THREE.Quaternion();
  addTween(150, (t) => {
    const e = easeInOut(t);
    q.setFromAxisAngle(axis, (Math.PI / 2) * e);
    mesh.position.copy(startPos).sub(pivot).applyQuaternion(q).add(pivot);
    mesh.quaternion.copy(q).multiply(startQuat);
    carried.forEach((pi, i) => {
      const ch = characters[pi];
      ch.position.lerpVectors(charFroms[i], charTo, e);
      ch.position.y = charFroms[i].y * (1 - e) + charTo.y * e + Math.sin(t * Math.PI) * 0.22;
    });
  }, () => {
    mesh.position.copy(cellCenter(to.r, to.c));
    carried.forEach((pi) => characters[pi].position.copy(charTo));
    game.meshAt[to.r][to.c] = mesh;
    game.meshAt[from.r][from.c] = null;
    cb();
  });
}

function animRound(ev, cb) {
  // 1P events carry a single `relocate`; 2P events carry a `relocations` array.
  const relocs = ev.relocations || (ev.relocate ? [{ player: 0, to: ev.relocate.to }] : []);
  const meshes = ev.clears.map(([r, c]) => game.meshAt[r][c]).filter(Boolean);
  for (const [r, c] of ev.clears) game.meshAt[r][c] = null;
  let pending = meshes.length + relocs.length;
  if (pending === 0) { cb(); return; }
  const done = () => { if (--pending <= 0) { updateHUD(); cb(); } };

  for (const m of meshes) {
    const p0 = m.position.clone();
    const faceMats = Array.isArray(m.material) ? m.material : [m.material];
    addTween(520, (t) => {
      if (t < 0.4) {
        const f = t / 0.4;
        faceMats.forEach((mm) => mm.emissive && mm.emissive.setScalar(f * 0.85));
        m.position.y = p0.y + Math.sin(f * Math.PI) * 0.12;
      } else {
        const e = easeInOut((t - 0.4) / 0.6);
        faceMats.forEach((mm) => mm.emissive && mm.emissive.setScalar((1 - e) * 0.85));
        m.position.y = p0.y - e * 1.4;
        m.scale.setScalar(1 - e * 0.9);
      }
    }, () => { scene.remove(m); disposeMesh(m); done(); });
  }
  for (const rl of relocs)
    charArc(rl.player, characters[rl.player].position.clone(), charPosOn(rl.to.r, rl.to.c), 240, done);
}

function playEvents(events, i, done) {
  if (i >= events.length) { done(); return; }
  const ev = events[i];
  const next = () => playEvents(events, i + 1, done);
  if (ev.type === "hop") charArc(ev.player || 0, characters[ev.player || 0].position.clone(), charPosOn(ev.to.r, ev.to.c), 170, next);
  else if (ev.type === "roll") animTumble(ev, next);
  else if (ev.type === "round") animRound(ev, next);
  else next();
}

// ---- input -----------------------------------------------------
// A single busy lock serialises board mutations (cascades are stateful), but
// presses are QUEUED instead of dropped — so two players mashing their pads at
// the same instant both register and play back-to-back. The queue is capped so
// a held/spammed button can't buffer a huge backlog.
// Concurrency model: instead of one global lock, each player has their own
// lock and every in-flight animation reserves the board cells it touches. A
// queued press dispatches the moment its player is free AND none of the cells
// its move would touch are reserved — so two players in different regions roll
// at the same time, and we only serialise when their moves actually overlap.
const inputQueue = [];
const QUEUE_MAX = 8;
const busyPlayer = [false, false];
const busyCells = new Set();
function anyBusy() { return busyPlayer[0] || busyPlayer[1]; }
function ckey(r, c) { return r * 1000 + c; }
function eventCells(events) {
  const set = new Set();
  const add = (p) => p && set.add(ckey(p.r, p.c));
  for (const ev of events) {
    add(ev.from); add(ev.to);
    if (ev.clears) for (const [r, c] of ev.clears) set.add(ckey(r, c));
    if (ev.relocations) for (const rl of ev.relocations) { add(rl.from); add(rl.to); }
    if (ev.relocate) { add(ev.relocate.from); add(ev.relocate.to); }
  }
  return set;
}
function clearLocks() { busyPlayer[0] = busyPlayer[1] = false; busyCells.clear(); inputQueue.length = 0; }

function requestMove(player, dir) {
  if (!overlay.classList.contains("hidden")) return; // ignore during menu / win card
  if (inputQueue.length >= QUEUE_MAX) return;
  inputQueue.push({ player, dir });
  pump();
}
function pump() {
  // dispatch every queued press that can run right now without a cell conflict
  for (let i = 0; i < inputQueue.length; ) {
    const m = inputQueue[i];
    if (busyPlayer[m.player]) { i++; continue; } // this player is still animating
    const res = game.mode === "2p"
      ? Engine.applyBattleMove(game.st, m.player, m.dir)
      : Engine.applyMove(game.st, m.dir);
    if (!res) { inputQueue.splice(i, 1); continue; } // illegal: drop it
    const cells = eventCells(res.events);
    let conflict = false;
    for (const k of cells) if (busyCells.has(k)) { conflict = true; break; }
    if (conflict) { i++; continue; } // overlaps an in-flight animation; wait

    inputQueue.splice(i, 1);
    game.st = res.next;
    updateHUD();
    busyPlayer[m.player] = true;
    cells.forEach((k) => busyCells.add(k));
    playEvents(res.events, 0, () => {
      busyPlayer[m.player] = false;
      cells.forEach((k) => busyCells.delete(k));
      if (Engine.isEmpty(game.st)) { clearLocks(); modeComplete(); return; }
      pump();
    });
  }
}

// Per-button pointer events give true multi-touch: each finger landing on a
// pad button fires its own pointerdown, so both pads work simultaneously.
document.querySelectorAll(".dir").forEach((b) => {
  b.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    b.classList.add("pressing");
    requestMove(+(b.dataset.player || 0), b.dataset.dir);
  });
  const release = () => b.classList.remove("pressing");
  b.addEventListener("pointerup", release);
  b.addEventListener("pointercancel", release);
  b.addEventListener("pointerleave", release);
});
document.addEventListener("keydown", (e) => {
  const p0 = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
  const p1 = { w: "north", s: "south", a: "west", d: "east", W: "north", S: "south", A: "west", D: "east" };
  if (p0[e.key]) { e.preventDefault(); requestMove(0, p0[e.key]); }
  else if (game.mode === "2p" && p1[e.key]) { e.preventDefault(); requestMove(1, p1[e.key]); }
});
// swipe on the board only drives player 0 (2P should use the on-screen pads)
let sp = null;
canvas.addEventListener("pointerdown", (e) => { sp = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("pointerup", (e) => {
  if (!sp) return;
  const dx = e.clientX - sp.x, dy = e.clientY - sp.y; sp = null;
  if (Math.hypot(dx, dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) requestMove(0, dx > 0 ? "east" : "west");
  else requestMove(0, dy > 0 ? "south" : "north");
});
document.getElementById("reset").addEventListener("click", () => {
  if (anyBusy()) return;
  if (game.mode === "2p") startBattle(); else loadLevel(game.idx);
});

// ---- overlay / level flow -------------------------------------
const overlay = document.getElementById("overlay");
function showOverlay(title, text, btn, onClose) {
  document.getElementById("overlay-title").textContent = title;
  document.getElementById("overlay-text").textContent = text;
  const b = document.getElementById("overlay-btn");
  b.textContent = btn;
  b.onclick = () => { overlay.classList.add("hidden"); onClose(); };
  overlay.classList.remove("hidden");
}
function modeComplete() {
  if (game.mode === "2p") battleComplete();
  else levelComplete();
}
function levelComplete() {
  if (game.idx >= NUM) {
    showOverlay("ALL CLEAR! 🎉", `${NUM}레벨을 모두 깼어요!`, "다시 시작", () => loadLevel(1));
  } else {
    showOverlay("LEVEL CLEAR", `최소 ${game.par}수 퍼즐 클리어!`, "다음 레벨", () => loadLevel(game.idx + 1));
  }
}
function battleComplete() {
  const [a, b] = game.st.scores;
  const title = a === b ? "무승부!" : (a > b ? "PLAYER 1 승리! 🔴" : "PLAYER 2 승리! 🔵");
  showOverlay(title, `최종 점수 — P1 ${a} : ${b} P2`, "다시 하기", () => startBattle());
}

// ---- main menu -------------------------------------------------
const menu = document.getElementById("menu");
function showMenu() {
  overlay.classList.add("hidden");
  menu.classList.remove("hidden");
}
document.getElementById("menu-1p").addEventListener("click", () => { menu.classList.add("hidden"); loadLevel(1); });
document.getElementById("menu-2p").addEventListener("click", () => { menu.classList.add("hidden"); startBattle(); });
document.getElementById("to-menu").addEventListener("click", () => { if (!anyBusy()) showMenu(); });

// ---- main loop -------------------------------------------------
function animate(now) {
  for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].step(now)) tweens.splice(i, 1);
  if (game.st)
    for (const pi of activePlayers()) if (!busyPlayer[pi]) characters[pi].position.y = 1.0 + Math.sin(now * 0.004) * 0.04;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

resize();
showMenu();
requestAnimationFrame(animate);
if (NUM === 0) document.getElementById("menu-1p").setAttribute("disabled", "");
