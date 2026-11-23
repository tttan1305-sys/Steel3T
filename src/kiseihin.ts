// 既製品ライブラリ – sản phẩm có sẵn của フルサト工業 (FURUSATO)
// Nguồn: フルサト 鉄骨建築資材総合カタログ 2026 (版 2607). Số trang ghi theo catalogue.
// Kèm thông tin NDコア (日鉄建材 C27) vì là chi tiết nút cột-dầm mua sẵn.
import type { Project } from './model';
import { ensureMaster, uid } from './model';
import { findJis } from './jis';

export const SUPPLIER = { name: 'フルサト工業', catalog: '鉄骨建築資材総合カタログ 2026 (2607)' };

/** 18 nhóm hàng trong catalogue フルサト (trang bắt đầu) */
export const FURUSATO_SECTIONS: { no: string; name: string; page: number; vi: string; inApp?: string }[] = [
  { no: '01', name: '省力化提案部材', page: 13, vi: 'Chi tiết giảm công (コラムカプラー, クリッパー…)' },
  { no: '02', name: 'アンカーボルト', page: 39, vi: 'Bulông neo ABR / ABM, 定着板, L型, ステッキ型', inApp: 'ベース' },
  { no: '03', name: '柱脚部材', page: 69, vi: 'Chân cột: フリーベース, ハイベース, ISベース, NCベース, スタッド', inApp: 'ベース' },
  { no: '04', name: 'ピース類', page: 75, vi: 'フルピース (ke đỡ xà gồ), THピース, デッキ受け…' },
  { no: '05', name: 'フック金物・昇降タラップ', page: 111, vi: 'Móc, thang leo' },
  { no: '06', name: 'パネルゾーン', page: 121, vi: 'Vòng gia cường lỗ dầm (ハイリング, Fウィング)' },
  { no: '07', name: 'スプライスプレート', page: 127, vi: 'Bản nối SPL đặt gia công sẵn', inApp: '継手' },
  { no: '08', name: '階段ステップ・床用部材', page: 131, vi: 'Bậc thang, グレーチング, sàn thép' },
  { no: '09', name: 'フルブレース', page: 137, vi: 'Giằng tròn JIS A 5540 (ターンバックル)', inApp: 'ブレース' },
  { no: '10', name: 'テンションロッド', page: 159, vi: 'Thanh căng NHT690 / NHT740' },
  { no: '11', name: '塗料', page: 165, vi: 'Sơn chống gỉ, ジンクリッチ, ローバル' },
  { no: '12', name: '溶接材料', page: 181, vi: 'Que / dây hàn' },
  { no: '13', name: '裏当金・エンドタブ', page: 195, vi: 'Thép lót, tấm chặn mép hàn' },
  { no: '14', name: 'パイプ部品', page: 0, vi: 'Phụ kiện ống' },
  { no: '15', name: '荷役', page: 0, vi: 'Dụng cụ nâng hạ' },
  { no: '16', name: 'ボルト・ナット', page: 0, vi: 'Bulông thường, アンカー sau (ケミカル…)' },
  { no: '17', name: 'ハイテンションボルト', page: 331, vi: 'トルシア S10T, F10T, SHTB', inApp: '継手 (bulông)' },
  { no: '18', name: '工具・CAD', page: 0, vi: 'Dụng cụ, dữ liệu CAD' },
];

// ── 02 アンカーボルト (JIS B 1220:2015) ─────────────────────────────
export interface AnchorRow {
  d: number; // M
  p: number; // bước ren
  Lt: number; // chiều dài chuẩn ℓt
  b: number; // chiều dài ren tối thiểu
  As: number; // diện tích thân mm²
  Ae: number; // diện tích hữu hiệu phần ren mm²
  Ty400: number; // 引張降伏耐力 phần ren, cấp 400 (kN)
  Ty490: number; // cấp 490 (kN)
  nutH?: number;
  nutS?: number;
  washD?: number;
}
const ar = (d: number, p: number, Lt: number, b: number, As: number, Ae: number, Ty400: number, Ty490: number, nutH?: number, nutS?: number, washD?: number): AnchorRow => ({ d, p, Lt, b, As, Ae, Ty400, Ty490, nutH, nutS, washD });

