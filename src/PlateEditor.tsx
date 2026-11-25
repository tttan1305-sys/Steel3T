// Vẽ tấm PL 2D kiểu AutoCAD: gõ lệnh hoặc bấm nút; bấm điểm, kéo chuột theo hướng, gõ chiều dài, Enter.
// Layer: 外形 (biên ngoài) · 穴 (lỗ) · 補助 (đường phụ, không ảnh hưởng hình dạng)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PlateEnt, PlateLayer, PLATE_LAYER_LABEL, PlateShape, plateGeometry, uid } from './model';
import { usePanZoom } from './panzoom';
import { P, Prim, add, angDeg, arcEnds, arcPt, crs, distPrim, dot, interPts, len, lineHits, lineLine, mul, nrm, openEnds, primsOf, spanOf, sub } from './plateCad';

/** Yêu cầu sửa tấm GPL tại một point: chỉnh trên bản nháp, bấm xác nhận mới ghi */
export interface PlateEditReq {
  plate: PlateShape;
  jointId: string;
  jointName: string;
  /** thao tác kèm khi xác nhận (gắn tấm vào point) */
  extra?: (d: import('./model').Project, plateId: string) => void;
}

export type Tool = 'line' | 'rect' | 'circle' | 'perp' | 'para' | 'angle' | 'offset' | 'trim' | 'extend' | 'fillet' | 'chamfer' | 'erase' | 'move' | 'copy' | 'cmark' | 'cline' | 'measure';
type MMode = 'dim' | 'par' | 'pt' | 'dist' | 'rad';
const TOOLS: { t: Tool; label: string; key: string; tip: string; grp: 'draw' | 'edit' | 'anno' }[] = [
  { t: 'line', label: 'Đường thẳng', key: 'L', tip: 'Bấm điểm đầu, kéo chuột theo hướng, gõ chiều dài rồi Enter', grp: 'draw' },
  { t: 'rect', label: 'Chữ nhật', key: 'REC', tip: 'Bấm góc 1, gõ rộng,cao (vd 200,150) hoặc bấm góc đối', grp: 'draw' },
  { t: 'circle', label: 'Tròn', key: 'C', tip: 'Bấm tâm, gõ bán kính (D để nhập đường kính)', grp: 'draw' },
  { t: 'perp', label: 'Vuông góc', key: 'VG', tip: 'Chọn đường tham chiếu, bấm điểm đầu, gõ chiều dài', grp: 'draw' },
  { t: 'para', label: 'Song song', key: 'SS', tip: 'Chọn đường tham chiếu, bấm điểm đầu, gõ chiều dài', grp: 'draw' },
  { t: 'angle', label: 'Góc theo đường', key: 'G', tip: 'Chọn đường tham chiếu, gõ góc, bấm điểm đầu, gõ chiều dài', grp: 'draw' },
  { t: 'offset', label: 'Offset', key: 'O', tip: 'Gõ khoảng cách, chọn đối tượng, bấm phía cần offset', grp: 'draw' },
  { t: 'trim', label: 'Trim', key: 'TR', tip: 'Bấm vào phần đường cần cắt bỏ (cắt tới các giao điểm)', grp: 'edit' },
  { t: 'extend', label: 'Extend', key: 'EX', tip: 'Bấm gần đầu đường cần kéo dài tới đường gần nhất', grp: 'edit' },
  { t: 'fillet', label: 'Fillet', key: 'F', tip: 'Gõ bán kính, chọn 2 đường – bo tròn góc', grp: 'edit' },
  { t: 'chamfer', label: 'Chamfer', key: 'CHA', tip: 'Gõ khoảng cách vát (vd 20 hoặc 20,30), chọn 2 đường', grp: 'edit' },
  { t: 'erase', label: 'Xoá', key: 'E', tip: 'Bấm vào đối tượng cần xoá', grp: 'edit' },
  { t: 'move', label: 'Di chuyển', key: 'M', tip: 'Chọn đối tượng, bấm điểm gốc, bấm điểm đến (hoặc gõ dx,dy)', grp: 'edit' },
  { t: 'copy', label: 'Sao chép', key: 'CO', tip: 'Chọn đối tượng, bấm điểm gốc, bấm các điểm đến (hoặc gõ dx,dy)', grp: 'edit' },
  { t: 'cmark', label: 'Tâm đường tròn', key: 'CM', tip: 'Bấm vào đường tròn / cung để vẽ dấu tâm', grp: 'anno' },
  { t: 'cline', label: 'Centerline', key: 'CL', tip: 'Chọn 2 đường để vẽ đường tâm ở giữa', grp: 'anno' },
  { t: 'measure', label: 'Đo', key: 'DI', tip: 'Đo khoảng cách 2 điểm / vuông góc / bán kính – đường kính', grp: 'anno' },
];
const ALIAS: Record<string, Tool> = {
  L: 'line', LINE: 'line', REC: 'rect', C: 'circle', CIRCLE: 'circle', VG: 'perp', SS: 'para', G: 'angle', O: 'offset', OFFSET: 'offset',
  TR: 'trim', TRIM: 'trim', EX: 'extend', EXTEND: 'extend', F: 'fillet', FILLET: 'fillet', CHA: 'chamfer', CHAMFER: 'chamfer',
  E: 'erase', ERASE: 'erase', M: 'move', MOVE: 'move', CO: 'copy', COPY: 'copy', CP: 'copy', CM: 'cmark', CENTERMARK: 'cmark', CL: 'cline', CENTERLINE: 'cline', DI: 'measure', DIST: 'measure', DO: 'measure', MEA: 'measure',
};
const MMODE_LABEL: Record<MMode, string> = { dim: 'Dim điểm → đường (D)', par: '① Giữa 2 mặt song song (S)', pt: '② Điểm ↔ mặt (V)', dist: 'Khoảng cách 2 điểm (K)', rad: 'Bán kính · đường kính (R)' };
const LAYER_COLOR: Record<PlateLayer, string> = { outline: '#0f172a', hole: '#dc2626', aux: '#94a3b8' };

