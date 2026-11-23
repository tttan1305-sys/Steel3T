// 母屋 (xà gồ mái) theo quy trình: 母屋マスター (部材 / ピース / 部品) → 母屋配置面 (勾配変換) → 母屋 入力 → 支持ピース
import { Member, Project, Section, Vec3, kgPerM, uid } from './model';
import type { SlopeFace } from './model';
import { JIS_SECTIONS } from './jis';
/** 材質 theo nhóm thư viện (giữ dạng số-tên) */
export const gradesOf = (cats: string[]): string[] => { const out = new Set<string>(); for (const c of JIS_SECTIONS) if (cats.includes(c.id)) for (const m of c.materials) out.add(m); return [...out]; };
import { faceGeo, faceZ, FaceGeo } from './slopeFace';

export type FieldVal = string | number;
/** 1 dòng 項目名 / 設定値 */
export interface FieldSpec {
  k: string; label: string; t: 'num' | 'text' | 'sel' | 'jis' | 'ref';
  opts?: string[];
  /** danh sách lựa chọn phụ thuộc giá trị khác (vd 材質 theo 材種) */
  optsFn?: (v: Record<string, FieldVal>) => string[];
  /** t = 'jis': nhóm thư viện JIS theo giá trị hiện tại */
  cats?: (v: Record<string, FieldVal>) => string[];
  when?: (v: Record<string, FieldVal>) => boolean; hint?: string;
  /** t = 'ref': chọn tên bản ghi trong tab master khác (vd tab ピース), lọc theo v.type bắt đầu bằng type */
  ref?: { tab: string; label: string; type?: string; none?: string };
}
/** 材種 → nhóm thư viện JIS */
export const MAT_CATS: Record<string, string[]> = {
  'C形鋼': ['lip-c'], '溝形鋼': ['channel', 'light-ch'], '角形鋼管': ['box-stkr'], 'コラム': ['box-bcr', 'box-bcp'],
  'H形鋼': ['h-narrow', 'h-mid', 'h-wide'], 'L形鋼': ['angle', 'angle-u'], '鋼管': ['pipe'],
};
export const matCats = (v: Record<string, FieldVal>): string[] => { const m = String(v.mat ?? ''); for (const k of Object.keys(MAT_CATS)) if (m.includes(k)) return MAT_CATS[k]; return []; };
/** giá trị サイズ lưu dạng số (H×B×C×t …) từ tiết diện thư viện */
export function sizeOf(spec: { type: string; h: number; b: number; tw: number; tf: number; c: number }): string {
  const { type, h, b, tw, tf, c } = spec;
  if (type === 'C') return c ? `${h}x${b}x${c}x${tw}` : `${h}x${b}x0x${tw}`;
  if (type === 'Box') return `${h}x${b}x${tw}`;
  if (type === 'I') return `${h}x${b}x${tw}x${tf}`;
  if (type === 'L') return `${h}x${b}x${tw}`;
  if (type === 'Pipe') return `${h}x${tw}`;
  return `${h}`;
}

// ---------- 部材マスター ----------
export interface MoyaMember {
  id: string;
  name: string;
  v: Record<string, FieldVal>;
}
export const MEMBER_FIELDS: FieldSpec[] = [
  { k: 'mat', label: '材種', t: 'sel', opts: ['5-C形鋼', '2-溝形鋼', '6-角形鋼管', '15-コラム', '7-H形鋼'] },
  { k: 'size', label: 'サイズ', t: 'jis', cats: matCats },
  { k: 'grade', label: '材質', t: 'sel', opts: ['4-SSC400', '60-STKR400', '1-SS400', '2-SN400B', '3-SN490B'], optsFn: (v) => gradesOf(matCats(v)) },
  { k: 'stdLen', label: '定尺長さ(m)', t: 'num' },
  { k: 'combo', label: '鋼材組み合わせ', t: 'sel', opts: ['1-[', '2-][', '3-[]'] },
  { k: 'comboGap', label: '組鋼材すきま', t: 'num', when: (v) => String(v.combo) !== '1-[' },
  { k: 'filler', label: 'フィラー', t: 'text', when: (v) => String(v.combo) !== '1-[' },
  { k: 'piecePos', label: 'ピース取付位置', t: 'sel', opts: ['1-背', '2-腹', '3-中心', '4-両側'] },
  { k: 'endPart', label: '端部部品', t: 'ref', ref: { tab: 'parts', label: '部品', none: '<なし>' } },
  { k: 'reinforce', label: '補強部品', t: 'ref', ref: { tab: 'parts', label: '部品', none: '<なし>' } },
  { k: 'support', label: '支持ピース', t: 'ref', ref: { tab: 'pieces', label: 'ピース', type: '1-', none: '<なし>' } },
  { k: 'connect', label: '接続ピース', t: 'ref', ref: { tab: 'pieces', label: 'ピース', type: '2-', none: '<なし>' } },
  { k: 'corner', label: 'コーナーピース', t: 'ref', ref: { tab: 'pieces', label: 'ピース', type: '3-', none: '<なし>' } },
];

