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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
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
  // ZOOM: smaller multipliers = camera closer = board fills more of the screen
  camera.position.set(0, d * 0.85 + 1.4, d * 0.78 + 1.7);
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
  requestFrame();
}
window.addEventListener("resize", resize);

// ---- pip textures + die mesh ----------------------------------
const PIP_SLOTS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
// 1 = vivid yellow, 2 = clear orange — kept far enough apart in hue + brightness
// so the two warm faces don't read as the same colour.
const FACE_COLOR = { 1: "#ffd23f", 2: "#ff8a3d", 3: "#2ec4b6", 4: "#4895ef", 5: "#ef476f", 6: "#9b5de5" };
// luminance of a #rrggbb colour (0 dark .. 1 light)
function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
const texCache = {};
function pipTexture(value) {
  if (texCache[value]) return texCache[value];
  const N = 128, cv = document.createElement("canvas");
  cv.width = cv.height = N;
  const ctx = cv.getContext("2d");
  const face = FACE_COLOR[value] || "#ddd";
  roundRect(ctx, 4, 4, N - 8, N - 8, 22);
  ctx.fillStyle = face; ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 4; ctx.stroke();
  // dark pips on light faces (1,2), light pips on dark faces — plus a thin
  // contrasting halo so the dots stay crisp on every colour.
  const light = luminance(face) > 0.6;
  const pip = light ? "#241a02" : "#fffdf5";
  const halo = light ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.32)";
  const pos = [0.27, 0.5, 0.73];
  for (const slot of PIP_SLOTS[value]) {
    const x = pos[slot % 3] * N, y = pos[(slot / 3) | 0] * N;
    ctx.beginPath();
    ctx.arc(x, y, N * 0.092, 0, Math.PI * 2);
    ctx.fillStyle = pip; ctx.fill();
    ctx.lineWidth = N * 0.018; ctx.strokeStyle = halo; ctx.stroke();
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

// ---- characters (themed per player) ---------------------------
// Stylised low-poly caricatures built from THREE primitives — homage shapes,
// not official assets. Each sits on a die (~0.5 tall) and faces the camera (+z).
const lamb = (c) => new THREE.MeshLambertMaterial({ color: c });
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });

// P1 — dark-helmeted villain (Star Wars vibe)
function makeVader() {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.27, 0.34, 18), lamb(0x111114));
  robe.position.y = 0.17; g.add(robe);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.2), lamb(0x17171c));
  chest.position.y = 0.33; g.add(chest);
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.12, 16), lamb(0x05050a));
  flare.position.y = 0.43; g.add(flare);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 14), lamb(0x05050a));
  helm.position.y = 0.52; g.add(helm);
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.16, 0.08), lamb(0x3a3a42));
  mask.position.set(0, 0.5, 0.12); g.add(mask);
  for (const dx of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), lamb(0x0a0a0a));
    eye.position.set(dx, 0.53, 0.165); g.add(eye);
  }
  const saber = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 8), glow(0xff2b2b));
  saber.position.set(0.27, 0.33, 0.05); saber.rotation.z = -0.22; g.add(saber);
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.09, 8), lamb(0x9a9aa0));
  hilt.position.set(0.21, 0.11, 0.05); hilt.rotation.z = -0.22; g.add(hilt);
  return g;
}

// P2 — yellow electric mouse (Pikachu vibe)
function makePikachu() {
  const g = new THREE.Group();
  const yel = lamb(0xffd83b), blk = lamb(0x161616);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), yel);
  body.scale.set(1, 0.95, 0.9); body.position.y = 0.27; g.add(body);
  for (const dx of [-0.12, 0.12]) {
    const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.06, 0.22, 10), yel);
    ear.position.set(dx, 0.52, -0.02); ear.rotation.z = dx > 0 ? -0.32 : 0.32; g.add(ear);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.034, 0.08, 10), blk);
    tip.position.set(dx * 1.4, 0.62, -0.05); tip.rotation.z = dx > 0 ? -0.32 : 0.32; g.add(tip);
  }
  for (const dx of [-0.1, 0.1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), blk);
    eye.position.set(dx, 0.33, 0.22); g.add(eye);
    const hi = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), lamb(0xffffff));
    hi.position.set(dx + 0.012, 0.345, 0.255); g.add(hi);
  }
  for (const dx of [-0.17, 0.17]) {
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), lamb(0xe23b3b));
    cheek.position.set(dx, 0.25, 0.16); g.add(cheek);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), blk);
  nose.position.set(0, 0.28, 0.27); g.add(nose);
  return g;
}