/** ABR 転造両ねじ (SNR400B / SNR490B / SUS304A) – P40-41 */
export const ANCHOR_ABR: AnchorRow[] = [
  ar(16, 2, 400, 48, 166, 157, 36.9, 51.0, 13, 24, 32),
  ar(18, 2.5, 450, 54, 206, 192, 45.1, 62.4, 15, 27, 36),
  ar(20, 2.5, 500, 60, 260, 245, 57.6, 79.6, 16, 30, 40),
  ar(22, 2.5, 550, 66, 320, 303, 71.2, 98.5, 18, 32, 44),
  ar(24, 3, 600, 72, 375, 353, 83.0, 115, 19, 36, 48),
  ar(27, 3, 675, 81, 485, 459, 108, 149, 22, 41, 56),
  ar(30, 3.5, 750, 90, 594, 561, 132, 182, 24, 46, 60),
  ar(33, 3.5, 825, 99, 731, 694, 163, 226, 26, 50, 63),
  ar(36, 4, 900, 108, 864, 817, 192, 266, 29, 55, 66),
  ar(39, 4, 975, 117, 1030, 976, 229, 317, 31, 60, 72),
  ar(42, 4.5, 1050, 126, 1180, 1120, 263, 364, 34, 65, 78),
  ar(45, 4.5, 1125, 135, 1370, 1310, 282, 386, 36, 70, 85),
  ar(48, 5, 1200, 144, 1550, 1470, 316, 434, 38, 75, 92),
];
/** ABM 切削両ねじ – P42-43 (ABM400 chỉ đến M48) */
export const ANCHOR_ABM: AnchorRow[] = [
  ar(24, 2, 600, 72, 452, 384, 90.2, 125),
  ar(27, 2, 675, 81, 573, 496, 117, 161),
  ar(30, 2, 750, 90, 707, 621, 146, 202),
  ar(33, 2, 825, 99, 855, 761, 179, 247),
  ar(36, 3, 900, 108, 1020, 865, 203, 281),
  ar(39, 3, 975, 117, 1190, 1030, 242, 335),
  ar(42, 3, 1050, 126, 1390, 1210, 260, 357),
  ar(45, 4, 1125, 135, 1590, 1340, 288, 395),
  ar(48, 4, 1200, 144, 1810, 1540, 331, 454),
  ar(52, 4, 1300, 156, 2120, 1820, 0, 537),
  ar(56, 4, 1400, 168, 2460, 2140, 0, 631),
  ar(60, 4, 1500, 180, 2830, 2480, 0, 732),
  ar(64, 4, 1600, 192, 3220, 2850, 0, 841),
  ar(68, 4, 1700, 204, 3630, 3240, 0, 956),
  ar(72, 6, 1800, 216, 4070, 3460, 0, 1020),
  ar(76, 6, 1900, 228, 4540, 3890, 0, 1150),
  ar(80, 6, 2000, 240, 5030, 4340, 0, 1280),
];
export const ANCHOR_DIAS = [...new Set([...ANCHOR_ABR, ...ANCHOR_ABM].map((r) => r.d))].sort((a, b) => a - b);
/** Tra bảng bulông neo theo vật liệu (ABR…/ABM…) và đường kính */
export function anchorRow(material: string, d: number): AnchorRow | undefined {
  const t = material.startsWith('ABM') ? ANCHOR_ABM : ANCHOR_ABR;
  return t.find((r) => r.d === d) ?? ANCHOR_ABR.find((r) => r.d === d) ?? ANCHOR_ABM.find((r) => r.d === d);
}
export const anchorTy = (material: string, r: AnchorRow) => (material.includes('490') ? r.Ty490 : r.Ty400);

