import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Joint, JointPos, Member, MemberKind, KIND_COLOR, KIND_LABEL, Project, Section, Vec3, kgPerM, plateGeometry, bracketWeldOf } from './model';
import { geometry } from './build';
import { profileLoops } from './section3d';
import { isRot, localPt, localRect } from './rot';
import { DimSet, fmt, gridDims, memberDims, surfaceGap } from './dims3d';
import { baseLayout, jointBolts, jointPlates, jointStationAt } from './jointGeom';
import type { PlateBox } from './jointGeom';
import { linkPoint } from './editOps';
const dist3 = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
import { isTorshear } from './kiseihin';
import { braceGusset } from './braceGusset';
import type { PlaneViz } from './workplane';

const S = 0.001; // mm -> m
/** nửa chiều cao khung nhìn camera song song (m) khi zoom = 1 */
const FH = 30;

function profileShape(s: Section): THREE.Shape {
  if (s.type === 'I' || s.type === 'Box') {
    const loops = profileLoops(s);
    const toPts = (l: [number, number][]) => l.map(([x, y]) => new THREE.Vector2(x * S, y * S));
    const sh = new THREE.Shape(toPts(loops[0]));
    for (const hl of loops.slice(1)) sh.holes.push(new THREE.Path(toPts([...hl].reverse())));
    return sh;
  }
  return profileShapeBasic(s);
}

/** Hình khối của 1 bản 継手: hộp, hoặc vòng đùn (カドピタ bo góc theo mặt trong cột) – tâm tại gốc */
function plateGeo(pl: PlateBox): THREE.BufferGeometry {
  if (!pl.ring) return new THREE.BoxGeometry(pl.w * S, pl.h * S, pl.l * S);
  const toPts = (l: [number, number][]) => l.map(([u, v]) => new THREE.Vector2(u * S, v * S));
  const sh = new THREE.Shape(toPts(pl.ring[0]));
  for (const hl of pl.ring.slice(1)) sh.holes.push(new THREE.Path(toPts([...hl].reverse())));
  const g = new THREE.ExtrudeGeometry(sh, { depth: pl.l * S, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, (-pl.l * S) / 2);
  return g;
}

function profileShapeBasic(s: Section): THREE.Shape {
  const h = s.h * S, b = s.b * S, tw = Math.max(s.tw, 1) * S, tf = Math.max(s.tf, 1) * S, c = s.c * S;
  const poly = (pts: [number, number][]) => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]);
    sh.closePath();
    return sh;
  };
  switch (s.type) {
    case 'I':
      return poly([
        [-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf], [tw / 2, h / 2 - tf], [b / 2, h / 2 - tf],
        [b / 2, h / 2], [-b / 2, h / 2], [-b / 2, h / 2 - tf], [-tw / 2, h / 2 - tf], [-tw / 2, -h / 2 + tf], [-b / 2, -h / 2 + tf],
      ]);
    case 'C': {
      const t = tw;
      return poly([
        [-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + c], [b / 2 - t, -h / 2 + c], [b / 2 - t, -h / 2 + t], [-b / 2 + t, -h / 2 + t],
        [-b / 2 + t, h / 2 - t], [b / 2 - t, h / 2 - t], [b / 2 - t, h / 2 - c], [b / 2, h / 2 - c], [b / 2, h / 2], [-b / 2, h / 2],
      ]);
    }
    case 'Z': {
      const t = tw;
      return poly([
        [-t / 2, -h / 2], [b - t / 2, -h / 2], [b - t / 2, -h / 2 + c], [b - 1.5 * t, -h / 2 + c], [b - 1.5 * t, -h / 2 + t], [t / 2, -h / 2 + t],
        [t / 2, h / 2], [-b + t / 2, h / 2], [-b + t / 2, h / 2 - c], [-b + 1.5 * t, h / 2 - c], [-b + 1.5 * t, h / 2 - t], [-t / 2, h / 2 - t],
      ]);
    }
    case 'Box': {
      const sh = poly([[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]]);
      const hole = new THREE.Path();
      hole.moveTo(-b / 2 + tw, -h / 2 + tw);
      hole.lineTo(-b / 2 + tw, h / 2 - tw);
      hole.lineTo(b / 2 - tw, h / 2 - tw);
      hole.lineTo(b / 2 - tw, -h / 2 + tw);
      hole.closePath();
      sh.holes.push(hole);
      return sh;
    }
    case 'Pipe':
    case 'Rod': {
      const sh = new THREE.Shape();
      sh.absarc(0, 0, h / 2, 0, Math.PI * 2, false);
      if (s.type === 'Pipe') {
        const hole = new THREE.Path();
        hole.absarc(0, 0, h / 2 - tw, 0, Math.PI * 2, true);
        sh.holes.push(hole);
      }
      return sh;
    }
    case 'L':
      // プレート (b ≤ t): tấm chữ nhật t × h
      if (b <= tw + 0.01) return poly([[0, 0], [b, 0], [b, h], [0, h]].map(([x, y]) => [x - b / 4, y - h / 4]) as [number, number][]);
      return poly([[0, 0], [b, 0], [b, tw], [tw, tw], [tw, h], [0, h]].map(([x, y]) => [x - b / 4, y - h / 4]) as [number, number][]);
  }
}

function memberMatrix(m: Member): THREE.Matrix4 {
  const a = new THREE.Vector3(...m.a).multiplyScalar(S);
  const b = new THREE.Vector3(...m.b).multiplyScalar(S);
  const z = b.clone().sub(a);
  const len = z.length();
  z.normalize();
  let y: THREE.Vector3;
  if (m.up) y = new THREE.Vector3(...m.up);
  else if (Math.abs(z.z) > 0.99) y = new THREE.Vector3(0, 1, 0);
  else y = new THREE.Vector3(0, 0, 1);
  y.sub(z.clone().multiplyScalar(y.dot(z)));
  if (y.lengthSq() < 1e-8) y = Math.abs(z.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  const mat = new THREE.Matrix4().makeBasis(x, y, z.clone().multiplyScalar(len));
  mat.setPosition(a);
  return mat;
}

/** Nhãn tầng kiểu ▽ RSL có gạch chân (chỉ tên tầng) */
function labelSprite(text: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  const ctx0 = cv.getContext('2d')!;
  ctx0.font = 'bold 48px sans-serif';
  const w = Math.ceil(ctx0.measureText(text).width) + 30;
  cv.width = w;
  cv.height = 80;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 48px sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 10, 56);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 72);
  ctx.lineTo(w, 72);
  ctx.stroke();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  const hgt = 1.3;
  sp.scale.set((hgt * w) / 80, hgt, 1);
  sp.center.set(0, 0.1); // gạch chân nằm đúng cao độ tầng
  sp.renderOrder = 11;
  return sp;
}

/** nhãn giao tuyến 作業平面 – trục / tầng */
function cutLabel(text: string, color: string): THREE.Sprite {
  const cv = document.createElement('canvas');
  const c0 = cv.getContext('2d')!;
  c0.font = 'bold 40px sans-serif';
  const w = Math.ceil(c0.measureText(text).width) + 24;
  cv.width = w;
  cv.height = 56;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffffdd';
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.fillRect(2, 2, w - 4, 52);
  ctx.strokeRect(2, 2, w - 4, 52);
  ctx.fillStyle = color;
  ctx.font = 'bold 40px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, 30);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  sp.scale.set((0.7 * w) / 56, 0.7, 1);
  sp.renderOrder = 12;
  return sp;
}

/** Nhãn kích thước (chữ trên nền trắng, không viền) */
function dimLabel(text: string, color: string, h = 0.42): THREE.Sprite {
  const cv = document.createElement('canvas');
  const c0 = cv.getContext('2d')!;
  c0.font = 'bold 40px sans-serif';
  const w = Math.ceil(c0.measureText(text).width) + 16;
  cv.width = w;
  cv.height = 50;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#ffffffcc';
  ctx.fillRect(0, 0, w, 50);
  ctx.fillStyle = color;
  ctx.font = 'bold 40px sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, 27);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }));
  sp.scale.set((h * w) / 50, h, 1);
  sp.renderOrder = 14;
  return sp;
}

function textSprite(text: string, color = '#0f172a', bg = '#ffffff'): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = bg;
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  sp.scale.set(1.2, 1.2, 1);
  sp.renderOrder = 10;
  return sp;
}

