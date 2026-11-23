import { moyaMembers } from './moya';
import { girtMembers } from './girt';
import { pcMembersOf } from './pieceSet';
import { sub2Members } from './sub2';
// Từ dữ liệu dự án => danh sách cấu kiện có tọa độ thực (mm)
import { plateUp, plateAtLeast, diaphragmOverhang } from './standards';
import { colFitZ, faceAxes, faceKnots, faceZ, facesAt, hasPoints } from './slopeFace';
import { Diaphragm, ShikuchiEdit, SkInfo, SHIKUCHI_MATCH, defaultDiaphragm, Project, Member, MemberKind, Section, Vec3, gridPositions, dist, kgPerM, KIND_PREFIX, columnCenter, memberKey, sectionPerimeter, JointPos, JOINT_POS_LABEL, Beam, BraceInst, BeamDir, slopeDz, beamEnd, bracketWeldOf } from './model';

export interface Geometry {
  xs: Map<string, number>;
  ys: Map<string, number>;
  lv: Map<string, number>;
  x0: number;
  xN: number;
  y0: number;
  yN: number;
  eave: number;
  roofZ: (y: number) => number;
  ridgeY: number;
  /** Độ lệch cao độ nền do độ nghiêng công trình (勾配) */
  groundZ: (x: number, y: number) => number;
  baseLevel: string;
}

