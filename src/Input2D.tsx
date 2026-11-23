// Khung nhìn mặt bằng / mặt đứng trục có thể bấm để nhập cột, dầm
import { useRef, useState } from 'react';
import { jointBolts, jointPlates, jointStationAt } from './jointGeom';
import { Member, Project, KIND_COLOR, uid, Column, WorkPlane, Vec3, planShowOf, gridPositions } from './model';
import { faceGeo, faceZ } from './slopeFace';
import { cutMembers, memberFrame } from './section3d';
import { auxDims3D, auxSegments3D, fromUV, planeCuts, planeRect, planeTrace, toUV, type AuxLine } from './workplane';
import type { PickNodes } from './Viewer3D';
import type { LineInput } from './lineInput';
import { geometry } from './build';
import { BraceInput, ColumnInput, View2DState } from './input';
import { Updater } from './ui';
import { usePanZoom } from './panzoom';

interface Props {
  project: Project;
  members: Member[];
  set: Updater;
  /** chỉ trả lớp hình (vẽ dưới lớp vẽ 補助線), đổi về toạ độ 作業平面 layerPlane */
  layerOnly?: boolean;
  layerPlane?: { o: Vec3; u: Vec3; v: Vec3 };
  colIn: ColumnInput;
  v2d: View2DState;
  braceIn?: BraceInput;
  /** thao tác nhập dùng chung với khung 3D (bảng ① Nhập 部材) */
  pick?: PickNodes | null;
  /** xem trước (xanh) */
  ghosts?: Member[];
  auxLines?: AuxLine[];
  lineIn?: LineInput;
  lineLv?: string;
  /** 作業平面 đã tạo (đã tính lại theo mô hình) */
  planes?: WorkPlane[];
  /** chọn cấu kiện (bấm tên 部材) */
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  bar?: import('react').ReactNode;
  /** 勾配設定: hiện các mặt 勾配 của tầng + mặt đang sửa */
  showSlopes?: boolean;
  /** lớp vẽ thêm (toạ độ mặt bằng x, -y) */
  overlay?: (sw: number) => React.ReactNode;
  activeSlope?: string | null;
}

interface Snap {
  h: string; // id trục ngang (theo phương ngang của bản vẽ), '' nếu không phải giao trục
  v: string; // id trục dọc / tầng, '' nếu không phải giao trục
  x: number;
  y: number;
  /** grid = giao trục · aux = 補助線 · mem = điểm bất kỳ trên 部材 · line = điểm trên đường trục */
  kind: 'grid' | 'aux' | 'mem' | 'line';
  label?: string;
}
const SNAP_COLOR: Record<Snap['kind'], string> = { grid: '#1d4ed8', aux: '#d97706', mem: '#16a34a', line: '#7c3aed' };
const SNAP_LABEL: Record<Snap['kind'], string> = { grid: 'giao trục', aux: '補助線', mem: 'trên 部材', line: 'trên đường trục' };

