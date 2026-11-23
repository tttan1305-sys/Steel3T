// 二次部材 (REAL4 Step20–24): スリーブ · かさ上げ材 · デッキ · 仮設金物 · スタッド
import { Member, Project, Section, Vec3, gridPositions, kgPerM, uid } from './model';
import type { FieldSpec, FieldVal } from './moya';
import { matCats } from './moya';

export interface Rec { id: string; name: string; v: Record<string, FieldVal> }
const nums = (s: FieldVal) => String(s ?? '').split(/[x×*ｘ]/i).map((t) => parseFloat(t)).filter((n) => !isNaN(n));
const code = (s: FieldVal) => String(s ?? '').replace(/^\d+-/, '');
const has = (v: FieldVal, s: string) => String(v ?? '').includes(s);

// ================= マスター =================
const isRing = (v: Record<string, FieldVal>) => has(v.type, 'ハイリング');
export const SLEEVE_FIELDS: FieldSpec[] = [
  { k: 'type', label: '種類', t: 'sel', opts: ['1-スリーブ', '2-ハイリング'] },
  { k: 'dia', label: '呼び径', t: 'num' },
  { k: 'model', label: '型式', t: 'sel', opts: ['ハイリングⅡ 100A', 'ハイリングⅡ 150A', 'ハイリングⅡ 200A', 'ハイリングⅡ 250A', 'ハイリングⅡ 300A'], when: isRing },
  { k: 'pipe', label: 'ｽﾘｰﾌﾞ管', t: 'sel', opts: ['1-なし', '2-あり'], when: (v) => !isRing(v) },
  { k: 'pipeMat', label: 'ｽﾘｰﾌﾞ管 材種', t: 'sel', opts: ['16-STK', '17-SGP'], when: (v) => !isRing(v) && has(v.pipe, 'あり') },
  { k: 'pipeSize', label: 'ｽﾘｰﾌﾞ管 ｻｲｽﾞ', t: 'jis', cats: () => ['pipe'], hint: '外径×t (190.7x4.5)', when: (v) => !isRing(v) && has(v.pipe, 'あり') },
  { k: 'pipeGrade', label: 'ｽﾘｰﾌﾞ管 材質', t: 'sel', opts: ['55-STK400', '56-STK490', '1-SS400'], when: (v) => !isRing(v) && has(v.pipe, 'あり') },
  { k: 'reinf', label: '補強方法', t: 'sel', opts: ['1-なし', '2-断面欠損表参照'], when: (v) => !isRing(v) },
  { k: 'plMat', label: '補強ﾌﾟﾚｰﾄ 材種', t: 'sel', opts: ['1-プレート'], when: (v) => !isRing(v) && has(v.reinf, '参照') },
  { k: 'plGrade', label: '補強ﾌﾟﾚｰﾄ 材質', t: 'sel', opts: ['梁ｳｪﾌﾞと同じ材質', '1-SS400', '2-SN400B', '3-SN490B'], when: (v) => !isRing(v) && has(v.reinf, '参照') },
  { k: 'plDia', label: '補強ﾌﾟﾚｰﾄ 径', t: 'num', hint: 'lỗ trên tấm', when: (v) => !isRing(v) && has(v.reinf, '参照') },
  { k: 'plT', label: '補強ﾌﾟﾚｰﾄ 板厚', t: 'num', when: (v) => !isRing(v) && has(v.reinf, '参照') },
];
const hasJP = (v: Record<string, FieldVal>) => has(v.jp, 'あり');
export const KASA_FIELDS: FieldSpec[] = [
  { k: 'mat', label: '材種', t: 'sel', opts: ['5-C形鋼', '3-L形鋼', '8-平鋼'] },
  { k: 'size', label: 'サイズ', t: 'jis', cats: matCats, hint: 'C形鋼: H×B×C×t (100x50x20x2.3)' },
  { k: 'grade', label: '材質', t: 'sel', opts: ['4-SSC400', '1-SS400'] },
  { k: 'combo', label: '鋼材組み合わせ', t: 'sel', opts: ['1-[', '2-]'] },
  { k: 'gapF', label: 'ｽﾌﾟﾗｲｽとのすきま FLG', t: 'num' },
  { k: 'gapW', label: 'ｽﾌﾟﾗｲｽとのすきま WEB', t: 'num' },
  { k: 'gapN', label: 'ｽﾌﾟﾗｲｽの板がないときのすきま', t: 'num' },
  { k: 'weldL', label: '溶接長さ', t: 'num' },
  { k: 'weldP', label: '溶接間隔', t: 'num' },
  { k: 'jp', label: '継手部板', t: 'sel', opts: ['1-なし', '2-あり'] },
  { k: 'jpMat', label: '継手部板 材種', t: 'sel', opts: ['1-プレート'], when: hasJP },
  { k: 'jpT', label: '継手部板 サイズ', t: 'num', when: hasJP },
  { k: 'jpW', label: '継手部板 板幅', t: 'num', when: hasJP },
  { k: 'jpGrade', label: '継手部板 材質', t: 'sel', opts: ['1-SS400'], when: hasJP },
  { k: 'jpLen', label: '継手部板 長さ', t: 'sel', opts: ['1-溶接しろ'], when: hasJP },
  { k: 'jpWeld', label: '溶接しろ', t: 'num', when: hasJP },
];
const dk = (n: string) => (v: Record<string, FieldVal>) => has(v.type, n);
export const DECK_FIELDS: FieldSpec[] = [
  { k: 'type', label: '種類', t: 'sel', opts: ['1-継手部デッキ受け', '2-仕口部デッキ受け', '3-デッキプレート'] },
  { k: 'style', label: 'タイプ', t: 'sel', opts: ['1-片側', '2-両側'], when: dk('仕口') },
  { k: 'mat', label: '材種', t: 'sel', opts: ['8-平鋼', '3-L形鋼', '169-日鉄ｽｰﾊﾟｰE ﾃﾞｯｷM', '170-QLデッキ'] },
  { k: 'size', label: 'サイズ', t: 'text', hint: '平鋼: t×W (6x50) · デッキ: EZ-50-1.2x600x50-Z12' },
  { k: 'grade', label: '材質', t: 'sel', opts: ['1-SS400'] },
  { k: 'bGap', label: '梁側 すきま', t: 'num', when: dk('継手') },
  { k: 'bOver', label: '梁側 はみ出し長さ', t: 'num', when: dk('継手') },
  { k: 'cGap', label: '柱側 すきま', t: 'num', when: dk('継手') },
  { k: 'cOver', label: '柱側 はみ出し長さ', t: 'num', when: dk('継手') },
  { k: 'gap', label: 'すきま', t: 'num', when: dk('仕口') },
  { k: 'inset', label: '端部の入り', t: 'num', when: dk('仕口') },
  { k: 'limit', label: '取り付け間隔制限', t: 'num', when: dk('仕口') },
  { k: 'kgm2', label: '単位重量 (kg/m²)', t: 'num', when: dk('プレート') },
];
const tk = (n: string) => (v: Record<string, FieldVal>) => has(v.type, n);
export const TEMP_FIELDS: FieldSpec[] = [
  { k: 'type', label: '種類', t: 'sel', opts: ['1-ネットフック', '2-吊ピース', '3-吊穴', '5-親綱ピース', '6-梁下がり止めピース'] },
  { k: 'style', label: 'タイプ', t: 'sel', opts: ['1-V型', '2-U型', '1-既製品', '1-梁 吊穴', '2-柱 吊穴', '1-柱', '2-梁'] },
  { k: 'mat', label: '材種', t: 'sel', opts: ['12-丸鋼', '1-プレート'], when: (v) => !tk('吊穴')(v) },
  { k: 'size', label: 'サイズ', t: 'num', when: (v) => !tk('吊穴')(v) },
  { k: 'grade', label: '材質', t: 'sel', opts: ['1-SS400'], when: (v) => !tk('吊穴')(v) },
  { k: 'l1', label: '長さ①', t: 'num', when: (v) => tk('ネット')(v) || tk('親綱')(v) },
  { k: 'l2', label: '長さ②', t: 'num', when: (v) => tk('ネット')(v) || tk('親綱')(v) },
  { k: 'r', label: '半径', t: 'num', when: (v) => !tk('吊穴')(v) },
  { k: 'ang', label: '角度', t: 'num', when: tk('ネット') },
  { k: 'gap', label: 'すきま', t: 'num', when: (v) => tk('ネット')(v) || tk('下がり')(v) },
  { k: 'weld', label: '溶接長', t: 'num', when: (v) => tk('ネット')(v) || tk('親綱')(v) },
  { k: 'pitch', label: '配置ピッチ', t: 'num', when: tk('ネット'), hint: '作図パラメーター' },
  { k: 'w', label: '板幅 / 幅', t: 'num', when: (v) => tk('吊ピース')(v) || tk('下がり')(v) },
  { k: 'h', label: '高さ', t: 'num', when: (v) => tk('吊ピース')(v) || tk('下がり')(v) },
  { k: 'hole', label: '径', t: 'num', when: (v) => tk('吊ピース')(v) || tk('吊穴')(v) || tk('下がり')(v) },
  { k: 'slit', label: '切断スリット', t: 'sel', opts: ['1-なし', '2-あり'], when: tk('吊ピース') },
  { k: 'pat', label: '配置パターン', t: 'sel', opts: ['1-中央', '2-端部距離'], when: tk('吊ピース') },
  { k: 'endD', label: '端部距離', t: 'num', when: (v) => tk('吊ピース')(v) || tk('吊穴')(v) },
  { k: 'holePos', label: '吊穴位置', t: 'sel', opts: ['1-タイプ1', '2-タイプ2'], when: tk('吊穴') },
  { k: 'holeSet', label: '吊穴位置の設定', t: 'sel', opts: ['1-通常'], when: tk('吊穴') },
  { k: 'hx', label: '穴位置X', t: 'num', when: tk('下がり') },
  { k: 'hy', label: '穴位置Y', t: 'num', when: tk('下がり') },
  { k: 'notch', label: '切り欠き幅', t: 'num', when: tk('下がり') },
  { k: 'seat', label: '梁受け幅', t: 'num', when: (v) => tk('下がり')(v) && has(v.style, '柱') },
  { k: 'pos', label: '位置', t: 'num', when: (v) => tk('下がり')(v) && has(v.style, '梁') },
  { k: 'len', label: '長さ', t: 'num', when: (v) => tk('下がり')(v) && has(v.style, '梁') },
];
export const STUD_FIELDS: FieldSpec[] = [
  { k: 'kind', label: '部材種類', t: 'sel', opts: ['1-H形', '2-コラム/B.BOX'] },
  { k: 'bolt', label: 'ボルトサイズ', t: 'text', hint: '径×長さ (13x80)' },
  { k: 'method', label: 'ボルト入力方法', t: 'sel', opts: ['1-片側', '2-両側'] },
  { k: 'rows', label: 'ボルト行数', t: 'num' },
  { k: 'cols', label: 'ボルト列数', t: 'num' },
  { k: 'a', label: 'ボルト間(a)', t: 'num' },
  { k: 'b', label: 'ボルト間(b)', t: 'num', hint: 'khoảng đầu tiên từ chân (第一間隔)' },
  { k: 'c', label: 'ピッチ(c)', t: 'num', hint: 'bước theo chiều cao cột' },
  { k: 'd', label: 'ピッチ(d)', t: 'num', hint: 'bước ngang trên mặt' },
  { k: 'zig', label: '千鳥', t: 'sel', opts: ['1-なし', '2-あり'] },
];

