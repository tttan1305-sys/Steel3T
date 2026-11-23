import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Project, defaultProject, gridPositions, migrate, uid } from './model';
import type { Member, PlateShape } from './model';
import { useRemembered } from './remember';
import { initialBeamInput, initialBraceInput, initialColumnInput, initialView2D, KneeInput, Pending, PickState, beamEndsFromMembers, memberPlanPoint, nearestLevel } from './input';
import Input2D from './Input2D';
import ProjectsDialog from './ProjectsDialog';
import { openInitial, saveProj, setCur } from './projectLib';
import SlopeTab from './tabs/SlopeTab';
import { faceAxis, faceVis, rectNodes, setFaceDir, setFaceLine } from './slopeFace';
import { buildMembers, geometry } from './build';
import Viewer3D from './Viewer3D';
import Drawing2D, { DrawingOptions, DrawingKind } from './Drawing2D';
import GridTab from './tabs/GridTab';
import MainTab, { WorkPlanePanel, saveLineTargets, placeColumnAt, saveBeam, saveBrace, View2DBar } from './tabs/MainTab';
import { DetailTab } from './tabs/EnvelopeTabs';
import GirtTab from './tabs/GirtTab';
import Sub2Tab, { SUB2_SUBS } from './tabs/Sub2Tab';
import GirtView from './GirtView';
import { GirtDraft, initialGirtDraft, draftItems, draftOpen, planeGeo, girtOf } from './girt';
import MoyaTab, { MoyaDraft, MoyaRef, initialMoyaDraft } from './tabs/MoyaTab';
import { moyaGeo, moyaOf, moyaOffsets, moyaPreview, planeFace } from './moya';
import { PcDraft, initialPcDraft, buzaiKey, pcResultOf, autoTargets } from './pieceSet';
import { PC_SUBS, draftItem } from './tabs/PiecePanel';
import CodeTab from './tabs/CodeTab';
import { BomPanel, BomTable, DrawingPanel, download } from './tabs/OutputTabs';
import { TabProps } from './ui';
import ParamsTab, { applyParams, defaultParamsForNew } from './tabs/ParamsTab';
import { ZoneTab, PaintTab } from './tabs/Classify';
import { ShipPanel, ShipTable, ShipFilter } from './tabs/ShipTab';
import { ColorBy, PickNodes } from './Viewer3D';
import { Cutter, EndTarget, cutMember, memberSpl, mergeMembers, moveEnd, nearestEnd, targetOnMember } from './editOps';
import { jointGap } from './jointGeom';
import View3DPage from './View3DPage';
import PlateEditor, { PlateEditReq } from './PlateEditor';
import FloatWin from './FloatWin';
import { Clash, findClashes } from './section3d';
import { jointPoints } from './jointPoints';
import { auxLines3D, livePlane, planeBackground, planeBasis, planeViz } from './workplane';
import CadBar from './CadBar';
import type { Tool as CadTool } from './PlateEditor';
import { installEnterNext } from './enterNext';
import { LineInput, initialLineInput, lineTargets, refLines, supFromAux, supFromMember } from './lineInput';
import type { Sup } from './lineInput';
import type { BeamInput } from './input';
import { closestMid } from './section3d';
import type { Vec3 } from './model';
import { KIND_COLOR, KIND_LABEL, jointTypeName } from './model';
import { Capacitor } from '@capacitor/core';
import { ScreenOrientation } from '@capacitor/screen-orientation';

/** Dự án mới: áp パラメーター mặc định đã lưu (nếu có) */
function newProject(): Project {
  const np = defaultProject();
  const P = defaultParamsForNew();
  if (P) {
    np.params = { ...np.params, ...structuredClone(P) };
    applyParams(np);
  }
  return np;
}

/** Công trình trắng: không trục, tầng, 部材名, cấu kiện; chỉ giữ thư viện tiết diện và パラメーター */
function blankProject(): Project {
  const np = newProject();
  np.name = 'Công trình mới';
  np.gridsX = [];
  np.gridsY = [];
  np.levels = [];
  np.master = [];
  np.joints = [];
  np.bases = [];
  np.zones = [];
  np.columns = [];
  np.beams = [];
  np.braces = [];
  np.knees = [];
  np.plates = [];
  np.planes = [];
  np.slopes = [];
  np.roof = { ...np.roof, enabled: false };
  np.walls = { ...np.walls, enabled: false };
  np.bracing = { ...np.bracing, roofBays: [], wallBays: [] };
  return np;
}

type TabId = 'params' | 'grid' | 'main' | 'slope' | 'roof' | 'wall' | 'detail' | 'code' | 'zone' | 'paint' | 'dwg' | 'ship' | 'bom';

// Tab 0: パラメーター. Tab 1: các tab còn lại.
const TABS: { id: TabId; label: string; subs: { id: string; label: string }[] }[] = [
  {
    id: 'params',
    label: '⚙ パラメーター',
    subs: [
      { id: 'weld', label: '溶接 – tiêu chuẩn hàn' },
      { id: 'member', label: 'Cột, dầm, giằng' },
      { id: 'sec2', label: '母屋・胴縁' },
      { id: 'lib', label: 'Thư viện / áp dụng' },
    ],
  },
  { id: 'grid', label: 'キープラン', subs: [{ id: 'xy', label: 'Trục X · Y' }, { id: 'lv', label: 'Cao độ tầng' }] },
  {
    id: 'main',
    label: '本体',
    subs: [
      { id: 'master', label: 'Master (部材名)' },
      { id: 'colin', label: 'Nhập cột · dầm (3D)' },
      { id: 'view2d', label: 'Mặt bằng / Trục' },
      { id: 'joint', label: '継手' },
      { id: 'shikuchi', label: '仕口' },
    ],
  },
  { id: 'slope', label: '勾配', subs: [{ id: 'faces', label: '勾配設定' }] },
  { id: 'roof', label: '母屋', subs: [{ id: 'master', label: '母屋マスター' }, { id: 'plane', label: '配置面' }, { id: 'place', label: '母屋 入力' }, { id: 'support', label: '支持ピース' }, { id: 'connect', label: '接続ピース' }, { id: 'corner', label: 'コーナーピース' }] },
  { id: 'wall', label: '胴縁', subs: [{ id: 'master', label: '胴縁マスター' }, { id: 'plane', label: '配置面' }, { id: 'input', label: '胴縁 入力' }, { id: 'support', label: '支持ピース' }, { id: 'connect', label: '接続ピース' }, { id: 'corner', label: 'コーナーピース' }] },
  {
    id: 'detail',
    label: '二次部材',
    subs: [{ id: 'master', label: '二次部材マスター' }, { id: 'sleeve', label: 'スリーブ' }, { id: 'kasa', label: 'かさ上げ材' }, { id: 'deck', label: 'デッキ' }, { id: 'temp', label: '仮設金物' }, { id: 'stud', label: 'スタッド' }, { id: 'rbrace', label: 'Giằng mái' }, { id: 'wbrace', label: 'Giằng cột' }, { id: 'conn', label: 'Liên kết & bulông' }, { id: 'flash', label: 'Diềm, máng xối' }],
  },
  { id: 'code', label: '符号管理', subs: [{ id: 'sec', label: 'Tiết diện' }, { id: 'jis', label: '規格 JIS' }, { id: 'mark', label: 'Mã cấu kiện' }, { id: 'mat', label: 'Vật liệu' }] },
  { id: 'zone', label: '工区', subs: [{ id: 'zone', label: '工区' }, { id: 'group', label: 'グループ' }, { id: 'cls', label: '分類' }] },
  { id: 'paint', label: '塗装', subs: [{ id: 'spec', label: 'Chỉ thị 塗装 / メッキ' }, { id: 'sum', label: 'Tổng hợp' }] },
  {
    id: 'dwg',
    label: '作図',
    subs: [{ id: 'plan', label: 'Mặt bằng kết cấu' }, { id: 'roof', label: 'Mặt bằng mái' }, { id: 'frame', label: 'Mặt cắt khung' }, { id: 'wall', label: 'Mặt đứng tường' }],
  },
  { id: 'ship', label: '出荷リスト', subs: [{ id: 'list', label: 'Danh sách' }, { id: 'asm', label: '組立品' }, { id: 'sum', label: '集計 工区 × グループ' }] },
  { id: 'bom', label: 'List đặt hàng', subs: [{ id: 'mark', label: 'Theo cấu kiện' }, { id: 'sec', label: 'Theo tiết diện' }] },
];

/** đổi công trình = dựng lại toàn bộ App (mọi trạng thái nhập theo dự án mới) */
export default function Root() {
  const [k, setK] = useState(0);
  return <App key={k} onSwitch={() => setK((x) => x + 1)} />;
}

/** Quét chọn cột → 大梁 nối mỗi cột với cột gần nhất theo 4 phương (±X, ±Y, gần vuông góc), bỏ cặp đã có dầm */
function girdersFromColumns(p: Project, members: Member[], ids: string[], lvId: string): Partial<BeamInput>[] {
  const el = p.levels.find((l) => l.id === lvId)?.elevation ?? 0;
  const srcs = [...new Set(ids.map((id) => members.find((m) => m.id === id)).filter((m) => m?.kind === 'column' && m.source).map((m) => m!.source!))];
  const cols = srcs.flatMap((s) => {
    const c = p.columns.find((x) => x.id === s);
    if (!c || c.role === 'post') return [];
    const ps = members.filter((m) => m.source === s && m.kind === 'column');
    const zs = ps.flatMap((m) => [m.a[2], m.b[2]]);
    if (!ps.length || Math.min(...zs) > el + 1 || Math.max(...zs) < el - 1) return [];
    return [{ c, x: ps[0].a[0], y: ps[0].a[1] }];
  });
  // dầm đã có ở tầng này (đầu mút mặt bằng)
  const have = [...new Set(members.filter((m) => m.kind === 'beam' && m.source).map((m) => m.source!))].flatMap((s) => {
    const b = p.beams.find((x) => x.id === s);
    if (!b || b.level !== lvId) return [];
    const ps = members.filter((m) => m.source === s && m.kind === 'beam').sort((u, v) => (u.piece ?? 0) - (v.piece ?? 0));
    return [[ps[0].a, ps[ps.length - 1].b] as const];
  });
  const exists = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    have.some(([u, v]) => (Math.hypot(u[0] - a.x, u[1] - a.y) < 600 && Math.hypot(v[0] - b.x, v[1] - b.y) < 600) || (Math.hypot(u[0] - b.x, u[1] - b.y) < 600 && Math.hypot(v[0] - a.x, v[1] - a.y) < 600));
  const pairs = new Set<string>();
  const out: Partial<BeamInput>[] = [];
  for (const a of cols)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let best: (typeof cols)[number] | null = null, bd = Infinity;
      for (const b of cols) {
        if (b === a) continue;
        const vx = b.x - a.x, vy = b.y - a.y, along = vx * dx + vy * dy, perp = Math.abs(vx * dy - vy * dx);
        if (along < 100 || perp > Math.max(300, along * 0.1)) continue;
        if (along < bd) { bd = along; best = b; }
      }
      if (!best) continue;
      const k = [a.c.id, best.c.id].sort().join('|');
      if (pairs.has(k)) continue;
      pairs.add(k);
      if (exists(a, best)) continue;
      const grid = a.c.x && a.c.y && best.c.x && best.c.y && !a.c.pt && !best.c.pt;
      out.push(grid ? { level: lvId, x1: a.c.x, y1: a.c.y, x2: best.c.x, y2: best.c.y, p1: null, p2: null, ref1: '', ref2: '' } : { level: lvId, x1: '', y1: '', x2: '', y2: '', p1: [Math.round(a.x), Math.round(a.y)], p2: [Math.round(best.x), Math.round(best.y)], ref1: a.c.id, ref2: best.c.id });
    }
  return out;
}

