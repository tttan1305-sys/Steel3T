// 作業平面: tạo mặt phẳng làm việc và chuyển đổi toạ độ 3D <-> 2D để vẽ 補助線
import { Member, PlateEnt, Project, Vec3, WorkPlane, WorkPlaneKind, WorkPlaneOpt } from './model';
import { geometry } from './build';
import { arcPoints, primsOf } from './plateCad';
import { cutMembers } from './section3d';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const planeNormal = (pl: Pick<WorkPlane, 'u' | 'v'>): V => nrm(cross(pl.u as V, pl.v as V));

const rotAxis = (x: V, k: V, deg: number): V => {
  // Rodrigues: xoay x quanh trục đơn vị k
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  return add(add(mul(x, c), mul(cross(k, x), s)), mul(k, dot(k, x) * (1 - c)));
};

/** khoá ổn định của cấu kiện (id cấu kiện đổi mỗi lần dựng lại 3D) */
export const memberKey = (m: Member) => (m.source ? `s:${m.source}:${m.piece ?? 0}:${m.kind}` : `k:${m.kind}:${m.a.map(Math.round).join(',')}:${m.b.map(Math.round).join(',')}`);

/** Mặt phẳng theo mô hình hiện tại: tính lại từ tầng / trục / cấu kiện gốc nên tự cập nhật khi 3D thay đổi */
export function livePlane<T extends WorkPlane>(p: Project, members: Member[], pl: T): T {
  // không tìm lại được cấu kiện gốc → vẫn giữ mặt phẳng cũ nhưng hệ trục theo hệ chính (trục / tầng nằm ngang – thẳng đứng)
  const b = planeBasis(p, members, pl.kind, pl.ref, pl.offset, pl.opt) ?? mainAxes(pl.o as V, planeNormal(pl) as V);
  return { ...pl, ...b, ents: reframeEnts(pl, b) };
}

/** Đổi toạ độ 補助線 từ hệ trục đã lưu (pl.o, u, v) sang hệ trục mới b (cùng mặt phẳng) */
export function reframeEnts(pl: Pick<WorkPlane, 'o' | 'u' | 'v' | 'ents'>, b: { o: Vec3; u: Vec3; v: Vec3 }): PlateEnt[] {
  const close = (a: Vec3, c: Vec3, tol: number) => Math.abs(a[0] - c[0]) < tol && Math.abs(a[1] - c[1]) < tol && Math.abs(a[2] - c[2]) < tol;
  if (!pl.ents?.length || (close(pl.u, b.u, 1e-9) && close(pl.v, b.v, 1e-9) && close(pl.o, b.o, 1e-6))) return pl.ents ?? [];
  const map = ([x, y]: [number, number]): [number, number] => {
    const P = add(add(pl.o as V, mul(pl.u as V, x)), mul(pl.v as V, y));
    const r = sub(P, b.o as V);
    return [Math.round(dot(r, b.u as V) * 1000) / 1000, Math.round(dot(r, b.v as V) * 1000) / 1000];
  };
  const U: [number, number] = [dot(pl.u as V, b.u as V), dot(pl.u as V, b.v as V)];
  const W: [number, number] = [dot(pl.v as V, b.u as V), dot(pl.v as V, b.v as V)];
  const det = U[0] * W[1] - U[1] * W[0];
  const ang = (a: number) => {
    const r = (a * Math.PI) / 180;
    return (Math.atan2(Math.cos(r) * U[1] + Math.sin(r) * W[1], Math.cos(r) * U[0] + Math.sin(r) * W[0]) * 180) / Math.PI;
  };
  return pl.ents.map((e) => {
    const out: PlateEnt = { ...e, pts: e.pts.map(map) };
    if (e.kind === 'arc' && e.a0 !== undefined && e.a1 !== undefined) {
      const a0 = ang(e.a0), a1 = ang(e.a1);
      [out.a0, out.a1] = det >= 0 ? [a0, a1] : [a1, a0];
    }
    return out;
  });
}