// ================= 配置データ =================
export interface SleeveItem { id: string; beam: string; q: [number, number]; master: string; base: string; ud: number; lenMode: string; ecc: string }
export interface KasaItem { id: string; beam: string; master: string; ud: number; side: string; dir: string; extL: number; extR: number }
export interface DeckArea { id: string; level: string; x1: string; x2: string; y1: string; y2: string; dir: 'x' | 'y'; master: string; inset: [number, number, number, number]; autoIn: boolean }
export interface DeckRecv { id: string; area: string; target: string; range: string; split: string; shik: string; skipKasa: boolean }
export interface TempItem { id: string; kind: 'net' | 'bhang' | 'chang' | 'hole' | 'stop' | 'rope'; master: string; ref: string; ref2?: string; opt: string; h?: number }
export interface StudItem { id: string; col: string; master: string; first: string; weld: string; del: [boolean, boolean, boolean, boolean]; zMax?: number }

export interface Sub2Data {
  sleeves: Rec[]; kasa: Rec[]; decks: Rec[]; temps: Rec[]; studs: Rec[];
  sleeveItems: SleeveItem[]; kasaItems: KasaItem[]; deckAreas: DeckArea[]; deckRecv: DeckRecv[]; tempItems: TempItem[]; studItems: StudItem[];
}
const r = (name: string, v: Record<string, FieldVal>): Rec => ({ id: uid('s2'), name, v });
export function defaultSub2(): Sub2Data {
  return {
    sleeves: [
      r('φ200', { type: '1-スリーブ', dia: 200, pipe: '2-あり', pipeMat: '16-STK', pipeSize: '190.7x4.5', pipeGrade: '55-STK400', reinf: '2-断面欠損表参照', plMat: '1-プレート', plGrade: '梁ｳｪﾌﾞと同じ材質', plDia: 205, plT: 9 }),
      r('φ250', { type: '2-ハイリング', dia: 250, model: 'ハイリングⅡ 250A' }),
    ],
    kasa: [r('C100', { mat: '5-C形鋼', size: '100x50x20x2.3', grade: '4-SSC400', combo: '1-[', gapF: 15, gapW: 15, gapN: 40, weldL: 30, weldP: 800, jp: '2-あり', jpMat: '1-プレート', jpT: 3.2, jpW: 50, jpGrade: '1-SS400', jpLen: '1-溶接しろ', jpWeld: 20 })],
    decks: [
      r('ﾃﾞｯｷS', { type: '1-継手部デッキ受け', mat: '8-平鋼', size: '6x50', grade: '1-SS400', bGap: 10, bOver: 50, cGap: 50, cOver: 50 }),
      r('ﾃﾞｯｷC', { type: '2-仕口部デッキ受け', style: '1-片側', mat: '8-平鋼', size: '6x50', grade: '1-SS400', gap: 50, inset: 20, limit: 120 }),
      r('ﾃﾞｯｷPL', { type: '3-デッキプレート', mat: '169-日鉄ｽｰﾊﾟｰE ﾃﾞｯｷM', size: 'EZ-50-1.2x600x50-Z12', grade: '1-SS400', kgm2: 13.3 }),
    ],
    temps: [
      r('ﾈｯﾄﾌｯｸ-13', { type: '1-ネットフック', style: '1-V型', mat: '12-丸鋼', size: 13, grade: '1-SS400', l1: 80, l2: 60, r: 20, ang: 30, gap: 10, weld: 50, pitch: 1000 }),
      r('吊ピース-9', { type: '2-吊ピース', style: '1-既製品', mat: '1-プレート', size: 9, w: 130, grade: '1-SS400', h: 100, r: 50, hole: 42, slit: '2-あり', pat: '2-端部距離', endD: 500 }),
      r('吊り穴-梁', { type: '3-吊穴', style: '1-梁 吊穴', holePos: '1-タイプ1', holeSet: '1-通常', hole: 30, endD: 300 }),
      r('吊り穴-間柱', { type: '3-吊穴', style: '2-柱 吊穴', holePos: '2-タイプ2', holeSet: '1-通常', hole: 30, endD: 300 }),
      r('下がり止め-柱', { type: '6-梁下がり止めピース', style: '1-柱', mat: '1-プレート', size: 12, grade: '1-SS400', gap: 2, h: 120, w: 85, hx: 30, hy: 30, notch: 15, r: 40, hole: 30, seat: 20 }),
      r('下がり止め-梁', { type: '6-梁下がり止めピース', style: '2-梁', mat: '1-プレート', size: 12, grade: '1-SS400', gap: 2, h: 70, w: 140, hx: 30, hy: 30, notch: 15, r: 35, hole: 30, pos: 42, len: 50 }),
      r('親ピース', { type: '5-親綱ピース', style: '2-U型', mat: '12-丸鋼', size: 13, grade: '1-SS400', l1: 90, l2: 37, r: 25, weld: 100 }),
    ],
    studs: [r('STD1', { kind: '2-コラム/B.BOX', bolt: '13x80', method: '1-片側', rows: 3, cols: 2, a: 0, b: 50, c: 150, d: 60, zig: '1-なし' })],
    sleeveItems: [], kasaItems: [], deckAreas: [], deckRecv: [], tempItems: [], studItems: [],
  };
}
const EMPTY: Sub2Data = { sleeves: [], kasa: [], decks: [], temps: [], studs: [], sleeveItems: [], kasaItems: [], deckAreas: [], deckRecv: [], tempItems: [], studItems: [] };
export const sub2Of = (p: Project): Sub2Data => ({ ...EMPTY, ...(p.sub2 ?? {}) });
export function ensureSub2(d: Project): Sub2Data {
  if (!d.sub2) d.sub2 = defaultSub2();
  const s = d.sub2;
  for (const k of Object.keys(EMPTY) as (keyof Sub2Data)[]) if (!s[k]) (s as unknown as Record<string, unknown[]>)[k] = [];
  return s;
}

