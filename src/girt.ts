// 胴縁 (xà gồ tường) theo quy trình REAL4 Step15–19:
// 胴縁マスター (部材 / ピース / 開口 / 部品) → 胴縁配置面 (通り hoặc 2 交点 + オフセット + 矢印) → 縦 / 横 / 登り胴縁, パターン, 開口, 支持ピース, 複写
import { Member, Project, Section, Vec3, gridPositions, kgPerM, uid } from './model';
import { FieldSpec, FieldVal, MoyaMember, MoyaPart, MoyaPiece, memberSection, pieceSection, parseDs } from './moya';

export type P2 = [number, number];
import type { PcItem } from './pieceSet';

// ---------- マスター ----------
export interface GirtOpenM { id: string; name: string; v: Record<string, FieldVal> }
const isShutter = (v: Record<string, FieldVal>) => String(v.kind).includes('シャッター');
export const OPEN_FIELDS: FieldSpec[] = [
  { k: 'kind', label: '開口種類', t: 'sel', opts: ['1-サッシ', '2-シャッター', '3-ドア', '4-ガラリ'] },
  { k: 'h', label: '縦サイズ', t: 'num' },
  { k: 'w', label: '横サイズ', t: 'num' },
  { k: 'thru', label: '部材通し方向', t: 'sel', opts: ['1-縦通し', '2-横通し'], when: (v) => !isShutter(v) },
  { k: 'mount', label: 'ピース取付け', t: 'sel', opts: ['1-開口', '2-通し部'] },
  { k: 'jOpen', label: '開口部取合', t: 'sel', opts: ['1-親側がボルト', '2-子側がボルト'] },
  { k: 'jThru', label: '通し部取合', t: 'sel', opts: ['1-親側がボルト', '2-子側がボルト'] },
  { k: 'note', label: '開口表記', t: 'sel', opts: ['1-なし', '2-×', '3-×+○', '4-×+○+名称'] },
  { k: 'mTop', label: '上胴縁', t: 'text' },
  { k: 'mBot', label: '下胴縁', t: 'text' },
  { k: 'mLeft', label: '左胴縁', t: 'text' },
  { k: 'mRight', label: '右胴縁', t: 'text' },
  { k: 'gap', label: '上・下・左・右すきま', t: 'num' },
  { k: 'shW', label: 'シャッター幅', t: 'num', when: isShutter },
  { k: 'shBase', label: 'シャッター基準', t: 'sel', opts: ['1-中心', '2-外側', '3-内側'], when: isShutter },
  { k: 'topDir', label: '上胴縁向き', t: 'sel', opts: ['1-上', '2-下'], when: isShutter },
  { k: 'botDir', label: '下胴縁向き', t: 'sel', opts: ['1-上', '2-下'], when: isShutter },
];

// ---------- 配置面 / 胴縁 / 開口 ----------
export interface GirtPlane {
  id: string;
  name: string;
  /** 'gx:<id>' | 'gy:<id>' = theo 通り; 'pts' = 2 キープラン交点 */
  ref: string;
  p1?: [string, string];
  p2?: [string, string];
  offset: number;
  /** 矢印 (hướng nhìn = phía đặt 胴縁): 1 = trái theo chiều đường, -1 = phải */
  arrow: 1 | -1;
}
export const GIRT_DIRS = ['1-(上/左)ﾊﾟﾗﾒｰﾀｰ参照', '2-(下/右)'] as const;
export const GIRT_BASES = ['1-部材芯', '2-上側', '3-下側'] as const;
export interface GirtItem {
  id: string;
  plane: string;
  member: string;
  dir: (typeof GIRT_DIRS)[number];
  /** đầu A (trái / dưới) và B (phải / trên) theo toạ độ mặt đứng (s, z) */
  a: P2;
  b: P2;
  extA: number;
  extB: number;
  /** コーナーピース: 'マスター参照' | '<無>' | tên ピース */
  cornerA: string;
  cornerB: string;
  /** 端部材部品 (盲PL…) */
  endA: string;
  endB: string;
  depth: number;
  /** 横胴縁: cắt tại 縦胴縁 giao nhau (入力側切断) */
  cut?: boolean;
}
export interface GirtOpen {
  id: string;
  plane: string;
  name: string;
  /** góc trái dưới (s, z) */
  s: number;
  z: number;
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}
export interface GirtData {
  members: MoyaMember[];
  pieces: MoyaPiece[];
  opens: GirtOpenM[];
  parts: MoyaPart[];
  planes: GirtPlane[];
  items: GirtItem[];
  openings: GirtOpen[];
  support: { on: boolean; piece: string; pos: string; align: string };
  /** ピース nhập tay (支持 / 接続 / コーナー) */
  pcs?: PcItem[];
}

