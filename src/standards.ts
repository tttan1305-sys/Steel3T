// Tiêu chuẩn ngành kết cấu thép Nhật: 幅厚比 (tỉ số bề rộng / chiều dày) và 部材種別 FA–FD
// Theo 昭55建告第1791号 (ルート3) – như bảng trong JFE 鋼構造設計便覧 2024 (5章).
import type { SectionSpec } from './model';
import { JIS_MATERIALS } from './jis';

export type WTRank = 'FA' | 'FB' | 'FC' | 'FD';
export interface WTItem {
  part: string; // cánh / bụng / thành ống
  label: string; // vd b/tf
  ratio: number;
  limits: [number, number, number]; // giới hạn FA, FB, FC (đã nhân hệ số F)
  rank: WTRank;
}
export interface WTResult {
  rank: WTRank;
  items: WTItem[];
  basis: string;
}

export const materialF = (code: string) => JIS_MATERIALS.find((m) => m.code === code)?.F;

const rankOf = (r: number, lim: [number, number, number]): WTRank => (r <= lim[0] ? 'FA' : r <= lim[1] ? 'FB' : r <= lim[2] ? 'FC' : 'FD');
const worst = (rs: WTRank[]): WTRank => (['FD', 'FC', 'FB', 'FA'] as WTRank[]).find((x) => rs.includes(x)) ?? 'FA';
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * 部材種別 theo 幅厚比. role: 'column' (柱) | 'beam' (梁).
 * H: cánh b = B/2, bụng d = H − 2tf. 角形鋼管: B/t. 円形鋼管: D/t.
 */
export function widthThicknessRank(spec: SectionSpec, F: number, role: 'column' | 'beam'): WTResult | null {
  const k = Math.sqrt(235 / F);
  const m = (a: number, b: number, c: number): [number, number, number] => [r1(a * k), r1(b * k), r1(c * k)];
  if (spec.type === 'I' && spec.tf > 0 && spec.tw > 0) {
    const fl = spec.b / 2 / spec.tf;
    const wb = (spec.h - 2 * spec.tf) / spec.tw;
    const limF = role === 'column' ? m(9.5, 12, 15.5) : m(9, 11, 15.5);
    const limW = role === 'column' ? m(43, 45, 48) : m(60, 65, 71);
    const items: WTItem[] = [
      { part: 'Cánh', label: 'b/tf', ratio: r1(fl), limits: limF, rank: rankOf(fl, limF) },
      { part: 'Bụng', label: 'd/tw', ratio: r1(wb), limits: limW, rank: rankOf(wb, limW) },
    ];
    return { rank: worst(items.map((i) => i.rank)), items, basis: `H形鋼 ${role === 'column' ? '柱' : '梁'} · √(235/F)=${k.toFixed(3)}` };
  }
  if (spec.type === 'Box' && spec.tw > 0) {
    const r = Math.max(spec.h, spec.b) / spec.tw;
    const lim = m(33, 37, 48);
    return { rank: rankOf(r, lim), items: [{ part: 'Thành ống', label: 'B/t', ratio: r1(r), limits: lim, rank: rankOf(r, lim) }], basis: '角形鋼管' };
  }
  if (spec.type === 'Pipe' && spec.tw > 0) {
    const r = spec.h / spec.tw;
    const kk = 235 / F;
    const lim: [number, number, number] = [r1(50 * kk), r1(70 * kk), r1(100 * kk)];
    return { rank: rankOf(r, lim), items: [{ part: 'Thành ống', label: 'D/t', ratio: r1(r), limits: lim, rank: rankOf(r, lim) }], basis: '円形鋼管 · (235/F)' };
  }
  return null;
}

/** Chú giải các tiêu chuẩn chính dùng trong app (hiển thị ở thư viện). */
export const JP_STANDARDS: { code: string; title: string; note: string }[] = [
  { code: '建築基準法 第37条', title: '指定建築材料', note: 'Vật liệu chịu lực chính phải theo JIS hoặc có 大臣認定 (BCR, BCP, SN…).' },
  { code: '平12建告第2464号', title: '鋼材等の許容応力度の基準強度 F', note: 'F của SN400 = 235, SN490 = 325 (t ≤ 40). Thép 大臣認定 dùng F ghi trong chứng nhận.' },
  { code: '昭55建告第1791号', title: '幅厚比 · 部材種別 FA–FD', note: 'Phân hạng cột/dầm theo b/t → hệ số Ds (ルート3). App tự tính ở Master.' },
  { code: '平12建告第1464号', title: '溶接部の品質', note: 'Sai lệch mối hàn, ずれ (食い違い), アンダーカット.' },
  { code: 'JASS 6', title: '鉄骨工事 (建築学会)', note: 'Lỗ bulông, khoảng cách, 高力ボルト 締付け, kiểm tra.' },
  { code: 'JIS B 1186 / 大臣認定 S10T', title: '高力ボルト F10T · トルシア形 S10T', note: 'Chiều dài 首下 = 締付け長さ + độ dài thêm (M16 25 · M20 30 · M22 35 · M24 40), làm tròn 5 mm.' },
  { code: 'JIS B 1220', title: '構造用アンカーボルト ABR / ABM', note: 'ABR: ren cán M16–M48 (SNR). ABM: ren tiện M24–M100. Độ dài chuẩn ℓt = 25d.' },
  { code: 'JIS A 5540 / 5541', title: '建築用ターンバックル (筋かい)', note: 'Giằng tròn phải dùng ターンバックル JIS, đầu nối 保有耐力接合.' },
  { code: 'SCSS-H97', title: '鉄骨構造標準接合部 H形鋼編', note: 'Mối nối mẫu GJ / CJ / BJ (thư viện 継手).' },
  { code: '冷間成形角形鋼管設計・施工マニュアル 2018', title: 'BCR / BCP / STKR', note: 'STKR dùng làm cột phải tăng ứng lực thiết kế (ルート1-2: ×1.1–1.4).' },
];

/** 通しダイアフラム: 出寸法 e = 25 (tc < 28) / 30 (tc ≥ 28) – 冷間成形角形鋼管設計・施工マニュアル 2018 (日建連 Q&A A-2-18).
 *  Chiều dày: 通し = t cánh dầm +2 size, 内 = +1 size (A-3-12). Khoảng hở 2 diaphragm ≥ 150 và ≥ 10t để UT (A-4-7). */
export const diaphragmOverhang = (tc: number) => (tc >= 28 ? 30 : 25);
export const PL_T = [6, 9, 12, 16, 19, 22, 25, 28, 32, 36, 40, 45, 50, 55, 60, 65, 70];
/** Tăng chiều dày bản theo dãy chuẩn n size */
/** Bản PL nhỏ nhất trong dãy chiều dày chuẩn ≥ t */
export const plateAtLeast = (t: number) => PL_T.find((x) => x >= t - 1e-6) ?? Math.ceil(t);
export const plateUp = (t: number, n: number) => {
  const i = PL_T.findIndex((x) => x >= t);
  return i < 0 ? t : PL_T[Math.min(PL_T.length - 1, i + n)];
};