// ── 03 柱脚部材 ─────────────────────────────────────────────────
/** フリーベース工法 (露出型弾性固定柱脚, SASST技術評価) – P70-71: cột □150–□350, mã {n}-M{d}F, độ cứng xoay kN·m/rad */
export interface FreeBaseRow {
  col: number; // cạnh ống vuông
  n: number;
  d: number;
  k: number;
}
const fb = (col: number, n: number, list: [number, number][]): FreeBaseRow[] => list.map(([d, k]) => ({ col, n, d, k }));
export const FREE_BASE: FreeBaseRow[] = [
  ...fb(150, 4, [[16, 3346], [20, 4539], [22, 5103], [24, 5529], [27, 6812], [30, 7523], [33, 8463], [36, 9747]]),
  ...fb(175, 4, [[16, 4370], [20, 5887], [22, 6619], [24, 7171], [27, 8778], [30, 9693], [33, 10905], [36, 12481]]),
  ...fb(200, 4, [[16, 5531], [20, 7410], [22, 8332], [24, 9027], [27, 10992], [30, 12139], [33, 13656], [36, 15552]]),
  ...fb(200, 8, [[16, 9050], [20, 12103], [22, 13608], [24, 15364], [27, 18661], [30, 20606], [33, 24120], [36, 27378]]),
  ...fb(250, 4, [[16, 8262], [20, 10982], [22, 12348], [24, 13378], [27, 16168], [30, 17853], [33, 20086], [36, 22707]]),
  ...fb(250, 8, [[16, 13310], [20, 17671], [22, 19869], [24, 22275], [27, 26872], [30, 29673], [33, 34506], [36, 38921]]),
  ...fb(300, 4, [[24, 18583], [27, 22338], [30, 24667], [33, 27752], [36, 31212], [39, 35699], [42, 39093], [45, 42844], [48, 45632]]),
  ...fb(300, 8, [[24, 30466], [27, 36575], [30, 40389], [33, 46746], [36, 52488], [39, 61590], [42, 67316], [45, 75756], [48, 82823]]),
  ...fb(350, 4, [[24, 24641], [27, 29504], [30, 32580], [33, 36654], [36, 41067], [39, 46796], [42, 51061], [45, 55960], [48, 59601]]),
  ...fb(350, 8, [[24, 39937], [27, 47772], [30, 52752], [33, 60842], [36, 68081], [39, 79361], [42, 86464], [45, 97003], [48, 105732]]),
];
export const freeBaseCode = (r: FreeBaseRow) => `${r.n}-M${r.d}F`;

/** Các công nghệ chân cột lộ (露出型) – P72: phạm vi áp dụng */
export const BASE_METHODS: { name: string; type: string; col: string; anchors: string; range: string; note?: string }[] = [
  { name: 'フリーベース', type: '標準', col: '角形鋼管', anchors: '4, 8', range: '□150〜□350', note: 'Dùng ABR490 (SNR490B), có 親子フィラー, SASST 25-01' },
  { name: 'ハイベースNEO エコタイプ', type: 'EB', col: '角形鋼管', anchors: '4 / 4,8 / 8 / 8,12', range: '□150〜□550' },
  { name: 'ハイベースNEO Gタイプ', type: 'GB', col: '角形鋼管', anchors: '4,8 / 4,8,12 / 8,12 / 12', range: '□350〜□1200' },
  { name: 'ISベース', type: 'SP (保有耐力)', col: '角形鋼管', anchors: '4, 8, 12', range: '□150〜□800' },
  { name: 'ISベース', type: 'SPT (保有耐力)', col: '角形鋼管', anchors: '8', range: '□250〜□450' },
  { name: 'ISベース', type: 'SH (非保有耐力)', col: '角形鋼管', anchors: '4, 8, 12', range: '□150〜□800' },
  { name: 'ISベース', type: 'SHU (非保有耐力)', col: '角形鋼管', anchors: '4, 8', range: '□150〜□800' },
  { name: 'ISベース', type: 'CP / CH', col: '円形鋼管', anchors: '4, 8', range: 'φ165.2〜φ914.4' },
  { name: 'ISベース', type: 'HP (保有耐力)', col: 'H形鋼', anchors: '4, 6, 8', range: 'H150×150〜H700×300' },
  { name: 'ISベース', type: 'HPS / HH', col: 'H形鋼', anchors: '4, 6, 8 / 4', range: 'H200×200〜H600×300' },
  { name: 'NCベースP', type: 'PS', col: '角形鋼管', anchors: '4', range: '□150〜□400' },
  { name: 'NCベースP', type: 'PK', col: '角形鋼管', anchors: '8 / 12', range: '□350〜□900 / □700〜□1000' },
  { name: 'NCベースP', type: 'PC / PM', col: '円形鋼管', anchors: '4 / 8', range: 'φ200〜φ400 / φ400〜φ900' },
];