export function girtTemplates(): { pieces: MoyaPiece[]; parts: MoyaPart[] } {
  const d = templGirt();
  return { pieces: d.pieces, parts: d.parts };
}
/** 胴縁マスター mặc định: chỉ 部材 + 開口; ピース / 部品 chỉ tạo khi người dùng tạo / nhập */
export function defaultGirt(): GirtData {
  const d = templGirt();
  const none = { support: '<なし>', connect: '<なし>', corner: '<なし>', filler: '', endPart: '<なし>', reinforce: '<なし>' };
  return { ...d, members: d.members.map((m) => ({ ...m, v: { ...m.v, ...none } })), pieces: [], parts: [], support: { ...d.support, on: false }, pcs: [] };
}
function templGirt(): GirtData {
  const R = <T extends { id: string; name: string; v: Record<string, FieldVal> }>(name: string, v: Record<string, FieldVal>) => ({ id: uid('gm'), name, v }) as T;
  const c = { mat: '5-C形鋼', grade: '4-SSC400', stdLen: 12, endPart: '<なし>', reinforce: '<なし>', support: 'S1', connect: 'N2' };
  const pl = { gen: '1-符号管理', mat: '1-プレート', size: 6, grade: '1-SS400', autoSize: '2-する', webConn: '2-ボルト接続', boltPos: 0, plLen: 0, plShape: 'ﾌｰﾊﾟﾀｰﾝ7', plRise: 0, scKind: '1-ﾊﾟﾗﾒｰﾀｰ', scR: 0, rise: 0, boxStyle: '1-フィラーなし', lipStyle: '2-フィラーあり', boltType: '4-BTN', boltDia: 12, rows: 1, edgeV: 30, edgeL: 20, edgeR: 20, flgConn: '3-溶接接続', weld: 0, backRib: '<なし>' };
  const op = (name: string, kind: string, h: number, w: number, extra: Record<string, FieldVal> = {}) =>
    R<GirtOpenM>(name, { kind, h, w, thru: '2-横通し', mount: '1-開口', jOpen: '1-親側がボルト', jThru: '1-親側がボルト', note: '4-×+○+名称', mTop: 'D1', mBot: 'D1', mLeft: 'D1', mRight: 'D1', gap: 0, ...extra });
  return {
    members: [
      R('D1', { ...c, size: '100x50x20x2.3', combo: '1-[', piecePos: '1-背', corner: 'L60' }),
      R('D2', { ...c, size: '100x50x20x3.2', combo: '2-][', comboGap: 8, filler: 'F5', piecePos: '3-中心', corner: 'N3' }),
      R('D3', { ...c, size: '100x50x20x2.3', combo: '3-[]', piecePos: '1-背', corner: 'L60' }),
      R('KP', { mat: '15-コラム', size: '100x100x2.3', grade: '60-STKR400', stdLen: 12, combo: '1-[', piecePos: '4-両側', endPart: '盲PL', reinforce: '<なし>', support: 'S1', connect: 'N2', corner: 'N3' }),
    ],
    pieces: [
      R('S1', { ...pl, type: '1-支持ピース', len: 90, lipFiller: 'F6', cols: 2, pitch: 50 }),
      R('N2', { ...pl, type: '2-接続ピース', len: 190, gap: 10, rib: '<なし>', lipFillerL: 'F6', lipFillerR: 'F6', colsL: 2, colsR: 2, pitchL: 50, pitchR: 50, endL: 20, endR: 20 }),
      R('L60', { gen: '1-符号管理', type: '3-コーナーピース', mat: '4-L形鋼', size: '60x60x5', len: 80, grade: '1-SS400', gap: 10, autoSize: '1-しない', webConn: '2-ボルト接続', boxStyle: '1-フィラーなし', lipStyle: '2-フィラーあり', lipFiller: 'F6', boltType: '4-BTN', boltDia: 12, rows: 1, cols: 1, edgeL: 25, edgeR: 25, hole1: 0, flgConn: '3-溶接接続', weld: 0 }),
      R('N3', { ...pl, type: '3-コーナーピース', len: 80, gap: 10, angle: '1-許可しない', plFit: '1-ﾌﾗﾝｼﾞ端部に合わす', plOff: 0, plLimit: '1-ﾊﾟﾗﾒｰﾀｰ', plRiseKind: '1-親部材から', lipFiller: 'F6', cols: 1, edgeL: 35, edgeR: 25, hole1: 0 }),
    ],
    opens: [
      op('AW-1', '1-サッシ', 1245, 1800),
      op('AW-2', '1-サッシ', 1800, 3200, { mTop: 'D3', mBot: 'D3' }),
      op('AW-3', '1-サッシ', 600, 900),
      op('AD-1', '1-サッシ', 1850, 990),
      op('SS-1', '2-シャッター', 2750, 3000, { shW: 500, shBase: '1-中心', topDir: '2-下', botDir: '1-上' }),
    ],
    parts: [
      R('F5', { kind: '1-フィラー板', fillerType: '3-フィラー(ボルト)', mat: '1-プレート', size: 6, grade: '1-SS400', boltType: '4-BTN', boltDia: 12, rows: 1, cols: 1, eTop: 40, eBot: 40, eSide: 40, tmpl: '1-出力しない' }),
      R('盲PL', { kind: '13-塞ぎ部材 外', auto: '2-自動設定', mat: '1-プレート', size: 16, plW: 50, grade: '1-SS400' }),
      R('F6', { kind: '9-腹側フィラー', pos: '1-内側', mat: '1-プレート', size: 6, w: 40, l: 80, off: 0, tmpl: '1-出力しない' }),
    ],
    planes: [],
    items: [],
    openings: [],
    support: { on: true, piece: 'マスター参照', pos: '1-マスター参照', align: '1-中心' },
  };
}

