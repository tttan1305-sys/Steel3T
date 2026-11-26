// Cắt tổng thể 3D bằng một mặt phẳng: mặt cắt thật của cấu kiện xuyên qua + hình chiếu cấu kiện nằm trên / sát mặt phẳng
import type { Member, MemberKind, Section, Vec3 } from './model';

type V = [number, number, number];
type UV = [number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Biên dạng tiết diện (mm) giống hình 3D: vòng ngoài + lỗ */
/** JIS G 3192 H形鋼: bán kính góc lượn r (mm) theo H×B danh nghĩa */
const H_ROOT_R: Record<string, number> = {
  '100x50': 8, '125x60': 8, '150x75': 8, '175x90': 9, '198x99': 11, '200x100': 11, '248x124': 12, '250x125': 12, '298x149': 13, '300x150': 13,
  '346x174': 14, '350x175': 14, '396x199': 16, '400x200': 16, '446x199': 18, '450x200': 18, '496x199': 20, '500x200': 20, '596x199': 22, '600x200': 22,
  '100x100': 8, '125x125': 8, '150x150': 8, '175x175': 13, '200x200': 13, '250x250': 16, '300x300': 18, '350x350': 20, '400x400': 22,
  '148x100': 11, '194x150': 13, '244x175': 16, '294x200': 18, '340x250': 20, '390x300': 22, '440x300': 24, '488x300': 26, '588x300': 28, '692x300': 28, '700x300': 28,
};
/** r góc lượn bụng–cánh của H (0 = H hàn BH) */
export function hRootR(s: Section): number {
  if (s.type !== 'I' || /^BH/i.test(s.code)) return 0;
  return H_ROOT_R[`${Math.round(s.h)}x${Math.round(s.b)}`] ?? Math.max(8, Math.round(s.tf * 1.3));
}
/** 角形鋼管: bán kính góc ngoài (BCR/BCP ≈ 3.5t, STKR ≈ 2.5t) */
export function boxCornerR(s: Section): number {
  if (s.type !== 'Box') return 0;
  const t = Math.max(s.tw, 1);
  return /STKR/i.test(s.material) ? 2.5 * t : /BCR|BCP/i.test(s.material) ? 3.5 * t : 2.5 * t;
}
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 6): UV[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as UV;
  });
export const roundRect = (w: number, h: number, R: number): UV[] => {
  const r = Math.max(0, Math.min(R, w / 2 - 0.1, h / 2 - 0.1));
  if (r < 0.5) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  return [...arc(w / 2 - r, -h / 2 + r, r, -90, 0), ...arc(w / 2 - r, h / 2 - r, r, 0, 90), ...arc(-w / 2 + r, h / 2 - r, r, 90, 180), ...arc(-w / 2 + r, -h / 2 + r, r, 180, 270)];
};

