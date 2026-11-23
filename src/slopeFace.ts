// 勾配設定: mặt dốc theo đa giác giao trục, cao độ theo kiểu 水上 / 水下基準 + 勾配比率, 柱合わせ cho đỉnh cột và đầu dầm
import { Project, SlopeFace, SlopeColSet, gridPositions, uid } from './model';

export const newSlopeFace = (p: Project, n: number, level: string, mode: 'area' | 'line' = 'area'): SlopeFace => ({
  id: uid('sf'),
  mode,
  ok: false,
  name: mode === 'line' ? `L${n}勾配` : `R${n}屋根`,
  level,
  pts: [],
  baseAxis: '',
  kind: 'rightHigh',
  start: '',
  end: '',
  dx: 0,
  dy: 1500,
  run: 10,
  rise: 3,
  cols: { low: { dia: 'flat', fit: 'center' }, std: { dia: 'flat', fit: 'low' }, high: { dia: 'flat', fit: 'center' } },
});

/** 基準通り là trục X (đường x = const) → dốc theo phương Y; ngược lại dốc theo X */
export function faceAxis(p: Project, f: SlopeFace): 'x' | 'y' | null {
  if (p.gridsX.some((g) => g.id === f.baseAxis)) return 'y';
  if (p.gridsY.some((g) => g.id === f.baseAxis)) return 'x';
  return null;
}

export interface FaceGeo {
  f: SlopeFace;
  poly: [number, number][];
  /** phương dốc */
  dir: 'x' | 'y';
  s0: number;
  s1: number;
  /** các trục giữa (vuông góc phương dốc) nằm giữa 開始 và 終了 */
  mids: { id: string; s: number }[];
}