const EMPTY: GirtData = { members: [], pieces: [], opens: [], parts: [], planes: [], items: [], openings: [], support: { on: true, piece: 'マスター参照', pos: '1-マスター参照', align: '1-中心' } };
export const girtOf = (p: Project): GirtData => p.girt ?? EMPTY;
export function ensureGirt(d: Project): GirtData {
  if (!d.girt) d.girt = defaultGirt();
  return d.girt;
}

// ---------- hình học 配置面 ----------
export interface PlaneGeo {
  pl: GirtPlane;
  /** gốc (đã cộng オフセット) */
  O: P2;
  /** hướng nhìn (矢印) */
  n: P2;
  /** hướng phải màn hình khi nhìn theo n */
  r: P2;
  s0: number;
  s1: number;
  /** điểm mặt bằng tại s */
  at: (s: number) => P2;
  /** toạ độ s của điểm mặt bằng */
  sOf: (q: P2) => number;
  dist: (q: P2) => number;
}
export function planeGeo(p: Project, pl: GirtPlane): PlaneGeo | null {
  const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
  const xs = [...gx.values()], ys = [...gy.values()];
  const x0 = Math.min(...xs), xN = Math.max(...xs), y0 = Math.min(...ys), yN = Math.max(...ys);
  let a: P2 | undefined, b: P2 | undefined;
  if (pl.ref.startsWith('gx:')) { const x = gx.get(pl.ref.slice(3)); if (x !== undefined) { a = [x, y0]; b = [x, yN]; } }
  else if (pl.ref.startsWith('gy:')) { const y = gy.get(pl.ref.slice(3)); if (y !== undefined) { a = [x0, y]; b = [xN, y]; } }
  else if (pl.p1 && pl.p2) {
    const q1: P2 = [gx.get(pl.p1[0]) ?? NaN, gy.get(pl.p1[1]) ?? NaN], q2: P2 = [gx.get(pl.p2[0]) ?? NaN, gy.get(pl.p2[1]) ?? NaN];
    if ([...q1, ...q2].every(isFinite)) { a = q1; b = q2; }
  }
  if (!a || !b) return null;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (L < 1) return null;
  const u: P2 = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const n: P2 = pl.arrow > 0 ? [-u[1], u[0]] : [u[1], -u[0]];
  const O: P2 = [a[0] + n[0] * pl.offset, a[1] + n[1] * pl.offset];
  const r: P2 = [n[1], -n[0]];
  const sOf = (q: P2) => (q[0] - O[0]) * r[0] + (q[1] - O[1]) * r[1];
  const sa = sOf(a), sb = sOf(b);
  return { pl, O, n, r, s0: Math.min(sa, sb), s1: Math.max(sa, sb), at: (s) => [O[0] + r[0] * s, O[1] + r[1] * s], sOf, dist: (q) => (q[0] - O[0]) * n[0] + (q[1] - O[1]) * n[1] };
}

/** Giao của đường thẳng (mặt bằng) với 配置面 → s */
function crossS(g: PlaneGeo, a: P2, b: P2): number | null {
  const e: P2 = [b[0] - a[0], b[1] - a[1]];
  const den = g.r[0] * e[1] - g.r[1] * e[0];
  if (Math.abs(den) < 1e-6) return null;
  const w: P2 = [a[0] - g.O[0], a[1] - g.O[1]];
  return (w[0] * e[1] - w[1] * e[0]) / den;
}

// ---------- đường tham chiếu trên mặt đứng ----------
export interface VRef { key: string; label: string; s: number; half: number }
export interface HRef { key: string; label: string; z: (s: number) => number; half: number; s0?: number; s1?: number }

export const memSec = (gd: GirtData, name: string) => {
  const m = gd.members.find((x) => x.name === name);
  return m ? memberSection(m) : undefined;
};

export function girtLine(it: GirtItem): { a: P2; b: P2 } {
  // kéo dài / cắt theo 延長量 dọc trục
  const dx = it.b[0] - it.a[0], dz = it.b[1] - it.a[1], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L;
  return { a: [it.a[0] - ux * it.extA, it.a[1] - uz * it.extA], b: [it.b[0] + ux * it.extB, it.b[1] + uz * it.extB] };
}
export const isVertical = (it: GirtItem) => Math.abs(it.b[0] - it.a[0]) < 1;

/** Các đường đứng (s) cắt 配置面: 通り, 配置面 khác, 縦胴縁 */
export function vRefs(p: Project, g: PlaneGeo): VRef[] {
  const gd = girtOf(p);
  const out: VRef[] = [];
  const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
  const ys = [...gy.values()], xs = [...gx.values()];
  for (const x of p.gridsX) { const v = gx.get(x.id)!; const s = crossS(g, [v, Math.min(...ys)], [v, Math.max(...ys)]); if (s !== null) out.push({ key: `gx:${x.id}`, label: `${x.name} 通り`, s, half: 0 }); }
  for (const y of p.gridsY) { const v = gy.get(y.id)!; const s = crossS(g, [Math.min(...xs), v], [Math.max(...xs), v]); if (s !== null) out.push({ key: `gy:${y.id}`, label: `${y.name} 通り`, s, half: 0 }); }
  for (const o of gd.planes) {
    if (o.id === g.pl.id) continue;
    const og = planeGeo(p, o);
    if (!og) continue;
    const s = crossS(g, og.at(og.s0), og.at(og.s1));
    if (s !== null) out.push({ key: `pl:${o.id}`, label: `配置面 ${o.name}`, s, half: 0 });
  }
  for (const it of gd.items) {
    if (it.plane !== g.pl.id || !isVertical(it)) continue;
    const sc = memSec(gd, it.member);
    out.push({ key: `g:${it.id}`, label: `縦胴縁 ${it.member} @${Math.round(it.a[0])}`, s: it.a[0], half: (sc?.b ?? 50) / 2 });
  }
  return out;
}