// ---------- ピースマスター ----------
export interface MoyaPiece { id: string; name: string; v: Record<string, FieldVal> }
const isL = (v: Record<string, FieldVal>) => String(v.mat).includes('L形鋼');
const isPL = (v: Record<string, FieldVal>) => !isL(v);
const isCorner = (v: Record<string, FieldVal>) => String(v.type).includes('コーナー');
const isConn = (v: Record<string, FieldVal>) => String(v.type).includes('接続');
const boltWeb = (v: Record<string, FieldVal>) => String(v.webConn).includes('ボルト');
export const PIECE_FIELDS: FieldSpec[] = [
  { k: 'type', label: 'ピース種類', t: 'sel', opts: ['1-支持ピース', '2-接続ピース', '3-コーナーピース'] },
  { k: 'gen', label: '型紙・部品名生成方法', t: 'sel', opts: ['1-符号管理', '2-手入力'] },
  { k: 'mat', label: '材種', t: 'sel', opts: ['1-プレート', '4-L形鋼'] },
  { k: 'size', label: 'サイズ', t: 'jis', cats: (v) => (isL(v) ? ['angle', 'angle-u'] : ['plate']), hint: 'プレート: 板厚 t' },
  { k: 'len', label: '長さ', t: 'num' },
  { k: 'grade', label: '材質', t: 'sel', opts: ['1-SS400', '2-SN400B', '3-SS490'] },
  { k: 'gap', label: 'すきま', t: 'num', when: isPL },
  { k: 'autoSize', label: '自動サイズ調整', t: 'sel', opts: ['1-しない', '2-する'] },
  { k: 'angle', label: '角度ピース化許可', t: 'sel', opts: ['1-許可しない', '2-許可する'], when: isCorner },
  { k: 'rib', label: '補強リブ', t: 'text', when: (v) => !isCorner(v) },
  { k: 'webConn', label: '接続(ウェブ)', t: 'sel', opts: ['1-溶接接続', '2-ボルト接続'] },
  { k: 'boltPos', label: 'ボルト合わせ位置', t: 'num', when: (v) => boltWeb(v) && !isCorner(v) },
  { k: 'plLen', label: 'PL 接続長', t: 'num', when: isPL },
  { k: 'plShape', label: 'PL 形状', t: 'sel', opts: ['ﾌｰﾊﾟﾀｰﾝ1', 'ﾌｰﾊﾟﾀｰﾝ7'], when: isPL },
  { k: 'plFit', label: 'PL 合わせ位置', t: 'sel', opts: ['1-ﾌﾗﾝｼﾞ端部に合わす', '2-中心'], when: (v) => isPL(v) && isCorner(v) },
  { k: 'plOff', label: 'PL オフセット', t: 'num', when: (v) => isPL(v) && isCorner(v) },
  { k: 'plLimit', label: 'PL 処理制限', t: 'sel', opts: ['1-ﾊﾟﾗﾒｰﾀｰ'], when: (v) => isPL(v) && isCorner(v) },
  { k: 'plRiseKind', label: 'PL 斜めの立ち上がり種類', t: 'sel', opts: ['1-親部材から'], when: (v) => isPL(v) && isCorner(v) },
  { k: 'plRise', label: 'PL 斜めの立ち上がり', t: 'num', when: isPL },
  { k: 'scKind', label: 'スカラップ種類', t: 'sel', opts: ['1-ﾊﾟﾗﾒｰﾀｰ', '2-なし'], when: isPL },
  { k: 'scR', label: 'スカラップ径', t: 'num', when: isPL },
  { k: 'rise', label: '立ち上がり', t: 'num', when: isPL },
  { k: 'boxStyle', label: '□形鋼接続ｽﾀｲﾙ', t: 'sel', opts: ['1-フィラーなし', '2-フィラーあり'] },
  { k: 'lipStyle', label: 'C形鋼リップ側接続スタイル', t: 'sel', opts: ['1-フィラーなし', '2-フィラーあり'] },
  { k: 'lipFiller', label: 'リップフィラー', t: 'text', when: (v) => String(v.lipStyle).includes('あり') && !isConn(v) },
  { k: 'lipFillerL', label: 'リップフィラー(左)', t: 'text', when: (v) => String(v.lipStyle).includes('あり') && isConn(v) },
  { k: 'lipFillerR', label: 'リップフィラー(右)', t: 'text', when: (v) => String(v.lipStyle).includes('あり') && isConn(v) },
  { k: 'boltType', label: 'ボルト種類', t: 'sel', opts: ['1-HTB', '2-TCB', '4-BTN'], when: boltWeb },
  { k: 'boltThru', label: 'ボルト貫通', t: 'sel', opts: ['1-しない', '2-する'], when: (v) => boltWeb(v) && isPL(v) },
  { k: 'boltDia', label: 'ボルト径', t: 'num', when: boltWeb },
  { k: 'drill', label: 'ボルトキリ径', t: 'text', when: (v) => boltWeb(v) && isPL(v) },
  { k: 'slot', label: '長穴幅', t: 'num', when: (v) => boltWeb(v) && isPL(v) },
  { k: 'rows', label: 'ボルト数縦', t: 'num', when: boltWeb },
  { k: 'cols', label: 'ボルト数横', t: 'num', when: (v) => boltWeb(v) && !isConn(v) },
  { k: 'colsL', label: 'ボルト数横(左)', t: 'num', when: (v) => boltWeb(v) && isConn(v) },
  { k: 'colsR', label: 'ボルト数横(右)', t: 'num', when: (v) => boltWeb(v) && isConn(v) },
  { k: 'pitch', label: 'ボルト間距離横', t: 'num', when: (v) => boltWeb(v) && !isConn(v) },
  { k: 'pitchL', label: 'ボルト間距離横(左)', t: 'num', when: (v) => boltWeb(v) && isConn(v) },
  { k: 'pitchR', label: 'ボルト間距離横(右)', t: 'num', when: (v) => boltWeb(v) && isConn(v) },
  { k: 'endL', label: '左側胴縁の端部距離', t: 'num', when: (v) => boltWeb(v) && isConn(v) },
  { k: 'endR', label: '右側胴縁の端部距離', t: 'num', when: (v) => boltWeb(v) && isConn(v) },
  { k: 'edgeV', label: '端あき縦', t: 'num', when: boltWeb },
  { k: 'edgeL', label: '端あき横(左)', t: 'num', when: boltWeb },
  { k: 'edgeR', label: '端あき横(右)', t: 'num', when: boltWeb },
  { k: 'hole1', label: '第一穴位置', t: 'num', when: (v) => boltWeb(v) && isPL(v) },
  { k: 'flgConn', label: '接続(フランジ)', t: 'sel', opts: ['1-なし', '2-ボルト接続', '3-溶接接続'] },
  { k: 'weld', label: '溶接しろ', t: 'num' },
  { k: 'backRib', label: '裏リブ板厚', t: 'text', when: isPL },
];

