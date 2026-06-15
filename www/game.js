/* ============================================================
   Dice Match — a Devil Dice inspired puzzle sample
   Pure vanilla JS. No assets, no build step.
   ============================================================ */

const COLS = 5;
const ROWS = 6;
const MAX_LEVEL = 100;

// pip layout per value, using a 3x3 grid (slots 0..8)
const PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// ---- Die model -------------------------------------------------
// A die tracks all six faces so rolling can rotate them correctly.
function makeDie(top) {
  const bottom = 7 - top;
  const pool = [1, 2, 3, 4, 5, 6].filter((v) => v !== top && v !== bottom);
  const north = pool[0];
  const south = 7 - north;
  const rest = pool.filter((v) => v !== north && v !== south);
  const east = rest[0];
  const west = 7 - east;
  return { top, bottom, north, south, east, west, id: makeDie._id++ };
}
makeDie._id = 0;

// Rotate a die one step in a direction (returns the same object, mutated).
function roll(d, dir) {
  const { top, bottom, north, south, east, west } = d;
  if (dir === "north") {
    d.top = south; d.south = bottom; d.bottom = north; d.north = top;
  } else if (dir === "south") {
    d.top = north; d.north = bottom; d.bottom = south; d.south = top;
  } else if (dir === "east") {
    d.top = west; d.west = bottom; d.bottom = east; d.east = top;
  } else if (dir === "west") {
    d.top = east; d.east = bottom; d.bottom = west; d.west = top;
  }
  return d;
}

const DELTA = {
  north: [-1, 0],
  south: [1, 0],
  east: [0, 1],
  west: [0, -1],
};

// ---- Game state -----------------------------------------------
const state = {
  board: [],      // ROWS x COLS, each null or die
  level: 1,
  score: 0,
  cleared: 0,
  goal: 6,
  selected: null, // {r,c}
  busy: false,
};

// weighted random top value: low numbers are far more common so
// matches are actually achievable (a "6" needs six dice).
function randomTop() {
  const r = Math.random();
  if (r < 0.36) return 2;
  if (r < 0.72) return 3;
  if (r < 0.92) return 4;
  if (r < 0.98) return 5;
  return 6;
}

function buildLevel(level) {
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  // fill ~60% of cells, leaving room to maneuver
  const total = ROWS * COLS;
  const count = Math.min(total - 6, Math.round(total * 0.6));
  const cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push([r, c]);
  shuffle(cells);
  for (let i = 0; i < count; i++) {
    const [r, c] = cells[i];
    state.board[r][c] = makeDie(randomTop());
  }
  // resolve any matches that happen to spawn, so we start clean
  clearMatches();
  state.cleared = 0;
  state.score = state.score; // keep running total
  state.goal = 6 + Math.floor(level * 0.5);
  state.selected = null;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// ---- Matching --------------------------------------------------
// A connected group of same-top-value dice clears when its size
// reaches that value (e.g. three dice showing 3).
function findClears() {
  const seen = Array.from({ length: ROWS }, () => Array(COLS).fill(false));
  const toClear = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = state.board[r][c];
      if (!d || seen[r][c]) continue;
      const v = d.top;
      const group = [];
      const stack = [[r, c]];
      seen[r][c] = true;
      while (stack.length) {
        const [cr, cc] = stack.pop();
        group.push([cr, cc]);
        for (const [dr, dc] of Object.values(DELTA)) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
          const nd = state.board[nr][nc];
          if (nd && !seen[nr][nc] && nd.top === v) {
            seen[nr][nc] = true;
            stack.push([nr, nc]);
          }
        }
      }
      if (group.length >= v) toClear.push(...group);
    }
  }
  return toClear;
}

function clearMatches() {
  let total = 0;
  let pass = findClears();
  while (pass.length) {
    for (const [r, c] of pass) state.board[r][c] = null;
    total += pass.length;
    pass = findClears();
  }
  return total;
}

// ---- DOM rendering ---------------------------------------------
const boardEl = document.getElementById("board");
boardEl.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;

function dieEl(d, r, c) {
  const el = document.createElement("div");
  el.className = `die v${d.top}`;
  if (state.selected && state.selected.r === r && state.selected.c === c) {
    el.classList.add("selected");
  }
  const pips = PIPS[d.top];
  for (let i = 0; i < 9; i++) {
    const p = document.createElement("span");
    p.className = "pip" + (pips.includes(i) ? "" : " off");
    el.appendChild(p);
  }
  return el;
}