export function faceGeo(p: Project, f: SlopeFace): FaceGeo | null {
  const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
  const dir = faceAxis(p, f);
  if (!dir) return null;
  const pos = dir === 'y' ? gy : gx;
  const s0 = pos.get(f.start), s1 = pos.get(f.end);
  if (s0 === undefined || s1 === undefined || s0 === s1) return null;
  const lo = Math.min(s0, s1) + 1, hi = Math.max(s0, s1) - 1;
  const mids = [...pos.entries()].filter(([, v]) => v > lo && v < hi).map(([id, v]) => ({ id, s: v })).sort((a, b) => (a.s - b.s) * Math.sign(s1 - s0));
  if (f.mode === 'line') {
    // 勾配 đường: đoạn trên trục baseAxis từ 開始 tới 終了
    const c = (dir === 'y' ? gx : gy).get(f.baseAxis)!;
    const q = (s: number): [number, number] => (dir === 'y' ? [c, s] : [s, c]);
    return { f, poly: [q(s0), q(s1), q(s1)], dir, s0, s1, mids };
  }
  let poly = f.pts.map(([x, y]) => [gx.get(x), gy.get(y)]).filter((q): q is [number, number] => q[0] !== undefined && q[1] !== undefined);
  // 2 góc → khung chữ nhật
  if (poly.length === 2) {
    const [[x0, y0], [x1, y1]] = poly;
    poly = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  if (poly.length < 3) return null;
  return { f, poly, dir, s0, s1, mids };
}

/** Tất cả trục theo phương dốc trong phạm vi: 開始, các trục giữa, 終了 */
export function faceAxes(g: FaceGeo): { id: string; s: number }[] {
  return [{ id: g.f.start, s: g.s0 }, ...g.mids, { id: g.f.end, s: g.s1 }];
}

export interface Knot { id: string; k: 1 | 2; t: number; t0: number; z: number; set: boolean }
/** Có nhập point nào chưa (không có → 勾配 theo kiểu gốc) */
export const hasPoints = (f: SlopeFace) => Object.values(f.adj ?? {}).some((a) => a.x1 || a.x2 || a.y1 != null || a.y2 != null);

/**
 * Point của từng trục (t tính từ 開始 theo phương 開始 → 終了):
 * point 1 tại trục − X1, cao Y1; point 2 tại trục + X2, cao Y2. Y bỏ trống = cao độ 勾配 gốc tại vị trí point.
 * 勾配 = đường nối các point theo thứ tự.
 */
export function faceKnots(g: FaceGeo): Knot[] {
  const d = Math.sign(g.s1 - g.s0);
  const adj = g.f.adj ?? {};
  const out: Knot[] = [];
  for (const m of faceAxes(g)) {
    const a = adj[m.id] ?? {};
    const t0 = (m.s - g.s0) * d;
    const t1 = t0 - (a.x1 ?? 0), t2 = t0 + (a.x2 ?? 0);
    out.push({ id: m.id, k: 1, t0, t: t1, z: a.y1 ?? faceZ0(g, g.s0 + d * t1), set: a.y1 != null || !!a.x1 });
    out.push({ id: m.id, k: 2, t0, t: t2, z: a.y2 ?? faceZ0(g, g.s0 + d * t2), set: a.y2 != null || !!a.x2 });
  }
  return out.sort((x, y) => x.t - y.t || x.t0 - y.t0 || x.k - y.k);
}

/** Cao độ trên đường nối các point tại t. Đúng tại chỗ có bậc (2 point cùng vị trí): side (-1 trái, +1 phải theo t); không có side → đầu lấy phía trong, giữa lấy phía cao. Ngoài point đầu / cuối: kéo dài đoạn kề */
function polyZ(ks: Knot[], t: number, side = 0): number {
  const n = ks.length;
  const at = ks.filter((k) => Math.abs(t - k.t) < 0.5);
  if (at.length) {
    const lz = at[0].z, rz = at[at.length - 1].z;
    if (side < 0) return lz;
    if (side > 0) return rz;
    if (at.includes(ks[0])) return rz;
    if (at.includes(ks[n - 1])) return lz;
    return Math.max(lz, rz);
  }
  const seg = (a: Knot, b: Knot) => (b.t - a.t < 1e-6 ? b.z : a.z + ((b.z - a.z) * (t - a.t)) / (b.t - a.t));
  if (t < ks[0].t) return seg(ks[0], ks[1]);
  for (let i = 1; i < n; i++) if (t <= ks[i].t) return seg(ks[i - 1], ks[i]);
  return seg(ks[n - 2], ks[n - 1]);
}

/** Hình cắt (t, z) qua các point – để vẽ; phủ cả đoạn 開始 → 終了 */
export function faceProfile(g: FaceGeo): [number, number][] {
  const L = Math.abs(g.s1 - g.s0);
  const ks = faceKnots(g);
  const t0 = Math.min(0, ks[0].t), t1 = Math.max(L, ks[ks.length - 1].t);
  const out: [number, number][] = [];
  if (t0 < ks[0].t - 0.5) out.push([t0, polyZ(ks, t0)]);
  for (const k of ks) out.push([k.t, k.z]);
  if (t1 > ks[ks.length - 1].t + 0.5) out.push([t1, polyZ(ks, t1)]);
  return out;
}

/** Chênh cao (mm) của mặt dốc tại toạ độ s theo phương dốc (đường nối các point). side: phía cần lấy tại chỗ có bậc (dấu theo toạ độ s) */
export function faceZ(g: FaceGeo, s: number, side = 0): number {
  if (!hasPoints(g.f)) return faceZ0(g, s);
  const d = Math.sign(g.s1 - g.s0);
  return polyZ(faceKnots(g), (s - g.s0) * d, side * d);
}

/** Chênh cao theo kiểu 勾配 (chưa tính điều chỉnh trục giữa) */
export function faceZ0(g: FaceGeo, s: number): number {
  const { f, s0, s1 } = g;
  const L = Math.abs(s1 - s0), d = Math.sign(s1 - s0);
  const t = (s - s0) * d; // 0 tại 開始, L tại 終了
  const r = f.run ? f.rise / f.run : 0;
  switch (f.kind) {
    case 'flat': return f.dy;
    case 'two': return f.dy + ((f.dy2 ?? f.dy) - f.dy) * (t / (L || 1));
    case 'rightHigh': return f.dy - r * (L - f.dx - t);
    case 'rightLow': return f.dy + r * (L - f.dx - t);
    case 'leftHigh': return f.dy - r * (t - f.dx);
    case 'leftLow': return f.dy + r * (t - f.dx);
  }
}

/** Điểm (x, y) nằm trong / trên biên đa giác (sai số tol) */
export function inPoly(poly: [number, number][], x: number, y: number, tol = 5): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    // trên cạnh
    const dx = xj - xi, dy = yj - yi, L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / L2));
    if (Math.hypot(xi + dx * t - x, yi + dy * t - y) <= tol) return true;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Các mặt 勾配 đã xác nhận chứa điểm (x, y) – 勾配 đường ưu tiên trước */
export function facesAt(p: Project, level: string, x: number, y: number): FaceGeo[] {
  return (p.slopeFaces ?? [])
    .filter((f) => f.level === level && f.ok !== false)
    .sort((a, b) => (a.mode === 'line' ? 0 : 1) - (b.mode === 'line' ? 0 : 1))
    .map((f) => faceGeo(p, f))
    .filter((g): g is FaceGeo => !!g && inPoly(g.poly, x, y));
}

