import { boxCornerR, roundRect } from './section3d';
// Hình học bản ghép, số bulông, khối lượng của 継手 và ベース
import { BasePlate, BoltGroup, GplCut, Joint, JointPos, Section, epGap, epOf, weldS } from './model';

export interface PlateBox {
  name: string;
  w: number; // theo trục x địa phương (bề rộng cánh)
  h: number; // theo trục y địa phương (chiều cao tiết diện)
  l: number; // dọc trục thanh
  ox: number;
  oy: number;
  oz: number; // tâm bản so với vị trí mối nối, dọc trục thanh
  /** bản dạng vòng (mặt cắt [biên ngoài, lỗ] trong mặt x-y, đùn dài l) – vd カドピタ khớp mặt trong cột bo góc */
  ring?: [number, number][][];
  /** diện tích mặt cắt (mm²) khi là vòng */
  area?: number;
}

/** Chiều dài 1 bên nhóm bulông */
export const sideLen = (g: BoltGroup) => (g.cols - 1) * g.pitch + g.edge + (g.edge2 ?? g.edge);
/** すきま mối nối */
export const jointGap = (j: Joint) => j.gap ?? 10;
/** Chiều rộng nhóm bulông */
export const groupWidth = (g: BoltGroup) => (g.rows - 1) * g.gauge + 2 * g.edge;

export function webPlateH(sec: Section, j: Joint) {
  return j.webH > 0 ? j.webH : Math.max(groupWidth(j.webBolts), sec.h - 2 * sec.tf - 40);
}

/**
 * GPL: chiều cao bản và độ lệch tâm theo hình dạng cắt FLG.
 * Khe hở tới cánh dầm lấy theo サイズS mối hàn (鉄骨部材のあきにサイズSを考慮).
 * none: giữa 2 cánh; one: cắt FLG dưới (下フランジ片刃落とし) → kéo xuống tới mép dưới; both: cắt cả 2 cánh.
 */
export function gplShape(sec: Section, j: Joint, cut: GplCut = j.flgCut ?? 'one'): { h: number; oy: number; s: number; maxS: number } {
  const w = weldS(j.webT);
  const inner = sec.h - 2 * sec.tf;
  let h: number, oy: number;
  if (cut === 'none') {
    h = inner - 2 * w.s;
    oy = 0;
  } else if (cut === 'one') {
    h = sec.h - sec.tf - w.s - w.s; // từ dưới cánh trên (chừa S) tới mép dưới dầm (chừa S)
    oy = -(sec.tf + w.s) / 2 + w.s / 2;
  } else {
    h = sec.h - 2 * w.s;
    oy = 0;
  }
  // tấm GPL nằm giữa 部材 (tâm GPL = tâm 部材), lệch theo gplOy (+ = lên)
  if (j.webH > 0) return { h: j.webH, oy: j.gplOy ?? 0, s: w.s, maxS: w.max };
  if (j.gplOy !== undefined) oy = j.gplOy;
  return { h: Math.max(h, groupWidth(j.webBolts)), oy, s: w.s, maxS: w.max };
}

/**
 * Các bản ghép tại một vị trí mối nối.
 * @param dir +1 nếu mối nối ở đầu thanh và bản kéo vào trong theo chiều dương, -1 theo chiều âm, 0 nếu mối nối giữa thanh (đối xứng)
 */
/** エレクションピース: các mặt có ピース. axis = pháp tuyến mặt (x hoặc y), face = khoảng từ tâm tới mặt, half = nửa bề rộng mặt */
export function epFaces(sec: { b: number; h: number }, j: Joint, faces = epOf(j).faces) {
  const fs: { axis: 'x' | 'y'; sg: number; face: number; half: number }[] = [
    { axis: 'y', sg: 1, face: sec.h / 2, half: sec.b / 2 },
    { axis: 'y', sg: -1, face: sec.h / 2, half: sec.b / 2 },
  ];
  if (faces === 4) fs.push({ axis: 'x', sg: 1, face: sec.b / 2, half: sec.h / 2 }, { axis: 'x', sg: -1, face: sec.b / 2, half: sec.h / 2 });
  return fs;
}
/** vị trí ngang (dọc theo mặt cột) của n tấm cách đều sp, lệch off */
export const epSpots = (n: number, sp: number, off: number) => Array.from({ length: Math.max(0, n) }, (_, k) => off + (k - (n - 1) / 2) * sp);
/** toạ độ dọc trục các bulông của 1 bên (dương = phía trên mối nối) */
export const epBoltZ = (j: Joint) => {
  const e = epOf(j), gap = epGap(j);
  return Array.from({ length: Math.max(1, e.nb) }, (_, k) => gap / 2 + e.edge + k * e.pitch);
};

