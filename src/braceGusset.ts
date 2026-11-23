// Hình dạng GPL ブレース (図1 / 図2 / 図3 / ブレースシート / PL tự vẽ) trong mặt phẳng giằng
import { Joint, JointPos, Member, Project, Vec3, plateGeometry } from './model';
import { BRACE_SHEET, sheetPolygon } from './kiseihin';

export const BRACE_SHAPES: { key: string; label: string; desc: string }[] = [
  { key: 'fig1', label: '図1 矩形', desc: 'Bản chữ nhật ôm góc khung (hàn vào cả dầm và cột)' },
  { key: 'fig2', label: '図2 台形', desc: 'Bản hình thang loe theo trục giằng' },
  { key: 'fig3', label: '図3 片側', desc: 'Bản hàn một phía (vào dầm), vát theo giằng' },
  { key: 'sheet', label: 'ブレースシート', desc: 'Theo 品番 ブレースシート フルサト của 継手' },
];

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const nrm = (a: V): V => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export interface GussetGeom {
  /** gốc (điểm làm việc) */
  o: Vec3;
  /** trục u (dọc giằng, hướng vào thanh), v (vuông góc trong mặt phẳng), n (pháp tuyến) */
  u: Vec3;
  v: Vec3;
  n: Vec3;
  pts: [number, number][];
  holes: { c: [number, number]; r: number }[];
  t: number;
}

/** Kích thước GPL / クロスプレート của 継手 ブレース (mặc định tự tính khi trống) */
export function braceDims(j: Joint, secW = 100) {
  const g = j.webBolts;
  const cols = Math.max(1, g.cols);
  const span = (cols - 1) * g.pitch;
  const L = j.brL || Math.max(150, 2 * g.edge + span + 60);
  const W = j.brW || Math.max(60, Math.min(160, secW + 50));
  const W0 = j.brW0 || Math.round(W + 2 * L * 0.577);
  const midT = j.midT || j.webT;
  const midN = Math.max(1, j.midN ?? cols);
  const midSpan = (midN - 1) * g.pitch;
  const midL = j.midL || Math.max(200, 2 * (g.edge + midSpan + 60));
  const midW = j.midW || Math.round(midL * 0.7);
  /** vị trí bulông đầu: cách gốc GPL, bulông ngoài cùng cách mép = edge */
  const us = (len: number) => Array.from({ length: cols }, (_, k) => len - g.edge - k * g.pitch);
  /** bulông クロスプレート (1 phía): bulông ngoài cùng cách mép = edge */
  const midUs = (reach: number) => Array.from({ length: midN }, (_, k) => reach - g.edge - k * g.pitch).filter((x) => x > 0);
  return { L, W, W0, midT, midN, midL, midW, us, midUs, span, midSpan, edge: g.edge, pitch: g.pitch, cols };
}

/** Khoá hình dạng GPL thực dùng cho một điểm của giằng */
export function braceShapeKey(p: Project, m: Member, pos: JointPos, j: Joint): string {
  const br = m.source ? p.braces?.find((b) => b.id === m.source) ?? p.knees?.find((k) => k.id === m.source) : undefined;
  return br?.shapes?.[pos] ?? j.shape ?? (j.sheet ? 'sheet' : 'fig2');
}

/** Hình học GPL tại đầu (left/right) hoặc クロスプレート (mid) của thanh giằng */
export function braceGusset(p: Project, m: Member, pos: JointPos, j: Joint): GussetGeom {
  const a = m.a as V, b = m.b as V;
  const d = nrm(sub(b, a));
  const plan = Math.abs(d[2]) < 0.5;
  const n: V = plan ? [0, 0, 1] : nrm(cross(d, [0, 0, 1]));
  // trục khung trong mặt phẳng: e1 ngang, e2 đứng (giằng đứng) / Y (giằng ngang)
  const e2: V = plan ? [0, 1, 0] : [0, 0, 1];
  const e1: V = plan ? [1, 0, 0] : nrm(cross(e2, n));
  const o: V = pos === 'left' ? a : pos === 'right' ? b : [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const u: V = pos === 'right' ? [-d[0], -d[1], -d[2]] : d;
  const v: V = nrm(cross(n, u));
  const toUV = (x: number, y: number): [number, number] => {
    const P: V = [e1[0] * x + e2[0] * y, e1[1] * x + e2[1] * y, e1[2] * x + e2[2] * y];
    return [dot(P, u), dot(P, v)];
  };
  const sheet = j.sheet ? BRACE_SHEET.find((s) => s.code === j.sheet) : undefined;
  const D = braceDims(j, Math.max(m.section.b, m.section.h));
  const wb = D.W;
  const L = sheet ? sheet.D : D.L;
  const key = braceShapeKey(p, m, pos, j);
  let t = sheet?.t ?? j.webT;
  let pts: [number, number][];
  let holes: { c: [number, number]; r: number }[] = [];
  const hr = (sheet?.d ?? j.bolt.dia + 2) / 2;
  const endHoles = (len: number) => D.us(len).map((x) => ({ c: [x, 0] as [number, number], r: hr }));
  if (pos === 'mid') {
    // クロスプレート: chữ nhật theo khung (midL × midW), tâm tại giao điểm; bulông 2 phía theo trục giằng
    t = D.midT;
    const hx = D.midL / 2, hy = D.midW / 2;
    pts = [toUV(-hx, -hy), toUV(hx, -hy), toUV(hx, hy), toUV(-hx, hy)];
    const reach = Math.min(Math.abs(dot(u, e1)) > 1e-6 ? hx / Math.abs(dot(u, e1)) : Infinity, Math.abs(dot(u, e2)) > 1e-6 ? hy / Math.abs(dot(u, e2)) : Infinity);
    const us = D.midUs(reach);
    holes = us.flatMap((x) => [x, -x]).map((x) => ({ c: [x, 0] as [number, number], r: hr }));
  } else {
    const s1 = Math.sign(dot(u, e1)) || 1, s2 = Math.sign(dot(u, e2)) || 1;
    const A = Math.abs(dot(u, e1)) * L + wb * 0.7;
    const B = Math.abs(dot(u, e2)) * L + wb * 0.7;
    const custom = p.plates?.find((x) => x.id === key);
    if (custom) {
      const g = plateGeometry(custom);
      pts = g.outer ?? [[0, -wb / 2], [L, -wb / 2], [L, wb / 2], [0, wb / 2]];
      holes = g.holes;
      t = custom.t;
    } else if (key === 'sheet' && sheet) {
      const sp = sheetPolygon(sheet);
      pts = sp.pts;
      holes = [{ c: [sp.hole.u, 0], r: sp.hole.r }];
    } else if (key === 'fig1') {
      pts = [toUV(0, 0), toUV(s1 * A, 0), toUV(s1 * A, s2 * B), toUV(0, s2 * B)];
      holes = endHoles(L);
    } else if (key === 'fig3') {
      pts = [toUV(-s1 * 40, 0), toUV(s1 * A, 0), toUV(s1 * A, s2 * B), toUV(s1 * A * 0.3, s2 * B * 0.45)];
      holes = endHoles(L);
    } else {
      const w0 = D.W0;
      pts = [[-40, -w0 / 2], [L, -wb / 2], [L, wb / 2], [-40, w0 / 2]];
      holes = endHoles(L);
    }
  }
  return { o, u, v, n, pts, holes, t };
}