interface Props {
  project: Project;
  members: Member[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  highlightMark?: string | null;
  /** Tô màu theo loại cấu kiện hoặc theo 工区 / グループ / 分類 / 塗装 */
  colorBy?: ColorBy;
  /** Bộ lọc hiển thị thêm (trang 3D riêng) */
  visible?: (m: Member) => boolean;
  /** Ẩn bảng lớp mặc định (khi trang 3D có bảng lớp riêng) */
  hideLegend?: boolean;
  /** Chế độ nhập trực tiếp: hiện điểm giao trục ở cao độ z (mm), bấm để đặt */
  pick?: PickNodes | null;
  /** Cấu kiện xem trước (chưa xác nhận) */
  ghosts?: Member[];
  /** Điểm liên kết (point 継手) để bấm sửa */
  points?: JPoint[];
  activePoint?: string | null;
  onPoint?: (key: string) => void;
  /** 補助線 (3D) và khung 作業平面 */
  auxSegs?: [Vec3, Vec3][];
  planes?: PlaneViz[];
  /** 勾配設定: mặt / đường 勾配 (toạ độ 3D) */
  slopeVis?: { pts: Vec3[]; line: boolean; active?: boolean; ok?: boolean; label: string }[];
  /** điểm va chạm (mm) */
  marks?: Vec3[];
  /** khoá của từng đoạn auxSegs (để bấm chọn 補助線) */
  auxKeys?: string[];
  /** điểm đang chọn khi nhập (cam) */
  pickMarks?: Vec3[];
}

export interface JPoint {
  key: string;
  p: Vec3;
  color: string;
  label?: string;
}

export interface PickNodes {
  z: number;
  /** nút đang chọn làm điểm đầu (id trục X, Y) */
  start?: { x: string; y: string } | null;
  color?: string;
  hint?: string;
  onNode: (x: string, y: string) => void;
  /** 'member': bấm chọn cấu kiện (cột / dầm) thay vì giao trục */
  mode?: 'node' | 'member';
  /** cấu kiện đã chọn làm đầu 1 (tô đỏ) */
  startMember?: string | null;
  onMember?: (memberId: string, point: Vec3) => void;
  /** bấm chọn 補助線 (khoá theo auxKeys) */
  onAux?: (key: string) => void;
  /** bấm đường trục (gx / gy) hoặc đường / nhãn tầng (lv) */
  onGrid?: (kind: 'gx' | 'gy' | 'lv', id: string) => void;
  /** quét chọn bằng khung (kéo chuột trái / 1 ngón): trái → phải = nằm trọn trong khung, phải → trái = chạm khung. add = giữ Shift */
  onBox?: (memberIds: string[], add: boolean) => void;
  /** các 部材 (id gốc) đang được chọn – tô vàng */
  selSrc?: string[];
  /** Mặt bằng 2D: kéo khung → trả toạ độ khung (thế giới) */
  onRect?: (x0: number, y0: number, x1: number, y1: number) => void;
  /** chỉ bắt giao trục trên Mặt bằng (mặt đứng: bấm đường trục không tạo cấu kiện) + bán kính bắt nhỏ */
  planNodesOnly?: boolean;
  /** 2D: bấm / quét cấu kiện ở mọi cao độ (không chỉ quanh tầng đang xem) */
  anyZ?: boolean;
}

export type ColorBy = 'kind' | 'zone' | 'group' | 'cls' | 'paint';

export function categoryColors(p: Project, by: ColorBy): Map<string, string> {
  if (by === 'zone') return new Map(p.zones.map((z) => [z.name, z.color]));
  if (by === 'group') return new Map(p.groups.map((z) => [z.name, z.color]));
  if (by === 'cls') return new Map(p.classes.map((z) => [z.name, z.color]));
  if (by === 'paint') return new Map(p.paints.map((z) => [z.name, z.color]));
  return new Map();
}

/** Hệ trục đơn vị của cấu kiện (không co giãn) để đặt bản mã mối nối */
function memberBasis(m: Member) {
  const mat = memberMatrix(m);
  const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3();
  mat.extractBasis(x, y, z);
  return { x, y, z: z.normalize() };
}

export default function Viewer3D({ project, members, selected, onSelect, highlightMark, colorBy = 'kind', visible, hideLegend, pick, ghosts, points, activePoint, onPoint, auxSegs, planes, marks, auxKeys, pickMarks, slopeVis }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctx = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    controls: OrbitControls;
    model: THREE.Group;
    grid: THREE.Group;
    nodes: THREE.Group;
    jpts: THREE.Group;
    fitted: boolean;
    fitExt?: string;
  }>();
  const pickRef = useRef<PickNodes | null | undefined>(pick);
  pickRef.current = pick;
  // ⬚ Quét: kéo 1 ngón (điện thoại) = quét khung chọn ngay, không cần giữ
  const [scanOn, setScanOn] = useState(false);
  const scanRef = useRef(false);
  scanRef.current = scanOn && !!pick?.onBox;
  const membersRef = useRef(members);
  membersRef.current = members;
  const onPointRef = useRef(onPoint);
  onPointRef.current = onPoint;
  const [hidden, setHidden] = useState<Record<MemberKind, boolean>>({ column: false, beam: false, rafter: false, purlin: false, girt: false, brace: false, misc: false });
  const [showGrid, setShowGrid] = useState(true);
  const [showAux, setShowAux] = useState(true);
  const [showPlanes, setShowPlanes] = useState(true);
  const [showDims, setShowDims] = useState(true);
  // tốc độ xoay (điện thoại mặc định chậm hơn)
  const [rotSpd, setRotSpd] = useState<number>(() => {
    try {
      const v = +(localStorage.getItem('s3t.rot') ?? '');
      if (v > 0) return v;
    } catch { /* bỏ qua */ }
    return typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 1 : 1;
  });
  const rotSpdRef = useRef(rotSpd);
  rotSpdRef.current = rotSpd;
  // 📏 thước đo khoảng cách bề mặt – bề mặt giữa 2 部材
  const [measOn, setMeasOn] = useState(false);
  const [measIds, setMeasIds] = useState<string[]>([]);
  const measRef = useRef<((id: string | null) => void) | null>(null);
  measRef.current = measOn ? (id) => { if (id) setMeasIds((ids) => (ids.length >= 2 ? [id] : ids[0] === id ? ids : [...ids, id])); } : null;