/** Các đường ngang (z theo s): 階高, 大梁 (天端), 横 / 登り胴縁 */
export function hRefs(p: Project, g: PlaneGeo, members: Member[]): HRef[] {
  const gd = girtOf(p);
  const out: HRef[] = [];
  for (const l of [...p.levels].sort((a, b) => a.elevation - b.elevation)) out.push({ key: `lv:${l.id}`, label: `${l.name} 階高`, z: () => l.elevation, half: 0 });
  // 大梁 nằm trong 配置面 (± 600)
  const bySrc = new Map<string, Member[]>();
  for (const m of members) if (m.kind === 'beam' && m.source && Math.abs(g.dist([m.a[0], m.a[1]])) < 600 && Math.abs(g.dist([m.b[0], m.b[1]])) < 600) bySrc.set(m.source, [...(bySrc.get(m.source) ?? []), m]);
  for (const [src, ms] of bySrc) {
    const pts = ms.flatMap((m) => [m.a, m.b]).map((q) => ({ s: g.sOf([q[0], q[1]]), z: q[2] })).sort((a, b) => a.s - b.s);
    const A = pts[0], B = pts[pts.length - 1];
    if (B.s - A.s < 100) continue;
    const h2 = (ms[0].section.h ?? 300) / 2;
    const zf = (s: number) => A.z + ((B.z - A.z) * (s - A.s)) / (B.s - A.s) + h2;
    out.push({ key: `bm:${src}`, label: `梁 ${ms[0].name ?? ms[0].mark} 梁天 ${p.levels.find((l) => l.id === p.beams.find((b) => b.id === src)?.level)?.name ?? ''} (${Math.round(A.s)}→${Math.round(B.s)})`, z: zf, half: 0, s0: A.s, s1: B.s });
  }
  for (const it of gd.items) {
    if (it.plane !== g.pl.id || isVertical(it)) continue;
    const sc = memSec(gd, it.member);
    const { a, b } = it;
    const zf = (s: number) => a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0] || 1);
    out.push({ key: `g:${it.id}`, label: `${Math.abs(b[1] - a[1]) > 1 ? '登り' : '横'}胴縁 ${it.member} @${Math.round(a[1])}`, z: zf, half: (sc?.b ?? 50) / 2, s0: a[0], s1: b[0] });
  }
  return out;
}

// ---------- tạo 胴縁 từ form ----------
export interface GirtDraft {
  mode: 'v' | 'h' | 'pat' | 'open' | 'copy';
  member: string;
  dir: (typeof GIRT_DIRS)[number];
  cornerA: string;
  cornerB: string;
  endA: string;
  endB: string;
  extA: number;
  extB: number;
  depth: number;
  // 縦胴縁
  vRef: string;
  vOff: number;
  /** nhiều vị trí: '600 2400' hoặc '3*1500' (cộng dồn) */
  vList?: string;
  lo: string;
  hi: string;
  // 横胴縁
  left: string;
  right: string;
  hBase: string;
  hGap: number;
  hSide: 1 | -1;
  hCount: number;
  hPitch: number;
  /** danh sách khoảng cách từ 基準 (thay cho 本数 / 間隔) */
  hList?: string;
  cut: boolean;
  // パターン
  patDir: 'h' | 'v';
  patList: string;
  // 開口
  open: string;
  oS: string;
  oZ: string;
  dx: number;
  dy: number;
  oTop: boolean;
  oBot: boolean;
  oLeft: boolean;
  oRight: boolean;
  // 複写
  copyTo: string;
  copyMirror: boolean;
  copyNoOpen: boolean;
}
export const initialGirtDraft = (): GirtDraft => ({
  mode: 'v', member: 'KP', dir: '1-(上/左)ﾊﾟﾗﾒｰﾀｰ参照', cornerA: 'マスター参照', cornerB: 'マスター参照', endA: 'マスター参照', endB: 'マスター参照', extA: 0, extB: 0, depth: 0,
  vRef: '', vOff: 0, lo: '', hi: '', left: '', right: '', hBase: '', hGap: 50, hSide: 1, hCount: 1, hPitch: 1000, cut: true,
  patDir: 'h', patList: '1500 1500 1500', open: 'AW-1', oS: '', oZ: '', dx: 650, dy: 700, oTop: true, oBot: true, oLeft: false, oRight: false,
  copyTo: '', copyMirror: true, copyNoOpen: false,
});

