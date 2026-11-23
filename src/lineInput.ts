// Nhập 間柱 / 小梁 theo 2 部材 đỡ (hoặc 補助線) + đường chuẩn (trục / 補助線) + khoảng cách
import type { Member, Project, Vec3 } from './model';
import { geometry } from './build';
import type { AuxLine } from './workplane';

type P2 = [number, number];
/** 部材 / 補助線 làm điểm đầu – điểm cuối */
export interface Sup {
  kind: 'member' | 'aux';
  label: string;
  a: Vec3;
  b: Vec3;
  /** chiều cao tiết diện (mm) – để lấy mặt trên / mặt dưới */
  h: number;
  /** id phần tử gốc (cột / dầm) nếu có */
  src?: string;
  mkind?: string;
}
export interface LineInput {
  s1: Sup | null;
  s2: Sup | null;
  /** đường chuẩn: 'gx:<id>' | 'gy:<id>' | 'aux:<key>' */
  ref: string;
  /** khoảng cách tới đường chuẩn (mm), nhiều giá trị cách nhau dấu cách / dấu phẩy, vd "1500 3000" hoặc "3*1500" (cộng dồn) */
  ds: string;
  /** cộng dồn các khoảng cách (vd 3*1500 → 1500, 3000, 4500) */
  cum: boolean;
  /** cách nhập: 'ds' theo khoảng cách · 'div' hàng loạt giữa 2 đường giới hạn · 'arr' hàng loạt từ 1 đường chuẩn */
  mode?: 'ds' | 'div' | 'arr';
  /** đường giới hạn 2 (mode div) */
  ref2?: string;
  /** số lượng 部材 (div / arr) */
  n?: number;
  /** khoảng cách giữa các cây (arr, mm) */
  sp?: number;
  /** div: cách chia – 'step' bước D/N, cây cuối trên đường 2 · 'mid' bước D/N, cây ở giữa mỗi ô · 'inner' bước D/(N+1), cách đều 2 đường */
  place?: 'step' | 'mid' | 'inner';
  /** arr: cây đầu nằm trên đường chuẩn */
  from0?: boolean;
  /** arr: đảo phía (về −X / −Y) */
  flip?: boolean;
  /** quét chọn nhiều 大梁 song song: 小梁 tạo giữa từng cặp 大梁 kề nhau */
  multi?: Sup[];
  /** quét chọn: từng cặp 大梁 song song kề nhau (cùng tầng, chồng nhau), mỗi cặp có đường giới hạn riêng của khoang */
  pairs?: { s1: Sup; s2: Sup; ref?: string; ref2?: string }[];
}
export const initialLineInput = (): LineInput => ({ s1: null, s2: null, ref: '', ds: '1500', cum: false, mode: 'ds', ref2: '', n: 3, sp: 1500, place: 'step', from0: false, flip: false });

/** khoảng cách có dấu từ đường A tới đường B (song song) theo pháp tuyến A; null nếu không song song */
export function refGap(A: RefLine, B: RefLine): number | null {
  if (A.z !== undefined || B.z !== undefined) return A.z !== undefined && B.z !== undefined ? B.z - A.z : null;
  const da: P2 = [A.b[0] - A.a[0], A.b[1] - A.a[1]], db: P2 = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
  const la = Math.hypot(...da) || 1, lb = Math.hypot(...db) || 1;
  if (Math.abs(da[0] * db[1] - da[1] * db[0]) / (la * lb) > 0.02) return null;
  const n = refNormal(A);
  return n[0] * (B.a[0] - A.a[0]) + n[1] * (B.a[1] - A.a[1]);
}
/** danh sách khoảng cách tới đường chuẩn theo cách nhập hàng loạt */
export function batchDs(li: LineInput, refs: RefLine[]): { ds: number[]; D?: number; pitch?: number; err?: string } {
  const n = Math.max(1, Math.round(li.n ?? 1));
  if (li.mode === 'arr') {
    const sp = (li.sp ?? 0) * (li.flip ? -1 : 1);
    if (!sp) return { ds: [], err: 'Nhập khoảng cách giữa các cây.' };
    return { ds: Array.from({ length: n }, (_, i) => (i + 1) * sp), pitch: sp };
  }
  const A = refs.find((r) => r.key === li.ref), B = refs.find((r) => r.key === li.ref2);
  if (!A || !B) return { ds: [], err: 'Chọn 2 đường giới hạn (trục, 補助線 hoặc 部材).' };
  const D = refGap(A, B);
  if (D === null) return { ds: [], err: '2 đường giới hạn phải song song (cùng loại: mặt bằng hoặc tầng).' };
  if (Math.abs(D) < 1) return { ds: [], err: '2 đường giới hạn trùng nhau.' };
  // N cây cách đều giữa 2 đường giới hạn (không đặt lên 2 đường): bước D/(N+1)
  const pitch = D / (n + 1);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const ds = Array.from({ length: n }, (_, i) => r1((i + 1) * pitch));
  return { ds, D, pitch };
}