/** Mặt cắt chuẩn (mm): H có góc lượn r theo JIS, 角形鋼管 bo góc. Vòng đầu = biên ngoài, các vòng sau = lỗ */
export function profileLoops(s: Section): UV[][] {
  const { h, b, c } = s;
  const tw = Math.max(s.tw, 1), tf = Math.max(s.tf, 1), t = tw;
  switch (s.type) {
    case 'I': {
      const r = Math.min(hRootR(s), (b - tw) / 2 - 0.5, h / 2 - tf - 0.5);
      if (r > 0.5)
        return [[
          [-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf],
          ...arc(tw / 2 + r, -h / 2 + tf + r, r, 270, 180),
          ...arc(tw / 2 + r, h / 2 - tf - r, r, 180, 90),
          [b / 2, h / 2 - tf], [b / 2, h / 2], [-b / 2, h / 2], [-b / 2, h / 2 - tf],
          ...arc(-tw / 2 - r, h / 2 - tf - r, r, 90, 0),
          ...arc(-tw / 2 - r, -h / 2 + tf + r, r, 0, -90),
          [-b / 2, -h / 2 + tf],
        ]];
      return [[[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf], [tw / 2, h / 2 - tf], [b / 2, h / 2 - tf], [b / 2, h / 2], [-b / 2, h / 2], [-b / 2, h / 2 - tf], [-tw / 2, h / 2 - tf], [-tw / 2, -h / 2 + tf], [-b / 2, -h / 2 + tf]]];
    }
    case 'C':
      return [[[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + c], [b / 2 - t, -h / 2 + c], [b / 2 - t, -h / 2 + t], [-b / 2 + t, -h / 2 + t], [-b / 2 + t, h / 2 - t], [b / 2 - t, h / 2 - t], [b / 2 - t, h / 2 - c], [b / 2, h / 2 - c], [b / 2, h / 2], [-b / 2, h / 2]]];
    case 'Z':
      return [[[-t / 2, -h / 2], [b - t / 2, -h / 2], [b - t / 2, -h / 2 + c], [b - 1.5 * t, -h / 2 + c], [b - 1.5 * t, -h / 2 + t], [t / 2, -h / 2 + t], [t / 2, h / 2], [-b + t / 2, h / 2], [-b + t / 2, h / 2 - c], [-b + 1.5 * t, h / 2 - c], [-b + 1.5 * t, h / 2 - t], [-t / 2, h / 2 - t]]];
    case 'Box': {
      const R = boxCornerR(s);
      return [roundRect(b, h, R), roundRect(b - 2 * tw, h - 2 * tw, Math.max(0, R - tw))];
    }
    case 'Pipe':
    case 'Rod': {
      const n = 24, ring = (r: number) => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as UV);
      return s.type === 'Pipe' && h / 2 - tw > 1 ? [ring(h / 2), ring(h / 2 - tw)] : [ring(h / 2)];
    }
    case 'L':
      if (b <= tw + 0.01) return [([[0, 0], [b, 0], [b, h], [0, h]] as UV[]).map(([x, y]) => [x - b / 4, y - h / 4] as UV)];
      return [([[0, 0], [b, 0], [b, tw], [tw, tw], [tw, h], [0, h]] as UV[]).map(([x, y]) => [x - b / 4, y - h / 4] as UV)];
  }
  return [[[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]]];
}