// P3 — blocky dragon in End-purple with glowing eyes (Minecraft Ender Dragon vibe)
function makeEnderDragon() {
  const g = new THREE.Group();
  const purple = lamb(0x7b3ff2), lite = lamb(0xa66bff), wing = lamb(0xd14be0);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.34), purple);
  body.position.y = 0.18; g.add(body);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.16), purple);
  neck.position.set(0, 0.33, 0.12); g.add(neck);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.2), lite);
  head.position.set(0, 0.44, 0.2); g.add(head);
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.12), lite);
  snout.position.set(0, 0.4, 0.34); g.add(snout);
  for (const dx of [-0.07, 0.07]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.03), glow(0x3df0d0));
    eye.position.set(dx, 0.47, 0.3); g.add(eye);
  }
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.16), wing);
    w.position.set(s * 0.22, 0.3, -0.06); w.rotation.z = s * 0.4; w.rotation.y = s * 0.35; g.add(w);
  }
  return g;
}

// P4 — bespectacled young wizard in Gryffindor red + gold (Harry Potter vibe)
function makeWizard() {
  const g = new THREE.Group();
  const red = lamb(0xa01e2e), gold = lamb(0xf2c14e);
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.32, 16), red);
  robe.position.y = 0.16; g.add(robe);
  const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, 0.05, 16), gold);
  trim.position.y = 0.055; g.add(trim);
  const scarf = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 16), lamb(0xc0392b));
  scarf.position.y = 0.33; g.add(scarf);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.138, 0.138, 0.02, 16), gold);
  stripe.position.y = 0.34; g.add(stripe);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 16), lamb(0xf0bd95));
  head.position.y = 0.46; g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.162, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), lamb(0x4a2e16));
  hair.position.y = 0.485; g.add(hair);
  const frame = lamb(0x222222);
  for (const dx of [-0.06, 0.06]) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.008, 8, 16), frame);
    lens.position.set(dx, 0.46, 0.135); g.add(lens);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), frame);
    eye.position.set(dx, 0.46, 0.13); g.add(eye);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.008, 0.008), frame);
  bridge.position.set(0, 0.46, 0.15); g.add(bridge);
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.26, 6), lamb(0x8a5a2b));
  wand.position.set(0.24, 0.3, 0.06); wand.rotation.z = -0.3; g.add(wand);
  return g;
}

// generic cute slime (a roster option, picks a fixed friendly colour)
function makeSlime() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 28, 20), lamb(0x58d68d));
  body.scale.set(1, 0.82, 1); body.position.y = 0.24; g.add(body);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.06, 24), lamb(0x1e7a4d));
  rim.position.y = 0.03; g.add(rim);
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  shine.position.set(-0.1, 0.42, 0.12); g.add(shine);
  for (const dx of [-0.11, 0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), lamb(0xffffff));
    eye.position.set(dx, 0.3, 0.2); g.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), lamb(0x111111));
    pup.position.set(dx, 0.29, 0.265); g.add(pup);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.013, 8, 18, Math.PI), lamb(0x2a1020));
  mouth.position.set(0, 0.2, 0.255); mouth.rotation.z = Math.PI; g.add(mouth);
  return g;
}

// pickable roster; `picks[p]` is the chosen roster index for player p
const ROSTER = [
  { name: "슬라임", emoji: "🟢", make: makeSlime },
  { name: "다스베이더", emoji: "🗡️", make: makeVader },
  { name: "피카츄", emoji: "⚡", make: makePikachu },
  { name: "엔더드래곤", emoji: "🐉", make: makeEnderDragon },
  { name: "해리포터", emoji: "🧙", make: makeWizard },
];
const picks = [1, 2, 3, 4]; // default: vader / pika / ender / harry
const CHAR_SCALE = 1.25;    // characters read a bit small on the die otherwise
let characters = [];
function buildCharacters() {
  for (const c of characters) { scene.remove(c); disposeMesh(c); }
  characters = picks.map((ri) => ROSTER[ri % ROSTER.length].make());
  characters.forEach((c) => { c.visible = false; c.scale.setScalar(CHAR_SCALE); scene.add(c); });
}

// ---- game state -----------------------------------------------
// mode: "1p" (level progression) | "2p" | "4p" (shared-board battle)
const game = { mode: "1p", players: 1, idx: 1, st: null, meshAt: [], par: 0 };
function isBattle() { return game.players >= 2; }
function activePlayers() { return Array.from({ length: game.players }, (_, i) => i); }
// per-player {r,c}; 1P uses only index 0 and mirrors game.st.char
function charRC(pi) { return isBattle() ? game.st.chars[pi] : game.st.char; }

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
  game.players = 1;
  const data = LEVELS[idx - 1];
  game.idx = idx;
  game.st = Engine.stateFromLevel(data);
  game.par = data.par;
  buildBoardMeshes();
  characters.forEach((c, i) => (c.visible = i === 0));
  characters[0].position.copy(charPosOn(game.st.char.r, game.st.char.c));
  clearLocks();
  applyModeClass();
  updateHUD();
  requestFrame();
}

