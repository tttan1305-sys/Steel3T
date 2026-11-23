// ピース nhập tay cho 母屋 / 胴縁: 支持ピース · 接続ピース · コーナーピース
// Cách 1: chọn 部材 (親部材) → chọn các 母屋 / 胴縁 → ピース tại giao điểm.
// Cách 2: như cách 1 + chọn 補助線 → ピース tại giao của 母屋 / 胴縁 với 補助線.
import type { Member, Section, Vec3 } from './model';
import { kgPerM } from './model';
import type { FieldVal, MoyaMember, MoyaPart, MoyaPiece } from './moya';

export type PcKind = 'support' | 'connect' | 'corner';
export const PC_LABEL: Record<PcKind, string> = { support: '支持ピース', connect: '接続ピース', corner: 'コーナーピース' };
/** ピース種類 (tab ピース) được phép cho mỗi loại */
export const PC_TYPE: Record<PcKind, string> = { support: '1-', connect: '2-', corner: '3-' };
/** field trong 部材マスター cho từng loại */
export const PC_FIELD: Record<PcKind, string> = { support: 'support', connect: 'connect', corner: 'corner' };
export type PcAlign = '上' | '中' | '下';
export type PcSide = '背' | '腹';
export interface PcAux { key: string; label: string; a: Vec3; b: Vec3; /** đường mặt bằng (bỏ qua z) */ plan?: boolean }
export interface PcItem {
  id: string;
  kind: PcKind;
  /** 親部材: 'src:<source>' | 'id:<member id>' */
  buzai: string;
  buzaiLabel: string;
  /** id 母屋 / 胴縁 (item) */
  targets: string[];
  aux?: PcAux;
  /** 'マスター参照' | tên ピース */
  piece: string;
  align: PcAlign;
  side: PcSide;
  /** chân L: 外 = quay ra ngoài cây, 内 = quay vào dưới cây */
  leg: '外' | '内';
  /** dịch dọc cây (mm) */
  off: number;
}
export interface PcDraft {
  method: 1 | 2;
  buzai: string;
  buzaiLabel: string;
  targets: string[];
  aux?: PcAux;
  piece: string;
  align: PcAlign;
  side: PcSide;
  leg: '外' | '内';
  off: number;
  /** chọn 親部材 → tự lấy mọi 母屋 / 胴縁 giao trong phạm vi */
  auto?: boolean;
  /** lệnh 修正: quét chọn ピース đã nhập (khoá `${item}|${target}`) */
  edit?: boolean;
  picked?: string[];
  /** lệnh tự đặt: các ピース xem trước (chưa lưu) */
  autoPrev?: PcItem[];
}
export const initialPcDraft = (): PcDraft => ({ method: 1, buzai: '', buzaiLabel: '', targets: [], piece: 'マスター参照', align: '中', side: '背', leg: '外', off: 0, auto: true });

type V3 = Vec3;
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const nums = (s: FieldVal) => String(s ?? '').split(/[x×*]/i).map((t) => parseFloat(t)).filter((n) => !isNaN(n));
const N = (v: FieldVal | undefined, d: number) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
const NONE = new Set(['', '<なし>', '<無>', 'マスター参照']);

/** khung cục bộ của 1 thanh: u dọc trục, y = hướng H (up), x = hướng mở リップ (y × u) */
export function barFrame(m: Member) {
  const u = norm(sub(m.b, m.a));
  const up: V3 = m.up ?? [0, 0, 1];
  const y = norm(sub(up, mul(u, dot(up, u))));
  const x = cross(y, u);
  return { u, y, x, L: Math.hypot(...sub(m.b, m.a)) };
}

/** tham số s trên thanh (từ a) gần đường (p0, d) nhất; dist = khoảng cách 2 đường */
function closest(a: V3, u: V3, p0: V3, d: V3): { s: number; t: number; dist: number } {
  const w = sub(a, p0);
  const b = dot(u, d), dd = dot(d, d), dw = dot(d, w), uw = dot(u, w);
  const den = dd - b * b;
  if (Math.abs(den) < 1e-9) return { s: NaN, t: NaN, dist: Infinity };
  const s = (b * dw - dd * uw) / den;
  const t = (dw - b * uw) / den;
  const q1 = add(a, mul(u, s)), q2 = add(p0, mul(d, t));
  return { s, t, dist: Math.hypot(...sub(q1, q2)) };
}
/** giao trên mặt bằng của thanh với đường (bỏ qua z) → s theo chiều dài 3D */
function planHit(a: V3, u: V3, la: V3, lb: V3): number | null {
  const uh = [u[0], u[1]], e = [lb[0] - la[0], lb[1] - la[1]];
  const den = uh[0] * e[1] - uh[1] * e[0];
  if (Math.abs(den) < 1e-9) return null;
  const w = [la[0] - a[0], la[1] - a[1]];
  return (w[0] * e[1] - w[1] * e[0]) / den;
}