// ---------- 部品マスター ----------
export interface MoyaPart { id: string; name: string; v: Record<string, FieldVal> }
const isFillerBolt = (v: Record<string, FieldVal>) => String(v.kind).includes('フィラー板');
export const PART_FIELDS: FieldSpec[] = [
  { k: 'kind', label: '部品種類', t: 'sel', opts: ['1-フィラー板', '9-腹側フィラー', '13-塞ぎ部材 外'] },
  { k: 'auto', label: '自動調整', t: 'sel', opts: ['1-しない', '2-自動設定'], when: (v) => String(v.kind).includes('塞ぎ') },
  { k: 'plW', label: 'プレート幅', t: 'num', when: (v) => String(v.kind).includes('塞ぎ') },
  { k: 'fillerType', label: 'フィラー種類', t: 'sel', opts: ['1-フィラー', '3-フィラー(ボルト)'], when: isFillerBolt },
  { k: 'pos', label: 'フィラー位置', t: 'sel', opts: ['1-内側', '2-外側'], when: (v) => String(v.kind).includes('腹側') },
  { k: 'mat', label: '材種', t: 'sel', opts: ['1-プレート'] },
  { k: 'size', label: 'サイズ', t: 'jis', cats: () => ['plate'], hint: 'プレート: 板厚 t' },
  { k: 'w', label: '板幅', t: 'num', when: (v) => String(v.kind).includes('腹側') },
  { k: 'l', label: '板長さ', t: 'num', when: (v) => String(v.kind).includes('腹側') },
  { k: 'off', label: '位置ずれ (0 = 中心)', t: 'num', when: (v) => String(v.kind).includes('腹側') },
  { k: 'grade', label: '材質', t: 'sel', opts: ['1-SS400'], when: (v) => !String(v.kind).includes('腹側') },
  { k: 'boltType', label: 'ボルト種類', t: 'sel', opts: ['1-HTB', '4-BTN'], when: isFillerBolt },
  { k: 'boltDia', label: 'ボルト径', t: 'num', when: isFillerBolt },
  { k: 'rows', label: 'ﾎﾞﾙﾄ本数(縦)', t: 'num', when: isFillerBolt },
  { k: 'cols', label: 'ﾎﾞﾙﾄ本数(横)', t: 'num', when: isFillerBolt },
  { k: 'pv', label: 'ﾎﾞﾙﾄ間距離(縦)', t: 'num', when: isFillerBolt },
  { k: 'ph', label: 'ﾎﾞﾙﾄ間距離(横)', t: 'num', when: isFillerBolt },
  { k: 'eTop', label: 'ﾎﾞﾙﾄ端あき(上)', t: 'num', when: isFillerBolt },
  { k: 'eBot', label: 'ﾎﾞﾙﾄ端あき(下)', t: 'num', when: isFillerBolt },
  { k: 'eSide', label: 'ﾎﾞﾙﾄ端あき(横)', t: 'num', when: isFillerBolt },
  { k: 'stagger', label: 'ボルト千鳥', t: 'sel', opts: ['1-なし', '2-あり'], when: isFillerBolt },
  { k: 'tmpl', label: '型紙出力', t: 'sel', opts: ['1-出力しない', '2-出力する'], when: (v) => !String(v.kind).includes('塞ぎ') },
];