/** 頭付きスタッド (JIS B 1198) – P73-74: d → chiều dài sau hàn, đầu D × T */
export const STUDS: { d: number; head: number; T: number; lengths: number[] }[] = [
  { d: 13, head: 25, T: 8, lengths: [80, 90, 100, 110, 120, 130, 150] },
  { d: 16, head: 29, T: 8, lengths: [80, 90, 100, 110, 120, 130, 150] },
  { d: 19, head: 32, T: 10, lengths: [80, 90, 100, 110, 120, 130, 150] },
  { d: 22, head: 35, T: 10, lengths: [80, 90, 100, 110, 120, 130, 150] },
];

// ── 09 フルブレース (JIS A 5540 建築用ターンバックル) ─────────────────
export interface BraceRow {
  d: number; // ねじ呼び
  d1: number; // 軸径 min
  s: number; // ねじ長さ
  W: number; // 溶接長さ
  t: number; // 羽子板 t
  b: number; // 羽子板 幅
  a: number; // 羽子板 全長
  e1: number; // はしあき
  e2: number; // へりあき
  P: number; // 穴ピッチ (0 = 1 lỗ)
  R: number; // 穴径
  bolt: string; // 取付ボルト
  TB: number; // ターンバックル胴 全長
  Ab: number; // 軸部断面積 mm²
  Pa: number; // 短期許容耐力 Ab·F (kN)
  PaL: number; // 長期 Ab·F/1.5
  Pu: number; // 保有引張耐力 1.1Ab·F
  Lmin: number; // 最短全長 (交差時に枠が干渉しない)
  Lmin2: number; // 最短全長 (干渉する)
}
const br = (d: number, d1: number, s: number, W: number, t: number, b: number, a: number, e1: number, e2: number, P: number, R: number, bolt: string, TB: number, Ab: number, Pa: number, PaL: number, Pu: number, Lmin: number, Lmin2: number): BraceRow => ({ d, d1, s, W, t, b, a, e1, e2, P, R, bolt, TB, Ab, Pa, PaL, Pu, Lmin, Lmin2 });
/** P144-148 */
export const FULL_BRACE: BraceRow[] = [
  br(10, 8.9, 75, 35, 4.5, 40, 115, 30, 19, 0, 13, 'M12×1', 150, 60.5, 14.2, 9.48, 15.6, 790, 560),
  br(12, 10.7, 100, 40, 6, 52, 155, 40, 25, 0, 17, 'M16×1', 200, 88.0, 20.7, 13.8, 22.8, 940, 640),
  br(14, 12.5, 115, 50, 6, 52, 155, 40, 25, 0, 17, 'M16×1', 230, 121, 28.4, 18.9, 31.3, 990, 640),
  br(16, 14.5, 125, 55, 6, 52, 170, 45, 25, 0, 17, 'M16×1', 250, 163, 38.3, 25.5, 42.1, 1030, 650),
  br(18, 16.2, 140, 60, 9, 67, 190, 50, 32.5, 0, 21.5, 'M20×1', 280, 203, 47.6, 31.8, 52.4, 1210, 790),
  br(20, 18.2, 150, 75, 9, 67, 205, 50, 32.5, 0, 21.5, 'M20×1', 300, 256, 60.2, 40.2, 66.3, 1250, 800),
  br(22, 20.2, 165, 85, 9, 77, 230, 55, 37.5, 0, 23.5, 'M22×1', 330, 316, 74.3, 49.5, 81.7, 1430, 930),
  br(24, 21.9, 175, 85, 9, 77, 280, 50, 37.5, 60, 21.5, 'M20×2', 350, 369, 86.8, 57.9, 95.5, 1680, 1150),
  br(27, 24.9, 200, 90, 9, 92, 285, 50, 45, 60, 21.5, 'M20×2', 400, 479, 112, 75.0, 124, 1780, 1180),
  br(30, 27.5, 200, 95, 12, 92, 310, 55, 45, 60, 23.5, 'M22×2', 400, 587, 138, 91.9, 152, 1800, 1200),
  br(33, 30.5, 225, 110, 12, 102, 330, 55, 50, 60, 23.5, 'M22×2', 450, 723, 170, 113, 187, 2010, 1330),
];
export const braceRow = (d: number) => FULL_BRACE.find((r) => r.d === d);
/** Vật liệu theo bảng P147 */
export const BRACE_MATERIALS = [
  { part: '丸鋼', m10: 'SS400', main: 'SNR400B' },
  { part: '羽子板 (平鋼)', m10: 'SS400', main: 'SN400B' },
  { part: 'TB胴 割枠式', m10: 'SS400', main: 'SNR400A / SNR400B' },
  { part: 'TB胴 パイプ式', m10: 'STKM11A–14A', main: 'STKN400W / 400B' },
];