function render() {
  boardEl.innerHTML = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r;
      cell.dataset.c = c;
      const d = state.board[r][c];
      if (d) cell.appendChild(dieEl(d, r, c));
      boardEl.appendChild(cell);
    }
  }
  document.getElementById("level").textContent = state.level;
  document.getElementById("score").textContent = state.score;
  document.getElementById("cleared").textContent = state.cleared;
  document.getElementById("goal").textContent = state.goal;
}

// ---- Moves -----------------------------------------------------
function tryMove(r, c, dir) {
  if (state.busy) return;
  const d = state.board[r][c];
  if (!d) return;
  const [dr, dc] = DELTA[dir];
  const nr = r + dr, nc = c + dc;
  if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return;
  if (state.board[nr][nc]) return; // target occupied

  // move + rotate
  state.board[nr][nc] = roll(d, dir);
  state.board[r][c] = null;
  state.selected = { r: nr, c: nc };

  const cleared = clearMatches();
  if (cleared > 0) {
    state.score += cleared * 10;
    state.cleared += cleared;
  }
  render();

  if (state.cleared >= state.goal) {
    levelComplete();
  }
}

// ---- Level flow ------------------------------------------------
function levelComplete() {
  state.busy = true;
  if (state.level >= MAX_LEVEL) {
    showOverlay("ALL CLEAR! 🎉", `100레벨을 모두 깼어요!\n최종 점수 ${state.score}`, "다시 시작", () => {
      state.level = 1; state.score = 0; start();
    });
  } else {
    showOverlay("LEVEL CLEAR", `점수 ${state.score}`, "다음 레벨", () => {
      state.level++; start();
    });
  }
}

function start() {
  buildLevel(state.level);
  render();
  state.busy = false;
}

// ---- Overlay ---------------------------------------------------
const overlay = document.getElementById("overlay");
function showOverlay(title, text, btn, onClose) {
  document.getElementById("overlay-title").textContent = title;
  document.getElementById("overlay-text").textContent = text;
  const b = document.getElementById("overlay-btn");
  b.textContent = btn;
  b.onclick = () => { overlay.classList.add("hidden"); onClose(); };
  overlay.classList.remove("hidden");
}

// ---- Input: swipe on a die ------------------------------------
let startPos = null;
let startCell = null;

boardEl.addEventListener("pointerdown", (e) => {
  const cell = e.target.closest(".cell");
  if (!cell) return;
  const r = +cell.dataset.r, c = +cell.dataset.c;
  startPos = { x: e.clientX, y: e.clientY };
  startCell = state.board[r][c] ? { r, c } : null;
});

boardEl.addEventListener("pointerup", (e) => {
  if (!startPos) return;
  const dx = e.clientX - startPos.x;
  const dy = e.clientY - startPos.y;
  const dist = Math.hypot(dx, dy);
  const cell = e.target.closest(".cell");

  if (dist < 14) {
    // tap = select a die
    if (cell) {
      const r = +cell.dataset.r, c = +cell.dataset.c;
      state.selected = state.board[r][c] ? { r, c } : null;
      render();
    }
  } else if (startCell) {
    // swipe = roll that die
    let dir;
    if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? "east" : "west";
    else dir = dy > 0 ? "south" : "north";
    tryMove(startCell.r, startCell.c, dir);
  }
  startPos = null;
  startCell = null;
});

// ---- Input: direction pad (rolls the selected die) ------------
document.querySelectorAll(".dir").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!state.selected) return;
    tryMove(state.selected.r, state.selected.c, btn.dataset.dir);
  });
});

// keyboard for desktop testing
document.addEventListener("keydown", (e) => {
  if (!state.selected) return;
  const map = { ArrowUp: "north", ArrowDown: "south", ArrowLeft: "west", ArrowRight: "east" };
  if (map[e.key]) { e.preventDefault(); tryMove(state.selected.r, state.selected.c, map[e.key]); }
});

document.getElementById("reset").addEventListener("click", () => {
  buildLevel(state.level);
  render();
});

// go
start();