export interface RefLine { key: string; label: string; a: P2; b: P2; /** đường tầng: cao độ (khoảng cách đo theo phương đứng) */ z?: number }
/** Đường chuẩn có thể chọn: trục X, trục Y, 補助線 (chiếu lên mặt bằng) */
export function refLines(p: Project, aux: AuxLine[]): RefLine[] {
  const g = geometry(p);
  const out: RefLine[] = [];
  for (const x of p.gridsX) {
    const v = g.xs.get(x.id) ?? 0;
    out.push({ key: `gx:${x.id}`, label: `通り ${x.name}`, a: [v, g.y0], b: [v, g.yN + 1] });
  }
  for (const y of p.gridsY) {
    const v = g.ys.get(y.id) ?? 0;
    out.push({ key: `gy:${y.id}`, label: `通り ${y.name}`, a: [g.x0, v], b: [g.xN + 1, v] });
  }
  for (const l of [...p.levels].sort((a, b) => a.elevation - b.elevation)) out.push({ key: `lv:${l.id}`, label: `▽ Tầng ${l.name} (${l.elevation})`, a: [g.x0, g.y0], b: [g.xN, g.y0], z: l.elevation });
  for (const l of aux) if (!l.arc && Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) > 1) out.push({ key: `aux:${l.key}`, label: l.label, a: [l.a[0], l.a[1]], b: [l.b[0], l.b[1]] });
  return out;
}

/** pháp tuyến mặt bằng của đường chuẩn, chiều dương theo +X (hoặc +Y) */
function refNormal(R: RefLine): P2 {
  const dx = R.b[0] - R.a[0], dy = R.b[1] - R.a[1], l = Math.hypot(dx, dy) || 1;
  let n: P2 = [dy / l, -dx / l];
  if (n[0] < -1e-9 || (Math.abs(n[0]) <= 1e-9 && n[1] < 0)) n = [-n[0], -n[1]];
  return n;
}
/** điểm trên 部材 đỡ có khoảng cách mặt bằng tới đường chuẩn = d */
export function supPoint(s: Sup, R: RefLine, d: number): Vec3 | null {
  if (R.z !== undefined) {
    // đường tầng: điểm trên 部材 đỡ có cao độ = tầng + d
    const dz = s.b[2] - s.a[2];
    if (Math.abs(dz) < 1e-6) return null;
    const t = (R.z + d - s.a[2]) / dz;
    if (t < -0.002 || t > 1.002) return null;
    return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + dz * t];
  }
  const n = refNormal(R);
  const den = n[0] * (s.b[0] - s.a[0]) + n[1] * (s.b[1] - s.a[1]);
  if (Math.abs(den) < 1e-6) return null;
  const t = (d - (n[0] * (s.a[0] - R.a[0]) + n[1] * (s.a[1] - R.a[1]))) / den;
  if (t < -0.002 || t > 1.002) return null;
  return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t, s.a[2] + (s.b[2] - s.a[2]) * t];
}
export function parseDs(ds: string, cum: boolean): number[] {
  const vals: number[] = [];
  for (const tok of ds.split(/[\s,;]+/).filter(Boolean)) {
    const m = tok.match(/^(\d+)\*(-?\d+(?:\.\d+)?)$/);
    if (m) for (let i = 0; i < +m[1]; i++) vals.push(+m[2]);
    else if (!isNaN(+tok)) vals.push(+tok);
  }
  if (!cum) return vals;
  let s = 0;
  return vals.map((v) => (s += v));
}

