// solve.js — a faster drop-in for makefun-diff 1.0.0 (original implementation).
//
// Same answer as makefun-diff's diffPatch on every input, faster: the house
// baseline's Myers search allocates a path object per diagonal per edit depth
// (O(D^2) allocations) and compares lines as strings. This module instead
//   1. splits each text once (String.split, C++ fast) and trims the common
//      prefix/suffix on the parts, with the newline rule applied explicitly
//      (a line has '\n' iff it is not its text's last part);
//   2. interns only the middle lines to integer ids in one shared Map per
//      newline class, so line equality is an int comparison;
//   3. runs Myers's greedy search on Int32Array V-arrays, storing every depth's
//      V for an exact backtrack that inverts the forward choice — deletion when
//      it reaches at least as far into the old text as the insertion, a move
//      past either text's end no candidate, no edge pruning — the house rule;
//   4. formats the patch exactly as makefun-diff does (hunks, 3 context lines,
//      '%' after a line with no trailing newline).
//
// Deterministic, pure CPU, no clock or randomness: two runs write byte-identical
// answers.

const KEEP = 0;
const DEL = 1;
const INS = 2;
const CONTEXT = 3;

/** A line as the patch writes it: op, the line, a newline, '%' on its own line when it had none. */
function written(op, line) {
  return line.endsWith('\n') ? `${op}${line}` : `${op}${line}\n%\n`;
}

/**
 * The edit-script runs of aIds into bIds: [{ kind, count }], KEEP/DEL/INS in
 * order — the same runs makefun-diff's search returns for the same lines.
 * a and b hold integer line ids; equal ids are equal lines.
 */
function myersRuns(a, b) {
  const n = a.length;
  const m = b.length;
  const Vs = [];
  // Depth 0: the snake from (0, 0).
  let x = 0;
  let y = 0;
  while (x < n && y < m && a[x] === b[y]) { x++; y++; }
  const V0 = new Int32Array(1);
  V0[0] = x;
  Vs.push(V0);
  if (x >= n && y >= m) return n === 0 ? [] : [{ kind: KEEP, count: n }];

  let D = -1;
  for (let d = 1; d <= n + m; d++) {
    // Zero-filled; every even index is written below and odd indices are never
    // read (k + d is even), so no per-depth fill is needed.
    const V = new Int32Array(2 * d + 1);
    const Vprev = Vs[d - 1];
    let done = false;
    for (let k = -d; k <= d; k += 2) {
      const idx = k + d;
      // Deletion candidate: one old line past the (d-1)-point on k-1.
      // Its V index (k + d - 2) is in range exactly when k > -d.
      // Insertion candidate: one new line past the (d-1)-point on k+1.
      // Its V index (k + d) is in range exactly when k < d.
      let delX = -1;
      let insX = -1;
      if (k > -d) {
        const v = Vprev[k + d - 2];
        if (v >= 0 && v < n) delX = v + 1;
      }
      if (k < d) {
        const v = Vprev[k + d];
        if (v >= 0 && v - (k + 1) < m) insX = v;
      }
      if (delX < 0 && insX < 0) { V[idx] = -1; continue; } // no candidate
      x = delX >= insX ? delX : insX; // deletion wins the tie, as the house rule says
      y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      V[idx] = x;
      if (x >= n && y >= m) { D = d; done = true; break; }
    }
    Vs.push(V);
    if (done) break;
  }
  if (D < 0) throw new Error('diff-speed: the search ended without reaching both ends');

  // Backtrack from (n, m) at depth D, inverting the forward choice exactly.
  const rev = [];
  x = n;
  y = m;
  for (let d = D; d >= 1; d--) {
    const k = x - y;
    const Vprev = Vs[d - 1];
    // Same index rule as the forward pass: k-1 is in range iff k > -d, k+1 iff k < d.
    let delX = -1;
    let insX = -1;
    let prevXDel = -1;
    let prevXIns = -1;
    if (k > -d) {
      const v = Vprev[k + d - 2];
      if (v >= 0 && v < n) { delX = v + 1; prevXDel = v; }
    }
    if (k < d) {
      const v = Vprev[k + d];
      if (v >= 0 && v - (k + 1) < m) { insX = v; prevXIns = v; }
    }
    if (delX < 0 && insX < 0) throw new Error('diff-speed: backtrack lost the path');
    if (delX >= insX) {
      const keeps = x - delX;
      if (keeps > 0) rev.push({ kind: KEEP, count: keeps });
      rev.push({ kind: DEL, count: 1 });
      x = prevXDel;
      y = prevXDel - (k - 1);
    } else {
      const keeps = x - insX;
      if (keeps > 0) rev.push({ kind: KEEP, count: keeps });
      rev.push({ kind: INS, count: 1 });
      x = prevXIns;
      y = prevXIns - (k + 1);
    }
  }
  if (x > 0) rev.push({ kind: KEEP, count: x });
  rev.reverse();
  const runs = [];
  for (const r of rev) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === r.kind) last.count += r.count;
    else runs.push({ kind: r.kind, count: r.count });
  }
  return runs;
}

