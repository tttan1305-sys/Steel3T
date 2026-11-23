// Thư viện chuẩn thép kết cấu Nhật Bản (JIS): kích thước tiết diện và vật liệu
// Kích thước và khối lượng đơn vị theo bảng tiêu chuẩn JIS.
import type { SectionSpec } from './model';
import { BCR_ITEMS, BCP_ITEMS, STKR_ITEMS, ERW_PIPE_ITEMS, LARGE_PIPE_ITEMS, CHANNEL_ITEMS, LIPC_ITEMS, LIGHT_CHANNEL_ITEMS, type SecProps } from './jisTables';

export interface JisMaterial {
  code: string;
  standard: string;
  name: string;
  group: string; // nhóm vật liệu
  F: number; // cường độ tiêu chuẩn F (N/mm²), t ≤ 40
  fu: number; // giới hạn bền kéo (N/mm²)
  use: string;
}

const G = {
  plate: '鋼板・形鋼 (圧延鋼材)',
  hi: '高強度鋼 (大臣認定)',
  wea: '耐候性鋼',
  light: '軽量形鋼・溶接軽量H形鋼',
  box: '角形鋼管',
  pipe: '円形鋼管',
  bar: '棒鋼・ブレース',
  anchor: 'アンカーボルト',
  bolt: 'ボルト',
  cast: '鋳鋼',
  sus: 'ステンレス鋼',
  sheet: '鋼板 (デッキ・折板・めっき)',
} as const;
export const JIS_MATERIAL_GROUPS: string[] = Object.values(G);

const M = (code: string, standard: string, name: string, group: string, F: number, fu: number, use = ''): JisMaterial => ({ code, standard, name, group, F, fu, use });