// ---------- 配置面 / 母屋 ----------
export interface MoyaPlane { id: string; name: string; faceId: string; gap: number; /** 勾配 riêng của 母屋 (không ảnh hưởng 本体) */ face?: SlopeFace }
/** 勾配 dùng cho 配置面: 勾配 riêng (nhập ở tab 母屋) hoặc tham chiếu tab 勾配 (bản cũ) */
export const planeFace = (p: Project, pl: MoyaPlane | undefined): SlopeFace | undefined => pl && (pl.face ?? (p.slopeFaces ?? []).find((x) => x.id === pl.faceId));
export type MoyaDir = '1-(水上)パラメーター参照' | '2-(水下)' | '6-縦左' | '7-縦右';
export const MOYA_DIRS: MoyaDir[] = ['1-(水上)パラメーター参照', '2-(水下)', '6-縦左', '7-縦右'];
export const MOYA_BASES = ['2-部材芯', '3-左側', '4-右側'] as const;
export const MOYA_SIDES = ['2-上側', '3-下側'] as const;
export const MOYA_FITS = ['2-上合わせ', '3-下合わせ'] as const;
export interface MoyaPlace {
  member: string; // tên 部材 (M1…)
  dir: MoyaDir;
  base: (typeof MOYA_BASES)[number];
  side: (typeof MOYA_SIDES)[number];
  fit: (typeof MOYA_FITS)[number];
}
export interface MoyaItem extends MoyaPlace {
  id: string;
  plane: string;
  /** đường chuẩn (mặt bằng) lúc đặt */
  ref: string;
  refLabel: string;
  a: [number, number];
  b: [number, number];
  /** khoảng cách mặt bằng tới đường chuẩn (mm, + = bên trái chiều a→b) */
  off: number;
  /** 延長量 (mm): + kéo dài, − cắt ngắn */
  extL: number;
  extR: number;
}
export interface MoyaSupport { on: boolean; piece: string; tilt: string; pos: string; lDir: string }
import type { PcItem } from './pieceSet';
export interface MoyaData {
  members: MoyaMember[];
  pieces: MoyaPiece[];
  parts: MoyaPart[];
  planes: MoyaPlane[];
  items: MoyaItem[];
  support: MoyaSupport;
  /** ピース nhập tay (支持 / 接続 / コーナー) */
  pcs?: PcItem[];
}

/** Mẫu ピース / 部品 (chỉ dùng khi người dùng bấm 作成 / nhập mẫu – không tự thêm vào công trình) */
export function moyaTemplates(): { pieces: MoyaPiece[]; parts: MoyaPart[] } {
  const d = templMoya();
  return { pieces: d.pieces, parts: d.parts };
}
export function defaultMoya(): MoyaData {
  const d = templMoya();
  const none = { support: '<なし>', connect: '<なし>', corner: '<なし>', filler: '', endPart: '<なし>', reinforce: '<なし>' };
  return { ...d, members: d.members.map((m) => ({ ...m, v: { ...m.v, ...none } })), pieces: [], parts: [], support: { ...d.support, on: false }, pcs: [] };
}
function templMoya(): MoyaData {
  const M = (name: string, v: Record<string, FieldVal>): MoyaMember => ({ id: uid('mm'), name, v });
  const P = (name: string, v: Record<string, FieldVal>): MoyaPiece => ({ id: uid('mp'), name, v });
  const F = (name: string, v: Record<string, FieldVal>): MoyaPart => ({ id: uid('mf'), name, v });
  const cBase = { mat: '5-C形鋼', size: '100x50x20x2.3', grade: '4-SSC400', stdLen: 12, endPart: '<なし>', reinforce: '<なし>' };
  const angle = { gen: '1-符号管理', mat: '4-L形鋼', size: '100x75x7', grade: '1-SS400', autoSize: '2-する', rib: '<なし>', webConn: '2-ボルト接続', boltPos: 0, boxStyle: '1-フィラーなし', lipStyle: '2-フィラーあり', lipFiller: 'F2', boltType: '4-BTN', boltDia: 12, rows: 1, edgeV: 25, edgeL: 25, edgeR: 25, flgConn: '3-溶接接続', weld: 0 };
  const plate = { gen: '1-符号管理', mat: '1-プレート', size: 6, grade: '1-SS400', gap: 10, autoSize: '2-する', rib: '<なし>', webConn: '2-ボルト接続', boltPos: 0, plLen: 0, plShape: 'ﾌｰﾊﾟﾀｰﾝ7', plRise: 0, scKind: '1-ﾊﾟﾗﾒｰﾀｰ', scR: 0, rise: 0, boxStyle: '1-フィラーなし', lipStyle: '2-フィラーあり', lipFiller: 'F2', boltType: '4-BTN', boltThru: '2-する', boltDia: 12, drill: '<ﾎﾞﾙﾄﾏｽﾀｰ参照>', slot: 0, rows: 1, edgeV: 25, edgeL: 25, edgeR: 25, hole1: 0, flgConn: '3-溶接接続', weld: 0, backRib: '<なし>' };
  return {
    members: [
      M('M1', { ...cBase, combo: '1-[', comboGap: 0, filler: '', piecePos: '1-背', support: '支持ネコ', connect: '接続ネコ', corner: '端部PL' }),
      M('M2', { ...cBase, combo: '2-][', comboGap: 6, filler: '', piecePos: '3-中心', support: '支持PL', connect: '接続PL', corner: '端部PL' }),
    ],
    pieces: [
      P('支持ネコ', { ...angle, type: '1-支持ピース', len: 100, cols: 2, pitch: 50 }),
      P('接続ネコ', { ...angle, type: '2-接続ピース', len: 210, colsL: 2, colsR: 2, pitchL: 50, pitchR: 50, endL: 25, endR: 25 }),
      P('端部PL', { ...plate, type: '3-コーナーピース', len: 50, angle: '1-許可しない', plFit: '1-ﾌﾗﾝｼﾞ端部に合わす', plOff: 0, plLimit: '1-ﾊﾟﾗﾒｰﾀｰ', plRiseKind: '1-親部材から', cols: 2, pitch: 50, lipStyle: '1-フィラーなし' }),
      P('支持PL', { ...plate, type: '1-支持ピース', len: 100, gap: 0, cols: 2, pitch: 50, lipStyle: '1-フィラーなし' }),
      P('接続PL', { ...plate, type: '2-接続ピース', len: 210, colsL: 2, colsR: 2, pitchL: 50, pitchR: 50, endL: 25, endR: 25 }),
    ],
    parts: [
      F('F1', { kind: '1-フィラー板', fillerType: '3-フィラー(ボルト)', mat: '1-プレート', size: 6, grade: '1-SS400', boltType: '4-BTN', boltDia: 12, rows: 1, cols: 1, pv: 0, ph: 0, eTop: 25, eBot: 25, eSide: 25, stagger: '1-なし', tmpl: '1-出力しない' }),
      F('F2', { kind: '9-腹側フィラー', pos: '1-内側', mat: '1-プレート', size: 6, w: 50, l: 100, off: 0, tmpl: '1-出力しない' }),
    ],
    planes: [],
    items: [],
    support: { on: true, piece: 'マスター参照', tilt: '1-自動', pos: '1-マスター参照', lDir: '1-ﾊﾟﾗﾒｰﾀｰ参照' },
  };
}