export interface LineTarget {
  d: number;
  /** 小梁: 2 đầu mặt trên dầm; 間柱: chân (mặt trên 部材 dưới) / đỉnh (mặt dưới 部材 trên) */
  p1: Vec3;
  p2: Vec3;
  /** id 部材 đỡ 2 đầu (khi quét chọn nhiều cặp) */
  r1?: string;
  r2?: string;
}
/** Tính vị trí các 間柱 / 小梁 theo đầu vào; trả lỗi nếu thiếu / không cắt */
export function lineTargets(li: LineInput, refs: RefLine[], kind: 'post' | 'sbeam'): { list: LineTarget[]; err?: string } {
  if (li.pairs && li.pairs.length > 1 && li.s1 && li.s2) {
    const list: LineTarget[] = [];
    const errs: string[] = [];
    for (const pr of li.pairs) {
      const r = lineTargets1({ ...li, s1: pr.s1, s2: pr.s2, ref: pr.ref || li.ref, ref2: pr.ref2 || li.ref2 }, refs, kind);
      list.push(...r.list.map((t) => ({ ...t, r1: pr.s1.src, r2: pr.s2.src })));
      if (r.err && !r.list.length) errs.push(`${pr.s1.label}–${pr.s2.label}: ${r.err}`);
    }
    return { list, err: errs.length ? errs.join(' · ') : undefined };
  }
  const ms = li.multi ?? [];
  if (ms.length < 3 || !li.s1 || !li.s2) return lineTargets1(li, refs, kind);
  // nhiều 大梁 song song: từng cặp kề nhau
  const list: LineTarget[] = [];
  const errs: string[] = [];
  for (let i = 0; i + 1 < ms.length; i++) {
    const r = lineTargets1({ ...li, s1: ms[i], s2: ms[i + 1] }, refs, kind);
    list.push(...r.list.map((t) => ({ ...t, r1: ms[i].src, r2: ms[i + 1].src })));
    if (r.err && !r.list.length) errs.push(`${ms[i].label}–${ms[i + 1].label}: ${r.err}`);
  }
  return { list, err: errs.length ? errs.join(' · ') : undefined };
}
function lineTargets1(li: LineInput, refs: RefLine[], kind: 'post' | 'sbeam'): { list: LineTarget[]; err?: string } {
  if (!li.s1 || !li.s2) return { list: [], err: kind === 'post' ? 'Bấm 部材 / 補助線 dưới (chân 間柱) rồi 部材 / 補助線 trên (đỉnh).' : 'Bấm 2 部材 / 補助線 đỡ 2 đầu 小梁.' };
  const R = refs.find((r) => r.key === li.ref);
  if (!R) return { list: [], err: li.mode === 'div' ? 'Chọn đường giới hạn 1 (trục, 補助線 hoặc 部材).' : 'Chọn đường chuẩn (trục, đường tầng, 部材 hoặc 補助線).' };
  let ds: number[];
  if (li.mode === 'div' || li.mode === 'arr') {
    const bt = batchDs(li, refs);
    if (bt.err) return { list: [], err: bt.err };
    ds = bt.ds;
    // 1 đường chuẩn: mặc định nhân bản về phía có 部材 đỡ (giữa 2 đầu 部材 đỡ 1)
    if (li.mode === 'arr' && R.z === undefined) {
      const n = refNormal(R), mid = [(li.s1.a[0] + li.s1.b[0]) / 2, (li.s1.a[1] + li.s1.b[1]) / 2];
      if (n[0] * (mid[0] - R.a[0]) + n[1] * (mid[1] - R.a[1]) < -1) ds = ds.map((d) => -d);
    }
  } else ds = parseDs(li.ds, li.cum);
  if (!ds.length) return { list: [], err: 'Nhập khoảng cách tới đường chuẩn.' };
  const top = (s: Sup) => (s.kind === 'member' && s.mkind !== 'column' ? s.h / 2 : 0);
  const list: LineTarget[] = [];
  const bad: number[] = [];
  for (const d of ds) {
    const A = supPoint(li.s1, R, d), B = supPoint(li.s2, R, d);
    if (!A || !B) {
      bad.push(d);
      continue;
    }
    if (kind === 'sbeam') {
      list.push({ d, p1: [A[0], A[1], A[2] + top(li.s1)], p2: [B[0], B[1], B[2] + top(li.s2)] });
    } else {
      // 間柱 thẳng đứng tại vị trí trên 部材 dưới; đỉnh = 部材 trên tại cùng vị trí mặt bằng
      const [lo, hi, sl, sh] = A[2] <= B[2] ? [A, B, li.s1, li.s2] : [B, A, li.s2, li.s1];
      const zb = lo[2] + top(sl), zt = hi[2] - top(sh);
      if (zt - zb < 100) {
        bad.push(d);
        continue;
      }
      list.push({ d, p1: [lo[0], lo[1], zb], p2: [lo[0], lo[1], zt] });
    }
  }
  return { list, err: bad.length ? `Không cắt được 部材 đỡ tại khoảng cách: ${bad.join(', ')}` : undefined };
}

export function supFromMember(m: Member, all?: Member[]): Sup {
  // cả cây (mọi đoạn ブラケット / giữa của cùng phần tử gốc), không chỉ đoạn được bấm
  const ps = all && m.source ? all.filter((x) => x.source === m.source && x.kind === m.kind && x.part !== 'shikuchi').sort((x, y) => (x.piece ?? 0) - (y.piece ?? 0)) : [];
  const a = ps.length ? ps[0].a : m.a, b = ps.length ? ps[ps.length - 1].b : m.b;
  return { kind: 'member', label: `${m.mark || m.name || m.kind}`, a, b, h: m.section.h, src: m.source, mkind: m.kind };
}
export function supFromAux(l: AuxLine): Sup {
  return { kind: 'aux', label: l.label, a: l.a, b: l.b, h: 0 };
}