export const buzaiMembers = (all: Member[], key: string) =>
  key.startsWith('src:') ? all.filter((m) => m.source === key.slice(4) && m.part !== 'piece') : all.filter((m) => m.id === key.slice(3));
export const buzaiKey = (m: Member) => (m.source ? `src:${m.source}` : `id:${m.id}`);

export interface PcCtx {
  /** cấu kiện chính (để tìm 親部材) */
  all: Member[];
  /** thanh 母屋 / 胴縁 đã sinh (source = id item) */
  bars: Member[];
  pieces: MoyaPiece[];
  parts: MoyaPart[];
  /** 部材マスター của item */
  memberOf: (targetId: string) => MoyaMember | undefined;
}
export interface PcResult { members: Member[]; warn: string[] }

/** Sinh ピース (+ フィラー) cho danh sách PcItem */
export function pieceMembers(items: PcItem[], c: PcCtx): PcResult {
  const out: Member[] = [];
  const warn: string[] = [];
  let curT = '';
  const push = (kind: Member['kind'], sec: Section, a: V3, b: V3, up: V3, name: string, source: string, part: 'piece' | 'bolt' = 'piece') => {
    const L = Math.hypot(...sub(b, a));
    if (L < 1 || !a.every(isFinite) || !b.every(isFinite)) return;
    out.push({ id: `pc${out.length}_${source}`, kind, section: sec, a, b, up, name, mark: name, length: Math.round(L), weight: (kgPerM(sec) * L) / 1000, source, part, pcT: curT } as Member);
  };
  for (const it of items) {
    const bz = buzaiMembers(c.all, it.buzai);
    if (!bz.length) { warn.push(`${PC_LABEL[it.kind]}: 親部材 ${it.buzaiLabel} không còn`); continue; }
    for (const tid of it.targets) {
      curT = tid;
      const mem = c.memberOf(tid);
      const pcName = it.piece === 'マスター参照' ? String(mem?.v[PC_FIELD[it.kind]] ?? '') : it.piece;
      const pc = NONE.has(pcName) ? undefined : c.pieces.find((x) => x.name === pcName && String(x.v.type ?? '').startsWith(PC_TYPE[it.kind]));
      if (!pc) { warn.push(`${PC_LABEL[it.kind]}: chưa chọn ピース (マスター ${mem?.name ?? '?'} = なし)`); continue; }
      const bars = c.bars.filter((m) => m.source === tid && m.part !== 'piece');
      // chọn thanh + vị trí: giao với 親部材 (hoặc 補助線)
      let best: { bar: Member; s: number; q: V3; bm: Member; d: number } | null = null;
      for (const bar of bars) {
        const f = barFrame(bar);
        for (const bm of bz) {
          const db = sub(bm.b, bm.a);
          const cl = closest(bar.a, f.u, bm.a, norm(db));
          let s = cl.s;
          if (it.aux) {
            const h = it.aux.plan ? planHit(bar.a, f.u, it.aux.a, it.aux.b) : closest(bar.a, f.u, it.aux.a, norm(sub(it.aux.b, it.aux.a))).s;
            if (h == null || !isFinite(h)) continue;
            s = h;
          }
          if (!isFinite(s) || s < -60 || s > f.L + 60) continue;
          const p = add(bar.a, mul(f.u, s));
          // điểm trên trục 親部材 gần p nhất (kẹp trong đoạn)
          const Lb = Math.hypot(...db) || 1, ub = mul(db, 1 / Lb);
          const tb = Math.max(0, Math.min(Lb, dot(sub(p, bm.a), ub)));
          const q = add(bm.a, mul(ub, tb));
          const d = Math.hypot(...sub(p, q));
          if (!best || d < best.d) best = { bar, s, q, bm, d };
        }
      }
      if (!best) { warn.push(`${PC_LABEL[it.kind]} ${pc.name}: không giao ${it.buzaiLabel}`); continue; }
      const { bar, q, bm } = best;
      const f = barFrame(bar);
      const sec = bar.section;
      const h = sec.h, b = sec.b, t = sec.tw;
      const isC = sec.type === 'C';
      let s = best.s;
      const len = N(pc.v.len, it.kind === 'connect' ? 210 : it.kind === 'corner' ? 50 : 100);
      if (it.kind === 'corner') s = s < f.L / 2 ? len / 2 : f.L - len / 2;
      s += it.off || 0;
      const C = add(bar.a, mul(f.u, s));
      // mặt 親部材 phía cây (theo hướng y)
      const bf = (() => {
        const ub = norm(sub(bm.b, bm.a));
        const upB: V3 = bm.up ?? [0, 0, 1];
        const yB = norm(sub(upB, mul(ub, dot(upB, ub))));
        const xB = cross(yB, ub);
        return Math.abs(dot(f.y, yB)) * bm.section.h / 2 + Math.abs(dot(f.y, xB)) * bm.section.b / 2;
      })();
      const qc = dot(sub(q, C), f.y);
      const sg = qc <= 0 ? 1 : -1; // hướng từ 親部材 về phía cây
      let hS = qc + sg * bf;
      if (Math.abs(hS) > h / 2 + 2000) hS = -sg * (h / 2); // 親部材 quá xa → bắt đầu từ mép cây
      // vùng bulông (上 / 中 / 下)
      const ev = N(pc.v.edgeV, 25), rows = Math.max(1, N(pc.v.rows, 1));
      const Z = 2 * ev + (rows - 1) * 60;
      const inner = h / 2 - (isC ? t : 0);
      let far: number;
      if (it.align === '上') far = sg * inner;
      else if (it.align === '下') far = -sg * inner + sg * Z;
      else far = sg * (Z / 2);
      // フィラー (C, mặt リップ)
      let xF = -b / 2, dirX = -1, tFill = 0;
      if (it.side === '腹') {
        dirX = 1;
        xF = b / 2;
        const fn = it.kind === 'connect' ? String(pc.v.lipFillerL ?? pc.v.lipFiller ?? '') : String(pc.v.lipFiller ?? '');
        const fp = isC && String(pc.v.lipStyle ?? '').includes('あり') && !NONE.has(fn) ? c.parts.find((x) => x.name === fn) : undefined;
        if (fp) {
          const tF = nums(fp.v.size)[0] || 6, w = N(fp.v.w, 50), l = N(fp.v.l, 100), off = N(fp.v.off, 0);
          const outside = String(fp.v.pos ?? '').includes('外');
          const x0 = outside ? b / 2 : b / 2 - t - tF;
          if (outside) xF = b / 2 + tF;
          tFill = tF;
          // tấm フィラー: dày tF theo x, rộng w theo y, dài l theo u
          const K = add(add(C, mul(f.x, x0)), mul(f.y, off - w / 2));
          const P0 = add(add(K, mul(f.x, tF / 4)), mul(f.y, w / 4));
          const fs: Section = { id: `part:${fp.name}`, code: `PL-${tF}x${w}`, type: 'L', h: w, b: tF, tw: tF, tf: tF, c: 0, material: 'SS400' };
          push(bar.kind, fs, add(P0, mul(f.u, -l / 2)), add(P0, mul(f.u, l / 2)), f.y, fp.name, it.id);
        }
      }
      // ピース
      const isL = String(pc.v.mat ?? '').includes('L形鋼');
      const n = nums(pc.v.size);
      const tp = isL ? n[2] ?? 7 : n[0] ?? 6;
      const B = isL ? n[1] ?? 75 : tp;
      const auto = !String(pc.v.autoSize ?? '').includes('しない');
      let Hleg = Math.abs(far - hS);
      if (isL && !auto) Hleg = n[0] ?? 100;
      Hleg = Math.max(Hleg, Z);
      const Y = mul(f.y, sg);
      const X = mul(f.x, it.leg === '内' && isL ? -dirX : dirX);
      // heel: mặt áp cây tại xF, chân dưới tại hS; chân L 内 → heel lệch ra ngoài 1 bề dày
      const xHeel = it.leg === '内' && isL ? xF + dirX * tp : xF;
      const K = add(add(C, mul(f.x, xHeel)), mul(f.y, hS));
      const z0 = dot(cross(Y, f.u), X) >= 0 ? f.u : mul(f.u, -1);
      const P0 = add(add(K, mul(X, B / 4)), mul(Y, Hleg / 4));
      const ps: Section = { id: `piece:${pc.name}`, code: isL ? `L-${n[0] ?? 100}x${B}x${tp}` : `PL-${tp}`, type: 'L', h: Math.round(Hleg), b: B, tw: tp, tf: tp, c: 0, material: String(pc.v.grade ?? 'SS400').replace(/^\d+-/, '') };
      push(bar.kind, ps, add(P0, mul(z0, -len / 2)), add(P0, mul(z0, len / 2)), Y, pc.name, it.id);
      // ボルト: xuyên chân đứng ピース + bụng / リップ cây (+ フィラー)
      if (String(pc.v.webConn ?? '').includes('ボルト')) {
        const d = N(pc.v.boltDia, 12);
        const pv = 60;
        const conn = it.kind === 'connect';
        const us: number[] = [];
        if (conn) {
          const cl = Math.max(1, N(pc.v.colsL, 1)), cr = Math.max(1, N(pc.v.colsR, 1));
          const eL = N(pc.v.endL ?? pc.v.edgeL, 25), eR = N(pc.v.endR ?? pc.v.edgeR, 25), pl = N(pc.v.pitchL, 50), pr = N(pc.v.pitchR, 50);
          for (let i = 0; i < cl; i++) us.push(-len / 2 + eL + i * pl);
          for (let i = 0; i < cr; i++) us.push(len / 2 - eR - i * pr);
        } else {
          const cols = Math.max(1, N(pc.v.cols, 1)), p0 = N(pc.v.pitch, 50);
          for (let i = 0; i < cols; i++) us.push((i - (cols - 1) / 2) * p0);
        }
        const tw = it.side === '腹' ? (isC ? t : 0) + tFill : t;
        const Lb = Math.ceil((tp + tw + 1.6 * d) / 5) * 5; // chiều dài bulông chuẩn (bội số 5 mm)
        const xc = xF + dirX * (tp - tw) / 2;
        const bs: Section = { id: `bolt:M${d}`, code: `M${d}`, type: 'Rod', h: d, b: d, tw: d / 2, tf: d / 2, c: 0, material: String(pc.v.boltType ?? 'BTN').replace(/^\d+-/, '') };
        for (let r = 0; r < rows; r++) {
          const yb = far - sg * ev - sg * r * pv;
          for (const du of us) {
            const ctr = add(add(add(C, mul(f.u, du)), mul(f.y, yb)), mul(f.x, xc));
            push(bar.kind, bs, add(ctr, mul(f.x, -Lb / 2)), add(ctr, mul(f.x, Lb / 2)), f.y, `M${d}`, it.id, 'bolt');
          }
        }
      }
    }
  }
  return { members: out, warn };
}