// Shared-board battle: scattered dice, players race to clear the most. Bigger
// board for 4P. No level progression — replay from the menu / reset.
const BATTLE = { 2: { rows: 8, cols: 8, fill: 0.5 }, 3: { rows: 9, cols: 9, fill: 0.5 }, 4: { rows: 9, cols: 9, fill: 0.5 } };
function startBattle(n) {
  game.players = n;
  game.mode = n + "p";
  const cfg = BATTLE[n];
  game.st = Engine.makeBattleState(cfg.rows, cfg.cols, { fill: cfg.fill, players: n });
  buildBoardMeshes();
  characters.forEach((c, i) => (c.visible = i < n));
  for (let p = 0; p < n; p++) characters[p].position.copy(charPosOn(game.st.chars[p].r, game.st.chars[p].c));
  clearLocks();
  applyModeClass();
  updateHUD();
  requestFrame();
}

function updateHUD() {
  if (isBattle()) {
    document.getElementById("remain").textContent = Engine.countDice(game.st);
    for (let p = 0; p < 4; p++) {
      const el = document.getElementById("score" + p);
      if (el) el.textContent = p < game.players ? game.st.scores[p] : "";
    }
    return;
  }
  document.getElementById("level").textContent = game.idx;
  document.getElementById("left").textContent = Engine.countDice(game.st);
  document.getElementById("par").textContent = game.par;
}

// drive which HUD / pads are visible from the current mode
function applyModeClass() {
  document.body.classList.toggle("mode-battle", isBattle());
  document.body.classList.toggle("mode-2p", game.mode === "2p");
  document.body.classList.toggle("mode-3p", game.mode === "3p");
  document.body.classList.toggle("mode-4p", game.mode === "4p");
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
const heldDir = [null, null]; // direction each player is currently holding
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
function clearLocks() { busyPlayer[0] = busyPlayer[1] = false; busyCells.clear(); inputQueue.length = 0; heldDir[0] = heldDir[1] = null; }

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
    const res = isBattle()
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
      if (heldDir[m.player]) requestMove(m.player, heldDir[m.player]); // keep moving while held
      pump();
    });
    requestFrame(); // wake the render loop for this move's animation
  }
}

// Hold-to-move: a press sets the player's held direction, which keeps firing
// moves until released. The repeat is driven from each move's completion (see
// pump), so it paces with the animation and naturally stops at a wall.
function setHeld(player, dir) {
  if (heldDir[player] === dir) return;
  heldDir[player] = dir;
  if (dir && !busyPlayer[player]) requestMove(player, dir); // kick now if idle
}

// Fixed-centre joystick: direction is the offset from the pad's centre, so just
// pressing-and-holding one side keeps moving that way (no sliding needed), and
// dragging across re-steers. Each pad captures its own pointer id so both can be
// held at once. Movement repeats via the per-move completion in pump().
function setupJoystick(padEl, player) {
  if (!padEl) return;
  const stick = padEl.querySelector(".stick");
  const DEAD = 10, MAXR = 44;
  let pid = null, cx = 0, cy = 0;
  function update(clientX, clientY) {
    const dx = clientX - cx, dy = clientY - cy, mag = Math.hypot(dx, dy);
    if (stick) { const k = mag > MAXR ? MAXR / mag : 1; stick.style.transform = `translate(${dx * k}px, ${dy * k}px)`; }
    let dir = null;
    if (mag >= DEAD) dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : (dy > 0 ? "south" : "north");
    setHeld(player, dir);
  }
  function release() { pid = null; padEl.classList.remove("active"); if (stick) stick.style.transform = ""; setHeld(player, null); }
  padEl.addEventListener("pointerdown", (e) => {
    if (pid !== null || !overlay.classList.contains("hidden")) return;
    const r = padEl.getBoundingClientRect();
    cx = r.left + r.width / 2; cy = r.top + r.height / 2;
    pid = e.pointerId; padEl.setPointerCapture(pid); padEl.classList.add("active");
    e.preventDefault(); update(e.clientX, e.clientY);
  });
  padEl.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pid) return;
    update(e.clientX, e.clientY); e.preventDefault();
  });
  const end = (e) => { if (e.pointerId === pid) release(); };
  padEl.addEventListener("pointerup", end);
  padEl.addEventListener("pointercancel", end);
}
// All four pads use the same absolute (push = move) joystick. The opposite-side
// players' pad ARROWS are rotated 180° in CSS, so operating from their seat is
// naturally reversed relative to the screen — no direction inversion in code.
setupJoystick(document.getElementById("pad"), 0);
setupJoystick(document.getElementById("pad2"), 1);
setupJoystick(document.getElementById("pad3"), 2);
setupJoystick(document.getElementById("pad4"), 3);