export const JIS_MATERIALS: JisMaterial[] = [
  // 一般構造用圧延鋼材 JIS G 3101
  M('SS330', 'JIS G 3101', '一般構造用圧延鋼材', G.plate, 205, 330, 'Chi tiết phụ, không chịu lực chính'),
  M('SS400', 'JIS G 3101', '一般構造用圧延鋼材', G.plate, 235, 400, 'Thép hình, bản mã thông thường'),
  M('SS490', 'JIS G 3101', '一般構造用圧延鋼材', G.plate, 275, 490, 'Không dùng cho cấu kiện hàn'),
  M('SS540', 'JIS G 3101', '一般構造用圧延鋼材', G.plate, 375, 540, 'Không dùng cho cấu kiện hàn'),
  // 溶接構造用圧延鋼材 JIS G 3106
  M('SM400A', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 235, 400),
  M('SM400B', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 235, 400),
  M('SM400C', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 235, 400),
  M('SM490A', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 325, 490, 'Bản mã, cấu kiện hàn'),
  M('SM490B', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 325, 490),
  M('SM490C', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 325, 490),
  M('SM490YA', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 355, 490),
  M('SM490YB', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 355, 490),
  M('SM520B', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 355, 520),
  M('SM520C', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 355, 520),
  M('SM570', 'JIS G 3106', '溶接構造用圧延鋼材', G.plate, 400, 570),
  // 建築構造用圧延鋼材 JIS G 3136
  M('SN400A', 'JIS G 3136', '建築構造用圧延鋼材', G.plate, 235, 400, 'Cấu kiện phụ, không hàn chịu lực'),
  M('SN400B', 'JIS G 3136', '建築構造用圧延鋼材', G.plate, 235, 400, 'Cột, dầm có hàn'),
  M('SN400C', 'JIS G 3136', '建築構造用圧延鋼材', G.plate, 235, 400, 'Bản chịu kéo theo chiều dày (diaphragm)'),
  M('SN490B', 'JIS G 3136', '建築構造用圧延鋼材', G.plate, 325, 490, 'Cột, dầm chính'),
  M('SN490C', 'JIS G 3136', '建築構造用圧延鋼材', G.plate, 325, 490, 'Diaphragm, bản chịu kéo theo chiều dày'),
  // 建築構造用耐火鋼 (常温性能は SN 準拠)
  M('SN400B-FR', '大臣認定', '建築構造用耐火鋼', G.hi, 235, 400, 'Giảm/bỏ chống cháy'),
  M('SN490B-FR', '大臣認定', '建築構造用耐火鋼', G.hi, 325, 490, 'Giảm/bỏ chống cháy'),
  // 高強度鋼・TMCP (国土交通大臣認定)
  M('BT-HT325B', '大臣認定 (TMCP)', '建築構造用TMCP鋼', G.hi, 325, 490, 'F không giảm khi t > 40'),
  M('BT-HT325C', '大臣認定 (TMCP)', '建築構造用TMCP鋼', G.hi, 325, 490),
  M('BT-HT355B', '大臣認定 (TMCP)', '建築構造用TMCP鋼', G.hi, 355, 520),
  M('BT-HT355C', '大臣認定 (TMCP)', '建築構造用TMCP鋼', G.hi, 355, 520),
  M('BT-HT385B', '大臣認定', '建築構造用高性能鋼', G.hi, 385, 550),
  M('BT-HT385C', '大臣認定', '建築構造用高性能鋼', G.hi, 385, 550),
  M('BT-HT440B', '大臣認定', '建築構造用高性能鋼', G.hi, 440, 590),
  M('BT-HT440C', '大臣認定', '建築構造用高性能鋼', G.hi, 440, 590),
  M('SA440B', '大臣認定', '建築構造用高強度鋼', G.hi, 440, 590, 'Cột siêu cao tầng'),
  M('SA440C', '大臣認定', '建築構造用高強度鋼', G.hi, 440, 590),
  M('H-SA700A', '大臣認定', '建築構造用高強度鋼', G.hi, 700, 780),
  M('H-SA700B', '大臣認定', '建築構造用高強度鋼', G.hi, 700, 780),
  M('LYP100', '大臣認定', '低降伏点鋼', G.hi, 80, 200, 'Thiết bị giảm chấn'),
  M('LYP225', '大臣認定', '低降伏点鋼', G.hi, 205, 300, 'Thiết bị giảm chấn'),
  // JFE HBL® シリーズ (鋼構造設計便覧 2024)
  M('HBL325B', '大臣認定 MSTL-0564', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 325, 490, 'F không giảm khi t > 40'),
  M('HBL325C', '大臣認定 MSTL-0564', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 325, 490),
  M('HBL355B', '大臣認定 MSTL-0565', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 355, 520),
  M('HBL355C', '大臣認定 MSTL-0565', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 355, 520),
  M('HBL385B', '大臣認定 MSTL-0576', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 385, 550),
  M('HBL385C', '大臣認定 MSTL-0576', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 385, 550),
  M('HBL440B', '大臣認定 MSTL-0578', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 440, 590),
  M('HBL440C', '大臣認定 MSTL-0578', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 440, 590),
  M('HBL630B', '大臣認定 MSTL-0557', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 630, 780, 'Cột siêu cao tầng'),
  M('HBL630C', '大臣認定 MSTL-0557', '建築構造用厚鋼板 HBL® (JFE)', G.hi, 630, 780),
  M('HBL-H355B', '大臣認定', '建築構造用520N/mm² TMCP H形鋼 (外法一定 SHH, JFE)', G.hi, 355, 520, 'H外法一定, dầm/cột cường độ cao'),
  M('TMCP325B', '大臣認定', 'NDコア 用 TMCP鋼 (日鉄建材)', G.hi, 325, 490, 'NDコア (nút cột-dầm không diaphragm)'),
  M('SBHS400', 'JIS G 3140', '橋梁用高降伏点鋼板', G.hi, 400, 490),
  M('SBHS500', 'JIS G 3140', '橋梁用高降伏点鋼板', G.hi, 500, 570),
  M('SBHS700', 'JIS G 3140', '橋梁用高降伏点鋼板', G.hi, 700, 780),
  // 耐候性鋼 JIS G 3114
  M('SMA400AW', 'JIS G 3114', '溶接構造用耐候性熱間圧延鋼材', G.wea, 235, 400),
  M('SMA400BW', 'JIS G 3114', '溶接構造用耐候性熱間圧延鋼材', G.wea, 235, 400),
  M('SMA400CW', 'JIS G 3114', '溶接構造用耐候性熱間圧延鋼材', G.wea, 235, 400),
  M('SMA490AW', 'JIS G 3114', '溶接構造用耐候性熱間圧延鋼材', G.wea, 325, 490),
  M('SMA490BW', 'JIS G 3114', '溶接構造用耐候性熱間圧延鋼材', G.wea, 325, 490),
  M('SMA490CW', 'JIS G 3114', '溶接構造用耐候性熱間圧延鋼材', G.wea, 325, 490),
  M('SMA570W', 'JIS G 3114', '溶接構造用耐候性熱間圧延鋼材', G.wea, 400, 570),
  // 軽量形鋼
  M('SSC400', 'JIS G 3350', '一般構造用軽量形鋼', G.light, 245, 400, '母屋, 胴縁 (C, Z)'),
  M('SWH400', 'JIS G 3353', '一般構造用溶接軽量H形鋼', G.light, 245, 400, 'Dầm phụ, xà gồ H nhẹ'),
  M('SWH400L', 'JIS G 3353', '一般構造用溶接軽量H形鋼', G.light, 245, 400),
  // 角形鋼管
  M('STKR400', 'JIS G 3466', '一般構造用角形鋼管', G.box, 245, 400, 'Cột ống vuông nhẹ'),
  M('STKR490', 'JIS G 3466', '一般構造用角形鋼管', G.box, 325, 490),
  M('BCR295', '大臣認定', '建築構造用冷間ロール成形角形鋼管', G.box, 295, 400, 'Cột ống vuông'),
  M('JBCR295', '大臣認定', '建築構造用冷間ロール成形角形鋼管 (JFE)', G.box, 295, 400, 'Cột ống vuông, t ≤ 28'),
  M('JBCR385', '大臣認定', '建築構造用冷間ロール成形角形鋼管 (JFE)', G.box, 385, 550, 'Cột ống vuông cường độ cao'),
  M('UBCR365', '大臣認定', '建築構造用冷間ロール成形角形鋼管 Uコラム (日鉄建材)', G.box, 365, 490, 'Cột ống vuông F365, t ≤ 22'),
  M('BCR295-LT', '大臣認定', '低温靭性保証 BCR (日鉄建材)', G.box, 295, 400, 'Vùng lạnh: vE −25℃ ≥ 27J'),
  M('BCP235', '大臣認定', '建築構造用冷間プレス成形角形鋼管', G.box, 235, 400, 'Cột ống vuông lớn'),
  M('BCP325', '大臣認定', '建築構造用冷間プレス成形角形鋼管', G.box, 325, 490, 'Cột ống vuông lớn'),
  M('BCP325T', '大臣認定', '建築構造用冷間プレス成形角形鋼管', G.box, 325, 490, 'Bảo đảm tính chất theo chiều dày'),
  M('BCP325B-LT', '大臣認定', '低温靭性保証 BCP (日鉄建材)', G.box, 325, 490, 'Vùng lạnh, t 16–40'),
  M('BCP325C-LT', '大臣認定', '低温靭性保証 BCP (日鉄建材)', G.box, 325, 490, 'Vùng lạnh, t 16–40'),
  M('BCHT400', '大臣認定', '建築構造用高降伏点TMCP冷間プレス角形鋼管 (日鉄建材)', G.box, 400, 490),
  M('BCHT385', '大臣認定', '建築構造用高強度角形鋼管', G.box, 385, 550),
  M('BCHT440', '大臣認定', '建築構造用高強度角形鋼管', G.box, 440, 590),
  // 円形鋼管
  M('STK400', 'JIS G 3444', '一般構造用炭素鋼鋼管', G.pipe, 235, 400, 'Ống tròn'),
  M('STK490', 'JIS G 3444', '一般構造用炭素鋼鋼管', G.pipe, 315, 490),
  M('STK500', 'JIS G 3444', '一般構造用炭素鋼鋼管', G.pipe, 355, 500),
  M('STK540', 'JIS G 3444', '一般構造用炭素鋼鋼管', G.pipe, 390, 540),
  M('STKN400W', 'JIS G 3475', '建築構造用炭素鋼鋼管', G.pipe, 235, 400),
  M('STKN400B', 'JIS G 3475', '建築構造用炭素鋼鋼管', G.pipe, 235, 400),
  M('STKN490B', 'JIS G 3475', '建築構造用炭素鋼鋼管', G.pipe, 325, 490),
  M('STKT590', 'JIS G 3474', '鉄塔用高張力鋼鋼管', G.pipe, 440, 590),
  // 棒鋼
  M('SNR400A', 'JIS G 3138', '建築構造用圧延棒鋼', G.bar, 235, 400),
  M('SNR400B', 'JIS G 3138', '建築構造用圧延棒鋼', G.bar, 235, 400, 'Giằng thanh tròn, bulông neo'),
  M('SNR490B', 'JIS G 3138', '建築構造用圧延棒鋼', G.bar, 325, 490),
  M('SS400 (丸鋼)', 'JIS G 3101', '一般構造用圧延鋼材 丸鋼', G.bar, 235, 400, 'Giằng thanh tròn, sag rod'),
  M('SD295', 'JIS G 3112', '鉄筋コンクリート用棒鋼', G.bar, 295, 440, 'Thép neo, cốt thép chân cột'),
  M('SD345', 'JIS G 3112', '鉄筋コンクリート用棒鋼', G.bar, 345, 490),
  M('SD390', 'JIS G 3112', '鉄筋コンクリート用棒鋼', G.bar, 390, 560),
  M('SD490', 'JIS G 3112', '鉄筋コンクリート用棒鋼', G.bar, 490, 620),
  // アンカーボルト
  M('ABR400', 'JIS B 1220', '構造用転造両ねじアンカーボルトセット', G.anchor, 235, 400, 'Bulông neo chân cột'),
  M('ABR490', 'JIS B 1220', '構造用転造両ねじアンカーボルトセット', G.anchor, 325, 490, 'Bulông neo chân cột'),
  M('ABM400', 'JIS B 1220', '構造用切削両ねじアンカーボルトセット', G.anchor, 235, 400),
  M('ABM490', 'JIS B 1220', '構造用切削両ねじアンカーボルトセット', G.anchor, 325, 490),
  M('ABR520SUS', 'JIS B 1220', '構造用転造両ねじアンカーボルトセット (SUS304A)', G.anchor, 235, 520, 'Bulông neo inox'),
  M('ABM520SUS', 'JIS B 1220', '構造用切削両ねじアンカーボルトセット (SUS304A)', G.anchor, 235, 520, 'Bulông neo inox'),
  M('NHT690', '大臣認定 (テンションロッド)', '高張力テンションロッド (合鐵産業)', G.bar, 440, 690, 'Tension rod, F = 440'),
  M('NHT740', '大臣認定 (テンションロッド)', '高張力テンションロッド (合鐵産業)', G.bar, 518, 740, 'Tension rod, F = 518'),
  M('S45C', 'JIS G 4051', '機械構造用炭素鋼鋼材', G.bar, 345, 570, 'Chốt, フォークエンド'),
  // ボルト
  M('F8T', 'JIS B 1186', '摩擦接合用高力六角ボルトセット', G.bolt, 640, 800),
  M('F10T', 'JIS B 1186', '摩擦接合用高力六角ボルトセット', G.bolt, 900, 1000, 'Bulông cường độ cao'),
  M('S10T', '大臣認定 (旧 JSS II 09)', '構造用トルシア形高力ボルトセット', G.bolt, 900, 1000, 'Bulông cường độ cao (tor-shear)'),
  M('F10T (溶融亜鉛めっき)', '大臣認定', '溶融亜鉛めっき高力ボルト', G.bolt, 900, 1000, 'Kết cấu mạ kẽm nhúng nóng'),
  M('S14T', '大臣認定', '超高力ボルト', G.bolt, 1260, 1400),
  M('4.6 (中ボルト)', 'JIS B 1180', '六角ボルト 強度区分4.6', G.bolt, 240, 400, 'Bulông thường, chi tiết phụ'),
  M('8.8', 'JIS B 1180', '六角ボルト 強度区分8.8', G.bolt, 640, 800),
  M('頭付きスタッド', 'JIS B 1198', '頭付きスタッド', G.bolt, 235, 400, 'Stud liên kết sàn'),
  // 鋳鋼
  M('SCW410', 'JIS G 5102', '溶接構造用鋳鋼品', G.cast, 235, 410),
  M('SCW480', 'JIS G 5102', '溶接構造用鋳鋼品', G.cast, 275, 480),
  M('SCW410CF', 'JIS G 5201', '溶接構造用遠心力鋳鋼管', G.cast, 235, 410),
  M('SCW480CF', 'JIS G 5201', '溶接構造用遠心力鋳鋼管', G.cast, 275, 480),
  // ステンレス
  M('SUS304A', 'JIS G 4321', '建築構造用ステンレス鋼材', G.sus, 235, 520),
  M('SUS316A', 'JIS G 4321', '建築構造用ステンレス鋼材', G.sus, 235, 520),
  M('SUS304N2A', 'JIS G 4321', '建築構造用ステンレス鋼材', G.sus, 325, 690),
  M('SCS13AA-CF', 'JIS G 4321', '建築構造用ステンレス鋳鋼品', G.sus, 235, 480),
  // 鋼板 (デッキ・折板・めっき)
  M('SDP1', 'JIS G 3352', 'デッキプレート', G.sheet, 205, 270),
  M('SDP2', 'JIS G 3352', 'デッキプレート', G.sheet, 235, 400),
  M('SDP3', 'JIS G 3352', 'デッキプレート', G.sheet, 315, 490),
  M('SGC400', 'JIS G 3302', '溶融亜鉛めっき鋼板', G.sheet, 295, 400, 'Tôn, máng xối, diềm'),
  M('SGC490', 'JIS G 3302', '溶融亜鉛めっき鋼板', G.sheet, 365, 490),
  M('SGCC', 'JIS G 3302', '溶融亜鉛めっき鋼板 (一般用)', G.sheet, 205, 270, 'Phụ kiện'),
  M('SGLC400', 'JIS G 3321', '溶融55%アルミニウム-亜鉛合金めっき鋼板', G.sheet, 295, 400, 'Tôn lợp ガルバリウム'),
  M('SGLC490', 'JIS G 3321', '溶融55%アルミニウム-亜鉛合金めっき鋼板', G.sheet, 365, 490),
  M('SPHC', 'JIS G 3131', '熱間圧延軟鋼板', G.sheet, 205, 270, 'Phụ kiện, tấm chèn'),
  M('SS400 (縞鋼板)', 'JIS G 3101', '縞鋼板', G.plate, 235, 400, 'Sàn thao tác, nắp hố'),
];