import type { Project } from './model';
/** ピース nhập tay của tab 母屋 + 胴縁 */
export function pcMembersOf(p: Project, all: Member[], only?: 'moya' | 'girt'): Member[] {
  return pcResultOf(p, all, only).members;
}
export function pcResultOf(p: Project, all: Member[], only?: 'moya' | 'girt', extra?: PcItem[]): PcResult {
  const res: PcResult = { members: [], warn: [] };
  const run = (d: { pcs?: PcItem[]; items: { id: string; member: string }[]; members: MoyaMember[]; pieces: MoyaPiece[]; parts: MoyaPart[] } | undefined, kind: string) => {
    const items = extra ?? d?.pcs ?? [];
    if (!d || !items.length) return;
    const r = pieceMembers(items, {
      all, bars: all.filter((m) => m.kind === kind), pieces: d.pieces, parts: d.parts,
      memberOf: (id) => { const it = d.items.find((x) => x.id === id); return d.members.find((m) => m.name === it?.member); },
    });
    res.members.push(...r.members);
    res.warn.push(...r.warn);
  };
  if (only !== 'girt') run(p.moya, 'purlin');
  if (only !== 'moya') run(p.girt, 'girt');
  return res;
}

/** Các 母屋 / 胴縁 giao với 親部材 (trong phạm vi đoạn 親部材) – dùng cho tuỳ chọn tự lấy */
export function autoTargets(p: Project, all: Member[], which: 'moya' | 'girt', it: Omit<PcItem, 'targets'>): string[] {
  const d = which === 'moya' ? p.moya : p.girt;
  if (!d) return [];
  const bz = buzaiMembers(all, it.buzai);
  const kind = which === 'moya' ? 'purlin' : 'girt';
  const out: string[] = [];
  for (const x of d.items) {
    if (bz.some((b) => b.source === x.id)) continue;
    const bars = all.filter((m) => m.kind === kind && m.source === x.id && m.part !== 'piece');
    const hit = bars.some((bar) => {
      const f = barFrame(bar);
      return bz.some((bm) => {
        const db = sub(bm.b, bm.a), Lb = Math.hypot(...db) || 1;
        const cl = closest(bar.a, f.u, bm.a, mul(db, 1 / Lb));
        if (!isFinite(cl.s) || cl.s < -60 || cl.s > f.L + 60 || cl.t < -60 || cl.t > Lb + 60) return false;
        // 親部材 gần cây (tối đa ~ nửa cao 2 cây + 1500)
        return cl.dist < (bm.section.h + bar.section.h) / 2 + 1500;
      });
    });
    if (hit) out.push(x.id);
  }
  return out;
}

