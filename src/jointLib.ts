// Thư viện mối nối mẫu – 継手基準図 (SCSS-H97, 材質 400N級) do người dùng cung cấp
import { BoltGroup, EpSpec, Joint, JointType, newJoint } from './model';

export type LibFamily = 'GJ' | 'CJ' | 'BJ1' | 'BJ2' | 'HB' | 'EP2' | 'EP4' | 'EP4W' | 'EPK';

export const LIB_FAMILIES: { id: LibFamily; name: string; target: 'beam' | 'column' | 'brace'; type?: JointType; desc: string }[] = [
  { id: 'GJ', name: '梁継手 (GJ)', target: 'beam', type: 'SPL', desc: 'Nối dầm H bằng bản ghép cánh (外添板 + 内添板) và bản ghép bụng, bulông cường độ cao ma sát.' },
  { id: 'CJ', name: '柱継手 (CJ)', target: 'column', type: 'SPL', desc: 'Nối cột H bằng bản ghép cánh và bụng; cột 350, 400 dùng 4 hàng bulông cánh (ダブル).' },
  { id: 'BJ1', name: 'ピン接合 BJ-1', target: 'beam', type: 'GPL', desc: 'Liên kết khớp đầu dầm: GPL hàn vào cột, bụng dầm bắt bulông 1 mặt.' },
  { id: 'BJ2', name: 'ピン接合 BJ-2', target: 'beam', type: 'DS', desc: 'Liên kết khớp đầu dầm: GPL hàn vào cột + WPL ダブル kẹp 2 mặt (二面せん断).' },
  { id: 'EP2', name: 'エレクションピース 2面', target: 'column', type: 'EP', desc: 'Cột vuông (コラム) nối hàn hiện trường: ピース ở 2 mặt đối nhau, 添板 kẹp 2 bên bắt bulông. Dùng cho cột nhỏ □-150~□-300.' },
  { id: 'EP4', name: 'エレクションピース 4面', target: 'column', type: 'EP', desc: 'Cột vuông: ピース ở cả 4 mặt (1 ピース mỗi mặt). Mẫu thông dụng □-200~□-600.' },
  { id: 'EP4W', name: 'エレクションピース 4面×2', target: 'column', type: 'EP', desc: 'Cột vuông lớn: 2 ピース mỗi mặt (8 ピース), bulông 3 本 mỗi bên. □-400~□-800.' },
  { id: 'EPK', name: 'EP 4面 + カドピタ・下がり止め', target: 'column', type: 'EP', desc: 'Như EP 4面, thêm カドピタ (裏当て金) lót trong cột và 下がり止め mỗi mặt.' },
  { id: 'HB', name: '羽子板ボルト (丸鋼ブレース)', target: 'brace', desc: 'Đầu giằng thanh tròn JIS A 5540~5542, 材質 SNR400; bắt vào GPL bằng bulông 1 mặt.' },
];

export interface SplRow {
  sec: string;
  dia: number;
  nF: number;
  mF: number;
  g1: number;
  g2: number;
  fT: number;
  fL: number;
  iT: number;
  iW: number;
  mW: number;
  nW: number;
  pc: number;
  star: boolean; // * : e3 = 70
  wT: number;
  wW: number;
  wL: number;
}
export interface PinRow {
  sec: string;
  dia: number;
  n: number;
  gpl: number;
  wpl: number;
  note?: string;
}
/** Mẫu エレクションピース theo cạnh cột vuông B (sec = □-B) */
export interface EpRow {
  sec: string;
  dia: number;
  /** quy cách đại diện để xem hình */
  code: string;
  ep: Partial<EpSpec>;
}
export interface HaneRow {
  d: number;
  d1: number;
  Ss: number;
  R: number;
  e1: number;
  e2: number;
  t: number;
  L: number;
  e3: number;
  lb: number;
  bolt: string;
}

// sec | M | nFxmF | g1 | g2 | 外添板 t x L | 内添板 t x W | mWxnW | pc | 添板 t x W x L
const spl = (txt: string): SplRow[] =>
  txt
    .trim()
    .split('\n')
    .map((l) => {
      const [sec, M, nm, g1, g2, fo, fi, mn, pc, wp] = l.trim().split(/\s+/);
      const [nF, mF] = nm.split('x').map(Number);
      const [fT, fL] = fo.split('x').map(Number);
      const [iT, iW] = fi === '-' ? [0, 0] : fi.split('x').map(Number);
      const [mW, nW] = mn.split('x').map(Number);
      const [wT, wW, wL] = wp.split('x').map(Number);
      return { sec, dia: +M.slice(1), nF, mF, g1: +g1, g2: g2 === '-' ? 0 : +g2, fT, fL, iT, iW, mW, nW, pc: +pc.replace('*', ''), star: pc.startsWith('*'), wT, wW, wL };
    });