function epPlates(sec: Section, j: Joint): PlateBox[] {
  const e = epOf(j), gap = epGap(j);
  const out: PlateBox[] = [];
  for (const f of epFaces(sec, j)) {
    // P(tên, dày theo phương ngang mặt, kích thước theo pháp tuyến, dài dọc trục, tâm theo pháp tuyến, tâm ngang mặt, tâm dọc trục)
    const P = (name: string, tn: number, wr: number, l: number, on: number, ot: number, oz: number): PlateBox =>
      f.axis === 'y' ? { name, w: tn, h: wr, l, ox: ot, oy: on, oz } : { name, w: wr, h: tn, l, ox: on, oy: ot, oz };
    for (const u of epSpots(e.n, e.sp, e.off)) {
      const rc = f.sg * (f.face + e.w / 2);
      const rs = f.sg * (f.face + e.w - e.spW / 2); // 添板 sát mép ngoài ピース
      // ピース cột trên và ピース cột dưới là 2 tấm riêng, cách nhau đúng khe cột
      for (const s of [1, -1]) out.push(P(s > 0 ? 'エレクションピース (cột trên)' : 'エレクションピース (cột dưới)', e.t, e.w, e.h, rc, u, s * (gap / 2 + e.h / 2)));
      for (const s of [1, -1]) out.push(P('添板 (エレクションピース)', e.spT, e.spW, e.spL, rs, u + s * (e.t / 2 + e.spT / 2), 0));
    }
  }
  // phần bên trong cột (chỉ cột hộp / ống có mặt trong): 4 mặt trong cách tâm face − tw
  const hollow = sec.type === 'Box' || sec.type === 'Pipe';
  const inner = hollow ? epFaces(sec, j, 4).map((f) => ({ ...f, face: f.face - sec.tw, half: f.half - sec.tw })) : [];
  // 下がり止め: PL hàn ở 4 mặt trong của cột trên, mép dưới cách mối nối sdZ
  if (e.sdN > 0)
    for (const f of inner)
      for (const u of epSpots(e.sdN, e.sdSp, e.sdOff)) {
        const on = f.sg * (f.face - e.sdT / 2), oz = gap / 2 + e.sdZ + e.sdH / 2;
        out.push(f.axis === 'y' ? { name: '下がり止め', w: e.sdW, h: e.sdT, l: e.sdH, ox: u, oy: on, oz } : { name: '下がり止め', w: e.sdT, h: e.sdW, l: e.sdH, ox: on, oy: u, oz });
      }
  // カドピタ: vòng 裏当て金 lót sát mặt trong cột, che khe mối hàn (mép trên cao hơn mối nối kpUp)
  if (e.kpOn && sec.type === 'Box') {
    // biên ngoài = biên trong cột (bo góc R − t theo chuẩn BCR 3.5t / STKR 2.5t), dày kpT
    const bi = sec.b - 2 * sec.tw, hi = sec.h - 2 * sec.tw, Ri = Math.max(0, boxCornerR(sec) - sec.tw);
    const oz = e.kpUp - e.kpW / 2, Rk = Math.max(0, Ri - e.kpT);
    const area = bi * hi - (4 - Math.PI) * Ri * Ri - ((bi - 2 * e.kpT) * (hi - 2 * e.kpT) - (4 - Math.PI) * Rk * Rk);
    out.push({ name: 'カドピタ', w: bi, h: hi, l: e.kpW, ox: 0, oy: 0, oz, ring: [roundRect(bi, hi, Ri), roundRect(bi - 2 * e.kpT, hi - 2 * e.kpT, Rk)], area });
  } else if (e.kpOn)
    for (const f of inner) {
      const on = f.sg * (f.face - e.kpT / 2), oz = e.kpUp - e.kpW / 2, len = 2 * f.half - (f.axis === 'x' ? 2 * e.kpT : 0);
      out.push(f.axis === 'y' ? { name: 'カドピタ', w: len, h: e.kpT, l: e.kpW, ox: 0, oy: on, oz } : { name: 'カドピタ', w: e.kpT, h: len, l: e.kpW, ox: on, oy: 0, oz });
    }
  return out;
}