export interface JisItem {
  code: string;
  spec: SectionSpec;
  /** khối lượng đơn vị danh nghĩa theo JIS (kg/m) */
  kg: number;
  /** đặc trưng tiết diện theo bảng (nếu có) */
  props?: SecProps;
}

export interface JisCategory {
  id: string;
  name: string;
  standard: string;
  material: string; // vật liệu mặc định
  /** vật liệu dùng được cho quy cách này */
  materials: string[];
  items: JisItem[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;
// H形鋼, リップ溝形鋼, 山形鋼: khối lượng đơn vị lấy theo bảng JIS (đã kể bán kính lượn)
const H = (h: number, b: number, tw: number, tf: number, kg: number): JisItem => ({ code: `H-${h}x${b}x${tw}x${tf}`, spec: { type: 'I', h, b, tw, tf, c: 0 }, kg });
const LU = (a: number, b: number, t: number, kg: number): JisItem => ({ code: `L-${a}x${b}x${t}`, spec: { type: 'L', h: a, b, tw: t, tf: t, c: 0 }, kg });
const L = (a: number, t: number, kg: number): JisItem => ({ code: `L-${a}x${a}x${t}`, spec: { type: 'L', h: a, b: a, tw: t, tf: t, c: 0 }, kg });
// 角形鋼管: công thức JIS G 3466 có bán kính góc (ngoài 2t khi t ≤ 6, 2.5t khi t > 6)
const BOX = (a: number, t: number): JisItem => {
  const ro = t <= 6 ? 2 * t : 2.5 * t, ri = ro - t;
  const A = 4 * t * (a - t) - (4 - Math.PI) * (ro * ro - ri * ri);
  return { code: `□-${a}x${a}x${t}`, spec: { type: 'Box', h: a, b: a, tw: t, tf: t, c: 0 }, kg: r2(A * 7.85e-3) };
};
// 鋼管: W = 0.02466·t·(D − t) theo JIS G 3444
const P = (d: number, t: number): JisItem => ({ code: `○-${d}x${t}`, spec: { type: 'Pipe', h: d, b: d, tw: t, tf: t, c: 0 }, kg: r2(0.02466 * t * (d - t)) });
// 丸鋼: theo đường kính danh nghĩa
const RB = (d: number): JisItem => ({ code: `M${d} (丸鋼ブレース)`, spec: { type: 'Rod', h: d, b: d, tw: 0, tf: 0, c: 0 }, kg: r2(((Math.PI * d * d) / 4) * 7.85e-3) });

export const JIS_SECTIONS: JisCategory[] = [
  {
    id: 'h-narrow',
    name: 'H形鋼 細幅 (梁用)',
    standard: 'JIS G 3192',
    material: 'SN400B',
    materials: ['SS400', 'SN400A', 'SN400B', 'SN400C', 'SN490B', 'SN490C', 'SM400A', 'SM400B', 'SM400C', 'SM490A', 'SM490B', 'SM490C', 'SM490YA', 'SM490YB', 'SM520B', 'SM520C', 'HBL-H355B'],
    items: [
      H(100, 50, 5, 7, 9.3), H(125, 60, 6, 8, 13.1), H(150, 75, 5, 7, 14.0), H(175, 90, 5, 8, 18.0), H(198, 99, 4.5, 7, 17.8), H(200, 100, 5.5, 8, 20.9),
      H(248, 124, 5, 8, 25.1), H(250, 125, 6, 9, 29.0), H(298, 149, 5.5, 8, 32.0), H(300, 150, 6.5, 9, 36.7), H(346, 174, 6, 9, 41.2), H(350, 175, 7, 11, 49.4),
      H(396, 199, 7, 11, 56.1), H(400, 200, 8, 13, 65.4), H(446, 199, 8, 12, 65.1), H(450, 200, 9, 14, 74.9), H(496, 199, 9, 14, 78.9), H(500, 200, 10, 16, 88.2),
      H(596, 199, 10, 15, 92.5), H(600, 200, 11, 17, 103), H(700, 300, 13, 24, 182), H(800, 300, 14, 26, 207), H(900, 300, 16, 28, 240),
    ],
  },
  {
    id: 'h-mid',
    name: 'H形鋼 中幅',
    standard: 'JIS G 3192',
    material: 'SN400B',
    materials: ['SS400', 'SN400A', 'SN400B', 'SN400C', 'SN490B', 'SN490C', 'SM400A', 'SM400B', 'SM400C', 'SM490A', 'SM490B', 'SM490C', 'SM490YA', 'SM490YB', 'SM520B', 'SM520C', 'HBL-H355B'],
    items: [H(148, 100, 6, 9, 20.7), H(194, 150, 6, 9, 29.9), H(244, 175, 7, 11, 43.6), H(294, 200, 8, 12, 55.8), H(340, 250, 9, 14, 78.1), H(390, 300, 10, 16, 105), H(440, 300, 11, 18, 121), H(488, 300, 11, 18, 125), H(588, 300, 12, 20, 147)],
  },
  {
    id: 'h-wide',
    name: 'H形鋼 広幅 (柱用)',
    standard: 'JIS G 3192',
    material: 'SN490B',
    materials: ['SS400', 'SN400A', 'SN400B', 'SN400C', 'SN490B', 'SN490C', 'SM400A', 'SM400B', 'SM400C', 'SM490A', 'SM490B', 'SM490C', 'SM490YA', 'SM490YB', 'SM520B', 'SM520C', 'HBL-H355B'],
    items: [
      H(100, 100, 6, 8, 16.9), H(125, 125, 6.5, 9, 23.6), H(150, 150, 7, 10, 31.1), H(175, 175, 7.5, 11, 40.4), H(200, 200, 8, 12, 49.9), H(250, 250, 9, 14, 71.8),
      H(300, 300, 10, 15, 93.0), H(350, 350, 12, 19, 135), H(400, 400, 13, 21, 172),
    ],
  },
  {
    id: 'box-bcr',
    name: '角形鋼管 ロール成形 (柱用)',
    standard: 'BCR295 / JBCR295 / JBCR385',
    material: 'BCR295',
    materials: ['BCR295', 'JBCR295', 'JBCR385', 'UBCR365', 'BCR295-LT'],
    items: BCR_ITEMS,
  },
  {
    id: 'box-bcp',
    name: '角形鋼管 プレス成形 (柱用)',
    standard: 'BCP235 / BCP325 / BCP325T',
    material: 'BCP325',
    materials: ['BCP235', 'BCP325', 'BCP325T', 'BCP325B-LT', 'BCP325C-LT', 'BCHT385', 'BCHT400', 'BCHT440'],
    items: BCP_ITEMS,
  },
  {
    id: 'box-stkr',
    name: '角形鋼管 一般構造用',
    standard: 'JIS G 3466 STKR400 / STKR490',
    material: 'STKR400',
    materials: ['STKR400', 'STKR490'],
    items: [BOX(100, 3.2), BOX(100, 4.5), BOX(100, 6), BOX(125, 4.5), BOX(125, 6), BOX(150, 6), BOX(150, 9), BOX(175, 6), BOX(175, 9)].map((it) => ({ ...it, code: it.code + ' (STKR)' })).concat(STKR_ITEMS),
  },
  {
    id: 'lip-c',
    name: 'リップ溝形鋼 (母屋・胴縁, カラーC)',
    standard: 'JIS G 3350',
    material: 'SSC400',
    materials: ['SSC400'],
    items: LIPC_ITEMS,
  },
  {
    id: 'light-ch',
    name: '軽溝形鋼',
    standard: 'JIS G 3350',
    material: 'SSC400',
    materials: ['SSC400'],
    items: LIGHT_CHANNEL_ITEMS,
  },
  {
    id: 'channel',
    name: '溝形鋼',
    standard: 'JIS G 3192',
    material: 'SS400',
    materials: ['SS400', 'SS490', 'SM400A', 'SM490A'],
    items: CHANNEL_ITEMS,
  },
  {
    id: 'angle',
    name: '等辺山形鋼',
    standard: 'JIS G 3192',
    material: 'SS400',
    materials: ['SS400', 'SS490', 'SM400A', 'SM490A'],
    items: [L(40, 3, 1.83), L(40, 5, 2.95), L(50, 4, 3.06), L(50, 5, 3.77), L(50, 6, 4.43), L(60, 5, 4.55), L(65, 6, 5.91), L(65, 8, 7.66), L(75, 6, 6.85), L(75, 9, 9.96), L(90, 7, 9.59), L(90, 10, 13.3), L(100, 7, 10.7), L(100, 10, 14.9), L(130, 9, 17.9), L(150, 12, 27.3)],
  },
  {
    id: 'angle-u',
    name: '不等辺山形鋼',
    standard: 'JIS G 3192',
    material: 'SS400',
    materials: ['SS400', 'SS490', 'SM400A', 'SM490A'],
    items: [LU(90, 75, 9, 11.0), LU(100, 75, 7, 9.32), LU(100, 75, 10, 13.0), LU(125, 75, 7, 10.7), LU(125, 75, 10, 15.0), LU(125, 75, 13, 19.3), LU(125, 90, 10, 16.1), LU(125, 90, 13, 20.6), LU(150, 90, 9, 16.4), LU(150, 90, 12, 21.5), LU(150, 100, 9, 17.1), LU(150, 100, 12, 22.4), LU(150, 100, 15, 27.7)],
  },
  {
    id: 'pipe',
    name: '円形鋼管 電縫鋼管',
    standard: 'JIS G 3444 STK400 / STK490',
    material: 'STK400',
    materials: ['STK400', 'STK490', 'STKN400W', 'STKN400B', 'STKN490B'],
    items: [P(48.6, 2.3), P(60.5, 3.2), P(76.3, 3.2), P(89.1, 3.2), ...ERW_PIPE_ITEMS],
  },
  {
    id: 'pipe-large',
    name: '円形鋼管 UOE / 板巻き (柱用)',
    standard: 'F = 235 / 325 / 355 / 385 / 440',
    material: 'STKN490B',
    materials: ['STKN400W', 'STKN400B', 'STKN490B', 'STK400', 'STK490', 'STK500', 'STK540'],
    items: LARGE_PIPE_ITEMS,
  },
  {
    id: 'rod',
    name: '丸鋼ブレース (ターンバックル)',
    standard: 'JIS A 5540 / 5541',
    material: 'SNR400B',
    materials: ['SNR400A', 'SNR400B', 'SNR490B', 'SS400 (丸鋼)'],
    items: [RB(10), RB(12), RB(14), RB(16), RB(18), RB(20), RB(22), RB(24), RB(27), RB(30), RB(33)],
  },
];

/** Bulông cường độ cao: đường kính lỗ, khoảng cách tối thiểu (JASS6 / 建築学会) */
export const BOLT_STD: Record<number, { hole: number; pitchMin: number; edgeMin: number; pitchStd: number; gauge: number }> = {
  16: { hole: 18, pitchMin: 40, edgeMin: 28, pitchStd: 60, gauge: 60 },
  20: { hole: 22, pitchMin: 50, edgeMin: 34, pitchStd: 60, gauge: 90 },
  22: { hole: 24, pitchMin: 55, edgeMin: 38, pitchStd: 60, gauge: 90 },
  24: { hole: 26, pitchMin: 60, edgeMin: 44, pitchStd: 70, gauge: 90 },
};

/** Tìm tiết diện JIS theo mã */
export function findJis(code: string): { cat: JisCategory; item: JisItem } | undefined {
  for (const cat of JIS_SECTIONS) {
    const item = cat.items.find((i) => i.code === code);
    if (item) return { cat, item };
  }
  return undefined;
}

/** Danh sách mác theo nhóm (dùng cho select bulông, bulông neo). */
export const jisMaterialCodes = (...groups: string[]) => JIS_MATERIALS.filter((m) => groups.includes(m.group)).map((m) => m.code);
export const JIS_BOLT_GRADES = jisMaterialCodes('ボルト').filter((c) => c !== '頭付きスタッド');
export const JIS_ANCHOR_GRADES = [...jisMaterialCodes('アンカーボルト'), 'SNR400B', 'SNR490B', 'SS400 (丸鋼)'];