/** Phân loại giao điểm 母屋 / 胴縁 × 親部材: đầu cây = コーナー, chỗ nối 2 đoạn = 接続, còn lại = 支持 */
export function autoPlan(p: Project, all: Member[], which: 'moya' | 'girt', kind: PcKind, base: Pick<PcItem, 'piece' | 'align' | 'side' | 'leg' | 'off'>): PcItem[] {
  const d = which === 'moya' ? p.moya : p.girt;
  if (!d) return [];
  const tk = which === 'moya' ? 'purlin' : 'girt';
  const plain = all.filter((m) => !m.part);
  const cand = which === 'moya'
    ? plain.filter((m) => m.kind === 'beam')
    : plain.filter((m) => m.kind === 'column' || m.kind === 'beam' || (m.kind === 'girt' && Math.abs(m.b[2] - m.a[2]) > Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1])));
  const keys = [...new Set(cand.map(buzaiKey))];
  const have = new Set((d.pcs ?? []).filter((x) => x.kind === kind).flatMap((x) => x.targets.map((t) => `${x.buzai}|${t}`)));
  const out: PcItem[] = [];
  for (const key of keys) {
    const bz = buzaiMembers(all, key);
    const targets: string[] = [];
    for (const x of d.items) {
      if (bz.some((b) => b.source === x.id) || have.has(`${key}|${x.id}`)) continue;
      const bars = all.filter((m) => m.kind === tk && m.source === x.id && !m.part);
      if (!bars.length) continue;
      const f0 = barFrame(bars[0]);
      const ts = bars.flatMap((m) => [dot(sub(m.a, bars[0].a), f0.u), dot(sub(m.b, bars[0].a), f0.u)]);
      const tmin = Math.min(...ts), tmax = Math.max(...ts);
      let cls: PcKind | null = null;
      for (const bar of bars) {
        const f = barFrame(bar);
        for (const bm of bz) {
          const db = sub(bm.b, bm.a), Lb = Math.hypot(...db) || 1;
          const cl = closest(bar.a, f.u, bm.a, mul(db, 1 / Lb));
          if (!isFinite(cl.s) || cl.s < -60 || cl.s > f.L + 60 || cl.t < -60 || cl.t > Lb + 60) continue;
          if (cl.dist > (bm.section.h + bar.section.h) / 2 + 1500) continue;
          const t = dot(sub(add(bar.a, mul(f.u, cl.s)), bars[0].a), f0.u);
          cls = t - tmin < 300 || tmax - t < 300 ? 'corner' : ts.some((q) => Math.abs(q - t) < 80 && q - tmin > 1 && tmax - q > 1) ? 'connect' : 'support';
        }
      }
      if (cls === kind) targets.push(x.id);
    }
    if (targets.length) out.push({ id: `auto-${out.length}`, kind, buzai: key, buzaiLabel: `${bz[0].mark ?? bz[0].name ?? ''}`, targets, ...base });
  }
  return out;
}