function App({ onSwitch }: { onSwitch: () => void }) {
  const [init] = useState(() => openInitial(newProject));
  const [pjOpen, setPjOpen] = useState(false);
  const [hist, setHist] = useState<{ past: Project[]; present: Project; future: Project[] }>(() => ({ past: [], present: init.p, future: [] }));
  const p = hist.present;
  const [tab, setTab] = useState<TabId>('grid');
  const [subs, setSubs] = useState<Record<TabId, string>>(() => Object.fromEntries(TABS.map((t) => [t.id, t.subs[0].id])) as Record<TabId, string>);
  const [selected, setSelected] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [dwg, setDwg] = useState<Omit<DrawingOptions, 'kind'>>({ levelId: p.levels[1]?.id ?? p.levels[0]?.id ?? '', gridXId: p.gridsX[0]?.id ?? '', wallSide: 'front', showMarks: true, filterBy: '', filterVal: '' });
  const [shipF, setShipF] = useState<ShipFilter>({ zone: '', group: '', cls: '' });
  const [colIn, setColIn] = useRemembered('col', p, () => initialColumnInput(p), ['xs', 'ys']);
  const [show3d, setShow3d] = useState(false);
  // độ rộng bảng làm việc (bên phải) – kéo thanh chia để đổi
  const [pw, setPw] = useState(() => {
    try { return Math.max(300, Math.min(900, +(localStorage.getItem('s3t.pw') ?? '') || 470)); } catch { return 470; }
  });
  const [splitOn, setSplitOn] = useState(false);
  const onSplit = (e: React.PointerEvent) => {
    e.preventDefault();
    setSplitOn(true);
    let w = pw;
    const mv = (ev: PointerEvent) => {
      w = Math.max(300, Math.min(Math.min(900, window.innerWidth - 300), window.innerWidth - ev.clientX - 3));
      setPw(w);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      setSplitOn(false);
      try { localStorage.setItem('s3t.pw', String(Math.round(w))); } catch { /* bỏ qua */ }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  // cửa sổ 作業平面 (riêng, kéo di chuyển / đổi kích thước)
  const [planeWin, setPlaneWin] = useState(false);
  const [cadTool, setCadTool] = useState<CadTool | undefined>(undefined);
  const [v2d, setV2d] = useState(() => initialView2D(p));
  // 勾配設定: mặt đang sửa + đang bấm giao trục
  const [slopeActive, setSlopeActive] = useState<string | null>(null);
  const [slopePick, setSlopePick] = useState(false);
  const [slopeView, setSlopeView] = useState<'2d' | '3d'>('2d');
  // tab 母屋
  const [moyaDraft, setMoyaDraft] = useRemembered<MoyaDraft>('moya', p, initialMoyaDraft);
  const [moyaView, setMoyaView] = useState<'2d' | '3d'>('2d');
  const [moyaSel, setMoyaSel] = useState<string | null>(null);
  const [girtDraft, setGirtDraft] = useRemembered<GirtDraft>('girt', p, initialGirtDraft);
  const [girtPlane, setGirtPlane] = useState('');
  const [girtView, setGirtView] = useState<'2d' | '3d'>('2d');
  const [girtSel, setGirtSel] = useState<string | null>(null);
  // ピース nhập tay (母屋 / 胴縁): nhớ các tuỳ chọn lần trước, bỏ phần chọn
  const [pcDraft, setPcDraft0] = useState<PcDraft>(() => {
    try { const o = JSON.parse(localStorage.getItem('s3t.in.pc') ?? '{}'); return { ...initialPcDraft(), method: o.method === 2 ? 2 : 1, piece: o.piece ?? 'マスター参照', align: o.align ?? '中', side: o.side ?? '背', leg: o.leg ?? '外', off: Number(o.off) || 0, auto: o.auto ?? true }; } catch { return initialPcDraft(); }
  });
  const setPcDraft = (d: PcDraft) => { setPcDraft0(d); try { localStorage.setItem('s3t.in.pc', JSON.stringify({ method: d.method, piece: d.piece, align: d.align, side: d.side, leg: d.leg, off: d.off, auto: d.auto })); } catch { /* */ } };
  const [pcSel, setPcSel] = useState<string | null>(null);
  const slopeRect = useRef<string | null>(null);
  // tab 勾配: nhập trên Mặt bằng của tầng có 勾配 đang sửa
  const slopeLv = (p.slopeFaces ?? []).find((x) => x.id === slopeActive)?.level;
  useEffect(() => {
    // chỉ chuyển 1 lần khi bắt đầu sửa 1 勾配 – sau đó người dùng tự do xem mặt đứng các trục
    if (tab !== 'slope' || slopeView !== '2d' || !slopeActive) return;
    const lv = slopeLv;
    setV2d((v) => (v.view === 'plan' && (!lv || v.levelId === lv) ? v : { ...v, view: 'plan', levelId: lv ?? v.levelId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, slopeView, slopeActive, slopeLv]);
  const slopeVis = useMemo(
    () => (tab === 'slope' ? (p.slopeFaces ?? []).map((f) => { const v = faceVis(p, f); return v && { ...v, active: f.id === slopeActive, ok: f.ok !== false, label: f.name }; }).filter((v): v is NonNullable<typeof v> => !!v) : undefined),
    [tab, p, slopeActive],
  );
  // xoay ngang bằng CSS (app / trình duyệt khoá màn hình dọc)
  const [forceLand, setForceLand] = useState(() => {
    try { return localStorage.getItem('s3t.land') === '1'; } catch { return false; }
  });
  const [rotOk, setRotOk] = useState(forceLand);
  const [hwLand, setHwLand] = useState(false);
  // bản điện thoại (màn hình dọc): bố cục riêng + thanh chuyển Hình / Cả hai / Nhập
  const mobQ = '(max-width: 700px) and (orientation: portrait)';
  const [mobScr, setMobScr] = useState(() => typeof window !== 'undefined' && window.matchMedia(mobQ).matches);
  useEffect(() => {
    const mq = window.matchMedia(mobQ);
    const on = () => setMobScr(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const mob = mobScr && !(forceLand && !hwLand);
  const [mview, setMview0] = useState<'view' | 'split' | 'panel'>(() => {
    try { const v = localStorage.getItem('s3t.mv'); return v === 'view' || v === 'panel' ? v : 'split'; } catch { return 'split'; }
  });
  const setMview = (v: 'view' | 'split' | 'panel') => { setMview0(v); try { localStorage.setItem('s3t.mv', v); } catch { /* bỏ qua */ } };
  useEffect(() => {
    document.documentElement.classList.toggle('mob', mob);
    // khung hình đổi cỡ → 3D / SVG tự tính lại
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(t);
  }, [mob, mview]);
  // xoay màn hình thật (app Android / app đã cài) để bàn phím cũng nằm ngang; không được thì xoay bằng CSS
  useEffect(() => {
    let live = true;
    const so = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void>; unlock?: () => void } }).orientation;
    if (forceLand) {
      const p = Capacitor.isNativePlatform() ? ScreenOrientation.lock({ orientation: 'landscape' }) : so?.lock ? so.lock('landscape') : Promise.reject();
      p.then(() => {
        if (!live) return;
        setHwLand(true);
        // khoá báo xong mà màn hình vẫn dọc (máy không hỗ trợ) → quay về xoay bằng CSS
        setTimeout(() => { if (live && window.matchMedia('(orientation: portrait)').matches) setHwLand(false); }, 1200);
      }).catch(() => { if (live) setHwLand(false); });
    } else {
      setHwLand(false);
      if (Capacitor.isNativePlatform()) ScreenOrientation.unlock().catch(() => { /* bỏ qua */ });
      else try { so?.unlock?.(); } catch { /* bỏ qua */ }
    }
    return () => { live = false; };
  }, [forceLand]);
  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('force-land', forceLand && !hwLand);
    try { localStorage.setItem('s3t.land', forceLand ? '1' : '0'); } catch { /* bỏ qua */ }
    const size = () => {
      el.style.setProperty('--vw', `${window.innerWidth}px`);
      el.style.setProperty('--vh', `${window.innerHeight}px`);
      window.dispatchEvent(new Event('s3t-rot'));
    };
    size();
    window.addEventListener('resize', size);
    return () => window.removeEventListener('resize', size);
  }, [forceLand, hwLand]);
  const [beamIn, setBeamIn] = useRemembered('beam', p, () => initialBeamInput(p), ['x1', 'y1', 'x2', 'y2', 'p1', 'p2', 'ref1', 'ref2']);
  const [braceIn, setBraceIn] = useRemembered('brace', p, () => initialBraceInput(p), ['x1', 'y1', 'x2', 'y2', 'p1', 'p2', 'ref1', 'ref2']);
  // nhập 間柱 / 小梁 theo đường chuẩn
  const [lineIn, setLineIn] = useRemembered<LineInput>('line', p, initialLineInput, ['s1', 's2', 'ref', 'ref2']);
  // tầng dùng khi bấm đường trục làm 部材 đỡ (間柱 / 小梁)
  const [lineLv, setLineLv] = useState<string>(() => [...p.levels].sort((a, b) => a.elevation - b.elevation)[1]?.id ?? p.levels[0]?.id ?? '');
  // nhập ブレース theo giao điểm 2 部材: các 部材 đã bấm
  const [brPick, setBrPick] = useState<{ ids: string[]; names: string[]; q1?: Vec3; n1?: string }>({ ids: [], names: [] });
  const [pending, setPending] = useState<Pending | null>(null);
  const [jp, setJp] = useState<string | null>(null);
  const [kneeIn, setKneeIn] = useRemembered<KneeInput>('knee', p, () => ({ memberId: (p.master.find((m) => m.role === 'knee') ?? p.master.find((m) => m.kind === 'brace'))?.id ?? '', dc: 600, db: 600 }));
  const [plateEdit, setPlateEdit] = useState<PlateEditReq | null>(null);
  /** 作業平面 đang vẽ 補助線 */
  const [auxEdit, setAuxEdit] = useState<string | null>(null);
  const [planeDraft, setPlaneDraft] = useState<{ o: Vec3; u: Vec3; v: Vec3 } | null>(null);
  const [pk, setPk] = useRemembered<PickState>('pick', p, () => ({ kind: 'column', on: true, start: null, editId: null }), ['on', 'start', 'editId', 'first', 'fix', 'fixSel', 'del', 'delSel', 'cut', 'cutSrc', 'merge', 'mergeSrc', 'data', 'dataSrc', 'dataLine', 'opMsg']);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const set: TabProps['set'] = useCallback((fn) => {
    setHist((h) => {
      const next = structuredClone(h.present);
      fn(next);
      return { past: [...h.past.slice(-99), h.present], present: next, future: [] };
    });
  }, []);
  const replace = (np: Project) => setHist((h) => ({ past: [...h.past.slice(-99), h.present], present: np, future: [] }));
  const undo = () => setHist((h) => (h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h));
  const redo = () => setHist((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h));

  useEffect(() => {
    saveProj(init.id, p);
  }, [p, init.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const members = useMemo(() => buildMembers(p), [p]);
  const planes = useMemo(() => (p.planes ?? []).map((pl) => livePlane(p, members, pl)), [p, members]);
  // 補助線 bấm chọn được + đường chuẩn (trục / 補助線) cho nhập 間柱 · 小梁
  const auxLines = useMemo(() => auxLines3D(planes), [planes]);
  const refs = useMemo(() => {
    const r = refLines(p, auxLines);
    // đường chuẩn = 部材 xung quanh (trục 部材 trên mặt bằng; cột → đường qua tâm cột vuông góc 部材 đỡ đầu)
    for (const key of [lineIn.ref, lineIn.ref2 ?? '']) {
      if (!key.startsWith('mem:') || r.some((x) => x.key === key)) continue;
      const m = members.find((x) => x.id === key.slice(4));
      if (m) {
        const dx = m.b[0] - m.a[0], dy = m.b[1] - m.a[1];
        if (Math.hypot(dx, dy) > 1) r.push({ key, label: `部材 ${m.mark}`, a: [m.a[0], m.a[1]], b: [m.b[0], m.b[1]] });
        else {
          const s = lineIn.s1;
          const ux = s ? s.b[0] - s.a[0] : 1, uy = s ? s.b[1] - s.a[1] : 0, l = Math.hypot(ux, uy) || 1;
          r.push({ key, label: `部材 ${m.mark} (tâm cột)`, a: [m.a[0], m.a[1]], b: [m.a[0] - (uy / l) * 1000, m.a[1] + (ux / l) * 1000] });
        }
      }
    }
    return r;
  }, [p, auxLines, lineIn.ref, lineIn.ref2, lineIn.s1, members]);
  // 母屋: 基準線 = trục / 補助線 / 大梁 (kể cả 隅梁 chéo)
  const moyaRefs: MoyaRef[] = useMemo(() => {
    if (tab !== 'roof') return [];
    const out: MoyaRef[] = refLines(p, auxLines).filter((r) => !r.key.startsWith('lv:')).map((r) => ({ key: r.key, label: r.label, a: [r.a[0], r.a[1]], b: [r.b[0], r.b[1]] }));
    const bySrc = new Map<string, Member[]>();
    for (const m of members) if (m.kind === 'beam' && m.source) bySrc.set(m.source, [...(bySrc.get(m.source) ?? []), m]);
    for (const [src, ms] of bySrc) {
      const pts = ms.flatMap((m) => [m.a, m.b]);
      const a = pts[0];
      let far = pts[0], dm = -1;
      for (const q of pts) { const d0 = Math.hypot(q[0] - a[0], q[1] - a[1]); if (d0 > dm) { dm = d0; far = q; } }
      let near = far; dm = -1;
      for (const q of pts) { const d0 = Math.hypot(q[0] - far[0], q[1] - far[1]); if (d0 > dm) { dm = d0; near = q; } }
      if (dm < 100) continue;
      const nm = ms[0].name ?? ms[0].mark;
      const diag = Math.abs(near[0] - far[0]) > 1 && Math.abs(near[1] - far[1]) > 1;
      const sb = p.beams.find((x) => x.id === src);
      const lvN = p.levels.find((l) => l.id === sb?.level)?.name ?? '';
      out.push({ key: `bm:${src}`, label: `${diag ? '隅梁' : sb?.role === 'sub' ? '小梁' : '大梁'} ${nm} ${lvN} (${Math.round(near[0])},${Math.round(near[1])})→(${Math.round(far[0])},${Math.round(far[1])})`, a: [near[0], near[1]], b: [far[0], far[1]] });
    }
    return out;
  }, [tab, p, auxLines, members]);
  // ---- kiểm tra va chạm sau khi nhập: cấu kiện mới / vừa sửa so với cấu kiện cũ ----
  const [clashes, setClashes] = useState<{ list: Clash[]; full: boolean } | null>(null);
  const sigRef = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const sig = new Map<string, string>();
    for (const m of members) if (m.source) sig.set(m.source, (sig.get(m.source) ?? '') + `${m.kind}${m.section.id}${m.a.map(Math.round)}${m.b.map(Math.round)};`);
    const prev = sigRef.current;
    sigRef.current = sig;
    if (!prev || !prev.size) return;
    const changed = [...sig.keys()].filter((k) => prev.get(k) !== sig.get(k));
    if (!changed.length) return;
    if (changed.length > 30) return; // mở công trình / thay đổi hàng loạt: không báo
    const set0 = new Set(changed);
    const list = findClashes(members.filter((m) => m.source && set0.has(m.source)), members);
    setClashes(list.length ? { list, full: false } : null);
  }, [members]);
  const checkAllClashes = () => setClashes({ list: findClashes(members.filter((m) => m.kind === 'column' || m.kind === 'beam' || m.kind === 'brace' || m.kind === 'rafter'), members), full: true });
  const totalKg = members.reduce((a, m) => a + m.weight, 0);
  const sub = subs[tab];
  const tabDef = TABS.find((t) => t.id === tab)!;
  const props: TabProps = { p, set, sub, members };

  const saveJson = () => download(`${p.name || 'du-an'}.steel3t.json`, JSON.stringify(p, null, 2), 'application/json');
  const openJson = (f: File) =>
    f.text().then((t) => {
      try {
        const np = migrate(JSON.parse(t));
        if (!np.gridsX || !np.levels) throw new Error('Sai định dạng');
        replace(np);
      } catch (e) {
        alert('Không đọc được file dự án: ' + (e as Error).message);
      }
    });
  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    download(`${p.name}-${sub}.svg`, new XMLSerializer().serializeToString(svg), 'image/svg+xml');
  };

  // Nhập trực tiếp trên 3D (本体 › Nhập cột · dầm)
  // Mặt bằng / Trục: tầng đang xem = tầng nhập dầm (liên kết với bảng Nhập cột · dầm)
  useEffect(() => {
    if (sub === 'view2d' && v2d.view === 'plan' && v2d.levelId && v2d.levelId !== beamIn.level) setBeamIn((b) => ({ ...b, level: v2d.levelId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub, v2d.view, v2d.levelId]);
  const inputOn = tab === 'main' && (sub === 'colin' || sub === 'view2d') && pk.on;
  const mid3 = (s: { a: Vec3; b: Vec3 }): Vec3 => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2];
  /** 削除 (chọn nhiều / quét chọn) · 切断 · 結合 trên 3D */
  const editPick = (): PickNodes => {
    const srcOf = (id: string) => members.find((x) => x.id === id)?.source;
    const editable = (src?: string) => !!src && (p.columns.some((c) => c.id === src) || p.beams.some((b) => b.id === src) || (p.braces ?? []).some((b) => b.id === src) || (p.knees ?? []).some((k) => k.id === src));
    const nameOf = (src: string) => members.find((m) => m.source === src)?.mark ?? '?';
    if (pk.del) {
      const sel = pk.delSel ?? [];
      return {
        z: 0,
        mode: 'member',
        startMember: null,
        selSrc: sel,
        hint: `削除: bấm từng cây hoặc kéo khung quét chọn (trái→phải: nằm trọn trong khung · phải→trái: chạm khung · Shift: thêm) · đã chọn ${sel.length} · Delete / Enter = xoá · Esc = bỏ chọn · Alt + kéo = xoay`,
        onNode: () => undefined,
        onMember: (id) => {
          const src = srcOf(id);
          if (!editable(src)) return;
          setPk({ ...pk, delSel: sel.includes(src!) ? sel.filter((x) => x !== src) : [...sel, src!] });
        },
        onBox: (ids, add) => {
          const srcs = [...new Set(ids.map(srcOf).filter((x): x is string => editable(x)))];
          setPk({ ...pk, delSel: add ? [...new Set([...sel, ...srcs])] : srcs });
        },
      };
    }
    if (pk.fix) {
      // 修正: bấm 1 cây = sửa cây đó; kéo khung quét chọn nhiều cây (Shift: thêm) = sửa hàng loạt
      const sel = pk.fixSel ?? [];
      return {
        z: 0,
        mode: 'member',
        startMember: null,
        selSrc: sel,
        hint: `修正: bấm 1 cây để sửa, hoặc kéo khung quét chọn nhiều cây (trái→phải: nằm trọn · phải→trái: chạm khung · Shift: thêm / bớt) · đã chọn ${sel.length} · Esc = bỏ chọn · Alt + kéo = xoay`,
        onNode: () => undefined,
        onMember: (id) => {
          const src = srcOf(id);
          if (!editable(src)) return;
          if ((window.event as MouseEvent | undefined)?.shiftKey) {
            const next = sel.includes(src!) ? sel.filter((x) => x !== src) : [...sel, src!];
            setPk({ ...pk, fixSel: next, editId: next.length === 1 ? pk.editId : null });
            if (next.length === 1) setSelected(members.find((m) => m.source === next[0])?.id ?? null);
            return;
          }
          setPk({ ...pk, fixSel: [src!] });
          setSelected(id);
        },
        onBox: (ids, add) => {
          const srcs = [...new Set(ids.map(srcOf).filter((x): x is string => editable(x)))];
          const next = add ? [...new Set([...sel, ...srcs])] : srcs;
          setPk({ ...pk, fixSel: next, editId: null });
          setSelected(next.length === 1 ? members.find((m) => m.source === next[0])?.id ?? null : null);
        },
      };
    }
    if (pk.data) {
      const how = pk.dataHow ?? 'pt';
      const ds = pk.dataSrc, dl = pk.dataLine;
      const endName = (k: 0 | 1) => (k === 0 ? 'đầu' : 'cuối');
      const apply = (src: string, k: 0 | 1, t: EndTarget) => {
        const err = moveEnd(structuredClone(p), src, k, t);
        if (!err) set((d) => void moveEnd(d, src, k, t));
        setPk({ ...pk, dataSrc: err && how === 'pt' ? ds : null, dataLine: err && how === 'line' ? dl : null, opMsg: err ? { ok: false, text: err } : { ok: true, text: `Đã nối điểm ${endName(k)} của ${nameOf(src)} tới ${t.label}. (↶ để hoàn tác)` } });
      };
      const lineOf = (k: 'gx' | 'gy' | 'lv', id: string): EndTarget | undefined => {
        const g = geometry(p);
        if (k === 'lv') {
          const l = p.levels.find((x) => x.id === id);
          return l && { z: l.elevation, label: `tầng ${l.name}` };
        }
        const v = (k === 'gx' ? g.xs : g.ys).get(id) ?? 0;
        const nm = (k === 'gx' ? p.gridsX : p.gridsY).find((x) => x.id === id)?.name ?? '?';
        return { line: { a: k === 'gx' ? [v, 0] : [0, v], b: k === 'gx' ? [v, 1000] : [1000, v] }, label: `通り ${nm}` };
      };
      const auxOf = (key: string): EndTarget | undefined => {
        const l = auxLines.find((x) => x.key === key);
        if (!l) return undefined;
        const flat = Math.abs(l.a[2] - l.b[2]) < 1;
        const plan = Math.hypot(l.a[0] - l.b[0], l.a[1] - l.b[1]) > 1;
        return { line: plan ? { a: [l.a[0], l.a[1]], b: [l.b[0], l.b[1]] } : undefined, z: flat ? l.a[2] : undefined, label: l.label };
      };
      if (how === 'line') {
        // cách 2: chọn đường chuẩn trước, rồi bấm 部材 cần nối (đầu gần đường chuẩn được kéo / cắt tới đó)
        return {
          z: 0,
          mode: 'member',
          startMember: null,
          hint: dl ? `データ: bấm 部材 cần nối tới ${dl.label} (đầu gần nhất sẽ kéo dài / cắt ngắn tới đó)` : 'データ: bấm đường chuẩn – đường trục, đường tầng hoặc 補助線',
          onNode: () => undefined,
          onGrid: dl ? undefined : (k, id) => { const t = lineOf(k, id); if (t) setPk({ ...pk, dataLine: t, opMsg: null }); },
          onAux: dl ? undefined : (key) => { const t = auxOf(key); if (t) setPk({ ...pk, dataLine: t, opMsg: null }); },
          onMember: (id, hit) => {
            const m = members.find((x) => x.id === id);
            if (!dl || !m?.source || !editable(m.source)) return;
            // đầu gần đường chuẩn: theo cao độ (đường tầng) hoặc khoảng cách mặt bằng tới đường
            const ps = members.filter((x) => x.source === m.source).sort((a, b) => (a.piece ?? 0) - (b.piece ?? 0));
            const A = ps[0].a, B = ps[ps.length - 1].b;
            let k: 0 | 1;
            if (dl.line) {
              const [a, b] = [dl.line.a, dl.line.b];
              const dist = (q: Vec3) => Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1);
              k = dist(A) <= dist(B) ? 0 : 1;
            } else k = Math.abs(A[2] - (dl.z ?? 0)) <= Math.abs(B[2] - (dl.z ?? 0)) ? 0 : 1;
            void hit;
            apply(m.source, k, dl);
          },
        };
      }
      // cách 1: bấm gần 1 đầu của 部材 cần sửa, rồi bấm điểm đích (部材 / đường trục / tầng / 補助線)
      return {
        z: 0,
        mode: 'member',
        startMember: ds?.src ?? null,
        hint: ds ? `データ: điểm ${endName(ds.k)} của ${nameOf(ds.src)} → bấm 部材 / đường trục / tầng / 補助線 muốn nối tới (bấm lại cây đang chọn để bỏ)` : 'データ: bấm gần đầu cần sửa của cột / dầm',
        onNode: () => undefined,
        onMember: (id, hit) => {
          const m = members.find((x) => x.id === id);
          if (!m?.source) return;
          if (!ds) {
            if (!p.beams.some((b) => b.id === m.source) && !p.columns.some((c) => c.id === m.source)) return setPk({ ...pk, opMsg: { ok: false, text: 'データ: chỉ sửa được cột và dầm.' } });
            return setPk({ ...pk, dataSrc: { src: m.source, k: nearestEnd(members, m.source, hit) }, opMsg: null });
          }
          if (m.source === ds.src) return setPk({ ...pk, dataSrc: null, opMsg: null });
          apply(ds.src, ds.k, targetOnMember(members, m, hit));
        },
        onGrid: !ds ? undefined : (k, id) => { const t = lineOf(k, id); if (t) apply(ds.src, ds.k, t); },
        onAux: !ds ? undefined : (key) => { const t = auxOf(key); if (t) apply(ds.src, ds.k, t); },
      };
    }
    if (pk.cut) {
      const src = pk.cutSrc;
      const doCut = (c: Cutter) => {
        // kiểm tra trên bản sao trước (set chạy trễ), hợp lệ mới cắt thật
        const opts = { autoSpl: pk.cutJoint !== 'none' && pk.cutSpl !== false, gap: pk.cutGap ?? undefined, jointId: pk.cutJoint && pk.cutJoint !== 'none' ? pk.cutJoint : undefined };
        const err = cutMember(structuredClone(p), members, src!, c, opts);
        if (!err) set((d) => void cutMember(d, members, src!, c, opts));
        const spl = !err && opts.autoSpl ? (opts.jointId ? p.joints.find((j) => j.id === opts.jointId) : undefined) ?? memberSpl(p, src!) : undefined;
        setPk({ ...pk, cutSrc: err ? src : null, opMsg: err ? { ok: false, text: err } : { ok: true, text: `Đã cắt ${nameOf(src!)} tại ${c.kind === 'member' ? c.m.mark : c.label}${spl ? ` · thêm SPL ${spl.name}` : ''}${opts.gap ?? (spl ? jointGap(spl) : 0) ? ` · hở ${opts.gap ?? jointGap(spl!)} mm` : ''}. Bấm cây khác để cắt tiếp (↶ để hoàn tác).` } });
      };
      return {
        z: 0,
        mode: 'member',
        startMember: src ?? null,
        hint: src ? `切断 ${nameOf(src)}: bấm đường chuẩn – đường trục, đường tầng, 補助線 hoặc 部材 (bấm lại cây đang chọn để bỏ)` : '切断: bấm cột / dầm cần cắt',
        onNode: () => undefined,
        onMember: (id) => {
          const m = members.find((x) => x.id === id);
          if (!m?.source) return;
          if (!src) {
            if (!p.beams.some((b) => b.id === m.source) && !p.columns.some((c) => c.id === m.source)) return setPk({ ...pk, opMsg: { ok: false, text: 'Chỉ cắt được cột và dầm.' } });
            return setPk({ ...pk, cutSrc: m.source, opMsg: null });
          }
          if (m.source === src) return setPk({ ...pk, cutSrc: null, opMsg: null });
          doCut({ kind: 'member', m });
        },
        // bước 1 (chưa chọn cây) không bắt đường trục / 補助線 để bấm trúng dầm nằm trên đường trục
        onGrid: !src ? undefined : (k, id) => {
          const g = geometry(p);
          if (k === 'lv') {
            const l = p.levels.find((x) => x.id === id);
            if (l) doCut({ kind: 'level', z: l.elevation, label: `tầng ${l.name}` });
            return;
          }
          const gx = k === 'gx' ? p.gridsX.find((x) => x.id === id) : p.gridsY.find((x) => x.id === id);
          const v = (k === 'gx' ? g.xs : g.ys).get(id) ?? 0;
          doCut({ kind: 'grid', a: k === 'gx' ? [v, g.y0] : [g.x0, v], b: k === 'gx' ? [v, g.yN + 1] : [g.xN + 1, v], label: `通り ${gx?.name ?? '?'}` });
        },
        onAux: !src ? undefined : (key) => {
          const l = auxLines.find((x) => x.key === key);
          if (l) doCut({ kind: 'aux', a: l.a, b: l.b, label: l.label });
        },
      };
    }
    // 結合: giữ nguyên 2 cây, nối SPL (nếu có) hoặc hàn + 合掌プレート
    const a = pk.mergeSrc;
    const mo = { plate: pk.mergePlate !== false, jointId: pk.mergeJoint || undefined };
    return {
      z: 0,
      mode: 'member',
      startMember: a ?? null,
      hint: a ? `結合: bấm cây thứ 2 nối với ${nameOf(a)} (bấm lại cây 1 để bỏ)` : '結合: bấm cây thứ 1 (cột, dầm, 屋根梁…)',
      onNode: () => undefined,
      onMember: (id) => {
        const m = members.find((x) => x.id === id);
        if (!m?.source) return;
        if (!editable(m.source)) return setPk({ ...pk, opMsg: { ok: false, text: 'Chỉ nối được cột, dầm, ブレース, 方杖 đã nhập.' } });
        if (!a) return setPk({ ...pk, mergeSrc: m.source, opMsg: null });
        if (m.source === a) return setPk({ ...pk, mergeSrc: null, opMsg: null });
        const r = mergeMembers(structuredClone(p), members, a, m.source, mo);
        if (!r.err) set((d) => void mergeMembers(d, members, a, m.source!, mo));
        const how = r.link?.type === 'spl' ? (() => { const j = p.joints.find((q) => q.id === r.link!.jointId); return j ? `継手 ${j.name} (${jointTypeName(j.type)})` : '継手'; })() : r.link?.plate ? `hàn + 合掌プレート ${r.link.plate.name}` : 'hàn';
        setPk({ ...pk, mergeSrc: r.err ? a : null, opMsg: r.err ? { ok: false, text: r.err } : { ok: true, text: `Đã nối ${nameOf(a)} + ${m.mark} bằng ${how}. 2 cây giữ nguyên. (↶ để hoàn tác)` } });
      },
    };
  };
  const editOn = tab === 'main' && (sub === 'colin' || sub === 'view2d') && !!(pk.del || pk.cut || pk.merge || pk.data || pk.fix);
  const pickNodes: PickNodes | null = useMemo(() => {
    if (tab === 'slope') {
      const f = (p.slopeFaces ?? []).find((x) => x.id === slopeActive);
      // không có lệnh 勾配 đang chạy + đang xem 3D → không bắt điểm, không hiện chú thích
      if (!f && slopeView === '3d') return null;
      const lvZ = p.levels.find((l) => l.id === f?.level)?.elevation ?? 0;
      const line = f?.mode === 'line';
      const upd = (fn: (v: NonNullable<typeof f>, d: Project) => void) =>
        set((d) => {
          const v = d.slopeFaces?.find((q) => q.id === f?.id);
          if (v) fn(v, d);
        });
      return {
        z: lvZ,
        hint: !f
          ? 'Bấm “+ 勾配 vùng” hoặc “+ 勾配 đường” ở bảng bên phải.'
          : line
            ? `${f.name}: bấm 1 đường trục – các cây trên trục đó nghiêng theo 勾配`
            : `${f.name}: kéo khung quét vùng (hoặc bấm 2 góc đối diện / các góc) – đã có ${f.pts.length} điểm`,
        onNode: (x: string, y: string) => {
          if (!f || line) return;
          upd((v, d) => {
            const last = v.pts[v.pts.length - 1];
            if (last && last[0] === x && last[1] === y) return;
            if (v.pts.length === 4 && slopeRect.current === v.id) v.pts = [];
            slopeRect.current = null;
            v.pts.push([x, y]);
            setFaceDir(d, v, faceAxis(d, v) ?? 'y');
          });
        },
        onGrid: (kind: 'gx' | 'gy' | 'lv', id: string) => {
          if (!f || kind === 'lv' || !line) return;
          upd((v, d) => setFaceLine(d, v, id));
        },
        onRect: (x0: number, y0: number, x1: number, y1: number) => {
          if (!f || line) return;
          upd((v, d) => {
            const r = rectNodes(d, x0, y0, x1, y1);
            if (!r) return;
            v.pts = r;
            slopeRect.current = v.id;
            setFaceDir(d, v, faceAxis(d, v) ?? 'y');
          });
        },
      };
    }
    if (editOn) return editPick();
    if (!inputOn) return null;
    const g = geometry(p);
    if (pk.kind === 'post' || pk.kind === 'sbeam') {
      const step = !lineIn.s1 ? 1 : !lineIn.s2 ? 2 : 3;
      const what = pk.kind === 'post' ? '間柱' : '小梁';
      // bước 3: chọn đường chuẩn; cách 'div' chọn lần lượt đường giới hạn 1 rồi 2 (bấm tiếp = chọn lại từ đầu)
      const setRef = (key: string) => {
        if (lineIn.mode !== 'div') return setLineIn({ ...lineIn, ref: key });
        if (!lineIn.ref || lineIn.ref2) return setLineIn({ ...lineIn, ref: key, ref2: '' });
        if (key === lineIn.ref) return;
        setLineIn({ ...lineIn, ref2: key });
      };
      return {
        z: 0,
        mode: 'member',
        startMember: null,
        hint:
          step === 1
            ? pk.kind === 'post' ? `${what}: bấm 部材 / 補助線 / đường trục dưới (điểm đầu – chân)` : `${what}: bấm 部材 / 補助線 / đường trục đỡ đầu 1 (điểm đầu) · đường trục lấy ở tầng ${p.levels.find((l) => l.id === lineLv)?.name ?? ''} (bấm nhãn tầng để đổi)`
            : step === 2
              ? pk.kind === 'post' ? `${what}: bấm 部材 / 補助線 trên (điểm cuối – đỉnh)` : `${what}: bấm 部材 / 補助線 đỡ đầu 2 (điểm cuối)`
              : lineIn.mode === 'div'
                ? !lineIn.ref ? `${what} hàng loạt: bấm đường giới hạn 1 (đường trục / 補助線 / 部材)` : !lineIn.ref2 ? `${what} hàng loạt: bấm đường giới hạn 2 (song song với đường 1)` : `${what} hàng loạt: nhập số lượng ở bảng rồi ✓ Xác nhận (Enter) · bấm đường khác để chọn lại`
                : lineIn.mode === 'arr'
                  ? !lineIn.ref ? `${what} hàng loạt: bấm đường chuẩn (đường trục / 補助線 / 部材)` : `${what} hàng loạt: nhập số lượng và khoảng cách ở bảng rồi ✓ Xác nhận (Enter)`
                  : `${what}: chọn đường chuẩn (bấm đường trục / đường tầng / 補助線 / 部材 xung quanh hoặc chọn ở bảng) và khoảng cách · Enter = xác nhận`,
        onNode: () => undefined,
        // quét chọn nhiều 大梁 song song → 小梁 giữa từng cặp kề nhau (rồi chọn đường chuẩn / đường giới hạn)
        onBox: pk.kind === 'sbeam' ? (ids) => {
          const srcs = [...new Set(ids.map((id) => members.find((m) => m.id === id)).filter((m) => m && m.kind === 'beam' && m.source && p.beams.some((b) => b.id === m.source && b.role !== 'sub')).map((m) => m!.source!))];
          const sups = srcs.map((s) => supFromMember(members.find((m) => m.source === s)!, members)).filter((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1);
          const ang = (s: Sup) => { const a = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]); return ((a % Math.PI) + Math.PI) % Math.PI; };
          const groups: Sup[][] = [];
          for (const s of sups) {
            const gp = groups.find((gg) => { const d = Math.abs(ang(gg[0]) - ang(s)); return Math.min(d, Math.PI - d) < 0.05; });
            if (gp) gp.push(s); else groups.push([s]);
          }
          const best = groups.sort((a, b) => b.length - a.length)[0] ?? [];
          if (best.length < 2) return setLineIn({ ...lineIn, s1: null, s2: null, multi: undefined });
          const a0 = ang(best[0]), nx = -Math.sin(a0), ny = Math.cos(a0);
          const key = (s: Sup) => nx * (s.a[0] + s.b[0]) / 2 + ny * (s.a[1] + s.b[1]) / 2;
          best.sort((a, b) => key(a) - key(b));
          setLineIn({ ...lineIn, s1: best[0], s2: best[1], multi: best.length > 2 ? best : undefined });
        } : undefined,
        onAux: (key: string) => {
          const l = auxLines.find((x) => x.key === key);
          if (!l) return;
          if (step === 1) return setLineIn({ ...lineIn, s1: supFromAux(l) });
          if (step === 2) return setLineIn({ ...lineIn, s2: supFromAux(l) });
          setRef(`aux:${key}`);
        },
        onMember: (id) => {
          const m = members.find((x) => x.id === id);
          if (!m) return;
          // bước 3: 部材 xung quanh làm đường chuẩn
          if (step === 3) return setRef(`mem:${m.id}`);
          // 小梁 đỡ được bởi cột (dùng với đường chuẩn = tầng); 間柱 chỉ đỡ bởi 部材 nằm ngang / nghiêng
          const vert = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) < 1;
          if (vert && !(pk.kind === 'sbeam' && m.kind === 'column')) return;
          if (step === 1) return setLineIn({ ...lineIn, s1: supFromMember(m, members), s2: null });
          setLineIn({ ...lineIn, s2: supFromMember(m, members) });
        },
        onGrid: (k, id) => {
          if (step === 3) return setRef(`${k}:${id}`);
          if (k === 'lv') return setLineLv(id);
          // đường trục ở cao độ tầng lineLv làm 部材 đỡ
          const z = g.lv.get(lineLv) ?? 0;
          const lvName = p.levels.find((l) => l.id === lineLv)?.name ?? '';
          const nm = (k === 'gx' ? p.gridsX : p.gridsY).find((x) => x.id === id)?.name ?? '?';
          const v = (k === 'gx' ? g.xs : g.ys).get(id) ?? 0;
          const sup = { kind: 'aux' as const, label: `通り ${nm} @ ${lvName}`, a: (k === 'gx' ? [v, g.y0, z] : [g.x0, v, z]) as Vec3, b: (k === 'gx' ? [v, g.yN, z] : [g.xN, v, z]) as Vec3, h: 0 };
          if (step === 1) return setLineIn({ ...lineIn, s1: sup });
          setLineIn({ ...lineIn, s2: sup });
        },
      };
    }
    if (pk.kind === 'brace')
      return {
        z: 0,
        mode: 'member',
        startMember: null,
        hint: `${braceIn.plane === 'plan' ? '水平ブレース' : '軸ブレース'}: ${brPick.q1 ? 'point 2' : 'point 1'} = giao điểm 2 部材 – bấm 部材 ${brPick.ids.length + 1}/2${brPick.q1 ? ' (theo phương chéo)' : ''}`,
        onNode: () => undefined,
        onMember: (id) => {
          const m = members.find((x) => x.id === id);
          if (!m) return;
          if (brPick.ids.length === 1) {
            const m0 = members.find((x) => x.id === brPick.ids[0]);
            if (!m0 || m0.id === m.id) return setBrPick({ ...brPick, ids: [], names: [] });
            const at = closestMid(m0, m);
            if (!at) return setBrPick({ ...brPick, ids: [], names: [] });
            // 水平: lấy mặt trên dầm; 軸: giao điểm trục
            const q: Vec3 = braceIn.plane === 'plan' ? [at[0], at[1], at[2] + Math.max(...[m0, m].filter((x) => x.kind !== 'column').map((x) => x.section.h / 2), 0)] : at;
            const nm = `${m0.mark}×${m.mark}`;
            if (!brPick.q1) return setBrPick({ ids: [], names: [], q1: q, n1: nm });
            const bi = { ...braceIn };
            set((d) => {
              const lv = nearestLevel(d, Math.min(brPick.q1![2], q[2]));
              const top = nearestLevel(d, Math.max(brPick.q1![2], q[2]));
              d.braces = [...(d.braces ?? []), { id: uid('br'), ...bi, level: lv, top, x1: '', y1: '', x2: '', y2: '', ref: 'node', q1: brPick.q1!, q2: q, qn1: brPick.n1, qn2: nm }];
            });
            return setBrPick({ ids: [], names: [] });
          }
          setBrPick({ ...brPick, ids: [m.id], names: [m.mark] });
        },
      };
    if (pk.kind === 'knee')
      return {
        z: 0,
        mode: 'member',
        startMember: pk.first?.ref ?? null,
        hint: pk.first ? 'Bấm dầm mà 方杖 đỡ' : 'Bấm cột (本柱 / 間柱) chân 方杖',
        onNode: () => undefined,
        onMember: (id) => {
          const m = members.find((x) => x.id === id);
          if (!m?.source) return;
          if (!pk.first) {
            if (m.kind !== 'column') return;
            return setPk({ ...pk, first: { member: id, ref: m.source, pt: [m.a[0], m.a[1]], z: 0 } });
          }
          if (m.kind !== 'beam') return;
          const col = pk.first.ref, beam = m.source;
          const angMode = kneeIn.mode === 'ang';
          const rad = ((kneeIn.ang ?? 45) * Math.PI) / 180, L = kneeIn.len ?? 1000;
          const kd = angMode ? { dc: Math.round(L * Math.sin(rad)), db: Math.round(L * Math.cos(rad)), ang: kneeIn.ang ?? 45, len: L } : { dc: kneeIn.dc, db: kneeIn.db };
          set((d) => void (d.knees = [...(d.knees ?? []), { id: uid('kn'), memberId: kneeIn.memberId, col, beam, ...kd }]));
          setPk({ ...pk, first: null });
        },
      };
    const lvId = pk.kind === 'column' ? colIn.base : pk.kind === 'beam' ? beamIn.level : braceIn.plane === 'wall' ? braceIn.top : braceIn.level;
    const z = (g.lv.get(lvId) ?? 0) + (pk.kind === 'beam' ? beamIn.dz : 0);
    const what = pk.kind === 'beam' ? 'dầm' : 'giằng';
    const editing = pk.editId ? (pk.kind === 'column' ? 'Đang sửa cột: bấm giao trục để dời cột tới đó' : `Đang sửa ${what}: bấm 2 giao trục để đổi vị trí`) : '';
    if (pk.kind === 'beam')
      return {
        z,
        mode: 'member',
        startMember: pk.first?.ref ?? null,
        hint: (pk.editId ? 'Đang sửa dầm: ' : '') + (pk.first ? 'Bấm 部材 thứ 2 (cột hoặc dầm) – bấm lại 部材 1 để huỷ' : 'Bấm 部材 thứ 1 (cột hoặc dầm) – dầm mới nối giữa 2 部材 · hoặc kéo khung quét chọn nhiều cột → tự tạo 大梁 (mỗi cột tối đa 4 dầm theo 4 phương)'),
        onNode: () => undefined,
        onBox: pk.editId ? undefined : (ids) => {
          const lvId = sub === 'view2d' && v2d.view === 'plan' ? v2d.levelId : beamIn.level;
          const items = girdersFromColumns(p, members, ids, lvId);
          setPending(items.length ? { kind: 'beams', items, editId: null } : null);
        },
        onGrid: (k, id) => {
          if (k === 'lv') setBeamIn({ ...beamIn, level: id });
        },
        onMember: (id, hit) => {
          const m = members.find((x) => x.id === id);
          if (!m?.source || (m.kind !== 'column' && m.kind !== 'beam')) return;
          const xs = [...g.xs.values()], ys = [...g.ys.values()];
          const pt = memberPlanPoint(m, hit, xs, ys);
          if (!pk.first) return setPk({ ...pk, first: { member: id, ref: m.source, pt, z: hit[2] } });
          if (pk.first.ref === m.source) return setPk({ ...pk, first: null });
          const m1 = members.find((x) => x.id === pk.first!.member);
          if (!m1) return setPk({ ...pk, first: null });
          const [q1, q2] = beamEndsFromMembers(m1, pk.first.pt, m, pt);
          if (Math.hypot(q1[0] - q2[0], q1[1] - q2[1]) < 100) return setPk({ ...pk, first: null });
          const bi = { ...beamIn, p1: q1, p2: q2, ref1: pk.first.ref, ref2: m.source, level: nearestLevel(p, (pk.first.z + hit[2]) / 2) };
          setBeamIn(bi);
          if (pk.preview !== false) setPending({ kind: 'beam', editId: pk.editId });
          else set((d) => void saveBeam(d, bi, pk.editId));
          setPk({ ...pk, first: null });
        },
      };
    return {
      z,
      start: pk.start,
      color: pk.kind === 'column' ? '#16a34a' : '#ea580c',
      planNodesOnly: pk.kind === 'column',
      onGrid: (k: 'gx' | 'gy' | 'lv', id: string) => {
        if (pk.kind === 'column') {
          if (k === 'lv') return setColIn({ ...colIn, base: id });
          const key = k === 'gx' ? 'xs' : 'ys';
          const cur = colIn[key];
          return setColIn({ ...colIn, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
        }
        if (k === 'lv') setBraceIn(braceIn.plane === 'wall' ? { ...braceIn, top: id } : { ...braceIn, level: id });
      },
      hint:
        editing ||
        (pk.kind === 'column'
          ? pk.preview !== false
            ? `Bấm giao trục để xem trước cột ${colIn.memberName} (bấm lại = bỏ) · nhãn tầng = chân cột · Enter xác nhận · Esc huỷ`
            : `Bấm giao trục để đặt cột ${colIn.memberName}`
          : pk.kind === 'brace'
            ? pk.start
              ? braceIn.plane === 'plan' ? 'Bấm giao trục góc đối diện của khoang' : 'Bấm giao trục thứ 2 trên cùng đường trục'
              : braceIn.plane === 'plan' ? 'Bấm giao trục góc thứ nhất của khoang (giằng ngang)' : 'Bấm giao trục thứ nhất (giằng đứng, chấm ở tầng trên)'
            : pk.start ? 'Bấm giao trục điểm cuối của dầm' : 'Bấm giao trục điểm đầu của dầm'),
      onNode: (x, y) => {
        if (pk.kind === 'column') {
          if (pk.preview !== false) {
            // thêm / bỏ giao trục khỏi danh sách xem trước
            const cur = pending?.kind === 'column' && pending.editId === pk.editId ? pending.nodes : [];
            const has = cur.some(([a, b]) => a === x && b === y);
            const nodes: [string, string][] = pk.editId ? [[x, y]] : has ? cur.filter(([a, b]) => !(a === x && b === y)) : [...cur, [x, y]];
            setPending(nodes.length ? { kind: 'column', nodes, editId: pk.editId } : null);
            return;
          }
          set((d) => placeColumnAt(d, colIn, x, y, pk.editId));
          return;
        }
        if (!pk.start) return setPk({ ...pk, start: { x, y } });
        if (pk.start.x === x && pk.start.y === y) return setPk({ ...pk, start: null });
        if (pk.kind === 'brace') {
          const bi = { ...braceIn, x1: pk.start.x, y1: pk.start.y, x2: x, y2: y };
          setBraceIn(bi);
          set((d) => void saveBrace(d, bi, pk.editId));
          setPk({ ...pk, start: null });
          return;
        }
        const bi = { ...beamIn, x1: pk.start.x, y1: pk.start.y, x2: x, y2: y };
        setBeamIn(bi);
        set((d) => void saveBeam(d, bi, pk.editId));
        setPk({ ...pk, start: null });
      },
    };
  }, [inputOn, editOn, p, pk, colIn, beamIn, braceIn, set, members, pending, kneeIn, lineIn, auxLines, brPick, lineLv, sub, v2d, tab, slopeActive, slopePick, slopeView]);

  // Xem trước: áp thao tác lên bản sao dự án, lấy các cấu kiện mới / đang sửa
  const applyPending = useCallback(
    (d: Project, pd: Pending) => {
      if (pd.kind === 'column') for (const [x, y] of pd.nodes) placeColumnAt(d, colIn, x, y, pd.editId);
      else if (pd.kind === 'line') saveLineTargets(d, pd.what, pd.targets, colIn, beamIn, pd.ref1, pd.ref2);
      else if (pd.kind === 'beams') for (const it of pd.items) saveBeam(d, { ...beamIn, ...it }, null);
      else saveBeam(d, beamIn, pd.editId);
    },
    [colIn, beamIn],
  );
  // 母屋: xem trước theo form 間隔
  const moyaPrev = useMemo(() => {
    if (tab !== 'roof' || sub !== 'place' || !p.moya) return [];
    const r = moyaRefs.find((x) => x.key === moyaDraft.ref);
    if (!r || !moyaDraft.plane) return [];
    return moyaPreview(p, { plane: moyaDraft.plane, ref: r.key, refLabel: r.label, a: r.a, b: r.b, member: moyaDraft.member, dir: moyaDraft.dir, base: moyaDraft.base, side: moyaDraft.side, fit: moyaDraft.fit, extL: 0, extR: 0 }, moyaOffsets(moyaDraft, r, moyaRefs.find((x) => x.key === moyaDraft.ref2)));
  }, [tab, sub, p, moyaRefs, moyaDraft]);
  const ghosts: Member[] = useMemo(() => {
    if (moyaPrev.length) {
      const d = structuredClone(p);
      d.moya!.items = moyaPrev;
      return buildMembers(d).filter((m) => m.kind === 'purlin');
    }
    if (!pending || tab !== 'main') return [];
    const d = structuredClone(p);
    const before = new Set([...d.columns.map((c) => c.id), ...d.beams.map((b) => b.id)]);
    applyPending(d, pending);
    const ids = new Set([...d.columns.map((c) => c.id), ...d.beams.map((b) => b.id)].filter((id) => !before.has(id)));
    if (pending.editId) ids.add(pending.editId);
    return buildMembers(d).filter((m) => m.source && ids.has(m.source));
  }, [pending, p, applyPending, tab, moyaPrev]);
  const confirmPending = useCallback(() => {
    if (!pending) return;
    set((d) => applyPending(d, pending));
    if (pending.kind === 'line') setLineIn((li) => ({ ...li, s1: null, s2: null, multi: undefined, ...(li.mode === 'div' || li.mode === 'arr' ? { ref: '', ref2: '' } : {}) }));
    setPending(null);
  }, [pending, applyPending, set]);
  // 間柱 / 小梁 theo đường chuẩn: tự xem trước khi đủ dữ liệu
  const lineRes = useMemo(() => (pk.kind === 'post' || pk.kind === 'sbeam' ? lineTargets(lineIn, refs, pk.kind) : null), [pk.kind, lineIn, refs]);
  useEffect(() => {
    if (!lineRes) return;
    if (lineRes.list.length) setPending({ kind: 'line', what: pk.kind as 'post' | 'sbeam', targets: lineRes.list, ref1: lineIn.s1?.src, ref2: lineIn.s2?.src, editId: null });
    else setPending((pd) => (pd?.kind === 'line' ? null : pd));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineRes]);
  useEffect(() => {
    setLineIn((li) => ({ ...li, s1: null, s2: null }));
    setBrPick({ ids: [], names: [] });
  }, [pk.kind]);
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Enter') confirmPending();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, confirmPending]);
  // Esc = huỷ lệnh đang làm (mọi lệnh); chuột phải (không kéo) trên 3D = quay lại bước trước
  const cancelCmd = () => {
    setPending(null);
    setPk((o) => ({ ...o, on: o.fix || o.del || o.cut || o.merge || o.data ? true : o.on, start: null, first: null, editId: null, fix: false, fixSel: [], del: false, delSel: [], cut: false, cutSrc: null, merge: false, mergeSrc: null, data: false, dataSrc: null, dataLine: null, opMsg: null }));
    setLineIn((li) => ({ ...li, s1: null, s2: null, multi: undefined }));
    setBrPick({ ids: [], names: [] });
  };
  const stepBack = () => {
    if (pending) return setPending(null);
    if (pk.cutSrc) return setPk({ ...pk, cutSrc: null, opMsg: null });
    if (pk.mergeSrc) return setPk({ ...pk, mergeSrc: null, opMsg: null });
    if (pk.dataSrc) return setPk({ ...pk, dataSrc: null, opMsg: null });
    if (pk.dataLine) return setPk({ ...pk, dataLine: null, opMsg: null });
    if (pk.delSel?.length) return setPk({ ...pk, delSel: pk.delSel.slice(0, -1) });
    if (pk.first) return setPk({ ...pk, first: null });
    if (pk.start) return setPk({ ...pk, start: null });
    if (lineIn.s2) return setLineIn({ ...lineIn, s2: null, multi: undefined });
    if (lineIn.s1) return setLineIn({ ...lineIn, s1: null });
    if (brPick.ids.length) return setBrPick({ ...brPick, ids: [], names: [] });
    if (brPick.q1) return setBrPick({ ids: [], names: [] });
    if (pk.editId) return setPk({ ...pk, editId: null });
    if (pk.del || pk.cut || pk.merge || pk.fix || pk.data) return setPk({ ...pk, on: true, del: false, cut: false, merge: false, fix: false, data: false, opMsg: null });
  };
  const cmdRef = useRef({ cancelCmd, stepBack });
  cmdRef.current = { cancelCmd, stepBack };
  useEffect(() => installEnterNext(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('.pj-back')) return; // hộp thoại đang mở
      cmdRef.current.cancelCmd();
    };
    let down: { x: number; y: number } | null = null;
    const inView = (e: Event) => !!(e.target as HTMLElement)?.closest?.('canvas');
    const onDown = (e: PointerEvent) => {
      if (e.button === 2 && inView(e)) down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (e.button !== 2 || !down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
      down = null;
      if (!moved) cmdRef.current.stepBack();
    };
    const onCtx = (e: MouseEvent) => {
      if (inView(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('contextmenu', onCtx);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('contextmenu', onCtx);
    };
  }, []);
  // đổi chế độ (cột / dầm) hoặc rời tab thì bỏ xem trước
  useEffect(() => setPending(null), [pk.kind, tab, sub]);

  const colorBy: ColorBy = tab === 'zone' ? (sub === 'group' ? 'group' : sub === 'cls' ? 'cls' : 'zone') : tab === 'paint' ? 'paint' : 'kind';
  const jointMode = tab === 'main' && sub === 'joint';
  const jpts = useMemo(() => (jointMode ? jointPoints(p, members) : undefined), [jointMode, p, members]);
  // 作業平面 tính lại theo mô hình hiện tại (trục / tầng / cấu kiện thay đổi thì mặt phẳng đi theo)
  const auxPlane = auxEdit ? planes.find((x) => x.id === auxEdit) : undefined;
  const auxBg = useMemo(() => (auxPlane ? planeBackground(p, members, auxPlane, planes) : null), [auxPlane, p, members, planes]);
  // tab 母屋: mặt bằng tại tầng của 配置面 đang chọn
  const moyaLv = (() => { const pl = moyaOf(p).planes.find((x) => x.id === moyaDraft.plane); return planeFace(p, pl)?.level; })();
  useEffect(() => {
    if (tab !== 'roof' || moyaView !== '2d' || !moyaLv) return;
    setV2d((v) => (v.view === 'plan' && v.levelId === moyaLv ? v : { ...v, view: 'plan', levelId: moyaLv }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, moyaView, moyaLv]);
  const pcKind = (tab === 'roof' || tab === 'wall') ? PC_SUBS[sub] : undefined;
  useEffect(() => { setPcDraft0((d) => ({ ...d, buzai: '', buzaiLabel: '', targets: [], aux: undefined, edit: false, picked: [], autoPrev: undefined })); setPcSel(null); }, [tab, sub]);
  const pcPrev = useMemo(() => {
    if (!pcKind) return [];
    if (pcDraft.autoPrev?.length) return pcResultOf(p, members, tab === 'roof' ? 'moya' : 'girt', pcDraft.autoPrev).members;
    const it = draftItem(pcDraft, pcKind);
    return it ? pcResultOf(p, members, tab === 'roof' ? 'moya' : 'girt', [it]).members : [];
  }, [pcKind, pcDraft, p, members, tab]);
  /** vị trí 部材 theo trục gần nhất, vd (X3, Y1-Y2) */
  const gridAt = (m0: Member) => {
    // cả 部材 (mọi đoạn cùng nguồn)
    const grp = m0.source ? members.filter((x) => x.source === m0.source && x.part !== 'piece') : [m0];
    const pts = grp.flatMap((x) => [x.a, x.b]);
    let m = m0, dm = -1;
    for (const a of pts) for (const b of pts) { const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d > dm) { dm = d; m = { ...m0, a, b }; } }
    const gp = (gs: typeof p.gridsX) => { const pos = gridPositions(gs); return (v: number) => { let best = '', bd = Infinity; for (const g0 of gs) { const d = Math.abs((pos.get(g0.id) ?? 0) - v); if (d < bd) { bd = d; best = g0.name; } } return best; }; };
    const fx = gp(p.gridsX), fy = gp(p.gridsY);
    const xa = fx(m.a[0]), xb = fx(m.b[0]), ya = fy(m.a[1]), yb = fy(m.b[1]);
    return `(${xa === xb ? xa : `${xa}-${xb}`}, ${ya === yb ? ya : `${ya}-${yb}`})`;
  };
  const pcClickBuzai = (m: Member, label: string) => {
    if (pcSel) return;
    const bk = buzaiKey(m);
    const targets = pcDraft.auto && pcKind ? autoTargets(p, members, tab === 'roof' ? 'moya' : 'girt', { id: 'x', kind: pcKind, buzai: bk, buzaiLabel: label, piece: pcDraft.piece, align: pcDraft.align, side: pcDraft.side, leg: pcDraft.leg, off: pcDraft.off }) : pcDraft.targets;
    setPcDraft({ ...pcDraft, buzai: bk, buzaiLabel: label, targets });
  };
  const pcClickTarget = (id: string) => {
    if (pcSel) {
      set((d) => { const data = tab === 'roof' ? d.moya : d.girt; const r = data?.pcs?.find((x) => x.id === pcSel); if (r) r.targets = r.targets.includes(id) ? r.targets.filter((x) => x !== id) : [...r.targets, id]; });
      return;
    }
    if (!pcDraft.buzai) return;
    setPcDraft({ ...pcDraft, targets: pcDraft.targets.includes(id) ? pcDraft.targets.filter((x) => x !== id) : [...pcDraft.targets, id] });
  };
  /** lệnh 修正 ピース: bấm / quét chọn ピース đã nhập (khoá item|cây) */
  const pcUnit = (m?: Member) => (m && (m.part === 'piece' || m.part === 'bolt') && m.pcT && m.source && (tab === 'roof' ? moyaOf(p) : girtOf(p)).pcs?.some((x) => x.id === m.source && x.kind === pcKind) ? `${m.source}|${m.pcT}` : null);
  const pcEditPick: PickNodes | null = pcKind && pcDraft.edit ? {
    z: 0,
    mode: 'member',
    anyZ: true,
    color: '#dc2626',
    hint: `修正 ピース: bấm từng ピース hoặc kéo khung quét chọn (Shift: thêm) · đã chọn ${pcDraft.picked?.length ?? 0} · sửa ở bảng bên phải`,
    onNode: () => undefined,
    onMember: (id) => {
      const k = pcUnit(members.find((m) => m.id === id));
      if (!k) return;
      const cur = pcDraft.picked ?? [];
      setPcDraft({ ...pcDraft, picked: cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k] });
    },
    onBox: (ids, addSel) => {
      const ks = [...new Set(ids.map((id) => pcUnit(members.find((m) => m.id === id))).filter((x): x is string => !!x))];
      setPcDraft({ ...pcDraft, picked: addSel ? [...new Set([...(pcDraft.picked ?? []), ...ks])] : ks });
    },
  } : null;
  /** nhập ピース trên khung 3D: bấm 親部材 rồi bấm các 母屋 / 胴縁 */
  const pc3dSelect = (id: string | null) => {
    const m = id ? members.find((x) => x.id === id) : undefined;
    if (!m || m.part === 'piece' || m.part === 'bolt') return;
    const tk = tab === 'roof' ? 'purlin' : 'girt';
    const cur = pcSel ? (tab === 'roof' ? moyaOf(p) : girtOf(p)).pcs?.find((x) => x.id === pcSel) : undefined;
    const hasBz = cur ? !!cur.buzai : !!pcDraft.buzai;
    if (m.kind === tk && m.source && hasBz && buzaiKey(m) !== (cur?.buzai ?? pcDraft.buzai)) return pcClickTarget(m.source);
    if (cur) return;
    const lbl = m.kind === 'purlin' ? '母屋' : m.kind === 'girt' ? '胴縁' : m.kind === 'column' ? '柱' : '';
    pcClickBuzai(m, `${lbl}${m.mark ?? m.name ?? ''} ${gridAt(m)}`.trim());
  };
  const pc3dMarks: Vec3[] = (() => {
    if (!pcKind) return [];
    const cur = pcSel ? (tab === 'roof' ? moyaOf(p) : girtOf(p)).pcs?.find((x) => x.id === pcSel) : undefined;
    const bz = cur?.buzai ?? pcDraft.buzai, tg = cur?.targets ?? pcDraft.targets;
    const mid = (m: Member): Vec3 => [(m.a[0] + m.b[0]) / 2, (m.a[1] + m.b[1]) / 2, (m.a[2] + m.b[2]) / 2];
    const out: Vec3[] = [];
    const b0 = members.find((m) => buzaiKey(m) === bz && m.part !== 'piece');
    if (b0) out.push(mid(b0));
    for (const t of tg) { const m = members.find((x) => x.source === t && x.part !== 'piece'); if (m) out.push(mid(m)); }
    for (const m of pcPrev) if (m.part === 'piece') out.push(mid(m));
    const pk2 = new Set(pcDraft.picked ?? []);
    if (pcDraft.edit) for (const m of members) if (m.part === 'piece' && m.pcT && pk2.has(`${m.source}|${m.pcT}`)) out.push(mid(m));
    return out;
  })();
  /** ピース đã có / xem trước trên mặt bằng (母屋) */
  const pcPlan = (sw: number) => {
    const mine = members.filter((m) => m.kind === 'purlin' && m.part === 'piece');
    const sel = new Set((moyaOf(p).pcs ?? []).filter((x) => x.id === pcSel).map((x) => x.id));
    const pk2 = new Set(pcDraft.picked ?? []);
    const seg = (m: Member, i: number, col: string, dash?: boolean) => (
      <g key={i} pointerEvents="none">
        <line x1={m.a[0]} y1={-m.a[1]} x2={m.b[0]} y2={-m.b[1]} stroke={col} strokeWidth={Math.max(sw * 5, m.section.b)} strokeLinecap="butt" strokeDasharray={dash ? `${sw * 3} ${sw * 2}` : undefined} />
        <circle cx={(m.a[0] + m.b[0]) / 2} cy={-(m.a[1] + m.b[1]) / 2} r={sw * 4} fill="none" stroke={col} strokeWidth={sw} />
      </g>
    );
    return (
      <g>
        {mine.filter((m) => m.part === 'piece').map((m, i) => seg(m, i, pk2.has(`${m.source}|${m.pcT}`) ? '#facc15' : sel.has(m.source ?? '') ? '#7c3aed' : '#dc2626'))}
        {pcPrev.filter((m) => m.part === 'piece').map((m, i) => seg(m, 1000 + i, '#ea580c', true))}
      </g>
    );
  };
  const moyaOverlay = (sw: number) => {
    const md = moyaOf(p);
    const rect = (g: NonNullable<ReturnType<typeof moyaGeo>>) => {
      const [A, B] = g.plan, w = g.width / 2, n = [-g.u[1], g.u[0]];
      return [[A[0] + n[0] * w, A[1] + n[1] * w], [B[0] + n[0] * w, B[1] + n[1] * w], [B[0] - n[0] * w, B[1] - n[1] * w], [A[0] - n[0] * w, A[1] - n[1] * w]].map(([x, y]) => `${x},${-y}`).join(' ');
    };
    const picking = sub === 'place';
    const pcOn = !!pcKind;
    const auxStep = pcOn && !pcSel && pcDraft.method === 2 && !!pcDraft.buzai && pcDraft.targets.length > 0 && !pcDraft.aux;
    const bzList = pcOn && !auxStep ? members.filter((m) => m.part !== 'piece' && m.kind !== 'purlin' && m.kind !== 'girt' && m.kind !== 'column' && Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) > 200) : [];
    const bzOn = (m: Member) => pcDraft.buzai === buzaiKey(m) || (!!pcSel && (moyaOf(p).pcs ?? []).find((x) => x.id === pcSel)?.buzai === buzaiKey(m));
    return (
      <g>
        {bzList.map((m) => (
          <line key={`bz${m.id}`} x1={m.a[0]} y1={-m.a[1]} x2={m.b[0]} y2={-m.b[1]} stroke={bzOn(m) ? '#7c3aed' : 'transparent'} strokeWidth={bzOn(m) ? sw * 3 : sw * 10} pointerEvents="stroke" style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); pcClickBuzai(m, `${m.mark ?? m.name ?? '梁'} ${gridAt(m)}`); }}>
            <title>親部材 {m.mark}</title>
          </line>
        ))}
        {auxStep && moyaRefs.map((r) => (
          <line key={`ax${r.key}`} x1={r.a[0]} y1={-r.a[1]} x2={r.b[0]} y2={-r.b[1]} stroke="transparent" strokeWidth={sw * 10} pointerEvents="stroke" style={{ cursor: 'pointer' }}
            onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setPcDraft({ ...pcDraft, aux: { key: r.key, label: r.label, a: [r.a[0], r.a[1], 0], b: [r.b[0], r.b[1], 0], plan: true } }); }}>
            <title>補助線 {r.label}</title>
          </line>
        ))}
        {pcOn && pcDraft.aux && <line x1={pcDraft.aux.a[0]} y1={-pcDraft.aux.a[1]} x2={pcDraft.aux.b[0]} y2={-pcDraft.aux.b[1]} stroke="#0ea5e9" strokeWidth={sw * 2} strokeDasharray={`${sw * 6} ${sw * 3}`} pointerEvents="none" />}
        {picking && moyaRefs.map((r) => {
          const on = r.key === moyaDraft.ref || (moyaDraft.mode === 'div' && r.key === moyaDraft.ref2);
          return (
            <line key={r.key} x1={r.a[0]} y1={-r.a[1]} x2={r.b[0]} y2={-r.b[1]} stroke={on ? '#7c3aed' : 'transparent'} strokeWidth={on ? sw * 2.5 : sw * 10} style={{ cursor: 'pointer' }} pointerEvents="stroke"
              onPointerDown={(e) => e.stopPropagation()} onClick={(e) => {
                e.stopPropagation();
                if (moyaDraft.mode === 'div' && moyaDraft.ref && !moyaDraft.ref2 && r.key !== moyaDraft.ref) setMoyaDraft({ ...moyaDraft, ref2: r.key });
                else setMoyaDraft({ ...moyaDraft, ref: r.key, ref2: '' });
              }}>
              <title>{r.label}</title>
            </line>
          );
        })}
        {md.items.map((it) => {
          const g = moyaGeo(p, it);
          if (!g) return null;
          const on = pcOn ? pcDraft.targets.includes(it.id) || (!!pcSel && !!(moyaOf(p).pcs ?? []).find((x) => x.id === pcSel)?.targets.includes(it.id)) : it.id === moyaSel;
          const [A, B] = g.plan;
          const ang = (Math.atan2(-(B[1] - A[1]), B[0] - A[0]) * 180) / Math.PI;
          const fx = ang > 90 || ang < -90 ? 180 : 0;
          return (
            <g key={it.id} onClick={(e) => { e.stopPropagation(); if (pcOn) pcClickTarget(it.id); else setMoyaSel(on ? null : it.id); }} onPointerDown={(e) => e.stopPropagation()} style={{ cursor: 'pointer' }}>
              <polygon points={rect(g)} fill={on ? '#fde68a' : '#d1fae5'} fillOpacity={0.85} stroke={on ? '#d97706' : '#047857'} strokeWidth={sw * 0.8} />
              <text x={(A[0] + B[0]) / 2} y={-(A[1] + B[1]) / 2} fontSize={sw * 9} fill="#065f46" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${ang + fx} ${(A[0] + B[0]) / 2} ${-(A[1] + B[1]) / 2})`} pointerEvents="none">{it.member}</text>
            </g>
          );
        })}
        {pcOn && pcPlan(sw)}
        {moyaPrev.map((it) => {
          const g = moyaGeo(p, it);
          return g ? <polygon key={it.id} points={rect(g)} fill="#fed7aa" fillOpacity={0.5} stroke="#ea580c" strokeDasharray={`${sw * 4} ${sw * 3}`} strokeWidth={sw} pointerEvents="none" /> : null;
        })}
      </g>
    );
  };
  /** Thanh lệnh 2D: vẽ trên 作業平面 của khung nhìn hiện tại (tự tạo nếu chưa có) */
  const startCad = (t: CadTool) => {
    setCadTool(t);
    // 本体 đang ở 3D → chuyển sang khung 2D (Mặt bằng / Trục) để vẽ trực tiếp trên mặt phẳng đang xem
    if (tab === 'main' && view === '3d' && !auxEdit) setSubs((s) => ({ ...s, main: 'view2d' }));
    if (auxEdit && planes.some((x) => x.id === auxEdit)) return;
    const kind = v2d.view === 'ex' ? 'gridX' : v2d.view === 'ey' ? 'gridY' : 'level';
    if (v2d.view === 'wp' && v2d.planeId) { setAuxEdit(v2d.planeId); return; }
    const ref = kind === 'level' ? v2d.levelId || p.levels[0]?.id : v2d.gridId || (kind === 'gridX' ? p.gridsX[0]?.id : p.gridsY[0]?.id);
    if (!ref) return;
    const ex = planes.find((x) => x.kind === kind && x.ref === ref && !x.offset && !x.opt?.rot && !x.opt?.tilt);
    if (ex) { setAuxEdit(ex.id); return; }
    const basis = planeBasis(p, members, kind, ref, 0, {});
    if (!basis) { setPlaneWin(true); return; }
    const id = uid('wp');
    const nm = kind === 'level' ? `▽${p.levels.find((l) => l.id === ref)?.name ?? ''}` : `通り${[...p.gridsX, ...p.gridsY].find((g) => g.id === ref)?.name ?? ''}`;
    set((d) => void (d.planes = [...(d.planes ?? []), { id, name: `WP${planes.length + 1} ${nm}`, kind, ref, offset: 0, ...basis, ents: [] }]));
    setAuxEdit(id);
  };
  const girtPlaneId = girtOf(p).planes.some((x) => x.id === girtPlane) ? girtPlane : girtOf(p).planes[0]?.id ?? '';
  const girtGeo = (() => { const pl = girtOf(p).planes.find((x) => x.id === girtPlaneId); return pl ? planeGeo(p, pl) : null; })();
  const girtPrev = tab === 'wall' && sub === 'input' && girtGeo && ['v', 'h', 'pat'].includes(girtDraft.mode) ? draftItems(p, girtGeo, members, girtDraft) : [];
  const girtPrevOpen = tab === 'wall' && sub === 'input' && girtGeo && girtDraft.mode === 'open' ? draftOpen(p, girtGeo, members, girtDraft) : null;
  const gd0 = girtDraft;
  const girtActive = gd0.mode === 'v' ? [gd0.vRef, gd0.lo, gd0.hi] : gd0.mode === 'h' ? [gd0.left, gd0.right, gd0.hBase] : gd0.mode === 'pat' ? [gd0.left, gd0.right, gd0.lo, gd0.hi] : gd0.mode === 'open' ? [gd0.oS, gd0.oZ] : [];
  const girtPick = (kind: 'v' | 'h', key: string) => {
    const d = { ...girtDraft };
    const two = (a: 'lo' | 'left', b: 'hi' | 'right') => { if (!d[a] || d[b] || d[a] === key) { d[a] = key; d[b] = ''; } else d[b] = key; };
    if (d.mode === 'v') { if (kind === 'h') two('lo', 'hi'); else d.vRef = key; }
    else if (d.mode === 'h') { if (kind === 'v') two('left', 'right'); else d.hBase = key; }
    else if (d.mode === 'pat') { if (kind === 'v') two('left', 'right'); else two('lo', 'hi'); }
    else if (d.mode === 'open') { if (kind === 'v') d.oS = key; else d.oZ = key; }
    setGirtDraft(d);
  };
  const view = tab === 'wall' && girtView === '2d' ? 'girt' : tab === 'dwg' ? 'dwg' : tab === 'bom' ? 'bom' : tab === 'ship' ? 'ship' : (tab === 'main' && sub === 'view2d') || (tab === 'slope' && slopeView === '2d') || (tab === 'roof' && moyaView === '2d') ? 'input2d' : jointMode && plateEdit ? 'plate' : '3d';
  // vẽ 補助線 trực tiếp trên khung 2D (không mở cửa sổ riêng)
  const embedAux = view === 'input2d' && !!auxPlane && !!auxBg;
  const saveAux = (id: string, ents: PlateShape['ents']) => set((d) => {
    const x = d.planes?.find((q) => q.id === id);
    const cur = planes.find((q) => q.id === id);
    if (x) Object.assign(x, { ents, ...(cur ? { o: cur.o, u: cur.u, v: cur.v } : {}) });
  });
  // đổi trục / tầng trên thanh khung nhìn khi đang vẽ → chuyển sang mặt phẳng tương ứng
  useEffect(() => {
    if (!embedAux || v2d.view === 'wp') return;
    const kind = v2d.view === 'ex' ? 'gridX' : v2d.view === 'ey' ? 'gridY' : 'level';
    const ref = kind === 'level' ? v2d.levelId : v2d.gridId;
    if (!ref || (auxPlane!.kind === kind && auxPlane!.ref === ref)) return;
    const ex = planes.find((x) => x.kind === kind && x.ref === ref && !x.offset && !x.opt?.rot && !x.opt?.tilt);
    if (ex) return setAuxEdit(ex.id);
    const basis = planeBasis(p, members, kind, ref, 0, {});
    if (!basis) return;
    const id = uid('wp');
    const nm = kind === 'level' ? `▽${p.levels.find((l) => l.id === ref)?.name ?? ''}` : `通り${[...p.gridsX, ...p.gridsY].find((g) => g.id === ref)?.name ?? ''}`;
    set((d) => void (d.planes = [...(d.planes ?? []), { id, name: `WP${planes.length + 1} ${nm}`, kind, ref, offset: 0, ...basis, ents: [] }]));
    setAuxEdit(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v2d.view, v2d.gridId, v2d.levelId, embedAux]);
  const auxSegs = useMemo(() => auxLines.map((l) => [l.a, l.b] as [Vec3, Vec3]), [auxLines]);
  const auxKeys = useMemo(() => auxLines.map((l) => l.key), [auxLines]);
  // khung 作業平面 + giao tuyến trục / tầng (chỉ ở tab nhập cột · dầm)
  const planeVizs = useMemo(() => {
    if (!(tab === 'main' && sub === 'colin')) return [];
    const out = planes.filter((pl) => !pl.hidden).map((pl) => planeViz(p, members, pl));
    if (planeDraft && !auxEdit) out.push(planeViz(p, members, planeDraft, true));
    return out;
  }, [tab, sub, p, members, planes, planeDraft, auxEdit]);

  return (
    <div className="app">
      {show3d && <View3DPage project={p} members={members} onClose={() => setShow3d(false)} />}
      {pjOpen && (
        <ProjectsDialog
          cur={init.id}
          p={p}
          fresh={blankProject}
          sample={newProject}
          onClose={() => setPjOpen(false)}
          onOpen={(id, rename) => {
            if (rename !== undefined && id === init.id) return set((d) => void (d.name = rename));
            setCur(id);
            onSwitch();
          }}
        />
      )}
      {!rotOk && !mob && (
        <div className="rotate-hint">
          <div className="rh-box">
            <div style={{ fontSize: 44 }}>📱↻</div>
            <b>Xoay ngang điện thoại để làm việc</b>
            <p className="small">Bấm nút dưới để xoay giao diện sang ngang (không cần bật xoay tự động), rồi cầm máy nằm ngang.</p>
            <button className="primary" onClick={() => { setForceLand(true); setRotOk(true); }}>
              ↻ Xoay ngang ngay trong trang
            </button>
            <button onClick={() => setRotOk(true)}>Vẫn dùng màn hình dọc</button>
          </div>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <span className="logo">3T</span> Steel 3T <span className="muted">· Thiết kế kết cấu thép</span>
        </div>
        <button className="rot-btn" title="Xoay giao diện ngang / dọc" onClick={() => setForceLand(!forceLand)}>
          {forceLand ? '📱 Dọc' : '📱 Ngang'}
        </button>
        <div className="project-name">{p.name}</div>
        <div className="row-gap">
          <button className={'btn-3d' + (show3d ? ' on' : '')} onClick={() => setShow3d(!show3d)} title="Mở / đóng trang 3D">
            🧊<span className="lbl"> Trang 3D</span>
          </button>
          <button onClick={undo} disabled={!hist.past.length} title="Hoàn tác (Ctrl+Z)">
            ↶
          </button>
          <button onClick={redo} disabled={!hist.future.length} title="Làm lại (Ctrl+Y)">
            ↷
          </button>
          <button className="pj-btn" title="Công trình: tạo mới, nhân bản, mở công trình khác (công trình cũ vẫn được lưu)" onClick={() => setPjOpen(true)}>
            📁 {p.name || 'Công trình'}
          </button>
          <button className="primary" onClick={saveJson} title="Tải file .json của công trình đang mở về máy">
            ⬇<span className="lbl"> Lưu file</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={'tab' + (t.id === tab ? ' active' : '') + (t.id === 'params' ? ' tab0' : '')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      <main className="body" data-mv={mob ? mview : undefined} style={{ ['--pw' as string]: `${pw}px` } as React.CSSProperties}>
        <div className={'splitter' + (splitOn ? ' on' : '')} title="Kéo để đổi độ rộng bảng làm việc" onPointerDown={onSplit} />
        <aside className="panel">
          <nav className="subtabs in-panel">
            {tabDef.subs.map((s) => (
              <button key={s.id} className={'subtab' + (s.id === sub ? ' active' : '')} onClick={() => setSubs({ ...subs, [tab]: s.id })}>
                {s.label}
              </button>
            ))}
          </nav>
          {tab === 'grid' && <GridTab {...props} />}
          {tab === 'main' && <MainTab key={sub} {...props} colIn={colIn} setColIn={setColIn} v2d={v2d} setV2d={setV2d} beamIn={beamIn} setBeamIn={setBeamIn} braceIn={braceIn} setBraceIn={setBraceIn} pending={pending} setPending={setPending} confirmPending={confirmPending} jp={jp} setJp={setJp} kneeIn={kneeIn} setKneeIn={setKneeIn} plateEdit={plateEdit} setPlateEdit={setPlateEdit} auxEdit={auxEdit} setAuxEdit={setAuxEdit} setPlaneDraft={setPlaneDraft} planeWin={planeWin} setPlaneWin={setPlaneWin} checkClash={checkAllClashes} lineIn={lineIn} setLineIn={setLineIn} refs={refs} lineErr={lineRes?.err} brPick={brPick} setBrPick={setBrPick} pk={pk} setPk={setPk} selected={selected} setSelected={setSelected} />}
          {tab === 'slope' && (
            <SlopeTab
              {...props}
              active={slopeActive}
              setActive={(id) => {
                setSlopeActive(id);
                const f = (p.slopeFaces ?? []).find((x) => x.id === id);
                setV2d((v) => ({ ...v, view: 'plan', levelId: f?.level ?? v.levelId }));
              }}
              picking={slopePick}
              setPicking={setSlopePick}
              view3d={slopeView === '3d'}
              setView3d={(on) => setSlopeView(on ? '3d' : '2d')}
            />
          )}
          {tab === 'params' && <ParamsTab {...props} />}
          {tab === 'zone' && <ZoneTab {...props} />}
          {tab === 'paint' && <PaintTab {...props} />}
          {tab === 'ship' && <ShipPanel p={p} members={members} f={shipF} setF={setShipF} />}
          {tab === 'roof' && (
            <MoyaTab {...props} pcDraft={pcDraft} setPcDraft={setPcDraft} pcSel={pcSel} setPcSel={setPcSel} draft={moyaDraft} setDraft={setMoyaDraft} refs={moyaRefs} view3d={moyaView === '3d'} setView3d={(on) => setMoyaView(on ? '3d' : '2d')} sel={moyaSel} setSel={setMoyaSel} />
          )}
          {tab === 'wall' && (
            <GirtTab {...props} pcDraft={pcDraft} setPcDraft={setPcDraft} pcSel={pcSel} setPcSel={setPcSel} draft={girtDraft} setDraft={setGirtDraft} plane={girtPlaneId} setPlane={setGirtPlane} preview={girtPrev} previewOpen={girtPrevOpen} view3d={girtView === '3d'} setView3d={(on) => setGirtView(on ? '3d' : '2d')} sel={girtSel} setSel={setGirtSel} />
          )}
          {tab === 'detail' && (SUB2_SUBS.includes(sub) ? <Sub2Tab {...props} /> : <DetailTab {...props} />)}
          {tab === 'code' && <CodeTab {...props} highlight={highlight} onHighlight={setHighlight} />}
          {tab === 'dwg' && <DrawingPanel p={p} opt={{ ...dwg, kind: sub as DrawingKind }} setOpt={({ kind: _k, ...o }) => setDwg(o)} onExport={exportSvg} />}
          {tab === 'bom' && <BomPanel p={p} members={members} />}
        </aside>
        <section className="viewport cad-on">
          <CadBar p={p} active={auxPlane?.name} onTool={startCad} onPlanes={() => setPlaneWin(true)} onEditPlane={(id) => { setCadTool('line'); setAuxEdit(id); }}
            toggleHidden={(id) => set((d) => { const x = d.planes?.find((q) => q.id === id); if (x) x.hidden = !x.hidden; })} />
          <div className="fill" style={{ display: view === '3d' ? 'block' : 'none' }}>
            {clashes && (
              <div className="clash-box">
                <div className="clash-head">
                  <b>{clashes.list.length ? `⚠ Va chạm: ${clashes.list.length} chỗ` : '✓ Không có va chạm'}</b>
                  <span className="muted small">{clashes.full ? 'kiểm tra toàn bộ' : 'cấu kiện vừa nhập / sửa'}</span>
                  <button className="icon" title="Đóng" onClick={() => setClashes(null)}>✕</button>
                </div>
                {clashes.list.slice(0, 12).map((c, i) => (
                  <button key={i} className="clash-row" title="Bấm để chọn cấu kiện trên 3D" onClick={() => setSelected(c.a.id)}>
                    <span className="swatch" style={{ background: KIND_COLOR[c.a.kind] }} /> {c.a.mark || c.a.name} <span className="muted">({KIND_LABEL[c.a.kind]})</span> × <span className="swatch" style={{ background: KIND_COLOR[c.b.kind] }} /> {c.b.mark || c.b.name} <span className="muted">({KIND_LABEL[c.b.kind]})</span>
                  </button>
                ))}
                {clashes.list.length > 12 && <div className="muted small">… và {clashes.list.length - 12} chỗ khác</div>}
              </div>
            )}
            <Viewer3D project={p} members={members} selected={pcKind ? null : selected} onSelect={pcKind ? pc3dSelect : setSelected} highlightMark={tab === 'code' ? highlight : null} colorBy={colorBy} pick={pcEditPick ?? pickNodes} ghosts={ghosts} points={jpts} activePoint={jp} onPoint={setJp} auxSegs={auxSegs} planes={planeVizs} marks={clashes?.list.map((c) => c.at)} auxKeys={auxKeys} slopeVis={slopeVis} pickMarks={[...(pcKind ? pc3dMarks : []), ...(lineIn.s1 && (pk.kind === 'post' || pk.kind === 'sbeam') ? [mid3(lineIn.s1)] : []), ...(lineIn.s2 && (pk.kind === 'post' || pk.kind === 'sbeam') ? [mid3(lineIn.s2)] : []), ...(pk.kind === 'brace' && brPick.q1 ? [brPick.q1] : []), ...(pk.kind === 'brace' ? brPick.ids.map((id) => members.find((m) => m.id === id)).filter(Boolean).map((m) => mid3(m!)) : [])]} />
          </div>
          {view === 'girt' && (
            <div className="fill">
              <GirtView p={p} members={members} planeId={girtPlaneId} preview={girtPrev} previewOpen={girtPrevOpen} active={girtActive} onPick={girtPick} sel={girtSel} onSel={setGirtSel}
                pc={pcKind ? {
                  buzai: pcSel ? (girtOf(p).pcs ?? []).find((x) => x.id === pcSel)?.buzai ?? '' : pcDraft.buzai,
                  targets: pcSel ? (girtOf(p).pcs ?? []).find((x) => x.id === pcSel)?.targets ?? [] : pcDraft.targets,
                  auxStep: !pcSel && pcDraft.method === 2 && !!pcDraft.buzai && pcDraft.targets.length > 0 && !pcDraft.aux,
                  aux: pcDraft.aux, onBuzai: pcClickBuzai, onTarget: pcClickTarget, onAux: (a) => setPcDraft({ ...pcDraft, aux: a }), prev: pcPrev, selSrc: pcSel,
                  edit: !!pcDraft.edit, picked: pcDraft.picked ?? [], onUnits: (ks, addSel) => setPcDraft({ ...pcDraft, picked: addSel ? [...new Set([...(pcDraft.picked ?? []), ...ks])] : ks }),
                } : undefined} />
            </div>
          )}
          {view === 'dwg' && (
            <div className="fill paper">
              <Drawing2D ref={svgRef} project={p} members={members} opt={{ ...dwg, kind: sub as DrawingKind }} />
            </div>
          )}
          {view === 'plate' && plateEdit && (
            <div className="fill">
              <PlateEditor
                key={plateEdit.plate.id}
                req={plateEdit}
                onClose={() => setPlateEdit(null)}
                onSave={(pl) => {
                  const req = plateEdit;
                  set((d) => {
                    const plates = (d.plates ?? []).filter((x) => x.id !== pl.id);
                    d.plates = [...plates, { ...pl, jointId: req.jointId }];
                    req.extra?.(d, pl.id);
                  });
                  setPlateEdit(null);
                }}
              />
            </div>
          )}
          {view === 'input2d' && embedAux && (
            <div className="fill paper aux-embed">
              <div className="aux-embed-head">
                <b>✏ Vẽ · đo trên {auxPlane!.name}</b>
                <span className="muted small">Vẽ · đo ngay trên khung 2D · lưu ngay khi vẽ · đổi trục / tầng ở thanh dưới để vẽ trên mặt phẳng khác</span>
                <button className="primary" onClick={() => setAuxEdit(null)}>✓ Xong</button>
              </div>
              <div className="aux-embed-body">
                <PlateEditor
                  key={auxPlane!.id}
                  mode="aux"
                  initTool={cadTool}
                  req={{ plate: { id: auxPlane!.id, name: `作業平面 ${auxPlane!.name} – 補助線`, t: 0, ents: auxPlane!.ents }, jointId: '', jointName: '' }}
                  bg={auxBg!.segs}
                  bgStyle={auxBg!.style}
                  bgFill={auxBg!.fills}
                  bgText={auxBg!.texts}
                  onClose={() => setAuxEdit(null)}
                  onLive={(pl) => saveAux(auxPlane!.id, pl.ents)}
                  under={<Input2D layerOnly layerPlane={auxPlane!} project={p} members={members} set={set} colIn={colIn} v2d={v2d} braceIn={braceIn} planes={planes.map((w) => (w.id === auxPlane!.id ? { ...w, hidden: true } : w))} ghosts={ghosts} auxLines={auxLines} lineIn={lineIn} lineLv={lineLv} selected={selected} activeSlope={tab === 'slope' ? slopeActive : undefined} showSlopes={tab === 'slope' || tab === 'roof'} overlay={tab === 'roof' ? (sw) => moyaOverlay(sw) : undefined} />}
                  onSave={(pl) => { saveAux(auxPlane!.id, pl.ents); setAuxEdit(null); }}
                />
              </div>
              <View2DBar p={p} v2d={v2d} setV2d={setV2d} />
            </div>
          )}
          {view === 'input2d' && !embedAux && (
            <div className="fill paper">
              <Input2D project={p} members={members} set={set} colIn={colIn} v2d={v2d} braceIn={braceIn} planes={planes} pick={pcEditPick ?? pickNodes} ghosts={ghosts} auxLines={auxLines} lineIn={lineIn} lineLv={lineLv} selected={selected} onSelect={setSelected} bar={<View2DBar p={p} v2d={v2d} setV2d={setV2d} />} activeSlope={tab === 'slope' ? slopeActive : undefined} showSlopes={tab === 'slope' || tab === 'roof'} overlay={tab === 'roof' ? (sw) => moyaOverlay(sw) : undefined} />
            </div>
          )}
          {view === 'ship' && (
            <div className="fill scroll">
              <ShipTable members={members} f={shipF} sub={sub} />
            </div>
          )}
          {view === 'bom' && (
            <div className="fill scroll">
              <BomTable members={members} sub={sub} />
            </div>
          )}
        </section>
      </main>
      {planeWin && (
        <FloatWin id="wp" title="作業平面 · 補助線" def={{ x: 90, y: 150, w: 430, h: 640 }} onClose={() => { setPlaneWin(false); setAuxEdit(null); }}>
          <WorkPlanePanel p={p} set={set} members={members} selected={selected} auxEdit={auxEdit} setAuxEdit={setAuxEdit} setPlaneDraft={setPlaneDraft} />
        </FloatWin>
      )}
      {auxPlane && auxBg && !embedAux && (
        <FloatWin id="wp-edit" flush title={`✏ 補助線 2D – ${auxPlane.name}`} def={{ x: 540, y: 120, w: 900, h: 680 }} onClose={() => setAuxEdit(null)}>
          <PlateEditor
                  key={auxPlane.id}
                  mode="aux"
                  initTool={cadTool}
                  req={{ plate: { id: auxPlane.id, name: `作業平面 ${auxPlane.name} – 補助線`, t: 0, ents: auxPlane.ents }, jointId: '', jointName: '' }}
                  bg={auxBg!.segs}
                  bgStyle={auxBg!.style}
                  bgFill={auxBg!.fills}
                  bgText={auxBg!.texts}
                  onClose={() => setAuxEdit(null)}
                  onSave={(pl) => {
                    set((d) => {
                      const x = d.planes?.find((q) => q.id === auxPlane.id);
                      // lưu kèm hệ trục hiện tại để toạ độ 補助線 khớp với hệ trục đã lưu
                      if (x) Object.assign(x, { ents: pl.ents, o: auxPlane.o, u: auxPlane.u, v: auxPlane.v });
                    });
                    setAuxEdit(null);
                  }}
                />
        </FloatWin>
      )}
      {mob && (
        <nav className="mob-nav">
          {([['view', '🧊', 'Hình'], ['split', '◫', 'Cả hai'], ['panel', '✎', 'Nhập']] as const).map(([k, i, l]) => (
            <button key={k} className={mview === k ? 'on' : ''} onClick={() => setMview(k)}><span>{i}</span>{l}</button>
          ))}
          <button onClick={() => setForceLand(true)} title="Xoay giao diện ngang"><span>↻</span>Ngang</button>
        </nav>
      )}
      <footer className="statusbar">
        <span>
          Trục X: {p.gridsX.length} · Trục Y: {p.gridsY.length} · Tầng: {p.levels.length}
        </span>
        <span>
          Cấu kiện: {members.length} · Tổng KL: {totalKg.toLocaleString('vi-VN', { maximumFractionDigits: 0 })} kg
        </span>
        <span className="muted">Tự lưu trong trình duyệt</span>
      </footer>
    </div>
  );
}