export const LIB_GJ: SplRow[] = spl(`
H-200x100x5.5x8 M16 2x2 56 - 12x285 - 2x1 60 6x140x165
H-250x125x6x9 M16 3x2 75 - 12x405 - 2x1 90 6x170x165
H-300x150x6.5x9 M16 2x2 90 - 9x285 9x60 3x1 60 6x200x165
H-350x175x7x11 M20 2x2 105 - 9x285 9x70 3x1 90 6x260x165
H-400x200x8x13 M20 3x2 120 - 9x405 9x80 4x1 60 9x260x165
H-450x200x9x14 M20 3x2 120 - 12x405 12x80 5x1 60 9x320x165
H-500x200x10x16 M20 3x2 120 - 12x405 12x80 5x1 60 9x320x165
H-600x200x11x17 M20 3x2 120 - 12x405 12x80 5x1 90 9x440x165
H-148x100x6x9 M16 2x2 56 - 12x285 - 1x2 60 6x80x285
H-194x150x6x9 M16 2x2 90 - 9x285 9x60 2x1 *60 6x140x225
H-244x175x7x11 M20 2x2 105 - 9x285 9x70 2x1 60 9x140x165
H-294x200x8x12 M20 3x2 120 - 9x405 9x80 3x1 60 9x200x165
H-340x250x9x14 M20 4x2 150 - 12x525 12x100 3x1 60 9x200x165
H-390x300x10x16 M20 4x2 150 40 12x435 12x110 4x1 60 9x260x165
H-440x300x11x18 M20 4x2 150 40 12x435 12x110 5x1 60 9x320x165
H-488x300x11x18 M20 4x2 150 40 12x435 12x110 4x1 90 12x350x165
H-588x300x12x20 M20 5x2 150 40 12x525 16x110 5x1 90 9x440x165
H-100x100x6x8 M16 2x2 56 - 12x285 - 1x2 *60 9x60x345
`);

export const LIB_CJ: SplRow[] = spl(`
H-150x150x7x10 M16 2x2 90 - 9x285 9x60 1x3 60 9x80x405
H-175x175x7.5x11 M20 2x2 105 - 9x285 9x70 1x2 60 9x80x285
H-200x200x8x12 M20 2x2 120 - 9x285 9x80 2x1 *60 6x140x345
H-250x250x9x14 M20 4x2 150 - 12x525 12x100 2x2 60 9x140x285
H-300x300x10x15 M20 4x2 150 40 9x435 12x110 2x2 120 9x200x285
H-350x350x12x19 M22 2x4 140 70 12x285 12x140 3x2 60 12x200x285
H-400x400x13x21 M22 3x4 140 90 12x405 16x170 3x2 90 12x260x285
H-148x100x6x9 M16 2x2 56 - 12x285 - 1x3 60 9x80x405
H-194x150x6x9 M16 2x2 90 - 9x285 9x60 2x2 *60 6x140x345
H-244x175x7x11 M20 2x2 105 - 9x285 9x70 2x2 60 9x140x285
H-294x200x8x12 M20 3x2 120 - 9x405 9x80 3x1 60 9x200x165
H-340x250x9x14 M20 4x2 150 - 12x525 12x100 3x2 60 12x200x285
H-390x300x10x16 M20 4x2 150 40 12x435 12x110 3x2 90 9x260x285
H-440x300x11x18 M20 4x2 150 40 12x435 12x110 5x2 60 12x320x285
H-488x300x11x18 M20 4x2 150 40 12x435 12x110 6x1 60 9x380x165
H-588x300x12x20 M20 5x2 150 40 12x525 16x110 5x2 90 9x440x285
H-200x100x5.5x8 M16 2x2 56 - 12x285 - 2x2 60 6x140x285
H-250x125x6x9 M16 3x2 75 - 12x405 - 2x2 90 9x170x285
H-300x150x6.5x9 M16 2x2 90 - 9x285 9x60 3x2 60 6x200x285
H-350x175x7x11 M20 2x2 105 - 9x285 9x70 4x1 60 6x260x165
H-400x200x8x13 M20 3x2 120 - 9x405 9x80 3x2 90 9x260x285
H-450x200x9x14 M20 3x2 120 - 12x405 12x80 5x1 60 9x320x165
H-500x200x10x16 M20 3x2 120 - 12x405 12x80 6x1 60 9x380x165
H-600x200x11x17 M20 3x2 120 - 12x405 12x80 5x2 90 9x440x285
`);