  // Khởi tạo scene 1 lần
  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eef2f7');
    // chiếu song song (tỉ lệ 1:1, không méo phối cảnh): nhìn bằng thì dầm tầng trên che đúng dầm tầng dưới
    const camera = new THREE.OrthographicCamera(-FH, FH, FH, -FH, -5000, 5000);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    // Lăn chuột: phóng to/thu nhỏ tại vị trí con trỏ; chuột giữa hoặc phải: dời (pan)
    controls.zoomToCursor = true;
    controls.screenSpacePanning = true;
    // Chuột trái: xoay quanh điểm dưới con trỏ quanh điểm dưới con trỏ (tự xử lý bên dưới), nên tắt xoay mặc định của OrbitControls
    controls.mouseButtons = { LEFT: -1 as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    // cảm ứng: 1 ngón = xoay (tự xử lý bên dưới), 2 ngón = phóng to / dời
    // điện thoại: cả 1 ngón (xoay) và 2 ngón (phóng to quanh điểm giữa 2 ngón + dời) đều tự xử lý bên dưới
    controls.touches = { ONE: -1 as unknown as THREE.TOUCH, TWO: -1 as unknown as THREE.TOUCH };
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
    scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 1.6));
    const dl = new THREE.DirectionalLight('#ffffff', 1.4);
    dl.position.set(30, -40, 60);
    scene.add(dl);
    const model = new THREE.Group();
    const grid = new THREE.Group();
    const nodes = new THREE.Group();
    const jpts = new THREE.Group();
    scene.add(model, grid, nodes, jpts);
    ctx.current = { renderer, scene, camera, controls, model, grid, nodes, jpts, fitted: false };
    // kiểm thử: đặt camera nhìn vào 1 điểm (mm)
    (window as unknown as { __s3tCam?: unknown }).__s3tCam = (x: number, y: number, z: number, dx: number, dy: number, dz: number, zoom: number) => {
      const t = new THREE.Vector3(x * S, y * S, z * S);
      camera.position.copy(t).add(new THREE.Vector3(dx, dy, dz).normalize().multiplyScalar(5000 * S + 50));
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
      controls.target.copy(t);
      controls.update();
    };
    // hỗ trợ kiểm thử tự động: toạ độ mm → pixel màn hình
    (window as unknown as { __s3tToScreen?: (p: Vec3) => [number, number] }).__s3tToScreen = (q) => {
      const v3 = new THREE.Vector3(q[0] * S, q[1] * S, q[2] * S).project(camera);
      const r = localRect(renderer.domElement);
      const lx = r.left + ((v3.x + 1) / 2) * r.width, ly = r.top + ((1 - v3.y) / 2) * r.height;
      return isRot() ? [window.innerWidth - ly, lx] : [lx, ly];
    };

    let prevW = 0;
    const resize = () => {
      const w = host.clientWidth, h = host.clientHeight;
      // giữ nguyên bề ngang đang nhìn khi đổi độ rộng khung (kéo thanh chia)
      if (prevW > 0 && w > 0) camera.zoom *= w / prevW;
      if (w > 0) prevW = w;
      renderer.setSize(w, h);
      const asp = w / Math.max(h, 1);
      camera.left = -FH * asp;
      camera.right = FH * asp;
      camera.top = FH;
      camera.bottom = -FH;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();
    let raf = 0;
    const loop = () => {
      controls.update();
      // nhãn 寸法 giữ cỡ chữ cố định trên màn hình
      const wpp = (2 * FH) / camera.zoom / Math.max(1, host.clientHeight);
      for (const nm of ['dimg', 'measg']) {
        const dg = scene.getObjectByName(nm);
        if (dg) for (const o of dg.children) if (o.userData.px) o.scale.set(o.userData.px * o.userData.asp * wpp, o.userData.px * wpp, 1);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    // chọn cấu kiện bằng click + xoay quanh điểm dưới con trỏ chuột
    const ray = new THREE.Raycaster();
    const ndc = (e: PointerEvent) => {
      const r = localRect(renderer.domElement);
      const [px, py] = localPt(e.clientX, e.clientY);
      return new THREE.Vector2(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    };
    const pickModel = (e: PointerEvent) => {
      ray.setFromCamera(ndc(e), camera);
      const vis = model.children.filter((o) => o.visible);
      const hit = ray.intersectObjects(vis, false)[0];
      if (hit || e.pointerType !== 'touch') return hit;
      // ngón tay: thanh mảnh khó bấm trúng → dò thêm các điểm quanh chỗ chạm (gần trước, xa sau)
      const r = localRect(renderer.domElement);
      const [px, py] = localPt(e.clientX, e.clientY);
      for (const rad of [6, 12, 18, 24]) {
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          const qx = px + Math.cos(a) * rad, qy = py + Math.sin(a) * rad;
          ray.setFromCamera(new THREE.Vector2(((qx - r.left) / r.width) * 2 - 1, -((qy - r.top) / r.height) * 2 + 1), camera);
          const h = ray.intersectObjects(vis, false)[0];
          if (h) { ray.setFromCamera(ndc(e), camera); return h; }
        }
      }
      ray.setFromCamera(ndc(e), camera);
      return undefined;
    };
    // dấu tâm xoay
    const marker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#f97316', depthTest: false, transparent: true, opacity: 0.85 }));
    marker.renderOrder = 999;
    marker.visible = false;
    scene.add(marker);

    let down = { x: 0, y: 0 };
    let drag: { id: number; x: number; y: number; pivot: THREE.Vector3 } | null = null;
    // quét chọn bằng khung
    let box: { id: number; x0: number; y0: number; x1: number; y1: number; shift: boolean } | null = null;
    let lpTimer = 0;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    const boxEl = document.createElement('div');
    boxEl.className = 'sel-box';
    boxEl.style.display = 'none';
    host.appendChild(boxEl);
    const drawBox = () => {
      if (!box) return void (boxEl.style.display = 'none');
      const r = localRect(renderer.domElement);
      const x = Math.min(box.x0, box.x1) - r.left, y = Math.min(box.y0, box.y1) - r.top;
      Object.assign(boxEl.style, { display: Math.hypot(box.x1 - box.x0, box.y1 - box.y0) > 4 ? 'block' : 'none', left: `${x}px`, top: `${y}px`, width: `${Math.abs(box.x1 - box.x0)}px`, height: `${Math.abs(box.y1 - box.y0)}px` });
      boxEl.classList.toggle('cross', box.x1 < box.x0);
    };
    /** các 部材 trong khung: trái → phải = nằm trọn, phải → trái = chạm */
    const boxPick = (b: NonNullable<typeof box>) => {
      const r = localRect(renderer.domElement);
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const cross = b.x1 < b.x0;
      const vis = new Set(model.children.filter((o) => o.visible && o.userData.id).map((o) => o.userData.id as string));
      const scr = (p: Vec3) => {
        const v = new THREE.Vector3(p[0] * S, p[1] * S, p[2] * S).project(camera);
        return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height] as const;
      };
      const inside = (q: readonly [number, number]) => q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1;
      const segHit = (p: readonly [number, number], q: readonly [number, number]) => {
        if (inside(p) || inside(q)) return true;
        // đoạn thẳng cắt 1 trong 4 cạnh khung
        const ed: [number, number, number, number][] = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
        const cr = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        return ed.some(([ax, ay, bx, by]) => cr(ax, ay, bx, by, p[0], p[1]) * cr(ax, ay, bx, by, q[0], q[1]) <= 0 && cr(p[0], p[1], q[0], q[1], ax, ay) * cr(p[0], p[1], q[0], q[1], bx, by) <= 0);
      };
      return membersRef.current
        .filter((m) => vis.has(m.id))
        .filter((m) => {
          const a = scr(m.a), c = scr(m.b);
          return cross ? segHit(a, c) : inside(a) && inside(c);
        })
        .map((m) => m.id);
    };
    const Z = new THREE.Vector3(0, 0, 1);
    const touches = new Set<number>();
    // vị trí các ngón (toạ độ giao diện, đã quy đổi khi xoay ngang) và trạng thái chụm 2 ngón
    const tpos = new Map<number, [number, number]>();
    let pinch: { d: number; mx: number; my: number } | null = null;
    const pinchState = () => {
      const [a, b] = [...tpos.values()];
      return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
    };
    /** điểm thế giới trên mặt phẳng camera tại toạ độ giao diện (px, py) */
    const worldAt = (px: number, py: number) => {
      const r = localRect(renderer.domElement);
      return new THREE.Vector3(((px - r.left) / r.width) * 2 - 1, -((py - r.top) / r.height) * 2 + 1, 0).unproject(camera);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        touches.add(e.pointerId);
        tpos.set(e.pointerId, localPt(e.clientX, e.clientY));
        // ngón thứ 2: thôi xoay, chuyển sang chụm (phóng to quanh điểm giữa 2 ngón) + dời
        if (touches.size > 1) {
          drag = null;
          marker.visible = false;
          pinch = tpos.size >= 2 ? pinchState() : null;
          return;
        }
      }
      down = { x: e.clientX, y: e.clientY };
      if (e.button !== 0) return;
      clearTimeout(lpTimer);
      // điện thoại: kéo 1 ngón = xoay như thường; giữ yên ~0,45 s rồi kéo = quét chọn khung
      if (e.pointerType === 'touch' && pickRef.current?.onBox && !scanRef.current) {
        const [bx, by] = localPt(e.clientX, e.clientY);
        const id = e.pointerId;
        lpTimer = window.setTimeout(() => {
          if (!drag || drag.id !== id || marker.visible || touches.size > 1) return;
          drag = null;
          box = { id, x0: bx, y0: by, x1: bx, y1: by, shift: false };
          drawBox();
          try { navigator.vibrate?.(15); } catch { /* bỏ qua */ }
        }, 450);
      } else if (pickRef.current?.onBox && !e.altKey && !e.ctrlKey) {
        const [lx, ly] = localPt(e.clientX, e.clientY);
        box = { id: e.pointerId, x0: lx, y0: ly, x1: lx, y1: ly, shift: e.shiftKey };
        try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
        return;
      }
      const hit = pickModel(e);
      let pivot = hit?.point.clone();
      if (!pivot) {
        const p = new THREE.Vector3();
        if (ray.ray.intersectPlane(new THREE.Plane(Z, 0), p) && p.distanceTo(camera.position) < camera.far) pivot = p;
      }
      pivot ??= controls.target.clone();
      // điện thoại: xoay quanh tâm màn hình (điểm 3D ở giữa khung nhìn), ngón tay không che mất tâm và không bị nhảy tâm
      if (e.pointerType === 'touch') {
        ray.setFromCamera(new THREE.Vector2(0, 0), camera);
        const ch = ray.intersectObjects(model.children.filter((o) => o.visible), false)[0];
        pivot = ch?.point.clone() ?? controls.target.clone();
      }
      const [lx, ly] = localPt(e.clientX, e.clientY);
      drag = { id: e.pointerId, x: lx, y: ly, pivot };
      controls.zoomToCursor = !isRot();
      try { renderer.domElement.setPointerCapture(e.pointerId); } catch { /* bỏ qua */ }
    };
    let hoverNode: THREE.Mesh | null = null;
    const onMove = (e: PointerEvent) => {
      if (!drag && pickRef.current && nodes.children.length) {
        ray.setFromCamera(ndc(e), camera);
        const nh = (ray.intersectObjects(nodes.children, false)[0]?.object as THREE.Mesh | undefined) ?? null;
        if (nh !== hoverNode) {
          if (hoverNode) hoverNode.scale.setScalar(hoverNode.userData.r);
          hoverNode = nh;
          if (nh) nh.scale.setScalar(nh.userData.r * 1.7);
          renderer.domElement.style.cursor = nh ? 'pointer' : '';
        }
      }
      if (e.pointerType === 'touch' && tpos.has(e.pointerId)) {
        tpos.set(e.pointerId, localPt(e.clientX, e.clientY));
        if (tpos.size >= 2 && pinch) {
          const nw = pinchState();
          // phóng to giữ nguyên điểm dưới tâm 2 ngón
          const before = worldAt(nw.mx, nw.my);
          camera.zoom = Math.max(0.02, Math.min(400, camera.zoom * (nw.d / pinch.d)));
          camera.updateProjectionMatrix();
          const after = worldAt(nw.mx, nw.my);
          const sh = before.sub(after);
          // dời theo chuyển động của tâm 2 ngón
          const p0 = worldAt(pinch.mx, pinch.my), p1 = worldAt(nw.mx, nw.my);
          sh.add(p0.sub(p1));
          camera.position.add(sh);
          controls.target.add(sh);
          camera.updateMatrixWorld();
          pinch = nw;
          return;
        }
      }
      if (box && e.pointerId === box.id) {
        if (touches.size > 1) {
          box = null;
          drawBox();
          return;
        }
        [box.x1, box.y1] = localPt(e.clientX, e.clientY);
        drawBox();
        return;
      }
      if (!drag || e.pointerId !== drag.id) return;
      const [lx, ly] = localPt(e.clientX, e.clientY);
      // điện thoại: bỏ qua rung tay nhỏ lúc bắt đầu chạm
      if (e.pointerType === 'touch' && !marker.visible && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) return;
      const dx = lx - drag.x, dy = ly - drag.y;
      drag.x = lx;
      drag.y = ly;
      if (!dx && !dy) return;
      const h = renderer.domElement.clientHeight || 1;
      if (touches.size > 1) return;
      // máy tính: 1 chiều cao màn hình = 1 vòng × tốc xoay; điện thoại: kéo hết chiều cao = nửa vòng × tốc xoay (dễ chỉnh góc)
      const k = ((e.pointerType === 'touch' ? Math.PI : 2 * Math.PI) / h) * rotSpdRef.current;
      const pv = drag.pivot;
      marker.visible = true;
      marker.position.copy(pv);
      marker.scale.setScalar((FH / camera.zoom) * 0.012);
      const yaw = new THREE.Quaternion().setFromAxisAngle(Z, -dx * k);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
      let pitchQ = new THREE.Quaternion().setFromAxisAngle(right, -dy * k);
      // không cho lật qua đỉnh / đáy
      const dir = controls.target.clone().sub(camera.position).normalize().applyQuaternion(pitchQ);
      if (Math.abs(dir.dot(Z)) > 0.995) pitchQ = new THREE.Quaternion();
      const q = yaw.multiply(pitchQ);
      camera.position.sub(pv).applyQuaternion(q).add(pv);
      controls.target.sub(pv).applyQuaternion(q).add(pv);
      camera.lookAt(controls.target);
      controls.update();
    };
    const onUp = (e: PointerEvent) => {
      clearTimeout(lpTimer);
      const multi = touches.size > 1;
      touches.delete(e.pointerId);
      tpos.delete(e.pointerId);
      if (tpos.size < 2) pinch = null;
      if (multi) {
        drag = null;
        box = null;
        drawBox();
        marker.visible = false;
        return;
      }
      if (box && e.pointerId === box.id) {
        const b = box;
        box = null;
        drawBox();
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* bỏ qua */ }
        if (Math.hypot(b.x1 - b.x0, b.y1 - b.y0) > (e.pointerType === 'touch' ? 10 : 4)) {
          pickRef.current?.onBox?.(boxPick(b), b.shift || e.shiftKey);
          return;
        }
      }
      if (drag && e.pointerId === drag.id) {
        drag = null;
        marker.visible = false;
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch { /* bỏ qua */ }
      }
      if (e.button !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > (e.pointerType === 'touch' ? 10 : 4)) return;
      if (measRef.current) {
        const hit = pickModel(e);
        let o: THREE.Object3D | null = hit?.object ?? null;
        while (o && !o.userData.id && o.parent !== model) o = o.parent;
        measRef.current(o?.userData.id ? (o.userData.id as string) : null);
        return;
      }
      if (onPointRef.current && jpts.children.length) {
        ray.setFromCamera(ndc(e), camera);
        const ph = ray.intersectObjects(jpts.children, false)[0];
        if (ph?.object.userData.jp) {
          onPointRef.current(ph.object.userData.jp as string);
          return;
        }
      }
      if (pickRef.current?.onAux) {
        const al = scene.getObjectByName('auxL');
        const ln = al?.visible ? (al.children[0] as THREE.LineSegments | undefined) : undefined;
        if (ln) {
          ray.setFromCamera(ndc(e), camera);
          ray.params.Line = { threshold: (FH / camera.zoom) * (e.pointerType === 'touch' ? 0.04 : 0.012) };
          const h = ray.intersectObject(ln, false)[0];
          const mh = pickModel(e);
          if (h && h.index !== undefined && (!mh || h.distance <= mh.distance + 0.5)) {
            const key = (ln.userData.keys as string[])[Math.floor(h.index / 2)];
            if (key) {
              pickRef.current.onAux(key);
              return;
            }
          }
        }
      }
      if (pickRef.current?.onGrid && ctx.current?.grid.visible) {
        ray.setFromCamera(ndc(e), camera);
        ray.params.Line = { threshold: (FH / camera.zoom) * (e.pointerType === 'touch' ? 0.04 : 0.012) };
        const cands = ctx.current.grid.children.filter((o) => o.userData.gk);
        const gh = ray.intersectObjects(cands, false)[0];
        const mh = pickModel(e);
        if (gh && (gh.object.type === 'Sprite' || !mh || gh.distance <= mh.distance + 0.5)) {
          pickRef.current.onGrid(gh.object.userData.gk as 'gx' | 'gy' | 'lv', gh.object.userData.gid as string);
          return;
        }
      }
      if (pickRef.current?.mode === 'member' && pickRef.current.onMember) {
        const hit = pickModel(e);
        let o: THREE.Object3D | null = hit?.object ?? null;
        while (o && !o.userData.id && o.parent !== model) o = o.parent;
        if (hit && o?.userData.id) pickRef.current.onMember(o.userData.id as string, [hit.point.x / S, hit.point.y / S, hit.point.z / S]);
        return;
      }
      if (pickRef.current && nodes.children.length) {
        ray.setFromCamera(ndc(e), camera);
        const nh = ray.intersectObjects(nodes.children, false)[0];
        if (nh?.object.userData.node) {
          const nd = nh.object.userData.node as { x: string; y: string };
          pickRef.current.onNode(nd.x, nd.y);
          return;
        }
      }
      const hit = pickModel(e);
      let o: THREE.Object3D | null = hit?.object ?? null;
      while (o && !o.userData.id && o.parent !== model) o = o.parent;
      onSelectRef.current(o?.userData.id ? (o.userData.id as string) : null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); drag = null; marker.visible = false; });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Dựng lại mô hình khi dữ liệu đổi
  useEffect(() => {
    const c = ctx.current!;
    const dispose = (g: THREE.Group) => {
      g.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) mat.dispose();
      });
      g.clear();
    };
    dispose(c.model);
    dispose(c.grid);

    const geoCache = new Map<string, THREE.ExtrudeGeometry>();
    const catColors = categoryColors(project, colorBy);
    const diaMat = new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide });
    const stiffMat = new THREE.MeshStandardMaterial({ color: '#fb923c', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide });
    const jointMat = new THREE.MeshStandardMaterial({ color: '#e11d48', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide });
    const jointByName = new Map(project.joints.map((j) => [j.name, { ...j, flgCut: j.flgCut ?? project.params.member.gplCut ?? 'one' }]));
    const baseByName = new Map(project.bases.map((b) => [b.name, b]));
    const baseMat = new THREE.MeshStandardMaterial({ color: '#334155', metalness: 0.3, roughness: 0.6 });
    const anchorMat = new THREE.MeshStandardMaterial({ color: '#a16207', metalness: 0.5, roughness: 0.4 });
    // Bulông 3D theo loại bulông của 継手: S10T (トルシア, đầu tròn, 1 long đền phía đai ốc), F10T / khác (đầu lục giác, long đền 2 phía)
    const round: { m: THREE.Matrix4; c: string }[] = [];
    const hex: { m: THREE.Matrix4; c: string }[] = [];
    const addCyl = (list: typeof round, center: THREE.Vector3, u: THREE.Vector3, a: THREE.Vector3, w: THREE.Vector3, r: number, len: number, c: string) => {
      const mm = new THREE.Matrix4().makeBasis(u, a, w);
      mm.scale(new THREE.Vector3(r * S, len * S, r * S));
      mm.setPosition(center);
      list.push({ m: mm, c });
    };
    const addBolts = (bs: ReturnType<typeof jointBolts>, A: THREE.Vector3, x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3, z0: number, d: number, grade: string) => {
      const tors = isTorshear(grade);
      const headH = 0.65 * d, nutH = 0.8 * d, wt = 0.22 * d;
      for (const b of bs) {
        const ax = b.axis === 'x' ? x : y;
        const [u, w] = b.axis === 'x' ? [z, y] : [x, z];
        const base = A.clone().add(z.clone().multiplyScalar((z0 + b.z) * S)).add((b.axis === 'x' ? y.clone().multiplyScalar(b.y) : x.clone().multiplyScalar(b.x)).multiplyScalar(S));
        const at = (t: number) => base.clone().add(ax.clone().multiplyScalar(t * S));
        const sg = Math.sign(b.out - b.inn) || 1;
        // đầu bulông
        const hw = tors ? 0 : wt;
        if (!tors) addCyl(round, at(b.out + sg * wt / 2), u, ax, w, 1.1 * d, wt, '#cbd5e1');
        addCyl(tors ? round : hex, at(b.out + sg * (hw + headH / 2)), u, ax, w, tors ? 0.85 * d : 0.95 * d, headH, tors ? '#1f2937' : '#475569');
        // long đền + đai ốc phía trong
        addCyl(round, at(b.inn - sg * wt / 2), u, ax, w, 1.1 * d, wt, '#cbd5e1');
        addCyl(hex, at(b.inn - sg * (wt + nutH / 2)), u, ax, w, 0.95 * d, nutH, '#334155');
        // thân bulông, nhô qua đai ốc ~ 3 ren
        const t1 = b.inn - sg * (wt + nutH + 0.4 * d);
        addCyl(round, at((b.out + t1) / 2), u, ax, w, d / 2, Math.abs(b.out - t1), tors ? '#1f2937' : '#64748b');
      }
    };
    for (const m of members) {
      let geo = geoCache.get(m.section.id);
      if (!geo) {
        geo = new THREE.ExtrudeGeometry(profileShape(m.section), { depth: 1, bevelEnabled: false, curveSegments: 10 });
        geoCache.set(m.section.id, geo);
      }
      const isStartPick = !!pick?.startMember && m.source === pick.startMember;
      const isSel = m.id === selected || (!!highlightMark && m.mark === highlightMark) || (!!m.source && !!pick?.selSrc?.includes(m.source));
      const mat = new THREE.MeshStandardMaterial({
        color: isStartPick ? '#dc2626' : isSel ? '#facc15' : colorBy === 'kind' ? (m.part === 'shikuchi' ? '#7c3aed' : m.part === 'piece' ? '#dc2626' : m.part === 'bolt' ? '#111827' : KIND_COLOR[m.kind]) : (catColors.get((m[colorBy] as string) ?? '') ?? '#e2e8f0'),
        emissive: isSel ? '#a16207' : '#000000',
        metalness: 0.2,
        roughness: 0.6,
        side: THREE.DoubleSide,
        // コア 仕口: trong suốt để nhìn thấy ダイアフラム bên trong
        ...(m.part === 'shikuchi' && !isSel ? { transparent: true, opacity: 0.35, depthWrite: false } : {}),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.matrixAutoUpdate = false;
      // ブラケット hàn vào 本柱: bụng chạy tới mặt cột (スカラップ / ノンスカラップ), cánh có 開先 + ルート間隔 tới mép 通しダイアフラム
      const be = m.brkEnd && m.section.type === 'I' ? m.brkEnd : undefined;
      mesh.matrix.copy(memberMatrix(m));
      mesh.userData.id = m.id;
      mesh.visible = !hidden[m.kind] && (visible ? visible(m) : true);
      if (!be) c.model.add(mesh);
      else {
        const bw = bracketWeldOf(project.params);
        const fs = m.flgSet ?? [0, 0];
        const len = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]) || 1;
        const { x, y, z } = memberBasis(m);
        const A = new THREE.Vector3(...m.a).multiplyScalar(S);
        const { h, b: fb, tw, tf } = m.section;
        const hw = Math.max(1, h - 2 * tf);
        const tb = Math.tan(((bw.bevel ?? 35) * Math.PI) / 180) * tf;
        const ga = be[0] ? fs[0] + bw.rootGap : 0, gb = be[1] ? fs[1] + bw.rootGap : 0;
        const ba = be[0] ? tb : 0, bb = be[1] ? tb : 0;
        const add = (shape: THREE.Shape, depth: number, X: THREE.Vector3, Y: THREE.Vector3, Z: THREE.Vector3, o: THREE.Vector3) => {
          const gm = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }), mat);
          gm.matrixAutoUpdate = false;
          gm.matrix.makeBasis(X.clone().multiplyScalar(S), Y.clone().multiplyScalar(S), Z.clone().multiplyScalar(S)).setPosition(o);
          gm.userData.id = m.id;
          gm.visible = mesh.visible;
          c.model.add(gm);
        };
        // cánh: mặt cắt dọc (u dọc dầm, v từ mặt trong ra mặt ngoài), 開先 mở ra phía ngoài
        const fl = new THREE.Shape();
        fl.moveTo(ga, 0); fl.lineTo(len - gb, 0); fl.lineTo(len - gb - bb, tf); fl.lineTo(ga + ba, tf); fl.closePath();
        for (const sg of [1, -1]) add(fl, fb, z, y.clone().multiplyScalar(sg), x, A.clone().add(y.clone().multiplyScalar((sg * hw * S) / 2)).add(x.clone().multiplyScalar((-fb * S) / 2)));
        // bụng: スカラップ = khoét 1/4 tròn r1 ở góc tiếp giáp cánh tại đầu hàn vào cột
        const sc = bw.scallop === 'scallop';
        const ra = be[0] && sc ? Math.min(bw.r1 ?? 35, hw / 3) : 0, rb = be[1] && sc ? Math.min(bw.r1 ?? 35, hw / 3) : 0;
        const H = hw / 2;
        const wb = new THREE.Shape();
        wb.moveTo(0, -H + ra);
        wb.lineTo(0, H - ra);
        if (ra) wb.absarc(0, H, ra, -Math.PI / 2, 0, false);
        wb.lineTo(len - rb, H);
        if (rb) wb.absarc(len, H, rb, Math.PI, Math.PI * 1.5, false);
        wb.lineTo(len, -H + rb);
        if (rb) wb.absarc(len, -H, rb, Math.PI / 2, Math.PI, false);
        wb.lineTo(ra, -H);
        if (ra) wb.absarc(0, -H, ra, 0, Math.PI / 2, false);
        wb.closePath();
        add(wb, tw, z, y, x, A.clone().add(x.clone().multiplyScalar((-tw * S) / 2)));
      }
      // ダイアフラム / スチフナー tại 仕口
      if (m.dia?.length) {
        const vis = !hidden[m.kind] && (visible ? visible(m) : true);
        const r = ((m.rotation ?? 0) * Math.PI) / 180;
        const bx = new THREE.Vector3(Math.cos(r), Math.sin(r), 0), by = new THREE.Vector3(-Math.sin(r), Math.cos(r), 0), bz = new THREE.Vector3(0, 0, 1);
        for (const d of m.dia) {
          const geoD = d.round ? new THREE.CylinderGeometry((d.w / 2) * S, (d.w / 2) * S, d.t * S, 32) : new THREE.BoxGeometry(d.w * S, d.d * S, d.t * S);
          const pl = new THREE.Mesh(geoD, isSel ? mat : d.kind === 'through' ? diaMat : stiffMat);
          pl.matrixAutoUpdate = false;
          const ctr = new THREE.Vector3(m.a[0] * S, m.a[1] * S, d.z * S).add(bx.clone().multiplyScalar((d.off ?? 0) * S));
          if (d.round) pl.matrix.makeBasis(bx, bz, bx.clone().cross(bz)).setPosition(ctr);
          else pl.matrix.makeBasis(bx, by, bz).setPosition(ctr);
          pl.userData.id = m.id;
          pl.visible = vis;
          c.model.add(pl);
        }
      }
      // Bản ghép mối nối (継手) và bản đế chân cột (ベース)
      // 継手 中 (chỗ tách ブラケット của 大梁 / mối nối giữa cột) luôn là mối nối bản ghép: nếu gán nhầm 継手 kiểu GPL thì vẽ như SPL
      const midAs = (j: Joint | undefined, pos: JointPos) => (j && pos === 'mid' && (m.kind === 'beam' || m.kind === 'column') && j.type === 'GPL' ? { ...j, type: 'SPL' as const, webL: 0, flangeL: 0, webH: 0 } : j);
      const js = (m.joints ?? []).filter((x) => !x.dup).map((x) => ({ pos: x.pos, at: x.at, j: midAs(jointByName.get(x.name), x.pos) })).filter((x) => x.j);
      const bp = m.base ? baseByName.get(m.base) : undefined;
      if (js.length || bp) {
        const { x, y, z } = memberBasis(m);
        const A = new THREE.Vector3(...m.a).multiplyScalar(S);
        const vis = !hidden[m.kind] && (visible ? visible(m) : true);
        const addBox = (w: number, h: number, l: number, center: THREE.Vector3, matl: THREE.Material, bx = x, by = y, bz = z, geo?: THREE.BufferGeometry) => {
          const box = new THREE.Mesh(geo ?? new THREE.BoxGeometry(w * S, h * S, l * S), matl);
          box.matrixAutoUpdate = false;
          box.matrix.makeBasis(bx, by, bz).setPosition(center);
          box.userData.id = m.id;
          box.visible = vis;
          c.model.add(box);
        };
        for (const { pos, at, j } of js) {
          if (m.kind === 'brace') {
            // GPL ブレース: đa giác trong mặt phẳng giằng, đùn theo chiều dày
            const gg = braceGusset(project, m, pos, j!);
            const sh = new THREE.Shape(gg.pts.map(([u, v]) => new THREE.Vector2(u, v)));
            for (const h of gg.holes) {
              const hp = new THREE.Path();
              hp.absarc(h.c[0], h.c[1], h.r, 0, Math.PI * 2, true);
              sh.holes.push(hp);
            }
            const geo = new THREE.ExtrudeGeometry(sh, { depth: gg.t, bevelEnabled: false, curveSegments: 12 });
            const mesh = new THREE.Mesh(geo, jointMat);
            mesh.matrixAutoUpdate = false;
            const U = new THREE.Vector3(...gg.u), Vv = new THREE.Vector3(...gg.v), N = new THREE.Vector3(...gg.n);
            const o = new THREE.Vector3(...gg.o).sub(N.clone().multiplyScalar(gg.t / 2));
            mesh.matrix.makeBasis(U, Vv, N).scale(new THREE.Vector3(S, S, S)).setPosition(o.multiplyScalar(S));
            mesh.userData.id = m.id;
            mesh.visible = vis;
            c.model.add(mesh);
            continue;
          }
          const st = at !== undefined ? { z: at, dir: 0 } : jointStationAt(m.length, j!, pos);
          // tấm GPL tự vẽ riêng của point này (本体 › 継手)
          const inst = m.source ? project.beams.find((b) => b.id === m.source) ?? project.columns.find((cc) => cc.id === m.source) : undefined;
          const cpl = j!.type === 'GPL' && pos !== 'mid' && inst?.shapes?.[pos] ? project.plates?.find((x) => x.id === inst.shapes![pos]) : undefined;
          const cg = cpl ? plateGeometry(cpl) : undefined;
          if (cpl && cg?.outer) {
            const d = st.dir || 1;
            const sh = new THREE.Shape(cg.outer.map(([u, v]) => new THREE.Vector2(u, v)));
            for (const h of cg.holes) {
              const hp = new THREE.Path();
              hp.absarc(h.c[0], h.c[1], h.r, 0, Math.PI * 2, true);
              sh.holes.push(hp);
            }
            for (const hp of cg.holePolys) sh.holes.push(new THREE.Path(hp.map(([u, v]) => new THREE.Vector2(u, v))));
            const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: cpl.t, bevelEnabled: false, curveSegments: 12 }), jointMat);
            mesh.matrixAutoUpdate = false;
            const o = A.clone().add(z.clone().multiplyScalar(st.z * S)).add(x.clone().multiplyScalar((m.section.tw / 2) * S));
            mesh.matrix.makeBasis(z.clone().multiplyScalar(d), y.clone(), x.clone()).scale(new THREE.Vector3(S, S, S)).setPosition(o);
            mesh.userData.id = m.id;
            mesh.visible = vis;
            c.model.add(mesh);
          }
          for (const pl of jointPlates(m.section, j!, st.dir)) {
              if (cg?.outer && pl.name === 'Bản mã (ガセット)') continue;
              const center = A.clone()
                .add(z.clone().multiplyScalar((st.z + pl.oz) * S))
                .add(x.clone().multiplyScalar(pl.ox * S))
                .add(y.clone().multiplyScalar(pl.oy * S));
              addBox(pl.w, pl.h, pl.l, center, jointMat, x, y, z, plateGeo(pl));
            }
          if (vis) addBolts(jointBolts(m.section, j!, st.dir), A, x, y, z, st.z, j!.bolt.dia, j!.bolt.grade);
        }
        if (bp && m.kind === 'column') {
          const zb = Math.min(m.a[2], m.b[2]);
          const c0 = new THREE.Vector3(m.a[0] * S, m.a[1] * S, (zb - bp.t / 2) * S);
          const r = ((m.rotation ?? 0) * Math.PI) / 180;
          const bx = new THREE.Vector3(Math.cos(r), Math.sin(r), 0), by = new THREE.Vector3(-Math.sin(r), Math.cos(r), 0), bz = new THREE.Vector3(0, 0, 1);
          const BL = baseLayout(bp);
          // bản đế: đa giác (có 隅切り) đùn theo t, có lỗ bulông
          {
            const sh = new THREE.Shape(BL.outline.map(([u, v]) => new THREE.Vector2(u, v)));
            for (const [u, v] of BL.pts) {
              const hp = new THREE.Path();
              hp.absarc(u, v, BL.hole / 2, 0, Math.PI * 2, true);
              sh.holes.push(hp);
            }
            const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: bp.t, bevelEnabled: false, curveSegments: 10 }), baseMat);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.makeBasis(bx, by, bz).scale(new THREE.Vector3(S, S, S)).setPosition(c0.clone().sub(bz.clone().multiplyScalar((bp.t / 2) * S)));
            mesh.userData.id = m.id;
            mesh.visible = vis;
            c.model.add(mesh);
          }
          // bulông neo: đầu nhô 突出長 trên mặt bản, thân xuống bê tông; móc L / J hoặc アンカープレート ở chân
          const dia = bp.anchor.dia, L = bp.anchor.length;
          for (const [u, v] of BL.pts) {
            const top = bp.t / 2 + BL.proj;
            const p0 = c0.clone().add(bx.clone().multiplyScalar(u * S)).add(by.clone().multiplyScalar(v * S));
            addBox(dia, dia, L, p0.clone().add(bz.clone().multiplyScalar((top - L / 2) * S)), anchorMat, bx, by, bz);
            // ナット + 座金 trên bản đế
            addBox(dia * 1.7, dia * 1.7, dia * 0.8, p0.clone().add(bz.clone().multiplyScalar((bp.t / 2 + dia * 0.4 + 6) * S)), anchorMat, bx, by, bz);
            addBox(dia * 2.2, dia * 2.2, 6, p0.clone().add(bz.clone().multiplyScalar((bp.t / 2 + 3) * S)), baseMat, bx, by, bz);
            const zb = top - L; // chân bulông
            // móc quay ra ngoài bản đế
            const out = Math.abs(u) / (bp.b / 2) >= Math.abs(v) / (bp.d / 2) ? bx.clone().multiplyScalar(Math.sign(u) || 1) : by.clone().multiplyScalar(Math.sign(v) || 1);
            const side = out.clone().cross(bz).normalize();
            if (BL.shape === 'L' || BL.shape === 'J') {
              addBox(dia, dia, BL.hook, p0.clone().add(bz.clone().multiplyScalar((zb + dia / 2) * S)).add(out.clone().multiplyScalar((BL.hook / 2) * S)), anchorMat, side, bz, out);
              if (BL.shape === 'J') addBox(dia, dia, BL.hook * 0.6, p0.clone().add(out.clone().multiplyScalar((BL.hook - dia / 2) * S)).add(bz.clone().multiplyScalar((zb + BL.hook * 0.3) * S)), anchorMat, bx, by, bz);
            } else if (BL.shape === 'P') {
              addBox(BL.hook, BL.hook, Math.max(9, dia / 2), p0.clone().add(bz.clone().multiplyScalar((zb + 40) * S)), baseMat, bx, by, bz);
              addBox(dia * 1.7, dia * 1.7, dia * 0.8, p0.clone().add(bz.clone().multiplyScalar((zb + 40 + Math.max(9, dia / 2) / 2 + dia * 0.4) * S)), anchorMat, bx, by, bz);
            }
          }
        }
      }
    }

    // Xem trước: cấu kiện xanh trong suốt
    if (ghosts?.length) {
      const gm = new THREE.MeshStandardMaterial({ color: '#22c55e', transparent: true, opacity: 0.55, emissive: '#15803d', depthWrite: false, side: THREE.DoubleSide });
      for (const m of ghosts) {
        const geo = new THREE.ExtrudeGeometry(profileShape(m.section), { depth: 1, bevelEnabled: false, curveSegments: 10 });
        const mesh = new THREE.Mesh(geo, gm);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(memberMatrix(m));
        mesh.userData.ghost = true;
        mesh.raycast = () => undefined;
        mesh.renderOrder = 5;
        c.model.add(mesh);
        // 継手 của cấu kiện xem trước (SPL tại chỗ tách ブラケット, GPL ở đầu dầm…)
        const gj = new THREE.MeshStandardMaterial({ color: '#e11d48', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
        const { x, y, z } = memberBasis(m);
        const A = new THREE.Vector3(...m.a).multiplyScalar(S);
        for (const jx of (m.joints ?? []).filter((q) => !q.dup)) {
          const j0 = jointByName.get(jx.name);
          if (!j0 || m.kind === 'brace') continue;
          const j = jx.pos === 'mid' && j0.type === 'GPL' ? { ...j0, type: 'SPL' as const, webL: 0, flangeL: 0, webH: 0 } : j0;
          const st = jx.at !== undefined ? { z: jx.at, dir: 0 } : jointStationAt(m.length, j, jx.pos);
          for (const pl of jointPlates(m.section, j, st.dir)) {
            const b = new THREE.Mesh(plateGeo(pl), gj);
            b.matrixAutoUpdate = false;
            b.matrix.makeBasis(x, y, z).setPosition(A.clone().add(z.clone().multiplyScalar((st.z + pl.oz) * S)).add(x.clone().multiplyScalar(pl.ox * S)).add(y.clone().multiplyScalar(pl.oy * S)));
            b.userData.ghost = true;
            b.raycast = () => undefined;
            b.renderOrder = 6;
            c.model.add(b);
          }
        }
      }
    }
    // Lưới trục + bong bóng tên trục + cao độ tầng
    const g = geometry(project);
    const ext = 3;
    const lineMat = new THREE.LineDashedMaterial({ color: '#dc2626', dashSize: 0.6, gapSize: 0.25 });
    const addLine = (p1: Vec3, p2: Vec3, mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial = lineMat) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...p1), new THREE.Vector3(...p2)]);
      const l = new THREE.Line(geo, mat);
      l.computeLineDistances();
      c.grid.add(l);
      return l;
    };
    const tag = (o: THREE.Object3D, gk: 'gx' | 'gy' | 'lv', gid: string) => ((o.userData.gk = gk), (o.userData.gid = gid), o);
    let X0 = g.x0 * S, XN = g.xN * S, Y0 = g.y0 * S, YN = g.yN * S;
    // mới có trục một phương (hoặc 1 trục): cho phương còn lại một bề rộng tạm để đường trục nhìn rõ
    if (XN - X0 < 1) { X0 -= 3; XN += 3; }
    if (YN - Y0 < 1) { Y0 -= 3; YN += 3; }
    for (const gx of project.gridsX) {
      const x = g.xs.get(gx.id)! * S;
      tag(addLine([x, Y0 - ext, 0], [x, YN + ext, 0]), 'gx', gx.id);
      const sp = textSprite(gx.name);
      tag(sp, 'gx', gx.id);
      sp.position.set(x, Y0 - ext - 0.7, 0);
      c.grid.add(sp);
    }
    for (const gy of project.gridsY) {
      const y = g.ys.get(gy.id)! * S;
      tag(addLine([X0 - ext, y, 0], [XN + ext, y, 0]), 'gy', gy.id);
      const sp = textSprite(gy.name);
      tag(sp, 'gy', gy.id);
      sp.position.set(X0 - ext - 0.7, y, 0);
      c.grid.add(sp);
    }
    const lvDash = new THREE.LineDashedMaterial({ color: '#dc2626', dashSize: 0.5, gapSize: 0.2 });
    for (const l of project.levels) {
      const z = l.elevation * S;
      // tên + cao độ tầng ở góc nhà
      const lb = labelSprite(`▽ ${l.name}`);
      // như bản vẽ: ▽ tên tầng ở bên trái công trình, gạch nối tới mép nhà
      lb.position.set(X0 - ext - 7, YN, z);
      lb.userData.level = true;
      tag(lb, 'lv', l.id);
      c.grid.add(lb);
      tag(addLine([X0 - ext - 7, YN, z], [X0, YN, z], lvDash), 'lv', l.id);
      if (z === 0) continue;
      tag(addLine([X0, Y0, z], [XN, Y0, z], lvDash), 'lv', l.id);
      tag(addLine([XN, Y0, z], [XN, YN, z], lvDash), 'lv', l.id);
      tag(addLine([XN, YN, z], [X0, YN, z], lvDash), 'lv', l.id);
      tag(addLine([X0, YN, z], [X0, Y0, z], lvDash), 'lv', l.id);
    }
    // mặt nền
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(XN - X0 + 2 * ext + 4, YN - Y0 + 2 * ext + 4),
      new THREE.MeshBasicMaterial({ color: '#dbe3ee', transparent: true, opacity: 0.6, depthWrite: false }),
    );
    ground.position.set((X0 + XN) / 2, (Y0 + YN) / 2, -0.01);
    c.grid.add(ground);
    c.grid.visible = showGrid;

    // Liên kết 2 cây (切断 / 結合): SPL tại điểm nối hoặc 合掌プレート tại mối hàn
    {
      const gpMat = new THREE.MeshStandardMaterial({ color: '#0891b2', metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide });
      for (const lk of project.links ?? []) {
        const lp = linkPoint(members, lk.a, lk.b);
        if (!lp) continue;
        // đoạn của cây a gần điểm nối nhất làm hệ trục
        const pcs = members.filter((m) => m.source === lk.a);
        const m = pcs.sort((u, v) => Math.min(dist3(u.a, lp.at), dist3(u.b, lp.at)) - Math.min(dist3(v.a, lp.at), dist3(v.b, lp.at)))[0];
        if (!m) continue;
        const { x, y, z } = memberBasis(m);
        const C = new THREE.Vector3(...lp.at).multiplyScalar(S);
        const vis = !hidden[m.kind] && (visible ? visible(m) : true);
        const box = (w: number, h: number, l: number, ctr: THREE.Vector3, matl: THREE.Material, geo?: THREE.BufferGeometry) => {
          const b = new THREE.Mesh(geo ?? new THREE.BoxGeometry(w * S, h * S, l * S), matl);
          b.matrixAutoUpdate = false;
          b.matrix.makeBasis(x, y, z).setPosition(ctr);
          b.userData.id = m.id;
          b.visible = vis;
          c.model.add(b);
        };
        if (lk.type === 'spl') {
          const j0 = project.joints.find((q) => q.id === lk.jointId);
          if (!j0) continue;
          const j = j0.type === 'SPL' || j0.type === 'EP' ? j0 : { ...j0, type: 'SPL' as const };
          for (const pl of jointPlates(m.section, j, 0)) box(pl.w, pl.h, pl.l, C.clone().add(z.clone().multiplyScalar(pl.oz * S)).add(x.clone().multiplyScalar(pl.ox * S)).add(y.clone().multiplyScalar(pl.oy * S)), jointMat, plateGeo(pl));
          if (vis) addBolts(jointBolts(m.section, j, 0), C, x, y, z, 0, j.bolt.dia, j.bolt.grade);
        } else if (lk.plate) {
          const g = lk.plate;
          for (const sx of g.sides === 1 ? [1] : [1, -1])
            box(g.t, g.H, g.L, C.clone().add(z.clone().multiplyScalar(g.off * S)).add(x.clone().multiplyScalar(sx * (m.section.tw / 2 + g.t / 2) * S)).add(y.clone().multiplyScalar(g.offV * S)), gpMat);
        }
      }
    }
    const boltMat = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.5, roughness: 0.45 });
    for (const [list, seg] of [[round, 16], [hex, 6]] as const) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, seg), boltMat, list.length);
      list.forEach((it, i) => {
        im.setMatrixAt(i, it.m);
        im.setColorAt(i, new THREE.Color(it.c));
      });
      im.raycast = () => undefined; // không chọn bulông khi bấm
      im.userData.bolt = true;
      c.model.add(im);
    }

    // khung nhìn vừa công trình: lần đầu, và khi công trình trắng vừa có lưới trục (kích thước đổi lớn)
    // chưa có cấu kiện: mỗi lần lưới trục / tầng đổi kích thước thì vừa lại khung nhìn
    const fitE = members.length ? '' : `${Math.round(XN - X0)}|${Math.round(YN - Y0)}|${project.gridsX.length}|${project.gridsY.length}|${Math.max(0, ...project.levels.map((l) => l.elevation))}`;
    if (!c.fitted || (fitE && c.fitExt !== fitE)) {
      fit('iso');
      c.fitted = true;
    }
    c.fitExt = fitE;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, project, selected, highlightMark, colorBy, pick?.startMember, pick?.selSrc?.join(','), ghosts]);

  // Điểm liên kết (point 継手)
  useEffect(() => {
    const c = ctx.current!;
    c.jpts.children.forEach((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose?.();
    });
    c.jpts.clear();
    if (!points?.length) return;
    const geo = new THREE.SphereGeometry(1, 14, 10);
    for (const pt of points) {
      const on = pt.key === activePoint;
      const mat = new THREE.MeshBasicMaterial({ color: on ? '#dc2626' : pt.color, transparent: true, opacity: 0.9, depthTest: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(pt.p[0] * S, pt.p[1] * S, pt.p[2] * S);
      m.scale.setScalar(on ? 0.32 : 0.2);
      m.renderOrder = 998;
      m.userData.jp = pt.key;
      c.jpts.add(m);
    }
  }, [points, activePoint]);

  // Điểm giao trục để bấm nhập (chế độ nhập trực tiếp)
  const pickKey = pick ? `${pick.z}|${pick.start?.x ?? ''}|${pick.start?.y ?? ''}|${pick.color ?? ''}` : '';
  useEffect(() => {
    const c = ctx.current!;
    c.nodes.children.forEach((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material)?.dispose();
    });
    c.nodes.clear();
    if (!pick || pick.mode === 'member') return;
    const g = geometry(project);
    const span = Math.max(g.xN - g.x0, g.yN - g.y0, 1) * S;
    const r = Math.min(0.6, Math.max(0.2, span / 70));
    const geo = new THREE.SphereGeometry(1, 16, 12);
    for (const gx of project.gridsX)
      for (const gy of project.gridsY) {
        const isStart = pick.start?.x === gx.id && pick.start?.y === gy.id;
        const mat = new THREE.MeshBasicMaterial({ color: isStart ? '#dc2626' : pick.color ?? '#16a34a', transparent: true, opacity: 0.85, depthTest: false });
        const m = new THREE.Mesh(geo, mat);
        m.renderOrder = 998;
        m.position.set(g.xs.get(gx.id)! * S, g.ys.get(gy.id)! * S, pick.z * S);
        m.userData = { node: { x: gx.id, y: gy.id }, r: isStart ? r * 1.5 : r };
        m.scale.setScalar(m.userData.r);
        c.nodes.add(m);
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickKey, project.gridsX, project.gridsY]);

  useEffect(() => {
    const c = ctx.current!;
    const byId = new Map(members.map((m) => [m.id, m]));
    c.model.children.forEach((o) => {
      if (o.userData.bolt) return void (o.visible = !(hidden.beam && hidden.column));
      if (o.userData.ghost) return void (o.visible = true);
      const m = byId.get(o.userData.id);
      o.visible = !!m && !hidden[m.kind] && (visible ? visible(m) : true);
    });
    c.grid.visible = showGrid;
  }, [hidden, showGrid, members, visible]);

  // 補助線 + khung 作業平面
  useEffect(() => {
    const c = ctx.current!;
    let grp = c.scene.getObjectByName('auxg') as THREE.Group | undefined;
    if (!grp) {
      grp = new THREE.Group();
      grp.name = 'auxg';
      c.scene.add(grp);
    }
    grp.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mt = m.material as THREE.Material | undefined;
      if (mt && (mt as THREE.SpriteMaterial).map) (mt as THREE.SpriteMaterial).map!.dispose();
    });
    grp.clear();
    const V = (a: Vec3) => new THREE.Vector3(a[0] * S, a[1] * S, a[2] * S);
    const auxG = new THREE.Group(), plG = new THREE.Group();
    grp.add(auxG, plG);
    const mk = (segs: [Vec3, Vec3][], mat: THREE.LineBasicMaterial | THREE.LineDashedMaterial, to: THREE.Group = plG) => {
      if (!segs.length) return;
      const geo = new THREE.BufferGeometry().setFromPoints(segs.flatMap(([a, b]) => [V(a), V(b)]));
      const l = new THREE.LineSegments(geo, mat);
      l.computeLineDistances();
      l.raycast = () => undefined;
      to.add(l);
    };
    mk(auxSegs ?? [], new THREE.LineBasicMaterial({ color: '#d97706' }), auxG);
    auxG.name = 'auxL';
    if (auxG.children[0]) auxG.children[0].userData.keys = auxKeys ?? [];
    for (const pv of planes ?? []) {
      const col = pv.draft ? '#16a34a' : '#0ea5e9';
      const c = pv.corners;
      mk(c.map((a, i) => [a, c[(i + 1) % 4]] as [Vec3, Vec3]), new THREE.LineDashedMaterial({ color: col, dashSize: 0.3, gapSize: 0.2 }));
      // mặt phẳng trong mờ
      const fg = new THREE.BufferGeometry().setFromPoints([V(c[0]), V(c[1]), V(c[2]), V(c[0]), V(c[2]), V(c[3])]);
      const fill = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: pv.draft ? 0.12 : 0.07, side: THREE.DoubleSide, depthWrite: false }));
      fill.raycast = () => undefined;
      plG.add(fill);
      // giao tuyến với trục (通り芯) / tầng
      mk(pv.cuts, new THREE.LineDashedMaterial({ color: pv.draft ? '#15803d' : '#0284c7', dashSize: 0.5, gapSize: 0.15, linewidth: 2 }));
      for (const lb of pv.labels) {
        const sp = cutLabel(lb.t, pv.draft ? '#15803d' : '#0369a1');
        sp.position.copy(V(lb.p));
        plG.add(sp);
      }
    }
    auxG.visible = showAux;
    plG.visible = showPlanes;
    // 勾配: mặt dốc trong mờ (xanh lá; đang sửa = cam, chưa xác nhận = nét đứt) + tên; 勾配 đường = dải đậm
    const slG = new THREE.Group();
    grp.add(slG);
    for (const sv of slopeVis ?? []) {
      const col = sv.active ? '#f97316' : '#16a34a';
      const c = sv.pts;
      if (c.length < 2) continue;
      if (sv.line) {
        const a = V(c[0]), b = V(c[1]);
        const len = a.distanceTo(b);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, len, 8), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false }));
        cyl.position.copy(a.clone().add(b).multiplyScalar(0.5));
        cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        cyl.raycast = () => undefined;
        slG.add(cyl);
      } else {
        const tri: THREE.Vector3[] = [];
        for (let i = 1; i + 1 < c.length; i++) tri.push(V(c[0]), V(c[i]), V(c[i + 1]));
        const fill = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints(tri), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: sv.active ? 0.28 : 0.18, side: THREE.DoubleSide, depthWrite: false }));
        fill.raycast = () => undefined;
        slG.add(fill);
        mk(c.map((a, i) => [a, c[(i + 1) % c.length]] as [Vec3, Vec3]), sv.ok === false ? new THREE.LineDashedMaterial({ color: col, dashSize: 0.3, gapSize: 0.2 }) : new THREE.LineBasicMaterial({ color: col }), slG);
      }
      const ctr = c.reduce((s, q) => [s[0] + q[0] / c.length, s[1] + q[1] / c.length, s[2] + q[2] / c.length] as Vec3, [0, 0, 0] as Vec3);
      const sp = cutLabel(sv.label + (sv.ok === false ? ' (chưa xác nhận)' : ''), sv.active ? '#c2410c' : '#15803d');
      sp.position.copy(V(ctr));
      slG.add(sp);
    }
  }, [auxSegs, planes, showAux, showPlanes, auxKeys, slopeVis]);

  // 寸法: chuỗi kích thước trục / tầng + khoảng cách cấu kiện đang chọn
  useEffect(() => {
    const c = ctx.current!;
    let g = c.scene.getObjectByName('dimg') as THREE.Group | undefined;
    if (!g) {
      g = new THREE.Group();
      g.name = 'dimg';
      c.scene.add(g);
    }
    g.children.forEach((o) => {
      (o as THREE.Mesh).geometry?.dispose();
      const mt = (o as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture };
      mt?.map?.dispose();
      mt?.dispose?.();
    });
    g.clear();
    if (!showDims) return;
    const draw = (ds: DimSet, color: string, h: number) => {
      if (!ds.lines.length) return;
      const pts: THREE.Vector3[] = [];
      for (const [a, b] of ds.lines) pts.push(new THREE.Vector3(a[0] * S, a[1] * S, a[2] * S), new THREE.Vector3(b[0] * S, b[1] * S, b[2] * S));
      const ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      ls.renderOrder = 13;
      ls.raycast = () => undefined;
      g!.add(ls);
      for (const lb of ds.labels) {
        const sp = dimLabel(lb.t, color, h);
        sp.userData.px = h;
        sp.userData.asp = sp.scale.x / sp.scale.y;
        sp.position.set(lb.p[0] * S, lb.p[1] * S, lb.p[2] * S);
        sp.raycast = () => undefined;
        g!.add(sp);
      }
    };
    if (showGrid) draw(gridDims(project), '#475569', 15);
    const m = members.find((x) => x.id === selected);
    if (m) draw(memberDims(project, m, members), '#0f766e', 17);
  }, [members, project, selected, showDims, showGrid]);

  // 📏 thước đo: đoạn vuông góc giữa 2 bề mặt 部材
  const meas = useMemo(() => {
    if (measIds.length < 2) return null;
    const m1 = members.find((m) => m.id === measIds[0]), m2 = members.find((m) => m.id === measIds[1]);
    return m1 && m2 ? { m1, m2, ...surfaceGap(m1, m2) } : null;
  }, [measIds, members]);
  useEffect(() => {
    const c = ctx.current!;
    let g = c.scene.getObjectByName('measg') as THREE.Group | undefined;
    if (!g) {
      g = new THREE.Group();
      g.name = 'measg';
      c.scene.add(g);
    }
    g.children.forEach((o) => {
      (o as THREE.Mesh).geometry?.dispose();
      const mt = (o as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture };
      mt?.map?.dispose();
      mt?.dispose?.();
    });
    g.clear();
    if (!measOn) return;
    const col = '#db2777';
    const V3 = (q: Vec3) => new THREE.Vector3(q[0] * S, q[1] * S, q[2] * S);
    // tô sáng 部材 đã chọn
    for (const id of measIds) {
      const m = members.find((x) => x.id === id);
      if (!m) continue;
      const ls = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V3(m.a), V3(m.b)]), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true, opacity: 0.6 }));
      ls.renderOrder = 14;
      ls.raycast = () => undefined;
      g.add(ls);
    }
    if (!meas) return;
    const A = V3(meas.a), B = V3(meas.b);
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([A, B]), new THREE.LineBasicMaterial({ color: col, depthTest: false, transparent: true }));
    ln.renderOrder = 15;
    ln.raycast = () => undefined;
    g.add(ln);
    for (const P of [A, B]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: col, depthTest: false, transparent: true }));
      dot.position.copy(P);
      dot.renderOrder = 15;
      dot.raycast = () => undefined;
      g.add(dot);
    }
    const sp = dimLabel(meas.d < -0.5 ? `chồng ${fmt(-meas.d)}` : `d = ${fmt(Math.max(0, meas.d))}`, col, 18);
    sp.userData.px = 18;
    sp.userData.asp = sp.scale.x / sp.scale.y;
    sp.position.copy(A.clone().add(B).multiplyScalar(0.5));
    sp.raycast = () => undefined;
    g.add(sp);
  }, [meas, measOn, measIds, members]);

  // điểm va chạm: cầu đỏ
  useEffect(() => {
    const c = ctx.current!;
    let g = c.scene.getObjectByName('clashg') as THREE.Group | undefined;
    if (!g) {
      g = new THREE.Group();
      g.name = 'clashg';
      c.scene.add(g);
    }
    g.children.forEach((o) => (o as THREE.Mesh).geometry?.dispose());
    g.clear();
    const mat = new THREE.MeshBasicMaterial({ color: '#dc2626', transparent: true, opacity: 0.55, depthTest: false });
    const pm = new THREE.MeshBasicMaterial({ color: '#f97316', transparent: true, opacity: 0.9, depthTest: false });
    for (const [list, mt, r] of [[marks ?? [], mat, 0.35], [pickMarks ?? [], pm, 0.22]] as [Vec3[], THREE.Material, number][])
      for (const p of list) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mt);
        s.position.set(p[0] * S, p[1] * S, p[2] * S);
        s.renderOrder = 20;
        s.raycast = () => undefined;
        g.add(s);
      }
  }, [marks, JSON.stringify(pickMarks ?? [])]);

  function fit(view: 'iso' | 'top' | 'front' | 'side') {
    const c = ctx.current;
    if (!c) return;
    const box = new THREE.Box3().setFromObject(c.model);
    // chưa có cấu kiện: vừa lưới trục / tầng
    if (box.isEmpty()) box.setFromObject(c.grid);
    if (box.isEmpty() || box.getSize(new THREE.Vector3()).length() < 1) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(10, 10, 5));
    // gồm cả nhãn tầng ▽ ở bên trái
    if (c.grid.visible) c.grid.children.forEach((o) => (o as THREE.Sprite).isSprite && o.userData.level && box.expandByPoint(o.position));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const d = size * 1.35;
    const dir = {
      iso: new THREE.Vector3(-0.8, -1.2, 0.8),
      top: new THREE.Vector3(0, -0.001, 1),
      front: new THREE.Vector3(0, -1, 0),
      side: new THREE.Vector3(-1, 0, 0),
    }[view].normalize();
    c.camera.position.copy(center).add(dir.multiplyScalar(d));
    const r = c.renderer.domElement, asp = r.clientWidth / Math.max(r.clientHeight, 1);
    c.camera.zoom = FH / Math.max((size * 0.55) / Math.min(asp, 1.6), 0.5);
    c.camera.updateProjectionMatrix();
    c.controls.target.copy(center);
    c.controls.update();
  }

  const sel = members.find((m) => m.id === selected);

  return (
    <div className="viewer">
      <div ref={hostRef} className="viewer-canvas" />
      <div className="viewer-toolbar">
        <button onClick={() => fit('iso')}>3D</button>
        <button onClick={() => fit('top')}>Bằng</button>
        <button onClick={() => fit('front')}>Đứng</button>
        <button onClick={() => fit('side')}>Cạnh</button>
        <button
          title="Tốc độ xoay (bấm để đổi)"
          onClick={() => {
            const L = [0.25, 0.5, 1, 2];
            const v = L[(L.indexOf(rotSpd) + 1) % L.length] ?? 1;
            setRotSpd(v);
            try { localStorage.setItem('s3t.rot', String(v)); } catch { /* bỏ qua */ }
          }}
        >
          ⟳ ×{rotSpd}
        </button>
        <button className={measOn ? 'on' : ''} title="Thước đo: bấm 部材 thứ nhất rồi 部材 thứ hai → khoảng cách vuông góc giữa 2 bề mặt" onClick={() => { setMeasOn(!measOn); setMeasIds([]); }}>
          📏 Đo
        </button>
        {pick?.onBox && (
          <button className={scanOn ? 'on' : ''} title="Quét chọn: kéo 1 ngón / chuột vẽ khung chọn nhiều 部材 cùng lúc (tắt để kéo = xoay)" onClick={() => setScanOn(!scanOn)}>
            ⬚ Quét{scanOn ? ' ✓' : ''}
          </button>
        )}
      </div>
      {measOn && (
        <div className="meas-box">
          <b>📏 Thước đo</b>{' '}
          {meas ? (
            <>
              {meas.m1.mark || meas.m1.name} ↔ {meas.m2.mark || meas.m2.name}: <b>{meas.d < -0.5 ? `chồng / va chạm ${fmt(-meas.d)} mm` : `${fmt(Math.max(0, meas.d))} mm`}</b>
              <span className="muted"> (tâm–tâm {fmt(meas.axis)})</span>
            </>
          ) : measIds.length === 1 ? (
            <span className="muted">Đã chọn {members.find((m) => m.id === measIds[0])?.mark ?? ''}. Bấm 部材 thứ hai.</span>
          ) : (
            <span className="muted">Bấm 部材 thứ nhất.</span>
          )}
        </div>
      )}
      <div className="viewer-legend" style={hideLegend ? { display: 'none' } : undefined}>
        {(Object.keys(KIND_LABEL) as MemberKind[]).map((k) => (
          <label key={k}>
            <input type="checkbox" checked={!hidden[k]} onChange={(e) => setHidden({ ...hidden, [k]: !e.target.checked })} />
            <span className="swatch" style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]} ({members.filter((m) => m.kind === k).length})
          </label>
        ))}
        <label>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> 通り芯
        </label>
        <label title="Chuỗi kích thước trục / tầng và khoảng cách của cấu kiện đang chọn (mm thật)">
          <input type="checkbox" checked={showDims} onChange={(e) => setShowDims(e.target.checked)} />
          <span className="swatch" style={{ background: '#0f766e' }} />
          寸法
        </label>
        {auxSegs?.length ? (
          <label>
            <input type="checkbox" checked={showAux} onChange={(e) => setShowAux(e.target.checked)} />
            <span className="swatch" style={{ background: '#d97706' }} />
            補助線
          </label>
        ) : null}
        {planes?.length ? (
          <label title="Ẩn / hiện khung, nền mờ và giao tuyến của các 作業平面">
            <input type="checkbox" checked={showPlanes} onChange={(e) => setShowPlanes(e.target.checked)} />
            <span className="swatch" style={{ background: '#0ea5e9' }} />
            作業平面
          </label>
        ) : null}
      </div>
      {colorBy !== 'kind' && (
        <div className="viewer-legend cat">
          {[...categoryColors(project, colorBy).entries()].map(([n, c]) => (
            <div key={n} className="row-gap">
              <span className="swatch" style={{ background: c }} /> {n} ({members.filter((m) => m[colorBy] === n).length})
            </div>
          ))}
          <div className="row-gap muted">
            <span className="swatch" style={{ background: '#e2e8f0' }} /> Chưa gán ({members.filter((m) => !m[colorBy]).length})
          </div>
        </div>
      )}
      {sel && (
        <div className="viewer-info">
          <b>
            {KIND_LABEL[sel.kind]} – {sel.mark}
          </b>
          <div>Tiết diện: {sel.section.code}</div>
          <div>Vật liệu: {sel.section.material}</div>
          {sel.zone && <div>工区: {sel.zone}</div>}
          {(sel.group || sel.cls) && (
            <div>
              グループ: {sel.group ?? '–'} · 分類: {sel.cls ?? '–'}
            </div>
          )}
          {sel.paint && <div>塗装: {sel.paint}</div>}
          {sel.joint && <div>継手: {sel.joint}</div>}
          {sel.part === 'shikuchi' && <div style={{ color: '#7c3aed' }}>仕口コア (giữa 通しダイアフラム)</div>}
          {sel.dia?.length ? (
            <div>
              {sel.dia[0].kind === 'stiff' ? '水平スチフナー' : sel.dia[0].kind === 'through' ? '通しダイアフラム' : '内ダイアフラム'}:{' '}
              {[...new Map(sel.dia.map((d) => [d.z, d])).values()].map((d) => `PL-${d.t}×${d.round ? 'φ' + Math.round(d.w) : Math.round(d.w) + '×' + Math.round(d.d)} @${Math.round(d.z)}`).join(' · ')}
            </div>
          ) : null}
          {sel.warn?.map((w) => (
            <div key={w} style={{ color: '#dc2626' }}>⚠ {w}</div>
          ))}
          <div>Dài: {sel.length.toLocaleString('vi-VN')} mm</div>
          <div>
            KL: {kgPerM(sel.section).toFixed(2)} kg/m · {sel.weight.toFixed(1)} kg
          </div>
          <div className="muted">
            Từ ({sel.a.map((v) => Math.round(v)).join(', ')}) đến ({sel.b.map((v) => Math.round(v)).join(', ')})
          </div>
        </div>
      )}
      {pick?.hint && <div className="viewer-pick">{pick.hint}</div>}
      <div className="viewer-hint">Chuột trái: xoay quanh điểm dưới con trỏ · Chuột giữa / phải: dời · Lăn: phóng to tại con trỏ · Click: chọn cấu kiện</div>
    </div>
  );
}