/** Hệ trục địa phương của cấu kiện – giống memberMatrix trong Viewer3D */
export function memberFrame(m: Member): { a: V; x: V; y: V; z: V; len: number } {
  const a = m.a as V, d = sub(m.b as V, a);
  const len = Math.hypot(...d);
  const z = nrm(d);
  let y: V = m.up ? [...m.up] as V : Math.abs(z[2]) > 0.99 ? [0, 1, 0] : [0, 0, 1];
  y = sub(y, mul(z, dot(y, z)));
  if (Math.hypot(...y) < 1e-4) y = Math.abs(z[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  y = nrm(y);
  return { a, x: nrm(cross(y, z)), y, z, len };
}

function hull(pts: UV[]): UV[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: UV, a: UV, b: UV) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: UV[] = [], up: UV[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

export interface CutShape {
  id: string;
  kind: MemberKind;
  mark: string;
  member: Member;
  /** 'cut' = mặt cắt (tô), 'proj' = hình chiếu cấu kiện nằm trên / sát mặt phẳng */
  mode: 'cut' | 'proj';
  /** vòng kín của mặt cắt (vòng đầu = ngoài) */
  polys: UV[][];
  /** cạnh nhìn thấy */
  edges: [UV, UV][];
  /** cạnh khuất / bên trong (nét đứt) */
  hidden: [UV, UV][];
  /** đường tâm */
  axis?: [UV, UV];
  /** điểm đặt nhãn */
  at: UV;
}

type Pl = { o: Vec3; u: Vec3; v: Vec3 };

/**
 * Cắt danh sách cấu kiện bằng mặt phẳng.
 * near: cấu kiện có thân nằm trong khoảng ±near (mm) quanh mặt phẳng và gần song song → vẽ hình chiếu.
 */
export function cutMembers(members: Member[], pl: Pl, near = 150, projOnly = false, endNear = 0): CutShape[] {
  const n = nrm(cross(pl.u as V, pl.v as V));
  const o = pl.o as V, u = pl.u as V, v = pl.v as V;
  const uvOf = (X: V): UV => {
    const r = sub(X, o);
    return [dot(r, u), dot(r, v)];
  };
  const dOf = (X: V) => dot(sub(X, o), n);
  const out: CutShape[] = [];
  for (const m of members) {
    const f = memberFrame(m);
    if (f.len < 1) continue;
    const loops = profileLoops(m.section);
    const P = (q: UV, t: number): V => add(add(add(f.a, mul(f.x, q[0])), mul(f.y, q[1])), mul(f.z, t));
    const allPts = loops.flat();
    const d0 = allPts.map((q) => dOf(P(q, 0))), dz = dot(f.z, n) * f.len;
    const dMin = Math.min(...d0, ...d0.map((d) => d + dz)), dMax = Math.max(...d0, ...d0.map((d) => d + dz));
    if (dMin > near || dMax < -near) continue; // không chạm mặt phẳng
    const base = { id: m.id, kind: m.kind, mark: m.mark, member: m };
    const sinA = Math.abs(dot(f.z, n));
    const dA = dOf(f.a), dB = dA + dz;
    // endNear > 0: dầm vuông góc dừng sát mặt phẳng (小梁 tới bụng 大梁 tại trục) → vẫn vẽ mặt cắt tại đầu gần
    if (!projOnly && sinA > 0.2 && (dA * dB <= 0 || (endNear > 0 && m.kind === 'beam' && Math.min(Math.abs(dA), Math.abs(dB)) <= endNear))) {
      // trục xuyên qua mặt phẳng → mặt cắt: mỗi đỉnh biên dạng chạy dọc trục tới mặt phẳng
      const polys = loops.map((lp) =>
        lp.map((q) => {
          const p0 = P(q, 0), d = dOf(p0);
          const t = Math.max(0, Math.min(f.len, -d / dot(f.z, n)));
          return uvOf(P(q, t));
        }),
      );
      const edges: [UV, UV][] = polys.flatMap((pg) => pg.map((a, i) => [a, pg[(i + 1) % pg.length]] as [UV, UV]));
      const c = polys[0].reduce((s, q) => [s[0] + q[0] / polys[0].length, s[1] + q[1] / polys[0].length] as UV, [0, 0] as UV);
      out.push({ ...base, mode: 'cut', polys, edges, hidden: [], at: c });
    } else if (projOnly || sinA <= 0.2) {
      // gần song song → hình chiếu: nét ngoài + nét chiều dày (khuất = nét đứt), không vẽ nét góc bo
      const A = uvOf(f.a), B = uvOf(m.b as V);
      const side = m.kind === 'beam' && m.section.type === 'I' && Math.abs(dot(f.x, n)) > 0.95 ? bracketSide(m) : null;
      if (side) {
        const e2 = (l: [V, V][]) => l.map(([p, q]) => [uvOf(p), uvOf(q)] as [UV, UV]);
        out.push({ ...base, mode: 'proj', polys: [side.outline.map(uvOf)], edges: e2(side.edges), hidden: e2(side.hidden), axis: [A, B], at: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2] });
        continue;
      }
      const { edges, hidden } = projLines(m, f, [dot(n, f.x), dot(n, f.y)], uvOf);
      out.push({ ...base, mode: 'proj', polys: [], edges, hidden, axis: [A, B], at: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2] });
    }
  }
  return out;
}

/** Biên dạng góc vuông (bỏ góc lượn / bo) dùng cho nét hình chiếu */
export function sharpLoops(s: Section): UV[][] {
  if (s.type === 'I') return profileLoops({ ...s, code: 'BH' });
  if (s.type === 'Box') return [roundRect(s.b, s.h, 0), roundRect(s.b - 2 * Math.max(s.tw, 1), s.h - 2 * Math.max(s.tw, 1), 0)];
  return profileLoops(s);
}

const segHit = (o: UV, d: UV, a: UV, b: UV) => {
  // tia o + t·d (t > 0) cắt đoạn a-b?
  const e: UV = [b[0] - a[0], b[1] - a[1]];
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-9) return false;
  const w: UV = [a[0] - o[0], a[1] - o[1]];
  const t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
  return t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9;
};

