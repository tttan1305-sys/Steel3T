// Cửa sổ nổi: kéo thanh tiêu đề để di chuyển, kéo góc dưới phải để đổi kích thước (lưu vị trí / kích thước)
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Box { x: number; y: number; w: number; h: number }
const load = (k: string, d: Box): Box => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? '');
    if (v && typeof v.x === 'number') return v;
  } catch { /* bỏ qua */ }
  return d;
};
const fit = (b: Box): Box => {
  const W = window.innerWidth, H = window.innerHeight;
  const w = Math.min(b.w, W - 10), h = Math.min(b.h, H - 10);
  return { w, h, x: Math.max(0, Math.min(b.x, W - 80)), y: Math.max(0, Math.min(b.y, H - 40)) };
};

export default function FloatWin({ id, title, onClose, def, children, flush, extra }: { id: string; title: React.ReactNode; onClose: () => void; def: Box; children: React.ReactNode; flush?: boolean; extra?: React.ReactNode }) {
  const key = `s3t.win.${id}`;
  const [box, setBox] = useState<Box>(() => fit(load(key, def)));
  const ref = useRef<HTMLDivElement>(null);
  const boxRef = useRef(box);
  boxRef.current = box;
  const save = (b: Box) => {
    try { localStorage.setItem(key, JSON.stringify(b)); } catch { /* bỏ qua */ }
  };
  // theo dõi đổi kích thước bằng góc kéo (CSS resize)
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => {
      const b = { ...boxRef.current, w: el.offsetWidth, h: el.offsetHeight };
      if (Math.abs(b.w - boxRef.current.w) > 1 || Math.abs(b.h - boxRef.current.h) > 1) {
        boxRef.current = b;
        save(b);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    const el = ref.current!;
    const sx = e.clientX, sy = e.clientY, b0 = { ...boxRef.current, w: el.offsetWidth, h: el.offsetHeight };
    const mv = (ev: PointerEvent) => setBox(fit({ ...b0, x: b0.x + ev.clientX - sx, y: b0.y + ev.clientY - sy }));
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      save(boxRef.current);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return createPortal(
    <div ref={ref} className="fwin" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <div className="fwin-head" onPointerDown={onDown}>
        <span>{title}</span>
        <span className="sp" />
        {extra}
        <button title="Đóng cửa sổ" onClick={onClose}>✕</button>
      </div>
      <div className={'fwin-body' + (flush ? ' flush' : '')}>{children}</div>
    </div>,
    document.body,
  );
}
