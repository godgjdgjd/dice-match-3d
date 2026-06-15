/* ============================================================
   engine.js — pure game logic for Dice Match 3D.
   Shared by the browser game AND the offline level solver/generator,
   so a level the solver proves solvable is solvable in-game.
   No DOM, no THREE. Runs in Node and the browser.
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Engine = api;
})(this, function () {
  // direction order matters: it defines char relocation priority,
  // so the game and solver must iterate identically.
  const DIRS = ["north", "south", "east", "west"];
  const DELTA = { north: [-1, 0], south: [1, 0], east: [0, 1], west: [0, -1] };

  function makeDie(top, north, east) {
    const bottom = 7 - top;
    if (north == null) {
      const pool = [1, 2, 3, 4, 5, 6].filter((v) => v !== top && v !== bottom);
      north = pool[0];
    }
    const south = 7 - north;
    if (east == null) {
      const rest = [1, 2, 3, 4, 5, 6].filter((v) => v !== top && v !== bottom && v !== north && v !== south);
      east = rest[0];
    }
    const west = 7 - east;
    return { top, bottom, north, south, east, west };
  }

  function randomOrientation(top, rnd) {
    rnd = rnd || Math.random;
    const bottom = 7 - top;
    const others = [1, 2, 3, 4, 5, 6].filter((v) => v !== top && v !== bottom);
    const north = others[(rnd() * others.length) | 0];
    const rest = others.filter((v) => v !== north && v !== 7 - north);
    const east = rest[(rnd() * rest.length) | 0];
    return makeDie(top, north, east);
  }

  function rollLogic(d, dir) {
    const { top, bottom, north, south, east, west } = d;
    if (dir === "north") { d.top = south; d.south = bottom; d.bottom = north; d.north = top; }
    else if (dir === "south") { d.top = north; d.north = bottom; d.bottom = south; d.south = top; }
    else if (dir === "east") { d.top = west; d.west = bottom; d.bottom = east; d.east = top; }
    else if (dir === "west") { d.top = east; d.east = bottom; d.bottom = west; d.west = top; }
  }

  function clone(st) {
    return {
      rows: st.rows, cols: st.cols,
      board: st.board.map((row) => row.map((d) => (d ? { ...d } : null))),
      char: { r: st.char.r, c: st.char.c },
    };
  }

  function key(st) {
    let s = "";
    for (let r = 0; r < st.rows; r++)
      for (let c = 0; c < st.cols; c++) {
        const d = st.board[r][c];
        s += d ? String.fromCharCode(48 + d.top + d.north * 6 + d.east * 36) : ".";
      }
    return s + "@" + st.char.r + "," + st.char.c;
  }

  function isEmpty(st) {
    for (let r = 0; r < st.rows; r++)
      for (let c = 0; c < st.cols; c++) if (st.board[r][c]) return false;
    return true;
  }

  function countDice(st) {
    let n = 0;
    for (let r = 0; r < st.rows; r++)
      for (let c = 0; c < st.cols; c++) if (st.board[r][c]) n++;
    return n;
  }

  // connected (4-neighbour) groups of equal top value; a group clears
  // when its size reaches that value. `riders` is the list of character
  // positions that "count" for the v===1 exception (a lone 1 only clears
  // when a character is standing on it); defaults to the single-player char.
  function findClears(st, riders) {
    riders = riders || (st.char ? [st.char] : []);
    const seen = Array.from({ length: st.rows }, () => Array(st.cols).fill(false));
    const out = [];
    for (let r = 0; r < st.rows; r++)
      for (let c = 0; c < st.cols; c++) {
        const d = st.board[r][c];
        if (!d || seen[r][c]) continue;
        const v = d.top, group = [], stack = [[r, c]];
        seen[r][c] = true;
        while (stack.length) {
          const [cr, cc] = stack.pop();
          group.push([cr, cc]);
          for (const dir of DIRS) {
            const [dr, dc] = DELTA[dir];
            const nr = cr + dr, nc = cc + dc;
            if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) continue;
            const nd = st.board[nr][nc];
            if (nd && !seen[nr][nc] && nd.top === v) { seen[nr][nc] = true; stack.push([nr, nc]); }
          }
        }
        // A group of value v clears when its size reaches v. Exception for
        // v === 1: a die showing 1 only clears when (a) the character is
        // riding it and (b) it is isolated (no adjacent die). A lone 1 the
        // character is not standing on must stay, and so must a 1 that has
        // any neighbour, so neither vanishes on its own.
        if (v === 1) {
          if (group.length === 1) {
            const [gr, gc] = group[0];
            const charOnTop = riders.some((p) => p && p.r === gr && p.c === gc);
            let hasNeighbour = false;
            for (const dir of DIRS) {
              const [dr, dc] = DELTA[dir];
              const nr = gr + dr, nc = gc + dc;
              if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) continue;
              if (st.board[nr][nc]) { hasNeighbour = true; break; }
            }
            if (charOnTop && !hasNeighbour) out.push(...group);
          }
        } else if (group.length >= v) {
          out.push(...group);
        }
      }
    return out;
  }

  function findSafe(st, exclude) {
    const { r, c } = st.char;
    for (const dir of DIRS) {
      const [dr, dc] = DELTA[dir];
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) continue;
      if (st.board[nr][nc] && !exclude.has(nr * st.cols + nc)) return { r: nr, c: nc };
    }
    for (let rr = 0; rr < st.rows; rr++)
      for (let cc = 0; cc < st.cols; cc++)
        if (st.board[rr][cc] && !exclude.has(rr * st.cols + cc)) return { r: rr, c: cc };
    return null;
  }

  // Apply a direction press. Returns { next, events } or null if illegal.
  function applyMove(st, dir) {
    const [dr, dc] = DELTA[dir];
    const cr = st.char.r, cc = st.char.c;
    const nr = cr + dr, nc = cc + dc;
    if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) return null;

    const next = clone(st);
    const events = [];

    if (next.board[nr][nc]) {
      // hop onto adjacent die
      next.char = { r: nr, c: nc };
      events.push({ type: "hop", from: { r: cr, c: cc }, to: { r: nr, c: nc } });
      return { next, events };
    }

    const die = next.board[cr][cc];
    if (!die) return null; // char must ride a die
    rollLogic(die, dir);
    next.board[nr][nc] = die;
    next.board[cr][cc] = null;
    next.char = { r: nr, c: nc };
    events.push({ type: "roll", from: { r: cr, c: cc }, to: { r: nr, c: nc } });

    // resolve cascading clears
    while (true) {
      const clears = findClears(next);
      if (clears.length === 0) break;
      const exclude = new Set(clears.map(([r, c]) => r * next.cols + c));
      for (const [r, c] of clears) next.board[r][c] = null;
      let relocate = null;
      if (exclude.has(next.char.r * next.cols + next.char.c)) {
        const safe = findSafe(next, exclude);
        if (safe) { relocate = { from: { ...next.char }, to: safe }; next.char = safe; }
      }
      events.push({ type: "round", clears, relocate });
    }
    return { next, events };
  }

  // BFS for a sequence of presses that clears the whole board.
  function solve(st0, opts) {
    opts = opts || {};
    const maxNodes = opts.maxNodes || 120000;
    const maxDepth = opts.maxDepth || 24;
    const start = clone(st0);
    if (isEmpty(start)) return [];
    const seen = new Set([key(start)]);
    const queue = [{ s: start, path: [] }];
    let head = 0, nodes = 0;
    while (head < queue.length) {
      const { s, path } = queue[head++];
      if (path.length >= maxDepth) continue;
      for (const d of DIRS) {
        const res = applyMove(s, d);
        if (!res) continue;
        const ns = res.next, k = key(ns);
        if (seen.has(k)) continue;
        if (isEmpty(ns)) return path.concat(d);
        seen.add(k);
        queue.push({ s: ns, path: path.concat(d) });
        if (++nodes > maxNodes) return null;
      }
    }
    return null;
  }

  // ---- two-player battle mode ----------------------------------
  // A shared board scattered with dice and two characters. Each player
  // rolls their own die; a player scores the dice they cause to clear.
  function cloneBattle(st) {
    return {
      rows: st.rows, cols: st.cols,
      board: st.board.map((row) => row.map((d) => (d ? { ...d } : null))),
      chars: st.chars.map((ch) => ({ r: ch.r, c: ch.c })),
      scores: st.scores.slice(),
    };
  }

  // nearest remaining (non-excluded) die to relocate a bumped character onto.
  function findSafeFrom(st, from, exclude) {
    for (const dir of DIRS) {
      const [dr, dc] = DELTA[dir];
      const nr = from.r + dr, nc = from.c + dc;
      if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) continue;
      if (st.board[nr][nc] && !exclude.has(nr * st.cols + nc)) return { r: nr, c: nc };
    }
    for (let rr = 0; rr < st.rows; rr++)
      for (let cc = 0; cc < st.cols; cc++)
        if (st.board[rr][cc] && !exclude.has(rr * st.cols + cc)) return { r: rr, c: cc };
    return null;
  }

  function makeBattleState(rows, cols, opts) {
    opts = opts || {};
    const rnd = opts.rnd || Math.random;
    const fill = opts.fill || 0.5;
    const values = opts.values || [1, 2, 3, 4, 5, 6];
    const board = Array.from({ length: rows }, () => Array(cols).fill(null));
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push([r, c]);
    for (let i = cells.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const nDice = Math.max(4, Math.round(rows * cols * fill));
    const filled = cells.slice(0, nDice);
    for (const [r, c] of filled) board[r][c] = randomOrientation(values[(rnd() * values.length) | 0], rnd);
    // start the two characters near opposite corners (min / max of r+c)
    const sorted = filled.slice().sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));
    const chars = [
      { r: sorted[0][0], c: sorted[0][1] },
      { r: sorted[sorted.length - 1][0], c: sorted[sorted.length - 1][1] },
    ];
    const st = { rows, cols, board, chars, scores: [0, 0] };
    // repick tops until the board starts with no ready-to-clear group
    let guard = 0;
    while (guard++ < 300) {
      const clears = findClears(st, st.chars);
      if (clears.length === 0) break;
      for (const [r, c] of clears) st.board[r][c] = randomOrientation(values[(rnd() * values.length) | 0], rnd);
    }
    return st;
  }

  // Apply a direction press for player `pi`. Same roll/clear rules as 1P,
  // but the acting player scores every die their move clears.
  function applyBattleMove(st, pi, dir) {
    const [dr, dc] = DELTA[dir];
    const cr = st.chars[pi].r, cc = st.chars[pi].c;
    const nr = cr + dr, nc = cc + dc;
    if (nr < 0 || nr >= st.rows || nc < 0 || nc >= st.cols) return null;

    const next = cloneBattle(st);
    const events = [];

    if (next.board[nr][nc]) {
      next.chars[pi] = { r: nr, c: nc };
      events.push({ type: "hop", player: pi, from: { r: cr, c: cc }, to: { r: nr, c: nc } });
      return { next, events };
    }

    const die = next.board[cr][cc];
    if (!die) return null;
    rollLogic(die, dir);
    next.board[nr][nc] = die;
    next.board[cr][cc] = null;
    const carried = [];
    for (let p = 0; p < next.chars.length; p++)
      if (next.chars[p].r === cr && next.chars[p].c === cc) { next.chars[p] = { r: nr, c: nc }; carried.push(p); }
    events.push({ type: "roll", player: pi, from: { r: cr, c: cc }, to: { r: nr, c: nc }, carried });

    while (true) {
      const clears = findClears(next, next.chars);
      if (clears.length === 0) break;
      const exclude = new Set(clears.map(([r, c]) => r * next.cols + c));
      for (const [r, c] of clears) next.board[r][c] = null;
      next.scores[pi] += clears.length;
      const relocations = [];
      for (let p = 0; p < next.chars.length; p++) {
        const ch = next.chars[p];
        if (exclude.has(ch.r * next.cols + ch.c)) {
          const safe = findSafeFrom(next, ch, exclude);
          if (safe) { relocations.push({ player: p, from: { ...ch }, to: safe }); next.chars[p] = safe; }
        }
      }
      events.push({ type: "round", clears, relocations, scorer: pi, gained: clears.length });
    }
    return { next, events };
  }

  function stateFromLevel(level) {
    const board = Array.from({ length: level.rows }, () => Array(level.cols).fill(null));
    for (const d of level.dice) board[d.r][d.c] = makeDie(d.top, d.north, d.east);
    return { rows: level.rows, cols: level.cols, board, char: { r: level.char.r, c: level.char.c } };
  }

  return {
    DIRS, DELTA, makeDie, randomOrientation, rollLogic, clone, key,
    isEmpty, countDice, findClears, findSafe, applyMove, solve, stateFromLevel,
    makeBattleState, applyBattleMove,
  };
});