const pin = (txt: string, wpl: boolean): PinRow[] =>
  txt
    .trim()
    .split('\n')
    .map((l) => {
      const v = l.trim().split(/\s+/);
      return { sec: v[0], dia: +v[1].slice(1), n: +v[2], gpl: +v[3], wpl: wpl ? +v[4] : 0, note: wpl ? undefined : v[4] };
    });

export const LIB_BJ1: PinRow[] = pin(
  `
H-100x50x5x7 M16 2 6 ボルトは横打ち
H-150x75x5x7 M16 2 6 ボルトは横打ち
H-175x90x5x8 M16 2 6
H-198x99x4.5x7 M16 2 6
H-200x100x5.5x8 M16 2 6
H-248x124x5x8 M16 3 6
H-250x125x6x9 M16 3 6
H-298x149x5.5x8 M20 3 6
H-300x150x6.5x9 M20 3 9
H-346x174x6x9 M20 4 9
H-350x175x7x11 M20 4 9
H-396x199x7x11 M20 4 9
H-400x200x8x13 M20 5 9
H-446x199x8x12 M20 5 9
H-450x200x9x14 M20 6 12
`,
  false,
);

export const LIB_BJ2: PinRow[] = pin(
  `
H-346x174x6x9 M20 4 9 6
H-350x175x7x11 M20 4 9 6
H-396x199x7x11 M20 4 9 9
H-400x200x8x13 M20 4 9 9
H-446x199x8x12 M20 4 9 9
H-450x200x9x14 M20 4 9 9
H-496x199x9x14 M20 5 9 9
H-500x200x10x16 M20 5 12 9
H-596x199x10x15 M20 6 12 9
H-600x200x11x17 M20 6 12 9
H-294x200x8x12 M20 3 9 9
H-340x250x9x14 M20 3 9 9
H-390x300x10x16 M20 4 12 9
H-440x300x11x18 M20 4 12 9
H-482x300x11x15 M20 5 12 9
H-488x300x11x18 M20 5 12 9
`,
  true,
);

// 羽子板ボルト M12~M24 (材質 SNR400)
export const LIB_HB: HaneRow[] = [
  { d: 12, d1: 10.59, Ss: 100, R: 17, e1: 40.5, e2: 58, t: 6, L: 136, e3: 54, lb: 41.5, bolt: '1-M16' },
  { d: 14, d1: 12.41, Ss: 115, R: 17, e1: 40.5, e2: 58, t: 6, L: 146, e3: 54, lb: 51.5, bolt: '1-M16' },
  { d: 16, d1: 14.41, Ss: 125, R: 17, e1: 45.5, e2: 58, t: 6, L: 163, e3: 61, lb: 56.5, bolt: '1-M16' },
  { d: 18, d1: 16.07, Ss: 140, R: 21.5, e1: 50.5, e2: 70, t: 9, L: 180, e3: 68, lb: 61.5, bolt: '1-M20' },
  { d: 20, d1: 18.07, Ss: 150, R: 21.5, e1: 50.5, e2: 70, t: 9, L: 195, e3: 68, lb: 76.5, bolt: '1-M20' },
  { d: 22, d1: 20.07, Ss: 165, R: 23.5, e1: 55.5, e2: 80, t: 9, L: 217, e3: 75, lb: 86.5, bolt: '1-M22' },
  { d: 24, d1: 21.69, Ss: 175, R: 21.5, e1: 51, e2: 80, t: 9, L: 271, e3: 73, lb: 87, bolt: '2-M20' },
];

