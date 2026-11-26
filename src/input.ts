// Trạng thái nhập liệu dùng chung giữa tab "Nhập cột" và khung nhìn "Mặt bằng / Trục"
import { BeamAlign, BeamDir, BeamEnd, BeamPlace, BeamVRef, BraceRef, SubSlope, Member, Project, Section, Vec3 } from './model';

/** Thao tác đang chờ xác nhận (xem trước) */
export type Pending = { kind: 'column'; nodes: [string, string][]; editId: string | null } | { kind: 'beam'; editId: string | null } | { kind: 'beams'; items: Partial<BeamInput>[]; editId: null } | { kind: 'line'; what: 'post' | 'sbeam'; targets: LineTarget[]; ref1?: string; ref2?: string; editId: null };
import type { LineTarget } from './lineInput';

export interface ColumnInput {
  /** Số bước đã hoàn thành theo trình tự: 0 chưa xong bước nào … 3 sẵn sàng đặt cột */
  step: number;
  memberName: string;
  sectionId: string;
  material: string;
  anchor: number | null;
  rotation: number;
  dx: number;
  dy: number;
  base: string;
  top: string;
  /** chỉnh cao độ chân / đỉnh so với tầng (mm) */
  dzb: number;
  dzt: number;
  xs: string[];
  ys: string[];
  jLo: number;
  jHi: number;
  gap: number;
  baseId: string;
  slopeId: string;
}

/** Form nhập dầm (từng dòng) */
export interface BeamInput {
  memberId: string;
  level: string;
  dz: number;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  off: number;
  align: BeamAlign;
  place: BeamPlace;
  vref: BeamVRef;
  up1: number;
  up2: number;
  j1: number;
  j2: number;
  gap: number;
  /** Dầm theo 2 部材 đã chọn: toạ độ mặt bằng 2 đầu (null = theo giao trục) */
  p1: [number, number] | null;
  p2: [number, number] | null;
  ref1: string;
  ref2: string;
  slopeId: string;
  /** '' = theo パラメーター */
  dir: '' | BeamDir;
  end1: BeamEnd;
  end2: BeamEnd;
  jRef: 'center' | 'face';
  /** 'sub' = 小梁 */
  role?: 'sub';
  /** 小梁 勾配 + lệch mặt trên */
  sl?: SubSlope;
  sdz?: number;
}

/** Các loại nhập: 本柱 · 大梁 · 小梁 · 間柱 · 方杖 · ブレース */
export type InputKind = 'column' | 'beam' | 'sbeam' | 'post' | 'knee' | 'brace';
export const INPUT_KIND_LABEL: Record<InputKind, string> = { column: '本柱', beam: '大梁', sbeam: '小梁', post: '間柱', knee: '方杖', brace: 'ブレース' };

/** Form 方杖 */
export interface KneeInput {
  memberId: string;
  dc: number;
  db: number;
  /** cách nhập: khoảng cách 2 đầu / góc + chiều dài */
  mode?: 'dist' | 'ang';
  /** góc so với dầm (độ) */
  ang?: number;
  /** chiều dài 方杖 (mm) */
  len?: number;
}

/** Form ブレース既製品入力 */
export interface BraceInput {
  memberId: string;
  plane: 'plan' | 'wall';
  level: string;
  top: string;
  x1: string;
  y1: string;
  x2: string;
  y2: string;
  x: boolean;
  ref: BraceRef;
  gap1: number;
  gap2: number;
  dz1: number;
  dz2: number;
}

export function initialBraceInput(p: Project): BraceInput {
  const lv = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  return {
    memberId: p.master.find((m) => m.kind === 'brace')?.id ?? '',
    plane: 'plan',
    level: lv[1]?.id ?? lv[0]?.id ?? '',
    top: lv[1]?.id ?? lv[0]?.id ?? '',
    x1: p.gridsX[0]?.id ?? '',
    y1: p.gridsY[0]?.id ?? '',
    x2: p.gridsX[1]?.id ?? '',
    y2: p.gridsY[1]?.id ?? '',
    x: true,
    ref: 'face',
    gap1: 50,
    gap2: 50,
    dz1: -150,
    dz2: -150,
  };
}