/** Tính gốc + 2 trục của mặt phẳng (kèm xoay quanh Z, nghiêng quanh u, rồi dời theo pháp tuyến) */
export function planeBasis(p: Project, members: Member[], kind: WorkPlaneKind, ref: string, offset: number, opt: WorkPlaneOpt = {}): { o: Vec3; u: Vec3; v: Vec3 } | null {
  const g = geometry(p);
  let o: V, u: V, v: V;
  if (kind === 'level') {
    const z = g.lv.get(ref);
    if (z === undefined) return null;
    [o, u, v] = [[g.x0, g.y0, z], [1, 0, 0], [0, 1, 0]];
  } else if (kind === 'gridX') {
    const x = g.xs.get(ref);
    if (x === undefined) return null;
    [o, u, v] = [[x, g.ys.get(opt.pivot ?? '') ?? g.y0, 0], [0, 1, 0], [0, 0, 1]];
  } else if (kind === 'gridY') {
    const y = g.ys.get(ref);
    if (y === undefined) return null;
    [o, u, v] = [[g.xs.get(opt.pivot ?? '') ?? g.x0, y, 0], [1, 0, 0], [0, 0, 1]];
  } else {
    const m = opt.mkey ? members.find((x) => memberKey(x) === opt.mkey) : members.find((x) => x.id === ref);
    if (!m) return null;
    const L = Math.hypot(...sub(m.b as V, m.a as V));
    const d = nrm(sub(m.b as V, m.a as V));
    const vert = Math.abs(d[2]) > 0.95;
    const dir = opt.dir ?? 'axis';
    const at = Math.max(0, Math.min(L, opt.at ?? (dir === 'axis' || dir === 'flat' ? 0 : L / 2)));
    o = add(m.a as V, mul(d, at));
    const Z: V = [0, 0, 1];
    if (dir === 'X') [u, v] = [[0, 1, 0], Z];
    else if (dir === 'Y') [u, v] = [[1, 0, 0], Z];
    else if (dir === 'perp') {
      if (vert) [u, v] = [[1, 0, 0], [0, 1, 0]];
      else {
        u = nrm(cross(Z, d));
        v = cross(d, u);
      }
    } else if (dir === 'flat') {
      if (vert) [u, v] = [d, [0, 1, 0]];
      else [u, v] = [d, nrm(cross(Z, d))];
    } else if (vert) [u, v] = [[1, 0, 0], Z];
    else [u, v] = [d, nrm(sub(Z, mul(d, dot(Z, d))))];
  }
  if (opt.rot) {
    u = rotAxis(u, [0, 0, 1], opt.rot);
    v = rotAxis(v, [0, 0, 1], opt.rot);
  }
  if (opt.tilt) v = rotAxis(v, nrm(u), opt.tilt);
  const n = nrm(cross(u, v));
  return mainAxes(add(o, mul(n, offset)), n);
}

/**
 * Hệ toạ độ 2D của mặt phẳng luôn theo hệ toạ độ chính của công trình (không xoay theo cấu kiện):
 * mặt nằm → u = X, v = Y; mặt đứng / nghiêng → u nằm ngang (chiều dương X, hoặc Y), v hướng lên;
 * gốc = hình chiếu gốc công trình (0,0,0) lên mặt phẳng.
 */
export function mainAxes(p0: V, n0: V): { o: Vec3; u: Vec3; v: Vec3 } {
  const n = nrm(n0);
  let u: V, v: V;
  if (Math.abs(n[2]) > 0.9999) [u, v] = [[1, 0, 0], [0, 1, 0]];
  else {
    u = nrm(cross([0, 0, 1], n));
    if (u[0] < -1e-9 || (Math.abs(u[0]) <= 1e-9 && u[1] < 0)) u = mul(u, -1);
    v = nrm(sub([0, 0, 1], mul(n, n[2])));
  }
  const nn = nrm(cross(u, v));
  return { o: mul(nn, dot(p0, nn)), u, v };
}

export const toUV = (pl: Pick<WorkPlane, 'o' | 'u' | 'v'>, X: Vec3): { uv: [number, number]; d: number } => {
  const r = sub(X as V, pl.o as V);
  return { uv: [dot(r, pl.u as V), dot(r, pl.v as V)], d: dot(r, planeNormal(pl)) };
};
export const fromUV = (pl: Pick<WorkPlane, 'o' | 'u' | 'v'>, [x, y]: [number, number]): Vec3 => add(add(pl.o as V, mul(pl.u as V, x)), mul(pl.v as V, y));