/** Đỉnh 3D của mặt / đường 勾配 (để vẽ trên 3D) */
export function faceVis(p: Project, f: SlopeFace): { pts: [number, number, number][]; line: boolean } | null {
  const g = faceGeo(p, f);
  const el = p.levels.find((l) => l.id === f.level)?.elevation;
  if (!g || el === undefined) return null;
  const pts = (f.mode === 'line' ? g.poly.slice(0, 2) : g.poly).map(([x, y]) => [x, y, el + faceZ(g, g.dir === 'y' ? y : x)] as [number, number, number]);
  return { pts, line: f.mode === 'line' };
}

/** Khung quét (toạ độ thế giới) → 4 góc giao trục nằm trong khung */
export function rectNodes(p: Project, x0: number, y0: number, x1: number, y1: number): [string, string][] | null {
  const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
  const [ax, bx] = [Math.min(x0, x1) - 1, Math.max(x0, x1) + 1], [ay, by] = [Math.min(y0, y1) - 1, Math.max(y0, y1) + 1];
  const xs = p.gridsX.filter((g) => { const v = gx.get(g.id)!; return v >= ax && v <= bx; }).sort((a, b) => gx.get(a.id)! - gx.get(b.id)!);
  const ys = p.gridsY.filter((g) => { const v = gy.get(g.id)!; return v >= ay && v <= by; }).sort((a, b) => gy.get(a.id)! - gy.get(b.id)!);
  if (xs.length < 2 || ys.length < 2) return null;
  const [xa, xb, ya, yb] = [xs[0].id, xs[xs.length - 1].id, ys[0].id, ys[ys.length - 1].id];
  return [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
}

/** Đặt phương dốc cho 勾配 vùng: 'y' = dốc theo trục chữ (Y), 'x' = theo trục số (X); 開始 / 終了 = 2 trục ngoài cùng của vùng */
export function setFaceDir(p: Project, f: SlopeFace, dir: 'x' | 'y') {
  const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
  const along = dir === 'y' ? gy : gx, other = dir === 'y' ? p.gridsX : p.gridsY;
  const idsA = [...new Set(f.pts.map((q) => (dir === 'y' ? q[1] : q[0])))].sort((a, b) => (along.get(a) ?? 0) - (along.get(b) ?? 0));
  const idsO = [...new Set(f.pts.map((q) => (dir === 'y' ? q[0] : q[1])))];
  f.baseAxis = idsO[Math.floor(idsO.length / 2)] ?? other[0]?.id ?? '';
  if (idsA.length >= 2) { f.start = idsA[0]; f.end = idsA[idsA.length - 1]; }
}

/** 勾配 đường: chọn trục → 開始 / 終了 mặc định = trục đầu / cuối vuông góc */
export function setFaceLine(p: Project, f: SlopeFace, line: string) {
  f.baseAxis = line;
  const perp = p.gridsX.some((g) => g.id === line) ? p.gridsY : p.gridsX;
  const pos = gridPositions(perp);
  const s = [...perp].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  if (!perp.some((g) => g.id === f.start)) f.start = s[0]?.id ?? '';
  if (!perp.some((g) => g.id === f.end)) f.end = s[s.length - 1]?.id ?? '';
}

/** Vai trò cột trong mặt dốc: nằm trên trục 水下 / 水上 hay 標準 */
export function colRole(g: FaceGeo, x: number, y: number): 'low' | 'std' | 'high' {
  const s = g.dir === 'y' ? y : x;
  const zs = faceZ(g, g.s0), ze = faceZ(g, g.s1);
  const onS = Math.abs(s - g.s0) < 1, onE = Math.abs(s - g.s1) < 1;
  if (!onS && !onE) return 'std';
  if (zs === ze) return 'std';
  const sHigh = zs > ze;
  return (onS && sHigh) || (onE && !sHigh) ? 'high' : 'low';
}

/** Chênh cao tại cột theo 柱合わせ: 柱芯 = tại tâm, 水下 / 水上ダイア = tại mặt cột phía thấp / cao. half = nửa bề rộng cột theo phương dốc */
export function colFitZ(g: FaceGeo, x: number, y: number, half: number, side = 0): { z: number; set: SlopeColSet } {
  const set = g.f.cols[colRole(g, x, y)];
  const s = g.dir === 'y' ? y : x;
  // side ≠ 0 (đầu dầm): chỉ xét phía trong của dầm
  const c = faceZ(g, s, side);
  const a = side ? Math.min(c, faceZ(g, s + side * half)) : faceZ(g, s - half), b = side ? Math.max(c, faceZ(g, s + side * half)) : faceZ(g, s + half);
  const z = set.fit === 'center' ? c : set.fit === 'low' ? Math.min(a, b) : set.fit === 'high' ? Math.max(a, b) : 0;
  return { z, set };
}