export function jointPlates(sec: Section, j: Joint, dir: number): PlateBox[] {
  if (j.type === 'EP') return epPlates(sec, j);
  const out: PlateBox[] = [];
  const gap = jointGap(j);
  const webL = j.webL || (j.type === 'GPL' ? sideLen(j.webBolts) + 40 : 2 * sideLen(j.webBolts) + gap);
  const flL = j.flangeL || 2 * sideLen(j.flangeBolts) + gap;
  // mối nối ở đầu dầm (sát mặt cột): bản nằm lệch vào trong thanh
  const shift = (L: number) => (dir === 0 ? 0 : (dir * L) / 2);
  const wh = webPlateH(sec, j);
  if (j.type === 'SPL') {
    for (const sgn of [1, -1]) {
      out.push({ name: 'Bản ngoài cánh', w: sec.b, h: j.flangeT, l: flL, ox: 0, oy: sgn * (sec.h / 2 + j.flangeT / 2), oz: shift(flL) });
      const wi = j.innerW || Math.max(20, (sec.b - sec.tw) / 2 - 15);
      if (j.innerT > 0)
      for (const sx of [1, -1])
        out.push({ name: 'Bản trong cánh', w: wi, h: j.innerT, l: flL, ox: sx * (sec.tw / 2 + 10 + wi / 2), oy: sgn * (sec.h / 2 - sec.tf - j.innerT / 2), oz: shift(flL) });
    }
  }
  if (j.type === 'SPL' || j.type === 'DS') {
    for (const sx of [1, -1]) out.push({ name: 'Bản bụng', w: j.webT, h: wh, l: webL, ox: sx * (sec.tw / 2 + j.webT / 2), oy: 0, oz: shift(webL) });
  }
  if (j.type === 'GPL') {
    const gs = gplShape(sec, j);
    const cl = j.clear ?? 10;
    // bản mã hàn vào cột: chiều dài = クリアランス + phần chồng lên bụng dầm
    out.push({ name: 'Bản mã (ガセット)', w: j.webT, h: gs.h, l: webL + cl, ox: sec.tw / 2 + j.webT / 2, oy: gs.oy, oz: shift(webL + cl) - (dir || 1) * cl });
  }
  if (j.type === 'DS' && j.gplT) out.push({ name: 'GPL (BJ-2)', w: j.gplT, h: wh, l: webL / 2, ox: 0, oy: 0, oz: shift(webL / 2) - (dir || 1) * webL / 4 });
  return out;
}

/** Số bulông tại một vị trí mối nối */
export function boltsPerLocation(j: Joint): number {
  const w = j.webBolts.rows * j.webBolts.cols;
  const f = j.flangeBolts.rows * j.flangeBolts.cols;
  if (j.type === 'SPL') return f * 2 * 2 + w * 2; // 2 cánh × 2 bên + bụng 2 bên
  if (j.type === 'DS') return w * 2;
  if (j.type === 'EP') return Math.max(1, epOf(j).nb) * 2 * epOf(j).faces * Math.max(1, epOf(j).n);
  return w; // GPL: chỉ phía dầm, phía cột hàn
}

/** Vị trí mối nối theo vị trí 上/下/左/右/中 (mm từ đầu a của thanh) */
export function jointStationAt(len: number, j: Joint, pos: JointPos): { z: number; dir: number } {
  if (pos === 'bottom' || pos === 'left') return { z: 0, dir: 1 };
  if (pos === 'top' || pos === 'right') return { z: len, dir: -1 };
  return { z: j.pos > 0 && j.pos < len ? j.pos : len / 2, dir: 0 };
}

/** Vị trí mối nối dọc thanh (mm từ đầu a) và hướng bản (cách cũ) */
export function jointStations(len: number, j: Joint): { z: number; dir: number }[] {
  if (j.target === 'column') return j.pos > 0 && j.pos < len ? [{ z: j.pos, dir: 0 }] : [];
  if (j.pos <= 0) return [
    { z: 0, dir: 1 },
    { z: len, dir: -1 },
  ];
  return j.pos * 2 < len ? [{ z: j.pos, dir: 0 }, { z: len - j.pos, dir: 0 }] : [];
}

export const plateKg = (pl: PlateBox) => ((pl.area ?? pl.w * pl.h) * pl.l * 7.85e-6);

export function baseKg(b: BasePlate) {
  const c = b.chamfer ?? 0;
  return b.t * (b.b * b.d - 2 * c * c) * 7.85e-6;
}

