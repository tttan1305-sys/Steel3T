// 寸法 trên 3D: chuỗi kích thước lưới trục / tầng và khoảng cách của cấu kiện đang chọn (mm, thật 1:1)
import { Member, Project, Vec3 } from './model';
import { geometry } from './build';
import { memberFrame } from './section3d';

export interface DimSet {
  lines: [Vec3, Vec3][];
  labels: { p: Vec3; t: string }[];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => mul(a, 1 / (len(a) || 1));
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const fmt = (v: number) => Math.round(v).toLocaleString('en-US');

/** Một đường kích thước p1→p2, dời ra theo off (mm), có đường gióng và vạch xiên 45° */
function dim(out: DimSet, p1: Vec3, p2: Vec3, off: Vec3, text?: string, tick = 120) {
  const d = len(sub(p2, p1));
  if (d < 0.5) return;
  const q1 = addv(p1, off), q2 = addv(p2, off);
  out.lines.push([q1, q2]);
  const on = len(off);
  if (on > 1) {
    const u = unit(off);
    out.lines.push([addv(p1, mul(u, Math.min(on, 150) * 0.3)), addv(q1, mul(u, 100))]);
    out.lines.push([addv(p2, mul(u, Math.min(on, 150) * 0.3)), addv(q2, mul(u, 100))]);
  }
  const ax = unit(sub(p2, p1));
  const n = on > 1 ? unit(off) : Math.abs(ax[2]) > 0.9 ? ([1, 0, 0] as Vec3) : ([0, 0, 1] as Vec3);
  const tk = mul(unit(addv(ax, n)), tick / 2);
  for (const q of [q1, q2]) out.lines.push([sub(q, tk), addv(q, tk)]);
  out.labels.push({ p: addv(mul(addv(q1, q2), 0.5), mul(on > 1 ? unit(off) : n, 220)), t: text ?? fmt(d) });
}

/** Chuỗi kích thước nhịp trục X / Y và chiều cao tầng */
export function gridDims(p: Project): DimSet {
  const out: DimSet = { lines: [], labels: [] };
  const g = geometry(p);
  const xs = [...new Set([...g.xs.values()])].sort((a, b) => a - b);
  const ys = [...new Set([...g.ys.values()])].sort((a, b) => a - b);
  const lv = [...new Set(p.levels.map((l) => l.elevation))].sort((a, b) => a - b);
  const yd = g.y0 - 1200, xd = g.xN + 1500;
  for (let i = 0; i + 1 < xs.length; i++) dim(out, [xs[i], g.y0, 0], [xs[i + 1], g.y0, 0], [0, yd - g.y0, 0]);
  if (xs.length > 2) dim(out, [xs[0], g.y0, 0], [xs[xs.length - 1], g.y0, 0], [0, yd - g.y0 - 1000, 0]);
  for (let i = 0; i + 1 < ys.length; i++) dim(out, [g.xN, ys[i], 0], [g.xN, ys[i + 1], 0], [xd - g.xN, 0, 0]);
  if (ys.length > 2) dim(out, [g.xN, ys[0], 0], [g.xN, ys[ys.length - 1], 0], [xd - g.xN + 1100, 0, 0]);
  for (let i = 0; i + 1 < lv.length; i++) dim(out, [g.xN, g.y0, lv[i]], [g.xN, g.y0, lv[i + 1]], [1500, -1500, 0]);
  return out;
}

const DIM_KINDS = new Set(['column', 'beam', 'rafter', 'purlin', 'girt', 'brace']);

/**
 * Khoảng cách của cấu kiện đang chọn:
 *  – chiều dài (tâm–tâm hai đầu)
 *  – khoảng cách từ đầu cấu kiện tới trục gần nhất (X, Y) và tới cao độ tầng gần nhất
 *  – khoảng cách tới cấu kiện song song gần nhất ở mỗi bên (cùng loại)
 */
export function memberDims(p: Project, m: Member, all: Member[]): DimSet {
  const out: DimSet = { lines: [], labels: [] };
  const g = geometry(p);
  const ax = sub(m.b, m.a);
  const L = len(ax);
  if (L < 1) return out;
  const u = unit(ax);
  const vertical = Math.abs(u[2]) > 0.99;
  // pháp tuyến để dời đường kích thước: cột → theo X, còn lại → hướng lên (vuông góc trục)
  let n: Vec3 = vertical ? [1, 0, 0] : unit(cross(cross(u, [0, 0, 1]), u));
  if (len(n) < 0.5 || n[2] < 0) n = mul(n, -1);
  const off = Math.max(m.section.h, m.section.b) / 2 + 450;
  dim(out, m.a, m.b, mul(n, off), `L=${fmt(L)}`);

  // tới trục / tầng gần nhất
  const near = (vals: number[], v: number) => vals.reduce((best, x) => (Math.abs(x - v) < Math.abs(best - v) ? x : best), vals[0]);
  const xs = [...g.xs.values()], ys = [...g.ys.values()], zs = p.levels.map((l) => l.elevation);
  const seen = new Set<string>();
  const ends = vertical ? [m.a] : [m.a, m.b];
  for (const e of ends) {
    if (xs.length) {
      const gx = near(xs, e[0]);
      const k = `x${Math.round(gx)}:${Math.round(e[0])}:${Math.round(e[1] / 500)}`;
      if (Math.abs(e[0] - gx) > 0.5 && !seen.has(k)) {
        seen.add(k);
        dim(out, [gx, e[1], e[2]], e, [0, 0, 0]);
      }
    }
    if (ys.length) {
      const gy = near(ys, e[1]);
      const k = `y${Math.round(gy)}:${Math.round(e[1])}:${Math.round(e[0] / 500)}`;
      if (Math.abs(e[1] - gy) > 0.5 && !seen.has(k)) {
        seen.add(k);
        dim(out, [e[0], gy, e[2]], e, [0, 0, 0]);
      }
    }
    if (!vertical && zs.length) {
      const z = near(zs, e[2]);
      if (Math.abs(e[2] - z) > 0.5) dim(out, [e[0], e[1], z], e, mul(unit(cross(u, [0, 0, 1])), -400), `${e[2] > z ? '+' : '−'}${fmt(Math.abs(e[2] - z))}`);
    }
  }

  // cấu kiện song song gần nhất 2 bên
  if (!DIM_KINDS.has(m.kind)) return out;
  const mid = mul(addv(m.a, m.b), 0.5);
  const sides: Vec3[] = vertical ? [[1, 0, 0], [0, 1, 0]] : [unit(cross(u, n))];
  for (const sd of sides) {
    for (const sg of [1, -1]) {
      const dir = mul(sd, sg);
      let best: { d: number; q: Vec3 } | undefined;
      for (const o of all) {
        if (o.id === m.id || o.kind !== m.kind || o.part) continue;
        const ov = sub(o.b, o.a);
        const lo = len(ov);
        if (lo < 1 || Math.abs(dot(unit(ov), u)) < 0.999) continue;
        // điểm trên o ứng với mid (chiếu theo trục u), phải nằm trong đoạn o
        const t = dot(sub(mid, o.a), u) * Math.sign(dot(ov, u));
        if (t < -1 || t > lo + 1) continue;
        const q = addv(o.a, mul(unit(ov), t));
        const w = sub(q, mid);
        const along = dot(w, dir);
        if (along < 1) continue;
        // chỉ lấy cấu kiện nằm đúng hướng (lệch ngang nhỏ)
        const side = len(sub(w, mul(dir, along)));
        if (side > Math.max(300, 0.1 * along)) continue;
        if (!best || along < best.d) best = { d: along, q: addv(mid, mul(dir, along)) };
      }
      if (best && best.d < 15000) dim(out, mid, best.q, [0, 0, 0]);
    }
  }
  return out;
}

/**
 * Thước đo: khoảng cách vuông góc giữa bề mặt 2 部材 (mm).
 * Song song → theo phương vuông góc trục, đo tại giữa đoạn chồng nhau; không song song → theo đường vuông góc chung của 2 trục.
 * Trả về 2 điểm trên bề mặt và khoảng cách (âm = chồng / va chạm).
 */
export function surfaceGap(m1: Member, m2: Member): { a: Vec3; b: Vec3; d: number; axis: number } {
  const f1 = memberFrame(m1), f2 = memberFrame(m2);
  const half = (m: Member): [number, number] => {
    const s = m.section;
    if (s.type === 'Pipe' || s.type === 'Rod') return [s.h / 2, s.h / 2];
    return [s.b / 2, s.h / 2];
  };
  const ext = (f: ReturnType<typeof memberFrame>, hb: [number, number], n: Vec3) => hb[0] * Math.abs(dot(n, f.x as Vec3)) + hb[1] * Math.abs(dot(n, f.y as Vec3));
  const z1 = f1.z as Vec3, z2 = f2.z as Vec3;
  let q1: Vec3, q2: Vec3;
  if (Math.abs(dot(z1, z2)) > 0.999) {
    // đoạn chồng nhau theo trục 1
    const t2a = dot(sub(m2.a, m1.a), z1), t2b = dot(sub(m2.b, m1.a), z1);
    const lo = Math.max(0, Math.min(t2a, t2b)), hi = Math.min(f1.len, Math.max(t2a, t2b));
    const t = lo <= hi ? (lo + hi) / 2 : Math.max(0, Math.min(f1.len, (t2a + t2b) / 2));
    q1 = addv(m1.a, mul(z1, t));
    const s2 = dot(sub(q1, m2.a), z2);
    q2 = addv(m2.a, mul(z2, Math.max(0, Math.min(f2.len, s2))));
  } else {
    // đường vuông góc chung của 2 đoạn
    const d1 = sub(m1.b, m1.a), d2 = sub(m2.b, m2.a), r = sub(m1.a, m2.a);
    const a = dot(d1, d1), e = dot(d2, d2), b = dot(d1, d2), c = dot(d1, r), f = dot(d2, r);
    const den = a * e - b * b;
    let s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
    let t = (b * s + f) / e;
    if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    q1 = addv(m1.a, mul(d1, s));
    q2 = addv(m2.a, mul(d2, t));
  }
  const w = sub(q2, q1);
  const axis = len(w);
  const n = axis > 1e-6 ? unit(w) : unit(cross(z1, z2));
  const e1 = ext(f1, half(m1), n), e2 = ext(f2, half(m2), n);
  return { a: addv(q1, mul(n, e1)), b: sub(q2, mul(n, e2)), d: axis - e1 - e2, axis };
}