type UV = [number, number];
type Pl = Pick<WorkPlane, 'o' | 'u' | 'v'>;
export interface PlaneCut {
  seg: [UV, UV];
  label: string;
  /** điểm đặt nhãn */
  at: UV;
  kind: 'gridX' | 'gridY' | 'level';
  /** id trục / tầng */
  id?: string;
}

/** Khung mặt phẳng = hình chiếu hộp bao công trình (+ cấu kiện, + 補助線) lên mặt phẳng */
export function planeRect(p: Project, members: Member[], pl: Pl & { ents?: WorkPlane['ents'] }, ext = 1500): [number, number, number, number] {
  const g = geometry(p);
  const zs = [...p.levels.map((l) => l.elevation), g.eave, 0, ...members.flatMap((m) => [m.a[2], m.b[2]])];
  const xs = [g.x0 - ext, g.xN + ext], ys = [g.y0 - ext, g.yN + ext], zz = [Math.min(...zs) - ext, Math.max(...zs) + ext];
  const uv: UV[] = [];
  for (const x of xs) for (const y of ys) for (const z of zz) uv.push(toUV(pl, [x, y, z]).uv);
  for (const e of pl.ents ?? []) uv.push(...e.pts.map((q) => [q[0] - (e.r ?? 0), q[1] - (e.r ?? 0)] as UV), ...e.pts.map((q) => [q[0] + (e.r ?? 0), q[1] + (e.r ?? 0)] as UV));
  const us = uv.map((q) => q[0]), vs = uv.map((q) => q[1]);
  return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
}

/** đường a·s + b·t = k cắt hình chữ nhật → đoạn */
export function clipLine(a: number, b: number, k: number, [u0, u1, v0, v1]: number[]): [UV, UV] | null {
  const pts: UV[] = [];
  if (Math.abs(b) > 1e-9) for (const s of [u0, u1]) { const t = (k - a * s) / b; if (t >= v0 - 1e-6 && t <= v1 + 1e-6) pts.push([s, t]); }
  if (Math.abs(a) > 1e-9) for (const t of [v0, v1]) { const s = (k - b * t) / a; if (s >= u0 - 1e-6 && s <= u1 + 1e-6) pts.push([s, t]); }
  if (pts.length < 2) return null;
  let best: [UV, UV] = [pts[0], pts[1]], bl = -1;
  for (const P of pts) for (const Q of pts) { const l = Math.hypot(P[0] - Q[0], P[1] - Q[1]); if (l > bl) [bl, best] = [l, [P, Q]]; }
  return bl > 1 ? best : null;
}

/** Giao tuyến của mặt phẳng với mặt các trục (通り芯) và các tầng, cắt theo khung */
export function planeCuts(p: Project, members: Member[], pl: Pl, rect = planeRect(p, members, pl)): PlaneCut[] {
  const g = geometry(p);
  const src: { n: V; c: number; label: string; kind: PlaneCut['kind']; id: string }[] = [
    ...p.gridsX.map((x) => ({ n: [1, 0, 0] as V, c: g.xs.get(x.id) ?? 0, label: x.name, kind: 'gridX' as const, id: x.id })),
    ...p.gridsY.map((y) => ({ n: [0, 1, 0] as V, c: g.ys.get(y.id) ?? 0, label: y.name, kind: 'gridY' as const, id: y.id })),
    ...p.levels.map((l) => ({ n: [0, 0, 1] as V, c: l.elevation, label: `▽${l.name}`, kind: 'level' as const, id: l.id })),
  ];
  const out: PlaneCut[] = [];
  for (const s of src) {
    const a = dot(s.n, pl.u as V), b = dot(s.n, pl.v as V);
    if (Math.hypot(a, b) < 1e-6) continue; // song song (hoặc trùng) với mặt phẳng
    const seg = clipLine(a, b, s.c - dot(s.n, pl.o as V), rect);
    if (!seg) continue;
    const [P, Q] = seg;
    const steep = Math.abs(Q[1] - P[1]) > Math.abs(Q[0] - P[0]);
    const [A, B] = steep ? (P[1] < Q[1] ? [P, Q] : [Q, P]) : P[0] < Q[0] ? [P, Q] : [Q, P];
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, k = 450 / L;
    // nhãn đặt ngoài đầu đoạn một chút
    const same = out.find((c) => Math.hypot(c.seg[0][0] - A[0], c.seg[0][1] - A[1]) < 1 && Math.hypot(c.seg[1][0] - B[0], c.seg[1][1] - B[1]) < 1);
    if (same) same.label += `·${s.label}`; // trục trùng nhau (vd. giao 2/A khi mặt phẳng xoay quanh giao điểm)
    else out.push({ seg: [A, B], label: s.label, at: [A[0] - (B[0] - A[0]) * k, A[1] - (B[1] - A[1]) * k], kind: s.kind, id: s.id });
  }
  return out;
}