export function geometry(p: Project): Geometry {
  const xs = gridPositions(p.gridsX);
  const ys = gridPositions(p.gridsY);
  const lv = new Map(p.levels.map((l) => [l.id, l.elevation]));
  const xv = [...xs.values()];
  const yv = [...ys.values()];
  const x0 = Math.min(...xv, 0);
  const xN = Math.max(...xv, 0);
  const y0 = Math.min(...yv, 0);
  const yN = Math.max(...yv, 0);
  const eave = lv.get(p.roof.eaveLevel) ?? Math.max(...p.levels.map((l) => l.elevation), 0);
  const k = p.slope.roofPct / 100;
  const ridgeY = p.roof.type === 'gable' ? (y0 + yN) / 2 : yN;
  const roofZ = (y: number) => (p.roof.type === 'gable' ? eave + k * (ridgeY - Math.abs(y - ridgeY) - y0) : eave + k * (y - y0));
  const groundZ = (x: number, y: number) => { const v = ((x - x0) * (+p.slope?.groundX || 0) + (y - y0) * (+p.slope?.groundY || 0)) / 100; return Number.isFinite(v) ? v : 0; };
  const baseLevel = [...p.levels].sort((a, b) => a.elevation - b.elevation)[0]?.id ?? '';
  return { xs, ys, lv, x0, xN, y0, yN, eave, roofZ, ridgeY, groundZ, baseLevel };
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function buildMembers(p: Project): Member[] {
  const g = geometry(p);
  const sec = new Map(p.sections.map((s) => [s.id, s]));
  const out: Omit<Member, 'mark' | 'length' | 'weight'>[] = [];
  const push = (kind: MemberKind, section: Section | undefined, a: Vec3, b: Vec3, up?: Vec3, source?: string, name?: string, rotation?: number, piece?: number) => {
    if (!section || dist(a, b) < 1) return;
    out.push({ id: `${kind}${out.length}`, kind, section, a, b, up, source, name, rotation, piece });
  };
  // mái tự sinh (kèo / xà gồ cũ) đã bỏ – 母屋 nhập theo tab 母屋
  const roofOn = false;

  const master = new Map(p.master.map((m) => [m.id, m]));
  const msec = (id: string): Section | undefined => {
    const m = master.get(id);
    const sc = m && sec.get(m.sectionId);
    return sc && m ? { ...sc, material: m.material } : undefined;
  };
  const named = (id: string) => master.get(id)?.name;

  // --- Cột ---
  let colSec: Section | undefined;
  for (const c of p.columns) {
    // 間柱: toạ độ tự do pt (đặt trên dầm)
    const gx = c.pt ? c.pt[0] : g.xs.get(c.x);
    const gy = c.pt ? c.pt[1] : g.ys.get(c.y);
    let zb = g.lv.get(c.base);
    let zt = g.lv.get(c.top);
    const s = msec(c.memberId);
    if (gx === undefined || gy === undefined || zb === undefined || zt === undefined || !s) continue;
    const [x, y] = columnCenter(gx, gy, c, s.b, s.h);
    if (c.base === g.baseLevel) zb += g.groundZ(x, y);
    // Cột lên tới cao độ mái đua thì kéo dài theo đường mái
    const sfc = slopeColZ(p, c.top, x, y, s.b, s.h, (c.rotation * Math.PI) / 180);
    if (roofOn && c.top === p.roof.eaveLevel && !c.slopeId && sfc === undefined) zt = g.roofZ(y);
    zt += slopeDz(p, c.slopeId, x, y); // 柱合わせ theo 勾配 ID
    if (sfc !== undefined) zt += sfc; // 勾配設定: 柱合わせ
    // chỉnh cao độ chân / đỉnh so với tầng
    zb += c.dzb ?? 0;
    zt += c.dzt ?? 0;
    // 間柱 nhập theo đường chuẩn: cao độ chân / đỉnh tuyệt đối
    if (c.zb !== undefined) zb = c.zb;
    if (c.zt !== undefined) zt = c.zt;
    // dữ liệu lỗi (NaN) → bỏ phần cộng thêm, giữ cao độ tầng để cột vẫn hiện
    if (!Number.isFinite(zb)) zb = g.lv.get(c.base)! + (+(c.dzb ?? 0) || 0);
    if (!Number.isFinite(zt)) zt = g.lv.get(c.top)! + (+(c.dzt ?? 0) || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    colSec = colSec ?? s;
    const r = ((+c.rotation || 0) * Math.PI) / 180;
    const L = Math.abs(zt - zb);
    const cuts = [c.jLo ?? 0, c.jHi ? L - c.jHi : 0, ...(c.splZ ?? []).map((z) => z - Math.min(zb, zt))].filter((v) => v > 0);
    splitAt([x, y, zb], [x, y, zt], cuts, c.gap ?? jointMidGap(p, c.joints, c.memberId)).forEach(([a, b], i) => push('column', s, a, b, [-Math.sin(r), Math.cos(r), 0], c.id, named(c.memberId), c.rotation, i));
  }

  // --- Dầm ---
  const rigidEnds: RigidEnd[] = [];
  for (const bm of p.beams) {
    const s = msec(bm.memberId);
    const z = g.lv.get(bm.level);
    const [a, b] = beamEnds(g, bm, p.params.member.beamDir);
    if (z === undefined || a.includes(undefined) || b.includes(undefined) || !s) continue;
    const off = beamOffset(p, g, bm, s);
    let [ax, ay] = [a[0]!, a[1]!];
    let [bx, by] = [b[0]!, b[1]!];
    ax += off[0]; ay += off[1]; bx += off[0]; by += off[1];
    // 上下基準: cao độ đặt = tầng + dz là mặt trên / tâm / mặt dưới dầm
    const vr = bm.vref ?? 'top';
    const zc = z + (bm.dz ?? 0) + (vr === 'top' ? -s.h / 2 : vr === 'bottom' ? s.h / 2 : 0) + p.params.member.beamTopOffset;
    // 勾配設定: 梁勾配 = 柱合わせ位置 (đầu dầm tại cột lấy cao độ 柱合わせ, còn lại theo mặt dốc)
    // phía trong của dầm (勾配 tách 左 / 右 tại trục: đầu dầm lấy phía hướng vào thân dầm)
    const inner = (k: 1 | 2, dir: 'x' | 'y') => { const v = dir === 'y' ? (k === 1 ? by - ay : ay - by) : (k === 1 ? bx - ax : ax - bx); return Math.abs(v) < 1 ? 0 : Math.sign(v); };
    const sfz = (k: 1 | 2, px: number, py: number) => {
      const c = columnNear(p, g, px - off[0], py - off[1], bm.level, k === 1 ? bm.ref1 : bm.ref2);
      if (c) { const z = slopeColZ(p, bm.level, c.cx, c.cy, c.b, c.h, c.r, true, (dir) => inner(k, dir)); if (z !== undefined) return z; }
      const fg = facesAt(p, bm.level, px, py)[0];
      return fg ? faceZ(fg, fg.dir === 'y' ? py : px, inner(k, fg.dir)) : 0;
    };
    // 勾配 theo point (X1 Y1 X2 Y2): mặt trên 大梁 = đường nối point 2 của trục đầu → point 1 của trục cuối (kéo dài tới tâm cột)
    const ptLine = (() => {
      if (bm.slopeId) return null;
      const fg = facesAt(p, bm.level, (ax + bx) / 2, (ay + by) / 2).find((q) => hasPoints(q.f));
      if (!fg) return null;
      const along = fg.dir === 'y' ? Math.abs(bx - ax) < 1 : Math.abs(by - ay) < 1;
      const sa = fg.dir === 'y' ? ay : ax, sb = fg.dir === 'y' ? by : bx;
      if (!along || Math.abs(sb - sa) < 1) return null;
      const axes = faceAxes(fg);
      const near = (sv: number) => { const a = axes.reduce((m, q) => (Math.abs(q.s - sv) < Math.abs(m.s - sv) ? q : m)); return Math.abs(a.s - sv) < 1000 ? a : null; };
      const A = near(sa), B = near(sb);
      if (!A || !B || A.id === B.id) return null;
      const d = Math.sign(fg.s1 - fg.s0), ta = (sa - fg.s0) * d, tb = (sb - fg.s0) * d;
      const ks = faceKnots(fg), fw = tb > ta;
      const kA = ks.find((k) => k.id === A.id && k.k === (fw ? 2 : 1)), kB = ks.find((k) => k.id === B.id && k.k === (fw ? 1 : 2));
      if (!kA || !kB || Math.abs(kB.t - kA.t) < 1) return null;
      const z = (t: number) => kA.z + ((kB.z - kA.z) * (t - kA.t)) / (kB.t - kA.t);
      const k = (z(tb) - z(ta)) / Math.abs(tb - ta), c = 1 / Math.sqrt(1 + k * k);
      // tâm dầm = mặt trên − h/(2cosθ): bù phần zc đã trừ h/2
      const adj = (vr === 'top' ? -1 : vr === 'bottom' ? 1 : 0) * (s.h / 2) * (1 / c - 1);
      return [z(ta) + adj, z(tb) + adj];
    })();
    const za = zc + (bm.up1 ?? 0) + slopeDz(p, bm.slopeId, ax, ay) + (ptLine ? ptLine[0] : sfz(1, ax, ay)) + (bm.level === g.baseLevel ? g.groundZ(ax, ay) : 0);
    const zb2 = zc + (bm.up2 ?? 0) + slopeDz(p, bm.slopeId, bx, by) + (ptLine ? ptLine[1] : sfz(2, bx, by)) + (bm.level === g.baseLevel ? g.groundZ(bx, by) : 0);
    const L = Math.hypot(bx - ax, by - ay);
    // ブラケット (剛接合): 継手距離 = từ tâm cột (hoặc mép cột) tới mép ngoài ブラケット
    const ux = (bx - ax) / (L || 1), uy = (by - ay) / (L || 1);
    const gapB = bm.gap ?? jointMidGap(p, bm.joints, bm.memberId);
    const brk = (k: 1 | 2) => {
      const j = (k === 1 ? bm.j1 : bm.j2) ?? 0;
      if (beamEnd(bm, k) !== 'rigid' || j <= 0) return 0;
      const [px, py] = k === 1 ? [ax, ay] : [bx, by];
      const sg = k === 1 ? 1 : -1;
      let d = j;
      const c = columnNear(p, g, px - off[0], py - off[1], bm.level, k === 1 ? bm.ref1 : bm.ref2);
      if (c) {
        d += ((c.cx - px) * ux + (c.cy - py) * uy) * sg; // tâm cột theo trục dầm
        if (bm.jRef === 'face') {
          const cx = Math.cos(c.r), cy = Math.sin(c.r);
          d += Math.abs(ux * cx + uy * cy) * (c.b / 2) + Math.abs(-ux * cy + uy * cx) * (c.h / 2);
        }
      }
      return d + gapB / 2;
    };
    const b1 = brk(1), b2 = brk(2);
    // ピン接合 vào 本柱: dầm dừng ở mặt cột + クリアランス (GPL hàn vào mặt cột, bắt bulông vào bụng dầm)
    const ownJ = (pos: JointPos) => {
      const id = bm.joints && pos in bm.joints ? bm.joints[pos] : master.get(bm.memberId)?.joints?.[pos];
      return id ? p.joints.find((x) => x.id === id) : undefined;
    };
    // ブラケット (剛接合): bụng dừng ở mặt ngoài cột; cánh dừng ở mép 通しダイアフラム (lùi 出寸法 e)
    const flg: [number, number] = [0, 0];
    const brkE: [boolean, boolean] = [false, false];
    const faceD: [number, number] = [0, 0];
    const trim = (k: 1 | 2) => {
      const [px, py] = k === 1 ? [ax, ay] : [bx, by];
      const sg = k === 1 ? 1 : -1;
      const c = columnNear(p, g, px - off[0], py - off[1], bm.level, k === 1 ? bm.ref1 : bm.ref2);
      if (!c) {
        // 小梁 gác vào 大梁 / dầm khác cùng tầng: dừng ở mặt bụng dầm đỡ + クリアランス
        for (const o of p.beams) {
          if (o.id === bm.id || o.level !== bm.level) continue;
          const os = msec(o.memberId);
          const [oa, ob] = beamEnds(g, o, p.params.member.beamDir);
          if (!os || oa.includes(undefined) || ob.includes(undefined)) continue;
          const ox = ob[0]! - oa[0]!, oy = ob[1]! - oa[1]!, oL = Math.hypot(ox, oy) || 1;
          const vx = ox / oL, vy = oy / oL;
          if (Math.abs(vx * ux + vy * uy) > 0.5) continue; // gần song song → không phải dầm đỡ
          const qx = px - off[0] - oa[0]!, qy = py - off[1] - oa[1]!;
          const along = qx * vx + qy * vy, dist = Math.abs(-qx * vy + qy * vx);
          if (along < -1 || along > oL + 1 || dist > os.b / 2) continue;
          const sinA = Math.abs(ux * vy - uy * vx) || 1;
          const t = (os.tw / 2) / sinA + (ownJ(k === 1 ? 'left' : 'right')?.clear ?? 10);
          return t > 0 && t < L / 3 ? t : 0;
        }
        return 0;
      }
      const cx = Math.cos(c.r), cy = Math.sin(c.r);
      const face = ((c.cx - px) * ux + (c.cy - py) * uy) * sg + Math.abs(ux * cx + uy * cy) * (c.b / 2) + Math.abs(-ux * cy + uy * cx) * (c.h / 2);
      if (beamEnd(bm, k) === 'rigid') {
        if (face <= 0 || face >= L / 3) return 0;
        brkE[k - 1] = true;
        faceD[k - 1] = face;
        const tube = c.type === 'Box' || c.type === 'Pipe';
        const ed = p.columns.find((x) => x.id === c.id)?.shikuchi?.find((e) => e.mode !== 'add' && e.mode !== 'del' && Math.abs(e.z - za) < 1500);
        const dp = diaParams(p);
        if (tube && (ed?.type ?? dp.type) === 'through') flg[k - 1] = ed?.overhang ?? diaE(p, p.columns.find((x) => x.id === c.id)?.memberId) ?? (dp.overhang > 0 ? dp.overhang : diaphragmOverhang(c.tw));
        return face;
      }
      const t = face + (ownJ(k === 1 ? 'left' : 'right')?.clear ?? 10);
      return t > 0 && t < L / 3 ? t : 0;
    };
    const t1 = trim(1), t2 = trim(2);
    // 剛接合: vùng cánh trên / dưới (cao độ tuyệt đối) tại mép ダイアフラム – dầm dốc thì cánh cắt mép đứng cao hơn tf
    {
      const k = (zb2 - za) / (L || 1), cs = 1 / Math.sqrt(1 + k * k);
      const fl = (kk: 1 | 2): [[number, number], [number, number]] => {
        const d = faceD[kk - 1] + flg[kk - 1];
        const zc0 = kk === 1 ? za + k * d : zb2 - k * d;
        const off = (s.h / 2 - s.tf / 2) / cs, ht = s.tf / 2 / cs;
        return [[zc0 - off - ht, zc0 - off + ht], [zc0 + off - ht, zc0 + off + ht]];
      };
      if (beamEnd(bm, 1) === 'rigid') rigidEnds.push({ x: ax, y: ay, z: za, s, fl: fl(1), ref: bm.id, k: 1 });
      if (beamEnd(bm, 2) === 'rigid') rigidEnds.push({ x: bx, y: by, z: zb2, s, fl: fl(2), ref: bm.id, k: 2 });
    }
    const Lt = L - t1 - t2;
    const A3: Vec3 = [ax + ux * t1, ay + uy * t1, za + ((zb2 - za) * t1) / (L || 1)];
    const B3: Vec3 = [bx - ux * t2, by - uy * t2, zb2 - ((zb2 - za) * t2) / (L || 1)];
    // mối nối SPL do lệnh 結合: chiếu điểm lên trục dầm
    const spl = (bm.spl ?? []).map(([x, y]) => (x + off[0] - ax) * ux + (y + off[1] - ay) * uy - t1);
    const cuts = [b1 - t1, b2 ? Lt - (b2 - t2) : 0, ...spl].filter((v) => v > 0 && v < Lt);
    const segs = splitAt(A3, B3, cuts, gapB);
    segs.forEach(([a, b], i) => {
      push('beam', s, a, b, undefined, bm.id, named(bm.memberId), undefined, i);
      const fa = i === 0 ? flg[0] : 0, fb = i === segs.length - 1 ? flg[1] : 0;
      if ((fa || fb) && s.type === 'I') out[out.length - 1].flgSet = [fa, fb];
      const ea = i === 0 && brkE[0], eb = i === segs.length - 1 && brkE[1];
      if ((ea || eb) && s.type === 'I') out[out.length - 1].brkEnd = [ea, eb];
      if ((ea || eb) && s.type === 'I') {
        const bw = bracketWeldOf(p.params);
        if (bw.scallop === 'scallop') out[out.length - 1].scal = Math.min(bw.r1 ?? 35, (s.h - 2 * s.tf) / 3);
      }
      // dầm dốc gặp cột: đầu cắt đứng theo mặt cột
      const pa = i === 0 && t1 > 0, pb = i === segs.length - 1 && t2 > 0;
      if ((pa || pb) && Math.abs(zb2 - za) > 1) out[out.length - 1].plumb = [pa, pb];
    });
  }

  // --- ブレース既製品入力 ---
  for (const br of p.braces ?? []) {
    braceLines(p, g, br).forEach(([a, b], i) => push('brace', msec(br.memberId), a, b, undefined, br.id, named(br.memberId), undefined, i));
  }

  // --- 方杖: từ cột (dưới mặt dưới dầm dc) tới mặt dưới dầm (cách mặt cột db) ---
  for (const k of p.knees ?? []) {
    const cp = out.filter((m) => m.source === k.col && m.kind === 'column');
    const bp = out.filter((m) => m.source === k.beam && m.kind === 'beam');
    if (!cp.length || !bp.length) continue;
    const [cx, cy] = [cp[0].a[0], cp[0].a[1]];
    const bA = bp[0].a, bB = bp[bp.length - 1].b;
    const [near, far] = Math.hypot(bA[0] - cx, bA[1] - cy) <= Math.hypot(bB[0] - cx, bB[1] - cy) ? [bA, bB] : [bB, bA];
    const Lh = Math.hypot(far[0] - near[0], far[1] - near[1]) || 1;
    const ux = (far[0] - near[0]) / Lh, uy = (far[1] - near[1]) / Lh, uz = (far[2] - near[2]) / Lh;
    const cs = cp[0].section, r = ((cp[0].rotation ?? 0) * Math.PI) / 180;
    const half = Math.abs(ux * Math.cos(r) + uy * Math.sin(r)) * (cs.b / 2) + Math.abs(-ux * Math.sin(r) + uy * Math.cos(r)) * (cs.h / 2);
    const bh = bp[0].section.h / 2;
    // cao độ trục dầm tại cột
    const t0 = (cx - near[0]) * ux + (cy - near[1]) * uy;
    const zAtCol = near[2] + uz * t0;
    const p1: Vec3 = [cx + ux * half, cy + uy * half, zAtCol - bh - k.dc];
    const t = t0 + half + k.db;
    const p2: Vec3 = [near[0] + ux * t, near[1] + uy * t, near[2] + uz * t - bh];
    push('brace', msec(k.memberId), p1, p2, undefined, k.id, named(k.memberId));
  }

  const colH = colSec?.h ?? 300;
  const colB = colSec?.b ?? 150;

  // --- Mái: kèo, xà gồ ---
  if (roofOn) {
    const rs = sec.get(p.roof.rafterSectionId);
    const ps = sec.get(p.roof.purlinSectionId);
    const slopes: [Vec3, Vec3][] = []; // [điểm đỉnh cột, điểm đỉnh mái] theo mặt cắt Y-Z
    if (p.roof.type === 'gable') {
      slopes.push([[0, g.y0, g.eave], [0, g.ridgeY, g.roofZ(g.ridgeY)]]);
      slopes.push([[0, g.yN, g.eave], [0, g.ridgeY, g.roofZ(g.ridgeY)]]);
    } else {
      slopes.push([[0, g.y0, g.eave], [0, g.yN, g.roofZ(g.yN)]]);
    }
    const xsSorted = p.gridsX.map((gx) => g.xs.get(gx.id)!);
    for (const x of xsSorted) {
      for (const [a, b] of slopes) push('rafter', rs, [x, a[1], a[2]], [x, b[1], b[2]]);
    }
    // xà gồ mái trên mỗi mái dốc, chia theo từng khoang
    if (ps && rs) {
      for (const [a, b] of slopes) {
        const L = dist(a, b);
        const dir = norm([0, b[1] - a[1], b[2] - a[2]]);
        // pháp tuyến mái hướng lên
        const n: Vec3 = norm([0, -dir[2] * Math.sign(dir[1] || 1), Math.abs(dir[1])]);
        const off = rs.h / 2 + ps.h / 2;
        const stations: number[] = [];
        for (let s = p.roof.purlinEdge; s < L - 150; s += Math.max(300, p.roof.purlinSpacing)) stations.push(s);
        if (p.roof.type === 'gable' || stations.length === 0 || L - stations[stations.length - 1] > 300) stations.push(L - 150);
        for (const s of stations) {
          const pt = add(add(a, mul(dir, s)), mul(n, off));
          for (let i = 0; i + 1 < xsSorted.length; i++) {
            push('purlin', ps, [xsSorted[i], pt[1], pt[2]], [xsSorted[i + 1], pt[1], pt[2]], n);
          }
        }
      }
    }
    // --- Giằng mái ---
    const bs = msec(p.bracing.memberId);
    const bName = named(p.bracing.memberId);
    for (const i of p.bracing.roofBays) {
      if (i + 1 >= xsSorted.length) continue;
      const xa = xsSorted[i];
      const xb = xsSorted[i + 1];
      for (const [a, b] of slopes) {
        const o = (rs?.h ?? 300) / 2;
        push('brace', bs, [xa, a[1], a[2] + o], [xb, b[1], b[2] + o], undefined, undefined, bName);
        push('brace', bs, [xb, a[1], a[2] + o], [xa, b[1], b[2] + o], undefined, undefined, bName);
      }
    }
  }

  // --- Tường: xà gồ tường + giằng tường ---
  const xsSorted = p.gridsX.map((gx) => g.xs.get(gx.id)!);
  const ysSorted = p.gridsY.map((gy) => g.ys.get(gy.id)!);
  const zBase = Math.min(...p.levels.map((l) => l.elevation), 0);
  const topZ = roofOn ? g.eave : g.eave;
  // 胴縁 tự sinh cũ đã bỏ – nhập theo tab 胴縁
  if (false as boolean) {
    const gs = sec.get(p.walls.girtSectionId);
    if (gs) {
      const step = Math.max(300, p.walls.girtSpacing);
      const sides: { on: boolean; y: number; out: number }[] = [
        { on: p.walls.sides.front, y: g.y0, out: -1 },
        { on: p.walls.sides.back, y: g.yN, out: 1 },
      ];
      for (const s of sides) {
        if (!s.on || ysSorted.length < 1) continue;
        const yy = s.y + s.out * (colH / 2 + gs.h / 2);
        for (let z = zBase + p.walls.firstGirt; z < topZ - 100; z += step) {
          for (let i = 0; i + 1 < xsSorted.length; i++) push('girt', gs, [xsSorted[i], yy, z], [xsSorted[i + 1], yy, z], [0, s.out, 0]);
        }
      }
      const ends: { on: boolean; x: number; out: number }[] = [
        { on: p.walls.sides.left, x: g.x0, out: -1 },
        { on: p.walls.sides.right, x: g.xN, out: 1 },
      ];
      for (const e of ends) {
        if (!e.on || xsSorted.length < 1) continue;
        const xx = e.x + e.out * (colB / 2 + gs.h / 2);
        for (let i = 0; i + 1 < ysSorted.length; i++) {
          const ya = ysSorted[i];
          const yb = ysSorted[i + 1];
          const lim = roofOn ? Math.min(g.roofZ(ya), g.roofZ(yb)) - 150 : topZ - 100;
          for (let z = zBase + p.walls.firstGirt; z < lim; z += step) push('girt', gs, [xx, ya, z], [xx, yb, z], [e.out, 0, 0]);
        }
      }
    }
  }
  const bs = msec(p.bracing.memberId);
  const bName = named(p.bracing.memberId);
  for (const i of p.bracing.wallBays) {
    if (i + 1 >= xsSorted.length) continue;
    for (const y of [g.y0, g.yN]) {
      push('brace', bs, [xsSorted[i], y, zBase + g.groundZ(xsSorted[i], y)], [xsSorted[i + 1], y, topZ], undefined, undefined, bName);
      push('brace', bs, [xsSorted[i + 1], y, zBase + g.groundZ(xsSorted[i + 1], y)], [xsSorted[i], y, topZ], undefined, undefined, bName);
    }
  }

  // 母屋 (tab 母屋: 配置面 + 母屋 + ピース)
  out.push(...moyaMembers(p, out.filter((m) => m.kind === 'beam') as Member[]));
  // 胴縁 (tab 胴縁: 配置面 + 胴縁 + 開口 + ピース)
  out.push(...girtMembers(p, out as Member[]));
  // ピース nhập tay (母屋 / 胴縁)
  out.push(...pcMembersOf(p, out as Member[]));
  out.push(...sub2Members(p, out as Member[]));
  linkGaps(p, out);
  const ann = annotate(p, assignMarks(out), g);
  return assemblies(p, shikuchi(p, ann, rigidEnds));
}

/**
 * 組立品: các chi tiết hàn với nhau (工場溶接) gom thành 1 cụm.
 * - Cột bị cắt bởi 通しダイアフラム: 下柱 + 仕口コア + 上柱 hàn qua ダイアフラム.
 * - ブラケット của 大梁 (đầu 剛接合 có 継手 中) hàn vào 本柱.
 * - 結合 kiểu hàn (links type = weld).
 * Cụm lấy 符号 của chi tiết nặng nhất (thường là cột).
 */
function assemblies(p: Project, list: Member[]): Member[] {
  const par = list.map((_, i) => i);
  const find = (i: number): number => (par[i] === i ? i : (par[i] = find(par[i])));
  const join = (i: number, j: number) => { const a = find(i), b = find(j); if (a !== b) par[a] = b; };
  const idx = new Map(list.map((m, i) => [m, i]));
  const zr = (m: Member) => [Math.min(m.a[2], m.b[2]), Math.max(m.a[2], m.b[2])];
  // cột: các đoạn cắt bởi 通しダイアフラム
  const cols = list.filter((m) => m.kind === 'column');
  const bySrc = new Map<string, Member[]>();
  for (const m of cols) if (m.source) bySrc.set(m.source, [...(bySrc.get(m.source) ?? []), m]);
  for (const arr of bySrc.values()) {
    arr.sort((a, b) => zr(a)[0] - zr(b)[0]);
    for (let i = 0; i + 1 < arr.length; i++) if (arr[i].dCut || arr[i].part === 'shikuchi' || arr[i + 1].part === 'shikuchi') join(idx.get(arr[i])!, idx.get(arr[i + 1])!);
  }
  // ブラケット → 本柱
  const beamById = new Map(p.beams.map((b) => [b.id, b]));
  const nPieces = new Map<string, number>();
  for (const m of list) if (m.kind === 'beam' && m.source) nPieces.set(m.source, (nPieces.get(m.source) ?? 0) + 1);
  for (const m of list) {
    if (m.kind !== 'beam' || !m.source) continue;
    const bm = beamById.get(m.source), n = nPieces.get(m.source) ?? 1, i = Math.round(m.piece ?? 0);
    if (!bm || n < 2) continue;
    const br = (i === 0 && beamEnd(bm, 1) === 'rigid' && !!bm.j1) || (i === n - 1 && beamEnd(bm, 2) === 'rigid' && !!bm.j2);
    if (!br) continue;
    let best: { c: Member; d: number } | null = null;
    for (const e of [m.a, m.b]) for (const c of cols) {
      const d = Math.hypot(e[0] - c.a[0], e[1] - c.a[1]);
      const [z0, z1] = zr(c);
      if (d > Math.max(c.section.b, c.section.h) / 2 + 150 || e[2] < z0 - m.section.h || e[2] > z1 + m.section.h) continue;
      const score = d + (c.part === 'shikuchi' ? 0 : 1) + (e[2] >= z0 && e[2] <= z1 ? 0 : 500);
      if (!best || score < best.d) best = { c, d: score };
    }
    if (best) join(idx.get(m)!, idx.get(best.c)!);
  }
  // 結合 hàn
  for (const lk of p.links ?? []) {
    if (lk.type !== 'weld') continue;
    const pa = list.filter((m) => m.source === lk.a), pb = list.filter((m) => m.source === lk.b);
    let best: { x: Member; y: Member; d: number } | null = null;
    for (const x of pa) for (const y of pb) for (const ea of [x.a, x.b]) for (const eb of [y.a, y.b]) {
      const d = dist(ea, eb);
      if (!best || d < best.d) best = { x, y, d };
    }
    if (best && best.d < 600) join(idx.get(best.x)!, idx.get(best.y)!);
  }
  const groups = new Map<number, number[]>();
  list.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  const out = list.map((m) => ({ ...m }));
  for (const [r, ids] of groups) {
    if (ids.length < 2) continue;
    const main = ids.map((i) => list[i]).sort((a, b) => (a.kind === 'column' ? 0 : 1) - (b.kind === 'column' ? 0 : 1) || (a.part === 'shikuchi' ? 1 : 0) - (b.part === 'shikuchi' ? 1 : 0) || b.weight - a.weight)[0];
    for (const i of ids) { out[i].asm = main.mark; out[i].asmId = `asm${r}`; }
  }
  // cùng 符号 cụm nhưng cấu tạo khác → thêm hậu tố
  const sig = new Map<string, string>();
  const byId = new Map<string, Member[]>();
  for (const m of out) if (m.asmId) byId.set(m.asmId, [...(byId.get(m.asmId) ?? []), m]);
  const used = new Map<string, Map<string, string>>();
  for (const [id, ms] of byId) {
    const base = ms[0].asm!;
    const key = ms.map((m) => `${m.mark}:${m.length}`).sort().join(',');
    let names = used.get(base);
    if (!names) used.set(base, (names = new Map()));
    let nm = names.get(key);
    if (!nm) { nm = names.size ? `${base}-${names.size + 1}` : base; names.set(key, nm); }
    sig.set(id, nm);
  }
  for (const m of out) if (m.asmId) m.asm = sig.get(m.asmId);
  return out;
}

/** 勾配設定: chênh cao đỉnh cột (柱合わせ) tại (x, y) của tầng; nhiều mặt dốc → lấy cao nhất. forBeam: 柱合わせ なし → dầm theo tâm cột */
function slopeColZ(p: Project, level: string, x: number, y: number, b: number, h: number, r: number, forBeam = false, sideOf?: (dir: 'x' | 'y') => number): number | undefined {
  const fs = facesAt(p, level, x, y);
  if (!fs.length) return undefined;
  let best: number | undefined;
  for (const fg of fs) {
    const u = fg.dir === 'y' ? [0, 1] : [1, 0];
    const half = Math.abs(u[0] * Math.cos(r) + u[1] * Math.sin(r)) * (b / 2) + Math.abs(-u[0] * Math.sin(r) + u[1] * Math.cos(r)) * (h / 2);
    const sd = sideOf?.(fg.dir) ?? 0;
    const { z, set } = colFitZ(fg, x, y, half, sd);
    const v = set.fit === 'none' ? (forBeam ? faceZ(fg, fg.dir === 'y' ? y : x, sd) : 0) : z;
    if (best === undefined || v > best) best = v;
  }
  return best;
}

/** 結合 / 切断: 2 cây nối bằng 継手 → chừa すきま theo 継手 (EP 7, SPL theo gap) giữa 2 đầu nối */
function linkGaps(p: Project, out: { a: Vec3; b: Vec3; source?: string }[]) {
  for (const lk of p.links ?? []) {
    if (lk.type !== 'spl') continue;
    const j = p.joints.find((x) => x.id === lk.jointId);
    if (!j) continue;
    const gap = j.gap ?? (j.type === 'EP' ? 7 : 10);
    const pa = out.filter((m) => m.source === lk.a), pb = out.filter((m) => m.source === lk.b);
    let best: { ma: (typeof out)[number]; ea: 'a' | 'b'; mb: (typeof out)[number]; eb: 'a' | 'b'; d: number } | null = null;
    for (const ma of pa) for (const ea of ['a', 'b'] as const) for (const mb of pb) for (const eb of ['a', 'b'] as const) {
      const d = dist(ma[ea], mb[eb]);
      if (!best || d < best.d) best = { ma, ea, mb, eb, d };
    }
    if (!best || best.d >= gap || best.d > 600) continue;
    const t = (gap - best.d) / 2;
    const pull = (m: (typeof out)[number], e: 'a' | 'b') => {
      const o = e === 'a' ? m.b : m.a, q = m[e];
      const L = dist(o, q);
      if (L <= 2 * t) return;
      const k = (L - t) / L;
      m[e] = [o[0] + (q[0] - o[0]) * k, o[1] + (q[1] - o[1]) * k, o[2] + (q[2] - o[2]) * k];
    };
    pull(best.ma, best.ea);
    pull(best.mb, best.eb);
  }
}

/** fl: [cánh dưới, cánh trên] = [z thấp, z cao] tại mép ダイアフラム (đã tính dốc) */
interface RigidEnd { x: number; y: number; z: number; s: Section; fl?: [[number, number], [number, number]]; ref?: string; k?: 1 | 2 }

/** 出寸法 ダイアフラム nhập tay ở Master 本柱 (undefined = theo パラメーター) */
const diaE = (p: Project, memberId?: string) => { const v = p.master.find((m) => m.id === memberId)?.diaE; return v !== undefined && v >= 0 ? v : undefined; };

/** Tham số ダイアフラム (gộp mặc định) */
export const diaParams = (p: Project) => ({ ...defaultDiaphragm(), ...(p.params.member.diaphragm ?? {}) });

/**
 * 仕口: tại cao độ cánh dầm 剛接合 (ブラケット) gắn vào 本柱 → ダイアフラム theo パラメーター.
 * 角形・円形鋼管 + 通し: cắt cột tại mỗi ダイアフラム → 下柱 / コア (仕口) / 上柱.
 * 内ダイアフラム: bản trong lòng ống. H柱: 水平スチフナー 2 bên bụng.
 */
function shikuchi(p: Project, list: Member[], ends: RigidEnd[]): Member[] {
  const edits = new Map(p.columns.filter((c) => c.shikuchi?.length).map((c) => [c.id, c.shikuchi!]));
  if (!ends.length && !edits.size) return list;
  const dp = diaParams(p);
  const posts = new Set(p.columns.filter((c) => c.role === 'post' || c.pt).map((c) => c.id));
  const out: Member[] = [];
  let changed = false;
  for (const m of list) {
    const vertical = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) < 1;
    if (m.kind !== 'column' || !vertical || !m.source || posts.has(m.source)) { out.push(m); continue; }
    const s = m.section;
    const z0 = Math.min(m.a[2], m.b[2]);
    let z1 = Math.max(m.a[2], m.b[2]);
    const R = Math.max(s.b, s.h) / 2;
    const tube = s.type === 'Box' || s.type === 'Pipe';
    if (!tube && s.type !== 'I') { out.push(m); continue; }
    // --- cụm tự động: mỗi dầm ブラケット cho 1 khoảng [cánh dưới, cánh trên]; khoảng chồng / gần nhau gộp thành 1 cụm
    type Sp = [number, number];
    const nearEnds: RigidEnd[] = [];
    const rng: { lo: number; hi: number; tf: number; sLo?: Sp; sHi?: Sp }[] = [];
    for (const e of ends) {
      if (Math.hypot(e.x - m.a[0], e.y - m.a[1]) > R + e.s.b / 2 + 1) continue;
      const lo = e.fl ? (e.fl[0][0] + e.fl[0][1]) / 2 : e.z - (e.s.h / 2 - e.s.tf / 2), hi = e.fl ? (e.fl[1][0] + e.fl[1][1]) / 2 : e.z + (e.s.h / 2 - e.s.tf / 2);
      if (hi < z0 - e.s.tf || lo > z1 + e.s.tf) continue;
      rng.push({ lo, hi, tf: e.s.tf, sLo: e.fl?.[0], sHi: e.fl?.[1] });
      nearEnds.push(e);
    }
    rng.sort((a, b) => a.lo - b.lo);
    type Cl = { lv: { z: number; tf: number; sp?: Sp }[]; auto: boolean; ed?: ShikuchiEdit };
    const cls: Cl[] = [];
    let curHi = -Infinity;
    for (const r of rng) {
      const last = cls[cls.length - 1];
      const lv = [{ z: r.lo, tf: r.tf, sp: r.sLo }, { z: r.hi, tf: r.tf, sp: r.sHi }];
      if (last && r.lo <= curHi + dp.merge) { last.lv.push(...lv); curHi = Math.max(curHi, r.hi); }
      else { cls.push({ lv, auto: true }); curHi = r.hi; }
    }
    const zcOf = (c: Cl) => (Math.min(...c.lv.map((l) => l.z)) + Math.max(...c.lv.map((l) => l.z))) / 2;
    const eds = edits.get(m.source) ?? [];
    const used = new Set<string>();
    const kept: Cl[] = [];
    for (const c of cls) {
      const zc = zcOf(c);
      const ed = eds.find((e) => e.mode !== 'add' && !used.has(e.id) && Math.abs(e.z - zc) <= SHIKUCHI_MATCH);
      if (ed) used.add(ed.id);
      if (ed?.mode === 'del') continue;
      kept.push({ ...c, ed });
    }
    for (const e of eds) {
      if (e.mode !== 'add' || e.z < z0 - 1 || e.z > z1 + 1) continue;
      const h = e.h ?? 300;
      kept.push({ lv: [{ z: e.z - h / 2, tf: 12 }, { z: e.z + h / 2, tf: 12 }], auto: false, ed: e });
    }
    if (!kept.length) { out.push(m); continue; }
    changed = true;
    kept.sort((a, b) => zcOf(a) - zcOf(b));
    // --- bản ダイアフラム của từng cụm
    type Lv = Diaphragm & { ci: number };
    const all: Lv[] = [];
    const infos: SkInfo[] = [];
    kept.forEach((c, ci) => {
      const ed = c.ed;
      const kind: SkInfo['type'] = !tube ? 'stiff' : (ed?.type ?? dp.type) === 'through' ? 'through' : 'inner';
      const e0 = ed?.overhang ?? diaE(p, p.columns.find((x) => x.id === m.source)?.memberId) ?? (dp.overhang > 0 ? dp.overhang : diaphragmOverhang(s.tw));
      const add = kind === 'through' ? dp.addThrough : dp.addInner;
      const zc = zcOf(c);
      // gộp cánh gần nhau (≤ merge) thành 1 bản
      const srt = [...c.lv].sort((a, b) => a.z - b.z);
      let lv: { z: number; tf: number; sp?: Sp }[] = [];
      for (const l of srt) {
        const last = lv[lv.length - 1];
        if (last && l.z - last.z <= dp.merge) {
          last.tf = Math.max(last.tf, l.tf);
          // gộp: vùng cánh = hợp các vùng (dầm 2 bên dốc khác nhau) → tâm ダイアフラム ở giữa vùng
          if (last.sp && l.sp) { last.sp = [Math.min(last.sp[0], l.sp[0]), Math.max(last.sp[1], l.sp[1])]; last.z = (last.sp[0] + last.sp[1]) / 2; }
          else { last.z = (last.z + l.z) / 2; last.sp = undefined; }
        } else lv.push({ ...l });
      }
      if (ed?.h !== undefined && ed.h > 0) {
        const lo = lv[0], hi = lv[lv.length - 1];
        lv = [{ z: zc - ed.h / 2, tf: lo.tf, sp: lo.sp }, ...lv.slice(1, -1).filter((l) => Math.abs(l.z - zc) < ed.h! / 2 - 50), { z: zc + ed.h / 2, tf: hi.tf, sp: hi.sp }];
      }
      if (lv.length === 1) lv = [lv[0]];
      // t = max(t cánh dầm t1, t cột t2) + n size; rồi tăng tiếp theo dãy PL tới khi m1, m2 ≥ minM (cánh dầm dốc cắt mép đứng cao tf/cosθ)
      const minM = dp.minM ?? 3;
      const tAuto = (l: (typeof lv)[number]) => {
        const t0 = plateUp(kind === 'through' ? Math.max(l.tf, s.tw) : l.tf, add);
        return l.sp ? Math.max(t0, plateAtLeast(l.sp[1] - l.sp[0] + 2 * minM)) : t0;
      };
      const ts = lv.map((l, i) => (i === 0 && ed?.tBot ? ed.tBot : i === lv.length - 1 && lv.length > 1 && ed?.tTop ? ed.tTop : tAuto(l)));
      // ダイアフラム trên: mặt trên = mép trên cánh cao nhất + m1 (đúng m1); ダイアフラム dưới: mặt dưới = mép dưới cánh thấp nhất − m1
      if (lv.length > 1 && !(ed?.h !== undefined && ed.h > 0)) {
        const hi = lv[lv.length - 1], lo = lv[0];
        if (hi.sp) hi.z = hi.sp[1] + minM - ts[ts.length - 1] / 2;
        if (lo.sp) lo.z = lo.sp[0] - minM + ts[0] / 2;
      }
      lv.forEach((l, i) => {
        const t = ts[i];
        if (kind === 'through') all.push({ ci, kind, z: l.z, t, w: s.b + 2 * e0, d: s.h + 2 * e0, round: s.type === 'Pipe' });
        else if (kind === 'inner') all.push({ ci, kind, z: l.z, t, w: s.b - 2 * s.tw, d: s.h - 2 * s.tw, round: s.type === 'Pipe' });
        else {
          const w = (s.b - s.tw) / 2;
          for (const sg of [1, -1]) all.push({ ci, kind, z: l.z, t, w, d: s.h - 2 * s.tf, off: sg * (s.tw / 2 + w / 2) });
        }
      });
      const warn: string[] = [];
      for (let i = 0; i + 1 < lv.length; i++) {
        const gap = lv[i + 1].z - ts[i + 1] / 2 - (lv[i].z + ts[i] / 2);
        const need = Math.max(dp.minGap, 10 * Math.max(ts[i], ts[i + 1]));
        if (gap < need) warn.push(`Khoảng hở ダイアフラム ${Math.round(gap)} < ${need} mm (z ${Math.round(lv[i].z)}–${Math.round(lv[i + 1].z)})`);
      }
      const h = lv[lv.length - 1].z - lv[0].z;
      infos.push({
        zc: (lv[0].z + lv[lv.length - 1].z) / 2, h, type: kind, overhang: kind === 'through' ? e0 : 0, tTop: ts[ts.length - 1], tBot: ts[0],
        coreT: kind === 'through' ? ed?.coreT ?? s.tw : undefined, coreLen: kind === 'through' ? Math.max(0, Math.round(h - ts[0] / 2 - ts[ts.length - 1] / 2)) : undefined,
        auto: c.auto, editId: ed?.id, warn: warn.length ? warn : undefined,
      });
    });
    // ブラケット: mặt dưới ダイアフラム trên / mặt trên ダイアフラム dưới tại đầu dầm → bụng cắt khớp (vẽ 2D)
    for (const e of nearEnds) {
      if (!e.ref || !e.k || !e.fl) continue;
      const th = all.filter((d) => d.kind === 'through');
      if (!th.length) continue;
      const near = (z: number) => th.reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
      const lo = near((e.fl[0][0] + e.fl[0][1]) / 2), hi = near((e.fl[1][0] + e.fl[1][1]) / 2);
      if (lo === hi) continue;
      for (const bmM of list) {
        if (bmM.kind !== 'beam' || bmM.source !== e.ref || !bmM.brkEnd?.[e.k - 1]) continue;
        const ds: [[number, number] | undefined, [number, number] | undefined] = bmM.dSurf ? [...bmM.dSurf] : [undefined, undefined];
        ds[e.k - 1] = [lo.z + lo.t / 2, hi.z - hi.t / 2];
        bmM.dSurf = ds;
      }
    }
    const plates = (ci: number) => all.filter((d) => d.ci === ci).map(({ ci: _c, ...d }) => d);
    const warnOf = (ci: number) => infos[ci].warn;
    // --- cắt cột tại 通しダイアフラム
    const cutLv = [...new Map(all.filter((d) => d.kind === 'through').map((d) => [d.z, d])).values()].sort((a, b) => a.z - b.z);
    // ダイアフラム trên cùng sát đỉnh cột → đỉnh cột = mặt trên ダイアフラム (cao độ theo point 勾配 + m1)
    const topD = cutLv[cutLv.length - 1];
    if (topD && Math.abs(z1 - (topD.z + topD.t / 2)) < 300) z1 = topD.z + topD.t / 2;
    const dir = m.b[2] >= m.a[2] ? 1 : -1;
    const at = (z: number): Vec3 => [m.a[0], m.a[1], z];
    const segs: { lo: number; hi: number; core?: number }[] = [];
    let cur = z0, prev: Lv | undefined;
    for (const d of cutLv) {
      segs.push({ lo: cur, hi: Math.max(cur, d.z - d.t / 2), core: prev && prev.ci === d.ci ? d.ci : undefined });
      cur = Math.min(z1, d.z + d.t / 2);
      prev = d;
    }
    segs.push({ lo: cur, hi: z1 });
    const pieces = segs.filter((c) => c.hi - c.lo >= 1);
    const base = m.piece ?? 0;
    const joints = m.joints ?? [];
    const botJ = joints.filter((j) => j.pos === 'bottom' || (j.pos === 'mid' && j.dup));
    const topJ = joints.filter((j) => !botJ.includes(j));
    const nonCore = pieces.filter((c) => c.core === undefined);
    const doneCl = new Set<number>();
    const res: Member[] = [];
    pieces.forEach((c, i) => {
      const [a, b] = dir > 0 ? [at(c.lo), at(c.hi)] : [at(c.hi), at(c.lo)];
      const len = Math.round(c.hi - c.lo);
      if (c.core !== undefined) {
        const ci = c.core;
        const ct = infos[ci].coreT;
        const cs = ct && ct !== s.tw ? { ...s, id: `${s.id}#t${ct}`, tw: ct, tf: ct, code: s.code.replace(/[\d.]+$/, String(ct)), kgm: undefined } : s;
        const first = !doneCl.has(ci);
        doneCl.add(ci);
        res.push({
          ...m, a, b, section: cs, length: len, weight: (kgPerM(cs) * len) / 1000, piece: base + 0.25 + i * 0.01, part: 'shikuchi',
          name: `${m.name ?? m.mark}仕口`, mark: `${m.mark}仕口`, joints: undefined, joint: undefined, base: undefined,
          dia: first ? plates(ci) : undefined, sk: first ? [infos[ci]] : undefined, warn: first ? warnOf(ci) : undefined,
        });
        return;
      }
      const k = nonCore.indexOf(c);
      const isFirst = k === 0, isLast = k === nonCore.length - 1;
      const js = [...(isFirst ? botJ : []), ...(isLast ? topJ.map((j) => (j.at !== undefined ? { ...j, at: j.at - (m.length - len) } : j)) : [])];
      res.push({
        ...m, a, b, length: len, weight: (kgPerM(s) * len) / 1000, piece: isFirst ? base : base + 0.5 + i * 0.01,
        base: isFirst && i === 0 ? m.base : undefined, // ベース chỉ ở đoạn chân thấp nhất
        joints: js.length ? js : undefined, joint: js.length ? m.joint : undefined, dCut: !isLast, dia: undefined, sk: undefined, warn: undefined,
      });
    });
    // cụm 内 / スチフナー / 通し không có lõi (1 bản) → gắn vào đoạn chứa cao độ
    infos.forEach((info, ci) => {
      if (doneCl.has(ci)) return;
      const z = info.zc;
      const tgt = res.find((r) => r.part !== 'shikuchi' && z >= Math.min(r.a[2], r.b[2]) - 1 && z <= Math.max(r.a[2], r.b[2]) + 1) ?? res[0];
      if (!tgt) return;
      tgt.dia = [...(tgt.dia ?? []), ...plates(ci)];
      tgt.sk = [...(tgt.sk ?? []), info];
      if (info.warn) tgt.warn = [...(tgt.warn ?? []), ...info.warn];
    });
    out.push(...res);
  }
  if (!changed) return list;
  // 仕口 thêm trọng lượng bản ダイアフラム
  return out.map((m, i) => {
    const w = (m.dia ?? []).reduce((acc, d) => acc + (d.round ? (Math.PI * d.w * d.w) / 4 : d.w * d.d) * d.t * 7.85e-6, 0);
    return { ...m, id: `${m.kind}${i}`, weight: m.weight + w };
  });
}

/** すきま tại chỗ tách thanh (中): theo 継手 中 của thanh (riêng hoặc theo 部材名), mặc định 10 nếu có 継手, 0 nếu không */
export function jointMidGap(p: Project, own: Partial<Record<JointPos, string>> | undefined, memberId: string): number {
  const id = own && own.mid !== undefined ? own.mid : p.master.find((m) => m.id === memberId)?.joints?.mid;
  const j = id ? p.joints.find((x) => x.id === id) : undefined;
  return j ? j.gap ?? (j.type === 'EP' ? 7 : 10) : 0;
}

/** Chia đoạn thẳng a→b tại các khoảng cách cuts (mm từ a), chừa すきま gap ở mỗi mối nối */
export function splitAt(a: Vec3, b: Vec3, cuts: number[], gap: number): [Vec3, Vec3][] {
  const L = dist(a, b);
  if (L < 1) return [[a, b]];
  const d = mul([b[0] - a[0], b[1] - a[1], b[2] - a[2]], 1 / L);
  const cs = [...new Set(cuts)].filter((c) => c > gap + 50 && c < L - gap - 50).sort((x, y) => x - y);
  const segs: [number, number][] = [];
  let s = 0;
  for (const c of cs) {
    if (c - gap / 2 <= s + 50) continue;
    segs.push([s, c - gap / 2]);
    s = c + gap / 2;
  }
  segs.push([s, L]);
  return segs.map(([u, v]) => [add(a, mul(d, u)), add(a, mul(d, v))]);
}

/** Các thanh giằng (1 hoặc 2 nếu X入力) của một ブレース既製品 */
export function braceLines(p: Project, g: Geometry, br: BraceInst): [Vec3, Vec3][] {
  // nhập theo giao điểm 2 部材: point 1 → point 2 (+ X入力 đối xứng)
  if (br.q1 && br.q2) {
    const [a0, b0] = [br.q1, br.q2];
    const raw: [Vec3, Vec3][] = [[[a0[0], a0[1], a0[2] + br.dz1], [b0[0], b0[1], b0[2] + br.dz2]]];
    if (br.x)
      raw.push(
        br.plane === 'plan'
          ? [[a0[0], b0[1], a0[2] + br.dz1], [b0[0], a0[1], b0[2] + br.dz2]]
          : [[b0[0], b0[1], a0[2] + br.dz1], [a0[0], a0[1], b0[2] + br.dz2]],
      );
    return raw.map(([a, b]) => {
      const L = dist(a, b), d = mul([b[0] - a[0], b[1] - a[1], b[2] - a[2]], 1 / (L || 1));
      if (br.gap1 + br.gap2 >= L - 100) return [a, b] as [Vec3, Vec3];
      return [add(a, mul(d, br.gap1)), add(a, mul(d, L - br.gap2))] as [Vec3, Vec3];
    });
  }
  const A = [g.xs.get(br.x1), g.ys.get(br.y1)], B = [g.xs.get(br.x2), g.ys.get(br.y2)];
  if (A.includes(undefined) || B.includes(undefined)) return [];
  const [ax, ay] = A as number[], [bx, by] = B as number[];
  const top = p.params.member.beamTopOffset;
  const z0 = g.lv.get(br.level), z1 = g.lv.get(br.top);
  if (z0 === undefined) return [];
  const raw: [Vec3, Vec3, [string, string], [string, string]][] = [];
  if (br.plane === 'plan') {
    if (ax === bx || ay === by) return [];
    const z = z0 + top;
    raw.push([[ax, ay, z + br.dz1], [bx, by, z + br.dz2], [br.x1, br.y1], [br.x2, br.y2]]);
    if (br.x) raw.push([[ax, by, z + br.dz1], [bx, ay, z + br.dz2], [br.x1, br.y2], [br.x2, br.y1]]);
  } else {
    if (z1 === undefined || (ax === bx && ay === by)) return [];
    const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
    const loId = z0 <= z1 ? br.level : br.top, hiId = z0 <= z1 ? br.top : br.level;
    // 勾配設定: đầu giằng ở tầng có mặt dốc lên theo mặt dốc (như dầm)
    const sz = (lv: string, x: number, y: number) => { const fg = facesAt(p, lv, x, y)[0]; return fg ? faceZ(fg, fg.dir === 'y' ? y : x) : 0; };
    const gz = (x: number, y: number) => (lo === g.lv.get(g.baseLevel) ? g.groundZ(x, y) : sz(loId, x, y));
    raw.push([[ax, ay, lo + gz(ax, ay) + br.dz1], [bx, by, hi + top + sz(hiId, bx, by) + br.dz2], [br.x1, br.y1], [br.x2, br.y2]]);
    if (br.x) raw.push([[bx, by, lo + gz(bx, by) + br.dz1], [ax, ay, hi + top + sz(hiId, ax, ay) + br.dz2], [br.x2, br.y2], [br.x1, br.y1]]);
  }
  const lvAt = (z: number) => [...g.lv].reduce((m, [id, e]) => (Math.abs(e - z) < Math.abs((g.lv.get(m) ?? 1e9) - z) ? id : m), br.level);
  return raw.map(([a, b, na, nb]) => {
    const L = dist(a, b);
    const d = mul([b[0] - a[0], b[1] - a[1], b[2] - a[2]], 1 / (L || 1));
    // 相手側鋼材面: lùi thêm nửa bề rộng cột tại nút (theo phương ngang của giằng)
    const face = (n: [string, string], z: number) => {
      if (br.ref !== 'face') return 0;
      const c = columnAt(p, g, n[0], n[1], lvAt(z));
      const hz = Math.hypot(d[0], d[1]) || 1;
      return c ? Math.max(c.b, c.h) / 2 / hz : 0;
    };
    const u = br.gap1 + face(na, a[2]);
    const v = br.gap2 + face(nb, b[2]);
    if (u + v >= L - 100) return [a, b] as [Vec3, Vec3];
    return [add(a, mul(d, u)), add(a, mul(d, L - v))] as [Vec3, Vec3];
  });
}

/** Đánh mã cấu kiện: cùng loại + cùng tiết diện + cùng chiều dài => cùng mã. */
function assignMarks(list: Omit<Member, 'mark' | 'length' | 'weight'>[]): Member[] {
  const groups = new Map<string, string>();
  const counters: Record<string, number> = {};
  const withLen = list.map((m) => ({ ...m, length: Math.round(dist(m.a, m.b)) }));
  // sắp xếp ổn định để mã không nhảy lung tung
  const keyOf = (m: (typeof withLen)[number]) => `${m.kind}|${m.name ?? ''}|${m.section.code}|${m.length}`;
  const sorted = [...withLen].sort((a, b) => a.kind.localeCompare(b.kind) || a.section.code.localeCompare(b.section.code) || b.length - a.length);
  // Cấu kiện có 部材名: mã = đúng tên master (BOM tách dòng theo chiều dài)
  for (const m of sorted) {
    const k = keyOf(m);
    if (groups.has(k)) continue;
    if (m.name) {
      groups.set(k, m.name);
    } else {
      counters[m.kind] = (counters[m.kind] ?? 0) + 1;
      groups.set(k, `${KIND_PREFIX[m.kind]}${counters[m.kind]}`);
    }
  }
  return withLen.map((m) => ({ ...m, mark: groups.get(keyOf(m))!, weight: (kgPerM(m.section) * m.length) / 1000 }));
}

export interface BomRow {
  mark: string;
  kind: Member['kind'];
  section: string;
  material: string;
  length: number;
  qty: number;
  unitWeight: number;
  totalWeight: number;
}

export function bomByMark(members: Member[]): BomRow[] {
  const m = new Map<string, BomRow>();
  for (const mb of members) {
    const key = `${mb.mark}|${mb.length}`;
    const r = m.get(key);
    if (r) {
      r.qty++;
      r.totalWeight += mb.weight;
    } else
      m.set(key, {
        mark: mb.mark,
        kind: mb.kind,
        section: mb.section.code,
        material: mb.section.material,
        length: mb.length,
        qty: 1,
        unitWeight: mb.weight,
        totalWeight: mb.weight,
      });
  }
  return [...m.values()].sort((a, b) => a.mark.localeCompare(b.mark, undefined, { numeric: true }) || b.length - a.length);
}

export interface BomSectionRow {
  section: string;
  material: string;
  kgm: number;
  count: number;
  totalLength: number;
  totalWeight: number;
}

export function bomBySection(members: Member[]): BomSectionRow[] {
  const m = new Map<string, BomSectionRow>();
  for (const mb of members) {
    const r = m.get(mb.section.code) ?? {
      section: mb.section.code,
      material: mb.section.material,
      kgm: kgPerM(mb.section),
      count: 0,
      totalLength: 0,
      totalWeight: 0,
    };
    r.count++;
    r.totalLength += mb.length;
    r.totalWeight += mb.weight;
    m.set(mb.section.code, r);
  }
  return [...m.values()].sort((a, b) => b.totalWeight - a.totalWeight);
}

/** Gán 工区, グループ, 分類, 塗装, 継手 và diện tích sơn cho từng cấu kiện */
/** Nhãn ngắn: 左右GJ1 中GJ2 */
export function jointLabel(js?: { pos: JointPos; name: string }[]): string | undefined {
  if (!js?.length) return undefined;
  const by = new Map<string, string>();
  for (const x of js) by.set(x.name, (by.get(x.name) ?? '') + JOINT_POS_LABEL[x.pos]);
  return [...by].map(([n, ps]) => ps + n).join(' ');
}

function annotate(p: Project, list: Member[], g: Geometry): Member[] {
  const zoneRanges = p.zones.map((z) => {
    const a = g.xs.get(z.x1) ?? 0, b = g.xs.get(z.x2) ?? 0;
    return { name: z.name, lo: Math.min(a, b), hi: Math.max(a, b) };
  });
  // vùng đầu/cuối mở rộng ra ngoài trục biên để gồm cả 胴縁 đầu hồi
  const gMin = Math.min(...zoneRanges.map((z) => z.lo)), gMax = Math.max(...zoneRanges.map((z) => z.hi));
  for (const z of zoneRanges) {
    if (z.lo === gMin) z.lo -= 2000;
    if (z.hi === gMax) z.hi += 2000;
  }
  const jointName = new Map(p.joints.map((j) => [j.id, j.name]));
  const jointsByName = new Map<string, { pos: JointPos; name: string }[]>();
  for (const m of p.master) {
    const arr = (Object.entries(m.joints ?? {}) as [JointPos, string][]).filter(([, id]) => jointName.has(id)).map(([pos, id]) => ({ pos, name: jointName.get(id)! }));
    if (arr.length && !jointsByName.has(m.name)) jointsByName.set(m.name, arr);
  }
  const baseByName = new Map<string, string>();
  for (const b of p.bases) for (const id of b.memberIds) {
    const n = p.master.find((m) => m.id === id)?.name;
    if (n && !baseByName.has(n)) baseByName.set(n, b.name);
  }
  const colBase = new Map<string, string>();
  for (const c of p.columns) {
    const bn = c.baseId && p.bases.find((b) => b.id === c.baseId)?.name;
    if (bn) colBase.set(c.id, bn);
  }
  // 継手 theo từng đoạn: ブラケット → 中 (継手 giữa), ガセット → 左 / 右 (đầu dầm). Cột chia đoạn → 中 tại chỗ nối.
  const nPieces = new Map<string, number>();
  for (const m of list) if (m.source && (m.kind === 'beam' || m.kind === 'column')) nPieces.set(m.source, (nPieces.get(m.source) ?? 0) + 1);
  const beamById = new Map(p.beams.map((b) => [b.id, b]));
  const colById = new Map(p.columns.map((c) => [c.id, c]));
  // ベース chỉ ở chân cột tầng thấp nhất; cột tầng trên hàn vào ダイア của コア → không có ベース
  const lowLv = [...p.levels].sort((a, b) => a.elevation - b.elevation)[0]?.id;
  // chân cột đứng trên 1 cột / cụm コア khác (hàn vào ダイア) → không có ベース
  const colMs = list.filter((m) => m.kind === 'column');
  const footOnOther = (m: Member) => {
    const foot = m.a[2] <= m.b[2] ? m.a : m.b;
    return colMs.some((o) => {
      if (o === m || (o.source === m.source && o.piece === m.piece)) return false;
      const top = o.a[2] >= o.b[2] ? o.a : o.b, bot = o.a[2] >= o.b[2] ? o.b : o.a;
      if (Math.hypot(top[0] - foot[0], top[1] - foot[1]) > 300) return false;
      return top[2] >= foot[2] - 150 && bot[2] < foot[2] - 1;
    });
  };
  const braceById = new Map((p.braces ?? []).map((b) => [b.id, b]));
  const kneeById = new Map((p.knees ?? []).map((k) => [k.id, k]));
  const pieceJoints = (m: Member) => {
    let all = m.name ? jointsByName.get(m.name) : undefined;
    // 継手 riêng của cây dầm / cột (tab 本体 › 継手)
    const own = m.source ? (beamById.get(m.source)?.joints ?? colById.get(m.source)?.joints ?? braceById.get(m.source)?.joints ?? kneeById.get(m.source)?.joints) : undefined;
    if (own) {
      const map = new Map((all ?? []).map((x) => [x.pos, x.name]));
      for (const [pos, id] of Object.entries(own) as [JointPos, string][]) {
        if (id === undefined) continue;
        const nm = id ? jointName.get(id) : undefined;
        if (nm) map.set(pos, nm);
        else map.delete(pos);
      }
      all = [...map].map(([pos, name]) => ({ pos, name }));
      if (!all.length) all = undefined;
    }
    if (!all || !m.source) return all;
    const n = nPieces.get(m.source) ?? 1, i = m.piece ?? 0;
    const pos = new Set<JointPos>();
    let gap = 0;
    if (m.kind === 'brace') {
      // ブレース: 左 = đầu a, 右 = đầu b, 中 = クロスプレート tại giao điểm X (tính ở thanh thứ nhất)
      const br = braceById.get(m.source);
      // 方杖: chỉ 左 (đầu cột) / 右 (đầu dầm)
      if (!br) return kneeById.has(m.source) ? (all.filter((x) => x.pos === 'left' || x.pos === 'right').length ? all.filter((x) => x.pos === 'left' || x.pos === 'right') : undefined) : undefined;
      const r: NonNullable<Member['joints']> = all.filter((x) => x.pos === 'left' || x.pos === 'right');
      const mid = all.find((x) => x.pos === 'mid');
      if (mid && br.x) r.push(i === 0 ? { ...mid, at: m.length / 2 } : { ...mid, dup: true });
      return r.length ? r : undefined;
    }
    if (m.kind === 'beam') {
      const bm = beamById.get(m.source);
      gap = bm ? bm.gap ?? jointMidGap(p, bm.joints, bm.memberId) : 0;
      const br1 = !!bm && beamEnd(bm, 1) === 'rigid' && !!bm.j1 && n > 1, br2 = !!bm && beamEnd(bm, 2) === 'rigid' && !!bm.j2 && n > 1;
      if (i === 0) { if (!br1) pos.add('left'); }
      if (i === n - 1) { if (!br2) pos.add('right'); }
    } else {
      if (n === 1) return all;
      { const c = p.columns.find((x) => x.id === m.source); gap = c ? c.gap ?? jointMidGap(p, c.joints, c.memberId) : 0; }
      if (i === 0) pos.add('bottom');
      if (i === n - 1) pos.add('top');
    }
    const r: NonNullable<Member['joints']> = all.filter((x) => pos.has(x.pos) && x.pos !== 'mid');
    const mid = all.find((x) => x.pos === 'mid');
    if (mid && n > 1) {
      if (i > 0) r.push({ ...mid, dup: true }); // mối nối 中 ở đầu đoạn (đã tính ở đoạn trước)
      if (i < n - 1) r.push({ ...mid, at: m.length + gap / 2 }); // 中 tại chỗ tách ブラケット
    }
    return r.length ? r : undefined;
  };
  const pick = (cats: { name: string; keys: string[] }[], key: string, kindKey: string) =>
    (cats.find((c) => c.keys.includes(key)) ?? cats.find((c) => c.keys.includes(kindKey)))?.name;
  return list.map((m) => {
    const key = memberKey(m);
    const kindKey = `k:${m.kind}`;
    const xm = (m.a[0] + m.b[0]) / 2;
    const zone = zoneRanges.find((z) => xm >= z.lo - 1 && xm <= z.hi + 1)?.name;
    return {
      ...m,
      key,
      zone,
      group: pick(p.groups, key, kindKey),
      cls: pick(p.classes, key, kindKey),
      paint: pick(p.paints, key, kindKey),
      joints: m.kind === 'beam' || m.kind === 'column' || m.kind === 'brace' ? pieceJoints(m) : undefined,
      joint: m.kind === 'beam' || m.kind === 'column' || m.kind === 'brace' ? jointLabel(pieceJoints(m)) : undefined,
      base: m.kind === 'column' && !m.piece && !(m.source && colById.get(m.source)?.noBase) && (!m.source || colById.get(m.source)?.base === lowLv) && !footOnOther(m) ? (m.source && colBase.get(m.source)) || (m.name ? baseByName.get(m.name) : undefined) : undefined,
      area: (sectionPerimeter(m.section) * m.length) / 1e6,
    };
  });
}

/** Các khoá có thể chọn khi gom nhóm: 部材名 trong master + loại cấu kiện sinh tự động */
export function selectableKeys(p: Project): { key: string; label: string }[] {
  const kinds: [MemberKind, string][] = [
    ['column', 'Tất cả cột'],
    ['beam', 'Tất cả dầm'],
    ['rafter', 'Kèo'],
    ['purlin', '母屋 (xà gồ mái)'],
    ['girt', '胴縁 (xà gồ tường)'],
    ['brace', 'Tất cả giằng'],
    ['misc', '二次部材'],
  ];
  return [...kinds.map(([k, l]) => ({ key: `k:${k}`, label: l })), ...p.master.map((m) => ({ key: `n:${m.name}`, label: m.name }))];
}

/** Bề rộng nửa của cột theo phương n (mặt bằng) và vị trí tâm cột */
function columnAt(p: Project, g: Geometry, xId: string, yId: string, levelId: string) {
  const z = g.lv.get(levelId) ?? 0;
  for (const c of p.columns) {
    if (c.x !== xId || c.y !== yId) continue;
    const zb = g.lv.get(c.base) ?? 0, zt = g.lv.get(c.top) ?? 0;
    if (z < Math.min(zb, zt) - 1 || z > Math.max(zb, zt) + 1) continue;
    const m = p.master.find((x) => x.id === c.memberId);
    const s = m && p.sections.find((x) => x.id === m.sectionId);
    if (!s) continue;
    const [cx, cy] = columnCenter(g.xs.get(xId)!, g.ys.get(yId)!, c, s.b, s.h);
    const r = (c.rotation * Math.PI) / 180;
    return { cx, cy, b: s.b, h: s.h, r, type: s.type, tw: s.tw, id: c.id };
  }
  return undefined;
}

/** Toạ độ mặt bằng 2 đầu dầm: theo 2 部材 đã chọn (p1/p2) hoặc theo giao trục */
export function beamEnds(g: Geometry, bm: Beam, defDir?: BeamDir): [(number | undefined)[], (number | undefined)[]] {
  const e: [(number | undefined)[], (number | undefined)[]] = bm.p1 && bm.p2 ? [[...bm.p1], [...bm.p2]] : [
    [g.xs.get(bm.x1), g.ys.get(bm.y1)],
    [g.xs.get(bm.x2), g.ys.get(bm.y2)],
  ];
  // Hướng lắp: 左側 → 右側 theo chiều tăng (hoặc giảm) của trục X, Y
  const dir = bm.dir ?? defDir ?? 'asc';
  if (e[0].includes(undefined) || e[1].includes(undefined)) return e;
  const dx = e[1][0]! - e[0][0]!, dy = e[1][1]! - e[0][1]!;
  const d = Math.abs(dx) >= Math.abs(dy) ? dx : dy;
  if ((dir === 'asc' && d < 0) || (dir === 'desc' && d > 0)) return [e[1], e[0]];
  return e;
}

/** Cột ở cao độ tầng có giao trục / tâm gần điểm (x, y), hoặc đúng cột ref */
function columnNear(p: Project, g: Geometry, x: number, y: number, levelId: string, ref?: string) {
  const rc = ref && p.columns.find((c) => c.id === ref);
  // ref theo thứ tự lúc bấm; nếu hướng lắp đảo 2 đầu dầm thì ref không còn nằm ở đầu này → tìm theo vị trí
  const ra = rc ? columnAt(p, g, rc.x, rc.y, levelId) : undefined;
  if (ra && Math.hypot(ra.cx - x, ra.cy - y) <= Math.max(ra.b, ra.h) + 1) return ra;
  for (const c of p.columns) {
    const gx = g.xs.get(c.x), gy = g.ys.get(c.y);
    if (gx === undefined || gy === undefined) continue;
    const ca = columnAt(p, g, c.x, c.y, levelId);
    if (!ca) continue;
    if (Math.hypot(gx - x, gy - y) < 1 || Math.hypot(ca.cx - x, ca.cy - y) <= Math.max(ca.b, ca.h) / 2) return ca;
  }
  return undefined;
}

/** Độ dời ngang của dầm (mặt bằng) theo độ lệch + vị trí so với 本柱 */
export function beamOffset(p: Project, g: Geometry, bm: Beam, s: Section): [number, number] {
  const [[ax, ay], [bx, by]] = beamEnds(g, bm, p.params.member.beamDir) as unknown as [number, number][];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  const n: [number, number] = [-(by - ay) / L, (bx - ax) / L]; // pháp tuyến bên trái
  let d = bm.off ?? 0;
  // 配置基準: 左面 nằm trên đường đặt → tâm dầm lệch sang phải nửa bề rộng, và ngược lại
  if (bm.place === 'left') d -= s.b / 2;
  else if (bm.place === 'right') d += s.b / 2;
  const al = bm.align ?? 'grid';
  if (al !== 'grid') {
    const c = columnNear(p, g, ax, ay, bm.level, bm.ref1) ?? columnNear(p, g, bx, by, bm.level, bm.ref2);
    if (c) {
      const base = (c.cx - ax) * n[0] + (c.cy - ay) * n[1]; // tâm cột theo n
      if (al === 'center') d += base;
      else {
        // nửa bề rộng cột theo n (hình chữ nhật b×h xoay r)
        const ux = Math.cos(c.r), uy = Math.sin(c.r);
        const half = Math.abs(n[0] * ux + n[1] * uy) * (c.b / 2) + Math.abs(-n[0] * uy + n[1] * ux) * (c.h / 2);
        // phía "ngoài" = xa tâm công trình
        const mx = (ax + bx) / 2, my = (ay + by) / 2;
        const out = Math.sign((mx - (g.x0 + g.xN) / 2) * n[0] + (my - (g.y0 + g.yN) / 2) * n[1]) || 1;
        const sgn = al === 'out' ? out : -out;
        d += base + sgn * (half - s.b / 2);
      }
    }
  }
  return [n[0] * d, n[1] * d];
}

/** Lý do cột không dựng được (để báo cho người nhập) */
export function columnIssue(p: Project, c: Project['columns'][number]): string | null {
  const g = geometry(p);
  if (!c.pt && g.xs.get(c.x) === undefined) return `trục X không tồn tại (${c.x})`;
  if (!c.pt && g.ys.get(c.y) === undefined) return `trục Y không tồn tại (${c.y})`;
  if (g.lv.get(c.base) === undefined) return 'tầng chân cột không tồn tại';
  if (g.lv.get(c.top) === undefined) return 'tầng đỉnh cột không tồn tại';
  const m = p.master.find((x) => x.id === c.memberId);
  if (!m) return '部材名 của cột không còn trong master';
  if (!p.sections.some((s) => s.id === m.sectionId)) return `部材名 ${m.name} mất tiết diện (chưa chọn kích thước)`;
  if (g.lv.get(c.base) === g.lv.get(c.top)) return 'chân và đỉnh cùng cao độ';
  return null;
}
