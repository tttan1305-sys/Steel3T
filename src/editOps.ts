// Lệnh sửa 部材 đã nhập: 削除 nhiều cây, 切断 (cắt theo đường chuẩn), 結合 (gộp 2 cây bằng SPL hoặc hàn)
import { Beam, Column, Joint, Member, MemberLink, Project, Vec3, newGassho, uid } from './model';
import { beamEnds, geometry } from './build';
import { jointGap } from './jointGeom';
import { nearestLevel } from './input';

type P2 = [number, number];

/** Xoá các 部材 theo id gốc (cột, dầm, ブレース, 方杖) */
export function deleteSources(d: Project, ids: string[]) {
  const s = new Set(ids);
  const n0 = d.columns.length + d.beams.length + (d.braces ?? []).length + (d.knees ?? []).length;
  d.columns = d.columns.filter((x) => !s.has(x.id));
  d.beams = d.beams.filter((x) => !s.has(x.id));
  d.braces = (d.braces ?? []).filter((x) => !s.has(x.id));
  // 方杖 gắn vào cột / dầm đã xoá cũng xoá theo
  d.knees = (d.knees ?? []).filter((x) => !s.has(x.id) && !s.has(x.col) && !s.has(x.beam));
  // liên kết SPL / hàn của cây đã xoá
  d.links = (d.links ?? []).filter((l) => !s.has(l.a) && !s.has(l.b));
  return n0 - (d.columns.length + d.beams.length + d.braces.length + d.knees.length);
}

/** Đường chuẩn để cắt */
export type Cutter =
  | { kind: 'member'; m: Member }
  | { kind: 'grid'; a: P2; b: P2; label: string }
  | { kind: 'level'; z: number; label: string }
  | { kind: 'aux'; a: Vec3; b: Vec3; label: string };

/** Các đoạn đã dựng của 1 phần tử gốc → đầu / cuối (bỏ qua tách ブラケット) */
function span(members: Member[], src: string): { a: Vec3; b: Vec3; kind: string } | null {
  const ps = members.filter((m) => m.source === src).sort((x, y) => (x.piece ?? 0) - (y.piece ?? 0));
  if (!ps.length) return null;
  return { a: ps[0].a, b: ps[ps.length - 1].b, kind: ps[0].kind };
}
/** tham số t trên đoạn a→b (mặt bằng) tại giao với đường c→d; null nếu song song */
function crossT(a: P2, b: P2, c: P2, e: P2): number | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = e[0] - c[0], sy = e[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-6 * Math.hypot(rx, ry) * Math.hypot(sx, sy)) return null;
  return ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
}
/** cao độ của đường (3D) tại điểm mặt bằng gần (x, y) nhất */
function zOnLine(a: Vec3, b: Vec3, x: number, y: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 < 1 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
  return { z: a[2] + (b[2] - a[2]) * t, d: Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) };
}

/** Cắt 1 dầm / cột tại đường chuẩn. Trả về thông báo lỗi hoặc null khi xong. */
export interface CutOpts {
  /** tự thêm mối nối SPL tại chỗ cắt nếu cây đã có 継手 SPL */
  autoSpl: boolean;
  /** khoảng hở giữa 2 cây sau khi cắt (mm); bỏ trống = theo すきま của SPL (hoặc 0) */
  gap?: number;
  /** 継手 chọn cho chỗ cắt (SPL / エレクションピース…); không có → theo cây */
  jointId?: string;
}
/** 継手 SPL đang dùng cho cây (riêng của cây hoặc theo 部材名), ưu tiên 中 */
export function memberSpl(d: Project, src: string): Joint | undefined {
  const inst = d.beams.find((x) => x.id === src) ?? d.columns.find((x) => x.id === src);
  if (!inst) return undefined;
  const ms = d.master.find((m) => m.id === inst.memberId)?.joints ?? {};
  const own = inst.joints ?? {};
  const ids = [own.mid, ms.mid, ...Object.values(own), ...Object.values(ms)].filter(Boolean) as string[];
  return ids.map((id) => d.joints.find((j) => j.id === id)).find((j) => j?.type === 'SPL' || j?.type === 'EP');
}
/** liên kết của cây cũ: chuyển sang đoạn chứa đầu gần cây kia */
function relink(d: Project, members: Member[], src: string, newId: string, nearNew: (p: Vec3) => boolean) {
  for (const l of d.links ?? []) {
    const other = l.a === src ? l.b : l.b === src ? l.a : null;
    if (!other) continue;
    const so = span(members, other);
    if (!so) continue;
    if (nearNew(so.a) || nearNew(so.b)) {
      if (l.a === src) l.a = newId;
      else l.b = newId;
    }
  }
}