// ── 17 ハイテンションボルト (構造用トルシア形高力ボルト S10T) ─────────────
/** Chiều dài sản xuất (bước 5 mm) và độ dài cộng thêm – P332-336 */
export const TORSHEAR: { d: number; min: number; max: number; add: number; axial: [number, number]; tq1: number }[] = [
  { d: 16, min: 35, max: 110, add: 25, axial: [110, 133], tq1: 100 },
  { d: 20, min: 40, max: 140, add: 30, axial: [172, 207], tq1: 150 },
  { d: 22, min: 50, max: 160, add: 35, axial: [212, 256], tq1: 150 },
  { d: 24, min: 55, max: 175, add: 40, axial: [247, 298], tq1: 200 },
];
/** Ren và chiều cao đai ốc, long đen bulông cường độ cao (JIS B 1186) */
const HTB_GEOM: Record<number, { p: number; washer: number }> = { 12: { p: 1.75, washer: 3.2 }, 16: { p: 2, washer: 4.5 }, 20: { p: 2.5, washer: 4.5 }, 22: { p: 2.5, washer: 6 }, 24: { p: 3, washer: 6 }, 27: { p: 3, washer: 6 }, 30: { p: 3.5, washer: 6 } };
/** Bulông lục giác JIS (F10T…) dài hơn トルシア 5 mm vì có long đen dưới đầu (日建連 Q&A B-2-16) */
export const isTorshear = (grade: string) => /^S\d+T/.test(grade) || grade.includes('トルシア');
/**
 * 首下長さ = 締付け長さ + 加える長さ (トルシア: M16 25 · M20 30 · M22 35 · M24 40; 六角 F10T: +5),
 * làm tròn 2捨3入 / 7捨8入 về bước 5 mm (M27, M30 bước 10). 余長 nên 1–6 山 (日建連 Q&A B-2-8).
 */
export function boltLength(d: number, grip: number, grade = 'S10T'): { calc: number; L: number; ok: boolean; add: number; yochou: number; threads: number; threadOk: boolean } {
  const ts = isTorshear(grade);
  const t = TORSHEAR.find((x) => x.d === d) ?? { min: 30, max: 200, add: d + 10 };
  const add = t.add + (ts ? 0 : 5);
  const calc = Math.round((grip + add) * 10) / 10;
  const step = d >= 27 ? 10 : 5;
  const L = Math.round(calc / step) * step;
  const g = HTB_GEOM[d] ?? { p: d / 8, washer: 6 };
  const yochou = Math.round((L - grip - g.washer * (ts ? 1 : 2) - d) * 10) / 10; // đai ốc cao = d
  const threads = Math.round((yochou / g.p) * 10) / 10;
  return { calc, L, add, ok: !ts || (L >= t.min && L <= t.max), yochou, threads, threadOk: threads >= 1 && threads <= 6 };
}