const KEY0 = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
const KEY1 = { w: "north", s: "south", a: "west", d: "east" };
document.addEventListener("keydown", (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (KEY0[k]) { e.preventDefault(); setHeld(0, KEY0[k]); }
  else if (isBattle() && KEY1[k]) { e.preventDefault(); setHeld(1, KEY1[k]); }
});
document.addEventListener("keyup", (e) => {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (KEY0[k]) setHeld(0, null);
  else if (KEY1[k]) setHeld(1, null);
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
  if (isBattle()) startBattle(game.players); else loadLevel(game.idx);
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
  if (isBattle()) battleComplete();
  else levelComplete();
}
function levelComplete() {
  if (game.idx >= NUM) {
    showOverlay("ALL CLEAR! 🎉", `${NUM}레벨을 모두 깼어요!`, "다시 시작", () => loadLevel(1));
  } else {
    showOverlay("LEVEL CLEAR", `최소 ${game.par}수 퍼즐 클리어!`, "다음 레벨", () => loadLevel(game.idx + 1));
  }
}
const PLAYER_EMOJI = ["🔴", "🔵", "🟢", "🟡"];
function battleComplete() {
  const scores = game.st.scores;
  const top = Math.max(...scores);
  const winners = scores.map((s, i) => (s === top ? i : -1)).filter((i) => i >= 0);
  const title = winners.length > 1
    ? "무승부!"
    : `PLAYER ${winners[0] + 1} 승리! ${PLAYER_EMOJI[winners[0]]}`;
  const text = scores.map((s, i) => `${PLAYER_EMOJI[i]} ${s}`).join("   ");
  showOverlay(title, text, "다시 하기", () => startBattle(game.players));
}

// ---- main menu + character select -----------------------------
const menu = document.getElementById("menu");
const select = document.getElementById("select");
function showMenu() {
  overlay.classList.add("hidden");
  select.classList.add("hidden");
  menu.classList.remove("hidden");
}

// chosen player count for the pending game; 1 = single-player levels
let selPlayers = 1;
function openSelect(n) {
  selPlayers = n;
  const rows = document.getElementById("select-rows");
  rows.innerHTML = "";
  for (let p = 0; p < n; p++) {
    const row = document.createElement("div");
    row.className = "select-row";
    const label = document.createElement("span");
    label.className = "select-plabel"; label.style.color = PLAYER_HEX[p];
    label.textContent = "P" + (p + 1);
    row.appendChild(label);
    ROSTER.forEach((char, ri) => {
      const b = document.createElement("button");
      b.className = "char-btn" + (picks[p] === ri ? " sel" : "");
      b.dataset.player = p; b.dataset.ri = ri;
      b.innerHTML = `<span class="char-emoji">${char.emoji}</span>${char.name}`;
      b.addEventListener("click", () => {
        picks[p] = ri;
        rows.querySelectorAll(`.char-btn[data-player="${p}"]`).forEach((x) => x.classList.toggle("sel", +x.dataset.ri === ri));
      });
      row.appendChild(b);
    });
    rows.appendChild(row);
  }
  menu.classList.add("hidden");
  select.classList.remove("hidden");
}
const PLAYER_HEX = ["#ff6b78", "#7ad8f5", "#7fe6a8", "#f7df85"];
document.getElementById("menu-1p").addEventListener("click", () => openSelect(1));
document.getElementById("menu-2p").addEventListener("click", () => openSelect(2));
document.getElementById("menu-3p").addEventListener("click", () => openSelect(3));
document.getElementById("menu-4p").addEventListener("click", () => openSelect(4));
document.getElementById("select-back").addEventListener("click", showMenu);
document.getElementById("select-start").addEventListener("click", () => {
  select.classList.add("hidden");
  buildCharacters();
  if (selPlayers === 1) loadLevel(1); else startBattle(selPlayers);
});
document.getElementById("to-menu").addEventListener("click", () => { if (!anyBusy()) showMenu(); });

// ---- main loop -------------------------------------------------
// Render on demand: the loop only runs while something is animating (tweens
// present) and stops when the board is still, so an idle game stops driving the
// GPU. It also parks itself when the app is backgrounded. requestFrame() wakes
// it after any change (move, level load, resize, returning to foreground).
let looping = false;
function requestFrame() {
  if (!looping && !document.hidden) { looping = true; requestAnimationFrame(animate); }
}
function animate(now) {
  for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].step(now)) tweens.splice(i, 1);
  renderer.render(scene, camera);
  if (tweens.length && !document.hidden) requestAnimationFrame(animate);
  else looping = false;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) requestFrame(); });

resize();
showMenu();
requestFrame();
if (NUM === 0) document.getElementById("menu-1p").setAttribute("disabled", "");
