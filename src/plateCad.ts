// Hình học 2D cho trình vẽ tấm PL: đoạn thẳng, cung, đường tròn – giao điểm, khoảng cách, nối thành vòng kín
import type { PlateEnt } from './model';

export type P = [number, number];
export type Prim =
  | { k: 'seg'; a: P; b: P; ent: PlateEnt; i: number }
  | { k: 'arc'; c: P; r: number; a0: number; a1: number; full: boolean; ent: PlateEnt; i: number };

export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
export const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];
export const crs = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
export const len = (a: P) => Math.hypot(a[0], a[1]);
export const nrm = (a: P): P => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
export const n360 = (a: number) => ((a % 360) + 360) % 360;
export const angDeg = (v: P) => n360((Math.atan2(v[1], v[0]) * 180) / Math.PI);
export const arcPt = (c: P, r: number, deg: number): P => [c[0] + r * Math.cos((deg * Math.PI) / 180), c[1] + r * Math.sin((deg * Math.PI) / 180)];
/** độ dài góc của cung (CCW từ a0 tới a1) */
export const spanOf = (a0: number, a1: number) => n360(a1 - a0) || 360;
export const inArc = (p: Extract<Prim, { k: 'arc' }>, deg: number, eps = 1e-6) => p.full || n360(deg - p.a0) <= spanOf(p.a0, p.a1) + eps;

export function primsOf(ents: PlateEnt[]): Prim[] {
  const out: Prim[] = [];
  for (const en of ents) {
    if (en.kind === 'circle') out.push({ k: 'arc', c: en.pts[0], r: en.r ?? 0, a0: 0, a1: 360, full: true, ent: en, i: 0 });
    else if (en.kind === 'arc') out.push({ k: 'arc', c: en.pts[0], r: en.r ?? 0, a0: en.a0 ?? 0, a1: en.a1 ?? 90, full: false, ent: en, i: 0 });
    else
      en.pts.forEach((a, i) => {
        const b = en.pts[i + 1] ?? (en.closed && en.pts.length > 2 ? en.pts[0] : undefined);
        if (b) out.push({ k: 'seg', a, b, ent: en, i });
      });
  }
  return out;
}
export const arcEnds = (p: Extract<Prim, { k: 'arc' }>): [P, P] => [arcPt(p.c, p.r, p.a0), arcPt(p.c, p.r, p.a1)];