/** (1) ボルトピッチ・孔径・縁端距離 */
export const LIB_PITCH = [
  { dia: 16, hole: 18, p: 60, g2: '60 (90, 120)', e1: 40, e2min: 22 },
  { dia: 20, hole: 22, p: 60, g2: '60 (90, 120)', e1: 40, e2min: 26 },
  { dia: 22, hole: 24, p: 60, g2: '60 (90, 120)', e1: 40, e2min: 28 },
];
/** (3) 梁継手・柱継手 共通事項 theo bề rộng cánh B */
export const LIB_COMMON = [
  { B: 100, bolts: 'M16', g1: 56, g2: 0, outW: 100, inW: 0, arr: 'シングル' },
  { B: 125, bolts: 'M16', g1: 75, g2: 0, outW: 125, inW: 0, arr: 'シングル' },
  { B: 150, bolts: 'M16 / M20', g1: 90, g2: 0, outW: 150, inW: 60, arr: 'シングル' },
  { B: 175, bolts: 'M16 / M20', g1: 105, g2: 0, outW: 175, inW: 70, arr: 'シングル' },
  { B: 200, bolts: 'M20 / M22', g1: 120, g2: 0, outW: 200, inW: 80, arr: 'シングル' },
  { B: 250, bolts: 'M20 / M22', g1: 150, g2: 0, outW: 250, inW: 100, arr: 'シングル' },
  { B: 300, bolts: 'M20 / M22', g1: 150, g2: 40, outW: 300, inW: 110, arr: 'チドリ' },
  { B: 350, bolts: 'M20 / M22', g1: 140, g2: 70, outW: 350, inW: 140, arr: 'ダブル' },
  { B: 400, bolts: 'M20 / M22', g1: 140, g2: 90, outW: 400, inW: 170, arr: 'ダブル' },
];

// B | ピース t×w×h | 添板 t×w | M | 本/bên | ピッチ | へりあき  (mẫu thông dụng – đối chiếu tiêu chuẩn công ty trước khi dùng)
const EP_BASE: [number, number, number, number, number, number, number, number][] = [
  [150, 9, 65, 100, 9, 60, 16, 2],
  [175, 9, 70, 110, 9, 65, 16, 2],
  [200, 12, 75, 120, 9, 70, 16, 2],
  [250, 12, 80, 130, 9, 75, 16, 2],
  [300, 16, 90, 150, 9, 80, 20, 2],
  [350, 16, 100, 150, 12, 90, 20, 2],
  [400, 19, 100, 170, 12, 90, 20, 2],
  [450, 19, 110, 180, 12, 100, 22, 3],
  [500, 22, 120, 200, 12, 110, 22, 3],
  [550, 22, 120, 200, 16, 110, 22, 3],
  [600, 25, 130, 220, 16, 120, 22, 3],
  [650, 25, 140, 230, 16, 130, 24, 3],
  [700, 28, 150, 250, 16, 140, 24, 3],
  [750, 28, 150, 250, 19, 140, 24, 3],
  [800, 32, 160, 270, 19, 150, 24, 3],
];
const epRow = (fam: 'EP2' | 'EP4' | 'EP4W' | 'EPK', [B, t, w, h, spT, spW, dia, nb]: (typeof EP_BASE)[number]): EpRow => {
  const n2 = fam === 'EP4W';
  const nbX = n2 ? Math.max(3, nb) : nb;
  const pitch = dia >= 22 ? 70 : 60, edge = dia >= 22 ? 40 : 35;
  const spL = 2 * (edge + (nbX - 1) * pitch) + 10;
  const tt = B <= 200 ? 9 : B <= 300 ? 12 : B <= 450 ? 16 : B <= 600 ? 19 : 22;
  return {
    sec: `□-${B}`,
    dia,
    code: `□-${B}x${B}x${tt}`,
    ep: {
      faces: fam === 'EP2' ? 2 : 4, n: n2 ? 2 : 1, sp: n2 ? Math.round(B * 0.45 / 10) * 10 : 150, off: 0,
      t, w, h: Math.max(h, spL / 2 + 20), spT, spW, spL, nb: nbX, pitch, edge,
      ...(fam === 'EPK' ? { kpOn: true, kpT: 9, kpW: 25, kpUp: 12, sdN: 1, sdT: 9, sdW: 50, sdH: 50, sdZ: 15 } : { kpOn: false, sdN: 0 }),
    },
  };
};
export const LIB_EP2 = EP_BASE.filter((r) => r[0] <= 300).map((r) => epRow('EP2', r));
export const LIB_EP4 = EP_BASE.filter((r) => r[0] >= 200 && r[0] <= 600).map((r) => epRow('EP4', r));
export const LIB_EP4W = EP_BASE.filter((r) => r[0] >= 400).map((r) => epRow('EP4W', r));
export const LIB_EPK = EP_BASE.filter((r) => r[0] >= 200 && r[0] <= 600).map((r) => epRow('EPK', r));
export const isEp = (r: AnyRow): r is EpRow => 'ep' in r;
export type AnyRow = SplRow | PinRow | EpRow;
/** mẫu khớp quy cách: đúng code, hoặc EP theo cạnh cột (□-350 khớp □-350x350x12) */
export const rowMatches = (r: AnyRow, sec: string) => r.sec === sec || (isEp(r) && sec.startsWith(`${r.sec}x`));