/** Thao tác trực tiếp trên 3D: đặt cột / dầm bằng cách bấm giao trục, sửa khi bấm vào cấu kiện */
export interface PickState {
  kind: InputKind;
  /** bấm giao trục trên 3D để đặt */
  on: boolean;
  /** điểm đầu dầm đã bấm */
  start: { x: string; y: string } | null;
  /** 部材 thứ nhất đã bấm khi nhập dầm bằng 2 部材 */
  first?: { member: string; ref: string; pt: [number, number]; z: number } | null;
  /** Xem trước rồi mới xác nhận */
  preview?: boolean;
  /** id cột / dầm đang sửa */
  editId: string | null;
  /** 修正: bấm 部材 đã nhập trên 3D để sửa */
  fix?: boolean;
  /** 削除: bấm 部材 đã nhập trên 3D để xoá */
  del?: boolean;
  /** 削除: các 部材 đã chọn (id gốc), bấm / quét chọn nhiều cây */
  delSel?: string[];
  /** 修正: các cấu kiện đang chọn để sửa (bấm / quét chọn) */
  fixSel?: string[];
  /** 切断: chọn cây cần cắt rồi chọn đường chuẩn */
  cut?: boolean;
  cutSrc?: string | null;
  /** 結合: chọn 2 cây gộp thành 1, nối bằng SPL hoặc hàn */
  merge?: boolean;
  mergeSrc?: string | null;
  /** 結合 hàn: thêm 合掌プレート (mặc định có) */
  mergePlate?: boolean;
  /** 結合: 継手 gán cho mối nối – '' tự động, 'weld' hàn, còn lại id 継手 */
  mergeJoint?: string;
  /** 切断: tự thêm SPL nếu cây có 継手 SPL (mặc định có) */
  cutSpl?: boolean;
  /** 切断: khoảng hở 2 cây sau khi cắt (mm), trống = theo すきま SPL */
  cutGap?: number | null;
  /** 切断: 継手 tại chỗ cắt ('' = tự động theo cây, 'none' = cắt rời, id = 継手 chọn) */
  cutJoint?: string;
  /** データ: nối đầu 部材 tới điểm khác (pt) hoặc tới đường chuẩn (line) */
  data?: boolean;
  dataHow?: 'pt' | 'line';
  dataSrc?: { src: string; k: 0 | 1 } | null;
  dataLine?: import('./editOps').EndTarget | null;
  /** thông báo kết quả lệnh 切断 / 結合 */
  opMsg?: { ok: boolean; text: string } | null;
}

export function initialBeamInput(p: Project): BeamInput {
  const lv = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  return {
    memberId: p.master.find((m) => m.kind === 'beam')?.id ?? '',
    level: lv[1]?.id ?? lv[0]?.id ?? '',
    dz: 0,
    x1: p.gridsX[0]?.id ?? '',
    y1: p.gridsY[0]?.id ?? '',
    x2: p.gridsX[1]?.id ?? p.gridsX[0]?.id ?? '',
    y2: p.gridsY[0]?.id ?? '',
    off: 0,
    align: 'grid',
    place: 'center',
    vref: 'top',
    up1: 0,
    up2: 0,
    j1: 0,
    j2: 0,
    gap: 10,
    p1: null,
    p2: null,
    ref1: '',
    ref2: '',
    slopeId: '',
    dir: '',
    end1: 'pin',
    end2: 'pin',
    jRef: 'center',
  };
}

export type View2DKind = 'plan' | 'ex' | 'ey' | 'wp';
export type View2DMode = 'column' | 'post' | 'beam' | 'sbeam' | 'brace' | 'delete';

export interface View2DState {
  view: View2DKind;
  levelId: string; // mặt bằng tầng
  gridId: string; // trục đang cắt (X với 'ex', Y với 'ey')
  /** 作業平面 đang xem (view 'wp') */
  planeId?: string;
  mode: View2DMode;
  beamMemberId: string;
  /** 端部 dầm nhập ở 2D: ピン (GPL) / 剛接合 (ブラケット) */
  beamEnd?: 'pin' | 'rigid';
  /** chiều dài ブラケット (継手距離) khi 剛接合 */
  bj?: number;
  braceMemberId?: string;
  braceX?: boolean;
  postMemberId?: string;
  sbeamMemberId?: string;
}

export function initialColumnInput(p: Project): ColumnInput {
  const lv = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  const sec = p.sections.find((s) => s.type === 'I') ?? p.sections[0];
  return {
    step: 3,
    memberName: p.master.find((m) => m.kind === 'column')?.name ?? '',
    sectionId: sec?.id ?? '',
    material: 'SS400',
    anchor: 4,
    rotation: 0,
    dx: 0,
    dy: 0,
    base: lv[0]?.id ?? '',
    // đỉnh cột mặc định: tầng cao nhất (≠ chân cột)
    top: lv[lv.length - 1]?.id ?? '',
    xs: [],
    ys: [],
    dzb: 0,
    dzt: 0,
    jLo: 0,
    jHi: 0,
    gap: 0,
    baseId: '',
    slopeId: '',
  };
}

export function initialView2D(p: Project): View2DState {
  return {
    view: 'plan',
    levelId: [...p.levels].sort((a, b) => a.elevation - b.elevation)[0]?.id ?? '',
    gridId: p.gridsX[0]?.id ?? '',
    mode: 'column',
    beamMemberId: p.master.find((m) => m.kind === 'beam')?.id ?? '',
  };
}