export function cutMember(d: Project, members: Member[], src: string, c: Cutter, opts: CutOpts = { autoSpl: true }): string | null {
  const sp = span(members, src);
  const splJ = !opts.autoSpl ? undefined : (opts.jointId && d.joints.find((j) => j.id === opts.jointId)) || memberSpl(d, src);
  const gap = Math.max(0, opts.gap ?? (splJ ? jointGap(splJ) : 0));
  const addLink = (a: string, b: string) => {
    if (splJ) d.links = [...(d.links ?? []), { id: uid('lk'), a, b, type: 'spl', jointId: splJ.id }];
  };
  if (!sp) return 'Không tìm thấy 部材 cần cắt.';
  const bm = d.beams.find((x) => x.id === src);
  const col = d.columns.find((x) => x.id === src);
  if (bm) {
    let t: number | null = null;
    const A: P2 = [sp.a[0], sp.a[1]], B: P2 = [sp.b[0], sp.b[1]];
    if (c.kind === 'level') {
      const dz = sp.b[2] - sp.a[2];
      if (Math.abs(dz) < 1) return 'Dầm nằm ngang: không cắt được bằng đường tầng. Hãy chọn đường trục, 補助線 hoặc 部材.';
      t = (c.z - sp.a[2]) / dz;
    } else if (c.kind === 'member') {
      const ma: P2 = [c.m.a[0], c.m.a[1]], mb: P2 = [c.m.b[0], c.m.b[1]];
      if (Math.hypot(mb[0] - ma[0], mb[1] - ma[1]) < 1) {
        // cột / 間柱: cắt tại hình chiếu tâm cột lên dầm
        const L2 = (B[0] - A[0]) ** 2 + (B[1] - A[1]) ** 2 || 1;
        t = ((ma[0] - A[0]) * (B[0] - A[0]) + (ma[1] - A[1]) * (B[1] - A[1])) / L2;
      } else t = crossT(A, B, ma, mb);
    } else if (c.kind === 'grid') t = crossT(A, B, c.a, c.b);
    else t = crossT(A, B, [c.a[0], c.a[1]], [c.b[0], c.b[1]]);
    if (t === null) return 'Đường chuẩn song song với dầm, không có giao điểm.';
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (t * L < 100 || (1 - t) * L < 100) return 'Giao điểm nằm ngoài dầm (hoặc quá sát đầu dầm).';
    // toạ độ đường đặt (chưa cộng độ lệch) của 2 đầu theo đúng thứ tự 左 → 右
    const g = geometry(d);
    const [e1, e2] = beamEnds(g, bm, d.params.member.beamDir) as unknown as [P2, P2];
    const Le = Math.hypot(e2[0] - e1[0], e2[1] - e1[1]) || 1;
    if (t * Le - gap / 2 < 100 || (1 - t) * Le - gap / 2 < 100) return 'Khoảng hở quá lớn so với chiều dài dầm.';
    const ta = t - gap / 2 / Le, tb = t + gap / 2 / Le;
    const at = (k: number): P2 => [e1[0] + (e2[0] - e1[0]) * k, e1[1] + (e2[1] - e1[1]) * k];
    const P = at(ta), Q = at(tb);
    const u1 = bm.up1 ?? 0, u2 = bm.up2 ?? 0, uP = u1 + (u2 - u1) * ta, uQ = u1 + (u2 - u1) * tb;
    const cutRef = c.kind === 'member' ? c.m.source : undefined;
    const keepSpl = (lo: number, hi: number, list?: P2[]) =>
      list?.filter((q) => {
        const s = ((q[0] - e1[0]) * (e2[0] - e1[0]) + (q[1] - e1[1]) * (e2[1] - e1[1])) / ((e2[0] - e1[0]) ** 2 + (e2[1] - e1[1]) ** 2 || 1);
        return s > lo && s < hi;
      });
    const b1: Beam = { ...bm, p1: [...e1], p2: P, up1: u1, up2: uP, end2: 'pin', j2: 0, ref2: cutRef, spl: keepSpl(0, t, bm.spl), weld: keepSpl(0, t, bm.weld) };
    const b2: Beam = { ...structuredClone(bm), id: uid('bm'), p1: Q, p2: [...e2], up1: uQ, up2: u2, end1: 'pin', j1: 0, ref1: cutRef, spl: keepSpl(t, 1, bm.spl), weld: keepSpl(t, 1, bm.weld) };
    for (const x of [b1, b2]) {
      if (!x.spl?.length) delete x.spl;
      if (!x.weld?.length) delete x.weld;
    }
    const i = d.beams.indexOf(bm);
    d.beams.splice(i, 1, b1, b2);
    // liên kết cũ ở phía đoạn 2 chuyển sang đoạn 2
    const tOf = (q: Vec3) => ((q[0] - sp.a[0]) * (sp.b[0] - sp.a[0]) + (q[1] - sp.a[1]) * (sp.b[1] - sp.a[1])) / ((sp.b[0] - sp.a[0]) ** 2 + (sp.b[1] - sp.a[1]) ** 2 || 1);
    relink(d, members, src, b2.id, (q) => Math.abs(tOf(q) - 1) < Math.abs(tOf(q)));
    addLink(b1.id, b2.id);
    return null;
  }
  if (col) {
    const x = sp.a[0], y = sp.a[1];
    const zb = Math.round(Math.min(sp.a[2], sp.b[2])), zt = Math.round(Math.max(sp.a[2], sp.b[2]));
    let z: number;
    if (c.kind === 'level') z = c.z;
    else if (c.kind === 'grid') return 'Cột thẳng đứng: hãy cắt bằng đường tầng, 補助線 hoặc dầm.';
    else if (c.kind === 'member') {
      if (Math.hypot(c.m.b[0] - c.m.a[0], c.m.b[1] - c.m.a[1]) < 1) return 'Cột: hãy cắt bằng dầm, đường tầng hoặc 補助線.';
      z = zOnLine(c.m.a, c.m.b, x, y).z;
    } else z = zOnLine(c.a, c.b, x, y).z;
    if (z < zb + 100 || z > zt - 100) return 'Cao độ cắt nằm ngoài cột (hoặc quá sát đầu cột).';
    z = Math.round(z);
    if (z - gap / 2 < zb + 100 || z + gap / 2 > zt - 100) return 'Khoảng hở quá lớn so với chiều dài cột.';
    const lv = nearestLevel(d, z);
    const zA = Math.round(z - gap / 2), zB = Math.round(z + gap / 2);
    const h1 = z - zb, h2 = zt - z;
    const jLo = col.jLo ?? 0, jHi = col.jHi ?? 0;
    const c1: Column = { ...col, zb, zt: zA, top: lv, jLo: jLo && jLo < h1 ? jLo : 0, jHi: jHi > h2 ? jHi - h2 : 0, splZ: col.splZ?.filter((v) => v < z), weldZ: col.weldZ?.filter((v) => v < z) };
    const c2: Column = { ...structuredClone(col), id: uid('col'), zb: zB, zt, base: lv, jLo: jLo > h1 ? jLo - h1 : 0, jHi: jHi && jHi < h2 ? jHi : 0, noBase: true, splZ: col.splZ?.filter((v) => v > z), weldZ: col.weldZ?.filter((v) => v > z) };
    for (const x of [c1, c2]) {
      if (!x.splZ?.length) delete x.splZ;
      if (!x.weldZ?.length) delete x.weldZ;
    }
    const i = d.columns.indexOf(col);
    d.columns.splice(i, 1, c1, c2);
    relink(d, members, src, c2.id, (q) => q[2] > z);
    addLink(c1.id, c2.id);
    return null;
  }
  return 'Chỉ cắt được cột và dầm.';
}