export type BgStyle = 'grid' | 'edge' | 'hid' | 'axis' | 'wp';
export interface PlaneBg {
  /** đoạn nền (bắt điểm được) */
  segs: [UV, UV][];
  style: BgStyle[];
  /** mặt cắt cấu kiện (tô) */
  fills: UV[][][];
  texts: { p: UV; t: string; c?: string }[];
}

/** Giao tuyến của mặt phẳng khác với mặt phẳng này (trong khung rect) */
export function planeTrace(pl: Pl, other: Pl, rect: number[]): [UV, UV] | null {
  const n = planeNormal(other);
  const a = dot(n, pl.u as V), b = dot(n, pl.v as V);
  if (Math.hypot(a, b) < 1e-6) return null;
  return clipLine(a, b, dot(n, other.o as V) - dot(n, pl.o as V), rect);
}

/**
 * Nền khi vẽ trên 作業平面 – cắt ra từ tổng thể 3D:
 * giao tuyến trục / tầng, mặt cắt thật của cấu kiện xuyên qua, hình chiếu cấu kiện nằm trên mặt phẳng, và giao tuyến các 作業平面 khác.
 */
function hull2(pts: UV[]): UV[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: UV, a: UV, b: UV) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: UV[] = [], up: UV[] = [];
  for (const x of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], x) <= 1e-9) lo.pop(); lo.push(x); }
  for (const x of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], x) <= 1e-9) up.pop(); up.push(x); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
export function planeBackground(p: Project, members: Member[], pl: Pl & { id?: string }, planes: WorkPlane[] = []): PlaneBg {
  const rect = planeRect(p, members, pl);
  const bg: PlaneBg = { segs: [], style: [], fills: [], texts: [] };
  const put = (s: [UV, UV], st: BgStyle) => {
    if (Math.hypot(s[0][0] - s[1][0], s[0][1] - s[1][1]) > 0.5) {
      bg.segs.push(s);
      bg.style.push(st);
    }
  };
  for (const c of planeCuts(p, members, pl, rect)) {
    put(c.seg, 'grid');
    bg.texts.push({ p: c.at, t: c.label });
  }
  for (const c of cutMembers(members, pl)) {
    if (c.mode === 'cut') bg.fills.push(c.polys);
    c.edges.forEach((e) => put(e, 'edge'));
    c.hidden.forEach((e) => put(e, 'hid'));
    if (c.axis) put(c.axis, 'axis');
  }
  // tấm ダイアフラム (bắt điểm góc / cạnh)
  for (const m of members) {
    if (m.kind !== 'column' || !m.dia?.length || Math.abs(toUV(pl, m.a as Vec3).d) > 1500) continue;
    const r = ((m.rotation ?? 0) * Math.PI) / 180, bx = [Math.cos(r), Math.sin(r)], by = [-Math.sin(r), Math.cos(r)];
    for (const d of m.dia) {
      if (d.round) continue;
      const cx = m.a[0] + bx[0] * (d.off ?? 0), cy = m.a[1] + bx[1] * (d.off ?? 0);
      const q: UV[] = [];
      for (const i of [1, -1]) for (const j of [1, -1]) for (const z of [d.z - d.t / 2, d.z + d.t / 2]) q.push(toUV(pl, [cx + (bx[0] * d.w * i + by[0] * d.d * j) / 2, cy + (bx[1] * d.w * i + by[1] * d.d * j) / 2, z]).uv);
      const h = hull2(q);
      h.forEach((a, i) => put([a, h[(i + 1) % h.length]], d.kind === 'inner' ? 'hid' : 'edge'));
    }
  }
  for (const o of planes) {
    if (o.id === pl.id || o.hidden) continue;
    const t = planeTrace(pl, o, rect);
    if (!t) continue;
    put(t, 'wp');
    bg.texts.push({ p: t[0], t: o.name.split(' ')[0], c: '#0ea5e9' });
  }
  return bg;
}