// ================= Hình học dầm / cột =================
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface BeamInfo {
  id: string; label: string; name: string; level: string; sub: boolean;
  o: Vec3; u: Vec3; w: Vec3; L: number; top: number; sec: Section;
  /** 継手 (t theo trục, chiều dài ｽﾌﾟﾗｲｽ) */
  splices: { t: number; len: number }[];
}
export interface ColInfo { id: string; label: string; name: string; c: [number, number]; z0: number; z1: number; sec: Section; rot: number; base: string; top: string; post: boolean }

/** tên giao điểm gần nhất (vd X1Y2) */
function ptName(p: Project, x: number, y: number): string {
  const near = (lines: { id: string; name: string }[], v: number) => {
    const pos = gridPositions(lines as Project['gridsX']);
    let best = '', bd = 600;
    for (const g of lines) { const d = Math.abs((pos.get(g.id) ?? 1e9) - v); if (d < bd) { bd = d; best = g.name; } }
    return best;
  };
  const gx = near(p.gridsX, x), gy = near(p.gridsY, y);
  return gx && gy ? gx + gy : `(${Math.round(x)},${Math.round(y)})`;
}

export function beamInfos(p: Project, members: Member[]): BeamInfo[] {
  const by = new Map<string, Member[]>();
  for (const m of members) if (m.kind === 'beam' && m.source && m.part !== 'shikuchi') by.set(m.source, [...(by.get(m.source) ?? []), m]);
  const out: BeamInfo[] = [];
  for (const bm of p.beams) {
    const ms = by.get(bm.id);
    if (!ms?.length) continue;
    const m0 = ms[0];
    const d: Vec3 = [m0.b[0] - m0.a[0], m0.b[1] - m0.a[1], 0];
    const dl = Math.hypot(d[0], d[1]);
    if (dl < 1) continue;
    const u: Vec3 = [d[0] / dl, d[1] / dl, 0];
    const t = (q: Vec3) => (q[0] - m0.a[0]) * u[0] + (q[1] - m0.a[1]) * u[1];
    let t0 = Infinity, t1 = -Infinity;
    for (const m of ms) for (const q of [m.a, m.b]) { t0 = Math.min(t0, t(q)); t1 = Math.max(t1, t(q)); }
    const sorted = [...ms].sort((a, b) => Math.min(t(a.a), t(a.b)) - Math.min(t(b.a), t(b.b)));
    const splices: { t: number; len: number }[] = [];
    for (let i = 0; i + 1 < sorted.length; i++) {
      const e = Math.max(t(sorted[i].a), t(sorted[i].b)), s = Math.min(t(sorted[i + 1].a), t(sorted[i + 1].b));
      const jn = sorted[i].joints?.find((j) => j.pos === 'mid' && !j.dup)?.name ?? sorted[i + 1].joints?.find((j) => j.pos === 'mid')?.name;
      const jt = p.joints.find((j) => j.name === jn);
      splices.push({ t: (e + s) / 2 - t0, len: jt?.flangeL || 400 });
    }
    const sec = m0.section;
    const o: Vec3 = [m0.a[0] + u[0] * t0, m0.a[1] + u[1] * t0, 0];
    const zc = (m0.a[2] + m0.b[2]) / 2;
    const mi = p.master.find((x) => x.id === bm.memberId);
    const name = mi?.name ?? m0.name ?? '梁';
    out.push({
      id: bm.id, name, level: bm.level, sub: mi?.role === 'sub',
      label: `${name} ${ptName(p, o[0], o[1])}–${ptName(p, o[0] + u[0] * (t1 - t0), o[1] + u[1] * (t1 - t0))}`,
      o, u, w: [-u[1], u[0], 0], L: t1 - t0, top: zc + sec.h / 2, sec, splices,
    });
  }
  return out;
}
export function colInfos(p: Project, members: Member[]): ColInfo[] {
  const by = new Map<string, Member[]>();
  for (const m of members) if (m.kind === 'column' && m.source && m.part !== 'shikuchi') by.set(m.source, [...(by.get(m.source) ?? []), m]);
  const out: ColInfo[] = [];
  for (const c of p.columns) {
    const ms = by.get(c.id);
    if (!ms?.length) continue;
    const zs = ms.flatMap((m) => [m.a[2], m.b[2]]);
    const mi = p.master.find((x) => x.id === c.memberId);
    const name = mi?.name ?? ms[0].name ?? '柱';
    out.push({ id: c.id, name, label: `${name} ${ptName(p, ms[0].a[0], ms[0].a[1])}`, c: [ms[0].a[0], ms[0].a[1]], z0: Math.min(...zs), z1: Math.max(...zs), sec: ms[0].section, rot: c.rotation || 0, base: c.base, top: c.top, post: mi?.role === 'post' });
  }
  return out;
}
/** đường phụ: trục g + khoảng cách d → giao với dầm */
export function lineHits(p: Project, beams: BeamInfo[], level: string, grid: string, d: number) {
  const isX = grid.startsWith('gx:');
  const pos = gridPositions(isX ? p.gridsX : p.gridsY).get(grid.slice(3));
  if (pos == null) return [];
  const c = pos + d;
  const out: { beam: BeamInfo; q: [number, number] }[] = [];
  for (const b of beams) {
    if (b.level !== level) continue;
    const ui = isX ? b.u[0] : b.u[1];
    if (Math.abs(ui) < 0.2) continue;
    const t = (c - (isX ? b.o[0] : b.o[1])) / ui;
    if (t < 30 || t > b.L - 30) continue;
    out.push({ beam: b, q: [b.o[0] + b.u[0] * t, b.o[1] + b.u[1] * t] });
  }
  return out;
}