export const moyaOf = (p: Project): MoyaData => p.moya ?? EMPTY;
const EMPTY: MoyaData = { members: [], pieces: [], parts: [], planes: [], items: [], support: { on: true, piece: 'マスター参照', tilt: '1-自動', pos: '1-マスター参照', lDir: '1-ﾊﾟﾗﾒｰﾀｰ参照' } };
export function ensureMoya(d: Project): MoyaData {
  if (!d.moya) d.moya = defaultMoya();
  return d.moya;
}

// ---------- hình học ----------
const nums = (s: FieldVal) => String(s).split(/[x×*]/i).map((t) => parseFloat(t)).filter((n) => !isNaN(n));
const code = (s: FieldVal) => String(s).replace(/^\d+-/, '');

/** Tiết diện 母屋 từ 部材マスター */
export function memberSection(m: MoyaMember): Section {
  const mat = code(m.v.mat);
  const type = mat.includes('角形') || mat.includes('コラム') ? 'Box' : mat.includes('H形') ? 'I' : 'C';
  const n = nums(m.v.size);
  const [h = 100, b = 50, c = 20, t = 2.3] = type === 'Box' ? [n[0] ?? 100, n[1] ?? 100, 0, n[2] ?? 2.3] : n;
  return { id: `moya:${m.name}`, code: `${type === 'C' ? 'C' : type === 'Box' ? '□' : 'H'}-${h}x${b}${type === 'C' ? `x${c}` : ''}x${t}`, type, h, b, tw: t, tf: t, c: type === 'C' ? c : 0, material: code(m.v.grade) };
}
/** Tiết diện ピース: L形鋼 (A×B×t) hoặc プレート (t) */
export function pieceSection(pc: MoyaPiece, plateH = 100): Section {
  const n = nums(pc.v.size);
  if (String(pc.v.mat).includes('L形鋼')) {
    const [A = 100, B = 75, t = 7] = n;
    return { id: `piece:${pc.name}`, code: `L-${A}x${B}x${t}`, type: 'L', h: A, b: B, tw: t, tf: t, c: 0, material: code(pc.v.grade) };
  }
  const t = n[0] ?? 6;
  return { id: `piece:${pc.name}`, code: `PL-${t}`, type: 'L', h: Math.round(plateH), b: t, tw: t, tf: t, c: 0, material: code(pc.v.grade) };
}

type P2 = [number, number];
const sub2 = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const len2 = (a: P2) => Math.hypot(a[0], a[1]);

/** Cắt đường thẳng q(t) = o + u t với đa giác → [tMin, tMax] */
function clipLine(poly: P2[], o: P2, u: P2): [number, number] | null {
  const ts: number[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i], p2 = poly[(i + 1) % poly.length];
    const e = sub2(p2, p1);
    const den = u[0] * e[1] - u[1] * e[0];
    if (Math.abs(den) < 1e-9) continue;
    const w = sub2(p1, o);
    const t = (w[0] * e[1] - w[1] * e[0]) / den;
    const s = (w[0] * u[1] - w[1] * u[0]) / den;
    if (s >= -1e-6 && s <= 1 + 1e-6) ts.push(t);
  }
  if (ts.length < 2) return null;
  const a = Math.min(...ts), b = Math.max(...ts);
  return b - a > 1 ? [a, b] : null;
}

interface PlaneCtx { pl: MoyaPlane; g: FaceGeo; z0: number }
function planeCtx(p: Project, id: string): PlaneCtx | null {
  const pl = moyaOf(p).planes.find((x) => x.id === id);
  const f = planeFace(p, pl);
  const g = f && faceGeo(p, f);
  if (!pl || !g || !f) return null;
  const z0 = p.levels.find((l) => l.id === f.level)?.elevation ?? 0;
  return { pl, g, z0 };
}
/** cao độ mặt 勾配 (đường 勾配) tại điểm mặt bằng */
const zFace = (c: PlaneCtx, q: P2) => c.z0 + faceZ(c.g, c.g.dir === 'y' ? q[1] : q[0]);
/** pháp tuyến mặt 勾配 (hướng lên) */
function faceN(c: PlaneCtx, q: P2): Vec3 {
  const d = 10;
  const gx = (zFace(c, [q[0] + d, q[1]]) - zFace(c, [q[0] - d, q[1]])) / (2 * d);
  const gy = (zFace(c, [q[0], q[1] + d]) - zFace(c, [q[0], q[1] - d])) / (2 * d);
  const l = Math.hypot(gx, gy, 1);
  return [-gx / l, -gy / l, 1 / l];
}