/** tham số t trên đường ab (vô hạn) và u trên cd tại giao điểm */
export function lineLine(a: P, b: P, c: P, d: P): { t: number; u: number } | null {
  const r = sub(b, a), s = sub(d, c);
  const den = crs(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const qp = sub(c, a);
  return { t: crs(qp, s) / den, u: crs(qp, r) / den };
}
/** tham số t trên đường ab (vô hạn) cắt đường tròn (c, r) */
export function lineCircle(a: P, b: P, c: P, r: number): number[] {
  const d = sub(b, a), f = sub(a, c);
  const A = dot(d, d), B = 2 * dot(f, d), C = dot(f, f) - r * r;
  const disc = B * B - 4 * A * C;
  if (A < 1e-12 || disc < -1e-9) return [];
  const sq = Math.sqrt(Math.max(0, disc));
  return disc < 1e-9 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
}
export function circleCircle(c1: P, r1: number, c2: P, r2: number): P[] {
  const d = len(sub(c2, c1));
  if (d < 1e-9 || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const u = nrm(sub(c2, c1)), m = add(c1, mul(u, a));
  return h < 1e-9 ? [m] : [add(m, mul([-u[1], u[0]], h)), add(m, mul([u[1], -u[0]], h))];
}
const EPS = 1e-7;
/** giao điểm của đường (vô hạn) qua đoạn a-b với một primitive (giới hạn trong primitive) → tham số t trên ab */
export function lineHits(a: P, b: P, p: Prim): number[] {
  if (p.k === 'seg') {
    const r = lineLine(a, b, p.a, p.b);
    return r && r.u >= -EPS && r.u <= 1 + EPS ? [r.t] : [];
  }
  return lineCircle(a, b, p.c, p.r).filter((t) => inArc(p, angDeg(sub(add(a, mul(sub(b, a), t)), p.c))));
}
/** giao điểm (hữu hạn) giữa 2 primitive */
export function interPts(p: Prim, q: Prim): P[] {
  if (p.k === 'seg') return lineHits(p.a, p.b, q).filter((t) => t >= -EPS && t <= 1 + EPS).map((t) => add(p.a, mul(sub(p.b, p.a), t)));
  if (q.k === 'seg') return interPts(q, p);
  return circleCircle(p.c, p.r, q.c, q.r).filter((x) => inArc(p, angDeg(sub(x, p.c))) && inArc(q, angDeg(sub(x, q.c))));
}
export function distSeg(q: P, a: P, b: P) {
  const d = sub(b, a), l2 = dot(d, d) || 1;
  const t = Math.max(0, Math.min(1, dot(sub(q, a), d) / l2));
  return len(sub(q, add(a, mul(d, t))));
}
export function distPrim(q: P, p: Prim): number {
  if (p.k === 'seg') return distSeg(q, p.a, p.b);
  const d = Math.abs(len(sub(q, p.c)) - p.r);
  if (inArc(p, angDeg(sub(q, p.c)))) return d;
  const [e0, e1] = arcEnds(p);
  return Math.min(len(sub(q, e0)), len(sub(q, e1)));
}
/** các điểm của cung CCW a0 → a1 */
export function arcPoints(c: P, r: number, a0: number, a1: number, stepDeg = 5): P[] {
  const span = spanOf(a0, a1);
  const n = Math.max(2, Math.ceil(span / stepDeg));
  return Array.from({ length: n + 1 }, (_, k) => arcPt(c, r, a0 + (span * k) / n));
}
const areaOf = (pts: P[]) => pts.reduce((s, p, i) => s + crs(p, pts[(i + 1) % pts.length]), 0) / 2;

/** nối các đoạn / cung (không gồm đường tròn kín) thành các vòng kín theo điểm đầu cuối trùng nhau */
export function chainLoops(prims: Prim[], tol = 0.5): P[][] {
  const edges = prims
    .filter((p) => !(p.k === 'arc' && p.full))
    .map((p) => (p.k === 'seg' ? [p.a, p.b] : arcPoints(p.c, p.r, p.a0, p.a1)));
  const nodes: P[] = [];
  const node = (p: P) => {
    let i = nodes.findIndex((n) => len(sub(n, p)) <= tol);
    if (i < 0) i = nodes.push(p) - 1;
    return i;
  };
  const ends = edges.map((e) => [node(e[0]), node(e[e.length - 1])] as [number, number]);
  const used = new Array(edges.length).fill(false);
  const loops: P[][] = [];
  for (let s = 0; s < edges.length; s++) {
    if (used[s] || ends[s][0] === ends[s][1]) continue;
    const start = ends[s][0];
    let cur = ends[s][1];
    const pts: P[] = [...edges[s]];
    const take = [s];
    used[s] = true;
    let ok = false;
    for (let guard = 0; guard < edges.length; guard++) {
      if (cur === start) {
        ok = true;
        break;
      }
      const nx = ends.findIndex((e, i) => !used[i] && (e[0] === cur || e[1] === cur));
      if (nx < 0) break;
      used[nx] = true;
      take.push(nx);
      const fwd = ends[nx][0] === cur;
      const seq = fwd ? edges[nx] : [...edges[nx]].reverse();
      pts.push(...seq.slice(1));
      cur = fwd ? ends[nx][1] : ends[nx][0];
    }
    if (ok && pts.length >= 4) loops.push(pts.slice(0, -1));
    else take.slice(1).forEach((i) => (used[i] = false));
  }
  return loops.filter((l) => Math.abs(areaOf(l)) > 1e-6);
}

/** biên ngoài (vòng lớn nhất trên layer 外形) + lỗ (tròn / vòng kín trên layer 穴) */
export function plateLoops(ents: PlateEnt[]): { outer: P[] | null; holes: { c: P; r: number }[]; holePolys: P[][] } {
  const outLoops = chainLoops(primsOf(ents.filter((e) => e.layer === 'outline')));
  const outer = outLoops.sort((a, b) => Math.abs(areaOf(b)) - Math.abs(areaOf(a)))[0] ?? null;
  const holeEnts = ents.filter((e) => e.layer === 'hole');
  const holes = holeEnts.filter((e) => e.kind === 'circle' && e.r).map((e) => ({ c: e.pts[0], r: e.r! }));
  const holePolys = chainLoops(primsOf(holeEnts));
  return { outer, holes, holePolys };
}

/**
 * Kiểm tra biên dạng kín: trên layer 外形 / 穴 mọi đầu mút phải nối với đúng 1 đầu mút khác (bậc 2).
 * Trả về các điểm hở (bậc lẻ / đứng một mình).
 */
export function openEnds(ents: PlateEnt[], tol = 0.5): P[] {
  const edges = primsOf(ents)
    .filter((p) => !(p.k === 'arc' && p.full))
    .map((p) => (p.k === 'seg' ? [p.a, p.b] : arcEnds(p)));
  const nodes: { p: P; n: number }[] = [];
  for (const [a, b] of edges)
    for (const x of [a, b]) {
      const f = nodes.find((m) => len(sub(m.p, x)) <= tol);
      if (f) f.n++;
      else nodes.push({ p: x, n: 1 });
    }
  return nodes.filter((m) => m.n % 2 === 1).map((m) => m.p);
}