function parseList(s: string, span: number): number[] {
  const t = s.trim();
  const eq = t.match(/^=\s*(\d+)$/);
  if (eq) { const n = Math.max(1, +eq[1]); return Array.from({ length: n - 1 }, () => span / n); }
  const out: number[] = [];
  for (const tok of t.split(/[\s,]+/)) {
    const m = tok.match(/^(\d+)\*([\d.]+)$/);
    if (m) for (let i = 0; i < +m[1]; i++) out.push(+m[2]);
    else if (+tok > 0) out.push(+tok);
  }
  return out;
}

/** Danh sách 胴縁 (chưa có id) sẽ tạo theo form */
export function draftItems(p: Project, g: PlaneGeo, members: Member[], d: GirtDraft): Omit<GirtItem, 'id'>[] {
  const gd = girtOf(p);
  const sec = memSec(gd, d.member);
  if (!sec) return [];
  const half = sec.b / 2;
  const V = vRefs(p, g), H = hRefs(p, g, members);
  const vr = (k: string) => V.find((x) => x.key === k);
  const hr = (k: string) => H.find((x) => x.key === k);
  const base = { plane: g.pl.id, member: d.member, dir: d.dir, extA: d.extA, extB: d.extB, cornerA: d.cornerA, cornerB: d.cornerB, endA: d.endA, endB: d.endB, depth: d.depth };
  if (d.mode === 'v') {
    const R = vr(d.vRef), lo = hr(d.lo), hi = hr(d.hi);
    if (!R || !lo || !hi) return [];
    const offs = d.vList?.trim() ? parseDs(d.vList, false) : [d.vOff];
    const out: Omit<GirtItem, 'id'>[] = [];
    for (const o of offs) {
      const s = R.s + o;
      let z0 = lo.z(s) + lo.half, z1 = hi.z(s) - hi.half;
      if (z0 > z1) [z0, z1] = [hi.z(s) + hi.half, lo.z(s) - lo.half];
      if (z1 - z0 > 10) out.push({ ...base, a: [s, z0], b: [s, z1] });
    }
    return out;
  }
  if (d.mode === 'h') {
    const L = vr(d.left), Rr = vr(d.right), B = hr(d.hBase);
    if (!L || !Rr || !B) return [];
    let sa = L.s, sb = Rr.s, ha = L.half, hb = Rr.half;
    if (sa > sb) { [sa, sb] = [sb, sa]; [ha, hb] = [hb, ha]; }
    sa += ha; sb -= hb;
    if (sb - sa < 10) return [];
    const out: Omit<GirtItem, 'id'>[] = [];
    const ds = d.hList?.trim() ? parseDs(d.hList, false) : Array.from({ length: Math.max(1, Math.min(40, d.hCount)) }, (_, i) => d.hGap + i * d.hPitch);
    for (const dd of ds.slice(0, 60)) {
      const off = d.hSide * (B.half + half + dd);
      out.push({ ...base, a: [sa, B.z(sa) + off], b: [sb, B.z(sb) + off], cut: d.cut });
    }
    return out;
  }
  if (d.mode === 'pat') {
    const L = vr(d.left), Rr = vr(d.right), lo = hr(d.lo), hi = hr(d.hi);
    if (!L || !Rr || !lo || !hi) return [];
    let sa = L.s, sb = Rr.s, ha = L.half, hb = Rr.half;
    if (sa > sb) { [sa, sb] = [sb, sa]; [ha, hb] = [hb, ha]; }
    sa += ha; sb -= hb;
    const out: Omit<GirtItem, 'id'>[] = [];
    if (d.patDir === 'h') {
      // vị trí tính từ mép trên của đường dưới, cộng dồn (tim 胴縁)
      const sm = (sa + sb) / 2;
      const zLo = lo.z(sm) + lo.half, zHi = hi.z(sm) - hi.half;
      let acc = 0;
      for (const step of parseList(d.patList, zHi - zLo)) {
        acc += step;
        if (acc >= zHi - zLo - half) break;
        out.push({ ...base, a: [sa, lo.z(sa) + lo.half + acc], b: [sb, lo.z(sb) + lo.half + acc], cut: d.cut });
      }
    } else {
      let acc = 0;
      for (const step of parseList(d.patList, sb - sa)) {
        acc += step;
        const s = sa + acc;
        if (s >= sb - half) break;
        const z0 = lo.z(s) + lo.half, z1 = hi.z(s) - hi.half;
        if (z1 - z0 > 10) out.push({ ...base, a: [s, z0], b: [s, z1] });
      }
    }
    return out;
  }
  return [];
}

/** 開口 theo form */
export function draftOpen(p: Project, g: PlaneGeo, members: Member[], d: GirtDraft): Omit<GirtOpen, 'id'> | null {
  const om = girtOf(p).opens.find((x) => x.name === d.open);
  const R = vRefs(p, g).find((x) => x.key === d.oS), B = hRefs(p, g, members).find((x) => x.key === d.oZ);
  if (!om || !R || !B) return null;
  const s = R.s + d.dx;
  return { plane: g.pl.id, name: om.name, s, z: B.z(s) + d.dy, top: d.oTop, bottom: d.oBot, left: d.oLeft, right: d.oRight };
}

