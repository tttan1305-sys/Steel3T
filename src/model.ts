import type { MoyaData } from './moya';
import type { Sub2Data } from './sub2';
import type { GirtData } from './girt';
import { plateLoops } from './plateCad';
import { findJis } from './jis';
// ===== Mô hình dữ liệu của dự án kết cấu thép =====
// Đơn vị: mm. Hệ tọa độ: X dọc nhà (theo trục 1,2,3...), Y ngang nhà (trục A,B,C...), Z hướng lên.

export type Vec3 = [number, number, number];

export interface GridLine {
  id: string;
  name: string;
  /** Khoảng cách tới trục trước đó (mm). Trục đầu tiên = vị trí tuyệt đối. */
  spacing: number;
}

export interface Level {
  id: string;
  name: string;
  elevation: number; // mm
}

export type SectionType = 'I' | 'C' | 'Z' | 'Box' | 'Pipe' | 'L' | 'Rod';

export interface Section {
  id: string;
  code: string; // mã tiết diện, vd: I300x150x6x8
  type: SectionType;
  h: number; // chiều cao / đường kính
  b: number; // bề rộng cánh
  tw: number; // bề dày bụng (hoặc bề dày chung)
  tf: number; // bề dày cánh
  c: number; // mép gấp (C/Z)
  material: string;
  /** khối lượng đơn vị danh nghĩa theo JIS (kg/m) – nếu có thì dùng thay cho tính toán */
  kgm?: number;
}

/** Loại cấu kiện khai báo trong master 部材名 */
export type MasterKind = 'column' | 'beam' | 'brace';

export const MASTER_KIND_LABEL: Record<MasterKind, string> = { column: '本柱', beam: '大梁', brace: 'ブレース' };
/** Vai trò phụ trong cùng nhóm: 間柱 (cột), 小梁 (dầm), 方杖 (giằng) */
export type MasterRole = 'post' | 'sub' | 'knee';
/** 6 loại cấu kiện hiển thị trong Master */
export type MasterType = 'column' | 'post' | 'beam' | 'sbeam' | 'knee' | 'brace';
export const MASTER_TYPES: MasterType[] = ['column', 'post', 'beam', 'sbeam', 'knee', 'brace'];
export const MASTER_TYPE_LABEL: Record<MasterType, string> = { column: '本柱', post: '間柱', beam: '大梁', sbeam: '小梁', knee: '方杖', brace: 'ブレース' };
export const TYPE_KIND: Record<MasterType, MasterKind> = { column: 'column', post: 'column', beam: 'beam', sbeam: 'beam', knee: 'brace', brace: 'brace' };
export const TYPE_ROLE: Record<MasterType, MasterRole | undefined> = { column: undefined, post: 'post', beam: undefined, sbeam: 'sub', knee: 'knee', brace: undefined };
export const masterType = (m: { kind: MasterKind; role?: MasterRole }): MasterType =>
  m.role === 'post' ? 'post' : m.role === 'sub' ? 'sbeam' : m.role === 'knee' ? 'knee' : m.kind;

/** Master 部材名: tên cấu kiện (vd 1C1) <-> tiết diện + vật liệu. Tên là duy nhất. */
export interface MasterItem {
  id: string;
  name: string;
  kind: MasterKind;
  /** 間柱 / 小梁 / 方杖 */
  role?: MasterRole;
  sectionId: string;
  material: string;
  note?: string;
  /** 継手 theo vị trí: cột 上/下/中, dầm 左/右/中 (giá trị = id 継手) */
  joints?: Partial<Record<JointPos, string>>;
  /** true = 継手 左 / 右 chọn riêng; mặc định 左 = 右 */
  lrFree?: boolean;
  /** 本柱: 出寸法 ダイアフラム (mm) nhập tay; trống = theo パラメーター */
  diaE?: number;
}

/** 左 / 右 đang chọn riêng? (chưa đặt thì: 2 bên đã khác nhau → riêng) */
export const lrFreeOf = (m: { lrFree?: boolean; joints?: Partial<Record<JointPos, string>> }) =>
  m.lrFree ?? !!(m.joints?.left && m.joints?.right && m.joints.left !== m.joints.right);

export type JointPos = 'top' | 'bottom' | 'mid' | 'left' | 'right';
export const JOINT_POS_LABEL: Record<JointPos, string> = { top: '上', bottom: '下', mid: '中', left: '左', right: '右' };
/** Các vị trí mối nối theo loại cấu kiện */
/** 継手 bắt buộc: 大梁 → 中 (ブラケット); 小梁 → 左 · 右 (ガセット). Các vị trí khác mặc định không dùng */
export const isRequiredJoint = (kind: MasterKind, role: MasterRole | undefined, pos: JointPos) =>
  kind === 'beam' && role !== 'knee' && (role === 'sub' ? pos === 'left' || pos === 'right' : pos === 'mid');
export const jointPositions = (kind: MasterKind, role?: MasterRole): JointPos[] => (kind === 'column' ? ['top', 'bottom', 'mid'] : role === 'knee' ? ['left', 'right'] : ['left', 'right', 'mid']);
/** Kiểu mối nối gợi ý: đầu thanh GPL, giữa thanh SPL */
export const defaultJointType = (pos: JointPos): JointType => (pos === 'mid' ? 'SPL' : 'GPL');
/** Vật liệu bản ghép thực dùng của 継手: mặc định theo vật liệu 部材, hoặc vật liệu chọn riêng */
export function jointMaterial(p: { master: MasterItem[] }, j: { id: string; plateMaterial: string; matMode?: 'member' | 'custom'; target?: string }): string {
  if (j.matMode === 'custom' || j.target === 'brace') return j.plateMaterial;
  return jointUsers(p, j.id)[0]?.m.material ?? j.plateMaterial;
}
/** Các 部材名 + vị trí đang dùng một 継手 */
export function jointUsers(p: { master: MasterItem[] }, jointId: string): { m: MasterItem; pos: JointPos[] }[] {
  const out: { m: MasterItem; pos: JointPos[] }[] = [];
  for (const m of p.master) {
    const pos = (Object.keys(m.joints ?? {}) as JointPos[]).filter((k) => m.joints![k] === jointId);
    if (pos.length) out.push({ m, pos });
  }
  return out;
}
/** Chuyển cách gán cũ (Joint.memberIds) sang gán theo vị trí trên 部材名 */
export function convertJointAssign<T extends { master: MasterItem[]; joints: Joint[] }>(p: T): T {
  for (const j of p.joints) {
    for (const id of j.memberIds ?? []) {
      const m = p.master.find((x) => x.id === id);
      if (!m) continue;
      m.joints = m.joints ?? {};
      if (j.target === 'column' || j.pos > 0) m.joints.mid = j.id;
      else (m.joints.left = j.id), (m.joints.right = j.id);
    }
    j.memberIds = [];
  }
  return p;
}

/**
 * 9 điểm chuẩn của tiết diện cột (nhìn trên mặt bằng, trái/phải theo X, trên/dưới theo Y):
 * 0 trái trên | 1 giữa trên | 2 phải trên
 * 3 trái giữa | 4 trung tâm | 5 phải giữa
 * 6 trái dưới | 7 giữa dưới | 8 phải dưới
 */
export const ANCHOR_LABEL = ['Trái trên', 'Giữa trên', 'Phải trên', 'Trái giữa', 'Trung tâm', 'Phải giữa', 'Trái dưới', 'Giữa dưới', 'Phải dưới'];

export interface Column {
  id: string;
  /** tấm GPL tự vẽ riêng tại từng point (id PlateShape) */
  shapes?: Partial<Record<JointPos, string>>;
  x: string; // id trục X
  y: string; // id trục Y
  base: string; // id tầng chân cột
  top: string; // id tầng đỉnh cột
  memberId: string; // id trong master 部材名
  anchor: number; // 0..8, điểm chuẩn đặt tại giao trục
  rotation: number; // độ, quay quanh điểm chuẩn
  dx: number; // dịch thêm theo X (mm)
  dy: number; // dịch thêm theo Y (mm)
  /** 下継手距離: chiều cao mối nối tính từ chân cột (mm), 0/không có = không nối */
  jLo?: number;
  /** 上継手距離: khoảng cách mối nối tính xuống từ đỉnh cột (mm) */
  jHi?: number;
  /** すきま tại mối nối cột (mm) */
  gap?: number;
  /** アンカーベース riêng cho cột này (id BasePlate); trống = theo 部材名 */
  baseId?: string;
  /** 勾配 ID: đỉnh cột cắt theo 勾配 (柱合わせ); trống = không theo 勾配 */
  slopeId?: string;
  /** 'post' = 間柱 (đặt tự do trên dầm, toạ độ pt) */
  role?: 'post';
  pt?: [number, number];
  /** 間柱 nhập theo đường chuẩn: cao độ chân / đỉnh tuyệt đối (mm), ghi đè tầng */
  zb?: number;
  zt?: number;
  /** Chỉnh cao độ chân / đỉnh cột so với tầng (mm, + lên, − xuống) */
  dzb?: number;
  dzt?: number;
  /** 継手 riêng cho cột này (ghi đè 部材名): id 継手, '' = không có */
  joints?: Partial<Record<JointPos, string>>;
  /** 仕口: sửa / thêm / xoá cụm 仕口 riêng của cột này (tab 本体 › 仕口) */
  shikuchi?: ShikuchiEdit[];
  /** Mối nối SPL do lệnh 結合 (gộp): cao độ tuyệt đối (mm) */
  splZ?: number[];
  /** Mối hàn do lệnh 結合: cao độ tuyệt đối (mm) */
  weldZ?: number[];
  /** Đoạn cột trên sau lệnh 切断 (cắt): không có ベース */
  noBase?: boolean;
}

