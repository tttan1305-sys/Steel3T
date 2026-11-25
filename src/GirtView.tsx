// Mặt đứng của 1 胴縁配置面: 階高, 通り, cột / dầm trong mặt, 胴縁, 開口 – bấm đường để chọn tham chiếu
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Member, Project } from './model';
import { GirtItem, GirtOpen, girtOf, girtSegs, hRefs, isVertical, openRect, planeGeo, vRefs } from './girt';
import { memberSection } from './moya';
import { buzaiKey } from './pieceSet';
import type { PcAux } from './pieceSet';

interface Props {
  p: Project;
  members: Member[];
  planeId: string;
  preview: Omit<GirtItem, 'id'>[];
  previewOpen: Omit<GirtOpen, 'id'> | null;
  /** các khoá tham chiếu đang chọn (tô tím) */
  active: string[];
  onPick: (kind: 'v' | 'h', key: string) => void;
  sel: string | null;
  onSel: (id: string | null) => void;
  /** nhập ピース tay: bấm 親部材 → 胴縁 → (補助線) */
  pc?: {
    buzai: string; targets: string[]; auxStep: boolean; aux?: PcAux;
    onBuzai: (m: Member, label: string) => void; onTarget: (id: string) => void; onAux: (a: PcAux) => void;
    prev: Member[]; selSrc?: string | null;
    /** lệnh 修正: bấm / quét chọn ピース */
    edit?: boolean; picked?: string[]; onUnits?: (keys: string[], add: boolean) => void;
  };
}