/** 2 đầu gần nhau nhất của 2 cây: điểm nối và khoảng cách */
export function linkPoint(members: Member[], a: string, b: string) {
  const sa = span(members, a), sb = span(members, b);
  if (!sa || !sb) return null;
  let best = { p: sa.a, q: sb.a, d: Infinity };
  for (const p of [sa.a, sa.b]) for (const q of [sb.a, sb.b]) {
    const dd = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (dd < best.d) best = { p, q, d: dd };
  }
  return { at: [(best.p[0] + best.q[0]) / 2, (best.p[1] + best.q[1]) / 2, (best.p[2] + best.q[2]) / 2] as Vec3, d: best.d, pa: best.p };
}

export interface MergeOpts {
  /** 継手 gán cho mối nối: undefined/'' tự động, 'weld' hàn, còn lại id 継手 (SPL / EP) */
  jointId?: string;
  /** mối hàn: thêm 合掌プレート */
  plate: boolean;
  plateT?: number;
  plateL?: number;
  plateH?: number;
  sides?: 1 | 2;
}
/** 結合: giữ nguyên 2 cây, nối tại 2 đầu gần nhau – SPL nếu cây đã có 継手 SPL, không thì hàn (+ 合掌プレート) */
export function mergeMembers(d: Project, members: Member[], srcA: string, srcB: string, o: MergeOpts): { err?: string; link?: MemberLink } {
  if (srcA === srcB) return { err: 'Hãy chọn 2 cây khác nhau.' };
  const lp = linkPoint(members, srcA, srcB);
  if (!lp) return { err: 'Không tìm thấy 部材.' };
  if (lp.d > 600) return { err: `2 cây cách nhau ${Math.round(lp.d)} mm ở đầu gần nhất – chưa chạm nhau, không nối được.` };
  if ((d.links ?? []).some((l) => (l.a === srcA && l.b === srcB) || (l.a === srcB && l.b === srcA))) return { err: '2 cây này đã được nối.' };
  const pick = o.jointId && o.jointId !== 'weld' ? d.joints.find((j) => j.id === o.jointId) : undefined;
  if (o.jointId && o.jointId !== 'weld' && !pick) return { err: 'Không tìm thấy 継手 đã chọn.' };
  const spl = o.jointId === 'weld' ? undefined : pick ?? memberSpl(d, srcA) ?? memberSpl(d, srcB);
  const h = members.find((m) => m.source === srcA)?.section.h ?? 300;
  const n = (d.links ?? []).filter((l) => l.plate).length + 1;
  const link: MemberLink = spl
    ? { id: uid('lk'), a: srcA, b: srcB, type: 'spl', jointId: spl.id }
    : {
        id: uid('lk'),
        a: srcA,
        b: srcB,
        type: 'weld',
        plate: o.plate ? { ...newGassho(n, h), ...(o.plateT ? { t: o.plateT } : {}), ...(o.plateL ? { L: o.plateL } : {}), ...(o.plateH ? { H: o.plateH } : {}), ...(o.sides ? { sides: o.sides } : {}) } : undefined,
      };
  d.links = [...(d.links ?? []), link];
  return { link };
}