/** Đa giác mặt cắt cột trên mặt bằng (toạ độ địa phương, x theo b, y theo h). */
export function sectionOutline(s: Section): [number, number][] {
  const { h, b } = s;
  const tw = Math.max(s.tw, 1), tf = Math.max(s.tf, 1);
  if (s.type === 'I')
    return [
      [-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf], [tw / 2, h / 2 - tf], [b / 2, h / 2 - tf],
      [b / 2, h / 2], [-b / 2, h / 2], [-b / 2, h / 2 - tf], [-tw / 2, h / 2 - tf], [-tw / 2, -h / 2 + tf], [-b / 2, -h / 2 + tf],
    ];
  if (s.type === 'Pipe' || s.type === 'Rod') {
    const n = 24;
    return Array.from({ length: n }, (_, i) => [(h / 2) * Math.cos((2 * Math.PI * i) / n), (h / 2) * Math.sin((2 * Math.PI * i) / n)] as [number, number]);
  }
  return [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]];
}

/** Biến đổi điểm địa phương -> toạ độ mặt bằng theo tâm + góc xoay. */
export function placeOutline(pts: [number, number][], cx: number, cy: number, rotDeg: number): [number, number][] {
  const r = (rotDeg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return pts.map(([x, y]) => [cx + c * x - s * y, cy + s * x + c * y]);
}

// ===== Nhập dầm bằng cách chọn 2 部材 (cột hoặc dầm) =====
type P2 = [number, number];
/** Điểm trên mặt bằng ứng với chỗ bấm: cột → tâm cột; dầm → hình chiếu lên trục dầm (bắt trục lưới ±150, làm tròn 50) */
export function memberPlanPoint(m: Member, hit: Vec3, gridXs: number[], gridYs: number[]): P2 {
  if (m.kind === 'column') return [Math.round(m.a[0]), Math.round(m.a[1])];
  const ax = m.a[0], ay = m.a[1], dx = m.b[0] - ax, dy = m.b[1] - ay;
  const L2 = dx * dx + dy * dy || 1;
  let t = Math.max(0, Math.min(1, ((hit[0] - ax) * dx + (hit[1] - ay) * dy) / L2));
  const L = Math.sqrt(L2);
  // bắt vào giao với đường trục lưới gần nhất
  const cands: number[] = [0, 1];
  if (Math.abs(dx) > 1) for (const gx of gridXs) cands.push((gx - ax) / dx);
  if (Math.abs(dy) > 1) for (const gy of gridYs) cands.push((gy - ay) / dy);
  const near = cands.filter((c) => c >= 0 && c <= 1).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
  if (near !== undefined && Math.abs(near - t) * L < 150) t = near;
  else t = Math.round((t * L) / 50) * 50 / L;
  return [Math.round(ax + dx * t), Math.round(ay + dy * t)];
}

/** Chân đường vuông góc từ điểm q xuống trục dầm m (nếu nằm trong đoạn) */
function footOn(m: Member, q: P2): P2 | null {
  const ax = m.a[0], ay = m.a[1], dx = m.b[0] - ax, dy = m.b[1] - ay;
  const L2 = dx * dx + dy * dy;
  if (L2 < 1) return null;
  const t = ((q[0] - ax) * dx + (q[1] - ay) * dy) / L2;
  if (t < -0.001 || t > 1.001) return null;
  return [Math.round(ax + dx * t), Math.round(ay + dy * t)];
}

/**
 * Hai đầu dầm mới từ 2 部材 đã bấm:
 * – cột + cột: tâm 2 cột; – cột + dầm / dầm + cột: dầm mới vuông góc với dầm đã chọn;
 * – 2 dầm song song: dầm mới vuông góc (小梁); – 2 dầm cắt nhau: theo 2 điểm bấm.
 */
export function beamEndsFromMembers(m1: Member, p1: P2, m2: Member, p2: P2): [P2, P2] {
  const dir = (m: Member) => {
    const dx = m.b[0] - m.a[0], dy = m.b[1] - m.a[1], l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  if (m1.kind === 'column' && m2.kind !== 'column') return [p1, footOn(m2, p1) ?? p2];
  if (m1.kind !== 'column' && m2.kind === 'column') return [footOn(m1, p2) ?? p1, p2];
  if (m1.kind !== 'column' && m2.kind !== 'column') {
    const [u1, v1] = dir(m1), [u2, v2] = dir(m2);
    if (Math.abs(u1 * v2 - v1 * u2) < 0.02) return [p1, footOn(m2, p1) ?? p2];
  }
  return [p1, p2];
}

/** Tầng gần cao độ z nhất */
export function nearestLevel(p: Project, z: number): string {
  return [...p.levels].sort((a, b) => Math.abs(a.elevation - z) - Math.abs(b.elevation - z))[0]?.id ?? '';
}