/** makefun-diff 1.0.0's answer for one case's input. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const aParts = input.old.split('\n');
  const bParts = input.new.split('\n');
  const aLast = aParts.length - 1;
  const bLast = bParts.length - 1;
  const n = aParts.length - (aParts[aLast] === '' ? 1 : 0);
  const m = bParts.length - (bParts[bLast] === '' ? 1 : 0);
  // A line has its '\n' iff it is not its text's last part.
  const aHasNL = (i) => i < aLast;
  const bHasNL = (j) => j < bLast;
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && aParts[prefix] === bParts[prefix] && aHasNL(prefix) === bHasNL(prefix)) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && aParts[n - 1 - suffix] === bParts[m - 1 - suffix] && aHasNL(n - 1 - suffix) === bHasNL(m - 1 - suffix)) suffix++;

  // Intern the middle lines to integer ids. Two maps so a line without '\n'
  // (only ever a text's last line) never collides with the same content plus '\n'.
  const mapNL = new Map();
  const mapNoNL = new Map();
  let nextId = 0;
  const nMid = n - prefix - suffix;
  const mMid = m - prefix - suffix;
  const aIds = new Int32Array(nMid);
  const bIds = new Int32Array(mMid);
  for (let i = 0; i < nMid; i++) {
    const part = aParts[prefix + i];
    if (prefix + i < aLast) {
      let id = mapNL.get(part);
      if (id === undefined) { id = nextId++; mapNL.set(part, id); }
      aIds[i] = id;
    } else {
      let id = mapNoNL.get(part);
      if (id === undefined) { id = nextId++; mapNoNL.set(part, id); }
      aIds[i] = id;
    }
  }
  for (let j = 0; j < mMid; j++) {
    const part = bParts[prefix + j];
    if (prefix + j < bLast) {
      let id = mapNL.get(part);
      if (id === undefined) { id = nextId++; mapNL.set(part, id); }
      bIds[j] = id;
    } else {
      let id = mapNoNL.get(part);
      if (id === undefined) { id = nextId++; mapNoNL.set(part, id); }
      bIds[j] = id;
    }
  }

  const runs = [];
  if (prefix > 0) runs.push({ kind: KEEP, count: prefix });
  runs.push(...myersRuns(aIds, bIds));
  if (suffix > 0) runs.push({ kind: KEEP, count: suffix });

  // The change runs: each a stretch of deletions and insertions between two kept lines.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) {
      o += r.count;
      p += r.count;
      continue;
    }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DEL) {
      c.dels += r.count;
      o += r.count;
      deleted += r.count;
    } else {
      c.ins += r.count;
      p += r.count;
      inserted += r.count;
    }
  }

  // The hunks: change runs at most 2 * CONTEXT kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }

  const lineA = (i) => (i < aLast ? `${aParts[i]}\n` : aParts[i]);
  const lineB = (j) => (j < bLast ? `${bParts[j]}\n` : bParts[j]);
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', lineA(at)));
      for (let i = 0; i < c.dels; i++) out.push(written('-', lineA(c.o + i)));
      for (let i = 0; i < c.ins; i++) out.push(written('+', lineB(c.p + i)));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', lineA(at)));
  }
  return out.join('');
}