/** 複写: chiếu theo vị trí thực sang 配置面 khác (反転複写) hoặc giữ nguyên toạ độ s */
export function copyPlane(p: Project, d: Project, fromId: string, toId: string, mirror: boolean, noOpen: boolean) {
  const gd = ensureGirt(d);
  const A = gd.planes.find((x) => x.id === fromId), B = gd.planes.find((x) => x.id === toId);
  const ga = A && planeGeo(p, A), gb = B && planeGeo(p, B);
  if (!ga || !gb) return 0;
  const map = (s: number) => (mirror ? gb.sOf(ga.at(s)) : s);
  let n = 0;
  for (const it of girtOf(p).items.filter((x) => x.plane === fromId)) {
    let a: P2 = [map(it.a[0]), it.a[1]], b: P2 = [map(it.b[0]), it.b[1]];
    let { extA, extB, cornerA, cornerB, endA, endB } = it;
    if (a[0] > b[0] + 0.5) { [a, b] = [b, a]; [extA, extB] = [extB, extA]; [cornerA, cornerB] = [cornerB, cornerA]; [endA, endB] = [endB, endA]; }
    gd.items.push({ ...it, id: uid('gt'), plane: toId, a, b, extA, extB, cornerA, cornerB, endA, endB });
    n++;
  }
  if (!noOpen) for (const o of girtOf(p).openings.filter((x) => x.plane === fromId)) {
    const w = Number(girtOf(p).opens.find((x) => x.name === o.name)?.v.w ?? 0);
    const s1 = map(o.s), s2 = map(o.s + w);
    gd.openings.push({ ...o, id: uid('go'), plane: toId, s: Math.min(s1, s2), left: s1 <= s2 ? o.left : o.right, right: s1 <= s2 ? o.right : o.left });
  }
  return n;
}

// ---------- sinh cấu kiện ----------
interface Seg { a: P2; b: P2; it: GirtItem; sec: Section; mem: MoyaMember; endA: boolean; endB: boolean }

/** Kích thước 開口 (mm) */
export function openRect(gd: GirtData, o: GirtOpen) {
  const m = gd.opens.find((x) => x.name === o.name);
  const w = Number(m?.v.w ?? 0), h = Number(m?.v.h ?? 0), gap = Number(m?.v.gap ?? 0);
  return { s0: o.s - gap, s1: o.s + w + gap, z0: o.z - gap, z1: o.z + h + gap, w, h, m };
}