export type BeamEnd = 'rigid' | 'pin';
export const BEAM_END_LABEL: Record<BeamEnd, string> = { rigid: '剛接合 (ブラケット)', pin: 'ピン接合 (GPL)' };
/** Kiểu liên kết đầu dầm: dữ liệu cũ có 継手距離 → 剛接合 */
export const beamEnd = (b: Pick<Beam, 'end1' | 'end2' | 'j1' | 'j2'>, k: 1 | 2): BeamEnd => (k === 1 ? b.end1 ?? (b.j1 ? 'rigid' : 'pin') : b.end2 ?? (b.j2 ? 'rigid' : 'pin'));

/** GPL: hình dạng cắt cánh dầm (下フランジ片刃落とし …) */
export type GplCut = 'none' | 'one' | 'both';
export const GPL_CUT_LABEL: Record<GplCut, string> = { none: '落としなし (không cắt FLG)', one: '片刃落とし (cắt FLG 1 bên)', both: '両側落とし (cắt FLG 2 bên)' };
/** Kích thước mối hàn góc S theo chiều dày bản t (サイズS / max S) */
export const WELD_S: { t: number; s: number; max: number }[] = [
  { t: 6, s: 5, max: 8 },
  { t: 9, s: 7, max: 11 },
  { t: 12, s: 9, max: 14 },
  { t: 16, s: 12, max: 17 },
];
export const weldS = (t: number) => WELD_S.find((w) => w.t >= t) ?? WELD_S[WELD_S.length - 1];

/** Hướng lắp dầm: tăng dần / giảm dần theo trục X, Y */
export type BeamDir = 'asc' | 'desc';
export const BEAM_DIR_LABEL: Record<BeamDir, string> = { asc: 'Tăng dần X·Y (1→2, A→B)', desc: 'Giảm dần X·Y (2→1, B→A)' };

/** 勾配 ID: mặt nghiêng theo phương X hoặc Y, cao độ 0 tại trục gốc */
export interface SlopeDef {
  id: string;
  name: string;
  axis: 'x' | 'y';
  /** id trục gốc (水下 / chỗ chênh cao = 0) */
  base: string;
  /** độ dốc %, dương = cao dần theo chiều tăng của trục */
  pct: number;
}
/** 勾配設定 (theo kiểu 勾配設定基準): kiểu mặt dốc */
export type SlopeKind = 'flat' | 'two' | 'leftLow' | 'rightHigh' | 'rightLow' | 'leftHigh';
export const SLOPE_KIND_LABEL: Record<SlopeKind, string> = { flat: 'フラット', two: '2点座標', leftLow: '左水下基準', rightHigh: '右水上基準', rightLow: '右水下基準', leftHigh: '左水上基準' };
/** 柱ダイアフラム: 1-フラット / 2-勾配 */
export type ColDia = 'flat' | 'slope';
export const COL_DIA_LABEL: Record<ColDia, string> = { flat: '1 - フラット', slope: '2 - 勾配' };
/** 柱合わせ: 0-なし / 1-水下ダイア / 2-水上ダイア / 3-柱芯 */
export type ColFit = 'none' | 'low' | 'high' | 'center';
export const COL_FIT_LABEL: Record<ColFit, string> = { none: '0 - なし', low: '1 - 水下ダイア', high: '2 - 水上ダイア', center: '3 - 柱芯' };
export interface SlopeColSet { dia: ColDia; fit: ColFit }
/** 1 mặt 勾配: đa giác giao trục trên 1 tầng, dốc theo phương vuông góc với 基準通り */
/** Điều chỉnh tại 1 trục giữa của mặt 勾配: dời điểm gãy theo phương ngang (dx) và cao độ (dy); split = cao độ bên trái / phải khác nhau */
/** Point của 1 trục trên mặt cắt 勾配: point 1 cách trục X1 về bên trái, cao Y1; point 2 cách trục X2 về bên phải, cao Y2 (cao độ tính từ mặt tầng). Bỏ trống Y = theo 勾配 gốc tại vị trí point */
export interface SlopeAdj { x1?: number; y1?: number; x2?: number; y2?: number; /** @deprecated cách cũ */ dx?: number; dy?: number; split?: boolean; dyL?: number; dyR?: number }
export interface SlopeFace {
  id: string;
  name: string;
  /** tầng (階高名) */
  level: string;
  /** các giao trục (id trục X, id trục Y) theo thứ tự bấm */
  pts: [string, string][];
  /** 基準設定通り: id trục X hoặc Y (mặt cắt xem dốc) */
  baseAxis: string;
  kind: SlopeKind;
  /** 開始 / 終了: 2 trục vuông góc với 基準通り (trái → phải trên hình cắt) */
  start: string;
  end: string;
  /** X移動量 / Y移動量 tại đầu chuẩn (mm) */
  dx: number;
  dy: number;
  /** 2点座標: Y移動量 ở đầu 終了 */
  dy2?: number;
  /** điều chỉnh theo từng trục giữa (id trục → X / Y移動量, cao độ trái / phải) */
  adj?: Record<string, SlopeAdj>;
  /** 勾配比率 run : rise (vd 10 : 3) */
  run: number;
  rise: number;
  /** thiết lập cột 水下 / 標準 / 水上 */
  cols: { low: SlopeColSet; std: SlopeColSet; high: SlopeColSet };
  /** 勾配 vùng (đa giác / khung quét) hoặc 勾配 đường (các cây trên 1 trục) */
  mode?: 'area' | 'line';
  /** đã bấm xác nhận → áp vào 部材 */
  ok?: boolean;
}

/** Chênh cao (mm) của 勾配 tại điểm (x, y) */
export function slopeDz(p: Project, id: string | undefined, x: number, y: number): number {
  const s = id ? p.slopes?.find((v) => v.id === id) : undefined;
  if (!s) return 0;
  const pos = gridPositions(s.axis === 'x' ? p.gridsX : p.gridsY);
  const b = pos.get(s.base) ?? 0;
  return (((s.axis === 'x' ? x : y) - b) * s.pct) / 100;
}

export type SubSlope = 'sup' | 'face' | 'flat';
export const SUB_SLOPE_LABEL: Record<SubSlope, string> = { sup: '大梁合わせ', face: '勾配面', flat: '水平' };

export interface Beam {
  id: string;
  /** tấm GPL tự vẽ riêng tại từng point (id PlateShape) */
  shapes?: Partial<Record<JointPos, string>>;
  level: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  memberId: string;
  /** Cao độ dầm: mặt trên dầm = cao độ tầng + dz (mm), mặc định 0 */
  dz?: number;
  /** Độ lệch ngang so với đường trục (mm), + = bên trái khi nhìn từ đầu → cuối */
  off?: number;
  /** 大梁: vị trí so với 本柱 – tâm cột / 外面合わせ / 内面合わせ */
  align?: BeamAlign;
  /** 配置基準 (ngang): 部材芯 / 左面 / 右面 nằm trên đường đặt */
  place?: BeamPlace;
  /** 上下基準: cao độ đặt (tầng + dz) là mặt trên / tâm / mặt dưới dầm */
  vref?: BeamVRef;
  /** 上下 riêng từng đầu (左側 / 右側), cộng thêm vào dz → dầm dốc */
  up1?: number;
  up2?: number;
  /** 継手距離 左側 / 右側: từ giao trục tới mối nối (mm). 0 = không có ブラケット */
  j1?: number;
  j2?: number;
  /** すきま tại mối nối dầm (mm) */
  gap?: number;
  /** Kiểu liên kết đầu trái / phải: 剛接合 (ブラケット, 継手 中) / ピン接合 (GPL, 継手 左/右) */
  end1?: BeamEnd;
  end2?: BeamEnd;
  /** 継手距離 ブラケット tính từ: tâm cột (mặc định) / mép cột, tới mép ngoài ブラケット */
  jRef?: 'center' | 'face';
  /** 継手 riêng cho dầm này (ghi đè 部材名): id 継手, '' = không có */
  joints?: Partial<Record<JointPos, string>>;
  /** 'sub' = 小梁 */
  role?: 'sub';
  /** 小梁 勾配: 'sup' (mặc định) = mặt trên theo line mặt trên 2 大梁 đỡ · 'face' = theo mặt 勾配 của tầng · 'flat' = nằm ngang (theo đầu đỡ thấp hơn) */
  sl?: SubSlope;
  /** 小梁: lệch mặt trên so với mức chuẩn ở trên (mm, − = hạ xuống) */
  sdz?: number;
  /** 勾配 ID: dầm nghiêng theo 1 trong các 勾配 (trống = không theo 勾配) */
  slopeId?: string;
  /** Hướng lắp (左側 → 右側): trống = theo パラメーター */
  dir?: BeamDir;
  /** Dầm nhập bằng cách chọn 2 部材: toạ độ mặt bằng 2 đầu (mm). Có thì dùng thay cho giao trục */
  p1?: [number, number];
  p2?: [number, number];
  /** id cột / dầm đã chọn ở 2 đầu (để biết 大梁 / 小梁) */
  ref1?: string;
  ref2?: string;
  /** Mối nối SPL do lệnh 結合 (gộp): điểm mặt bằng trên đường đặt dầm */
  spl?: [number, number][];
  /** Mối hàn do lệnh 結合 (gộp, nối bằng hàn): điểm mặt bằng */
  weld?: [number, number][];
}
export type BeamPlace = 'center' | 'left' | 'right';
export const BEAM_PLACE_LABEL: Record<BeamPlace, string> = { center: '1-部材芯', left: '2-左面', right: '3-右面' };
export type BeamVRef = 'top' | 'center' | 'bottom';
export const BEAM_VREF_LABEL: Record<BeamVRef, string> = { top: '上端 (mặt trên)', center: '芯 (tâm)', bottom: '下端 (mặt dưới)' };