/** Hình chiếu cấu kiện song song mặt phẳng: mỗi đỉnh biên dạng → 1 nét dọc; thấy nếu tia về phía người nhìn không đi qua vật liệu */
function projLines(m: Member, f: ReturnType<typeof memberFrame>, nl: UV, uvOf: (X: V) => UV): { edges: [UV, UV][]; hidden: [UV, UV][] } {
  const P = (q: UV, t: number): V => add(add(add(f.a, mul(f.x, q[0])), mul(f.y, q[1])), mul(f.z, t));
  const L = Math.hypot(nl[0], nl[1]) || 1;
  const d: UV = [nl[0] / L, nl[1] / L];
  const edges: [UV, UV][] = [], hidden: [UV, UV][] = [];
  const s = m.section;
  const ends = (q: UV): [number, number] => [0, f.len];
  const same = (a: [UV, UV], b: [UV, UV]) => Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]) < 0.5 && Math.hypot(a[1][0] - b[1][0], a[1][1] - b[1][1]) < 0.5;
  const pushL = (l: [UV, UV], vis: boolean) => {
    if (edges.some((e) => same(e, l))) return;
    if (vis) {
      for (let i = hidden.length - 1; i >= 0; i--) if (same(hidden[i], l)) hidden.splice(i, 1);
      edges.push(l);
    } else if (!hidden.some((e) => same(e, l))) hidden.push(l);
  };
  if (s.type === 'Pipe' || s.type === 'Rod') {
    // ống tròn: 2 nét bao ngoài + 2 nét thành trong (khuất)
    const pr: UV = [-d[1], d[0]];
    const rs = s.type === 'Pipe' && s.h / 2 - s.tw > 1 ? [[s.h / 2, 1], [s.h / 2 - s.tw, 0]] : [[s.h / 2, 1]];
    for (const [r, vis] of rs) for (const sg of [1, -1]) {
      const q: UV = [pr[0] * r * sg, pr[1] * r * sg];
      pushL([uvOf(P(q, 0)), uvOf(P(q, f.len))], !!vis);
    }
  } else {
    const loops = sharpLoops(s);
    const segs = loops.flatMap((lp) => lp.map((a, i) => [a, lp[(i + 1) % lp.length]] as [UV, UV]));
    for (const lp of loops)
      for (const q of lp) {
        const o: UV = [q[0] + d[0] * 1e-3, q[1] + d[1] * 1e-3];
        const blocked = segs.some(([a, b]) => !(Math.hypot(a[0] - q[0], a[1] - q[1]) < 1e-6 || Math.hypot(b[0] - q[0], b[1] - q[1]) < 1e-6) && segHit(o, d, a, b));
        const [t0, t1] = ends(q);
        pushL([uvOf(P(q, t0)), uvOf(P(q, t1))], !blocked);
      }
  }
  // 2 mặt đầu: bao hình chiếu biên dạng
  const all = sharpLoops(s).flat();
  for (const t of [0, f.len]) {
    const pg = hull(all.map((q) => uvOf(P(q, t))));
    pg.forEach((a, i) => edges.push([a, pg[(i + 1) % pg.length]]));
  }
  return { edges, hidden };
}

/**
 * Dầm H nhìn ngang (thấy mặt bụng): nét mép ngoài, nét chiều dày FLG; đầu dầm dốc cắt đứng theo mặt cột;
 * ブラケット: cánh dừng ở mép 通しダイアフラム, bụng chạy tới mặt cột, cắt khớp mặt dưới / trên ダイアフラム.
 */