// ================= Sinh cấu kiện =================
type Out = Member[];
const solid = (id: string, t: number, w: number, grade = 'SS400'): Section => ({ id, code: `PL-${t}x${w}`, type: 'Box', h: w, b: t, tw: Math.min(t, w) / 2, tf: Math.min(t, w) / 2, c: 0, material: grade });
const rod = (d: number, grade = 'SS400'): Section => ({ id: `rod${d}`, code: `RB-${d}`, type: 'Rod', h: d, b: d, tw: d / 2, tf: d / 2, c: 0, material: grade });
const pipe = (od: number, t: number, grade: string, kgm?: number): Section => ({ id: `p${od}x${t}`, code: `P-${od}x${t}`, type: 'Pipe', h: od, b: od, tw: t, tf: t, c: 0, material: grade, kgm });
function emit(out: Out, sec: Section, a: Vec3, b: Vec3, up: Vec3, name: string, source: string) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  if (L < 0.5 || [...a, ...b].some((v) => !isFinite(v))) return;
  out.push({ id: `s2_${out.length}_${source}`, kind: 'misc', section: sec, a, b, up, name, mark: name, length: Math.round(L), weight: (kgPerM(sec) * L) / 1000, source, part: 'piece' } as Member);
}
/** tấm đặc: tâm c, trục (dài) ax, rộng theo wd, dày theo hướng còn lại */
function plate(out: Out, c: Vec3, ax: Vec3, len: number, wd: Vec3, w: number, t: number, name: string, src: string, grade?: string) {
  emit(out, solid(name, t, w, grade), add(c, mul(ax, -len / 2)), add(c, mul(ax, len / 2)), wd, name, src);
}