/** Bố trí bulông neo của ベース (toạ độ trong bản đế, tâm cột = 0; x theo B, y theo D) */
export function baseLayout(b: BasePlate) {
  const a = b.anchor;
  const nx = Math.max(1, a.nx ?? Math.max(1, Math.round(a.n / 2)));
  const ny = Math.max(nx === 1 ? 2 : 2, a.ny ?? 2);
  const ex = a.ex ?? 50, ey = a.ey ?? 50;
  const X = b.b / 2 - ex, Y = b.d / 2 - ey;
  const px = nx > 1 ? (2 * X) / (nx - 1) : 0, py = ny > 1 ? (2 * Y) / (ny - 1) : 0;
  const pts: [number, number][] = [];
  for (const sy of [-1, 1]) for (let i = 0; i < nx; i++) pts.push([nx === 1 ? 0 : -X + i * px, sy * Y]);
  for (const sx of [-1, 1]) for (let k = 1; k < ny - 1; k++) pts.push([sx * X, -Y + k * py]);
  const c = Math.min(b.chamfer ?? 0, b.b / 2, b.d / 2);
  const outline: [number, number][] = c > 0
    ? [[-b.b / 2 + c, -b.d / 2], [b.b / 2 - c, -b.d / 2], [b.b / 2, -b.d / 2 + c], [b.b / 2, b.d / 2 - c], [b.b / 2 - c, b.d / 2], [-b.b / 2 + c, b.d / 2], [-b.b / 2, b.d / 2 - c], [-b.b / 2, -b.d / 2 + c]]
    : [[-b.b / 2, -b.d / 2], [b.b / 2, -b.d / 2], [b.b / 2, b.d / 2], [-b.b / 2, b.d / 2]];
  return {
    pts, nx, ny, ex, ey, px, py, outline, c,
    shape: a.shape ?? 'I',
    hook: a.hook ?? (a.shape === 'P' ? Math.max(4 * a.dia, 80) : 4 * a.dia),
    proj: a.proj ?? Math.max(40, Math.round(a.dia * 2 + 10)),
    hole: a.dia + (a.dia >= 27 ? 10 : 5),
  };
}

/** Kiểm tra khoảng cách bulông theo quy định tối thiểu */
export function boltWarnings(j: Joint, std: { pitchMin: number; edgeMin: number } | undefined): string[] {
  if (!std) return [];
  const out: string[] = [];
  const groups: [string, BoltGroup][] = j.type === 'SPL' ? [['cánh', j.flangeBolts], ['bụng', j.webBolts]] : [['bụng', j.webBolts]];
  for (const [n, g] of groups) {
    if (g.pitch < std.pitchMin) out.push(`Pitch ${n} ${g.pitch} < tối thiểu ${std.pitchMin} mm (M${j.bolt.dia})`);
    if (g.rows > 1 && g.gauge < std.pitchMin) out.push(`Gauge ${n} ${g.gauge} < tối thiểu ${std.pitchMin} mm`);
    if (g.edge < std.edgeMin) out.push(`へりあき ${n} ${g.edge} < tối thiểu ${std.edgeMin} mm`);
  }
  return out;
}

/** Chiều dày kẹp (締付け長さ) của từng nhóm bulông – dùng tính 首下長さ */
export function boltGrips(sec: { tw: number; tf: number }, j: Joint): { label: string; grip: number }[] {
  const out: { label: string; grip: number }[] = [];
  if (j.type === 'EP') return [{ label: 'エレクションピース', grip: epOf(j).t + 2 * epOf(j).spT }];
  if (j.type === 'SPL') out.push({ label: 'cánh', grip: sec.tf + j.flangeT + (j.innerT > 0 ? j.innerT : 0) });
  out.push({ label: j.type === 'GPL' ? 'bản mã' : 'bụng', grip: j.type === 'GPL' ? sec.tw + j.webT : sec.tw + 2 * j.webT });
  return out;
}

/** Một bulông trong hệ toạ độ địa phương của thanh (x: bề rộng cánh, y: chiều cao tiết diện, z: dọc trục) */
export interface BoltPos {
  x: number;
  y: number;
  z: number;
  axis: 'x' | 'y';
  /** toạ độ mặt ngoài (phía đầu bulông) và mặt trong (phía đai ốc) trên trục bulông */
  out: number;
  inn: number;
}

