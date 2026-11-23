import { localPt, localRect } from './rot';
// Phóng to theo vị trí con trỏ (lăn chuột) và dời bằng chuột giữa cho bản vẽ SVG
import { RefObject, useEffect, useRef, useState } from 'react';

export interface VB {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * @param svgRef  phần tử SVG
 * @param base    khung nhìn gốc (vừa khít bản vẽ)
 * @param resetKey đổi giá trị này để quay về khung nhìn gốc (vd đổi tầng/trục)
 */
export function usePanZoom(svgRef: RefObject<SVGSVGElement>, base: VB, resetKey: string) {
  const [vb, setVb] = useState<VB | null>(null);
  const cur = useRef<VB>(base);
  cur.current = vb ?? base;

  useEffect(() => setVb(null), [resetKey]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const scaleOf = (v: VB) => {
      const r = localRect(svg);
      return { s: Math.max(v.w / r.width, v.h / r.height), r };
    };
    // toạ độ SVG của con trỏ (tính cả phần lề do preserveAspectRatio=meet)
    const toSvg = (cx: number, cy: number, v: VB) => {
      const { s, r } = scaleOf(v);
      const ox = v.x + v.w / 2 - (r.width * s) / 2;
      const oy = v.y + v.h / 2 - (r.height * s) / 2;
      return { x: ox + (cx - r.left) * s, y: oy + (cy - r.top) * s };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = cur.current;
      const f = Math.pow(1.0015, e.deltaY);
      const p = toSvg(...localPt(e.clientX, e.clientY), v);
      setVb({ x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w: v.w * f, h: v.h * f });
    };
    let drag: { cx: number; cy: number; v: VB } | null = null;
    // điện thoại: 2 ngón = phóng to (chụm / mở) + dời; 1 ngón vẫn để bấm chọn
    const tp = new Map<number, [number, number]>();
    let pin: { d: number; mx: number; my: number; v: VB } | null = null;
    const pinNow = () => { const [a, b] = [...tp.values()]; return { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; };
    const onTouchDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return false;
      tp.set(e.pointerId, localPt(e.clientX, e.clientY));
      if (tp.size === 2) { pin = { ...pinNow(), v: cur.current }; e.preventDefault(); e.stopPropagation(); }
      return true;
    };
    const onTouchMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch' || !tp.has(e.pointerId)) return false;
      tp.set(e.pointerId, localPt(e.clientX, e.clientY));
      if (tp.size >= 2 && pin) {
        e.preventDefault(); e.stopPropagation();
        const n = pinNow(), v = pin.v, f = pin.d / n.d;
        const p0 = toSvg(pin.mx, pin.my, v);
        const nv = { x: p0.x - (p0.x - v.x) * f, y: p0.y - (p0.y - v.y) * f, w: v.w * f, h: v.h * f };
        const { s } = scaleOf(nv);
        setVb({ ...nv, x: nv.x - (n.mx - pin.mx) * s, y: nv.y - (n.my - pin.my) * s });
      }
      return true;
    };
    const onTouchUp = (e: PointerEvent) => { if (e.pointerType !== 'touch') return; tp.delete(e.pointerId); if (tp.size < 2) pin = null; };
    const onDown = (e: PointerEvent) => {
      if (onTouchDown(e)) return;
      if (e.button !== 1) return;
      e.preventDefault();
      const [cx, cy] = localPt(e.clientX, e.clientY);
      drag = { cx, cy, v: cur.current };
      svg.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (onTouchMove(e)) return;
      if (!drag) return;
      const { s } = scaleOf(drag.v);
      const [cx, cy] = localPt(e.clientX, e.clientY);
      setVb({ ...drag.v, x: drag.v.x - (cx - drag.cx) * s, y: drag.v.y - (cy - drag.cy) * s });
    };
    const onUp = (e: PointerEvent) => {
      onTouchUp(e);
      if (drag && e.button === 1) drag = null;
    };
    const noAuto = (e: MouseEvent) => e.button === 1 && e.preventDefault();
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('mousedown', noAuto);
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
      svg.removeEventListener('mousedown', noAuto);
    };
  }, [svgRef]);

  const v = vb ?? base;
  return { viewBox: `${v.x} ${v.y} ${v.w} ${v.h}`, zoomed: !!vb, reset: () => setVb(null) };
}