export default function GirtView({ p, members, planeId, preview, previewOpen, active, onPick, sel, onSel, pc }: Props) {
  const gd = girtOf(p);
  const pl = gd.planes.find((x) => x.id === planeId);
  const g = pl ? planeGeo(p, pl) : null;
  const V = useMemo(() => (g ? vRefs(p, g) : []), [p, g?.pl.id, g?.s0]); // eslint-disable-line react-hooks/exhaustive-deps
  const H = useMemo(() => (g ? hRefs(p, g, members) : []), [p, members, g?.pl.id, g?.s0]); // eslint-disable-line react-hooks/exhaustive-deps
  const segs = useMemo(() => girtSegs(p).filter((s) => s.it.plane === planeId), [p, planeId]);
  const levels = p.levels.map((l) => l.elevation);
  const zMin = Math.min(0, ...levels) - 800, zMax = Math.max(...levels, ...H.filter((h) => h.key.startsWith('bm:')).map((h) => Math.max(h.z(h.s0 ?? 0), h.z(h.s1 ?? 0)))) + 1500;
  const fit = useMemo(() => (g ? { x: g.s0 - 2500, y: -zMax, w: g.s1 - g.s0 + 4000, h: zMax - zMin } : { x: 0, y: 0, w: 1000, h: 1000 }), [g?.s0, g?.s1, zMin, zMax]); // eslint-disable-line react-hooks/exhaustive-deps
  const [vb, setVb] = useState(fit);
  useEffect(() => setVb(fit), [planeId, fit.w, fit.h]); // eslint-disable-line react-hooks/exhaustive-deps
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof vb; moved: boolean } | null>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // điện thoại: 2 ngón = chụm phóng to + dời
  const tps = useRef(new Map<number, [number, number]>());
  const pin = useRef<{ d: number; mx: number; my: number; vb: typeof vb } | null>(null);
  if (!g) return <div className="girt-view empty">Chọn hoặc tạo 胴縁配置面.</div>;
  const sw = Math.max(vb.w, vb.h) / 700;
  const toSvg = (cx: number, cy: number) => {
    const r = svg.current!.getBoundingClientRect();
    const k = Math.max(vb.w / r.width, vb.h / r.height);
    const ox = vb.x + (vb.w - r.width * k) / 2, oy = vb.y + (vb.h - r.height * k) / 2;
    return { x: ox + (cx - r.left) * k, y: oy + (cy - r.top) * k, k };
  };
  const onWheel = (e: React.WheelEvent) => {
    const q = toSvg(e.clientX, e.clientY);
    const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setVb((v) => ({ x: q.x - (q.x - v.x) * f, y: q.y - (q.y - v.y) * f, w: v.w * f, h: v.h * f }));
  };
  const pick = (kind: 'v' | 'h', key: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    if (pc) {
      // 補助線: đường trục đứng / tầng
      if (!pc.auxStep) return;
      if (kind === 'v') { const v = V.find((x) => x.key === key); if (!v) return; const q = g.at(v.s); pc.onAux({ key, label: v.label, a: [q[0], q[1], zMin], b: [q[0], q[1], zMax] }); }
      else { const h = H.find((x) => x.key === key); if (!h) return; const a = g.at(g.s0), b = g.at(g.s1); pc.onAux({ key, label: h.label, a: [a[0], a[1], h.z(g.s0)], b: [b[0], b[1], h.z(g.s1)] }); }
      return;
    }
    onPick(kind, key);
  };
  const pcBz = (m: Member | undefined, label: string) => (e: React.MouseEvent) => { e.stopPropagation(); if (drag.current?.moved || !m || !pc) return; pc.onBuzai(m, label); };
  const pcIs = (m?: Member) => !!m && !!pc && pc.buzai === buzaiKey(m);
  const toSZ = (q: number[]): [number, number] => [g.sOf([q[0], q[1]]), q[2]];
  const hit = sw * 12;
  const isAct = (k: string) => active.includes(k);
  // cột / dầm trong 配置面
  const cols = members.filter((m) => m.kind === 'column' && Math.abs(g.dist([m.a[0], m.a[1]])) < 1500);
  const beams = H.filter((h) => h.key.startsWith('bm:'));
  const secOf = (name: string) => { const m = gd.members.find((x) => x.name === name); return m ? memberSection(m) : undefined; };
  const rectOf = (a: [number, number], b: [number, number], w: number) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = (-(b[1] - a[1]) / L) * (w / 2), nz = ((b[0] - a[0]) / L) * (w / 2);
    return [[a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz], [b[0] - nx, b[1] - nz], [a[0] - nx, a[1] - nz]].map(([s, z]) => `${s},${-z}`).join(' ');
  };
  return (
    <div className="girt-view">
      <div className="girt-view-bar">
        <b>胴縁配置面 {pl!.name}</b>
        <span className="muted small"> · nhìn theo 矢印 · bấm đường để chọn tham chiếu</span>
        <button onClick={() => setVb(fit)}>Vừa khung</button>
      </div>
      <svg
        ref={svg}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (e.pointerType === 'touch') {
            tps.current.set(e.pointerId, [e.clientX, e.clientY]);
            if (tps.current.size === 2) {
              const [a, b] = [...tps.current.values()];
              pin.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2, vb };
              setBox(null);
              if (drag.current) drag.current.moved = true;
              return;
            }
          }
          drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
          if (pc?.edit && e.button === 0) { const q = toSvg(e.clientX, e.clientY); setBox({ x0: q.x, y0: q.y, x1: q.x, y1: q.y }); }
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'touch' && tps.current.has(e.pointerId)) {
            tps.current.set(e.pointerId, [e.clientX, e.clientY]);
            const P = pin.current;
            if (P && tps.current.size >= 2) {
              const [a, b] = [...tps.current.values()];
              const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
              const r = svg.current!.getBoundingClientRect();
              const k0 = Math.max(P.vb.w / r.width, P.vb.h / r.height);
              const ox = P.vb.x + (P.vb.w - r.width * k0) / 2, oy = P.vb.y + (P.vb.h - r.height * k0) / 2;
              const qx = ox + (P.mx - r.left) * k0, qy = oy + (P.my - r.top) * k0;
              const f = P.d / d;
              const k1 = k0 * f;
              setVb({ x: qx - (qx - P.vb.x) * f - (mx - P.mx) * k1, y: qy - (qy - P.vb.y) * f - (my - P.my) * k1, w: P.vb.w * f, h: P.vb.h * f });
              return;
            }
          }
          const d = drag.current;
          if (!d || e.buttons === 0) return;
          if (box) { const q = toSvg(e.clientX, e.clientY); setBox({ ...box, x1: q.x, y1: q.y }); if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 5) d.moved = true; return; }
          const dx = e.clientX - d.x, dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
          if (!d.moved) return;
          const k = toSvg(0, 0).k;
          setVb({ ...d.vb, x: d.vb.x - dx * k, y: d.vb.y - dy * k });
        }}
        onPointerCancel={(e) => { tps.current.delete(e.pointerId); if (tps.current.size < 2) pin.current = null; }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') { tps.current.delete(e.pointerId); if (tps.current.size < 2) { if (pin.current) { pin.current = null; setTimeout(() => (drag.current = null), 0); return; } } }
          if (box && pc?.onUnits && drag.current?.moved) {
            const x0 = Math.min(box.x0, box.x1), x1 = Math.max(box.x0, box.x1), y0 = Math.min(box.y0, box.y1), y1 = Math.max(box.y0, box.y1);
            const keys = new Set<string>();
            for (const m of members) {
              if (m.part !== 'piece' || !m.pcT || Math.abs(g.dist([m.a[0], m.a[1]])) > 1500) continue;
              const A = toSZ(m.a), B = toSZ(m.b);
              const sx = (A[0] + B[0]) / 2, sy = -(A[1] + B[1]) / 2;
              if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) keys.add(`${m.source}|${m.pcT}`);
            }
            pc.onUnits([...keys], e.shiftKey);
          }
          setBox(null);
          setTimeout(() => (drag.current = null), 0);
        }}
        onClick={() => !drag.current?.moved && onSel(null)}
      >
        <text x={(g.s0 + g.s1) / 2} y={-zMax + 600} fontSize={sw * 16} textAnchor="middle" fontWeight={700} fill="#0f172a">胴縁割付図 {pl!.name}</text>
        {/* 階高 */}
        {H.filter((h) => h.key.startsWith('lv:')).map((h) => {
          const z = h.z(0), on = isAct(h.key);
          return (
            <g key={h.key} onClick={pick('h', h.key)} style={{ cursor: 'pointer' }}>
              <line x1={g.s0 - 1500} y1={-z} x2={g.s1 + 1500} y2={-z} stroke={on ? '#7c3aed' : '#94a3b8'} strokeWidth={on ? sw * 3 : sw} strokeDasharray={on ? undefined : `${sw * 8} ${sw * 5}`} />
              <line x1={g.s0 - 1500} y1={-z} x2={g.s1 + 1500} y2={-z} stroke="transparent" strokeWidth={hit} />
              <text x={g.s0 - 2400} y={-z - sw * 3} fontSize={sw * 11} fill={on ? '#7c3aed' : '#334155'}>▽{h.label.replace(' 階高', '')} {Math.round(z)}</text>
            </g>
          );
        })}
        {/* 通り / 配置面 khác */}
        {V.filter((v) => !v.key.startsWith('g:')).map((v) => {
          const on = isAct(v.key), grid = !v.key.startsWith('pl:');
          return (
            <g key={v.key} onClick={pick('v', v.key)} style={{ cursor: 'pointer' }}>
              <line x1={v.s} y1={-zMax + 900} x2={v.s} y2={-zMin + 200} stroke={on ? '#7c3aed' : grid ? '#dc2626' : '#2563eb'} strokeWidth={on ? sw * 3 : sw * 0.8} strokeDasharray={grid ? `${sw * 14} ${sw * 4} ${sw * 3} ${sw * 4}` : `${sw * 4} ${sw * 4}`} />
              <line x1={v.s} y1={-zMax + 900} x2={v.s} y2={-zMin + 200} stroke="transparent" strokeWidth={hit} />
              {grid ? (
                <>
                  <circle cx={v.s} cy={-zMin + 200 + sw * 14} r={sw * 12} fill="#fff" stroke="#0f172a" strokeWidth={sw} />
                  <text x={v.s} y={-zMin + 200 + sw * 18} fontSize={sw * 11} textAnchor="middle">{v.label.replace(' 通り', '')}</text>
                </>
              ) : (
                <text x={v.s + sw * 3} y={-zMax + 900 + sw * 12} fontSize={sw * 10} fill="#2563eb">{v.label}</text>
              )}
            </g>
          );
        })}
        {/* cột trong mặt */}
        {cols.map((c) => {
          const s = g.sOf([c.a[0], c.a[1]]), w = c.section.b;
          const on = pcIs(c);
          return <rect key={c.id} x={s - w / 2} y={-Math.max(c.a[2], c.b[2])} width={w} height={Math.abs(c.b[2] - c.a[2])} fill={on ? '#ddd6fe' : '#dbeafe'} stroke={on ? '#7c3aed' : '#1e3a8a'} strokeWidth={on ? sw * 2.5 : sw * 0.6} pointerEvents={pc && !pc.auxStep ? 'all' : 'none'} style={pc ? { cursor: 'pointer' } : undefined} onClick={pc ? pcBz(c, `柱 ${c.mark ?? ''}`) : undefined}><title>{c.mark}</title></rect>;
        })}
        {/* dầm trong mặt (bấm = 梁天) */}
        {beams.map((h) => {
          const bm = members.find((m) => m.source === h.key.slice(3) && m.kind === 'beam');
          const on = isAct(h.key) || pcIs(bm), sa = h.s0 ?? 0, sb = h.s1 ?? 0;
          return (
            <g key={h.key} onClick={pc && !pc.auxStep ? pcBz(bm, h.label.replace(' 梁天', '')) : pick('h', h.key)} style={{ cursor: 'pointer' }}>
              <polygon points={`${sa},${-h.z(sa)} ${sb},${-h.z(sb)} ${sb},${-h.z(sb) + 300} ${sa},${-h.z(sa) + 300}`} fill="#fde68a" stroke={on ? '#7c3aed' : '#92400e'} strokeWidth={on ? sw * 3 : sw * 0.6} />
              <line x1={sa} y1={-h.z(sa)} x2={sb} y2={-h.z(sb)} stroke="transparent" strokeWidth={hit} />
            </g>
          );
        })}
        {/* 開口 */}
        {gd.openings.filter((o) => o.plane === planeId).map((o) => {
          const r = openRect(gd, o);
          return (
            <g key={o.id} onClick={(e) => { e.stopPropagation(); onSel(o.id); }} style={{ cursor: 'pointer' }}>
              <rect x={o.s} y={-(o.z + r.h)} width={r.w} height={r.h} fill={sel === o.id ? '#fef3c7' : '#f8fafc'} stroke="#64748b" strokeWidth={sw} />
              <line x1={o.s} y1={-o.z} x2={o.s + r.w} y2={-(o.z + r.h)} stroke="#94a3b8" strokeWidth={sw * 0.6} />
              <line x1={o.s} y1={-(o.z + r.h)} x2={o.s + r.w} y2={-o.z} stroke="#94a3b8" strokeWidth={sw * 0.6} />
              <text x={o.s + r.w / 2} y={-(o.z + r.h / 2)} fontSize={sw * 11} textAnchor="middle" fill="#334155">{o.name}</text>
            </g>
          );
        })}
        {/* 胴縁 */}
        {segs.map((sg, i) => {
          const vert = Math.abs(sg.b[0] - sg.a[0]) < 1;
          const key = `g:${sg.it.id}`;
          const gm = members.find((m) => m.source === sg.it.id && m.kind === 'girt' && m.part !== 'piece');
          const on = pc ? pc.targets.includes(sg.it.id) || pcIs(gm) : isAct(key) || sel === sg.it.id;
          const opening = sg.it.id.startsWith('open_');
          const pcClick = (e: React.MouseEvent) => { e.stopPropagation(); if (drag.current?.moved || !pc || pc.auxStep) return; if (!pc.buzai) { if (gm) pc.onBuzai(gm, `${vert ? '縦' : '横'}胴縁 ${sg.mem.name}`); } else pc.onTarget(sg.it.id); };
          return (
            <g key={i} onClick={opening ? undefined : pc ? pcClick : (e) => { pick(vert ? 'v' : 'h', key)(e); onSel(sg.it.id); }} style={{ cursor: 'pointer' }}>
              <polygon points={rectOf(sg.a, sg.b, sg.sec.b)} fill={on ? '#fde68a' : opening ? '#bbf7d0' : '#a7f3d0'} stroke={on ? '#7c3aed' : '#047857'} strokeWidth={on ? sw * 2 : sw * 0.6} />
              <text x={(sg.a[0] + sg.b[0]) / 2} y={-(sg.a[1] + sg.b[1]) / 2 - (vert ? 0 : sg.sec.b / 2 + sw * 2)} fontSize={sw * 9} fill="#065f46" textAnchor="middle" transform={vert ? `rotate(-90 ${(sg.a[0] + sg.b[0]) / 2} ${-(sg.a[1] + sg.b[1]) / 2})` : undefined} pointerEvents="none">{sg.mem.name}</text>
            </g>
          );
        })}
        {/* ピース (đã nhập / xem trước) */}
        {pc && members.filter((m) => m.kind === 'girt' && m.part === 'piece' && Math.abs(g.dist([m.a[0], m.a[1]])) < 1500).map((m, i) => {
          const A = toSZ(m.a), B = toSZ(m.b);
          const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
          const w = Math.max(sw * 6, len < 1 ? 40 : m.section.h * 0.6);
          const key = `${m.source}|${m.pcT}`;
          const col = pc.picked?.includes(key) ? '#facc15' : pc.selSrc === m.source ? '#7c3aed' : '#dc2626';
          const click = pc.edit && pc.onUnits ? (e: React.MouseEvent) => { e.stopPropagation(); if (drag.current?.moved) return; const cur = pc.picked ?? []; pc.onUnits!(cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key], false); } : undefined;
          return len < 1 ? <rect key={`pc${i}`} x={A[0] - w / 2} y={-A[1] - w / 2} width={w} height={w} fill={col} pointerEvents={click ? 'all' : 'none'} onClick={click} style={click ? { cursor: 'pointer' } : undefined} />
            : <line key={`pc${i}`} x1={A[0]} y1={-A[1]} x2={B[0]} y2={-B[1]} stroke={col} strokeWidth={w} pointerEvents={click ? 'stroke' : 'none'} onClick={click} style={click ? { cursor: 'pointer' } : undefined} />;
        })}
        {box && <rect x={Math.min(box.x0, box.x1)} y={Math.min(box.y0, box.y1)} width={Math.abs(box.x1 - box.x0)} height={Math.abs(box.y1 - box.y0)} fill="#3b82f622" stroke="#2563eb" strokeDasharray={`${sw * 4} ${sw * 3}`} strokeWidth={sw} pointerEvents="none" />}
        {pc?.prev.filter((m) => m.part === 'piece').map((m, i) => {
          const A = toSZ(m.a), B = toSZ(m.b);
          const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
          const w = Math.max(sw * 4, len < 1 ? 40 : m.section.h * 0.6);
          return len < 1 ? <rect key={`pp${i}`} x={A[0] - w / 2} y={-A[1] - w / 2} width={w} height={w} fill="#ea580c" pointerEvents="none" />
            : <line key={`pp${i}`} x1={A[0]} y1={-A[1]} x2={B[0]} y2={-B[1]} stroke="#ea580c" strokeWidth={w} strokeOpacity={0.8} pointerEvents="none" />;
        })}
        {pc?.aux && (() => { const A = toSZ(pc.aux.a), B = toSZ(pc.aux.b); return <line x1={A[0]} y1={-A[1]} x2={B[0]} y2={-B[1]} stroke="#0ea5e9" strokeWidth={sw * 2} strokeDasharray={`${sw * 6} ${sw * 3}`} pointerEvents="none" />; })()}
        {/* xem trước */}
        {preview.map((it, i) => {
          const sc = secOf(it.member);
          return <polygon key={i} points={rectOf(it.a, it.b, sc?.b ?? 50)} fill="#fed7aa" fillOpacity={0.6} stroke="#ea580c" strokeDasharray={`${sw * 5} ${sw * 3}`} strokeWidth={sw * 1.2} pointerEvents="none" />;
        })}
        {previewOpen && (() => {
          const r = openRect(gd, { ...previewOpen, id: 'prev' });
          return <rect x={previewOpen.s} y={-(previewOpen.z + r.h)} width={r.w} height={r.h} fill="#fed7aa" fillOpacity={0.4} stroke="#ea580c" strokeDasharray={`${sw * 5} ${sw * 3}`} strokeWidth={sw * 1.2} pointerEvents="none" />;
        })()}
        {/* vạch kích thước 胴縁 ngang (cao độ) */}
        {segs.filter((s) => !isVertical(s.it) && Math.abs(s.b[1] - s.a[1]) < 1 && !s.it.id.startsWith('open_')).map((s, i) => (
          <text key={`d${i}`} x={g.s1 + 1600} y={-s.a[1] + sw * 3} fontSize={sw * 8} fill="#047857" pointerEvents="none">{Math.round(s.a[1])}</text>
        ))}
      </svg>
    </div>
  );
}