/** Kích thước (dim) đã ghi trên các 作業平面: 2 đầu (3D) + giá trị */
export function auxDims3D(planes: WorkPlane[]): { a: Vec3; b: Vec3; t: string }[] {
  const out: { a: Vec3; b: Vec3; t: string }[] = [];
  for (const pl of planes) {
    if (pl.hidden) continue;
    for (const e of pl.ents) if (e.kind === 'dim' && e.pts.length >= 2) {
      const [a, b] = e.pts;
      out.push({ a: fromUV(pl, a), b: fromUV(pl, b), t: String(Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * 10) / 10) });
    }
  }
  return out;
}

/** Dữ liệu hiển thị 3D của một mặt phẳng: khung, giao tuyến trục / tầng, nhãn */
export interface PlaneViz {
  corners: Vec3[];
  cuts: [Vec3, Vec3][];
  labels: { p: Vec3; t: string }[];
  draft?: boolean;
}
export function planeViz(p: Project, members: Member[], pl: Pl & { ents?: WorkPlane['ents'] }, draft = false): PlaneViz {
  const r = planeRect(p, members, pl);
  const [u0, u1, v0, v1] = r;
  const cuts = planeCuts(p, members, pl, r);
  return {
    corners: ([[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as UV[]).map((q) => fromUV(pl, q)),
    cuts: cuts.map((c) => [fromUV(pl, c.seg[0]), fromUV(pl, c.seg[1])]),
    labels: cuts.map((c) => ({ p: fromUV(pl, c.at), t: c.label })),
    draft,
  };
}

/** 補助線 dạng đoạn 3D có khoá (bấm chọn được): cung / tròn chia nhỏ */
export interface AuxLine { key: string; label: string; a: Vec3; b: Vec3; arc: boolean }
export function auxLines3D(planes: WorkPlane[]): AuxLine[] {
  const out: AuxLine[] = [];
  for (const pl of planes) {
    if (pl.hidden) continue;
    const wp = pl.name.split(' ')[0];
    primsOf(pl.ents).forEach((pr, j) => {
      const pts = pr.k === 'seg' ? [pr.a, pr.b] : arcPoints(pr.c, pr.r, pr.a0, pr.full ? pr.a0 + 359.999 : pr.a1);
      for (let i = 0; i + 1 < pts.length; i++) out.push({ key: `${pl.id}:${pr.ent.id}:${pr.i}:${i}`, label: `${wp} · 補助線 ${j + 1}`, a: fromUV(pl, pts[i]), b: fromUV(pl, pts[i + 1]), arc: pr.k !== 'seg' });
    });
  }
  return out;
}

/** 補助線 của các mặt phẳng → đoạn 3D để hiển thị */
export function auxSegments3D(planes: WorkPlane[]): [Vec3, Vec3][] {
  const out: [Vec3, Vec3][] = [];
  for (const pl of planes) {
    if (pl.hidden) continue;
    for (const pr of primsOf(pl.ents.filter((e) => e.kind !== 'dim'))) {
      const pts = pr.k === 'seg' ? [pr.a, pr.b] : arcPoints(pr.c, pr.r, pr.a0, pr.full ? pr.a0 + 359.999 : pr.a1);
      for (let i = 0; i + 1 < pts.length; i++) out.push([fromUV(pl, pts[i]), fromUV(pl, pts[i + 1])]);
    }
  }
  return out;
}