function sleeveMembers(p: Project, s: Sub2Data, beams: Map<string, BeamInfo>, out: Out) {
  for (const it of s.sleeveItems) {
    const b = beams.get(it.beam), m = s.sleeves.find((x) => x.name === it.master);
    if (!b || !m) continue;
    const t = (it.q[0] - b.o[0]) * b.u[0] + (it.q[1] - b.o[1]) * b.u[1];
    const zc = has(it.base, '梁芯') ? b.top - b.sec.h / 2 + it.ud : b.top + it.ud;
    const c: Vec3 = [b.o[0] + b.u[0] * t, b.o[1] + b.u[1] * t, zc];
    const dia = Number(m.v.dia) || 200;
    const web = b.sec.tw || 9;
    if (isRing(m.v)) {
      // ハイリング: vòng thép rèn hàn trong lỗ bụng
      const od = Math.round(dia * 1.55), len = web + 24;
      emit(out, pipe(od, (od - dia) / 2, 'SN490B'), add(c, mul(b.w, -len / 2)), add(c, mul(b.w, len / 2)), [0, 0, 1], m.name, it.id);
      continue;
    }
    if (has(m.v.pipe, 'あり')) {
      const [od = dia - 10, pt = 4.5] = nums(m.v.pipeSize);
      const len = has(it.lenMode, 'ウェブ') ? web + 50 : b.sec.b;
      emit(out, pipe(od, pt, code(m.v.pipeGrade) || 'STK400'), add(c, mul(b.w, -len / 2)), add(c, mul(b.w, len / 2)), [0, 0, 1], m.name, it.id);
    }
    if (has(m.v.reinf, '参照')) {
      const pd = Number(m.v.plDia) || dia + 5, pt = Number(m.v.plT) || 9;
      const od = Math.min(b.sec.h - 2 * b.sec.tf - 20, Math.round(pd * 1.8));
      for (const sg of [-1, 1]) {
        const cc = add(c, mul(b.w, sg * (web / 2 + pt / 2)));
        emit(out, pipe(od, (od - pd) / 2, has(m.v.plGrade, '梁') ? b.sec.material : code(m.v.plGrade)), add(cc, mul(b.w, -pt / 2)), add(cc, mul(b.w, pt / 2)), [0, 0, 1], `${m.name}-PL`, it.id);
      }
    }
  }
}

export function kasaSegs(b: BeamInfo, m: Rec, it: KasaItem): [number, number][] {
  const gN = Number(m.v.gapN) || 40, gF = Number(m.v.gapF) || 15;
  const cuts = b.splices.map((s) => [s.t - s.len / 2 - gF, s.t + s.len / 2 + gF] as [number, number]);
  const segs: [number, number][] = [];
  let a = gN - it.extL;
  for (const [c0, c1] of cuts) { if (c0 > a) segs.push([a, c0]); a = Math.max(a, c1); }
  const e = b.L - gN + it.extR;
  if (e > a) segs.push([a, e]);
  return segs.filter(([x, y]) => y - x > 50);
}
function kasaSection(m: Rec): Section {
  const n = nums(m.v.size);
  if (has(m.v.mat, '平鋼')) { const [t = 9, w = 50] = n; return solid(`kasa:${m.name}`, t, w, code(m.v.grade)); }
  if (has(m.v.mat, 'L形鋼')) { const [A = 50, B = 50, t = 6] = n; return { id: `kasa:${m.name}`, code: `L-${A}x${B}x${t}`, type: 'L', h: A, b: B, tw: t, tf: t, c: 0, material: code(m.v.grade) }; }
  const [h = 100, bb = 50, c = 20, t = 2.3] = n;
  return { id: `kasa:${m.name}`, code: `C-${h}x${bb}x${c}x${t}`, type: 'C', h, b: bb, tw: t, tf: t, c, material: code(m.v.grade) };
}
/** chiều cao かさ上げ (mm) trên mặt dầm */
export const kasaHeight = (m: Rec) => { const s = kasaSection(m); return s.type === 'C' ? s.b : s.type === 'Box' ? s.b : s.h; };
function kasaMembers(s: Sub2Data, beams: Map<string, BeamInfo>, out: Out) {
  for (const it of s.kasaItems) {
    const b = beams.get(it.beam), m = s.kasa.find((x) => x.name === it.master);
    if (!b || !m) continue;
    const sec = kasaSection(m);
    const H = kasaHeight(m);
    const ref = b.top + it.ud;
    const zc = has(it.side, '下側') ? ref + H / 2 : has(it.side, '上側') ? ref - H / 2 : ref;
    // 横下: bụng nằm trên, mở xuống (x = up × trục = −z); 横上: ngược lại
    const up: Vec3 = sec.type === 'C' ? (has(it.dir, '横下') ? b.w : mul(b.w, -1)) : sec.type === 'Box' ? b.w : [0, 0, 1];
    const at = (t: number): Vec3 => [b.o[0] + b.u[0] * t, b.o[1] + b.u[1] * t, zc];
    for (const [t0, t1] of kasaSegs(b, m, it)) emit(out, sec, at(t0), at(t1), up, m.name, it.id);
    if (has(m.v.jp, 'あり'))
      for (const sp of b.splices) {
        const gF = Number(m.v.gapF) || 15, wl = Number(m.v.jpWeld) || 20;
        const len = sp.len + 2 * gF + 2 * wl;
        const c = at(sp.t);
        plate(out, [c[0], c[1], zc + H / 2 + (Number(m.v.jpT) || 3.2) / 2], b.u, len, b.w, Number(m.v.jpW) || 50, Number(m.v.jpT) || 3.2, `${m.name}-JP`, it.id);
      }
  }
}