/** ブレース既製品入力: giằng đặt theo khoang (mặt bằng tại tầng / mặt đứng theo trục) */
export interface BraceInst {
  id: string;
  memberId: string;
  plane: 'plan' | 'wall';
  /** plan: tầng đặt; wall: tầng dưới */
  level: string;
  /** wall: tầng trên */
  top: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  /** X入力: thêm thanh đối xứng thành giằng chữ X */
  x: boolean;
  /** 間隔基準: 1-相手側鋼材との交点 / 3-相手側鋼材面 */
  ref: BraceRef;
  /** 間隔値 đầu 1 / đầu 2 (mm, lùi theo trục giằng) */
  gap1: number;
  gap2: number;
  /** 端部上下値 (mm) so với cao độ tầng (plan) / chân và đỉnh (wall) */
  dz1: number;
  dz2: number;
  /** 継手 riêng (ghi đè 部材名) */
  joints?: Partial<Record<JointPos, string>>;
  /** Hình dạng GPL riêng từng điểm: fig1 / fig2 / fig3 / sheet / id PL tự vẽ */
  shapes?: Partial<Record<JointPos, string>>;
  /** Nhập theo giao điểm 2 部材: point 1 / point 2 (toạ độ 3D, mm) – có thì dùng thay cho giao trục */
  q1?: Vec3;
  q2?: Vec3;
  /** tên 部材 tạo ra point 1 / 2 (hiển thị) */
  qn1?: string;
  qn2?: string;
}

/** 方杖: thanh chống xiên từ cột tới dầm */
export interface KneeInst {
  id: string;
  memberId: string;
  /** id cột (本柱 / 間柱) */
  col: string;
  /** id dầm */
  beam: string;
  /** khoảng cách xuống dọc cột tính từ mặt dưới dầm (mm) */
  dc: number;
  /** khoảng cách dọc dầm tính từ mặt cột (mm) */
  db: number;
  /** nhập theo góc (độ, so với dầm) + chiều dài (mm) – chỉ để hiển thị lại */
  ang?: number;
  len?: number;
  /** 継手 riêng tại 右 / 左 (ghi đè Master) */
  joints?: Partial<Record<JointPos, string>>;
  /** hình dạng GPL riêng theo vị trí */
  shapes?: Partial<Record<JointPos, string>>;
}

/** Tấm PL tự vẽ 2D: hình dạng theo layer – 外形 (biên ngoài), 穴 (lỗ), 補助 (không ảnh hưởng) */
export type PlateLayer = 'outline' | 'hole' | 'aux';
export const PLATE_LAYER_LABEL: Record<PlateLayer, string> = { outline: '外形 (biên ngoài)', hole: '穴 (lỗ)', aux: '補助 (không tác dụng)' };
export interface PlateEnt {
  id: string;
  layer: PlateLayer;
  kind: 'line' | 'circle' | 'arc' | 'dim';
  /** line: các đỉnh polyline; circle / arc: [tâm]; dim: [chân trên đường, điểm] (kích thước điểm → đường) */
  pts: [number, number][];
  r?: number;
  closed?: boolean;
  /** cung: góc đầu / cuối (độ, ngược chiều kim đồng hồ) */
  a0?: number;
  a1?: number;
  /** kiểu nét: center = nét chấm gạch (đường tâm) */
  ltype?: 'center';
}
/** 作業平面: mặt phẳng làm việc để vẽ 補助線 2D (u, v là 2 trục trong mặt phẳng, đơn vị mm) */
export type WorkPlaneKind = 'level' | 'gridX' | 'gridY' | 'member';
export const WORKPLANE_KIND_LABEL: Record<WorkPlaneKind, string> = { level: 'Theo tầng (mặt bằng)', gridX: 'Theo trục số (mặt đứng)', gridY: 'Theo trục chữ (mặt đứng)', member: 'Theo đường tâm cấu kiện đã chọn' };
/** cách đặt mặt phẳng theo đường tâm cấu kiện */
export type WorkPlaneDir = 'axis' | 'X' | 'Y' | 'flat' | 'perp';
export const WORKPLANE_DIR_LABEL: Record<WorkPlaneDir, string> = {
  axis: 'Mặt đứng chứa đường tâm (⊥ keyplan)',
  X: 'Mặt đứng qua tâm, ⊥ phương X keyplan (song song trục số)',
  Y: 'Mặt đứng qua tâm, ⊥ phương Y keyplan (song song trục chữ)',
  flat: 'Mặt nghiêng chứa đường tâm (theo dốc cấu kiện)',
  perp: 'Mặt cắt vuông góc đường tâm',
};
/** tham số phụ khi tạo 作業平面 */
export interface WorkPlaneOpt {
  dir?: WorkPlaneDir;
  /** khoá ổn định của cấu kiện gốc (memberKey) */
  mkey?: string;
  /** vị trí trên đường tâm tính từ đầu I (mm) */
  at?: number;
  /** trục giao làm tâm xoay (mặt theo trục) */
  pivot?: string;
  /** xoay quanh trục đứng Z qua gốc (độ) */
  rot?: number;
  /** nghiêng quanh trục u của mặt phẳng (độ) */
  tilt?: number;
}
export interface WorkPlane {
  id: string;
  name: string;
  kind: WorkPlaneKind;
  /** id tầng / trục / cấu kiện */
  ref: string;
  /** dời theo pháp tuyến (mm) */
  offset: number;
  o: Vec3;
  u: Vec3;
  v: Vec3;
  /** 補助線 vẽ trên mặt phẳng (toạ độ u, v) */
  ents: PlateEnt[];
  hidden?: boolean;
  opt?: WorkPlaneOpt;
}

export interface PlateShape {
  id: string;
  /** 継手 của tấm này (tên 継手 giữ nguyên) */
  jointId?: string;
  /** point sở hữu tấm: `${id cây}|${vị trí}` – tấm chỉ áp cho đúng point đó */
  owner?: string;
  name: string;
  t: number;
  ents: PlateEnt[];
}
/** Biên ngoài + lỗ của tấm PL từ các entity theo layer */
export function plateGeometry(ps: PlateShape): { outer: [number, number][] | null; holes: { c: [number, number]; r: number }[]; holePolys: [number, number][][] } {
  return plateLoops(ps.ents);
}
export type BraceRef = 'node' | 'face';
export const BRACE_REF_LABEL: Record<BraceRef, string> = { node: '1-相手側鋼材との交点', face: '3-相手側鋼材面' };
export type BeamAlign = 'grid' | 'center' | 'out' | 'in';
export const BEAM_ALIGN_LABEL: Record<BeamAlign, string> = { grid: 'Theo trục', center: '芯 tâm 本柱', out: '外面合わせ', in: '内面合わせ' };

/** 勾配: độ dốc mái và độ nghiêng công trình, chỉ quản lý tại một chỗ. */
export interface SlopeConfig {
  roofPct: number; // độ dốc mái (%)
  groundX: number; // độ nghiêng nền / công trình theo X (%)
  groundY: number; // độ nghiêng nền / công trình theo Y (%)
}

/** Toạ độ điểm chuẩn trong hệ toạ độ tiết diện (x theo b, y theo h). */
export function anchorLocal(anchor: number, b: number, h: number): [number, number] {
  const col = anchor % 3; // 0 trái, 1 giữa, 2 phải
  const row = Math.floor(anchor / 3); // 0 trên, 1 giữa, 2 dưới
  return [(col - 1) * (b / 2), (1 - row) * (h / 2)];
}