/** Các đoạn 胴縁 sau khi cắt tại 縦胴縁 (干渉) và 開口, cộng khung 開口 */
export function girtSegs(p: Project): Seg[] {
  const gd = girtOf(p);
  const out: Seg[] = [];
  for (const pl of gd.planes) {
    const items = gd.items.filter((x) => x.plane === pl.id);
    const opens = gd.openings.filter((x) => x.plane === pl.id).map((o) => ({ o, ...openRect(gd, o) }));
    const verts = items.filter(isVertical);
    const segsOf = (it: GirtItem): Seg[] => {
      const mem = gd.members.find((m) => m.name === it.member);
      if (!mem) return [];
      const sec = memberSection(mem);
      const { a, b } = girtLine(it);
      let parts: [P2, P2, boolean, boolean][] = [[a, b, true, true]];
      const vert = isVertical(it);
      const zAt = (s: number) => a[1] + ((b[1] - a[1]) * (s - a[0])) / (b[0] - a[0] || 1);
      const cutS = (s0: number, s1: number) => {
        const next: typeof parts = [];
        for (const [A, B, eA, eB] of parts) {
          if (s1 <= A[0] || s0 >= B[0]) { next.push([A, B, eA, eB]); continue; }
          if (s0 - A[0] > 20) next.push([A, [s0, zAt(s0)], eA, true]);
          if (B[0] - s1 > 20) next.push([[s1, zAt(s1)], B, true, eB]);
        }
        parts = next;
      };
      const cutZ = (z0: number, z1: number) => {
        const next: typeof parts = [];
        for (const [A, B, eA, eB] of parts) {
          if (z1 <= A[1] || z0 >= B[1]) { next.push([A, B, eA, eB]); continue; }
          if (z0 - A[1] > 20) next.push([A, [A[0], z0], eA, true]);
          if (B[1] - z1 > 20) next.push([[A[0], z1], B, true, eB]);
        }
        parts = next;
      };
      if (!vert && it.cut !== false) {
        for (const v of verts) {
          const vs = v.a[0], vz0 = Math.min(v.a[1], v.b[1]), vz1 = Math.max(v.a[1], v.b[1]);
          const z = zAt(vs);
          if (vs <= a[0] + 30 || vs >= b[0] - 30 || z < vz0 || z > vz1) continue;
          const hb = (memSec(gd, v.member)?.b ?? 50) / 2;
          cutS(vs - hb, vs + hb);
        }
      }
      for (const r of opens) {
        if (vert) { if (a[0] > r.s0 && a[0] < r.s1) cutZ(r.z0 - (r.o.bottom ? sec.b : 0), r.z1 + (r.o.top ? sec.b : 0)); }
        else {
          const zm = zAt((r.s0 + r.s1) / 2);
          if (zm > r.z0 - sec.b / 2 && zm < r.z1 + sec.b / 2) cutS(r.s0 - (r.o.left ? sec.b : 0), r.s1 + (r.o.right ? sec.b : 0));
        }
      }
      // 定尺長さ: 横胴縁 dài hơn định chiều → chia tại cột xa nhất còn trong 定尺 (khe nối 5 mm)
      if (!vert) {
        const std = (Number(mem.v.stdLen) || 0) * 1000;
        const geo = planeGeo(p, pl);
        if (std > 0 && geo) {
          const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
          const colS = p.columns.map((c) => { const q: [number, number] | null = c.pt ? [c.pt[0], c.pt[1]] : gx.has(c.x) && gy.has(c.y) ? [gx.get(c.x)!, gy.get(c.y)!] : null; return q && Math.abs(geo.dist(q)) < 1500 ? geo.sOf(q) : null; }).filter((v): v is number => v !== null).sort((x, y) => x - y);
          const next: typeof parts = [];
          for (const [A, B, eA, eB] of parts) {
            let s0 = A[0], e0 = eA;
            while (B[0] - s0 > std) {
              const cand = colS.filter((c) => c > s0 + 100 && c - s0 <= std);
              const c = cand.length ? cand[cand.length - 1] : s0 + std;
              next.push([[s0, zAt(s0)], [c - 2.5, zAt(c - 2.5)], e0, true]);
              s0 = c + 2.5; e0 = true;
            }
            next.push([[s0, zAt(s0)], B, e0, eB]);
          }
          parts = next;
        }
      }
      return parts.map(([A, B, eA, eB]) => ({ a: A, b: B, it, sec, mem, endA: eA, endB: eB }));
    };
    for (const it of items) out.push(...segsOf(it));
    // khung 開口
    for (const r of opens) {
      const mk = (name: FieldVal, a: P2, b: P2) => {
        const mem = gd.members.find((m) => m.name === String(name));
        if (!mem) return;
        const sec = memberSection(mem);
        const it: GirtItem = { id: `open_${r.o.id}`, plane: pl.id, member: mem.name, dir: GIRT_DIRS[0], a, b, extA: 0, extB: 0, cornerA: 'マスター参照', cornerB: 'マスター参照', endA: '<無>', endB: '<無>', depth: 0 };
        out.push({ a, b, it, sec, mem, endA: true, endB: true });
      };
      const bT = memSec(gd, String(r.m?.v.mTop))?.b ?? 50, bB = memSec(gd, String(r.m?.v.mBot))?.b ?? 50;
      const bL = memSec(gd, String(r.m?.v.mLeft))?.b ?? 50, bR = memSec(gd, String(r.m?.v.mRight))?.b ?? 50;
      const sl = r.s0 - (r.o.left ? bL : 0), sr = r.s1 + (r.o.right ? bR : 0);
      if (r.o.top) mk(r.m?.v.mTop ?? '', [sl, r.z1 + bT / 2], [sr, r.z1 + bT / 2]);
      if (r.o.bottom) mk(r.m?.v.mBot ?? '', [sl, r.z0 - bB / 2], [sr, r.z0 - bB / 2]);
      if (r.o.left) mk(r.m?.v.mLeft ?? '', [r.s0 - bL / 2, r.z0], [r.s0 - bL / 2, r.z1]);
      if (r.o.right) mk(r.m?.v.mRight ?? '', [r.s1 + bR / 2, r.z0], [r.s1 + bR / 2, r.z1]);
    }
  }
  return out;
}