export interface DeckRect { x0: number; x1: number; y0: number; y1: number; z: number }
export function deckRect(p: Project, a: DeckArea, beams: BeamInfo[]): DeckRect | null {
  const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
  const X = [gx.get(a.x1), gx.get(a.x2)], Y = [gy.get(a.y1), gy.get(a.y2)];
  if (X.some((v) => v == null) || Y.some((v) => v == null)) return null;
  const lv = p.levels.find((l) => l.id === a.level);
  let [x0, x1] = [Math.min(X[0]!, X[1]!), Math.max(X[0]!, X[1]!)], [y0, y1] = [Math.min(Y[0]!, Y[1]!), Math.max(Y[0]!, Y[1]!)];
  // 範囲修正: 梁内面 (tự động) + chỉnh tay
  const half = (along: 'x' | 'y', c: number) => {
    const bs = beams.filter((b) => b.level === a.level && Math.abs(along === 'x' ? b.u[1] : b.u[0]) < 0.1 && Math.abs((along === 'x' ? b.o[1] : b.o[0]) - c) < 300);
    return bs.length ? Math.max(...bs.map((b) => b.sec.b / 2)) : 0;
  };
  const [il, ir, ib, it] = a.inset;
  if (a.autoIn) { x0 += half('y', x0); x1 -= half('y', x1); y0 += half('x', y0); y1 -= half('x', y1); }
  x0 += il; x1 -= ir; y0 += ib; y1 -= it;
  const el = lv?.elevation ?? 0;
  const top = beams.filter((b) => b.level === a.level && Math.abs(b.top - el) < 600).map((b) => b.top);
  return { x0, x1, y0, y1, z: top.length ? Math.max(...top) : el };
}
function deckMembers(p: Project, s: Sub2Data, bl: BeamInfo[], cols: ColInfo[], out: Out) {
  const kasaOn = new Set(s.kasaItems.map((k) => k.beam));
  for (const a of s.deckAreas) {
    const R = deckRect(p, a, bl);
    const m = s.decks.find((x) => x.name === a.master);
    if (!R || !m) continue;
    const n = nums(String(m.v.size).replace(/^[A-Z]+-\d+-/, ''));
    const t = n[0] || 1.2, W = n[1] || 600, H = n[2] || 50;
    const kg = Number(m.v.kgm2) || 13.3;
    const along: Vec3 = a.dir === 'x' ? [1, 0, 0] : [0, 1, 0];
    const across: Vec3 = a.dir === 'x' ? [0, 1, 0] : [1, 0, 0];
    const [l0, l1] = a.dir === 'x' ? [R.x0, R.x1] : [R.y0, R.y1];
    const [c0, c1] = a.dir === 'x' ? [R.y0, R.y1] : [R.x0, R.x1];
    const sec: Section = { id: `deck:${m.name}`, code: `${code(m.v.size)}`, type: 'Box', h: W - 4, b: Math.max(t, 1.2), tw: Math.max(t, 1.2) / 2, tf: Math.max(t, 1.2) / 2, c: 0, material: code(m.v.grade), kgm: (kg * W) / 1000 };
    for (let c = c0; c < c1 - 1; c += W) {
      const w = Math.min(W, c1 - c);
      const mid = c + w / 2;
      const P = (l: number): Vec3 => (a.dir === 'x' ? [l, mid, R.z + H] : [mid, l, R.z + H]);
      emit(out, { ...sec, h: w - 4, kgm: (kg * w) / 1000 }, P(l0), P(l1), across, m.name, a.id);
      // gân デッキ: 1 sườn giữa tấm
      const rib: Section = { ...sec, id: 'deckrib', code: 'rib', h: H, b: 2, tw: 1, tf: 1, kgm: 0 };
      emit(out, rib, add(P(l0), [0, 0, -H / 2]), add(P(l1), [0, 0, -H / 2]), [0, 0, 1], m.name, a.id);
    }
    void along;
  }
  // デッキ受け
  for (const dr of s.deckRecv) {
    const a = s.deckAreas.find((x) => x.id === dr.area);
    const R = a && deckRect(p, a, bl);
    if (!a || !R) continue;
    const inside = (x: number, y: number, tol = 0) => x >= R.x0 - tol && x <= R.x1 + tol && y >= R.y0 - tol && y <= R.y1 + tol;
    const mS = s.decks.find((x) => x.name === dr.split), mC = s.decks.find((x) => x.name === dr.shik);
    const onlyIn = dr.range.includes('内側');
    if (mS && dr.target.includes('継手'))
      for (const b of bl) {
        if (b.level !== a.level || (dr.skipKasa && kasaOn.has(b.id))) continue;
        const [ft = 6, fw = 50] = nums(mS.v.size);
        for (const sp of b.splices) {
          const c: Vec3 = [b.o[0] + b.u[0] * sp.t, b.o[1] + b.u[1] * sp.t, b.top];
          for (const sg of [-1, 1]) {
            const off = b.sec.b / 2 + (Number(mS.v.bGap) || 10) + fw / 2;
            const q = add(c, mul(b.w, sg * off));
            if (onlyIn ? !inside(q[0], q[1]) : !inside(q[0], q[1], 1500)) continue;
            const len = sp.len + 2 * (Number(mS.v.bOver) || 50);
            plate(out, [q[0], q[1], b.top - ft / 2], b.u, len, b.w, fw, ft, mS.name, dr.id);
          }
        }
      }
    if (mC && dr.target.includes('仕口'))
      for (const c of cols) {
        if (!(c.z0 < R.z && c.z1 > R.z - 50)) continue;
        if (!inside(c.c[0], c.c[1], c.sec.b)) continue;
        const [ft = 6, fw = 50] = nums(mC.v.size);
        const gap = Number(mC.v.gap) || 50;
        const hb = c.sec.b / 2, hh = c.sec.h / 2;
        // 4 mặt cột: đặt ở phía nằm trong vùng デッキ
        const faces: [Vec3, number, number][] = [[[1, 0, 0], hh, hb], [[-1, 0, 0], hh, hb], [[0, 1, 0], hb, hh], [[0, -1, 0], hb, hh]];
        for (const [nrm, dn, wf] of faces) {
          const q: Vec3 = [c.c[0] + nrm[0] * (dn + fw / 2), c.c[1] + nrm[1] * (dn + fw / 2), R.z - ft / 2];
          if (onlyIn ? !inside(q[0], q[1]) : !inside(q[0], q[1], 1500)) continue;
          const ax: Vec3 = [Math.abs(nrm[1]), Math.abs(nrm[0]), 0];
          plate(out, q, ax, 2 * wf + 2 * gap, nrm, fw, ft, mC.name, dr.id);
        }
      }
  }
}