// ── 07 スプライスプレート ────────────────────────────────────────
export const SPLICE_INFO = {
  shapes: ['F: フランジ外側', 'T: フランジ内側', 'W: ウェブ', '特注'],
  materials: ['SS400', 'SN400B', 'SN490B', 'SM490A'],
  page: 128,
};

// ── 04 ピース類 (材質 SPH-C) ──────────────────────────────────────
export const PIECES: { name: string; page: number; vi: string }[] = [
  { name: 'フルピース 1ツ穴 / 2ツ穴 / 4ツ穴', page: 76, vi: 'Ke đỡ xà gồ, 胴縁 hàn lên dầm/cột' },
  { name: '窓ネコ 1ツ穴 / 2ツ穴', page: 83, vi: 'Ke khung cửa sổ' },
  { name: '縦穴ピース · 釘ネコ', page: 85, vi: 'Ke lỗ đứng, ke đóng đinh' },
  { name: 'THピース 1/2/4ツ穴 · 穴なし', page: 92, vi: 'Ke chữ T' },
  { name: 'アングルピース', page: 96, vi: 'Ke góc L' },
  { name: 'T型ピース (ストッパー付)', page: 100, vi: 'Ke T có chặn' },
  { name: '吊りピース (吊るべえ, スリット付, 低床用)', page: 101, vi: 'Tai treo' },
  { name: 'ハイステージ受け · 建直ピース', page: 104, vi: 'Ke giàn giáo, ke chỉnh dựng' },
  { name: '安全手摺用サヤ管', page: 108, vi: 'Ống chờ lan can an toàn' },
  { name: 'デッキ受け', page: 109, vi: 'Ke đỡ sàn deck' },
];

// ── NDコア (日鉄建材 C27): nút cột-dầm không cần diaphragm ───────────────
export const ND_CORE: { code: string; col: string; colMat: string; plateT: string; plate: string; weld: number }[] = [
  { code: 'ND150', col: '□150', colMat: 'BCR295 / STKR400', plateT: '6 以上', plate: '130×130', weld: 6 },
  { code: 'ND175', col: '□175', colMat: 'BCR295 / STKR400', plateT: '6 以上', plate: '155×155', weld: 6 },
  { code: 'ND200', col: '□200', colMat: 'BCR295 / STKR400', plateT: '9 以上', plate: '170×170', weld: 9 },
  { code: 'ND250', col: '□250', colMat: 'BCR295 / STKR400', plateT: '9 以上', plate: '220×220', weld: 9 },
  { code: 'ND300', col: '□300', colMat: 'BCR295', plateT: '12 以上', plate: '270×270', weld: 12 },
  { code: 'ND350', col: '□350', colMat: 'BCR295', plateT: '12 以上', plate: '310×310', weld: 12 },
  { code: 'ND400P', col: '□400', colMat: 'BCR295', plateT: '19 以上', plate: '—', weld: 19 },
];

// ── Tạo 部材名 giằng từ フルブレース ─────────────────────────────────────

export const braceCode = (d: number) => `M${d} (丸鋼ブレース)`;
export const braceMaterial = (d: number) => (d <= 10 ? 'SS400 (丸鋼)' : 'SNR400B');
export const braceNote = (r: BraceRow) => `フルブレース M${r.d} JIS A 5540 (フルサト) · 羽子板 PL-${r.t}×${r.b} · ${r.bolt} · 短期 ${r.Pa} kN`;
export const braceLabel = (r: BraceRow) => `M${r.d} · 短期 ${r.Pa} kN · 羽子板 PL-${r.t}×${r.b} · ${r.bolt}`;