/** データ: đầu (0 = đầu / 1 = cuối) gần điểm bấm nhất của 1 phần tử */
export function nearestEnd(members: Member[], src: string, hit: Vec3): 0 | 1 {
  const s = span(members, src);
  if (!s) return 0;
  const d = (q: Vec3) => Math.hypot(q[0] - hit[0], q[1] - hit[1], q[2] - hit[2]);
  return d(s.a) <= d(s.b) ? 0 : 1;
}

/** Đích để nối đầu 部材: điểm mặt bằng (xy), cao độ (z), đường chuẩn mặt bằng (line) và cột đích (ref) */
export interface EndTarget {
  xy?: P2;
  line?: { a: P2; b: P2 };
  z?: number;
  ref?: string;
  label: string;
}

/** Điểm đích khi bấm 1 部材: cột → tâm cột (mặt bằng); dầm → điểm gần nhất trên trục dầm, cao độ mặt trên dầm */
export function targetOnMember(members: Member[], m: Member, hit: Vec3): EndTarget {
  if (m.kind === 'column') return { xy: [m.a[0], m.a[1]], ref: m.source, label: m.mark };
  const s = (m.source && span(members, m.source)) || { a: m.a, b: m.b };
  const ux = s.b[0] - s.a[0], uy = s.b[1] - s.a[1], uz = s.b[2] - s.a[2];
  const L2 = ux * ux + uy * uy || 1;
  const t = Math.max(0, Math.min(1, ((hit[0] - s.a[0]) * ux + (hit[1] - s.a[1]) * uy) / L2));
  return { xy: [s.a[0] + ux * t, s.a[1] + uy * t], z: s.a[2] + uz * t + m.section.h / 2, label: m.mark };
}