function tempMembers(p: Project, s: Sub2Data, beams: Map<string, BeamInfo>, bl: BeamInfo[], cols: Map<string, ColInfo>, out: Out) {
  for (const it of s.tempItems) {
    const m = s.temps.find((x) => x.name === it.master);
    if (!m) continue;
    const d = Number(m.v.size) || 13;
    if (it.kind === 'net') {
      // ネットフック: dầm biên của vùng (2 điểm chéo) – mặt ngoài, bước 配置ピッチ
      const [x0, y0, x1, y1] = it.ref.split(',').map(Number);
      const lv = it.opt;
      const pitch = Number(m.v.pitch) || 1000, l1 = Number(m.v.l1) || 80, l2 = Number(m.v.l2) || 60;
      const ang = ((Number(m.v.ang) || 30) * Math.PI) / 180;
      const X0 = Math.min(x0, x1), X1 = Math.max(x0, x1), Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1);
      for (const b of bl) {
        if (b.level !== lv) continue;
        const mid: [number, number] = [b.o[0] + (b.u[0] * b.L) / 2, b.o[1] + (b.u[1] * b.L) / 2];
        const onX = Math.abs(b.u[1]) < 0.1 && (Math.abs(mid[1] - Y0) < 300 || Math.abs(mid[1] - Y1) < 300) && mid[0] > X0 - 300 && mid[0] < X1 + 300;
        const onY = Math.abs(b.u[0]) < 0.1 && (Math.abs(mid[0] - X0) < 300 || Math.abs(mid[0] - X1) < 300) && mid[1] > Y0 - 300 && mid[1] < Y1 + 300;
        if (!onX && !onY) continue;
        // mặt ngoài
        const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
        const sg = (mid[0] - cx) * b.w[0] + (mid[1] - cy) * b.w[1] >= 0 ? 1 : -1;
        const out_ = mul(b.w, sg);
        const n = Math.max(1, Math.floor((b.L - 200) / pitch));
        const st = (b.L - (n - 1) * pitch) / 2;
        for (let k = 0; k < n; k++) {
          const t = st + k * pitch;
          const e: Vec3 = [b.o[0] + b.u[0] * t + out_[0] * (b.sec.b / 2), b.o[1] + b.u[1] * t + out_[1] * (b.sec.b / 2), b.top - b.sec.tf];
          // V: 2 nhánh từ mép cánh dưới ra ngoài
          const tip = add(e, add(mul(out_, l1 * Math.sin(ang)), [0, 0, -l1 * Math.cos(ang)]));
          emit(out, rod(d), e, tip, [0, 0, 1], m.name, it.id);
          emit(out, rod(d), tip, add(tip, add(mul(out_, l2 * 0.3), [0, 0, l2 * 0.95])), [0, 0, 1], m.name, it.id);
        }
      }
    } else if (it.kind === 'bhang') {
      const b = beams.get(it.ref);
      if (!b) continue;
      const t = d, w = Number(m.v.w) || 130, h = Number(m.v.h) || 100, ed = has(m.v.pat, '端部') ? Number(m.v.endD) || 500 : b.L / 2;
      const ts = has(m.v.pat, '端部') ? [ed, b.L - ed] : [b.L / 2];
      for (const tt of ts) {
        const c: Vec3 = [b.o[0] + b.u[0] * tt, b.o[1] + b.u[1] * tt, b.top + h / 2];
        // 2-水平: tấm song song trục dầm; 1-垂直: vuông góc
        const vert = !has(it.opt, '水平');
        plate(out, c, vert ? b.w : b.u, w, [0, 0, 1], h, t, m.name, it.id);
      }
    } else if (it.kind === 'chang') {
      const c = cols.get(it.ref);
      if (!c) continue;
      const t = d, w = Number(m.v.w) || 130, h = Number(m.v.h) || 100;
      const sides: Vec3[] = has(it.opt, '左右') ? [[1, 0, 0], [-1, 0, 0]] : has(it.opt, '前後') ? [[0, 1, 0], [0, -1, 0]] : [[1, 0, 0]];
      for (const nr of sides) {
        const dn = (nr[0] ? c.sec.h : c.sec.b) / 2 + t / 2;
        const cc: Vec3 = [c.c[0] + nr[0] * dn, c.c[1] + nr[1] * dn, c.z1 + h / 2 - 50];
        plate(out, cc, [0, 0, 1], h + 100, [Math.abs(nr[1]), Math.abs(nr[0]), 0], w, t, m.name, it.id);
      }
    } else if (it.kind === 'hole') {
      const b = beams.get(it.ref);
      if (!b) continue;
      const hd = Number(m.v.hole) || 30, ed = Number(m.v.endD) || 300;
      for (const tt of [ed, b.L - ed]) {
        const c: Vec3 = [b.o[0] + b.u[0] * tt, b.o[1] + b.u[1] * tt, b.top - b.sec.h / 2 + (has(m.v.holePos, '2') ? 0 : b.sec.h / 4)];
        const L = (b.sec.tw || 9) + 4;
        emit(out, { ...rod(hd), id: `hole${hd}`, code: `吊穴φ${hd}`, kgm: 0 }, add(c, mul(b.w, -L / 2)), add(c, mul(b.w, L / 2)), [0, 0, 1], m.name, it.id);
      }
    } else if (it.kind === 'stop') {
      const c = cols.get(it.ref), b = beams.get(it.ref2 ?? '');
      if (!c || !b) continue;
      const t = d, w = Number(m.v.w) || 85, h = Number(m.v.h) || 120;
      // đầu dầm gần cột
      const d0 = Math.hypot(b.o[0] - c.c[0], b.o[1] - c.c[1]);
      const dir = d0 < b.L / 2 ? b.u : mul(b.u, -1);
      const face = Math.abs(dir[0]) > 0.5 ? c.sec.h / 2 : c.sec.b / 2;
      const zb = b.top - b.sec.h;
      const cc: Vec3 = [c.c[0] + dir[0] * (face + w / 2), c.c[1] + dir[1] * (face + w / 2), zb - h / 2 - (Number(m.v.gap) || 2)];
      plate(out, cc, [0, 0, 1], h, dir, w, t, m.name, it.id);
    } else if (it.kind === 'rope') {
      const c = cols.get(it.ref);
      if (!c) continue;
      const z = (p.levels.find((l) => l.id === it.opt.split('|')[0])?.elevation ?? c.z0) + (it.h ?? 1100);
      const nrm: Vec3 = it.ref2 === '+x' ? [1, 0, 0] : it.ref2 === '-x' ? [-1, 0, 0] : it.ref2 === '-y' ? [0, -1, 0] : [0, 1, 0];
      const dn = (nrm[0] ? c.sec.h : c.sec.b) / 2;
      const l1 = Number(m.v.l1) || 90, l2 = Number(m.v.l2) || 37;
      const tng: Vec3 = [Math.abs(nrm[1]), Math.abs(nrm[0]), 0];
      const base: Vec3 = [c.c[0] + nrm[0] * dn, c.c[1] + nrm[1] * dn, z];
      const a1 = add(base, mul(tng, -l2)), a2 = add(base, mul(tng, l2));
      const b1 = add(a1, mul(nrm, l1)), b2 = add(a2, mul(nrm, l1));
      emit(out, rod(d), a1, b1, [0, 0, 1], m.name, it.id);
      emit(out, rod(d), a2, b2, [0, 0, 1], m.name, it.id);
      emit(out, rod(d), b1, b2, [0, 0, 1], m.name, it.id);
    }
  }
}