/** Tạo (hoặc dùng lại) 部材名 giằng theo quy cách フルブレース. Trả về id master. */
export function ensureFullBrace(d: Project, dia: number, name?: string): { id?: string; error?: string } {
  const r = braceRow(dia);
  const jf = findJis(braceCode(dia));
  if (!r || !jf) return { error: `Không có フルブレース M${dia}` };
  let sec = d.sections.find((s) => s.code === jf.item.code);
  if (!sec) {
    sec = { id: uid('sc'), code: jf.item.code, ...jf.item.spec, material: braceMaterial(dia), kgm: jf.item.kg };
    d.sections.push(sec);
  }
  const res = ensureMaster(d, name?.trim() || `FB-M${dia}`, 'brace', sec.id, braceMaterial(dia));
  if (res.id) {
    const m = d.master.find((x) => x.id === res.id);
    if (m && !m.note) m.note = braceNote(r);
  }
  return res;
}

// ── ブレースシート (フルサト P157-158, 材質 SN400B) ─────────────────
/** Kích thước ブレースシート: t, A–G (mm), d = đường kính lỗ. stock = 在庫品 */
export interface BraceSheet {
  code: string;
  t: number;
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  F: number;
  G: number;
  d: number;
  stock: boolean;
  /** dùng cho ブレース M… (取付ボルト) */
  bolt: number;
}
const bs = (code: string, t: number, A: number, B: number, C: number, D: number, E: number, F: number, G: number, d: number, stock: boolean): BraceSheet => ({
  code, t, A, B, C, D, E, F, G, d, stock, bolt: d < 15 ? 12 : d < 19 ? 16 : d < 23 ? 20 : 22,
});
export const BRACE_SHEET: BraceSheet[] = [
  bs('M16', 6, 125, 80, 45, 110, 65, 45, 50, 17, true),
  bs('M16W', 6, 150, 105, 45, 110, 65, 45, 25, 17, true),
  bs('M16-09', 9, 125, 80, 45, 110, 65, 45, 50, 17, true),
  bs('M20', 9, 150, 100, 50, 120, 70, 50, 40, 21.5, true),
  bs('M20W', 9, 180, 130, 50, 120, 70, 50, 25, 21.5, true),
  bs('M22', 9, 180, 125, 55, 135, 80, 55, 35, 23.5, true),
  bs('M16-100W', 6, 150, 105, 45, 145, 100, 45, 60, 17, true),
  bs('M16-120WW', 6, 180, 135, 45, 165, 120, 45, 50, 17, true),
  bs('M20-130W', 9, 180, 130, 50, 180, 130, 50, 70, 21.5, true),
  bs('M12', 6, 100, 65, 35, 90, 55, 35, 40, 13, false),
  bs('M16-80 (T-9)', 9, 125, 80, 45, 125, 80, 45, 65, 17, false),
  bs('M16-110', 6, 125, 80, 45, 155, 110, 45, 95, 17, false),
  bs('M16-120', 6, 125, 80, 45, 165, 120, 45, 105, 17, false),
  bs('M16-150', 6, 125, 80, 45, 195, 150, 45, 135, 17, false),
  bs('M16-120-09', 9, 125, 80, 45, 165, 120, 45, 105, 17, false),
  bs('M20-130', 9, 150, 100, 50, 180, 130, 50, 100, 21.5, false),
  bs('M20-150', 9, 150, 100, 50, 200, 150, 50, 120, 21.5, false),
];
/** ブレースシート gợi ý theo ねじ呼び ブレース: M12–M16 → series M16, M18–M20 → M20, M22 → M22 */
export const sheetForBrace = (d: number) => BRACE_SHEET.find((s) => s.code === (d <= 16 ? 'M16' : d <= 20 ? 'M20' : 'M22'));
/**
 * Đa giác ブレースシート trong hệ (u dọc trục giằng từ mép bản phía khung, v vuông góc), mm.
 * Diễn giải: đáy rộng A (cạnh hàn vào khung), đỉnh rộng B, cao D; vai ở E; lỗ d cách đỉnh C.
 */
export function sheetPolygon(s: BraceSheet): { pts: [number, number][]; hole: { u: number; r: number } } {
  return {
    pts: [
      [0, -s.A / 2],
      [s.E, -s.A / 2],
      [s.D, -s.B / 2],
      [s.D, s.B / 2],
      [s.E, s.A / 2],
      [0, s.A / 2],
    ],
    hole: { u: s.D - s.C, r: s.d / 2 },
  };
}