/** Tâm cột trên mặt bằng từ giao trục + điểm chuẩn + xoay + dịch. */
export function columnCenter(gx: number, gy: number, c: Pick<Column, 'anchor' | 'rotation' | 'dx' | 'dy'>, b: number, h: number): [number, number] {
  const [ax, ay] = anchorLocal(c.anchor, b, h);
  const r = (c.rotation * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  // tâm = điểm chuẩn - R·a
  return [gx - (cos * ax - sin * ay) + c.dx, gy - (sin * ax + cos * ay) + c.dy];
}

/**
 * Lấy (hoặc tự thêm) mục master theo tên. Trả về id, hoặc chuỗi lỗi nếu tên đã có nhưng khác tiết diện / vật liệu.
 */
export function ensureMaster(d: Project, name: string, kind: MasterKind, sectionId: string, material: string): { id?: string; error?: string; added?: boolean } {
  const n = name.trim();
  if (!n) return { error: 'Chưa nhập 部材名' };
  const ex = d.master.find((m) => m.name === n);
  if (ex) {
    if (ex.kind !== kind) return { error: `Mã "${n}" đã được khai báo là ${MASTER_KIND_LABEL[ex.kind]}` };
    if (ex.sectionId !== sectionId || ex.material !== material) {
      const sc = d.sections.find((s) => s.id === ex.sectionId)?.code;
      return { error: `Mã "${n}" đã có trong master với ${sc} / ${ex.material}. Không cho phép trùng mã khác vật liệu.` };
    }
    return { id: ex.id };
  }
  const id = uid('ms');
  d.master.push({ id, name: n, kind, sectionId, material });
  return { id, added: true };
}

/** Danh sách mã bị trùng (cùng tên nhưng khác tiết diện/vật liệu) – dùng để cảnh báo. */
export function masterConflicts(master: MasterItem[]): string[] {
  const by = new Map<string, MasterItem[]>();
  for (const m of master) by.set(m.name, [...(by.get(m.name) ?? []), m]);
  return [...by.entries()].filter(([, v]) => v.length > 1).map(([k]) => k);
}

export interface RoofConfig {
  enabled: boolean;
  type: 'gable' | 'mono';
  eaveLevel: string; // tầng đỉnh cột / cao độ mái đua
  rafterSectionId: string;
  purlinSectionId: string;
  purlinSpacing: number;
  purlinEdge: number; // khoảng cách xà gồ đầu tiên tới đỉnh cột
}

export interface WallConfig {
  enabled: boolean;
  girtSectionId: string;
  girtSpacing: number;
  firstGirt: number; // cao độ xà gồ tường đầu tiên tính từ chân
  sides: { front: boolean; back: boolean; left: boolean; right: boolean };
}

export interface BracingConfig {
  memberId: string; // master 部材名 loại giằng
  roofBays: number[]; // chỉ số khoang (0 = giữa trục X1 và X2)
  wallBays: number[];
}

export interface Project {
  name: string;
  gridsX: GridLine[];
  gridsY: GridLine[];
  levels: Level[];
  sections: Section[];
  master: MasterItem[];
  slope: SlopeConfig;
  columns: Column[];
  beams: Beam[];
  /** ブレース既製品入力 */
  braces?: BraceInst[];
  /** Danh sách 勾配 ID (cũ) */
  slopes?: SlopeDef[];
  /** 勾配設定: các mặt 勾配 theo tầng */
  slopeFaces?: SlopeFace[];
  /** tab 母屋: マスター, 配置面, 母屋 */
  moya?: MoyaData;
  /** tab 胴縁: マスター, 配置面, 胴縁, 開口 */
  girt?: GirtData;
  sub2?: Sub2Data;
  /** 方杖 */
  knees?: KneeInst[];
  /** Liên kết giữa 2 cây (lệnh 切断 / 結合): SPL hoặc hàn (+ 合掌プレート) */
  links?: MemberLink[];
  /** Tấm PL tự vẽ */
  plates?: PlateShape[];
  /** 作業平面 + 補助線 */
  planes?: WorkPlane[];
  roof: RoofConfig;
  walls: WallConfig;
  bracing: BracingConfig;
  zones: Zone[];
  groups: Category[];
  classes: Category[];
  paints: PaintSpec[];
  joints: Joint[];
  bases: BasePlate[];
  params: Params;
}

export type MemberKind = 'column' | 'beam' | 'rafter' | 'purlin' | 'girt' | 'brace' | 'misc';

export const KIND_LABEL: Record<MemberKind, string> = {
  column: '柱',
  beam: '梁',
  rafter: '屋根梁',
  purlin: '母屋',
  girt: '胴縁',
  brace: 'ブレース',
  misc: '二次部材',
};

export const KIND_PREFIX: Record<MemberKind, string> = {
  column: 'C',
  beam: 'B',
  rafter: 'R',
  purlin: 'P',
  girt: 'G',
  brace: 'BR',
  misc: 'M',
};

export const KIND_COLOR: Record<MemberKind, string> = {
  column: '#3b82f6',
  beam: '#f59e0b',
  rafter: '#ef4444',
  purlin: '#10b981',
  girt: '#8b5cf6',
  brace: '#64748b',
  misc: '#db2777',
};

/** Cấu kiện đã được tính toán ra tọa độ (dùng cho 3D, 2D, bảng đặt hàng). */
export interface Member {
  id: string;
  /** 継手 theo vị trí (tên 継手) */
  joints?: { pos: JointPos; name: string; at?: number; dup?: boolean }[];
  kind: MemberKind;
  section: Section;
  a: Vec3;
  b: Vec3;
  /** Hướng "lên" của tiết diện (trục bụng). Nếu không có sẽ tự xác định. */
  up?: Vec3;
  /** Tên 部材名 từ master (nếu có) – dùng làm mã cấu kiện */
  name?: string;
  /** Đoạn thứ mấy khi cấu kiện bị chia tại 継手 (0 = đoạn đầu / chân) */
  piece?: number;
  /** Góc xoay cột trên mặt bằng (độ) */
  rotation?: number;
  /** Khoá dùng để gán nhóm/phân loại/sơn: 'n:<部材名>' hoặc 'k:<loại>' */
  key?: string;
  zone?: string;
  group?: string;
  cls?: string;
  paint?: string;
  joint?: string;
  base?: string;
  /** diện tích sơn (m²) */
  area?: number;
  mark: string;
  length: number;
  weight: number; // kg
  source?: string; // id phần tử gốc (cột/dầm) nếu có
  /** ダイアフラム / スチフナー tại 仕口 */
  dia?: Diaphragm[];
  /** 'shikuchi' = lõi cụm 仕口 (giữa 2 通しダイアフラム) */
  part?: 'shikuchi' | 'piece' | 'bolt';
  /** ピース nhập tay: id 母屋 / 胴縁 mà ピース này gắn vào */
  pcT?: string;
  /** các cụm 仕口 gắn trên đoạn này */
  sk?: SkInfo[];
  /** đầu b của đoạn cột bị cắt bởi 通しダイアフラム (không phải 継手) */
  dCut?: boolean;
  /** cảnh báo theo パラメーター (vd khoảng hở ダイアフラム) */
  warn?: string[];
  /** 組立品: các chi tiết hàn với nhau thành 1 cụm (符号 cụm = 符号 chi tiết chính) */
  asm?: string;
  /** 組立品: id cụm (dùng để gom) */
  asmId?: string;
  /** ブラケット: cánh (FLG) lùi so với đầu a / đầu b (mm) – bụng chạy tới mặt ngoài cột, cánh dừng ở mép 通しダイアフラム */
  flgSet?: [number, number];
  /** ブラケット: đầu a / đầu b hàn vào 本柱 (dựng hình スカラップ / ノンスカラップ) */
  brkEnd?: [boolean, boolean];
  /** ブラケット + 通しダイアフラム: [mặt trên ダイアフラム dưới, mặt dưới ダイアフラム trên] (z tuyệt đối) tại đầu a / b – bụng cắt khớp */
  dSurf?: [[number, number] | undefined, [number, number] | undefined];
  /** đầu a / b cắt đứng (song song mặt cột) – dầm dốc gặp cột */
  plumb?: [boolean, boolean];
  /** ブラケット スカラップ: bán kính r1 (mm) ở góc bụng tại mặt cột (0 / trống = ノンスカラップ) */
  scal?: number;
}

// ===== Tiện ích =====

let _seq = 0;
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(_seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function gridPositions(lines: GridLine[]): Map<string, number> {
  const m = new Map<string, number>();
  let acc = 0;
  lines.forEach((g, i) => {
    acc = i === 0 ? g.spacing : acc + g.spacing;
    m.set(g.id, acc);
  });
  return m;
}

/** Phân tích chuỗi nhập nhanh kiểu "0 6000 3*7500 6000" => danh sách khoảng cách. */
export function parseSpacing(input: string): number[] {
  const out: number[] = [];
  for (const tok of input.trim().split(/[\s,;]+/)) {
    if (!tok) continue;
    const m = tok.match(/^(\d+)\*(\d+(?:\.\d+)?)$/);
    if (m) {
      for (let i = 0; i < +m[1]; i++) out.push(+m[2]);
    } else if (!isNaN(+tok)) out.push(+tok);
  }
  return out;
}

export function spacingToString(lines: GridLine[]): string {
  const vals = lines.map((g) => g.spacing);
  const parts: string[] = [];
  let i = 0;
  while (i < vals.length) {
    let j = i;
    while (j + 1 < vals.length && vals[j + 1] === vals[i]) j++;
    const n = j - i + 1;
    parts.push(n > 1 ? `${n}*${vals[i]}` : `${vals[i]}`);
    i = j + 1;
  }
  return parts.join(' ');
}

export function gridName(axis: 'x' | 'y', i: number): string {
  if (axis === 'x') return String(i + 1);
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/** Diện tích tiết diện (mm²). */
export function sectionArea(s: Section): number {
  switch (s.type) {
    case 'I':
      return 2 * s.b * s.tf + (s.h - 2 * s.tf) * s.tw;
    case 'C':
    case 'Z':
      return s.tw * (s.h + 2 * s.b + 2 * s.c - 4 * s.tw);
    case 'Box':
      return s.h * s.b - (s.h - 2 * s.tw) * (s.b - 2 * s.tw);
    case 'Pipe':
      return (Math.PI / 4) * (s.h ** 2 - (s.h - 2 * s.tw) ** 2);
    case 'L':
      return s.tw * (s.h + s.b - s.tw);
    case 'Rod':
      return (Math.PI / 4) * s.h ** 2;
  }
}

/** Khối lượng riêng theo mét dài (kg/m), thép 7850 kg/m³. */
export const kgPerM = (s: Section) => s.kgm ?? sectionArea(s) * 1e-6 * 7850;

export const dist = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

// ===== Dự án mẫu =====

export function defaultProject(): Project {
  return convertJointAssign(defaultProjectRaw());
}
function defaultProjectRaw(): Project {
  const gx: GridLine[] = [0, 6000, 6000, 6000, 6000].map((s, i) => ({ id: uid('gx'), name: gridName('x', i), spacing: s }));
  const gy: GridLine[] = [0, 12000, 12000].map((s, i) => ({ id: uid('gy'), name: gridName('y', i), spacing: s }));
  const levels: Level[] = [
    { id: uid('lv'), name: 'Nền', elevation: 0 },
    { id: uid('lv'), name: 'Sàn lửng', elevation: 3500 },
    { id: uid('lv'), name: 'Đỉnh cột', elevation: 7000 },
  ];
  const J = (code: string, material: string): Section => {
    const f = findJis(code)!;
    return { id: uid('sc'), code, ...f.item.spec, material, kgm: f.item.kg };
  };
  const sections: Section[] = [
    J('H-400x200x8x13', 'SN490B'),
    J('H-350x175x7x11', 'SN400B'),
    J('H-300x150x6.5x9', 'SN400B'),
    J('C-100x50x20x2.3', 'SSC400'),
    J('C-150x65x20x2.3', 'SSC400'),
    J('M16 (丸鋼ブレース)', 'SNR400B'),
    J('□-200x200x9', 'BCR295'),
  ];
  const [colSec, , beamSec, cSec, zSec, rod, box] = sections;
  const master: MasterItem[] = [
    { id: uid('ms'), name: '1C1', kind: 'column', sectionId: colSec.id, material: 'SN490B', note: 'Cột biên' },
    { id: uid('ms'), name: '1C2', kind: 'column', sectionId: box.id, material: 'BCR295', note: 'Cột giữa đỡ sàn lửng' },
    { id: uid('ms'), name: '2G1', kind: 'beam', sectionId: beamSec.id, material: 'SN400B', note: 'Dầm sàn lửng' },
    { id: uid('ms'), name: 'V1', kind: 'brace', sectionId: rod.id, material: 'SNR400B', note: 'Giằng chéo' },
  ];
  const [mC1, mC2, mG1, mV1] = master;
  const col = (x: string, y: string, base: string, top: string, memberId: string, anchor = 4): Column => ({ id: uid('col'), x, y, base, top, memberId, anchor, rotation: 0, dx: 0, dy: 0 });
  const columns: Column[] = [];
  // cột biên tại trục A (điểm chuẩn mép ngoài: giữa dưới) và trục C (giữa trên)
  for (const x of gx) {
    columns.push(col(x.id, gy[0].id, levels[0].id, levels[2].id, mC1.id, 7));
    columns.push(col(x.id, gy[2].id, levels[0].id, levels[2].id, mC1.id, 1));
  }
  for (const x of gx.slice(0, 3)) columns.push(col(x.id, gy[1].id, levels[0].id, levels[1].id, mC2.id));
  const beams: Beam[] = [];
  for (let i = 0; i < 3; i++) {
    beams.push({ id: uid('bm'), level: levels[1].id, x1: gx[i].id, y1: gy[0].id, x2: gx[i].id, y2: gy[1].id, memberId: mG1.id });
    beams.push({ id: uid('bm'), level: levels[1].id, x1: gx[i].id, y1: gy[1].id, x2: gx[i].id, y2: gy[2].id, memberId: mG1.id });
  }
  for (let i = 0; i < 2; i++) {
    for (const y of gy) beams.push({ id: uid('bm'), level: levels[1].id, x1: gx[i].id, y1: y.id, x2: gx[i + 1].id, y2: y.id, memberId: mG1.id });
  }
  return {
    name: 'Nhà xưởng mẫu',
    gridsX: gx,
    gridsY: gy,
    levels,
    sections,
    master,
    slope: { roofPct: 10, groundX: 0, groundY: 0 },
    columns,
    beams,
    roof: {
      enabled: true,
      type: 'gable',
      eaveLevel: levels[2].id,
      rafterSectionId: sections[1].id,
      purlinSectionId: zSec.id,
      purlinSpacing: 1200,
      purlinEdge: 200,
    },
    walls: {
      enabled: true,
      girtSectionId: cSec.id,
      girtSpacing: 1500,
      firstGirt: 1200,
      sides: { front: true, back: true, left: true, right: true },
    },
    bracing: { memberId: mV1.id, roofBays: [0, 3], wallBays: [0, 3] },
    ...defaultExt(gx),
    joints: [
      { ...newJoint(1, 'beam'), name: 'GJ1', type: 'GPL', memberIds: [mG1.id], note: 'Đầu dầm nối vào cột' },
      { ...newJoint(2, 'beam'), name: 'GJ2', type: 'DS', note: 'Dầm phụ 二面せん断' },
      { ...newJoint(1, 'column'), name: 'CJ1', memberIds: [mC1.id], pos: 4500, note: 'Nối cột tại +4500' },
    ],
    bases: [{ ...newBase(1), memberIds: [mC1.id, mC2.id] }],
  };
}

/** Nâng cấp file dự án phiên bản cũ (chưa có master / 勾配). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any): Project {
  const p = raw as Project & { roof: { slopePct?: number }; bracing: { sectionId?: string } };
  if (!p.slope) p.slope = { roofPct: p.roof?.slopePct ?? 10, groundX: 0, groundY: 0 };
  // sửa cột lưu thiếu tầng chân / đỉnh (lỗi nhập cũ): chân = tầng thấp nhất, đỉnh = tầng kế trên
  if (Array.isArray(p.levels) && Array.isArray(p.columns)) {
    const lvs = [...p.levels].sort((a, b) => a.elevation - b.elevation);
    const ok = (id: string) => lvs.some((l) => l.id === id);
    for (const c of p.columns) {
      if (!ok(c.base)) c.base = lvs[0]?.id ?? c.base;
      if (!ok(c.top) || c.top === c.base) c.top = lvs[lvs.findIndex((l) => l.id === c.base) + 1]?.id ?? c.top;
    }
  }
  if (!p.master) {
    p.master = [];
    const counters: Record<string, number> = {};
    const get = (kind: MasterKind, sectionId: string) => {
      const ex = p.master.find((m) => m.kind === kind && m.sectionId === sectionId);
      if (ex) return ex.id;
      const pre = kind === 'column' ? 'C' : kind === 'beam' ? 'G' : 'V';
      counters[pre] = (counters[pre] ?? 0) + 1;
      const sec = p.sections.find((s) => s.id === sectionId);
      const id = uid('ms');
      p.master.push({ id, name: `${pre}${counters[pre]}`, kind, sectionId, material: sec?.material ?? 'SS400' });
      return id;
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of p.columns as any[]) {
      c.memberId = c.memberId ?? get('column', c.sectionId);
      c.anchor = c.anchor ?? 4;
      c.rotation = c.rotation ?? 0;
      c.dx = c.dx ?? 0;
      c.dy = c.dy ?? 0;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const b of p.beams as any[]) b.memberId = b.memberId ?? get('beam', b.sectionId);
    if (!p.bracing.memberId && p.bracing.sectionId) p.bracing.memberId = get('brace', p.bracing.sectionId);
  }
  for (const sc of p.sections) {
    const f = findJis(sc.code);
    if (!f && findJis(sc.code + ' (STKR)')) sc.code += ' (STKR)'; // □ cỡ nhỏ cũ → STKR
    const f2 = findJis(sc.code);
    if (f2) sc.kgm = f2.item.kg;
  }
  const ext = defaultExt(p.gridsX);
  p.zones = p.zones ?? ext.zones;
  p.groups = p.groups ?? ext.groups;
  p.classes = p.classes ?? ext.classes;
  p.paints = p.paints ?? ext.paints;
  p.joints = (p.joints ?? []).map(migrateJoint);
  for (const ps of p.paints ?? []) ps.spec = hdzNew(ps.spec);
  convertJointAssign(p);
  p.bases = p.bases ?? [];
  p.braces = p.braces ?? [];
  p.slopes = p.slopes ?? [];
  p.knees = p.knees ?? [];
  p.plates = p.plates ?? [];
  p.planes = p.planes ?? [];
  p.params = { ...defaultParams(), ...(p.params ?? {}) };
  return p;
}

// ===== 工区 / グループ / 分類 / 塗装 / 継手 / パラメーター =====

/** 工区: khu thi công theo dải trục X (từ trục x1 tới trục x2) */
export interface Zone {
  id: string;
  name: string;
  color: string;
  x1: string;
  x2: string;
}

/** グループ hoặc 分類: gom các cấu kiện theo khoá (部材名 hoặc loại cấu kiện) */
export interface Category {
  id: string;
  name: string;
  color: string;
  keys: string[];
}

/** 塗装: chỉ thị sơn hoặc メッキ */
export interface PaintSpec {
  id: string;
  name: string;
  kind: 'paint' | 'galv';
  color: string;
  spec: string; // vd: 錆止め JIS K5674, HDZT77 (JIS H 8641:2021)
  coats: number;
  thickness: number; // µm
  keys: string[];
}

export type JointType = 'SPL' | 'GPL' | 'DS' | 'EP';
export const JOINT_TYPE_LABEL: Record<JointType, string> = {
  SPL: 'SPL – nối bản ghép cánh + bụng',
  GPL: 'GPL – bản mã (ガセット) 1 mặt',
  DS: '二面せん断 – bản bụng 2 mặt',
  EP: 'エレクションピース – 柱 現場溶接',
};
/** Tên ngắn của kiểu 継手 (hiện trong danh sách) */
export const jointTypeName = (t: JointType) => (t === 'DS' ? '二面せん断' : t === 'EP' ? 'エレクションピース' : t);

/**
 * エレクションピース (cột hàn tại công trường): mỗi mặt cột hàn 1 tấm ピース ở cột dưới + 1 tấm ở cột trên,
 * 2 tấm 添板 kẹp 2 bên, bắt bulông tạm. Đơn vị mm.
 */
export interface EpSpec {
  /** số mặt cột có ピース (2 = 2 mặt đối nhau theo Y, 4 = cả 4 mặt) */
  faces: 2 | 4;
  /** số ピース trên mỗi mặt, khoảng cách tâm–tâm giữa các ピース, lệch tâm nhóm so với tâm mặt cột */
  n: number;
  sp: number;
  off: number;
  /** ピース (cột trên và cột dưới mỗi cây 1 tấm riêng): dày, nhô ra khỏi mặt cột, cao mỗi tấm */
  t: number;
  w: number;
  h: number;
  /** 添板 (2 tấm kẹp 2 bên, nối ピース trên với ピース dưới): dày, rộng (theo phương nhô), dài */
  spT: number;
  spW: number;
  spL: number;
  /** bulông mỗi bên mối nối (dọc trục cột), ピッチ, へりあき tới mối nối */
  nb: number;
  pitch: number;
  edge: number;
  /** 下がり止め: tấm PL hàn ở mặt TRONG của cột (4 mặt), phía trên カドピタ. Số tấm mỗi mặt (0 = không), dày, rộng, cao, mép dưới cách mối nối, khoảng cách tâm–tâm, lệch tâm */
  sdN: number;
  sdT: number;
  sdW: number;
  sdH: number;
  sdZ: number;
  sdSp: number;
  sdOff: number;
  /** カドピタ (コラム用裏当て金): vòng 裏当て金 lót mặt trong cột tại mối hàn. Có / không, dày, rộng (theo trục cột), mép trên cao hơn mối nối */
  kpOn: boolean;
  kpT: number;
  kpW: number;
  kpUp: number;
}
export const defaultEp = (): EpSpec => ({
  faces: 4, n: 1, sp: 150, off: 0, t: 16, w: 100, h: 150, spT: 9, spW: 90, spL: 250, nb: 2, pitch: 60, edge: 35,
  sdN: 0, sdT: 9, sdW: 50, sdH: 50, sdZ: 15, sdSp: 150, sdOff: 0,
  kpOn: false, kpT: 9, kpW: 25, kpUp: 12,
});
export const epOf = (j: Joint): EpSpec => ({ ...defaultEp(), ...(j.ep ?? {}) });
/** Quy cách カドピタ (平鋼 SN490B, スノウチ) */
export const KADOPITA_SIZES: { code: string; t: number; w: number }[] = [
  { code: 'FB-9×25', t: 9, w: 25 }, { code: '5C-9×25', t: 9, w: 25 }, { code: 'FB-8×24', t: 8, w: 24 }, { code: '5C-8×24', t: 8, w: 24 },
  { code: 'FB-6×25', t: 6, w: 25 }, { code: 'FB-9×50', t: 9, w: 50 }, { code: 'FB-12×50', t: 12, w: 50 },
];
/** ルートギャップ (khe cột trên – cột dưới) của エレクションピース, mặc định 7 mm */
export const epGap = (j: Joint) => j.gap ?? 7;

/** Nhóm bulông: rows = số hàng vuông góc trục thanh, cols = số cột dọc trục thanh mỗi bên mối nối */
export interface BoltGroup {
  rows: number;
  cols: number;
  pitch: number; // ピッチ dọc trục thanh (mm)
  gauge: number; // ゲージ giữa các hàng (mm)
  edge: number; // へりあき khoảng cách tới mép bản (mm)
  gauge2?: number; // g2 (ゲージ thứ 2, bố trí チドリ / ダブル)
  /** へりあき phía đầu bản (xa mối nối); trống = bằng edge (phía mối nối) */
  edge2?: number;
}

/** 継手: mối nối của dầm / cột, gắn theo 部材名 */
export interface Joint {
  id: string;
  name: string; // vd J1
  target: JointTarget;
  type: JointType;
  /** @deprecated cách gán cũ; nay gán theo vị trí tại MasterItem.joints */
  memberIds: string[];
  plateMaterial: string;
  /** Vật liệu bản: 'member' (mặc định) = theo vật liệu 部材 dùng 継手; 'custom' = theo plateMaterial */
  matMode?: 'member' | 'custom';
  bolt: { dia: number; grade: string };
  flangeT: number; // bản ghép ngoài cánh
  innerT: number; // bản ghép trong cánh
  webT: number; // bản bụng / bản mã
  webH: number; // 0 = tự tính theo tiết diện
  flangeBolts: BoltGroup;
  webBolts: BoltGroup;
  /** すきま giữa 2 đầu thanh tại mối nối (mm), mặc định 10 */
  gap?: number;
  pos: number; // vị trí 中: cách đầu thanh (cột: từ chân cột); 0 = giữa thanh
  /** kích thước bản theo tiêu chuẩn (0/undefined = tự tính) */
  flangeL?: number; // 外添板 dài
  innerW?: number; // 内添板 rộng
  webL?: number; // 添板 bụng dài
  gplT?: number; // GPL dày (BJ-2: GPL + WPL ダブル)
  /** ブレース GPL: 品番 ブレースシート (フルサト) */
  sheet?: string;
  /** ブレース GPL: hình dạng mặc định (図1 / 図2 / 図3 / ブレースシート / PL tự vẽ) */
  shape?: string;
  /** ブレース GPL: chiều dài theo trục giằng / bề rộng đầu bulông / bề rộng chân (図2) (0 = tự tính) */
  brL?: number;
  brW?: number;
  brW0?: number;
  /** ブレース 中 クロスプレート: dày, dài (theo X khung), cao (theo Y khung), số bulông mỗi phía */
  midT?: number;
  midL?: number;
  midW?: number;
  midN?: number;
  /** GPL: lệch tâm nhóm bulông so với trục dầm theo phương đứng (mm, + = lên) */
  boltOy?: number;
  /** GPL: khoảng lệch từ tâm 部材 tới tâm GPL (mm, + = lên). Mặc định 0 = nằm giữa */
  gplOy?: number;
  /** GPL: クリアランス đầu dầm ↔ mặt cột / dầm chính (mm), mặc định 10 */
  clear?: number;
  /** GPL: hình dạng cắt FLG (trống = theo パラメーター) */
  flgCut?: GplCut;
  ref?: string; // mã mẫu thư viện, vd SCSS GJ H-400x200x8x13
  /** エレクションピース (type EP) */
  ep?: Partial<EpSpec>;
  note: string;
}

/** ベース: chân cột */
export interface BasePlate {
  id: string;
  name: string; // vd BP1
  memberIds: string[]; // master cột
  kind: '露出' | '根巻' | '埋込';
  t: number;
  b: number; // theo X
  d: number; // theo Y
  material: string;
  anchor: {
    dia: number;
    n: number;
    length: number;
    material: string;
    /** số bulông mỗi cạnh song song X (gồm góc) / mỗi cạnh song song Y (gồm góc) */
    nx?: number;
    ny?: number;
    /** khoảng cách tâm bulông → mép bản đế theo X / theo Y (mm) */
    ex?: number;
    ey?: number;
    /** hình dạng: I thẳng, L móc, J móc, P ナット + アンカープレート */
    shape?: 'I' | 'L' | 'J' | 'P';
    /** chiều dài móc / cạnh アンカープレート (mm) */
    hook?: number;
    /** 突出長: đầu bulông nhô trên mặt bản đế (mm) */
    proj?: number;
  };
  /** 隅切り: cắt góc bản đế (mm) */
  chamfer?: number;
  grout: number; // chiều dày vữa (mm)
  note: string;
}

export type JointTarget = 'beam' | 'column' | 'brace';
export const JOINT_TARGET_LABEL: Record<JointTarget, string> = { beam: '梁', column: '柱', brace: 'ブレース' };

export function newJoint(n: number, target: JointTarget, p?: Params): Joint {
  const g = { rows: 2, cols: 2, pitch: 60, gauge: 90, edge: 40 };
  if (target === 'brace')
    return {
      id: uid('jt'),
      name: `VJ${n}`,
      target,
      type: 'GPL',
      memberIds: [],
      plateMaterial: 'SN400B',
      bolt: { dia: 16, grade: p?.member.boltGrade ?? 'S10T' },
      flangeT: 0,
      innerT: 0,
      webT: 9,
      webH: 0,
      flangeBolts: { ...g },
      webBolts: { rows: 1, cols: 1, pitch: 60, gauge: 0, edge: 40 },
      pos: 0,
      shape: 'fig2',
      note: '',
    };
  return {
    id: uid('jt'),
    name: `${target === 'beam' ? 'GJ' : 'CJ'}${n}`,
    target,
    type: target === 'beam' ? 'SPL' : 'SPL',
    memberIds: [],
    plateMaterial: 'SN490B',
    bolt: { dia: 20, grade: p?.member.boltGrade ?? 'S10T' },
    flangeT: 12,
    innerT: 12,
    webT: 9,
    webH: 0,
    flangeBolts: { ...g },
    webBolts: { ...g, rows: 3, gauge: 60 },
    pos: target === 'beam' ? 0 : 1000,
    note: '',
  };
}

export function newBase(n: number): BasePlate {
  return {
    id: uid('bp'),
    name: `BP${n}`,
    memberIds: [],
    kind: '露出',
    t: 25,
    b: 400,
    d: 500,
    material: 'SN490B',
    anchor: { dia: 24, n: 4, length: 600, material: 'ABR400' },
    grout: 50,
    note: '',
  };
}

/** Nâng cấp mối nối kiểu cũ (bolt/weld) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateJoint(j: any): Joint {
  // エレクションピース tạo ở bản trước có khe 0 → khe cột chuẩn 7 mm
  if (j.target && j.type === 'EP' && !j.gap) return { ...j, gap: 7 } as Joint;
  if (j.target) return j as Joint;
  const n = newJoint(1, 'beam');
  return {
    ...n,
    id: j.id,
    name: j.name,
    memberIds: j.memberIds ?? [],
    type: j.type === 'weld' ? 'GPL' : 'SPL',
    flangeT: j.flange?.t ?? n.flangeT,
    webT: j.web?.t ?? n.webT,
    bolt: { dia: j.bolt?.dia ?? 20, grade: j.bolt?.grade ?? 'S10T' },
    note: j.note ?? '',
  };
}

export interface SectionSpec {
  type: SectionType;
  h: number;
  b: number;
  tw: number;
  tf: number;
  c: number;
}

export type DiaphragmType = 'through' | 'inner';
export interface DiaphragmParams {
  /** 角形・円形鋼管: 通しダイアフラム (cắt cột, tạo cụm 仕口) hoặc 内ダイアフラム */
  type: DiaphragmType;
  /** 通し: t cánh dầm + n size */
  addThrough: number;
  /** 内 / H柱スチフナー: t cánh dầm + n size */
  addInner: number;
  /** 出寸法 (mm), 0 = tự động 25/30 theo t cột */
  overhang: number;
  /** khoảng hở tối thiểu giữa 2 ダイアフラム (mm) – còn kiểm thêm ≥ 10t */
  minGap: number;
  /** Chênh cao 2 cánh dầm nhỏ hơn giá trị này thì gộp chung 1 ダイアフラム (mm) */
  merge: number;
  /** m1 / m2: khoảng tối thiểu từ mép cánh dầm (tại mép ダイアフラム) tới mặt trên / dưới ダイアフラム (mm) */
  minM?: number;
}
export const defaultDiaphragm = (): DiaphragmParams => ({ type: 'through', addThrough: 2, addInner: 1, overhang: 25, minGap: 150, merge: 50, minM: 3 });
export const DIAPHRAGM_TYPE_LABEL: Record<DiaphragmType, string> = { through: '通しダイアフラム', inner: '内ダイアフラム' };

/** Chỉnh sửa 1 cụm 仕口 của cột. Cụm tự động được khớp theo cao độ tâm z (±150 mm). */
export interface ShikuchiEdit {
  id: string;
  /** cao độ tâm cụm (mm) */
  z: number;
  /** edit = sửa cụm tự động, add = thêm tay, del = xoá cụm tự động */
  mode: 'edit' | 'add' | 'del';
  /** ống: 通し / 内 (trống = theo パラメーター) */
  type?: DiaphragmType;
  /** 出寸法 (mm) */
  overhang?: number;
  /** khoảng cách tâm 2 ダイアフラム trên – dưới (mm) = chiều cao cụm */
  h?: number;
  tTop?: number;
  tBot?: number;
  /** chiều dày ống lõi 仕口コア (mm), trống = như cột */
  coreT?: number;
}
export const SHIKUCHI_MATCH = 150;

/** Thông tin 1 cụm 仕口 sau khi tính (để hiển thị / sửa ở tab 仕口) */
export interface SkInfo {
  zc: number;
  h: number;
  type: 'through' | 'inner' | 'stiff';
  overhang: number;
  tTop: number;
  tBot: number;
  coreT?: number;
  coreLen?: number;
  auto: boolean;
  editId?: string;
  warn?: string[];
}

/** Một bản ダイアフラム / スチフナー gắn với cột (toạ độ tuyệt đối z, mặt bằng theo trục cột) */
export interface Diaphragm {
  kind: 'through' | 'inner' | 'stiff';
  z: number; // cao độ tâm bản
  t: number;
  w: number; // kích thước theo trục b của cột (hoặc đường kính)
  d: number; // kích thước theo trục h
  round?: boolean;
  /** スチフナー H柱: lệch tâm theo trục b (2 bản 2 bên bụng) */
  off?: number;
}

/** パラメーター: tiêu chuẩn của công trình, quyền cao nhất, lưu lại dùng cho công trình sau */
export interface Params {
  name: string;
  weld: {
    rows: { tMax: number; leg: number; kind: string }[]; // chiều dày bản ≤ tMax → cạnh hàn
    electrode: string;
    columnBeam: string;
    inspection: string;
    /** Hàn ブラケット (大梁) ↔ 本柱 */
    bracket?: BracketWeld;
  };
  member: {
    allowedMaterials: string[];
    column: { material: string; prefix: string };
    beam: { material: string; prefix: string };
    brace: { material: string; prefix: string };
    beamTopOffset: number; // mặt trên dầm so với cao độ tầng (mm)
    defaultAnchorEdge: number; // điểm chuẩn mặc định của cột biên
    boltGrade: string;
    /** Hướng lắp dầm mặc định */
    beamDir?: BeamDir;
    /** GPL: hình dạng cắt FLG mặc định */
    gplCut?: GplCut;
    /** GPL: chiều dày chuẩn để so diện tích (mm) */
    gplTref?: number;
    /** ダイアフラム / 仕口 tại mối nối ブラケット của 本柱 */
    diaphragm?: DiaphragmParams;
  };
  purlin: { section: SectionSpec; material: string; maxSpacing: number; edge: number };
  girt: { section: SectionSpec; material: string; maxSpacing: number; firstGirt: number };
  /** Hiển thị trên Mặt bằng / Trục (trống = mặc định: hiện tất cả) */
  plan?: PlanShow;
}
/** Hàn ブラケット ↔ 本柱: FLG ↔ ダイアフラム = 完全溶込み (開先), web ↔ mặt ngoài cột = 隅肉 */
export interface BracketWeld {
  /** FLG: ルート間隔 (mm) */
  rootGap: number;
  /** FLG: 開先角度 (độ) */
  bevel: number;
  /** web: kiểu hàn */
  webKind: '隅肉' | '完全溶込み';
  /** web: cạnh hàn 脚長 S (0 = theo bảng chiều dày) */
  webLeg: number;
  /** スカラップ (khoét bụng tại chỗ hàn cánh) / ノンスカラップ */
  scallop?: 'scallop' | 'non';
  /** スカラップ: bán kính r1 (bụng) / r2 (chỗ tiếp giáp cánh) */
  r1?: number;
  r2?: number;
}
export const defaultBracketWeld = (): BracketWeld => ({ rootGap: 7, bevel: 35, webKind: '隅肉', webLeg: 0, scallop: 'non', r1: 35, r2: 10 });
export const bracketWeldOf = (P: Params): BracketWeld => ({ ...defaultBracketWeld(), ...(P.weld.bracket ?? {}) });
export interface PlanShow {
  /** tên 部材 */
  memberName: boolean;
  /** tên 継手 (ブラケット / ピン) */
  jointName: boolean;
  /** tấm SPL / GPL */
  plates: boolean;
  /** bulông */
  bolts: boolean;
  /** tấm ダイアフラム của 本柱 */
  diaphragm?: boolean;
}
export const planShowOf = (P: Params): PlanShow => ({ memberName: true, jointName: true, plates: true, bolts: true, diaphragm: true, ...(P.plan ?? {}) });

export function defaultParams(): Params {
  return {
    name: 'Tiêu chuẩn mặc định',
    weld: {
      rows: [
        { tMax: 6, leg: 4, kind: '隅肉 (fillet)' },
        { tMax: 9, leg: 6, kind: '隅肉 (fillet)' },
        { tMax: 12, leg: 8, kind: '隅肉 (fillet)' },
        { tMax: 19, leg: 10, kind: '隅肉 (fillet)' },
        { tMax: 999, leg: 0, kind: '完全溶込み (CJP)' },
      ],
      electrode: 'YGW11 / E70XX',
      columnBeam: '完全溶込み (CJP) cánh, 隅肉 bụng',
      inspection: 'UT 100% đường hàn CJP, VT 100% còn lại',
      bracket: defaultBracketWeld(),
    },
    member: {
      allowedMaterials: ['SS400', 'SN400A', 'SN400B', 'SN400C', 'SN490B', 'SN490C', 'SM400A', 'SM490A', 'SM490B', 'STKR400', 'STKR490', 'BCR295', 'JBCR295', 'JBCR385', 'BCP235', 'BCP325', 'BCP325T', 'STK400', 'STK490', 'STKN400B', 'STKN490B', 'SSC400', 'SNR400B', 'SNR490B', 'G450', 'G550'],
      column: { material: 'SS400', prefix: 'C' },
      beam: { material: 'SS400', prefix: 'G' },
      brace: { material: 'SS400', prefix: 'V' },
      beamTopOffset: 0,
      defaultAnchorEdge: 7,
      boltGrade: 'S10T',
      beamDir: 'asc',
      gplCut: 'one',
      gplTref: 9,
      diaphragm: defaultDiaphragm(),
    },
    purlin: { section: { type: 'C', h: 150, b: 65, tw: 2.3, tf: 2.3, c: 20 }, material: 'SSC400', maxSpacing: 1200, edge: 200 },
    girt: { section: { type: 'C', h: 100, b: 50, tw: 2.3, tf: 2.3, c: 20 }, material: 'SSC400', maxSpacing: 1500, firstGirt: 1200 },
  };
}

/** Cạnh hàn theo chiều dày bản theo tiêu chuẩn hàn */
export function weldFor(p: Params, t: number) {
  return [...p.weld.rows].sort((a, b) => a.tMax - b.tMax).find((r) => t <= r.tMax) ?? p.weld.rows[p.weld.rows.length - 1];
}

export function defaultExt(gx: GridLine[]) {
  const half = Math.max(1, Math.floor(gx.length / 2));
  return {
    zones: gx.length > 1
      ? [
          { id: uid('zn'), name: '1工区', color: '#0ea5e9', x1: gx[0].id, x2: gx[half].id },
          { id: uid('zn'), name: '2工区', color: '#f97316', x1: gx[half].id, x2: gx[gx.length - 1].id },
        ]
      : [],
    groups: [
      { id: uid('gp'), name: '主架構', color: '#2563eb', keys: ['k:column', 'k:rafter'] },
      { id: uid('gp'), name: '床梁', color: '#d97706', keys: ['k:beam'] },
      { id: uid('gp'), name: '母屋・胴縁', color: '#059669', keys: ['k:purlin', 'k:girt'] },
      { id: uid('gp'), name: 'ブレース', color: '#64748b', keys: ['k:brace'] },
    ] as Category[],
    classes: [
      { id: uid('cl'), name: '本体鉄骨', color: '#7c3aed', keys: ['k:column', 'k:beam', 'k:rafter', 'k:brace'] },
      { id: uid('cl'), name: '二次部材', color: '#db2777', keys: ['k:purlin', 'k:girt'] },
    ] as Category[],
    paints: [
      { id: uid('pt'), name: '錆止め塗装', kind: 'paint', color: '#b91c1c', spec: 'JIS K 5674 1種', coats: 1, thickness: 35, keys: ['k:column', 'k:beam', 'k:rafter'] },
      { id: uid('pt'), name: '溶融亜鉛メッキ', kind: 'galv', color: '#94a3b8', spec: 'HDZT77', coats: 1, thickness: 77, keys: ['k:brace'] },
    ] as PaintSpec[],
    joints: [] as Joint[],
    bases: [] as BasePlate[],
    params: defaultParams(),
  };
}

/** Chu vi tiết diện (mm) – dùng tính diện tích sơn */
export function sectionPerimeter(s: Section): number {
  switch (s.type) {
    case 'I':
      return 2 * s.h + 4 * s.b - 2 * s.tw;
    case 'C':
    case 'Z':
      return 2 * (s.h + 2 * s.b + 2 * s.c);
    case 'Box':
    case 'L':
      return 2 * (s.h + s.b);
    case 'Pipe':
    case 'Rod':
      return Math.PI * s.h;
  }
}

/** Khoá phân nhóm cho cấu kiện: theo 部材名 nếu có, ngược lại theo loại */
export const memberKey = (m: Pick<Member, 'name' | 'kind'>) => (m.name ? `n:${m.name}` : `k:${m.kind}`);

export function sectionCode(s: SectionSpec): string {
  switch (s.type) {
    case 'I':
      return `H-${s.h}x${s.b}x${s.tw}x${s.tf}`;
    case 'C':
      return `C-${s.h}x${s.b}x${s.c}x${s.tw}`;
    case 'Z':
      return `Z-${s.h}x${s.b}x${s.c}x${s.tw}`;
    case 'Box':
      return `□-${s.h}x${s.b}x${s.tw}`;
    case 'Pipe':
      return `○-${s.h}x${s.tw}`;
    case 'L':
      return `L-${s.h}x${s.b}x${s.tw}`;
    case 'Rod':
      return `M${s.h} (丸鋼ブレース)`;
  }
}

/** Lấy (hoặc thêm) tiết diện trong thư viện theo thông số */
export function ensureSection(d: Project, spec: SectionSpec, material: string): string {
  const code = sectionCode(spec);
  const ex = d.sections.find((s) => s.code === code);
  if (ex) return ex.id;
  const id = uid('sc');
  d.sections.push({ id, code, ...spec, material, kgm: findJis(code)?.item.kg });
  return id;
}

/** Kiểm tra công trình có tuân theo パラメーター không */
export function checkParams(p: Project): string[] {
  const out: string[] = [];
  const usedSec = new Set([...p.master.map((m) => m.sectionId), p.roof.rafterSectionId, p.roof.purlinSectionId, p.walls.girtSectionId]);
  for (const s of p.sections) if (usedSec.has(s.id) && !findJis(s.code)) out.push(`Tiết diện ${s.code} không theo chuẩn JIS – hãy chọn lại.`);
  const P = p.params;
  for (const m of p.master) {
    if (!P.member.allowedMaterials.includes(m.material)) out.push(`部材名 ${m.name}: vật liệu ${m.material} không nằm trong danh sách cho phép.`);
  }
  if (p.roof.purlinSpacing > P.purlin.maxSpacing) out.push(`母屋: bước ${p.roof.purlinSpacing} mm vượt tối đa ${P.purlin.maxSpacing} mm.`);
  if (p.walls.girtSpacing > P.girt.maxSpacing) out.push(`胴縁: bước ${p.walls.girtSpacing} mm vượt tối đa ${P.girt.maxSpacing} mm.`);
  const pc = p.sections.find((s) => s.id === p.roof.purlinSectionId)?.code;
  if (pc && pc !== sectionCode(P.purlin.section)) out.push(`母屋: đang dùng ${pc}, tiêu chuẩn là ${sectionCode(P.purlin.section)}.`);
  const gc = p.sections.find((s) => s.id === p.walls.girtSectionId)?.code;
  if (gc && gc !== sectionCode(P.girt.section)) out.push(`胴縁: đang dùng ${gc}, tiêu chuẩn là ${sectionCode(P.girt.section)}.`);
  for (const m of p.master) {
    const sc = p.sections.find((s) => s.id === m.sectionId);
    const fj = sc && findJis(sc.code);
    if (fj && !fj.cat.materials.includes(m.material)) out.push(`部材名 ${m.name}: vật liệu ${m.material} không hợp với ${fj.cat.standard} (dùng ${fj.cat.materials.slice(0, 4).join(', ')}…).`);
  }
  for (const m of p.master)
    for (const [pos, id] of Object.entries(m.joints ?? {})) {
      const j = p.joints.find((x) => x.id === id);
      if (!j) out.push(`継手: 部材名 ${m.name} (${JOINT_POS_LABEL[pos as JointPos]}) gắn với mối nối không còn tồn tại.`);
      else if (j.target !== m.kind) out.push(`継手: ${j.name} là mối nối ${j.target === 'beam' ? 'dầm' : 'cột'} nhưng gắn cho ${m.name}.`);
    }
  return out;
}

/** JIS H 8641:2021 đổi ký hiệu mạ kẽm từ khối lượng bám (HDZ) sang chiều dày màng (HDZT, µm) – 日建連 Q&A A-7-28 */
export const HDZ_MAP: Record<string, string> = { HDZ35: 'HDZT49', HDZ40: 'HDZT56', HDZ45: 'HDZT63', HDZ50: 'HDZT70', HDZ55: 'HDZT77' };
export const hdzNew = (spec: string) => spec.replace(/HDZ\s?(35|40|45|50|55)(?!\d)/g, (_m, n) => HDZ_MAP['HDZ' + n]);

/** Quy tắc tên 継手 dầm: 大梁 左右 = GBJn, 中 = GJn · 小梁 左右 = BJn, 中 = BGJn */
export const beamJointPrefix = (role: MasterRole | undefined, pos: JointPos) =>
  role === 'sub' ? (pos === 'mid' ? 'BGJ' : 'BJ') : pos === 'mid' ? 'GJ' : 'GBJ';

/** Tên tiếp theo cho một tiền tố (số lớn nhất đang có + 1, bỏ qua tên đã dùng) */
export function nextJointName(p: { joints: { name: string }[] }, prefix: string, taken?: Set<string>) {
  const re = new RegExp(`^${prefix}(\\d+)$`);
  let n = 0;
  for (const j of p.joints) {
    const m = j.name.match(re);
    if (m) n = Math.max(n, +m[1]);
  }
  n++;
  while (taken?.has(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/** Đặt lại tên mọi 継手 dầm theo quy tắc (theo thứ tự 部材名 trong master). Trả về danh sách [id, tên mới]. */
export function beamJointRenames(p: Project): [string, string][] {
  const first = new Map<string, string>(); // jointId → prefix
  for (const m of p.master)
    if (m.kind === 'beam' && m.role !== 'knee')
      for (const pos of ['left', 'right', 'mid'] as JointPos[]) {
        const id = m.joints?.[pos];
        if (id && !first.has(id) && p.joints.some((j) => j.id === id && j.target === 'beam')) first.set(id, beamJointPrefix(m.role, pos));
      }
  const taken = new Set(p.joints.filter((j) => !first.has(j.id)).map((j) => j.name));
  const cnt: Record<string, number> = {};
  const out: [string, string][] = [];
  for (const [id, pre] of first) {
    let n = (cnt[pre] ?? 0) + 1;
    while (taken.has(`${pre}${n}`)) n++;
    cnt[pre] = n;
    out.push([id, `${pre}${n}`]);
  }
  return out.filter(([id, nm]) => p.joints.find((j) => j.id === id)?.name !== nm);
}


/** 合掌プレート: tấm ốp bụng tại mối hàn nối 2 cây (đặt giữa mối nối, dời được) */
export interface GasshoPlate {
  name: string;
  t: number;
  /** dài theo trục cây (mm) */
  L: number;
  /** cao (mm) */
  H: number;
  /** 1 = một mặt bụng, 2 = hai mặt */
  sides: 1 | 2;
  /** dời dọc trục từ mối nối (mm, + theo chiều cây thứ nhất) */
  off: number;
  /** dời đứng từ tâm cây (mm, + lên) */
  offV: number;
  material?: string;
}
/** Liên kết 2 cây tại đầu gần nhau nhất của chúng */
export interface MemberLink {
  id: string;
  a: string;
  b: string;
  type: 'spl' | 'weld';
  /** 継手 SPL (type = spl) */
  jointId?: string;
  /** 合掌プレート (type = weld, tùy chọn) */
  plate?: GasshoPlate;
}
export const newGassho = (n: number, h = 300): GasshoPlate => ({ name: `GP${n}`, t: 9, L: 300, H: Math.max(100, Math.round(h * 0.7 / 10) * 10), sides: 2, off: 0, offV: 0 });