/** ma trận SVG đổi toạ độ khung nhìn (x, −y) → toạ độ 作業平面 (a, −b) */
function layerMatrix(vp: { o: Vec3; u: Vec3; v: Vec3 }, pl: { o: Vec3; u: Vec3; v: Vec3 }): string {
  const dt = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const d: Vec3 = [vp.o[0] - pl.o[0], vp.o[1] - pl.o[1], vp.o[2] - pl.o[2]];
  const A0 = dt(d, pl.u), B0 = dt(d, pl.v);
  const uu = dt(vp.u, pl.u), vu = dt(vp.v, pl.u), uv = dt(vp.u, pl.v), vv = dt(vp.v, pl.v);
  return `matrix(${uu} ${-uv} ${-vu} ${vv} ${A0} ${-B0})`;
}
export default function Input2D({ project: p, members, set, colIn, v2d, braceIn, planes = [], pick, ghosts = [], auxLines = [], lineIn, selected, onSelect, bar, showSlopes, activeSlope, overlay, layerOnly, layerPlane }: Props) {
  const g = geometry(p);
  const show = planShowOf(p.params);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<Snap | null>(null);
  const [pending, setPending] = useState<Snap | null>(null);
  const [msg, setMsg] = useState('');
  const lvSorted = [...p.levels].sort((a, b) => a.elevation - b.elevation);

  // Trục ngang H và trục đứng V của bản vẽ
  let H: { id: string; name: string; pos: number }[];
  let V: { id: string; name: string; pos: number }[];
  let title: string;
  const cutPos = v2d.view === 'ex' ? g.xs.get(v2d.gridId) : v2d.view === 'ey' ? g.ys.get(v2d.gridId) : undefined;
  const level = p.levels.find((l) => l.id === v2d.levelId);
  if (v2d.view === 'plan') {
    H = p.gridsX.map((x) => ({ id: x.id, name: x.name, pos: g.xs.get(x.id)! }));
    V = p.gridsY.map((y) => ({ id: y.id, name: y.name, pos: g.ys.get(y.id)! }));
    title = `MẶT BẰNG – ${level?.name ?? ''} (+${level?.elevation ?? 0})`;
  } else if (v2d.view === 'ex') {
    H = p.gridsY.map((y) => ({ id: y.id, name: y.name, pos: g.ys.get(y.id)! }));
    V = lvSorted.map((l) => ({ id: l.id, name: l.name, pos: l.elevation }));
    title = `MẶT ĐỨNG TRỤC ${p.gridsX.find((x) => x.id === v2d.gridId)?.name ?? ''}`;
  } else if (v2d.view === 'ey') {
    H = p.gridsX.map((x) => ({ id: x.id, name: x.name, pos: g.xs.get(x.id)! }));
    V = lvSorted.map((l) => ({ id: l.id, name: l.name, pos: l.elevation }));
    title = `MẶT ĐỨNG TRỤC ${p.gridsY.find((y) => y.id === v2d.gridId)?.name ?? ''}`;
  } else {
    H = [];
    V = [];
    title = '';
  }
  // 作業平面 đang xem (view 'wp')
  const wpl = v2d.view === 'wp' ? planes.find((w) => w.id === v2d.planeId) ?? planes[0] : undefined;
  if (v2d.view === 'wp') title = wpl ? `作業平面 ${wpl.name}` : 'Chưa có 作業平面 – tạo ở tab Nhập cột · dầm';
  const wRect = wpl ? planeRect(p, members, wpl, 1000) : null;
  const wCuts = wpl && wRect ? planeCuts(p, members, wpl, wRect) : [];

  // Cấu kiện hiển thị + phép chiếu
  // mặt phẳng của khung nhìn (u, v trùng toạ độ bản vẽ) → cắt từ tổng thể 3D
  const viewPl: { o: Vec3; u: Vec3; v: Vec3 } | null =
    v2d.view === 'wp' ? (wpl ? { o: wpl.o, u: wpl.u, v: wpl.v } : null) : v2d.view === 'plan' ? { o: [0, 0, level?.elevation ?? 0], u: [1, 0, 0], v: [0, 1, 0] } : cutPos === undefined ? null : v2d.view === 'ex' ? { o: [cutPos, 0, 0], u: [0, 1, 0], v: [0, 0, 1] } : { o: [0, cutPos, 0], u: [1, 0, 0], v: [0, 0, 1] };
  // Mặt bằng: cột cắt ngang ở cao độ tầng + 1000 (như bản vẽ mặt bằng thật, tránh ダイアフラム / 仕口 tại cao độ dầm); tầng trên cùng: cắt ở −1000
  const colCut = (): ReturnType<typeof cutMembers> => {
    if (v2d.view !== 'plan' || !viewPl) return [];
    const el = level?.elevation ?? 0;
    const cols = members.filter((m) => m.kind === 'column');
    const spans = (src: string | undefined, id: string, z: number) => cols.some((m) => (src ? m.source === src : m.id === id) && Math.min(m.a[2], m.b[2]) < z && Math.max(m.a[2], m.b[2]) > z);
    const at = (z: number) => ({ o: [0, 0, z] as Vec3, u: [1, 0, 0] as Vec3, v: [0, 1, 0] as Vec3 });
    const up = cols.filter((m) => Math.min(m.a[2], m.b[2]) < el + 1000 && Math.max(m.a[2], m.b[2]) > el + 1000);
    const dn = cols.filter((m) => !spans(m.source, m.id, el + 1000) && Math.min(m.a[2], m.b[2]) < el - 1000 && Math.max(m.a[2], m.b[2]) > el - 1000);
    return [...cutMembers(up, at(el + 1000), 1), ...cutMembers(dn, at(el - 1000), 1)].filter((c) => c.mode === 'cut');
  };
  const shapes = viewPl ? (v2d.view === 'plan' ? [...cutMembers(members.filter((m) => m.kind !== 'column'), viewPl), ...colCut()] : cutMembers(members, viewPl)) : [];

  const hs = wRect ? [wRect[0], wRect[1]] : H.map((a) => a.pos), vs = wRect ? [wRect[2], wRect[3]] : V.map((a) => a.pos);
  const minX = wRect ? wRect[0] : Math.min(...hs, 0), maxX = wRect ? wRect[1] : Math.max(...hs, 1000);
  const minY = wRect ? wRect[2] : Math.min(...vs, 0), maxY = wRect ? wRect[3] : Math.max(...vs, 1000, v2d.view === 'plan' ? 0 : g.roofZ(g.ridgeY));
  const span = Math.max(maxX - minX, maxY - minY, 3000);
  const pad = span * 0.14 + 1500;
  const bubble = span * 0.02 + 200;
  const sw = span / 700 + 6;
  const snapR = span * 0.035;

  const toSvg = (e: React.MouseEvent): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const r = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [r.x, -r.y];
  };
  const freeMode = v2d.mode === 'post' || v2d.mode === 'sbeam' || v2d.mode === 'beam' || v2d.mode === 'column';
  const segPt = (x: number, y: number, a: [number, number], b: [number, number]): [number, number, number] => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
    const px = a[0] + t * dx, py = a[1] + t * dy;
    return [px, py, Math.hypot(px - x, py - y)];
  };
  const lineX = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]): [number, number] | null => {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]];
    const den = r[0] * q[1] - r[1] * q[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return [a[0] + t * r[0], a[1] + t * r[1]];
  };
  const nearest = (x: number, y: number): Snap | null => {
    let best: Snap | null = null, bd = snapR;
    for (const h of H)
      for (const v of V) {
        const d = Math.hypot(h.pos - x, v.pos - y);
        if (d < bd) {
          bd = d;
          best = { h: h.id, v: v.id, x: h.pos, y: v.pos, kind: 'grid' };
        }
      }
    if (best || !freeMode) return best;
    // 補助線: đầu mút, giao với trục, giao nhau
    const gl: [[number, number], [number, number]][] = [...H.map((h) => [[h.pos, minY - pad], [h.pos, maxY + pad]] as [[number, number], [number, number]]), ...V.map((v) => [[minX - pad, v.pos], [maxX + pad, v.pos]] as [[number, number], [number, number]])];
    const auxPts: [number, number][] = [];
    auxIn.forEach(([a, b], i) => {
      auxPts.push(a, b);
      for (const [c, d] of gl) { const q = lineX(a, b, c, d); if (q) auxPts.push(q); }
      auxIn.slice(i + 1).forEach(([c, d]) => { const q = lineX(a, b, c, d); if (q) auxPts.push(q); });
    });
    for (const q of auxPts) {
      const d = Math.hypot(q[0] - x, q[1] - y);
      if (d < bd * 0.8) { bd = d; best = { h: '', v: '', x: q[0], y: q[1], kind: 'aux' }; }
    }
    if (best) return best;
    // điểm bất kỳ trên 補助線 / 部材 (không giới hạn điểm giữa)
    let bm = snapR * 0.6;
    for (const [a, b] of auxIn) { const [px, py, d] = segPt(x, y, a, b); if (d < bm) { bm = d; best = { h: '', v: '', x: px, y: py, kind: 'aux' }; } }
    for (const ax of memAxes) { const [px, py, d] = segPt(x, y, ax.a, ax.b); if (d < bm) { bm = d; best = { h: '', v: '', x: px, y: py, kind: 'mem', label: ax.label }; } }
    if (best) return best;
    for (const [a, b] of gl) { const [px, py, d] = segPt(x, y, a, b); if (d < bm * 0.7) { bm = d; best = { h: '', v: '', x: px, y: py, kind: 'line' }; } }
    return best;
  };
  /** trục 部材 trên khung nhìn (để bắt điểm bất kỳ trên 部材) */
  const memAxes: { a: [number, number]; b: [number, number]; label: string }[] = viewPl
    ? members.flatMap((m) => {
        if (m.kind !== 'beam' && m.kind !== 'column' && m.kind !== 'rafter') return [];
        const A = toUV(viewPl, m.a), B = toUV(viewPl, m.b);
        const tol = v2d.view === 'plan' ? 700 : 200;
        if (Math.abs(A.d) > tol || Math.abs(B.d) > tol) return [];
        if (Math.hypot(A.uv[0] - B.uv[0], A.uv[1] - B.uv[1]) < 1) return [];
        return [{ a: A.uv as [number, number], b: B.uv as [number, number], label: m.mark }];
      })
    : [];
  /** điểm 2D của khung nhìn → toạ độ 3D (mm) */
  const to3 = (q: { x: number; y: number }): Vec3 =>
    v2d.view === 'wp' && viewPl ? fromUV(viewPl, [q.x, q.y]) : v2d.view === 'plan' ? [q.x, q.y, level?.elevation ?? 0] : v2d.view === 'ex' ? [cutPos ?? 0, q.x, q.y] : [q.x, cutPos ?? 0, q.y];
  const r0 = (v: number) => Math.round(v);

  const lvElev = (id: string) => p.levels.find((l) => l.id === id)?.elevation ?? 0;
  const colFromInput = (x: string, y: string, base: string, top: string): Column | null => {
    const m = p.master.find((mm) => mm.name === colIn.memberName && mm.kind === 'column');
    if (!m || colIn.step < 3) return null;
    return { id: uid('col'), x, y, base, top, memberId: m.id, anchor: colIn.anchor ?? 4, rotation: colIn.rotation, dx: colIn.dx, dy: colIn.dy };
  };

  // ---- thao tác chung với khung 3D (pick) ----
  type Hit =
    | { t: 'node'; h: string; v: string; x: number; y: number; label: string }
    | { t: 'mem'; id: string; x: number; y: number; label: string }
    | { t: 'aux'; key: string; x: number; y: number; label: string }
    | { t: 'grid'; k: 'gx' | 'gy' | 'lv'; id: string; x: number; y: number; label: string };
  const hKind: 'gx' | 'gy' = v2d.view === 'ey' ? 'gx' : v2d.view === 'ex' ? 'gy' : 'gx';
  const vKind: 'gy' | 'lv' = v2d.view === 'plan' ? 'gy' : 'lv';
  const auxView = viewPl
    ? auxLines.flatMap((l) => {
        if (l.arc) return [];
        const A = toUV(viewPl, l.a), B = toUV(viewPl, l.b);
        return Math.abs(A.d) < 150 && Math.abs(B.d) < 150 ? [{ key: l.key, label: l.label, a: A.uv as [number, number], b: B.uv as [number, number] }] : [];
      })
    : [];
  const memAll: { id: string; a: [number, number]; b: [number, number]; label: string; kind: string }[] = viewPl
    ? members.flatMap((m) => {
        const A = toUV(viewPl, m.a), B = toUV(viewPl, m.b);
        const tol = pick?.anyZ ? Infinity : v2d.view === 'plan' ? 700 : 300;
        // cột xuyên qua mặt bằng (2 đầu ở 2 phía cao độ tầng) vẫn bấm / quét được
        if (Math.abs(A.d) > tol && Math.abs(B.d) > tol && A.d * B.d > 0) return [];
        if (A.d * B.d < 0 && Math.abs(A.d) > tol && Math.abs(B.d) > tol) return [{ id: m.id, a: A.uv as [number, number], b: A.uv as [number, number], label: m.mark, kind: m.kind }];
        return [{ id: m.id, a: A.uv as [number, number], b: B.uv as [number, number], label: m.mark, kind: m.kind }];
      })
    : [];
  const hitTest = (x: number, y: number): Hit | null => {
    if (!pick) return null;
    const node = pick.mode !== 'member' && !(pick.planNodesOnly && v2d.view !== 'plan');
    if (node) {
      let best: Hit | null = null, bd = pick.planNodesOnly ? snapR * 0.45 : snapR;
      for (const h of H) for (const v of V) {
        const d = Math.hypot(h.pos - x, v.pos - y);
        if (d < bd) { bd = d; best = { t: 'node', h: h.id, v: v.id, x: h.pos, y: v.pos, label: `${h.name}-${v.name}` }; }
      }
      if (best) return best;
    } else {
      let best: Hit | null = null, bd = snapR * 0.6;
      for (const a of auxView) { const [px, py, d] = segPt(x, y, a.a, a.b); if (d < bd) { bd = d; best = { t: 'aux', key: a.key, x: px, y: py, label: `補助線 ${a.label}` }; } }
      for (const m of memAll) {
        const len = Math.hypot(m.a[0] - m.b[0], m.a[1] - m.b[1]);
        const [px, py, d] = len < 1 ? [m.a[0], m.a[1], Math.hypot(m.a[0] - x, m.a[1] - y)] : segPt(x, y, m.a, m.b);
        if (d < bd) { bd = d; best = { t: 'mem', id: m.id, x: px, y: py, label: m.label }; }
      }
      if (best) return best;
    }
    // đường trục / tầng (hoặc bong bóng tên trục)
    let best: Hit | null = null, bd = snapR * 0.45;
    for (const h of H) { const d = Math.abs(h.pos - x); if (d < bd) { bd = d; best = { t: 'grid', k: hKind, id: h.id, x: h.pos, y, label: `通り ${h.name}` }; } }
    for (const v of V) { const d = Math.abs(v.pos - y); if (d < bd) { bd = d; best = { t: 'grid', k: vKind, id: v.id, x, y: v.pos, label: vKind === 'lv' ? `Tầng ${v.name}` : `通り ${v.name}` }; } }
    for (const c of wCuts) {
      if (!c.id) continue;
      const [px, py, d] = segPt(x, y, c.seg[0], c.seg[1]);
      if (d < bd) { bd = d; best = { t: 'grid', k: c.kind === 'gridX' ? 'gx' : c.kind === 'gridY' ? 'gy' : 'lv', id: c.id, x: px, y: py, label: c.kind === 'level' ? `Tầng ${c.label}` : `通り ${c.label}` }; }
    }
    return best;
  };
  const [hit, setHit] = useState<Hit | null>(null);
  const doPick = (hh: Hit) => {
    if (!pick) return;
    if (hh.t === 'node') {
      if (v2d.view === 'plan') pick.onNode(hh.h, hh.v);
      else if (v2d.view === 'ex') pick.onNode(v2d.gridId, hh.h);
      else pick.onNode(hh.h, v2d.gridId);
    } else if (hh.t === 'mem') pick.onMember?.(hh.id, to3(hh));
    else if (hh.t === 'aux') pick.onAux?.(hh.key);
    else pick.onGrid?.(hh.k, hh.id);
  };

  // quét chọn bằng khung (kéo chuột trái): trái → phải = nằm trọn trong khung · phải → trái = chạm khung
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number; cx: number } | null>(null);
  const boxStart = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const noClick = useRef(false);
  const boxIds = (b: NonNullable<typeof box>) => {
    const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
    const cross = b.x1 < b.x0;
    const inside = (q: [number, number]) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
    const crossSeg = (a: [number, number], c: [number, number]) => {
      if (inside(a) || inside(c)) return true;
      const ed: [number, number, number, number][] = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
      const cr = (ax: number, ay: number, bx: number, by: number, px: number, py: number) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      return ed.some(([ax, ay, bx, by]) => cr(ax, ay, bx, by, a[0], a[1]) * cr(ax, ay, bx, by, c[0], c[1]) <= 0 && cr(a[0], a[1], c[0], c[1], ax, ay) * cr(a[0], a[1], c[0], c[1], bx, by) <= 0);
    };
    return memAll.filter((m) => (cross ? crossSeg(m.a, m.b) : inside(m.a) && inside(m.b))).map((m) => m.id);
  };
  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || (!pick?.onBox && !pick?.onRect)) return;
    const q = toSvg(e);
    if (q) boxStart.current = { x: q[0], y: q[1], cx: e.clientX, cy: e.clientY };
  };
  const onUp = (e: React.MouseEvent) => {
    const st = boxStart.current;
    boxStart.current = null;
    if (!st || !box) return setBox(null);
    noClick.current = true;
    if (pick?.onRect) pick.onRect(box.x0, box.y0, box.x1, box.y1);
    else pick?.onBox?.(boxIds(box), e.shiftKey);
    setBox(null);
  };

  const onClick = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (noClick.current) {
      noClick.current = false;
      return;
    }
    if (pick && v2d.mode !== 'delete') {
      const q = toSvg(e);
      const hh = q && hitTest(q[0], q[1]);
      if (hh) doPick(hh);
      return;
    }
    if (v2d.mode === 'delete') return;
    if (v2d.view === 'wp') return setMsg('Trên 作業平面: bật một nút nhập ở bảng ① để chọn 部材 / 補助線 / trục.');
    const q = toSvg(e);
    const s = q && nearest(q[0], q[1]);
    if (!s) return;
    if (v2d.mode === 'column') {
      if (colIn.step < 3) return setMsg('Hãy chọn 部材名 cột ở tab phụ "Nhập cột · dầm".');
      if (v2d.view === 'plan' && s.kind !== 'grid') {
        const c = colFromInput('', '', colIn.base, colIn.top);
        if (!c) return;
        const P = to3(s);
        set((d) => void d.columns.push({ ...c, pt: [r0(P[0]), r0(P[1])] }));
        return setMsg(`Đã đặt cột ${colIn.memberName} tại ${SNAP_LABEL[s.kind]} (${r0(P[0])}, ${r0(P[1])}).`);
      }
      if (s.kind !== 'grid') return setMsg('Ở mặt đứng, cột 本柱 đặt theo giao trục. Dùng 間柱 để đặt tự do.');
      if (v2d.view === 'plan') {
        const c = colFromInput(s.h, s.v, colIn.base, colIn.top);
        if (!c) return;
        set((d) => {
          d.columns = d.columns.filter((o) => !(o.x === c.x && o.y === c.y && o.base === c.base));
          d.columns.push(c);
        });
        return setMsg(`Đã đặt cột ${colIn.memberName}.`);
      }
      if (!pending) return setPending(s), setMsg('Chọn điểm thứ 2 trên cùng trục (đỉnh hoặc chân cột).');
      setPending(null);
      if (pending.h !== s.h || pending.v === s.v) return setMsg('Hai điểm của cột phải cùng một trục và khác cao độ.');
      const [base, top] = lvElev(pending.v) < lvElev(s.v) ? [pending.v, s.v] : [s.v, pending.v];
      const c = v2d.view === 'ex' ? colFromInput(v2d.gridId, s.h, base, top) : colFromInput(s.h, v2d.gridId, base, top);
      if (c) set((d) => void d.columns.push(c));
      return setMsg(`Đã đặt cột ${colIn.memberName}.`);
    }
    // 間柱
    if (v2d.mode === 'post') {
      const mid = v2d.postMemberId || p.master.find((m) => m.kind === 'column' && m.role === 'post')?.id || p.master.find((m) => m.kind === 'column')?.id;
      if (!mid) return setMsg('Chưa có 部材名 間柱 trong master.');
      if (v2d.view === 'plan') {
        const P = to3(s);
        set((d) => void d.columns.push({ id: uid('col'), x: '', y: '', pt: [r0(P[0]), r0(P[1])], base: colIn.base, top: colIn.top, memberId: mid, anchor: 4, rotation: colIn.rotation, dx: 0, dy: 0, role: 'post' }));
        return setMsg(`Đã đặt 間柱 tại (${r0(P[0])}, ${r0(P[1])}).`);
      }
      if (!pending) return setPending(s), setMsg('Chọn điểm thứ 2 của 間柱 (đỉnh hoặc chân, cùng phương đứng).');
      setPending(null);
      const A = to3(pending), B = to3(s);
      if (Math.abs(A[2] - B[2]) < 100) return setMsg('2 điểm của 間柱 phải khác cao độ.');
      const [lo, hi] = A[2] < B[2] ? [A, B] : [B, A];
      const nl = (z: number) => [...p.levels].sort((a, b) => Math.abs(a.elevation - z) - Math.abs(b.elevation - z))[0]?.id ?? '';
      set((d) => void d.columns.push({ id: uid('col'), x: '', y: '', pt: [r0(lo[0]), r0(lo[1])], base: nl(lo[2]), top: nl(hi[2]), zb: r0(lo[2]), zt: r0(hi[2]), memberId: mid, anchor: 4, rotation: colIn.rotation, dx: 0, dy: 0, role: 'post' }));
      return setMsg(`Đã đặt 間柱 cao ${r0(hi[2] - lo[2])} mm.`);
    }
    // 小梁 (và 大梁 khi có điểm không phải giao trục): toạ độ tự do p1/p2
    if (v2d.mode === 'sbeam' || (v2d.mode === 'beam' && (s.kind !== 'grid' || (pending && pending.kind !== 'grid')))) {
      const sub = v2d.mode === 'sbeam';
      const mid = sub ? v2d.sbeamMemberId || p.master.find((m) => m.kind === 'beam' && m.role === 'sub')?.id || p.master.find((m) => m.kind === 'beam')?.id : v2d.beamMemberId;
      if (!mid) return setMsg('Chưa có 部材名 dầm trong master.');
      if (!pending) return setPending(s), setMsg(`Chọn điểm cuối của ${sub ? '小梁' : 'dầm'} (giao trục, 補助線 hoặc điểm bất kỳ trên 部材).`);
      setPending(null);
      const A = to3(pending), B = to3(s);
      if (Math.hypot(A[0] - B[0], A[1] - B[1]) < 100) return setMsg('2 điểm quá gần hoặc trùng nhau trên mặt bằng.');
      const nl = (z: number) => [...p.levels].sort((a, b) => Math.abs(a.elevation - z) - Math.abs(b.elevation - z))[0]?.id ?? '';
      const lvId = v2d.view === 'plan' ? v2d.levelId : nl(A[2]);
      const el = lvElev(lvId), top = p.params.member.beamTopOffset;
      const rig = !sub && v2d.beamEnd === 'rigid';
      const bm = {
        id: uid('bm'), memberId: mid, level: lvId, x1: '', y1: '', x2: '', y2: '', p1: [r0(A[0]), r0(A[1])] as [number, number], p2: [r0(B[0]), r0(B[1])] as [number, number],
        dz: v2d.view === 'plan' ? 0 : r0(A[2] - el - top), up1: 0, up2: v2d.view === 'plan' ? 0 : r0(B[2] - A[2]), vref: 'top' as const,
        ...(sub ? { role: 'sub' as const } : {}),
        ...(rig ? { end1: 'rigid' as const, end2: 'rigid' as const, j1: v2d.bj ?? 900, j2: v2d.bj ?? 900 } : { end1: 'pin' as const, end2: 'pin' as const }),
      };
      set((d) => void d.beams.push(bm));
      return setMsg(`Đã thêm ${sub ? '小梁' : 'dầm'} dài ${r0(Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]))} mm.`);
    }
    // ブレース
    if (v2d.mode === 'brace') {
      const mid = v2d.braceMemberId || p.master.find((m) => m.kind === 'brace')?.id;
      if (!mid) return setMsg('Chưa có 部材名 ブレース trong master.');
      if (s.kind !== 'grid') return setMsg('ブレース bấm theo giao trục.');
      if (!pending) return setPending(s), setMsg('Chọn điểm thứ 2 (góc chéo đối diện).');
      setPending(null);
      if (pending.h === s.h || pending.v === s.v) return setMsg('2 điểm của ブレース phải chéo nhau (khác trục và khác cao độ).');
      const base = { id: uid('br'), memberId: mid, x: v2d.braceX ?? true, ref: braceIn?.ref ?? 'face', gap1: braceIn?.gap1 ?? 50, gap2: braceIn?.gap2 ?? 50, dz1: braceIn?.dz1 ?? -150, dz2: braceIn?.dz2 ?? -150 } as const;
      let br;
      if (v2d.view === 'plan') br = { ...base, plane: 'plan' as const, level: v2d.levelId, top: v2d.levelId, x1: pending.h, y1: pending.v, x2: s.h, y2: s.v };
      else {
        const [lo, hi] = lvElev(pending.v) < lvElev(s.v) ? [pending, s] : [s, pending];
        br = v2d.view === 'ex'
          ? { ...base, plane: 'wall' as const, level: lo.v, top: hi.v, x1: v2d.gridId, y1: lo.h, x2: v2d.gridId, y2: hi.h, dz1: 0, dz2: 0 }
          : { ...base, plane: 'wall' as const, level: lo.v, top: hi.v, x1: lo.h, y1: v2d.gridId, x2: hi.h, y2: v2d.gridId, dz1: 0, dz2: 0 };
      }
      set((d) => void (d.braces = [...(d.braces ?? []), br]));
      return setMsg(v2d.view === 'plan' ? 'Đã thêm 水平ブレース.' : 'Đã thêm 軸ブレース.');
    }
    // dầm
    if (!v2d.beamMemberId) return setMsg('Chưa có 部材名 dầm trong master.');
    if (!pending) return setPending(s), setMsg('Chọn điểm cuối của dầm.');
    setPending(null);
    if (pending.h === s.h && pending.v === s.v) return;
    let beam;
    if (v2d.view === 'plan') beam = { level: v2d.levelId, x1: pending.h, y1: pending.v, x2: s.h, y2: s.v };
    else {
      if (pending.v !== s.v) return setMsg('Dầm phải nằm trên cùng một cao độ tầng.');
      beam = v2d.view === 'ex' ? { level: s.v, x1: v2d.gridId, y1: pending.h, x2: v2d.gridId, y2: s.h } : { level: s.v, x1: pending.h, y1: v2d.gridId, x2: s.h, y2: v2d.gridId };
    }
    const rig = v2d.beamEnd === 'rigid';
    const b = { id: uid('bm'), memberId: v2d.beamMemberId, ...beam, ...(rig ? { end1: 'rigid' as const, end2: 'rigid' as const, j1: v2d.bj ?? 900, j2: v2d.bj ?? 900 } : { end1: 'pin' as const, end2: 'pin' as const }) };
    set((d) => void d.beams.push(b));
    setMsg('Đã thêm dầm.');
  };

  const del = (m: Member) => {
    if (v2d.mode !== 'delete' || !m.source) return;
    set((d) => {
      d.columns = d.columns.filter((c) => c.id !== m.source);
      d.beams = d.beams.filter((b) => b.id !== m.source);
      d.braces = (d.braces ?? []).filter((b) => b.id !== m.source);
    });
    setMsg(`Đã xoá ${m.mark}.`);
  };

  const vbX = minX - pad, vbW = maxX - minX + 2 * pad, vbY = -(maxY + pad), vbH = maxY - minY + 2 * pad;
  const pz = usePanZoom(svgRef, { x: vbX, y: vbY, w: vbW, h: vbH }, `${v2d.view}|${v2d.levelId}|${v2d.gridId}`);
  const dash = `12 4 2 4`;
  const isPlan = v2d.view === 'plan';
  const rect = [minX - pad * 0.45, maxX + pad * 0.5, minY - pad * 0.45, maxY + pad * 0.5];
  const vis = planes.filter((w) => !w.hidden);
  const traces = viewPl ? vis.filter((w) => w.id !== wpl?.id).map((w) => ({ w, t: planeTrace(viewPl, w, rect) })).filter((x) => x.t) : [];
  // 作業平面 song song & trùng với khung nhìn
  const onView = viewPl && v2d.view !== 'wp' ? vis.filter((w) => !planeTrace(viewPl, w, rect) && Math.abs(toUV(viewPl, w.o).d) < 150) : [];
  // 補助線 nằm trên khung nhìn này
  const auxIn = viewPl
    ? auxSegments3D(vis).flatMap(([a, b]) => {
        const A = toUV(viewPl, a), B = toUV(viewPl, b);
        return Math.abs(A.d) < 150 && Math.abs(B.d) < 150 ? [[A.uv, B.uv] as [[number, number], [number, number]]] : [];
      })
    : [];
  const hullOf = (pts: [number, number][]) => {
    const q = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo: [number, number][] = [], up: [number, number][] = [];
    for (const x of q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], x) <= 0) lo.pop(); lo.push(x); }
    for (const x of [...q].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], x) <= 0) up.pop(); up.push(x); }
    return [...lo.slice(0, -1), ...up.slice(0, -1)];
  };
  /** mặt bằng: dầm (nằm ngang, không cắt) chỉ hiện bụng + đường tâm */
  const webOnly = (m: Member) => v2d.view === 'plan' && !!viewPl && (m.kind === 'beam' || m.kind === 'rafter') && m.section.type !== 'Box' && m.section.type !== 'Pipe' && Math.abs(m.a[2] - m.b[2]) < Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) * 0.5;
  const pts2 = (pg: [number, number][]) => pg.map(([x, y]) => `${x},${-y}`).join(' ');

  const content = (
    <>
        <rect x={vbX - vbW * 5} y={vbY - vbH * 5} width={vbW * 11} height={vbH * 11} fill="#fff" />
        <text x={(minX + maxX) / 2} y={vbY + pad * 0.35} fontSize={bubble * 1.1} textAnchor="middle" fontWeight="bold" fill="#0f172a" fontFamily="sans-serif">
          {title}
        </text>
        {/* trục ngang */}
        {H.map((a) => (
          <g key={a.id} fontFamily="sans-serif">
            <line x1={a.pos} x2={a.pos} y1={-(maxY + pad * 0.5)} y2={-(minY - pad * 0.45)} stroke="#dc2626" vectorEffect="non-scaling-stroke" strokeWidth={1} strokeDasharray={dash} />
            <circle cx={a.pos} cy={-(minY - pad * 0.45) + bubble} r={bubble} fill="#fff" stroke="#0f172a" vectorEffect="non-scaling-stroke" strokeWidth={1} />
            <text x={a.pos} y={-(minY - pad * 0.45) + bubble} fontSize={bubble} textAnchor="middle" dominantBaseline="central">
              {a.name}
            </text>
          </g>
        ))}
        {/* trục dọc (mặt bằng) hoặc cao độ tầng (mặt đứng) */}
        {V.map((a) => (
          <g key={a.id} fontFamily="sans-serif">
            <line y1={-a.pos} y2={-a.pos} x1={minX - pad * 0.45} x2={maxX + pad * 0.5} stroke={isPlan ? '#dc2626' : '#94a3b8'} vectorEffect="non-scaling-stroke" strokeWidth={1} strokeDasharray={isPlan ? dash : `6 4`} />
            {isPlan ? (
              <>
                <circle cy={-a.pos} cx={minX - pad * 0.45 - bubble} r={bubble} fill="#fff" stroke="#0f172a" vectorEffect="non-scaling-stroke" strokeWidth={1} />
                <text y={-a.pos} x={minX - pad * 0.45 - bubble} fontSize={bubble} textAnchor="middle" dominantBaseline="central">
                  {a.name}
                </text>
              </>
            ) : (
              <text x={minX - pad * 0.5} y={-a.pos - sw * 3} fontSize={bubble * 0.7} fill="#0f172a" textAnchor="end">
                +{a.pos} {a.name}
              </text>
            )}
          </g>
        ))}
        {/* 作業平面: giao tuyến trục / tầng + khung */}
        {wRect && (
          <rect x={wRect[0]} y={-wRect[3]} width={wRect[1] - wRect[0]} height={wRect[3] - wRect[2]} fill="#f0f9ff" stroke="#0ea5e9" vectorEffect="non-scaling-stroke" strokeWidth={1} />
        )}
        {wCuts.map((c, i) => (
          <g key={'wc' + i} fontFamily="sans-serif">
            <line x1={c.seg[0][0]} y1={-c.seg[0][1]} x2={c.seg[1][0]} y2={-c.seg[1][1]} stroke={c.kind === 'level' ? '#94a3b8' : '#dc2626'} vectorEffect="non-scaling-stroke" strokeWidth={1} strokeDasharray={c.kind === 'level' ? `6 4` : dash} />
            <text x={c.at[0]} y={-c.at[1]} fontSize={bubble * 0.7} textAnchor="middle" dominantBaseline="central" fill="#0f172a" paintOrder="stroke" stroke="#fff" strokeWidth={sw * 2}>
              {c.label}
            </text>
          </g>
        ))}
        {/* 勾配設定: mặt 勾配 (gạch chéo xanh), mặt đang sửa viền cam + số thứ tự điểm */}
        {showSlopes && v2d.view === 'plan' && (() => {
          const gx = gridPositions(p.gridsX), gy = gridPositions(p.gridsY);
          const fs = (p.slopeFaces ?? []).filter((f) => f.level === v2d.levelId || f.id === activeSlope);
          return (
            <g pointerEvents="none">
              <defs>
                <pattern id="slope-hatch" patternUnits="userSpaceOnUse" width={700} height={700} patternTransform="rotate(45)">
                  <line x1={0} y1={0} x2={0} y2={700} stroke="#22c55e" strokeWidth={40} strokeOpacity={0.55} />
                </pattern>
              </defs>
              {fs.map((f) => {
                const act = f.id === activeSlope;
                const g0 = faceGeo(p, f);
                const pts = f.mode === 'line' ? (g0?.poly.slice(0, 2) ?? []) : f.pts.map(([x, y]) => [gx.get(x), gy.get(y)]).filter((q): q is [number, number] => q[0] !== undefined && q[1] !== undefined);
                const cx = pts.reduce((a, q) => a + q[0], 0) / (pts.length || 1), cy = pts.reduce((a, q) => a + q[1], 0) / (pts.length || 1);
                // mũi tên chiều xuống dốc
                let arrow: JSX.Element | null = null;
                if (g0 && f.kind !== 'flat') {
                  const zs = faceZ(g0, g0.s0), ze = faceZ(g0, g0.s1);
                  if (zs !== ze) {
                    const dn = Math.sign((ze < zs ? g0.s1 : g0.s0) - (ze < zs ? g0.s0 : g0.s1));
                    const Lr = Math.min(3000, Math.abs(g0.s1 - g0.s0) / 3);
                    const [ux, uy] = g0.dir === 'y' ? [0, dn] : [dn, 0];
                    const ax0 = cx - (ux * Lr) / 2, ay0 = cy - (uy * Lr) / 2, ax1 = cx + (ux * Lr) / 2, ay1 = cy + (uy * Lr) / 2;
                    arrow = (
                      <g stroke="#15803d" strokeWidth={1} vectorEffect="non-scaling-stroke" fill="#15803d">
                        <line x1={ax0} y1={-ay0} x2={ax1} y2={-ay1} />
                        <polygon points={`${ax1},${-ay1} ${ax1 - ux * 500 - uy * 250},${-(ay1 - uy * 500 + ux * 250)} ${ax1 - ux * 500 + uy * 250},${-(ay1 - uy * 500 - ux * 250)}`} />
                      </g>
                    );
                  }
                }
                return (
                  <g key={f.id}>
                    {pts.length >= 3 && <polygon points={pts.map(([x, y]) => `${x},${-y}`).join(' ')} fill="url(#slope-hatch)" stroke={act ? '#f97316' : '#16a34a'} vectorEffect="non-scaling-stroke" strokeWidth={act ? 2 : 1} />}
                    {pts.length === 2 && <line x1={pts[0][0]} y1={-pts[0][1]} x2={pts[1][0]} y2={-pts[1][1]} stroke={act ? '#f97316' : '#16a34a'} vectorEffect="non-scaling-stroke" strokeWidth={4} strokeOpacity={0.7} />}
                    {arrow}
                    {pts.length >= 3 && (
                      <text x={cx} y={-cy + bubble * 1.4} fontSize={bubble * 0.7} textAnchor="middle" fill="#fff" fontFamily="sans-serif" fontWeight="bold" paintOrder="stroke" stroke="#16a34a" strokeWidth={sw * 6}>
                        {f.name}
                      </text>
                    )}
                    {act && f.mode !== 'line' && pts.map(([x, y], i) => (
                      <g key={i}>
                        <circle cx={x} cy={-y} r={bubble * 0.55} fill="#fff" stroke="#db2777" vectorEffect="non-scaling-stroke" strokeWidth={1} />
                        <text x={x} y={-y} fontSize={bubble * 0.6} textAnchor="middle" dominantBaseline="central" fill="#db2777" fontFamily="sans-serif" fontWeight="bold">{i + 1}</text>
                      </g>
                    ))}
                    {act && f.mode === 'line' && f.baseAxis && !g0 && (() => {
                      const bx = gx.get(f.baseAxis), by = gy.get(f.baseAxis);
                      return bx !== undefined ? <line x1={bx} y1={-minY + pad} x2={bx} y2={-maxY - pad} stroke="#f97316" vectorEffect="non-scaling-stroke" strokeWidth={3} strokeOpacity={0.6} /> : by !== undefined ? <line x1={minX - pad} y1={-by} x2={maxX + pad} y2={-by} stroke="#f97316" vectorEffect="non-scaling-stroke" strokeWidth={3} strokeOpacity={0.6} /> : null;
                    })()}
                  </g>
                );
              })}
            </g>
          );
        })()}
        {overlay && v2d.view === 'plan' && overlay(sw)}
        {/* tấm ダイアフラム của 本柱 (nhìn từ trên xuống, dưới mặt cắt cột) */}
        {v2d.view === 'plan' && viewPl && show.diaphragm !== false && (() => {
          const el = level?.elevation ?? 0;
          const out: JSX.Element[] = [];
          for (const m of members) {
            if (m.kind !== 'column' || !m.dia?.length) continue;
            const r = ((m.rotation ?? 0) * Math.PI) / 180, bx = [Math.cos(r), Math.sin(r)], by = [-Math.sin(r), Math.cos(r)];
            m.dia.forEach((d, k) => {
              if (d.kind === 'inner' || d.z > el + 1000 || d.z < el - 1500) return;
              const cx = m.a[0] + bx[0] * (d.off ?? 0), cy = m.a[1] + bx[1] * (d.off ?? 0);
              const uv = (x: number, y: number) => toUV(viewPl, [x, y, d.z]).uv;
              const key = m.id + 'd' + k;
              if (d.round) {
                const c = uv(cx, cy);
                out.push(<circle key={key} cx={c[0]} cy={-c[1]} r={d.w / 2} fill="#e2e8f0" stroke="#334155" strokeWidth={1} vectorEffect="non-scaling-stroke" />);
              } else {
                const q = [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([i, j]) => uv(cx + (bx[0] * d.w * i + by[0] * d.d * j) / 2, cy + (bx[1] * d.w * i + by[1] * d.d * j) / 2));
                out.push(<polygon key={key} points={pts2(q as [number, number][])} fill="#e2e8f0" stroke="#334155" strokeWidth={1} vectorEffect="non-scaling-stroke" />);
              }
            });
          }
          return <g pointerEvents="none">{out}</g>;
        })()}
        {/* tấm ダイアフラム trên mặt đứng: 通し = nét thấy, 内 = nét khuất (trong lòng ống) */}
        {v2d.view !== 'plan' && viewPl && show.diaphragm !== false && (() => {
          const out: JSX.Element[] = [];
          for (const m of members) {
            if (m.kind !== 'column' || !m.dia?.length) continue;
            if (Math.abs(toUV(viewPl, m.a).d) > 1500) continue;
            const r = ((m.rotation ?? 0) * Math.PI) / 180, bx = [Math.cos(r), Math.sin(r)], by = [-Math.sin(r), Math.cos(r)];
            m.dia.forEach((d, k) => {
              const cx = m.a[0] + bx[0] * (d.off ?? 0), cy = m.a[1] + bx[1] * (d.off ?? 0);
              const q: [number, number][] = [];
              for (const i of [1, -1]) for (const j of [1, -1]) for (const z of [d.z - d.t / 2, d.z + d.t / 2]) {
                const dd = d.round ? d.w / 2 : 0;
                if (d.round) { for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; q.push(toUV(viewPl, [cx + Math.cos(t) * dd, cy + Math.sin(t) * dd, z]).uv); } continue; }
                q.push(toUV(viewPl, [cx + (bx[0] * d.w * i + by[0] * d.d * j) / 2, cy + (bx[1] * d.w * i + by[1] * d.d * j) / 2, z]).uv);
              }
              const inner = d.kind === 'inner';
              out.push(<polygon key={m.id + 'e' + k} points={pts2(hullOf(q))} fill={inner ? 'none' : '#cbd5e1'} stroke={inner ? '#475569' : '#0f172a'} strokeWidth={inner ? 0.8 : 1} vectorEffect="non-scaling-stroke" strokeDasharray={inner ? `5 3` : undefined} />);
            });
          }
          return <g pointerEvents="none" className="dia-elev">{out}</g>;
        })()}
        {/* cấu kiện: mặt cắt thật / hình chiếu, cắt ra từ tổng thể 3D */}
        {shapes.map((c) => {
          const m = c.member;
          const main = m.kind === 'column' || m.kind === 'beam' || m.kind === 'brace';
          const cls = 'member' + (v2d.mode === 'delete' && main ? ' deletable' : '');
          const col = KIND_COLOR[m.kind];
          const sel = !!selected && (m.id === selected || (!!m.source && members.find((x) => x.id === selected)?.source === m.source));
          return (
            <g key={m.id} className={cls + (sel ? ' sel' : '')} onClick={(e) => {
                if (v2d.mode === 'delete') { if (main) { e.stopPropagation(); del(m); } return; }
                // bấm vào thân buzai (khi không đang chọn điểm) → chọn buzai, giống bấm vào tên
                if (!main || !onSelect || e.button !== 0 || noClick.current || pending) return;
                if (pick) { const q = toSvg(e); if (q && hitTest(q[0], q[1])) return; } // đang chọn điểm: ưu tiên điểm bắt
                e.stopPropagation();
                onSelect(sel ? null : m.id);
              }} style={!pending && main && v2d.mode !== 'delete' ? { cursor: 'pointer' } : undefined}>
              {webOnly(m) ? (
                (() => {
                  // mặt bằng: dầm chỉ vẽ chiều dày bụng (web) + đường tâm
                  const A = toUV(viewPl!, m.a).uv, B = toUV(viewPl!, m.b).uv;
                  const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
                  const ex = -(B[1] - A[1]) / L, ey = (B[0] - A[0]) / L;
                  const off = (k: number, s0 = 0, s1 = 0): [[number, number], [number, number]] => {
                    const dx = (B[0] - A[0]) / L, dy = (B[1] - A[1]) / L;
                    return [[A[0] + dx * s0 + ex * k, A[1] + dy * s0 + ey * k], [B[0] - dx * s1 + ex * k, B[1] - dy * s1 + ey * k]];
                  };
                  const f = Math.max(m.section.b, 1) / 2, h = Math.max(m.section.tw, 1) / 2;
                  // ブラケット: cánh dừng ở mép ダイアフラム, bụng chạy tới mặt cột
                  const [s0, s1] = m.flgSet ?? [0, 0];
                  const [f1, f2] = [off(f, s0, s1), off(-f, s0, s1)];
                  return (
                    <>
                      {/* mặt FLG (bề rộng cánh) */}
                      <polygon points={pts2([f1[0], f1[1], f2[1], f2[0]])} fill={col} fillOpacity={0.25} stroke="#0f172a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                      {/* đường web (2 mặt bụng, nét khuất) */}
                      {[off(h), off(-h)].map((w, k) => <line key={k} x1={w[0][0]} y1={-w[0][1]} x2={w[1][0]} y2={-w[1][1]} stroke="#334155" strokeWidth={0.8} vectorEffect="non-scaling-stroke" strokeDasharray={`5 3`} />)}
                    </>
                  );
                })()
              ) : (
                <>
                  {c.mode === 'cut' && m.kind === 'column' && v2d.view === 'plan' ? (
                    <>
                      {/* cột cắt trên mặt bằng: lòng ống tô nhạt + thành ống tô đậm (tiết diện thật, góc bo) */}
                      {(() => {
                        const ar = (lp: [number, number][]) => Math.abs(lp.reduce((s, q, i) => { const r = lp[(i + 1) % lp.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0));
                        const outer = c.polys.reduce((a, b) => (ar(b as [number, number][]) > ar(a as [number, number][]) ? b : a));
                        return <polygon points={pts2(outer as [number, number][])} fill={col} fillOpacity={0.35} stroke="none" />;
                      })()}
                      <path d={c.polys.map((lp) => 'M' + lp.map(([x, y]) => `${x},${-y}`).join('L') + 'Z').join(' ')} fill="#1e3a8a" fillRule="evenodd" stroke="#0f172a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    </>
                  ) : c.mode === 'cut' ? (
                    <path d={c.polys.map((lp) => 'M' + lp.map(([x, y]) => `${x},${-y}`).join('L') + 'Z').join(' ')} fill={col} fillRule="evenodd" stroke="#0f172a" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  ) : (
                    <polygon points={pts2(c.polys.length ? (c.polys[0] as [number, number][]) : hullOf(c.edges.flat()))} fill={col} fillOpacity={0.3} stroke="none" />
                  )}
                  {c.edges.map((e, i) => <line key={i} x1={e[0][0]} y1={-e[0][1]} x2={e[1][0]} y2={-e[1][1]} stroke="#0f172a" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
                  {c.hidden.map((e, i) => <line key={'h' + i} x1={e[0][0]} y1={-e[0][1]} x2={e[1][0]} y2={-e[1][1]} stroke="#475569" strokeWidth={0.8} vectorEffect="non-scaling-stroke" strokeDasharray={`5 3`} />)}
                </>
              )}
              {webOnly(m) && (() => {
                const A = toUV(viewPl!, m.a).uv, B = toUV(viewPl!, m.b).uv;
                return <line x1={A[0]} y1={-A[1]} x2={B[0]} y2={-B[1]} stroke="#0f172a" strokeWidth={0.8} vectorEffect="non-scaling-stroke" strokeDasharray={`14 4 2 4`} />;
              })()}
              {!webOnly(m) && c.axis && <line x1={c.axis[0][0]} y1={-c.axis[0][1]} x2={c.axis[1][0]} y2={-c.axis[1][1]} stroke="#64748b" strokeWidth={0.7} vectorEffect="non-scaling-stroke" strokeDasharray={`14 4 2 4`} />}
              {sel && c.axis && <line x1={c.axis[0][0]} y1={-c.axis[0][1]} x2={c.axis[1][0]} y2={-c.axis[1][1]} stroke="#facc15" vectorEffect="non-scaling-stroke" strokeWidth={3} strokeOpacity={0.7} />}
              {main && show.memberName && (
                <text
                  className="mem-name"
                  x={c.at[0] + sw * 4}
                  y={-c.at[1] - sw * 4}
                  fontSize={bubble * 0.6}
                  fill={sel ? '#b45309' : '#1e3a8a'}
                  fontWeight={sel ? 'bold' : undefined}
                  fontFamily="sans-serif"
                  paintOrder="stroke"
                  stroke="#fff"
                  strokeWidth={sw * 2}
                  style={{ cursor: 'pointer' }}
                  onClick={(e) => {
                    if (v2d.mode === 'delete') return;
                    e.stopPropagation();
                    if (pick?.onMember) pick.onMember(m.id, to3({ x: c.at[0], y: c.at[1] }));
                    else onSelect?.(sel ? null : m.id);
                  }}
                >
                  {m.mark}
                </text>
              )}
            </g>
          );
        })}
        {/* xem trước (xanh) */}
        {viewPl &&
          cutMembers(ghosts, viewPl).map((c, i) => (
            <g key={'gh' + i} pointerEvents="none">
              {c.mode === 'cut' ? (
                <path d={c.polys.map((lp) => 'M' + lp.map(([x, y]) => `${x},${-y}`).join('L') + 'Z').join(' ')} fill="#22c55e" fillOpacity={0.6} stroke="#15803d" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              ) : (
                <polygon points={pts2(hullOf(c.edges.flat()))} fill="#22c55e" fillOpacity={0.45} stroke="#15803d" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
              )}
            </g>
          ))}
        {/* 部材 đỡ đã chọn (間柱 / 小梁) + 部材 đầu 1 */}
        {pick && viewPl && (
          <g pointerEvents="none">
            {[lineIn?.s1, lineIn?.s2].map((sp, i) => {
              if (!sp) return null;
              const A = toUV(viewPl, sp.a).uv, B = toUV(viewPl, sp.b).uv;
              return <line key={'sp' + i} x1={A[0]} y1={-A[1]} x2={B[0]} y2={-B[1]} stroke="#f97316" vectorEffect="non-scaling-stroke" strokeWidth={2.2} strokeOpacity={0.7} />;
            })}
            {pick.startMember &&
              members.filter((m) => m.source === pick.startMember).map((m) => {
                const A = toUV(viewPl, m.a).uv, B = toUV(viewPl, m.b).uv;
                return <line key={'st' + m.id} x1={A[0]} y1={-A[1]} x2={B[0]} y2={-B[1]} stroke="#dc2626" vectorEffect="non-scaling-stroke" strokeWidth={2.2} strokeOpacity={0.7} />;
              })}
            {pick.start && (() => {
              const hh = H.find((h) => h.id === (v2d.view === 'ey' ? pick.start!.x : v2d.view === 'ex' ? pick.start!.y : pick.start!.x));
              const vv = v2d.view === 'plan' ? V.find((v) => v.id === pick.start!.y) : undefined;
              return hh ? <circle cx={hh.pos} cy={-(vv?.pos ?? 0)} r={snapR * 0.45} fill="none" stroke="#f59e0b" vectorEffect="non-scaling-stroke" strokeWidth={1} /> : null;
            })()}
          </g>
        )}
        {/* mối nối: tấm SPL / GPL + bulông (chiếu bằng), ký hiệu ブラケット (継手 中) / ピン接合 và tên 継手 – bật tắt ở パラメーター */}
        {viewPl &&
          members.flatMap((m) => {
            if (m.kind !== 'beam' || !m.joints?.length) return [];
            const A = toUV(viewPl, m.a), B = toUV(viewPl, m.b);
            if (Math.abs(A.d) > 700 || Math.abs(B.d) > 700) return [];
            const L = Math.hypot(B.uv[0] - A.uv[0], B.uv[1] - A.uv[1]);
            if (L < 1) return [];
            const F = memberFrame(m);
            const P2 = (ox: number, oy: number, oz: number): [number, number] => {
              const q = toUV(viewPl, [F.a[0] + F.x[0] * ox + F.y[0] * oy + F.z[0] * oz, F.a[1] + F.x[1] * ox + F.y[1] * oy + F.z[1] * oz, F.a[2] + F.x[2] * ox + F.y[2] * oy + F.z[2] * oz]).uv;
              return [q[0], -q[1]];
            };
            const depth = (ox: number, oy: number, oz: number) => toUV(viewPl, [F.a[0] + F.x[0] * ox + F.y[0] * oy + F.z[0] * oz, F.a[1] + F.x[1] * ox + F.y[1] * oy + F.z[1] * oz, F.a[2] + F.x[2] * ox + F.y[2] * oy + F.z[2] * oz]).d;
            const ux = (B.uv[0] - A.uv[0]) / L, uy = (B.uv[1] - A.uv[1]) / L;
            const w = Math.max(m.section.b, 100) * 0.9;
            return m.joints.filter((jx) => !jx.dup).map((jx, i) => {
              const j0 = p.joints.find((q) => q.name === jx.name);
              const j = j0 && jx.pos === 'mid' && j0.type === 'GPL' ? { ...j0, type: 'SPL' as const, webL: 0, flangeL: 0, webH: 0 } : j0;
              const st = j ? (jx.at !== undefined ? { z: jx.at, dir: 0 } : jointStationAt(m.length, j, jx.pos)) : { z: jx.pos === 'right' ? m.length : jx.pos === 'left' ? 0 : m.length / 2, dir: 0 };
              const t = Math.max(0, Math.min(L, (st.z / (m.length || 1)) * L));
              const px = A.uv[0] + ux * t, py = A.uv[1] + uy * t;
              const nx = -uy, ny = ux;
              const pin = jx.pos === 'left' || jx.pos === 'right';
              const inw = jx.pos === 'left' ? 1 : jx.pos === 'right' ? -1 : 0;
              const lx = px + ux * inw * w * 2.6 - nx * w * 0.9, ly = py + uy * inw * w * 2.6 - ny * w * 0.9;
              const plates = j && show.plates ? jointPlates(m.section, j, st.dir).filter((pl) => !pl.ring) : [];
              const bolts = j && show.bolts ? jointBolts(m.section, j, st.dir) : [];
              const hd = j ? j.bolt.dia : 20;
              return (
                <g key={`jt${m.id}${i}`} pointerEvents="none" className="jt-mark">
                  {/* tấm: hình chiếu bằng của hộp (rộng theo x, dài theo trục dầm) – tấm trên cánh che phía dưới */}
                  {plates.map((pl) => {
                    const cz = st.z + pl.oz;
                    const c: [number, number][] = [];
                    for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k2 of [-1, 1]) c.push(P2(pl.ox + (i * pl.w) / 2, pl.oy + (j * pl.h) / 2, cz + (k2 * pl.l) / 2));
                    return { c, dep: depth(pl.ox, pl.oy, cz) };
                  }).sort((a, b) => a.dep - b.dep).map(({ c }, k) => (
                    <polygon key={'p' + k} points={hullOf(c).map((q) => q.join(',')).join(' ')} fill="#fecaca" fillOpacity={0.85} stroke="#b91c1c" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
                  ))}
                  {/* bulông: trục bulông hướng về người nhìn = vòng tròn · nằm ngang mặt nhìn = thân bulông */}
                  {bolts.map((b, k) => {
                    const o = b.axis === 'y' ? P2(b.x, b.out, st.z + b.z) : P2(b.out, b.y, st.z + b.z);
                    const i2 = b.axis === 'y' ? P2(b.x, b.inn, st.z + b.z) : P2(b.inn, b.y, st.z + b.z);
                    if (Math.hypot(o[0] - i2[0], o[1] - i2[1]) < hd * 0.5) return <circle key={'b' + k} cx={o[0]} cy={o[1]} r={hd * 0.6} fill="#334155" stroke="#0f172a" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />;
                    return <line key={'b' + k} x1={o[0]} y1={o[1]} x2={i2[0]} y2={i2[1]} stroke="#334155" strokeWidth={hd} strokeLinecap="butt" />;
                  })}
                  {!plates.length && !bolts.length && (pin ? (
                    <circle cx={px + ux * inw * w * 0.5} cy={-(py + uy * inw * w * 0.5)} r={w * 0.32} fill="#fff" stroke="#0f766e" vectorEffect="non-scaling-stroke" strokeWidth={1} />
                  ) : (
                    [-1, 1].map((k) => <line key={k} x1={px + ux * k * w * 0.12 - nx * w * 0.6} y1={-(py + uy * k * w * 0.12 - ny * w * 0.6)} x2={px + ux * k * w * 0.12 + nx * w * 0.6} y2={-(py + uy * k * w * 0.12 + ny * w * 0.6)} stroke="#7c3aed" vectorEffect="non-scaling-stroke" strokeWidth={1} />)
                  ))}
                  {show.jointName && (
                    <text x={lx} y={-ly} fontSize={bubble * 0.36} fill={pin ? '#0f766e' : '#7c3aed'} fontFamily="sans-serif" textAnchor="middle" dominantBaseline="central" paintOrder="stroke" stroke="#fff" strokeWidth={sw * 1.5}>
                      {jx.name}{pin ? ' ピン' : ''}
                    </text>
                  )}
                </g>
              );
            });
          })}
        {/* phần tử đang chọn (quét chọn) */}
        {pick?.selSrc?.length && viewPl
          ? members.filter((m) => m.source && pick.selSrc!.includes(m.source)).map((m) => {
              const A = toUV(viewPl, m.a).uv, B = toUV(viewPl, m.b).uv;
              return <line key={'ss' + m.id} x1={A[0]} y1={-A[1]} x2={B[0]} y2={-B[1]} stroke="#facc15" vectorEffect="non-scaling-stroke" strokeWidth={2.4} strokeOpacity={0.75} pointerEvents="none" />;
            })
          : null}
        {box && (
          <rect x={Math.min(box.x0, box.x1)} y={-Math.max(box.y0, box.y1)} width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)} fill={box.x1 < box.x0 ? 'rgba(34,197,94,.12)' : 'rgba(59,130,246,.12)'} stroke={box.x1 < box.x0 ? '#16a34a' : '#2563eb'} vectorEffect="non-scaling-stroke" strokeWidth={1} strokeDasharray={box.x1 < box.x0 ? `4 3` : undefined} pointerEvents="none" />
        )}
        {hit && (
          <g pointerEvents="none">
            {hit.t === 'grid' ? (
              v2d.view === 'wp' ? (
                (() => {
                  const c = wCuts.find((cc) => cc.id === hit.id);
                  return c ? <line x1={c.seg[0][0]} y1={-c.seg[0][1]} x2={c.seg[1][0]} y2={-c.seg[1][1]} stroke="#7c3aed" vectorEffect="non-scaling-stroke" strokeWidth={1} strokeOpacity={0.6} /> : null;
                })()
              ) : hit.k === vKind ? (
                <line x1={minX - pad} x2={maxX + pad} y1={-hit.y} y2={-hit.y} stroke="#7c3aed" vectorEffect="non-scaling-stroke" strokeWidth={1} strokeOpacity={0.6} />
              ) : (
                <line x1={hit.x} x2={hit.x} y1={-(maxY + pad)} y2={-(minY - pad)} stroke="#7c3aed" vectorEffect="non-scaling-stroke" strokeWidth={1} strokeOpacity={0.6} />
              )
            ) : (
              null /* bỏ vòng tròn bắt điểm theo yêu cầu */
            )}
            <text x={hit.x + snapR * 0.4} y={-hit.y - snapR * 0.4} fontSize={bubble * 0.6} fill="#0f172a" fontFamily="sans-serif" paintOrder="stroke" stroke="#fff" strokeWidth={sw * 2}>
              {hit.label}
            </text>
          </g>
        )}
        {/* 作業平面 đã tạo: giao tuyến với khung nhìn + 補助線 nằm trên khung nhìn */}
        {traces.map(({ w, t }) => (
          <g key={w.id} pointerEvents="none">
            <line x1={t![0][0]} y1={-t![0][1]} x2={t![1][0]} y2={-t![1][1]} stroke="#0ea5e9" vectorEffect="non-scaling-stroke" strokeWidth={1} strokeDasharray={`8 3`} />
            <text x={t![1][0]} y={-t![1][1] - sw * 2} fontSize={bubble * 0.6} fill="#0369a1" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" paintOrder="stroke" stroke="#fff" strokeWidth={sw * 2}>
              {w.name}
            </text>
          </g>
        ))}
        {onView.length > 0 && (
          <text x={minX - pad * 0.45} y={-(maxY + pad * 0.6)} fontSize={bubble * 0.6} fill="#0369a1" fontFamily="sans-serif" fontWeight="bold" pointerEvents="none">
            作業平面 trùng khung nhìn: {onView.map((w) => w.name).join(', ')}
          </text>
        )}
        {auxIn.map(([a, b], i) => <line key={'ax' + i} x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} stroke="#d97706" vectorEffect="non-scaling-stroke" strokeWidth={1} pointerEvents="none" />)}
        {/* kích thước (dim) đã ghi trên 作業平面 */}
        {viewPl && auxDims3D(vis).map((dm, i) => {
          const A = toUV(viewPl, dm.a), B = toUV(viewPl, dm.b);
          if (Math.abs(A.d) > 150 || Math.abs(B.d) > 150) return null;
          const [a, b] = [A.uv, B.uv];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
          const fsz = bubble * 0.35, mx = (a[0] + b[0]) / 2 + n[0] * fsz, my = (a[1] + b[1]) / 2 + n[1] * fsz;
          let ang = (Math.atan2(-(b[1] - a[1]), b[0] - a[0]) * 180) / Math.PI;
          if (ang > 90) ang -= 180;
          if (ang < -90) ang += 180;
          return (
            <g key={'dm' + i} pointerEvents="none">
              <line x1={a[0]} y1={-a[1]} x2={b[0]} y2={-b[1]} stroke="#0369a1" vectorEffect="non-scaling-stroke" strokeWidth={1} />
              <text x={mx} y={-my} fontSize={fsz} fill="#0369a1" fontFamily="sans-serif" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang} ${mx} ${-my})`}>{dm.t}</text>
            </g>
          );
        })}
        {/* điểm bắt dính */}
        {v2d.mode !== 'delete' && H.flatMap((h) => V.map((v) => <circle key={h.id + v.id} cx={h.pos} cy={-v.pos} r={sw * 1.6} fill="#cbd5e1" pointerEvents="none" />))}
        {pending && <circle cx={pending.x} cy={-pending.y} r={snapR * 0.45} fill="none" stroke="#f59e0b" vectorEffect="non-scaling-stroke" strokeWidth={1} pointerEvents="none" />}
        {hover && v2d.mode !== 'delete' && (
          <g pointerEvents="none">
            {hover.kind !== 'grid' && (
              <text x={hover.x + snapR * 0.4} y={-hover.y - snapR * 0.4} fontSize={bubble * 0.6} fill={SNAP_COLOR[hover.kind]} fontFamily="sans-serif">
                {SNAP_LABEL[hover.kind]}{hover.label ? ` ${hover.label}` : ''} ({r0(hover.x)}, {r0(hover.y)})
              </text>
            )}
            {pending && <line x1={pending.x} y1={-pending.y} x2={hover.x} y2={-hover.y} stroke="#1d4ed8" vectorEffect="non-scaling-stroke" strokeWidth={1} strokeDasharray={`4 3`} />}
          </g>
        )}
    </>
  );
  // vẽ / đo trực tiếp: chỉ trả lớp hình (đặt dưới lớp vẽ), đổi toạ độ khung nhìn → toạ độ 作業平面
  if (layerOnly) {
    const M = viewPl && layerPlane ? layerMatrix(viewPl, layerPlane) : null;
    return <g className={'drawing mode-' + v2d.mode} pointerEvents="none" transform={M ?? undefined}>{content}</g>;
  }
  return (
    <div className="input2d">
      <svg
        ref={svgRef}
        viewBox={pz.viewBox}
        className={'drawing mode-' + v2d.mode}
        onMouseDown={onDown}
        onMouseUp={onUp}
        onMouseMove={(e) => {
          const q = toSvg(e);
          const st = boxStart.current;
          if (st && q && Math.hypot(e.clientX - st.cx, e.clientY - st.cy) > 5) {
            setBox({ x0: st.x, y0: st.y, x1: q[0], y1: q[1], cx: e.clientX - st.cx });
            setHit(null);
            return;
          }
          if (pick && v2d.mode !== 'delete') { setHit(q ? hitTest(q[0], q[1]) : null); setHover(null); return; }
          setHover(q ? nearest(q[0], q[1]) : null);
        }}
        onMouseLeave={() => (setHover(null), setHit(null))}
        onClick={onClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setPending(null);
        }}
      >
        {content}
      </svg>
      {pick?.hint && <div className="input2d-hint">{pick.hint}</div>}
      {bar}
      <div className="input2d-status">
        {msg || (v2d.mode === 'delete' ? 'Bấm vào cấu kiện để xoá.' : 'Bắt điểm: giao trục (xanh) · 補助線 (cam) · điểm bất kỳ trên 部材 (lục) · trên đường trục (tím). Chuột phải: huỷ điểm đang chọn. Lăn chuột: phóng to tại con trỏ · Chuột giữa: dời.')}
      </div>
    </div>
  );
}