function bracketSide(m: Member): { edges: [V, V][]; hidden: [V, V][]; outline: V[] } | null {
  const a = m.a as V, b = m.b as V;
  const Lh = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (Lh < 1) return null;
  const uh: V = [(b[0] - a[0]) / Lh, (b[1] - a[1]) / Lh, 0];
  const k = (b[2] - a[2]) / Lh, c = 1 / Math.sqrt(1 + k * k), sn = k * c;
  const { h, tf } = m.section;
  const W = (s0: number, z: number): V => [a[0] + uh[0] * s0, a[1] + uh[1] * s0, z];
  const ax = (s0: number) => a[2] + k * s0;
  const zAt = (s0: number, y: number) => ax(s0) + y / c; // y: khoảng vuông góc trục (mm)
  const pl = m.plumb ?? [false, false], fs = m.flgSet ?? [0, 0], ds = m.dSurf ?? [undefined, undefined];
  const ys = [h / 2, h / 2 - tf, -(h / 2 - tf), -h / 2];
  const isF = (y: number) => true; // cả 4 nét đều thuộc cánh
  // điểm đầu của nét y ở đầu a (e = 0) / b (e = 1)
  const endPt = (e: 0 | 1, y: number): V => {
    const sg = e === 0 ? 1 : -1, s00 = e === 0 ? 0 : Lh;
    if (pl[e]) return W(s00 + sg * (isF(y) ? fs[e] : 0), zAt(s00 + sg * (isF(y) ? fs[e] : 0), y));
    // đầu vuông góc trục
    const s1 = s00 - y * sn + sg * fs[e] * c;
    return W(s1, ax(s00) + y * c + sg * fs[e] * sn);
  };
  const edges: [V, V][] = [];
  for (const y of ys) edges.push([endPt(0, y), endPt(1, y)]);
  const chains: V[][] = [];
  for (const e of [0, 1] as const) {
    const sg = e === 0 ? 1 : -1, s00 = e === 0 ? 0 : Lh;
    const top = [endPt(e, h / 2), endPt(e, h / 2 - tf)], bot = [endPt(e, -(h / 2 - tf)), endPt(e, -h / 2)];
    let ch: V[];
    const d = ds[e];
    const sF = s00 + sg * fs[e];
    if (!fs[e]) ch = [top[0], bot[1]];
    else if (d && pl[e]) {
      // mép cánh (đứng) xuống tới mặt dưới ダイアフラム trên → ngang vào mặt cột → xuống theo mặt cột → ra mép ダイアフラム dưới → xuống cánh dưới
      const zUb = Math.min(d[1], top[1][2]), zLt = Math.max(d[0], bot[0][2]);
      const r = m.scal && m.scal > 0 ? Math.min(m.scal, (zUb - zLt) / 3) : 0;
      // スカラップ: khoét 1/4 tròn r ở 2 góc bụng tại mặt cột (sát ダイアフラム)
      const arcT: V[] = r ? Array.from({ length: 7 }, (_, i) => { const t = (i / 6) * (Math.PI / 2); return W(s00 + sg * r * Math.cos(t), zUb - r * Math.sin(t)); }) : [W(s00, zUb)];
      const arcB: V[] = r ? Array.from({ length: 7 }, (_, i) => { const t = (i / 6) * (Math.PI / 2); return W(s00 + sg * r * Math.sin(t), zLt + r * Math.cos(t)); }) : [W(s00, zLt)];
      ch = [top[0], W(sF, zUb), ...arcT, ...arcB, W(sF, zLt), bot[1]];
    } else {
      // cánh dừng ở mép ダイアフラム, bụng chạy tới mặt cột
      const wT = pl[e] ? W(s00, zAt(s00, h / 2 - tf)) : W(s00 - (h / 2 - tf) * sn, ax(s00) + (h / 2 - tf) * c);
      const wB = pl[e] ? W(s00, zAt(s00, -(h / 2 - tf))) : W(s00 + (h / 2 - tf) * sn, ax(s00) - (h / 2 - tf) * c);
      const r = m.scal && m.scal > 0 ? Math.min(m.scal, (wT[2] - wB[2]) / 3) : 0;
      const arcT: V[] = r ? Array.from({ length: 7 }, (_, i) => { const t = (i / 6) * (Math.PI / 2); return [wT[0] + uh[0] * sg * r * Math.cos(t), wT[1] + uh[1] * sg * r * Math.cos(t), wT[2] - r * Math.sin(t)] as V; }) : [wT];
      const arcB: V[] = r ? Array.from({ length: 7 }, (_, i) => { const t = (i / 6) * (Math.PI / 2); return [wB[0] + uh[0] * sg * r * Math.sin(t), wB[1] + uh[1] * sg * r * Math.sin(t), wB[2] + r * Math.cos(t)] as V; }) : [wB];
      ch = [top[0], top[1], ...arcT, ...arcB, bot[0], bot[1]];
    }
    ch.forEach((p, i) => i && edges.push([ch[i - 1], p]));
    chains.push(ch);
  }
  return { edges, hidden: [], outline: [...chains[0], ...[...chains[1]].reverse()] };
}