export interface MoyaGeo {
  item: MoyaItem;
  mem: MoyaMember;
  sec: Section;
  /** các thanh (1 hoặc 2 khi ][) : [a, b, up] */
  bars: [Vec3, Vec3, Vec3][];
  /** trục giữa trên mặt bằng */
  plan: [P2, P2];
  width: number;
  lip: P2;
  u: P2;
  /** điểm trên đường 勾配 ngay dưới tim 母屋 tại t */
  at: (t: number) => P2;
  t0: number;
  t1: number;
  ctx: PlaneCtx;
}

/** Hình học 1 母屋 */
export function moyaGeo(p: Project, it: MoyaItem): MoyaGeo | null {
  const md = moyaOf(p);
  const mem = md.members.find((m) => m.name === it.member);
  const c = planeCtx(p, it.plane);
  if (!mem || !c) return null;
  const sec = memberSection(mem);
  const combo = String(mem.v.combo);
  const two = combo.startsWith('2') || combo.startsWith('3');
  const cg = two ? Number(mem.v.comboGap) || 0 : 0;
  const width = two ? 2 * sec.b + cg : sec.b;
  const L0 = len2(sub2(it.b, it.a)) || 1;
  const u: P2 = [(it.b[0] - it.a[0]) / L0, (it.b[1] - it.a[1]) / L0];
  const left: P2 = [-u[1], u[0]];
  // 配置基準: đường đặt là tim / mép trái / mép phải của 母屋
  const shift = it.base === '3-左側' ? -width / 2 : it.base === '4-右側' ? width / 2 : 0;
  const offC = it.off + shift;
  const o: P2 = [it.a[0] + left[0] * offC, it.a[1] + left[1] * offC];
  const tt = clipLine(c.g.poly as P2[], o, u);
  if (!tt) return null;
  const t0 = tt[0] - it.extL, t1 = tt[1] + it.extR;
  const at = (t: number): P2 => [o[0] + u[0] * t, o[1] + u[1] * t];
  // hướng 水上 trên mặt bằng tại tim
  const mid = at((t0 + t1) / 2);
  const n = faceN(c, mid);
  let upHill: P2 = [-n[0], -n[1]];
  const uh = len2(upHill);
  upHill = uh > 1e-6 ? [upHill[0] / uh, upHill[1] / uh] : left;
  // 部材向き: hướng mở của リップ
  const across = (v: P2): P2 => { const d = v[0] * left[0] + v[1] * left[1]; return d >= 0 ? left : [-left[0], -left[1]]; };
  const lip: P2 = it.dir === '6-縦左' ? left : it.dir === '7-縦右' ? [-left[0], -left[1]] : it.dir === '2-(水下)' ? across([-upHill[0], -upHill[1]]) : across(upHill);
  const vertical = it.dir === '6-縦左' || it.dir === '7-縦右';
  const gap = c.pl.gap;
  const bars: [Vec3, Vec3, Vec3][] = [];
  const centers: number[] = two ? [-(sec.b + cg) / 2, (sec.b + cg) / 2] : [0];
  for (const dc of centers) {
    const pt = (t: number): [Vec3, Vec3] => {
      const q0 = at(t);
      const q: P2 = [q0[0] + lip[0] * dc, q0[1] + lip[1] * dc];
      const nn = faceN(c, q);
      if (!vertical) {
        // bụng vuông góc mặt 勾配: tim = mặt 勾配 + n·(間隔 ∓ h/2)
        const k = it.fit === '3-下合わせ' ? gap + sec.h / 2 : gap - sec.h / 2;
        const zf = zFace(c, q);
        return [[q[0] + nn[0] * k, q[1] + nn[1] * k, zf + nn[2] * k], nn];
      }
      // 縦: bụng thẳng đứng, chạm mặt 配置面 tại góc 上側 / 下側
      const cosA = nn[2] || 1;
      const hw = sec.b / 2;
      const cA: P2 = [q[0] + upHill[0] * hw, q[1] + upHill[1] * hw], cB: P2 = [q[0] - upHill[0] * hw, q[1] - upHill[1] * hw];
      const corner = it.side === '2-上側' ? cA : cB;
      const zPl = zFace(c, corner) + gap / cosA;
      const zc = it.fit === '3-下合わせ' ? zPl + sec.h / 2 : zPl - sec.h / 2;
      return [[q[0], q[1], zc], [0, 0, 1]];
    };
    const [A, upA] = pt(t0), [B] = pt(t1);
    // C mở về phía +x cục bộ = up × trục → đảo đầu để リップ đúng phía (][ : 2 thanh quay lưng)
    const want: P2 = two ? (dc < 0 ? [-lip[0], -lip[1]] : lip) : lip;
    const ax: Vec3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const xl: Vec3 = [upA[1] * ax[2] - upA[2] * ax[1], upA[2] * ax[0] - upA[0] * ax[2], upA[0] * ax[1] - upA[1] * ax[0]];
    const flip = xl[0] * want[0] + xl[1] * want[1] < 0;
    bars.push(flip ? [B, A, upA] : [A, B, upA]);
  }
  return { item: it, mem, sec, bars, plan: [at(t0), at(t1)], width, lip, u, at, t0, t1, ctx: c };
}