function studMembers(p: Project, s: Sub2Data, cols: Map<string, ColInfo>, out: Out) {
  for (const it of s.studItems) {
    const c = cols.get(it.col), m = s.studs.find((x) => x.name === it.master);
    if (!c || !m) continue;
    const [sd = 13, sl = 80] = nums(m.v.bolt);
    const rows = Math.max(1, Number(m.v.rows) || 1), nc = Math.max(1, Number(m.v.cols) || 1);
    const first = it.first === 'マスター参照' ? Number(m.v.b) || 50 : Number(it.first) || 50;
    const pc = Number(m.v.c) || 150, pd = Number(m.v.d) || 60;
    const zig = has(m.v.zig, 'あり');
    const zTop = it.zMax != null ? Math.min(c.z1, it.zMax) : c.z1;
    const faces: [Vec3, number][] = [[[0, -1, 0], c.sec.b / 2], [[1, 0, 0], c.sec.h / 2], [[0, 1, 0], c.sec.b / 2], [[-1, 0, 0], c.sec.h / 2]];
    faces.forEach(([nrm, dn], fi) => {
      if (it.del[fi]) return;
      const tng: Vec3 = [Math.abs(nrm[1]), Math.abs(nrm[0]), 0];
      for (let r0 = 0; r0 < rows; r0++) {
        const z = c.z0 + first + r0 * pc;
        if (z > zTop - 20) break;
        const sh = zig && r0 % 2 ? pd / 2 : 0;
        for (let k = 0; k < nc; k++) {
          const o = (k - (nc - 1) / 2) * pd + sh;
          const q: Vec3 = [c.c[0] + nrm[0] * dn + tng[0] * o, c.c[1] + nrm[1] * dn + tng[1] * o, z];
          emit(out, rod(sd), q, add(q, mul(nrm, sl)), [0, 0, 1], m.name, it.id);
        }
      }
    });
  }
}

export function sub2Members(p: Project, all: Member[]): Member[] {
  if (!p.sub2) return [];
  const s = sub2Of(p);
  const bl = beamInfos(p, all), cl = colInfos(p, all);
  const beams = new Map(bl.map((b) => [b.id, b])), cols = new Map(cl.map((c) => [c.id, c]));
  const out: Out = [];
  sleeveMembers(p, s, beams, out);
  kasaMembers(s, beams, out);
  deckMembers(p, s, bl, cl, out);
  tempMembers(p, s, beams, bl, cols, out);
  studMembers(p, s, cols, out);
  void cross;
  return out;
}