/**
 * データ: dời 1 đầu của cột / dầm tới đích. Dầm: đổi toạ độ mặt bằng (theo điểm, hoặc kéo dài / cắt ngắn tới đường chuẩn);
 * cột: đổi cao độ chân / đỉnh. Trả về lỗi nếu không làm được.
 */
export function moveEnd(d: Project, src: string, k: 0 | 1, t: EndTarget): string | null {
  const col = d.columns.find((c) => c.id === src);
  if (col) {
    if (t.z === undefined) return 'Cột: chỉ nối được đầu chân / đỉnh tới đường tầng, 補助線 ngang hoặc dầm.';
    if (k === 0) col.zb = Math.round(t.z);
    else col.zt = Math.round(t.z);
    return null;
  }
  const b = d.beams.find((x) => x.id === src);
  if (!b) return 'Chỉ sửa được cột và dầm.';
  const g = geometry(d);
  const [e1, e2] = beamEnds(g, b, d.params.member.beamDir);
  if (e1.includes(undefined) || e2.includes(undefined)) return 'Dầm chưa có toạ độ.';
  const p1: P2 = [e1[0]!, e1[1]!], p2: P2 = [e2[0]!, e2[1]!];
  const [me, other] = k === 0 ? [p1, p2] : [p2, p1];
  let q: P2 | undefined = t.xy;
  if (t.line) {
    const tt = crossT(other, me, t.line.a, t.line.b);
    if (tt === null) return 'Dầm song song với đường chuẩn.';
    q = [other[0] + (me[0] - other[0]) * tt, other[1] + (me[1] - other[1]) * tt];
  }
  if (!q) return 'Đích không có toạ độ mặt bằng.';
  if (Math.hypot(q[0] - other[0], q[1] - other[1]) < 100) return 'Đích trùng đầu còn lại của dầm.';
  me[0] = Math.round(q[0]);
  me[1] = Math.round(q[1]);
  b.p1 = p1;
  b.p2 = p2;
  // giữ thứ tự hiện tại: không để hướng lắp đảo lại 2 đầu
  if (k === 0) b.ref1 = t.ref ?? b.ref1;
  else b.ref2 = t.ref ?? b.ref2;
  return null;
}