/** Giao điểm (theo tham số t của 母屋) với các 大梁 trên mặt bằng */
function beamHits(g: MoyaGeo, beams: Member[]): number[] {
  const o = g.at(0), u = g.u;
  const out: number[] = [];
  for (const m of beams) {
    const a: P2 = [m.a[0], m.a[1]], b: P2 = [m.b[0], m.b[1]];
    const e = sub2(b, a);
    const den = u[0] * e[1] - u[1] * e[0];
    if (Math.abs(den) < 1e-6) continue;
    const w = sub2(a, o);
    const t = (w[0] * e[1] - w[1] * e[0]) / den;
    const s = (w[0] * u[1] - w[1] * u[0]) / den;
    if (s < -1e-3 || s > 1 + 1e-3 || t < g.t0 + 20 || t > g.t1 - 20) continue;
    if (!out.some((x) => Math.abs(x - t) < 30)) out.push(t);
  }
  return out.sort((x, y) => x - y);
}

/** giao (tham số t) của 母屋 với đường mặt bằng */
function auxHit(g: MoyaGeo, l: { a: Vec3; b: Vec3 }): number | null {
  const o = g.at(0), u = g.u;
  const e = sub2([l.b[0], l.b[1]], [l.a[0], l.a[1]]);
  const den = u[0] * e[1] - u[1] * e[0];
  if (Math.abs(den) < 1e-6) return null;
  const w = sub2([l.a[0], l.a[1]], o);
  return (w[0] * e[1] - w[1] * e[0]) / den;
}
const pieceByName = (md: MoyaData, n: FieldVal) => md.pieces.find((x) => x.name === String(n));

/**
 * Sinh cấu kiện 母屋 + ピース. Chia 母屋 tại 大梁 sao cho mỗi đoạn ≤ 定尺長さ; chỗ nối dùng 接続ピース.
 * Trả về danh sách Member (kind 'purlin').
 */
export function moyaMembers(p: Project, beams: Member[]): Member[] {
  const md = moyaOf(p);
  const out: Member[] = [];
  const push = (sec: Section, a: Vec3, b: Vec3, up: Vec3, name: string, source: string, part?: 'piece') => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (L < 1) return;
    out.push({ id: `moya${out.length}_${source}`, kind: 'purlin', section: sec, a, b, up, name, mark: name, length: Math.round(L), weight: (kgPerM(sec) * L) / 1000, source, part } as Member);
  };
  for (const it of md.items) {
    const g = moyaGeo(p, it);
    if (!g) continue;
    const hits = beamHits(g, beams);
    const std = (Number(g.mem.v.stdLen) || 12) * 1000;
    // 接続ピース nhập tay → chia 母屋 tại 部材 đã chọn
    const forced: number[] = [];
    for (const pc of md.pcs ?? []) {
      if (pc.kind !== 'connect' || !pc.targets.includes(it.id)) continue;
      const bz = beams.filter((m) => (pc.buzai.startsWith('src:') ? m.source === pc.buzai.slice(4) : m.id === pc.buzai.slice(3)));
      const t = pc.aux?.plan ? auxHit(g, pc.aux) : beamHits(g, bz)[0];
      if (t != null && t > g.t0 + 50 && t < g.t1 - 50) forced.push(t + (pc.off || 0));
    }
    // điểm chia: chọn 大梁 xa nhất còn trong 定尺
    const cuts: number[] = [...forced].sort((a, b) => a - b);
    let s = cuts.length ? cuts[cuts.length - 1] : g.t0;
    while (g.t1 - s > std) {
      const cand = hits.filter((t) => t > s + 100 && t - s <= std);
      const c = cand.length ? cand[cand.length - 1] : s + std;
      cuts.push(c);
      s = c;
    }
    cuts.sort((a, b) => a - b);
    const ts = [g.t0, ...cuts, g.t1];
    const L = g.t1 - g.t0 || 1;
    for (const [A, B, up] of g.bars) {
      const lerp = (t: number): Vec3 => { const k = (t - g.t0) / L; const [P, Q] = A[0] * g.u[0] + A[1] * g.u[1] <= B[0] * g.u[0] + B[1] * g.u[1] ? [A, B] : [B, A]; return [P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k, P[2] + (Q[2] - P[2]) * k]; };
      const fwd = A[0] * g.u[0] + A[1] * g.u[1] <= B[0] * g.u[0] + B[1] * g.u[1];
      for (let i = 0; i + 1 < ts.length; i++) {
        const gapJ = 5; // khe nối
        const a = lerp(ts[i] + (i > 0 ? gapJ : 0)), b = lerp(ts[i + 1] - (i + 1 < ts.length - 1 ? gapJ : 0));
        if (fwd) push(g.sec, a, b, up, g.mem.name, it.id);
        else push(g.sec, b, a, up, g.mem.name, it.id);
      }
    }
    // ---- ピース ----
    if (!md.support.on) continue;
    const sup = pieceByName(md, md.support.piece === 'マスター参照' ? g.mem.v.support : md.support.piece);
    const con = pieceByName(md, g.mem.v.connect);
    const cor = pieceByName(md, g.mem.v.corner);
    const pos = String(g.mem.v.piecePos);
    const place = (pc: MoyaPiece | undefined, t: number) => {
      if (!pc) return;
      const q = g.at(t);
      const zf = zFace(g.ctx, q);
      const isLp = String(pc.v.mat).includes('L形鋼');
      const len = Number(pc.v.len) || 100;
      const topZ = Math.max(...g.bars.map(([A, B]) => (A[2] + B[2]) / 2)) + g.sec.h / 2;
      const plateH = Math.max(60, topZ - zf - 20);
      const ps = pieceSection(pc, plateH);
      // mặt bụng: 背 = phía ngược リップ, 腹 = phía リップ, 中心 = giữa khe ][
      const side: P2 = pos.startsWith('2') ? g.lip : [-g.lip[0], -g.lip[1]];
      const two = g.bars.length === 2;
      const off = pos.startsWith('3') || two ? 0 : g.sec.b / 2;
      const base: P2 = [q[0] + side[0] * off, q[1] + side[1] * off];
      const up: Vec3 = [0, 0, 1];
      // L: chân ngang nằm trên mặt 勾配, chân đứng áp bụng; プレート: tấm đứng
      const sh = isLp ? ps.b / 4 : -ps.b / 2 + ps.b / 4;
      const c0: Vec3 = [base[0] + side[0] * sh, base[1] + side[1] * sh, zf + ps.h / 4];
      const a: Vec3 = [c0[0] - g.u[0] * len / 2, c0[1] - g.u[1] * len / 2, c0[2]];
      const b: Vec3 = [c0[0] + g.u[0] * len / 2, c0[1] + g.u[1] * len / 2, c0[2]];
      // local x = up × trục phải hướng ra xa bụng (side)
      const ax: Vec3 = [b[0] - a[0], b[1] - a[1], 0];
      const xl = [-ax[1], ax[0]];
      const ok = xl[0] * side[0] + xl[1] * side[1] >= 0;
      push(ps, ok ? a : b, ok ? b : a, up, pc.name, it.id, 'piece');
    };
    const cutSet = new Set(cuts.map((t) => Math.round(t)));
    for (const t of hits) place(cutSet.has(Math.round(t)) ? con ?? sup : sup, t);
    // コーナーピース tại đầu 母屋 không nằm trên 大梁
    for (const [t, dir] of [[g.t0, 1], [g.t1, -1]] as const) {
      if (hits.some((h) => Math.abs(h - t) < 300)) continue;
      const gp = Number(cor?.v.gap) || 0;
      place(cor, t + dir * ((Number(cor?.v.len) || 50) / 2 + gp));
    }
  }
  return out;
}