const rot = (a: P, deg: number): P => {
  const r = (deg * Math.PI) / 180;
  return [a[0] * Math.cos(r) - a[1] * Math.sin(r), a[0] * Math.sin(r) + a[1] * Math.cos(r)];
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const rp = (p: P): P => [r2(p[0]), r2(p[1])];
const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString();
const angOf = (v: P) => r2((Math.atan2(v[1], v[0]) * 180) / Math.PI);
const mid = (a: P, b: P): P => mul(add(a, b), 0.5);
type Seg = Extract<Prim, { k: 'seg' }>;
type Arc = Extract<Prim, { k: 'arc' }>;

/** offset polyline sang trái (d > 0) / phải (d < 0) theo chiều vẽ */
function offsetPoly(pts: P[], closed: boolean, d: number): P[] {
  const n = pts.length;
  const segs: { p: P; u: P }[] = [];
  const m = closed ? n : n - 1;
  for (let i = 0; i < m; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const u = nrm(sub(b, a));
    segs.push({ p: add(a, mul([-u[1], u[0]], d)), u });
  }
  const out: P[] = [];
  for (let i = 0; i < n; i++) {
    const prev = closed ? segs[(i - 1 + m) % m] : segs[i - 1];
    const next = closed ? segs[i % m] : segs[i];
    if (prev && next) {
      const r = lineLine(prev.p, add(prev.p, prev.u), next.p, add(next.p, next.u));
      out.push(rp(r ? add(prev.p, mul(prev.u, r.t)) : add(pts[i], mul([-next.u[1], next.u[0]], d))));
    } else if (next) out.push(rp(next.p));
    else if (prev) out.push(rp(add(prev.p, mul(prev.u, len(sub(pts[i], pts[i - 1]))))));
  }
  return out;
}
/** tách polyline thành các đoạn rời (để trim / extend / fillet từng đoạn) */
function explodeIn(es: PlateEnt[], ids: string[]): { es: PlateEnt[]; segId: (entId: string, i: number) => string } {
  const map = new Map<string, string>();
  const out = es.flatMap((e) => {
    if (!ids.includes(e.id) || e.kind !== 'line') return [e];
    if (e.pts.length === 2 && !e.closed) {
      map.set(`${e.id}|0`, e.id);
      return [e];
    }
    const n = e.closed ? e.pts.length : e.pts.length - 1;
    return Array.from({ length: n }, (_, i) => {
      const id = uid('pe');
      map.set(`${e.id}|${i}`, id);
      return { ...e, id, pts: [e.pts[i], e.pts[(i + 1) % e.pts.length]], closed: false };
    });
  });
  return { es: out, segId: (entId, i) => map.get(`${entId}|${i}`) ?? '' };
}

export default function PlateEditor({ req, onSave, onClose, mode = 'plate', bg = [], bgText = [], bgStyle = [], bgFill = [], initTool, onLive, under }: { req: PlateEditReq; onSave: (pl: PlateShape) => void; onClose: () => void; mode?: 'plate' | 'aux'; bg?: [P, P][]; bgText?: { p: P; t: string; c?: string }[]; bgStyle?: string[]; bgFill?: P[][][]; initTool?: Tool; /** vẽ trực tiếp: lưu ngay mỗi thay đổi */ onLive?: (pl: PlateShape) => void; /** lớp hình nền vẽ sẵn (khung 2D) thay cho nét nền – nét nền vẫn dùng để bắt điểm */ under?: React.ReactNode }) {
  const aux = mode === 'aux';
  const bgEnts: PlateEnt[] = useMemo(() => bg.map(([a, b], i) => ({ id: `bg:${i}`, layer: 'aux', kind: 'line', pts: [a, b] })), [bg]);
  const bgPrims = useMemo(() => primsOf(bgEnts), [bgEnts]);
  // điểm bắt của nền tính một lần (giao điểm có lọc hộp bao cho nhanh)
  const bgSnap = useMemo(() => {
    const out: { p: P; k: 'end' | 'mid' | 'int' }[] = [];
    const box = bgPrims.map((p) => (p.k === 'seg' ? [Math.min(p.a[0], p.b[0]), Math.max(p.a[0], p.b[0]), Math.min(p.a[1], p.b[1]), Math.max(p.a[1], p.b[1])] : [p.c[0] - p.r, p.c[0] + p.r, p.c[1] - p.r, p.c[1] + p.r]));
    for (const p of bgPrims) if (p.k === 'seg') out.push({ p: p.a, k: 'end' }, { p: p.b, k: 'end' }, { p: mid(p.a, p.b), k: 'mid' });
    for (let i = 0; i < bgPrims.length; i++)
      for (let j = i + 1; j < bgPrims.length; j++) {
        const A = box[i], B = box[j];
        if (A[1] < B[0] - 1e-6 || B[1] < A[0] - 1e-6 || A[3] < B[2] - 1e-6 || B[3] < A[2] - 1e-6) continue;
        for (const x of interPts(bgPrims[i], bgPrims[j])) out.push({ p: x, k: 'int' });
      }
    return out;
  }, [bgPrims]);
  const [pl, setPl] = useState<PlateShape>(req.plate);
  const [hist, setHist] = useState<PlateEnt[][]>([]);
  const [dirty, setDirty] = useState(false);
  const liveRef = useRef(onLive);
  liveRef.current = onLive;
  useEffect(() => { if (dirty) liveRef.current?.(pl); }, [pl, dirty]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [layer, setLayer] = useState<PlateLayer>(mode === 'aux' ? 'aux' : 'outline');
  const [tool, setToolRaw] = useState<Tool | null>(initTool ?? 'line');
  const [lastTool, setLastTool] = useState<Tool>('line');
  const [pts, setPts] = useState<P[]>([]);
  const [ref, setRef] = useState<{ a: P; b: P } | null>(null);
  const [angD, setAngD] = useState<number | null>(null);
  const [val, setVal] = useState<number[] | null>(null); // offset d / fillet R / chamfer d1,d2
  const [defs, setDefs] = useState<Record<string, number[]>>({ offset: [10], fillet: [10], chamfer: [10, 10] });
  const [sel1, setSel1] = useState<{ p: Prim; q: P } | null>(null);
  const [offEnt, setOffEnt] = useState<PlateEnt | null>(null);
  const [lock, setLock] = useState<number | null>(null);
  const [mmode, setMmode] = useState<MMode>('dim');
  // bấm lệnh đo → mặc định Dim điểm → đường
  useEffect(() => { if (tool === 'measure') { setMmode('dim'); setSel1(null); setPtFirst(null); } }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps
  // đo điểm ↔ mặt: điểm chọn trước (rồi chọn mặt) – hoặc mặt chọn trước (sel1) rồi bấm điểm
  const [ptFirst, setPtFirst] = useState<P | null>(null);
  const [meas, setMeas] = useState<{ a: P; b: P; text: string } | null>(null);
  const [buf, setBuf] = useState('');
  const [log, setLog] = useState<string[]>(['Lệnh: L (đường thẳng) – bấm điểm đầu.']);
  const [raw, setRaw] = useState<P | null>(null);
  const [ortho, setOrtho] = useState(false);
  const [grid, setGrid] = useState(true);
  const [gsnap, setGsnap] = useState(1);
  const [showAxis, setShowAxis] = useState(true);
  const [dims, setDims] = useState(false);
  const [px, setPx] = useState(1);
  const [vb0] = useState(() => {
    const all = [...req.plate.ents, ...bg.map(([a, b]) => ({ kind: 'line', pts: [a, b] }) as PlateEnt)].flatMap((e) => (e.kind !== 'line' ? [add(e.pts[0], [e.r ?? 0, e.r ?? 0]), sub(e.pts[0], [e.r ?? 0, e.r ?? 0])] : e.pts));
    if (!all.length) return { x: -150, y: -250, w: 600, h: 500 };
    const xs = all.map((p) => p[0]), ys = all.map((p) => -p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(x1 - x0, 100) * 1.6, h = Math.max(y1 - y0, 100) * 1.6;
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
  });
  const pz = usePanZoom(svgRef, vb0, pl.id, { touchPan: false });

  const say = (s: string) => setLog((l) => [...l.slice(-2), s]);
  const commit = (fn: (ents: PlateEnt[]) => PlateEnt[]) => {
    setHist((h) => [...h.slice(-50), pl.ents]);
    setPl((x) => ({ ...x, ents: fn(x.ents) }));
    setDirty(true);
  };
  const undo = () => {
    if (pts.length) return setPts((p) => p.slice(0, -1));
    const h = hist[hist.length - 1];
    if (!h) return say('Không còn gì để hoàn tác.');
    setHist((x) => x.slice(0, -1));
    setPl((x) => ({ ...x, ents: h }));
    say('Đã hoàn tác.');
  };
  const reset = () => {
    setPts([]);
    setRef(null);
    setAngD(null);
    setVal(null);
    setSel1(null);
    setOffEnt(null);
    setLock(null);
    setBuf('');
  };
  // đổi lệnh từ thanh lệnh bên ngoài (CadBar)
  useEffect(() => { if (initTool) setTool(initTool); }, [initTool]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTool = (t: Tool | null) => {
    reset();
    setMeas(null);
    setToolRaw(t);
    if (t) {
      setLastTool(t);
      const d = TOOLS.find((x) => x.t === t)!;
      say(`Lệnh: ${d.label} (${d.key})`);
    }
  };
  const needVal = tool === 'offset' || tool === 'fillet' || tool === 'chamfer';

  // ---- primitive, bắt điểm (luôn bật: đầu/cuối, giữa, tâm, giao điểm) ----
  const tol = 10 * px;
  const ownPrims = primsOf(pl.ents);
  const prims = [...bgPrims, ...ownPrims];
  const ownOnly = tool === 'trim' || tool === 'extend' || tool === 'fillet' || tool === 'chamfer' || tool === 'erase' || tool === 'offset' || tool === 'cmark' || tool === 'move' || tool === 'copy';
  const snapPts: { p: P; k: 'end' | 'mid' | 'cen' | 'int' | 'wp' }[] = [{ p: [0, 0], k: 'wp' }, ...bgSnap];
  for (const p of ownPrims) {
    if (p.k === 'seg') snapPts.push({ p: p.a, k: 'end' }, { p: p.b, k: 'end' }, { p: mid(p.a, p.b), k: 'mid' });
    else {
      snapPts.push({ p: p.c, k: 'cen' });
      if (!p.full) {
        const [e0, e1] = arcEnds(p);
        snapPts.push({ p: e0, k: 'end' }, { p: e1, k: 'end' }, { p: arcPt(p.c, p.r, p.a0 + spanOf(p.a0, p.a1) / 2), k: 'mid' });
      } else for (const a of [0, 90, 180, 270]) snapPts.push({ p: arcPt(p.c, p.r, a), k: 'end' });
    }
  }
  for (let i = 0; i < ownPrims.length; i++) for (let j = 0; j < prims.length; j++) if (prims[j] !== ownPrims[i] && (j >= bgPrims.length ? j - bgPrims.length > i : true)) for (const x of interPts(ownPrims[i], prims[j])) snapPts.push({ p: x, k: 'int' });
  for (const p of pts) snapPts.push({ p, k: 'end' });
  const PRI = { end: 0, int: 0, cen: 1, wp: 1, mid: 2 };
  const snapAt = (q: P) => {
    let best: (typeof snapPts)[number] | null = null, bd = tol;
    for (const s of snapPts) {
      const d = len(sub(s.p, q)) + PRI[s.k] * 0.15 * tol;
      if (d < bd) (best = s), (bd = d);
    }
    return best;
  };
  const hitPrim = (q: P, kind: 'seg' | 'arc' | 'any'): Prim | null => {
    let best: Prim | null = null, bd = tol;
    for (const p of prims) {
      if (kind !== 'any' && p.k !== kind) continue;
      if (ownOnly && p.ent.id.startsWith('bg:')) continue;
      const d = distPrim(q, p);
      if (d < bd) (best = p), (bd = d);
    }
    return best;
  };
  const sn = raw ? snapAt(raw) : null;
  const gsn = (q: P): P => (gsnap > 0 ? [Math.round(q[0] / gsnap) * gsnap, Math.round(q[1] / gsnap) * gsnap] : rp(q));
  /** hướng bị khoá (vuông góc / song song / góc / khoá góc gõ tay) – dấu theo phía con trỏ */
  const lockedDir = (rq: P | null = raw): P | null => {
    const base = pts[pts.length - 1];
    if (!base) return null;
    let d: P | null = null;
    if (tool === 'line' && lock !== null) d = rot([1, 0], lock);
    if (ref && (tool === 'perp' || tool === 'para' || (tool === 'angle' && angD !== null))) {
      const u = nrm(sub(ref.b, ref.a));
      d = tool === 'para' ? u : tool === 'perp' ? [-u[1], u[0]] : rot(u, angD!);
    }
    if (!d) return null;
    const c = rq ?? base;
    return dot(sub(c, base), d) < 0 ? mul(d, -1) : d;
  };
  /** điểm con trỏ sau khi bắt điểm / lưới / ortho / khoá hướng */
  const cursorAt = (rq: P | null): P | null => {
    if (!rq) return null;
    const s0 = snapAt(rq);
    let q: P = s0 ? s0.p : gsn(rq);
    const base = pts[pts.length - 1];
    const dir = lockedDir(rq);
    if (base && dir) q = rp(add(base, mul(dir, dot(sub(q, base), dir))));
    else if (base && ortho && (tool === 'line' || tool === 'measure' || tool === 'move' || tool === 'copy') && !s0) {
      const d = sub(q, base);
      q = Math.abs(d[0]) >= Math.abs(d[1]) ? [q[0], base[1]] : [base[0], q[1]];
    }
    return q;
  };
  const cur = cursorAt(raw);
  /** loại đối tượng đang chờ chọn */
  const pickKind = ((): 'seg' | 'arc' | 'any' | 'ent' | null => {
    if (tool === 'perp' || tool === 'para' || tool === 'angle') return ref ? null : 'seg';
    if (tool === 'offset') return val && !offEnt ? 'ent' : null;
    if (tool === 'erase') return 'ent';
    if (tool === 'move' || tool === 'copy') return offEnt ? null : 'ent';
    if (tool === 'trim') return 'any';
    if (tool === 'extend') return 'seg';
    if (tool === 'fillet' || tool === 'chamfer') return val ? 'seg' : null;
    if (tool === 'cmark') return 'arc';
    if (tool === 'cline') return 'seg';
    if (tool === 'measure') return mmode === 'rad' ? 'arc' : mmode === 'par' ? 'seg' : mmode === 'pt' || mmode === 'dim' ? (sel1 ? null : 'seg') : pts.length ? null : 'seg';
    return null;
  })();
  const hov = raw && pickKind ? hitPrim(raw, pickKind === 'ent' ? 'any' : pickKind) : null;

  // ---- thao tác sửa ----
  const replaceSeg = (es: PlateEnt[], s: Seg, pieces: P[][]) => {
    const x = explodeIn(es, [s.ent.id]);
    const id = x.segId(s.ent.id, s.i);
    const base = x.es.find((e) => e.id === id)!;
    return x.es.flatMap((e) => (e.id === id ? pieces.map((pc) => ({ ...base, id: uid('pe'), pts: pc.map(rp), closed: false })) : [e]));
  };
  const doTrim = (p: Prim, q: P) => {
    const others = prims.filter((o) => o !== p);
    if (p.k === 'seg') {
      const d = sub(p.b, p.a);
      const tc = Math.max(0, Math.min(1, dot(sub(q, p.a), d) / dot(d, d)));
      const ts = others.flatMap((o) => lineHits(p.a, p.b, o)).filter((t) => t > 1e-6 && t < 1 - 1e-6);
      const t0 = Math.max(0, ...ts.filter((t) => t < tc)), t1 = Math.min(1, ...ts.filter((t) => t > tc));
      const at = (t: number) => add(p.a, mul(d, t));
      const pieces: P[][] = [];
      if (t0 > 0) pieces.push([p.a, at(t0)]);
      if (t1 < 1) pieces.push([at(t1), p.b]);
      commit((es) => replaceSeg(es, p, pieces));
      return say(ts.length ? `Đã cắt đoạn dài ${fmt(len(d) * (t1 - t0))}.` : 'Không có đường cắt – đã xoá cả đoạn.');
    }
    const ac = angDeg(sub(q, p.c));
    const angs = others.flatMap((o) => interPts(p, o)).map((x) => angDeg(sub(x, p.c)));
    if (p.full) {
      if (angs.length < 2) return say('Đường tròn cần ít nhất 2 giao điểm để trim.');
      const s = angs.map((a) => ({ a, s: (((a - ac) % 360) + 360) % 360 }));
      const next = s.reduce((m, x) => (x.s > 1e-6 && x.s < m.s ? x : m), { a: 0, s: 999 }).a;
      const prev = s.reduce((m, x) => (x.s > m.s ? x : m), { a: 0, s: -1 }).a;
      commit((es) => es.map((e) => (e.id === p.ent.id ? { ...e, kind: 'arc' as const, a0: r2(next), a1: r2(prev) } : e)));
      return say('Đã cắt đường tròn thành cung.');
    }
    const span = spanOf(p.a0, p.a1);
    const sc = (((ac - p.a0) % 360) + 360) % 360;
    const ss = angs.map((a) => (((a - p.a0) % 360) + 360) % 360).filter((s) => s > 1e-6 && s < span - 1e-6);
    const s0 = Math.max(0, ...ss.filter((s) => s < sc)), s1 = Math.min(span, ...ss.filter((s) => s > sc));
    const pieces: PlateEnt[] = [];
    if (s0 > 0) pieces.push({ ...p.ent, id: uid('pe'), a0: p.a0, a1: r2(p.a0 + s0) });
    if (s1 < span) pieces.push({ ...p.ent, id: uid('pe'), a0: r2(p.a0 + s1), a1: p.a1 });
    commit((es) => es.flatMap((e) => (e.id === p.ent.id ? pieces : [e])));
    say(ss.length ? 'Đã cắt cung.' : 'Không có đường cắt – đã xoá cung.');
  };
  const doExtend = (p: Seg, q: P) => {
    const others = prims.filter((o) => o !== p);
    const d = sub(p.b, p.a);
    const atB = dot(sub(q, p.a), d) / dot(d, d) >= 0.5;
    const ts = others.flatMap((o) => lineHits(p.a, p.b, o));
    const t = atB ? Math.min(...ts.filter((x) => x > 1 + 1e-6)) : Math.max(...ts.filter((x) => x < -1e-6));
    if (!isFinite(t)) return say('Không có đường nào để kéo dài tới.');
    const np = add(p.a, mul(d, t));
    commit((es) => replaceSeg(es, p, [atB ? [p.a, np] : [np, p.b]]));
    say(`Đã kéo dài thêm ${fmt(len(d) * (atB ? t - 1 : -t))}.`);
  };
  const doCorner = (s1: Seg, q1: P, s2: Seg, q2: P) => {
    const r = lineLine(s1.a, s1.b, s2.a, s2.b);
    if (!r) return say('Hai đường song song – không bo / vát được.');
    const P0 = add(s1.a, mul(sub(s1.b, s1.a), r.t));
    const side = (s: Seg, q: P): P => {
      const d = nrm(sub(s.b, s.a));
      return dot(sub(q, P0), d) >= 0 ? d : mul(d, -1);
    };
    const u1 = side(s1, q1), u2 = side(s2, q2);
    const far = (s: Seg, u: P) => (dot(sub(s.a, P0), u) >= dot(sub(s.b, P0), u) ? s.a : s.b);
    const e1 = far(s1, u1), e2 = far(s2, u2);
    const L1 = dot(sub(e1, P0), u1), L2 = dot(sub(e2, P0), u2);
    let T1: P = P0, T2: P = P0, extraEnt: PlateEnt | null = null;
    if (tool === 'fillet') {
      const R = val![0];
      const th = Math.acos(Math.max(-1, Math.min(1, dot(u1, u2))));
      if (R > 0) {
        if (th < 1e-3 || th > Math.PI - 1e-3) return say('Góc không hợp lệ để bo tròn.');
        const dd = R / Math.tan(th / 2);
        if (dd > L1 + 1e-6 || dd > L2 + 1e-6) return say(`Bán kính ${R} quá lớn so với đường.`);
        T1 = add(P0, mul(u1, dd));
        T2 = add(P0, mul(u2, dd));
        const C = add(P0, mul(nrm(add(u1, u2)), R / Math.sin(th / 2)));
        const g1 = angDeg(sub(T1, C)), g2 = angDeg(sub(T2, C));
        const [a0, a1] = spanOf(g1, g2) <= 180 ? [g1, g2] : [g2, g1];
        extraEnt = { id: uid('pe'), layer: s1.ent.layer, kind: 'arc', pts: [rp(C)], r: R, a0: r2(a0), a1: r2(a1) };
      }
    } else {
      const [d1, d2] = [val![0], val![1] ?? val![0]];
      if (d1 > L1 + 1e-6 || d2 > L2 + 1e-6) return say('Khoảng cách vát quá lớn so với đường.');
      T1 = add(P0, mul(u1, d1));
      T2 = add(P0, mul(u2, d2));
      if (d1 > 0 || d2 > 0) extraEnt = { id: uid('pe'), layer: s1.ent.layer, kind: 'line', pts: [rp(T1), rp(T2)], closed: false };
    }
    commit((es) => {
      const x = explodeIn(es, [s1.ent.id, s2.ent.id]);
      const id1 = x.segId(s1.ent.id, s1.i), id2 = x.segId(s2.ent.id, s2.i);
      const out = x.es.map((e) => (e.id === id1 ? { ...e, pts: [rp(e1), rp(T1)] } : e.id === id2 ? { ...e, pts: [rp(e2), rp(T2)] } : e));
      return extraEnt ? [...out, extraEnt] : out;
    });
    say(tool === 'fillet' ? `Đã bo tròn R${val![0]}.` : `Đã vát ${val![0]} × ${val![1] ?? val![0]}.`);
  };

  // ---- lời nhắc ----
  const prompt = (): string => {
    switch (tool) {
      case 'line':
        return pts.length ? `Điểm tiếp theo – kéo chuột theo hướng rồi gõ chiều dài · dài<góc · <góc khoá góc · [C khép kín / U lùi / Enter kết thúc]${lock !== null ? ` · đang khoá ${lock}°` : ''}` : 'Bấm điểm đầu';
      case 'rect':
        return pts.length ? 'Gõ rộng,cao (vd 200,150) hoặc bấm góc đối' : 'Bấm góc thứ nhất';
      case 'circle':
        return pts.length ? 'Gõ bán kính (vd 9) hoặc D + đường kính (vd D22), hoặc bấm' : 'Bấm tâm';
      case 'perp':
      case 'para':
        return !ref ? 'Chọn đường tham chiếu' : pts.length ? 'Kéo chuột về phía cần vẽ, gõ chiều dài rồi Enter (hoặc bấm)' : `Bấm điểm đầu của đường ${tool === 'perp' ? 'vuông góc' : 'song song'}`;
      case 'angle':
        return !ref ? 'Chọn đường tham chiếu' : angD === null ? 'Gõ góc so với đường đã chọn (vd 30) rồi Enter' : pts.length ? `Kéo chuột về phía cần vẽ, gõ chiều dài (góc ${angD}°) rồi Enter` : `Bấm điểm đầu (góc ${angD}°)`;
      case 'offset':
        return !val ? `Gõ khoảng cách offset <${defs.offset[0]}> rồi Enter` : !offEnt ? `Chọn đối tượng cần offset (khoảng cách ${val[0]})` : 'Bấm phía cần offset';
      case 'trim':
        return 'Bấm vào phần đường cần cắt bỏ (cắt tới giao điểm gần nhất)';
      case 'extend':
        return 'Bấm gần đầu đường cần kéo dài';
      case 'fillet':
        return !val ? `Gõ bán kính bo <${defs.fillet[0]}> rồi Enter (0 = nối góc nhọn)` : !sel1 ? `Chọn đường thứ nhất (R${val[0]})` : 'Chọn đường thứ hai';
      case 'chamfer':
        return !val ? `Gõ khoảng cách vát <${defs.chamfer.join(',')}> (vd 20 hoặc 20,30) rồi Enter` : !sel1 ? `Chọn đường thứ nhất (vát ${val.join(' × ')})` : 'Chọn đường thứ hai';
      case 'erase':
        return 'Bấm vào đối tượng cần xoá';
      case 'move':
      case 'copy':
        return !offEnt ? `Chọn đối tượng cần ${tool === 'move' ? 'di chuyển' : 'sao chép'}` : !pts.length ? 'Bấm điểm gốc' : 'Bấm điểm đến hoặc gõ dx,dy rồi Enter';
      case 'cmark':
        return 'Bấm vào đường tròn / cung để vẽ dấu tâm';
      case 'cline':
        return !sel1 ? 'Chọn đường thứ nhất' : 'Chọn đường thứ hai';
      case 'measure':
        return mmode === 'rad'
          ? 'Bấm vào đường tròn / cung · [K khoảng cách / V vuông góc]'
          : mmode === 'par'
            ? !sel1
              ? 'Chọn mặt (cạnh) thứ nhất · [V điểm ↔ mặt / K 2 điểm / R bán kính]'
              : 'Chọn mặt (cạnh) thứ hai song song – đo khoảng cách vuông góc giữa 2 mặt'
            : mmode === 'pt' || mmode === 'dim'
            ? sel1
              ? 'Bấm điểm để đo khoảng cách vuông góc tới mặt đã chọn'
              : ptFirst
                ? 'Chọn mặt (cạnh) để đo từ điểm đã bấm'
                : 'Bấm vào mặt (cạnh) rồi bấm điểm – hoặc bấm điểm (đầu mút / giao điểm) rồi chọn mặt'
            : pts.length
              ? 'Bấm điểm thứ hai'
              : 'Bấm điểm thứ nhất (rê lên cạnh để xem chiều dài) · [V vuông góc / R bán kính]';
      default:
        return 'Gõ lệnh: L REC C VG SS G O · TR EX F CHA E · CM CL DI · Enter = lặp lệnh trước';
    }
  };
  const addLine = (a: P, b: P, extra: Partial<PlateEnt> = {}) => commit((es) => [...es, { id: uid('pe'), layer, kind: 'line', pts: [rp(a), rp(b)], closed: false, ...extra }]);
  const finishPoly = (closed: boolean, list = pts) => {
    if (list.length >= 2) {
      commit((es) => [...es, { id: uid('pe'), layer, kind: 'line', pts: list.map(rp), closed: closed && list.length >= 3 }]);
      say(closed ? 'Đã khép kín.' : `Đã vẽ ${list.length - 1} đoạn.`);
    }
    setPts([]);
    setLock(null);
  };
  /** di chuyển / sao chép đối tượng đang chọn theo vectơ d */
  const moveBy = (d: P) => {
    const e = offEnt;
    if (!e) return;
    const ne: PlateEnt = { ...e, pts: e.pts.map((p) => rp(add(p, d))) };
    if (tool === 'move') {
      commit((es) => es.map((x) => (x.id === e.id ? ne : x)));
      say(`Đã di chuyển ${fmt(len(d))}.`);
      reset();
    } else {
      commit((es) => [...es, { ...ne, id: uid('pe') }]);
      say(`Đã sao chép (${fmt(d[0])}, ${fmt(d[1])}) – bấm tiếp điểm đến hoặc Esc.`);
    }
  };
  const point = (q: P, rq: P | null = raw) => {
    const c = rq ?? q;
    const pick = (k: 'seg' | 'arc' | 'any') => hitPrim(c, k);
    switch (tool) {
      case 'line':
        if (pts.length >= 3 && len(sub(q, pts[0])) < 1e-6) return finishPoly(true);
        setPts([...pts, rp(q)]);
        setLock(null);
        return;
      case 'rect':
        if (!pts.length) return setPts([q]);
        if (pts[0][0] !== q[0] && pts[0][1] !== q[1]) {
          const a = pts[0];
          commit((es) => [...es, { id: uid('pe'), layer, kind: 'line', closed: true, pts: [a, [q[0], a[1]] as P, q, [a[0], q[1]] as P].map(rp) }]);
          say(`Chữ nhật ${fmt(Math.abs(q[0] - a[0]))} × ${fmt(Math.abs(q[1] - a[1]))}`);
        }
        return setPts([]);
      case 'circle': {
        if (!pts.length) return setPts([q]);
        const r = len(sub(q, pts[0]));
        if (r > 0) commit((es) => [...es, { id: uid('pe'), layer, kind: 'circle', pts: [rp(pts[0])], r: r2(r) }]);
        say(`Tròn R${fmt(r)}`);
        return setPts([]);
      }
      case 'perp':
      case 'para':
      case 'angle': {
        if (!ref) {
          const s = pick('seg') as Seg | null;
          if (!s) return say('Chưa chọn được đường – bấm đúng vào một đoạn thẳng.');
          setRef({ a: s.a, b: s.b });
          return say(`Đã chọn đường dài ${fmt(len(sub(s.b, s.a)))}.`);
        }
        if (tool === 'angle' && angD === null) return say('Gõ góc trước rồi Enter.');
        if (!pts.length) return setPts([q]);
        addLine(pts[0], q);
        say(`Đã vẽ đường dài ${fmt(len(sub(q, pts[0])))}.`);
        return setPts([]);
      }
      case 'move':
      case 'copy': {
        if (!offEnt) {
          const p = pick('any');
          if (!p || p.ent.id.startsWith('bg:')) return say('Chưa chọn được đối tượng (chỉ chọn được 補助線 đã vẽ).');
          setOffEnt(p.ent);
          return say('Bấm điểm gốc.');
        }
        if (!pts.length) return setPts([q]);
        moveBy(sub(q, pts[0]));
        return;
      }
      case 'offset': {
        if (!val) return say('Gõ khoảng cách trước rồi Enter.');
        const D = val[0];
        if (!offEnt) {
          const p = pick('any');
          if (!p) return say('Chưa chọn được đối tượng.');
          return setOffEnt(p.ent);
        }
        const e = offEnt;
        if (e.kind !== 'line') {
          const out = len(sub(c, e.pts[0])) > (e.r ?? 0);
          const r = (e.r ?? 0) + (out ? D : -D);
          if (r > 0) commit((es) => [...es, { ...e, id: uid('pe'), r: r2(r) }]);
        } else {
          const ss = primsOf([e]) as Seg[];
          let s = ss[0], bd = Infinity;
          for (const x of ss) {
            const d = distPrim(c, x);
            if (d < bd) (bd = d), (s = x);
          }
          const side = crs(sub(s.b, s.a), sub(c, s.a)) > 0 ? 1 : -1;
          commit((es) => [...es, { ...e, id: uid('pe'), pts: offsetPoly(e.pts, !!e.closed, side * D) }]);
        }
        say(`Đã offset ${D}. Chọn đối tượng tiếp hoặc Esc.`);
        return setOffEnt(null);
      }
      case 'trim': {
        const p = pick('any');
        if (!p) return say('Không có đường tại đây.');
        return doTrim(p, c);
      }
      case 'extend': {
        const p = pick('seg') as Seg | null;
        if (!p) return say('Chọn một đoạn thẳng.');
        return doExtend(p, c);
      }
      case 'fillet':
      case 'chamfer': {
        if (!val) return say('Gõ giá trị trước rồi Enter.');
        const p = pick('seg') as Seg | null;
        if (!p) return say('Chọn một đoạn thẳng.');
        if (!sel1) return setSel1({ p, q: c });
        if (sel1.p === p || (sel1.p.ent.id === p.ent.id && sel1.p.i === p.i)) return say('Chọn đường khác.');
        doCorner(sel1.p as Seg, sel1.q, p, c);
        return setSel1(null);
      }
      case 'erase': {
        const p = pick('any');
        if (!p) return say('Không có đối tượng tại đây.');
        commit((es) => es.filter((x) => x.id !== p.ent.id));
        return say('Đã xoá 1 đối tượng.');
      }
      case 'cmark': {
        const p = pick('arc') as Arc | null;
        if (!p) return say('Bấm vào đường tròn hoặc cung.');
        const e = Math.max(3, p.r * 0.25);
        commit((es) => [
          ...es,
          { id: uid('pe'), layer: 'aux', kind: 'line', ltype: 'center', pts: [rp([p.c[0] - p.r - e, p.c[1]]), rp([p.c[0] + p.r + e, p.c[1]])] },
          { id: uid('pe'), layer: 'aux', kind: 'line', ltype: 'center', pts: [rp([p.c[0], p.c[1] - p.r - e]), rp([p.c[0], p.c[1] + p.r + e])] },
        ]);
        return say(`Đã vẽ dấu tâm (R${fmt(p.r)}).`);
      }
      case 'cline': {
        const p = pick('seg') as Seg | null;
        if (!p) return say('Chọn một đoạn thẳng.');
        if (!sel1) return setSel1({ p, q: c });
        const s1 = sel1.p as Seg;
        let [a2, b2] = [p.a, p.b];
        if (len(sub(s1.a, a2)) + len(sub(s1.b, b2)) > len(sub(s1.a, b2)) + len(sub(s1.b, a2))) [a2, b2] = [b2, a2];
        const st = mid(s1.a, a2), en = mid(s1.b, b2), u = nrm(sub(en, st));
        addLine(add(st, mul(u, -5)), add(en, mul(u, 5)), { layer: 'aux', ltype: 'center' });
        say(`Đã vẽ đường tâm dài ${fmt(len(sub(en, st)))}.`);
        return setSel1(null);
      }
      case 'measure': {
        if (mmode === 'rad') {
          const p = pick('arc') as Arc | null;
          if (!p) return say('Bấm vào đường tròn hoặc cung.');
          const t = `R ${fmt(p.r)} · Ø ${fmt(2 * p.r)}${p.full ? '' : ` · cung ${fmt(spanOf(p.a0, p.a1))}° dài ${fmt((Math.PI * p.r * spanOf(p.a0, p.a1)) / 180)}`}`;
          setMeas({ a: p.c, b: arcPt(p.c, p.r, angDeg(sub(c, p.c))), text: t });
          return say(`Đo: ${t}`);
        }
        if (mmode === 'par') {
          const p = pick('seg') as Seg | null;
          if (!p) return say('Bấm vào một cạnh (mặt) thẳng.');
          if (!sel1) { setMeas(null); return setSel1({ p, q: c }); }
          const s1 = sel1.p as Seg, u = nrm(sub(s1.b, s1.a)), u2 = nrm(sub(p.b, p.a));
          setSel1(null);
          if (Math.abs(u[0] * u2[1] - u[1] * u2[0]) > 0.02) return say('2 mặt không song song – chọn lại mặt thứ nhất.');
          // chân đường vuông góc từ điểm bấm trên mặt 2 xuống mặt 1
          const q2 = add(p.a, mul(u2, Math.max(0, Math.min(len(sub(p.b, p.a)), dot(sub(c, p.a), u2)))));
          const foot = add(s1.a, mul(u, dot(sub(q2, s1.a), u)));
          const t = `2 mặt song song: ${fmt(len(sub(q2, foot)))} mm`;
          setMeas({ a: foot, b: q2, text: fmt(len(sub(q2, foot))) });
          return say(`Đo: ${t}`);
        }
        if (mmode === 'pt' || mmode === 'dim') {
          const toSeg = (s: Seg, x: P) => {
            const u = nrm(sub(s.b, s.a));
            const foot = add(s.a, mul(u, dot(sub(x, s.a), u)));
            const t = `điểm ↔ mặt ${fmt(len(sub(x, foot)))} mm`;
            if (mmode === 'dim') {
              // ghi kích thước lại trên bản vẽ
              commit((es) => [...es, { id: uid('pe'), layer: 'aux', kind: 'dim', pts: [rp(foot), rp(x)] }]);
              setMeas(null);
              return say(`Dim: ${fmt(len(sub(x, foot)))} mm (bấm tiếp đường / điểm để ghi tiếp)`);
            }
            setMeas({ a: foot, b: x, text: fmt(len(sub(x, foot))) });
            say(`Đo: ${t}`);
          };
          if (sel1) { toSeg(sel1.p as Seg, q); return setSel1(null); }
          if (ptFirst) {
            const p = pick('seg') as Seg | null;
            if (!p) return say('Bấm vào một cạnh (mặt) thẳng.');
            toSeg(p, ptFirst);
            return setPtFirst(null);
          }
          // bấm trúng điểm bắt (đầu mút / giữa / giao / tâm) = chọn điểm trước; bấm trên cạnh = chọn mặt trước
          const p = snapAt(c) ? null : (pick('seg') as Seg | null);
          setMeas(null);
          if (p) return setSel1({ p, q: c });
          return setPtFirst(q);
        }
        if (!pts.length) {
          setMeas(null);
          return setPts([q]);
        }
        const t = `dài ${fmt(len(sub(q, pts[0])))} mm · góc ${fmt(angOf(sub(q, pts[0])))}°`;
        setMeas({ a: pts[0], b: q, text: fmt(len(sub(q, pts[0]))) });
        say(`Đo: ${t}`);
        return setPts([]);
      }
    }
  };
  /** chiều dài gõ tay → điểm theo hướng con trỏ (hoặc hướng khoá) */
  const byLength = (L: number) => {
    const base = pts[pts.length - 1];
    if (!base) return say('Bấm điểm đầu trước.');
    const d = lockedDir() ?? (cur && len(sub(cur, base)) > 1e-6 ? nrm(sub(cur, base)) : ([1, 0] as P));
    point(add(base, mul(d, L)));
  };
  const exec = (txt: string) => {
    const t = txt.trim().toUpperCase().replace(/\s+/g, '');
    setBuf('');
    if (!t) {
      // Enter rỗng: kết thúc / dùng giá trị mặc định / lặp lệnh trước
      if (tool === 'line' && pts.length >= 2) return finishPoly(false);
      if (needVal && !val) return setVal(defs[tool!]);
      if (!tool) return setTool(lastTool);
      if (!pts.length && !ref && !sel1 && !offEnt) return setTool(null);
      reset();
      return;
    }
    const num = /^-?\d+(\.\d+)?$/.test(t) ? +t : null;
    if (tool === 'line' && pts.length) {
      if (t === 'C') return finishPoly(true);
      if (t === 'U') return setPts(pts.slice(0, -1));
      const la = t.match(/^(\d+(?:\.\d+)?)?<(-?\d+(?:\.\d+)?)$/);
      if (la) {
        if (la[1]) point(add(pts[pts.length - 1], mul(rot([1, 0], +la[2]), +la[1])));
        else {
          setLock(+la[2]);
          say(`Khoá góc ${la[2]}° – kéo chuột và gõ chiều dài.`);
        }
        return;
      }
      if (num !== null) return byLength(num);
    }
    if (tool === 'rect' && pts.length) {
      const m = t.match(/^(\d+(?:\.\d+)?)[,X*](\d+(?:\.\d+)?)$/);
      if (m) {
        const a = pts[0], c = cur ?? add(a, [1, 1]);
        const sx = c[0] >= a[0] ? 1 : -1, sy = c[1] >= a[1] ? 1 : -1;
        return point([a[0] + sx * +m[1], a[1] + sy * +m[2]]);
      }
    }
    if (tool === 'circle' && pts.length) {
      const m = t.match(/^(D)?(\d+(?:\.\d+)?)$/);
      if (m) {
        const r = m[1] ? +m[2] / 2 : +m[2];
        commit((es) => [...es, { id: uid('pe'), layer, kind: 'circle', pts: [rp(pts[0])], r }]);
        say(`Tròn R${fmt(r)}`);
        return setPts([]);
      }
    }
    if ((tool === 'move' || tool === 'copy') && offEnt && pts.length) {
      const m = t.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
      if (m) return moveBy([+m[1], +m[2]]);
      if (num !== null && cur) { const d = nrm(sub(cur, pts[0])); return moveBy(mul(d, num)); }
    }
    if (tool === 'angle' && ref && angD === null && num !== null) {
      setAngD(num);
      return say(`Góc ${num}° so với đường đã chọn.`);
    }
    if ((tool === 'perp' || tool === 'para' || tool === 'angle') && pts.length && num !== null) return byLength(num);
    if (needVal && !val) {
      const m = t.match(/^(\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?))?$/);
      if (m) {
        const v = tool === 'chamfer' ? [+m[1], m[2] !== undefined ? +m[2] : +m[1]] : [+m[1]];
        setVal(v);
        setDefs((d) => ({ ...d, [tool!]: v }));
        return;
      }
    }
    if (tool === 'measure' && (t === 'K' || t === 'V' || t === 'R' || t === 'S' || t === 'D')) {
      setMmode(t === 'K' ? 'dist' : t === 'V' ? 'pt' : t === 'S' ? 'par' : t === 'D' ? 'dim' : 'rad');
      setPts([]);
      setSel1(null);
      setPtFirst(null);
      return;
    }
    if (t === 'U' || t === 'UNDO') return undo();
    const al = ALIAS[t];
    if (al) return setTool(al);
    say(`Không hiểu "${txt}". ${prompt()}`);
  };

  // ---- bàn phím: gõ ở đâu cũng vào dòng lệnh (giống AutoCAD) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tg = el?.tagName;
      // ô nhập chữ / số giữ phím cho riêng nó; checkbox / nút thì phím vẫn vào dòng lệnh
      if ((tg === 'INPUT' && !['checkbox', 'radio', 'button'].includes((el as HTMLInputElement).type)) || tg === 'SELECT' || tg === 'TEXTAREA') return;
      if (tg === 'INPUT' || tg === 'BUTTON') el.blur();
      if (e.key === 'F8') return e.preventDefault(), setOrtho((o) => !o);
      if (e.key === 'F7') return e.preventDefault(), setGrid((o) => !o);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') return e.preventDefault(), undo();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (buf) return setBuf('');
        reset();
        setMeas(null);
        setToolRaw(null);
        return say('*Huỷ*');
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        return exec(buf);
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        return setBuf((b) => b.slice(0, -1));
      }
      if (e.key.length === 1 && /[0-9a-zA-Z.,<*-]/.test(e.key)) {
        e.preventDefault();
        setBuf((b) => b + e.key.toUpperCase());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // tỉ lệ mm / pixel cập nhật ngay khi mở / phóng to (không đợi di chuột)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const rc = svg.getBoundingClientRect();
    if (!rc.width || !rc.height) return;
    const [, , w, h] = pz.viewBox.split(' ').map(Number);
    const s = Math.max(w / rc.width, h / rc.height);
    if (s > 0 && Math.abs(s - px) > px * 0.01) setPx(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pz.viewBox]);
  const toMm = (e: React.MouseEvent): P | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(ctm.inverse());
    const rc = svg.getBoundingClientRect();
    const [, , w, h] = pz.viewBox.split(' ').map(Number);
    const s = Math.max(w / rc.width, h / rc.height);
    if (Math.abs(s - px) > px * 0.01) setPx(s);
    return [r.x, -r.y];
  };
  const onClick = (e: React.MouseEvent) => {
    const rq = toMm(e);
    if (rq) setRaw(rq);
    const q = cursorAt(rq);
    if (tool && q) point(q, rq);
  };

  // ---- vẽ ----
  const g = plateGeometry(pl);
  // biên dạng phải kín: layer 外形 và 穴 không được có đầu hở
  const openOut = openEnds(pl.ents.filter((e) => e.layer === 'outline'));
  const openHole = openEnds(pl.ents.filter((e) => e.layer === 'hole'));
  const errs: string[] = [];
  if (!aux && !g.outer) errs.push('Layer 外形 chưa có biên dạng kín.');
  if (!aux && openOut.length) errs.push(`Layer 外形 còn ${openOut.length} đầu hở.`);
  if (!aux && openHole.length) errs.push(`Layer 穴 còn ${openHole.length} đầu hở.`);
  const trySave = () => {
    if (errs.length) return say(`Không lưu được: ${errs.join(' ')} Các chỗ hở được đánh dấu đỏ.`);
    onSave(pl);
  };
  const poly = (ps: P[]) => ps.map(([x, y]) => `${x},${-y}`).join(' ');
  const path = g.outer
    ? `M${poly(g.outer).split(' ').join(' L')} Z ` +
      g.holes.map((h) => `M${h.c[0] + h.r},${-h.c[1]} a${h.r},${h.r} 0 1,0 ${-2 * h.r},0 a${h.r},${h.r} 0 1,0 ${2 * h.r},0 Z`).join(' ') +
      g.holePolys.map((hp) => `M${poly(hp).split(' ').join(' L')} Z`).join(' ')
    : '';
  const area = g.outer
    ? Math.abs(g.outer.reduce((a, [x, y], i) => { const [x2, y2] = g.outer![(i + 1) % g.outer!.length]; return a + x * y2 - x2 * y; }, 0) / 2) -
      g.holes.reduce((a, h) => a + Math.PI * h.r * h.r, 0) -
      g.holePolys.reduce((a, hp) => a + Math.abs(hp.reduce((s, [x, y], i) => { const [x2, y2] = hp[(i + 1) % hp.length]; return s + x * y2 - x2 * y; }, 0) / 2), 0)
    : 0;
  const fs = 12 * px;
  const base = pts[pts.length - 1];
  const live = base && cur ? `dài ${fmt(len(sub(cur, base)))} · góc ${fmt(angOf(sub(cur, base)))}°` : hov && tool === 'measure' ? (hov.k === 'seg' ? `cạnh dài ${fmt(len(sub(hov.b, hov.a)))} mm` : `R ${fmt(hov.r)} · Ø ${fmt(2 * hov.r)}`) : '';
  const dimLabel = (a: P, b: P, color = '#0369a1', key?: string, text?: string) => {
    const m = mid(a, b), d = nrm(sub(b, a)), n: P = [-d[1], d[0]];
    const o = add(m, mul(n, 1.2 * fs));
    let ang = (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    return (
      <text key={key} x={o[0]} y={-o[1]} fontSize={fs} fill={color} textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${o[0]} ${-o[1]})`} style={{ pointerEvents: 'none' }}>
        {text ?? fmt(len(sub(b, a)))}
      </text>
    );
  };
  const arcPath = (c: P, r: number, a0: number, a1: number) => {
    const s = arcPt(c, r, a0), e = arcPt(c, r, a1);
    return `M${s[0]},${-s[1]} A${r},${r} 0 ${spanOf(a0, a1) > 180 ? 1 : 0},0 ${e[0]},${-e[1]}`;
  };
  const isHl = (en: PlateEnt) => (pickKind === 'ent' && hov?.ent.id === en.id) || offEnt?.id === en.id;
  const W = 5000;
  const dash = `${4 * px} ${3 * px}`;
  const dashOf = (en: PlateEnt) => (en.ltype === 'center' ? `${14 * px} ${3 * px} ${3 * px} ${3 * px}` : en.layer === 'aux' && !aux ? `${6 * px} ${3 * px}` : undefined);
  const primEl = (p: Prim, stroke: string, w: number, key?: string) =>
    p.k === 'seg' ? (
      <line key={key} x1={p.a[0]} y1={-p.a[1]} x2={p.b[0]} y2={-p.b[1]} stroke={stroke} strokeWidth={w * px} opacity={0.75} />
    ) : p.full ? (
      <circle key={key} cx={p.c[0]} cy={-p.c[1]} r={p.r} fill="none" stroke={stroke} strokeWidth={w * px} opacity={0.75} />
    ) : (
      <path key={key} d={arcPath(p.c, p.r, p.a0, p.a1)} fill="none" stroke={stroke} strokeWidth={w * px} opacity={0.75} />
    );
  const grp = (k: 'draw' | 'edit' | 'anno') =>
    TOOLS.filter((x) => x.grp === k).map((x) => (
      <button key={x.t} className={tool === x.t ? 'on' : ''} title={x.tip} onClick={() => setTool(x.t)}>
        {x.label} <span className="pe-key">{x.key}</span>
      </button>
    ));

  return (
    <div className="plate-editor">
      {/* vẽ trên khung 2D: đang đo thì chỉ hiện tuỳ chọn của lệnh đo; lệnh vẽ chọn ở thanh trái */}
      {!(under && tool === 'measure') && <div className="pe-toolbar">
        <b title={aux ? '作業平面' : `継手 ${req.jointName}`}>✏ {pl.name}</b>
        {!aux && <span className="muted small">t</span>}
        {!aux && <input className="pe-t" type="text" inputMode="decimal" value={pl.t} onChange={(e) => { const t = +e.target.value; if (t > 0) { setPl((x) => ({ ...x, t })); setDirty(true); } }} />}
        <span className="sep" />
        {!aux && (Object.keys(PLATE_LAYER_LABEL) as PlateLayer[]).map((l) => (
          <button key={l} className={layer === l ? 'on' : ''} style={{ borderColor: LAYER_COLOR[l] }} onClick={() => setLayer(l)}>
            <span className="dot" style={{ background: LAYER_COLOR[l] }} /> {PLATE_LAYER_LABEL[l]}
          </button>
        ))}
        <span className="sep" />
        <button onClick={undo} title="Hoàn tác (U / Ctrl+Z)">
          ↶ U
        </button>
        <label className="pe-tg" title="F8: chỉ vẽ ngang / dọc">
          <input type="checkbox" checked={ortho} onChange={(e) => setOrtho(e.target.checked)} /> Ortho F8
        </label>
        <label className="pe-tg" title="F7">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Lưới F7
        </label>
        <select value={gsnap} onChange={(e) => setGsnap(+e.target.value)} title="Bước bắt lưới khi không bắt được điểm">
          {[0, 1, 5, 10].map((v) => (
            <option key={v} value={v}>
              {v ? `bước ${v}` : 'tự do'}
            </option>
          ))}
        </select>
        <label className="pe-tg" title="Hiện chiều dài mọi cạnh và đường kính lỗ">
          <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} /> Hiện kích thước
        </label>
        {!aux && (
          <label className="pe-tg" title="Đường trục cấu kiện (giằng / dầm) đi qua điểm làm việc">
            <input type="checkbox" checked={showAxis} onChange={(e) => setShowAxis(e.target.checked)} /> Trục cấu kiện
          </label>
        )}
        <span className="sep" />
        {onLive ? <span className="muted small">✓ tự lưu</span> : (
          <>
        {dirty && <span className="pe-dirty">● chưa xác nhận</span>}
        <button onClick={onClose} title="Bỏ thay đổi, giữ nguyên tấm cũ">
          Huỷ
        </button>
        {errs.length > 0 && <span className="pe-err" title={errs.join(' ')}>⚠ Biên dạng hở – chưa lưu được</span>}
        <button className={errs.length ? '' : 'primary'} title={errs.length ? errs.join(' ') : aux ? 'Lưu 補助線 vào 作業平面' : 'Ghi hình dạng này cho tấm GPL tại point'} onClick={trySave}>
          ✓ Xác nhận
        </button>
          </>
        )}
      </div>}
      {!under && <div className="pe-tools">
        <span className="pe-grp">Vẽ</span>
        {grp('draw')}
        <span className="sep" />
        <span className="pe-grp">Sửa</span>
        {grp('edit')}
        <span className="sep" />
        <span className="pe-grp">Chú thích · đo</span>
        {grp('anno')}
      </div>}
      {tool === 'measure' && (
        <div className="pe-tools pe-sub">
          <span className="pe-grp">Kiểu đo</span>
          {(Object.keys(MMODE_LABEL) as MMode[]).map((m) => (
            <button key={m} className={mmode === m ? 'on' : ''} onClick={() => { setMmode(m); setPts([]); setSel1(null); setPtFirst(null); setMeas(null); }}>
              {MMODE_LABEL[m]}
            </button>
          ))}
          <span className="muted small">Bắt điểm luôn bật: ▢ đầu/cuối · △ giữa · ○ tâm · ✕ giao điểm</span>
        </div>
      )}
      <svg
        ref={svgRef}
        className="pe-canvas"
        viewBox={pz.viewBox}
        onClick={onClick}
        onMouseMove={(e) => setRaw(toMm(e))}
        onMouseLeave={() => setRaw(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          exec(buf);
        }}
      >
        <defs>
          <pattern id="pegrid" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" stroke="#eef2f7" strokeWidth={0.5 * px} />
          </pattern>
          <pattern id="pegrid50" width="50" height="50" patternUnits="userSpaceOnUse">
            <rect width="50" height="50" fill="url(#pegrid)" />
            <path d="M50 0H0V50" fill="none" stroke="#dbe3ee" strokeWidth={px} />
          </pattern>
        </defs>
        {grid && <rect x={-W} y={-W} width={2 * W} height={2 * W} fill="url(#pegrid50)" />}
        {!aux && showAxis && (
          <>
            <line x1={-W} x2={W} y1={0} y2={0} stroke="#93c5fd" strokeWidth={px} strokeDasharray={`${12 * px} ${4 * px} ${2 * px} ${4 * px}`} />
            <circle cx={0} cy={0} r={3 * px} fill="#2563eb" />
          </>
        )}
        {path && <path d={path} fill="#fca5a5" fillOpacity={0.35} fillRule="evenodd" stroke="none" />}
        {under}
        {!under && (
          <>
        {/* nền: cấu kiện / trục nằm trên 作業平面 */}
        {bgFill.map((loops, i) => (
          <path key={`bf${i}`} d={loops.map((lp) => 'M' + lp.map((q) => `${q[0]},${-q[1]}`).join('L') + 'Z').join(' ')} fill="#94a3b8" fillOpacity={0.55} fillRule="evenodd" stroke="none" />
        ))}
        {bg.map(([a, b], i) => {
          const st = bgStyle[i] ?? 'edge';
          const sty =
            st === 'grid' ? { stroke: '#dc2626', w: 1, dash: `${14 * px} ${4 * px} ${2 * px} ${4 * px}`, op: 0.55 }
            : st === 'axis' ? { stroke: '#64748b', w: 0.8, dash: `${10 * px} ${3 * px} ${2 * px} ${3 * px}`, op: 0.5 }
            : st === 'hid' ? { stroke: '#64748b', w: 1, dash: `${5 * px} ${3 * px}`, op: 0.55 }
            : st === 'wp' ? { stroke: '#0ea5e9', w: 1.4, dash: `${8 * px} ${4 * px}`, op: 0.9 }
            : { stroke: '#334155', w: 1.4, dash: undefined, op: 0.8 };
          return <line key={`bg${i}`} x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} stroke={sty.stroke} strokeWidth={sty.w * px} strokeDasharray={sty.dash} opacity={sty.op} />;
        })}
        {bgText.map((b, i) => (
          <text key={`bt${i}`} x={b.p[0]} y={-b.p[1]} fontSize={13 * px} fill={b.c ?? '#0369a1'} fontWeight={700} stroke="#fff" strokeWidth={3 * px} paintOrder="stroke" textAnchor="middle" dominantBaseline="middle">
            {b.t}
          </text>
        ))}
          </>
        )}
        {pl.ents.map((en) => {
          const st = { fill: 'none', stroke: isHl(en) ? (tool === 'erase' ? '#dc2626' : '#2563eb') : aux ? '#d97706' : LAYER_COLOR[en.layer], strokeWidth: (isHl(en) ? 2 : 1) * px, strokeDasharray: dashOf(en) };
          if (en.kind === 'dim') {
            const [a, b] = en.pts;
            const d = len(sub(b, a)) > 1e-6 ? nrm(sub(b, a)) : ([1, 0] as P), n: P = [-d[1], d[0]], tk = 4 * px;
            return (
              <g key={en.id}>
                <line x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} stroke={isHl(en) ? st.stroke : '#0369a1'} strokeWidth={st.strokeWidth} />
                {[a, b].map((q, i) => <line key={i} x1={q[0] - n[0] * tk} y1={-(q[1] - n[1] * tk)} x2={q[0] + n[0] * tk} y2={-(q[1] + n[1] * tk)} stroke="#0369a1" strokeWidth={px} />)}
                {dimLabel(a, b, '#0369a1')}
              </g>
            );
          }
          if (en.kind === 'circle') return <circle key={en.id} cx={en.pts[0][0]} cy={-en.pts[0][1]} r={en.r} {...st} />;
          if (en.kind === 'arc') return <path key={en.id} d={arcPath(en.pts[0], en.r ?? 0, en.a0 ?? 0, en.a1 ?? 90)} {...st} />;
          return en.closed ? <polygon key={en.id} points={poly(en.pts)} {...st} /> : <polyline key={en.id} points={poly(en.pts)} {...st} />;
        })}
        {dims && prims.filter((p) => p.k === 'seg' && !p.ent.id.startsWith('bg:') && (aux || p.ent.layer !== 'aux')).map((p, i) => p.k === 'seg' && dimLabel(p.a, p.b, '#0369a1', `d${i}`))}
        {dims &&
          prims
            .filter((p): p is Arc => p.k === 'arc')
            .map((p, i) => {
              const at = arcPt(p.c, p.r, p.full ? 45 : p.a0 + spanOf(p.a0, p.a1) / 2);
              return (
                <text key={`r${i}`} x={at[0] + 2 * px} y={-at[1] - 2 * px} fontSize={fs} fill="#b91c1c" style={{ pointerEvents: 'none' }}>
                  {p.full ? `φ${fmt(2 * p.r)}` : `R${fmt(p.r)}`}
                </text>
              );
            })}
        {hov && pickKind !== 'ent' && primEl(hov, tool === 'trim' ? '#dc2626' : '#2563eb', 3)}
        {hov && tool === 'measure' && hov.k === 'seg' && !pts.length && mmode === 'dist' && dimLabel(hov.a, hov.b, '#2563eb')}
        {sel1 && primEl(sel1.p, '#7c3aed', 3)}
        {ref && <line x1={ref.a[0]} y1={-ref.a[1]} x2={ref.b[0]} y2={-ref.b[1]} stroke="#7c3aed" strokeWidth={3 * px} opacity={0.6} />}
        {/* đang vẽ */}
        {tool === 'line' && pts.length > 0 && <polyline points={poly([...pts, ...(cur ? [cur] : [])])} fill="none" stroke={LAYER_COLOR[layer]} strokeWidth={1.5 * px} strokeDasharray={dash} />}
        {(tool === 'perp' || tool === 'para' || tool === 'angle' || tool === 'measure') && pts.length > 0 && cur && <line x1={pts[0][0]} y1={-pts[0][1]} x2={cur[0]} y2={-cur[1]} stroke={tool === 'measure' ? '#0ea5e9' : LAYER_COLOR[layer]} strokeWidth={1.5 * px} strokeDasharray={dash} />}
        {tool === 'rect' && pts.length > 0 && cur && <polygon points={poly([pts[0], [cur[0], pts[0][1]], cur, [pts[0][0], cur[1]]])} fill="none" stroke={LAYER_COLOR[layer]} strokeWidth={1.5 * px} strokeDasharray={dash} />}
        {tool === 'circle' && pts.length > 0 && cur && <circle cx={pts[0][0]} cy={-pts[0][1]} r={len(sub(cur, pts[0]))} fill="none" stroke={LAYER_COLOR[layer]} strokeWidth={1.5 * px} strokeDasharray={dash} />}
        {base && cur && tool !== 'circle' && tool !== 'rect' && len(sub(cur, base)) > 0 && dimLabel(base, cur, '#0ea5e9')}
        {tool === 'measure' && (mmode === 'pt' || mmode === 'dim') && ptFirst && <circle cx={ptFirst[0]} cy={-ptFirst[1]} r={4 * px} fill="#0ea5e9" />}
        {tool === 'measure' && sel1 && (() => {
          const s = sel1.p as Seg;
          return <line x1={s.a[0]} y1={-s.a[1]} x2={s.b[0]} y2={-s.b[1]} stroke="#f59e0b" strokeWidth={3 * px} strokeOpacity={0.8} />;
        })()}
        {tool === 'measure' && (mmode === 'pt' || mmode === 'dim') && sel1 && cur && (() => {
          const s = sel1.p as Seg, u = nrm(sub(s.b, s.a)), foot = add(s.a, mul(u, dot(sub(cur, s.a), u)));
          return (
            <>
              <line x1={foot[0]} y1={-foot[1]} x2={cur[0]} y2={-cur[1]} stroke="#0ea5e9" strokeWidth={1.5 * px} strokeDasharray={dash} />
              {dimLabel(foot, cur, '#0ea5e9')}
            </>
          );
        })()}
        {meas && (
          <>
            <line x1={meas.a[0]} y1={-meas.a[1]} x2={meas.b[0]} y2={-meas.b[1]} stroke="#0ea5e9" strokeWidth={1.5 * px} />
            {[meas.a, meas.b].map((p, i) => (
              <circle key={i} cx={p[0]} cy={-p[1]} r={3 * px} fill="#0ea5e9" />
            ))}
            {dimLabel(meas.a, meas.b, '#0369a1', undefined, meas.text)}
          </>
        )}
        {/* đầu hở của biên dạng */}
        {[...openOut, ...openHole].map((p, i) => (
          <g key={`open${i}`} style={{ pointerEvents: 'none' }}>
            <circle cx={p[0]} cy={-p[1]} r={7 * px} fill="#fee2e2" fillOpacity={0.6} stroke="#dc2626" strokeWidth={2 * px} />
            <text x={p[0] + 9 * px} y={-p[1] - 9 * px} fontSize={fs} fill="#dc2626">
              hở
            </text>
          </g>
        ))}
        {/* điểm bắt */}
        {sn && (
          <g stroke="#16a34a" strokeWidth={2 * px} fill="none">
            {sn.k === 'end' || sn.k === 'wp' ? (
              <rect x={sn.p[0] - 5 * px} y={-sn.p[1] - 5 * px} width={10 * px} height={10 * px} />
            ) : sn.k === 'mid' ? (
              <polygon points={`${sn.p[0]},${-sn.p[1] - 6 * px} ${sn.p[0] - 6 * px},${-sn.p[1] + 5 * px} ${sn.p[0] + 6 * px},${-sn.p[1] + 5 * px}`} />
            ) : sn.k === 'int' ? (
              <path d={`M${sn.p[0] - 6 * px},${-sn.p[1] - 6 * px} L${sn.p[0] + 6 * px},${-sn.p[1] + 6 * px} M${sn.p[0] - 6 * px},${-sn.p[1] + 6 * px} L${sn.p[0] + 6 * px},${-sn.p[1] - 6 * px}`} />
            ) : (
              <circle cx={sn.p[0]} cy={-sn.p[1]} r={6 * px} />
            )}
          </g>
        )}
        {/* con trỏ chữ thập */}
        {cur && (
          <g stroke="#475569" strokeWidth={px} style={{ pointerEvents: 'none' }}>
            <line x1={cur[0] - 14 * px} x2={cur[0] + 14 * px} y1={-cur[1]} y2={-cur[1]} />
            <line x1={cur[0]} x2={cur[0]} y1={-cur[1] - 14 * px} y2={-cur[1] + 14 * px} />
          </g>
        )}
      </svg>
      <div className="pe-cmdline">
        {log.map((l, i) => (
          <div key={i} className="pe-log">
            {l}
          </div>
        ))}
        <div className="pe-prompt">
          <span className="pe-ptxt">{prompt()}:</span> <span className="pe-buf">{buf}</span>
          <span className="pe-caret">▌</span>
          {live && <span className="pe-live">{live}</span>}
        </div>
      </div>
      <div className="pe-status">
        {errs.length > 0 && <b className="pe-err">⚠ {errs.join(' ')} · </b>}
        {aux ? `${pl.ents.length} đối tượng 補助線 · nền xám = cấu kiện và trục nằm trên mặt phẳng (bắt điểm được)` : g.outer ? `Biên ngoài ${g.outer.length} đỉnh · ${g.holes.length + g.holePolys.length} lỗ · diện tích ${Math.round(area).toLocaleString()} mm² · ${((area * pl.t * 7.85e-6) || 0).toFixed(2)} kg` : 'Chưa có biên ngoài: các đường trên layer 外形 phải nối thành vòng kín'}
        <span className="muted"> · Gõ phím bất kỳ lúc nào để nhập lệnh / số, Enter hoặc Space để chạy, Esc huỷ, chuột phải = Enter · Lăn chuột phóng to, chuột giữa dời</span>
      </div>
    </div>
  );
}
