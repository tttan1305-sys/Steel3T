// Cửa sổ tự do xem hình minh họa 継手: kéo thanh tiêu đề để di chuyển, lăn chuột / chụm 2 ngón để thu phóng, kéo hình để dời
import { useEffect, useRef, useState, type ReactNode } from 'react';
import FloatWin from './FloatWin';
import { Joint, JointType, JOINT_TYPE_LABEL, Project, Section, jointUsers, newJoint } from './model';
import { JointLiveShape } from './JointShape';
import { findJis } from './jis';
import { JointDetail } from './JointDetail';
import BraceShape from './BraceShape';
import { EpShape } from './EpShape';

/** Khung thu phóng / dời cho nội dung bất kỳ (SVG) */
export function ZoomPane({ children, resetKey }: { children: ReactNode; resetKey: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [t, setT] = useState({ s: 1, x: 0, y: 0 });
  const cur = useRef(t);
  cur.current = t;
  useEffect(() => setT({ s: 1, x: 0, y: 0 }), [resetKey]);
  // phóng quanh điểm (cx, cy) trong khung
  const zoomAt = (f: number, cx: number, cy: number) => {
    const o = cur.current;
    const s = Math.min(20, Math.max(0.2, o.s * f));
    const k = s / o.s;
    setT({ s, x: cx - (cx - o.x) * k, y: cy - (cy - o.y) * k });
  };
  useEffect(() => {
    const el = box.current!;
    const rel = (e: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.pow(1.0015, -e.deltaY), ...rel(e));
    };
    const pts = new Map<number, { x: number; y: number }>();
    let last: { x: number; y: number; d: number } | null = null;
    const state = () => {
      const a = [...pts.values()];
      if (!a.length) return null;
      const x = a.reduce((s, p) => s + p.x, 0) / a.length;
      const y = a.reduce((s, p) => s + p.y, 0) / a.length;
      const d = a.length > 1 ? Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) : 0;
      return { x, y, d };
    };
    const onDown = (e: PointerEvent) => {
      if (e.button > 1) return;
      const [x, y] = rel(e);
      pts.set(e.pointerId, { x, y });
      el.setPointerCapture(e.pointerId);
      last = state();
    };
    const onMove = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const [x, y] = rel(e);
      pts.set(e.pointerId, { x, y });
      const n = state()!;
      if (last) {
        const o = cur.current;
        let nt = { ...o, x: o.x + n.x - last.x, y: o.y + n.y - last.y };
        if (n.d && last.d) {
          const s = Math.min(20, Math.max(0.2, o.s * (n.d / last.d)));
          const k = s / o.s;
          nt = { s, x: n.x - (n.x - nt.x) * k, y: n.y - (n.y - nt.y) * k };
        }
        cur.current = nt;
        setT(nt);
      }
      last = n;
    };
    const onUp = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      last = state();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mid = () => {
    const r = box.current!.getBoundingClientRect();
    return [r.width / 2, r.height / 2] as const;
  };
  return (
    <div className="zp">
      <div className="zp-tools">
        <button title="Phóng to" onClick={() => zoomAt(1.25, ...mid())}>＋</button>
        <button title="Thu nhỏ" onClick={() => zoomAt(0.8, ...mid())}>－</button>
        <button title="Vừa khung" onClick={() => setT({ s: 1, x: 0, y: 0 })}>⤢</button>
        <span className="small">{Math.round(t.s * 100)}%</span>
      </div>
      <div ref={box} className="zp-box" onDoubleClick={() => setT({ s: 1, x: 0, y: 0 })}>
        <div className="zp-in" style={{ transform: `translate(${t.x}px, ${t.y}px) scale(${t.s})` }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export interface PreviewReq {
  /** tên 継手 (tìm trong tab 継手); nếu chưa có thì vẽ 継手 mẫu theo kiểu */
  name: string;
  type?: JointType;
  target?: Joint['target'];
  /** tiết diện để vẽ (mã, vd H-400x200x8x13) */
  secCode?: string;
  /** chú thích (vd 部材名 · vị trí) */
  where?: string;
}

/** Hình minh họa đúng thực tế của 1 継手 (theo tiết diện thật; không dùng hình mẫu thư viện) */
export function JointPicture({ p, j, secCode }: { p: Project; j: Joint; secCode?: string }) {
  const users = jointUsers(p, j.id);
  const jis = secCode ? findJis(secCode) : undefined;
  const sec =
    (secCode && p.sections.find((s) => s.code === secCode)) ||
    (jis ? { id: 'jis', code: secCode!, ...jis.item.spec, material: '', kgm: jis.item.kg } : undefined) ||
    p.sections.find((s) => s.id === users[0]?.m.sectionId) ||
    p.sections.find((s) => s.type === 'I');
  if (j.target === 'brace') return <BraceShape j={j} shape={j.shape ?? 'fig1'} p={p} />;
  if (j.type === 'EP') return <EpShape j={j} sec={(sec as Section) ?? { b: 400, h: 400, tw: 12, tf: 12, type: 'Box' }} />;
  if (!sec) return <p className="muted">Chưa có tiết diện H để vẽ.</p>;
  return j.type === 'GPL' ? <JointLiveShape j={j} sec={sec as Section} /> : <JointDetail j={j} sec={sec as Section} />;
}

export default function JointPreviewWin({ p, req, onClose }: { p: Project; req: PreviewReq; onClose: () => void }) {
  const ex = p.joints.find((x) => x.name === req.name.trim() && (!req.target || x.target === req.target));
  const j: Joint = ex ?? { ...newJoint(1, req.target ?? 'beam', p.params), name: req.name.trim() || '—', type: req.type ?? (req.target === 'column' ? 'SPL' : 'GPL') };
  const W = Math.min(620, window.innerWidth - 20);
  return (
    <FloatWin
      id="joint-pv"
      flush
      def={{ x: Math.max(10, window.innerWidth - W - 30), y: 90, w: W, h: Math.min(560, window.innerHeight - 110) }}
      onClose={onClose}
      title={
        <>
          👁 継手 <b>{j.name}</b> · {JOINT_TYPE_LABEL[j.type] ?? j.type}
          {req.where && <span className="small" style={{ opacity: 0.7 }}> · {req.where}</span>}
          {!ex && <span className="small" style={{ opacity: 0.7 }}> (chưa có ở tab 継手 – hình theo kiểu)</span>}
        </>
      }
    >
      <ZoomPane resetKey={`${j.id}|${req.secCode ?? ''}`}>
        <div className="jpv">
          <JointPicture p={p} j={j} secCode={req.secCode} />
        </div>
      </ZoomPane>
    </FloatWin>
  );
}