/** Xem trước các 母屋 sẽ đặt theo form 間隔 */
export interface MoyaBatch {
  /** gap: 本数 + 間隔 · ds: danh sách khoảng cách · div: chia đều giữa 2 đường */
  mode?: 'gap' | 'ds' | 'div';
  count: number; baseGap: number; gap: number; sign: number;
  ds?: string; cum?: boolean; ref2?: string; n?: number; place?: 'step' | 'mid' | 'inner';
}
type L2 = { a: [number, number]; b: [number, number] };
/** khoảng cách có dấu (theo pháp tuyến trái của A) từ đường A tới đường B; null nếu không song song */
export function lineGap(A: L2, B: L2): number | null {
  const da = [A.b[0] - A.a[0], A.b[1] - A.a[1]], db = [B.b[0] - B.a[0], B.b[1] - B.a[1]];
  const la = Math.hypot(da[0], da[1]) || 1, lb = Math.hypot(db[0], db[1]) || 1;
  if (Math.abs(da[0] * db[1] - da[1] * db[0]) / (la * lb) > 0.02) return null;
  const n = [-da[1] / la, da[0] / la];
  return n[0] * (B.a[0] - A.a[0]) + n[1] * (B.a[1] - A.a[1]);
}
export function parseDs(s: string, cum: boolean): number[] {
  const out: number[] = [];
  for (const tok of s.split(/[\s,]+/).filter(Boolean)) {
    const m = tok.match(/^(\d+)\*(-?[\d.]+)$/);
    if (m) for (let i = 0; i < +m[1]; i++) out.push(+m[2]);
    else if (!isNaN(+tok)) out.push(+tok);
  }
  const rep = /\*/.test(s) || cum;
  if (!rep) return out;
  let acc = 0;
  return out.map((v) => (acc += v));
}
/** các 間隔 (offset mặt bằng) theo cách nhập */
export function moyaOffsets(d: MoyaBatch, A?: L2, B?: L2): number[] {
  const mode = d.mode ?? 'gap';
  if (mode === 'ds') return parseDs(d.ds ?? '', !!d.cum).map((v) => d.sign * v);
  if (mode === 'div') {
    const D = A && B ? lineGap(A, B) : null;
    if (D == null) return [];
    const n = Math.max(1, Math.round(d.n ?? 1));
    const pl = d.place ?? 'step';
    const out: number[] = [];
    for (let i = 1; i <= n; i++) out.push(pl === 'mid' ? (D * (i - 0.5)) / n : pl === 'inner' ? (D * i) / (n + 1) : (D * i) / n);
    if (pl === 'step') out.unshift(0);
    return out;
  }
  return Array.from({ length: Math.max(1, Math.min(50, d.count)) }, (_, i) => d.sign * (d.baseGap + i * d.gap));
}
export function moyaPreview(p: Project, pl: Omit<MoyaItem, 'id' | 'off'>, offs: number[]): MoyaItem[] {
  return offs.slice(0, 80).map((off, i) => ({ ...pl, id: `prev${i}`, off })).filter((it) => moyaGeo(p, it));
}