// ================= Kiểm tra va chạm =================
/** Hộp bao định hướng (OBB) của thân cấu kiện, bỏ bớt 2 đầu (chỗ liên kết) */
export interface OBB { c: V; ax: [V, V, V]; e: [number, number, number] }
export function memberOBB(m: Member, trimEnd = 0, shrink = 2): OBB | null {
  const f = memberFrame(m);
  const pts = profileLoops(m.section).flat();
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const half = f.len / 2 - trimEnd;
  if (half <= 1) return null;
  const c = add(add(add(f.a, mul(f.z, f.len / 2)), mul(f.x, (x0 + x1) / 2)), mul(f.y, (y0 + y1) / 2));
  return { c, ax: [f.x, f.y, f.z], e: [Math.max((x1 - x0) / 2 - shrink, 0.5), Math.max((y1 - y0) / 2 - shrink, 0.5), half] };
}
/** Định lý trục tách (SAT) cho 2 OBB */
export function obbHit(A: OBB, B: OBB): boolean {
  const T = sub(B.c, A.c);
  const axes: V[] = [...A.ax, ...B.ax];
  for (const a of A.ax) for (const b of B.ax) {
    const c = cross(a, b);
    if (Math.hypot(...c) > 1e-6) axes.push(nrm(c));
  }
  for (const L of axes) {
    const ra = A.ax.reduce((s, a, i) => s + A.e[i] * Math.abs(dot(a, L)), 0);
    const rb = B.ax.reduce((s, b, i) => s + B.e[i] * Math.abs(dot(b, L)), 0);
    if (Math.abs(dot(T, L)) > ra + rb) return false;
  }
  return true;
}
/** trung điểm của đoạn ngắn nhất nối 2 trục cấu kiện (vị trí va chạm) */
export function closestMid(m: Member, k: Member): V {
  const p = m.a as V, q = k.a as V, d1 = sub(m.b as V, p), d2 = sub(k.b as V, q), r = sub(p, q);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r), c = dot(d1, r), b = dot(d1, d2);
  const den = a * e - b * b;
  let s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0.5;
  let t = (b * s + f) / (e || 1);
  if (t < 0 || t > 1) {
    t = Math.max(0, Math.min(1, t));
    s = Math.max(0, Math.min(1, (b * t - c) / (a || 1)));
  }
  return mul(add(add(p, mul(d1, s)), add(q, mul(d2, t))), 0.5);
}
export interface Clash { a: Member; b: Member; at: Vec3 }
const MAIN: MemberKind[] = ['column', 'beam', 'rafter', 'brace'];
/**
 * Va chạm giữa cấu kiện trong `fresh` và các cấu kiện khác.
 * Bỏ 2 đầu mỗi cấu kiện (vùng liên kết với cột / dầm) và bỏ cặp giằng – giằng (giằng chéo chữ X).
 */
export function findClashes(fresh: Member[], all: Member[]): Clash[] {
  const ends = (m: Member) => Math.max(m.section.h, m.section.b) * 0.5 + 250;
  const box = new Map<string, OBB | null>();
  // dung sai tiếp xúc: chạm nhẹ (vd. giằng mái nằm sát dưới 母屋) không tính là va chạm
  const ob = (m: Member, tol: number) => {
    const k = m.id + '@' + tol;
    if (!box.has(k)) box.set(k, memberOBB(m, ends(m), tol));
    return box.get(k)!;
  };
  const sec = (m: Member) => m.kind === 'purlin' || m.kind === 'girt';
  const freshIds = new Set(fresh.map((m) => m.id));
  const out: Clash[] = [];
  const seen = new Set<string>();
  for (const a of fresh) {
    if (!MAIN.includes(a.kind) && a.kind !== 'purlin' && a.kind !== 'girt') continue;
    if (!ob(a, 2)) continue;
    for (const b of all) {
      if (b.id === a.id || (b.source && b.source === a.source)) continue;
      if (a.kind === 'brace' && b.kind === 'brace') continue;
      if ((a.kind === 'purlin' || a.kind === 'girt') && (b.kind === 'purlin' || b.kind === 'girt')) continue;
      const k = [a.id, b.id].sort().join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      const tol = sec(a) || sec(b) ? 12 : 2;
      const A = ob(a, tol), B = ob(b, tol);
      if (!A || !B || !obbHit(A, B)) continue;
      // điểm báo: giữa 2 tâm hộp chiếu lên trục a
      const at: Vec3 = closestMid(a, b);
      out.push(freshIds.has(b.id) && b.id < a.id ? { a: b, b: a, at } : { a, b, at });
    }
  }
  return out;
}