/** Vị trí các bulông tại một vị trí mối nối (cùng quy ước với jointPlates) */
export function jointBolts(sec: Section, j: Joint, dir: number): BoltPos[] {
  const out: BoltPos[] = [];
  const gap = jointGap(j);
  const wg = j.webBolts, fg = j.flangeBolts;
  const webL = j.webL || (j.type === 'GPL' ? sideLen(wg) + 40 : 2 * sideLen(wg) + gap);
  const flL = j.flangeL || 2 * sideLen(fg) + gap;
  const shift = (L: number) => (dir === 0 ? 0 : (dir * L) / 2);
  const cross = (g: BoltGroup) => Array.from({ length: g.rows }, (_, k) => -((g.rows - 1) * g.gauge) / 2 + k * g.gauge);
  // 2 nhóm đối xứng qua mối nối (SPL / DS)
  const pair = (g: BoltGroup, c: number) => {
    const zs: number[] = [];
    for (const s of [1, -1]) for (let k = 0; k < g.cols; k++) zs.push(c + s * (gap / 2 + g.edge + k * g.pitch));
    return zs;
  };
  const tw = sec.tw, h = sec.h, tf = sec.tf;
  if (j.type === 'EP') {
    const e = epOf(j);
    const g = e.t / 2 + e.spT;
    for (const f of epFaces(sec as Section, j)) {
      const rb = f.sg * (f.face + e.w - e.spW / 2);
      for (const u of epSpots(e.n, e.sp, e.off))
        for (const s of [1, -1])
          for (const z of epBoltZ(j))
            out.push(f.axis === 'y' ? { x: u, y: rb, z: s * z, axis: 'x', out: u + g, inn: u - g } : { x: rb, y: u, z: s * z, axis: 'y', out: u + g, inn: u - g });
    }
    return out;
  }
  if (j.type === 'GPL') {
    const d = dir || 1;
    const zs = Array.from({ length: wg.cols }, (_, k) => d * (webL - wg.edge - k * wg.pitch));
    const oy = j.boltOy ?? 0;
    for (const y of cross(wg)) for (const z of zs) out.push({ x: 0, y: y + oy, z, axis: 'x', out: tw / 2 + j.webT, inn: -tw / 2 });
    return out;
  }
  for (const y of cross(wg)) for (const z of pair(wg, shift(webL))) out.push({ x: 0, y, z, axis: 'x', out: tw / 2 + j.webT, inn: -(tw / 2 + j.webT) });
  if (j.type === 'SPL') {
    const innF = j.innerT > 0 ? j.innerT : 0;
    for (const sgn of [1, -1])
      for (const x of cross(fg))
        for (const z of pair(fg, shift(flL))) out.push({ x, y: 0, z, axis: 'y', out: sgn * (h / 2 + j.flangeT), inn: sgn * (h / 2 - tf - innF) });
  }
  return out;
}

/**
 * Hình GPL dầm mặc định trong hệ toạ độ trình vẽ 2D: u dọc trục dầm (từ đầu dầm vào trong), v theo chiều cao (lên trên).
 * Dùng làm điểm bắt đầu khi vẽ lại tấm GPL ở một point.
 */
export function gplPlateInit(sec: Section, j: Joint): { pts: [number, number][]; holes: { c: [number, number]; r: number }[]; t: number } {
  const gs = gplShape(sec, j);
  const cl = j.clear ?? 10;
  const webL = j.webL || sideLen(j.webBolts) + 40;
  const v0 = gs.oy - gs.h / 2, v1 = gs.oy + gs.h / 2;
  const pts: [number, number][] = [[-cl, v0], [webL, v0], [webL, v1], [-cl, v1]];
  const holes = jointBolts(sec, j, 1).filter((b) => b.axis === 'x').map((b) => ({ c: [b.z, b.y] as [number, number], r: (j.bolt.dia + 2) / 2 }));
  return { pts, holes, t: j.webT };
}

/** GPL dầm: kích thước theo hình (mặt cột ở 0, dọc trục dầm). Dùng chung cho hình vẽ và ô sửa kích thước. */
export function gplDims(sec: Section, j: Joint) {
  const wg = j.webBolts;
  const cl = j.clear ?? 10;
  const webL = j.webL || sideLen(wg) + 40;
  const L = cl + webL; // tổng chiều dài GPL từ mặt cột
  const pitchSpan = (wg.cols - 1) * wg.pitch;
  const a = L - wg.edge - pitchSpan; // mặt cột → hàng bulông đầu
  const gs = gplShape(sec, j);
  const gSpan = (wg.rows - 1) * wg.gauge;
  const oy = j.boltOy ?? 0;
  const top = gs.oy + gs.h / 2 - (oy + gSpan / 2);
  const bot = oy - gSpan / 2 - (gs.oy - gs.h / 2);
  return { cl, webL, L, a, pitchSpan, gs, gSpan, oy, top, bot };
}