export type LibRow = { family: LibFamily; row: AnyRow };
export const libRows = (f: LibFamily): AnyRow[] => (f === 'GJ' ? LIB_GJ : f === 'CJ' ? LIB_CJ : f === 'BJ1' ? LIB_BJ1 : f === 'BJ2' ? LIB_BJ2 : f === 'EP2' ? LIB_EP2 : f === 'EP4' ? LIB_EP4 : f === 'EP4W' ? LIB_EP4W : f === 'EPK' ? LIB_EPK : []);
export const isSpl = (r: AnyRow): r is SplRow => 'nF' in r;

/** Tên gợi ý cho mối nối tạo từ mẫu, vd GJ-400x200, BJ1-400x200 */
export const libName = (f: LibFamily, sec: string) => {
  if (f.startsWith('EP')) return `${f}-${sec.replace(/^□-/, '')}`;
  const m = sec.match(/^H-(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)/);
  return `${f}-${m ? `${m[1]}x${m[2]}` : sec}`;
};
export const libRef = (f: LibFamily, sec: string) => `SCSS ${f} ${sec}`;

/** Đổ số liệu mẫu vào một 継手 (giữ id, tên) */
export function applyTemplate(j: Joint, f: LibFamily, r: AnyRow) {
  const g = (rows: number, cols: number, gauge: number, gauge2 = 0): BoltGroup => ({ rows, cols, pitch: 60, gauge, edge: 40, gauge2 });
  j.bolt = { ...j.bolt, dia: r.dia };
  j.ref = libRef(f, r.sec);
  if (isEp(r)) {
    j.type = 'EP';
    j.ep = { ...r.ep };
    j.note = `${LIB_FAMILIES.find((x) => x.id === f)?.name} ${r.sec} · mẫu thông dụng`;
    return;
  }
  if (isSpl(r)) {
    j.type = 'SPL';
    j.flangeT = r.fT;
    j.flangeL = r.fL;
    j.innerT = r.iT;
    j.innerW = r.iW;
    j.webT = r.wT;
    j.webH = r.wW;
    j.webL = r.wL;
    j.gplT = 0;
    j.flangeBolts = g(r.mF, r.nF, r.g1, r.g2);
    j.webBolts = { ...g(r.mW, r.nW, r.pc), edge: 40 };
    j.note = `SCSS-H97 ${f === 'GJ' ? '梁継手' : '柱継手'} ${r.sec}${r.star ? ' · ウェブ e3 = 70' : ''}`;
  } else {
    j.type = f === 'BJ2' ? 'DS' : 'GPL';
    j.webT = f === 'BJ2' ? r.wpl : r.gpl;
    j.gplT = f === 'BJ2' ? r.gpl : 0;
    j.webH = 0;
    j.webL = 0;
    j.flangeL = 0;
    j.innerW = 0;
    j.webBolts = g(r.n, 1, 60);
    j.note = `SCSS-H97 ${f === 'BJ1' ? 'BJ-1' : 'BJ-2'} ${r.sec} · GPL t${r.gpl}${f === 'BJ2' ? ` + WPL t${r.wpl} ダブル` : ''}${r.note ? ' · ' + r.note : ''}`;
  }
}

/** Tạo 継手 mới từ mẫu */
export function jointFromTemplate(f: LibFamily, r: AnyRow, grade: string): Joint {
  const fam = LIB_FAMILIES.find((x) => x.id === f)!;
  const j = newJoint(1, fam.target === 'column' ? 'column' : 'beam');
  j.name = libName(f, r.sec);
  j.bolt.grade = grade;
  j.pos = 0;
  applyTemplate(j, f, r);
  return j;
}