const NONE = new Set(['<無>', '<なし>', '']);
export function girtMembers(p: Project, all: Member[]): Member[] {
  const gd = girtOf(p);
  const out: Member[] = [];
  const push = (sec: Section, a: Vec3, b: Vec3, up: Vec3, name: string, source: string, part?: 'piece') => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L < 1) return;
    out.push({ id: `girt${out.length}_${source}`, kind: 'girt', section: sec, a, b, up, name, mark: name, length: Math.round(L), weight: (kgPerM(sec) * L) / 1000, source, part } as Member);
  };
  const geo = new Map(gd.planes.map((pl) => [pl.id, planeGeo(p, pl)]));
  const cols = all.filter((m) => m.kind === 'column');
  const piece = (n: string) => gd.pieces.find((x) => x.name === n);
  const part = (n: string) => gd.parts.find((x) => x.name === n);
  for (const sg of girtSegs(p)) {
    const g = geo.get(sg.it.plane);
    if (!g) continue;
    const { sec, it, mem } = sg;
    const vert = Math.abs(sg.b[0] - sg.a[0]) < 1;
    const dep = it.depth;
    const W = (q: P2, dn = 0): Vec3 => { const pt = g.at(q[0]); return [pt[0] + g.n[0] * (dep + dn), pt[1] + g.n[1] * (dep + dn), q[1]]; };
    // 部材向き: bụng ⟂ mặt tường (h theo n), リップ mở lên (横) / sang trái (縦)
    const up: Vec3 = [g.n[0], g.n[1], 0];
    const A = W(sg.a), B = W(sg.b);
    const ax: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const xl: Vec3 = [up[1] * ax[2] - up[2] * ax[1], up[2] * ax[0] - up[0] * ax[2], up[0] * ax[1] - up[1] * ax[0]];
    const want: Vec3 = vert ? [-g.r[0], -g.r[1], 0] : [0, 0, 1];
    const flipW = it.dir.startsWith('2') ? -1 : 1;
    const ok = (xl[0] * want[0] + xl[1] * want[1] + xl[2] * want[2]) * flipW >= 0;
    const combo = String(mem.v.combo);
    if (sec.type === 'C' && (combo.startsWith('2') || combo.startsWith('3'))) {
      // ][ / []: 2 thanh đối lưng (][) hoặc đối リップ ([])
      const cg = Number(mem.v.comboGap) || 0;
      const off = (sec.b + cg) / 2;
      const dirV: P2 = vert ? [1, 0] : [0, 1];
      for (const sgn of [-1, 1]) {
        const sh = (q: P2): P2 => [q[0] + dirV[0] * sgn * off, q[1] + dirV[1] * sgn * off];
        const a2 = W(sh(sg.a)), b2 = W(sh(sg.b));
        const facing = combo.startsWith('2') ? sgn > 0 : sgn < 0;
        push(sec, facing === ok ? a2 : b2, facing === ok ? b2 : a2, up, mem.name, it.id);
      }
    } else push(sec, ok ? A : B, ok ? B : A, up, mem.name, it.id);
    // ---- コーナーピース / 端部材部品 ----
    const L = Math.hypot(sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]) || 1;
    const u: P2 = [(sg.b[0] - sg.a[0]) / L, (sg.b[1] - sg.a[1]) / L];
    const ends: [P2, string, string, boolean, number][] = [[sg.a, it.cornerA, it.endA, sg.endA, 1], [sg.b, it.cornerB, it.endB, sg.endB, -1]];
    for (const [q, cn, en, isEnd, sgn] of ends) {
      if (!isEnd) continue;
      const cName = cn === 'マスター参照' ? String(mem.v.corner ?? '') : cn;
      const pc = NONE.has(cName) ? undefined : piece(cName);
      if (pc) {
        const ps = pieceSection(pc, sec.h);
        const len = Number(pc.v.len) || 80;
        const c = W([q[0] + u[0] * sgn * (len / 2 - 10), q[1] + u[1] * sgn * (len / 2 - 10)], -(sec.h / 2 + ps.b / 2));
        const d: Vec3 = vert ? [0, 0, len / 2] : [g.r[0] * len / 2, g.r[1] * len / 2, 0];
        push(ps, [c[0] - d[0], c[1] - d[1], c[2] - d[2]], [c[0] + d[0], c[1] + d[1], c[2] + d[2]], [g.n[0], g.n[1], 0], pc.name, it.id, 'piece');
      }
      const eName = en === 'マスター参照' ? String(mem.v.endPart ?? '') : en;
      const pt = NONE.has(eName) ? undefined : part(eName);
      if (pt && sec.type === 'Box') {
        const t = Number(pt.v.size) || 16;
        const c = W(q);
        const d: Vec3 = vert ? [0, 0, (t / 2) * sgn] : [g.r[0] * (t / 2) * sgn, g.r[1] * (t / 2) * sgn, 0];
        const capSec: Section = { id: `part:${pt.name}`, code: `PL-${t}x${sec.b}`, type: 'Box', h: sec.h, b: sec.b, tw: Math.min(sec.b, sec.h) / 2, tf: Math.min(sec.b, sec.h) / 2, c: 0, material: 'SS400' };
        push(capSec, c, [c[0] + d[0] * 2, c[1] + d[1] * 2, c[2] + d[2] * 2], up, pt.name, it.id, 'piece');
      }
    }
    // ---- 支持ピース tại cột trong 配置面 (横胴縁) ----
    if (!gd.support.on || vert) continue;
    const spName = gd.support.piece === 'マスター参照' ? String(mem.v.support ?? '') : gd.support.piece;
    const sp = piece(spName);
    if (!sp) continue;
    for (const c of cols) {
      const q: P2 = [c.a[0], c.a[1]];
      if (Math.abs(g.dist(q)) > 1500) continue;
      const s = g.sOf(q);
      if (s <= sg.a[0] + 20 || s >= sg.b[0] - 20) continue;
      const z = sg.a[1] + ((sg.b[1] - sg.a[1]) * (s - sg.a[0])) / (sg.b[0] - sg.a[0]);
      if (z < Math.min(c.a[2], c.b[2]) || z > Math.max(c.a[2], c.b[2])) continue;
      const len = Number(sp.v.len) || 90;
      // tấm đứng từ 胴縁 về phía cột (ngược 矢印)
      const dc = g.dist(q) - dep;
      const ps = pieceSection(sp, Math.max(60, Math.abs(dc) - c.section.b / 2));
      const mid = W([s, z], dc / 2 - (Math.sign(dc) || 1) * sec.h / 4);
      push(ps, [mid[0] - g.r[0] * len / 2, mid[1] - g.r[1] * len / 2, mid[2]], [mid[0] + g.r[0] * len / 2, mid[1] + g.r[1] * len / 2, mid[2]], [0, 0, 1], sp.name, it.id, 'piece');
    }
  }
  return out;
}

export function newPlaneName(p: Project, base: string): string {
  const names = new Set(girtOf(p).planes.map((x) => x.name));
  if (!names.has(base)) return base;
  for (const suf of 'abcdefghij') if (!names.has(base + suf)) return base + suf;
  return base + '_' + names.size;
}
