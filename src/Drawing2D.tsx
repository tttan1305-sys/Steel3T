import { forwardRef, useImperativeHandle, useRef } from 'react';
import { usePanZoom } from './panzoom';
import { Member, Project, KIND_COLOR } from './model';
import { geometry } from './build';

export type DrawingKind = 'plan' | 'roof' | 'frame' | 'wall';

export interface DrawingOptions {
  kind: DrawingKind;
  levelId: string;
  gridXId: string;
  wallSide: 'front' | 'back';
  showMarks: boolean;
  filterBy: '' | 'zone' | 'group' | 'cls';
  filterVal: string;
}

interface Props {
  project: Project;
  members: Member[];
  opt: DrawingOptions;
}

const fmt = (v: number) => Math.round(v).toString();

/** Bản vẽ 2D dạng SVG, toạ độ vẽ = mm, lật trục đứng. */
const Drawing2D = forwardRef<SVGSVGElement, Props>(function Drawing2D({ project, members, opt }, ref) {
  const g = geometry(project);
  const level = project.levels.find((l) => l.id === opt.levelId) ?? project.levels[project.levels.length - 1];
  const gxPos = g.xs.get(opt.gridXId) ?? g.x0;
  const gxName = project.gridsX.find((x) => x.id === opt.gridXId)?.name ?? '';
  const wallY = opt.wallSide === 'front' ? g.y0 : g.yN;

  // Chọn cấu kiện & phép chiếu theo loại bản vẽ
  type P2 = [number, number];
  let proj: (v: [number, number, number]) => P2;
  let pick: (m: Member) => boolean;
  let title = '';
  let hAxis: { name: string; pos: number }[] = [];
  let vAxis: { name: string; pos: number }[] = [];
  let levelsLines: { name: string; z: number }[] = [];
  const tol = 1500;

  if (opt.kind === 'plan' || opt.kind === 'roof') {
    proj = (v) => [v[0], v[1]];
    hAxis = project.gridsX.map((x) => ({ name: x.name, pos: g.xs.get(x.id)! }));
    vAxis = project.gridsY.map((y) => ({ name: y.name, pos: g.ys.get(y.id)! }));
    if (opt.kind === 'plan') {
      const z = level?.elevation ?? 0;
      title = `MẶT BẰNG KẾT CẤU – ${level?.name ?? ''} (+${fmt(z)})`;
      pick = (m) =>
        (m.kind === 'column' && Math.min(m.a[2], m.b[2]) <= z + 1 && Math.max(m.a[2], m.b[2]) >= z - 1) ||
        (m.kind === 'beam' && Math.abs(m.a[2] + m.section.h / 2 - z) < 1);
    } else {
      title = 'MẶT BẰNG MÁI – KÈO, XÀ GỒ, GIẰNG MÁI';
      pick = (m) => m.kind === 'rafter' || m.kind === 'purlin' || (m.kind === 'brace' && Math.min(m.a[2], m.b[2]) >= g.eave - 1) || m.kind === 'column';
    }
  } else if (opt.kind === 'frame') {
    proj = (v) => [v[1], v[2]];
    title = `MẶT CẮT KHUNG TRỤC ${gxName}`;
    hAxis = project.gridsY.map((y) => ({ name: y.name, pos: g.ys.get(y.id)! }));
    levelsLines = project.levels.map((l) => ({ name: l.name, z: l.elevation }));
    pick = (m) => Math.abs(m.a[0] - gxPos) < 1 && Math.abs(m.b[0] - gxPos) < 1 && m.kind !== 'girt';
  } else {
    proj = (v) => [v[0], v[2]];
    const sideName = project.gridsY.find((y) => g.ys.get(y.id) === wallY)?.name ?? '';
    title = `MẶT ĐỨNG TƯỜNG TRỤC ${sideName}`;
    hAxis = project.gridsX.map((x) => ({ name: x.name, pos: g.xs.get(x.id)! }));
    levelsLines = project.levels.map((l) => ({ name: l.name, z: l.elevation }));
    pick = (m) => Math.abs(m.a[1] - wallY) < tol && Math.abs(m.b[1] - wallY) < tol && m.kind !== 'purlin' && m.kind !== 'rafter' && !(m.kind === 'beam' && Math.abs(m.a[1] - m.b[1]) > 1);
  }

  const filt = (m: Member) => !opt.filterBy || !opt.filterVal || m[opt.filterBy] === opt.filterVal;
  // ピース / bulông quá nhỏ ở tỉ lệ bản vẽ tổng thể → không vẽ (tránh chữ M12 dày đặc)
  const list = members.filter((m) => m.part !== 'piece' && m.part !== 'bolt').filter(pick).filter(filt);
  if (opt.filterBy && opt.filterVal) title += ` – ${{ zone: '工区', group: 'グループ', cls: '分類' }[opt.filterBy]}: ${opt.filterVal}`;
  const pts = list.flatMap((m) => [proj(m.a), proj(m.b)]);
  const xsAll = [...pts.map((p) => p[0]), ...hAxis.map((a) => a.pos)];
  const ysAll = [...pts.map((p) => p[1]), ...vAxis.map((a) => a.pos), ...levelsLines.map((l) => l.z)];
  const minX = Math.min(...xsAll, 0), maxX = Math.max(...xsAll, 1000);
  const minY = Math.min(...ysAll, 0), maxY = Math.max(...ysAll, 1000);
  const span = Math.max(maxX - minX, maxY - minY);
  const pad = span * 0.16 + 2500;
  const bubble = span * 0.018 + 250;
  const txt = bubble * 0.9;
  const inner = useRef<SVGSVGElement>(null);
  useImperativeHandle(ref, () => inner.current!);
  const vbX = minX - pad, vbW = maxX - minX + 2 * pad;
  // lật trục đứng: y_svg = -y
  const vbY = -(maxY + pad), vbH = maxY - minY + 2 * pad;
  const pz = usePanZoom(inner, { x: vbX, y: vbY, w: vbW, h: vbH }, `${opt.kind}|${opt.levelId}|${opt.gridXId}|${opt.wallSide}`);
  const sw = span / 900 + 8;

  const marks = new Map<string, { x: number; y: number; t: string }>();
  for (const m of list) {
    const a = proj(m.a), b = proj(m.b);
    const k = `${m.mark}@${Math.round((a[0] + b[0]) / 2)},${Math.round((a[1] + b[1]) / 2)}`;
    if (m.kind !== 'column' || opt.kind !== 'plan') marks.set(k, { x: (a[0] + b[0]) / 2, y: -(a[1] + b[1]) / 2, t: m.mark + (m.joint ? ` [${m.joint}]` : '') });
  }

  const dimY = minY - pad * 0.45;
  const sortedH = [...hAxis].sort((a, b) => a.pos - b.pos);
  const sortedV = [...vAxis].sort((a, b) => a.pos - b.pos);

  return (
    <svg ref={inner} className="drawing" viewBox={pz.viewBox} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <rect x={vbX - vbW * 5} y={vbY - vbH * 5} width={vbW * 11} height={vbH * 11} fill="#ffffff" />
      {/* Trục ngang (đánh số theo phương X hoặc Y) */}
      {hAxis.map((a) => (
        <g key={'h' + a.name}>
          <line x1={a.pos} x2={a.pos} y1={-(maxY + pad * 0.35)} y2={-(minY - pad * 0.62)} stroke="#dc2626" strokeWidth={sw * 0.6} strokeDasharray={`${sw * 12} ${sw * 4} ${sw * 2} ${sw * 4}`} />
          <circle cx={a.pos} cy={-(minY - pad * 0.62) + bubble} r={bubble} fill="#fff" stroke="#0f172a" strokeWidth={sw} />
          <text x={a.pos} y={-(minY - pad * 0.62) + bubble} fontSize={txt} textAnchor="middle" dominantBaseline="central" fontFamily="sans-serif">
            {a.name}
          </text>
        </g>
      ))}
      {vAxis.map((a) => (
        <g key={'v' + a.name}>
          <line y1={-a.pos} y2={-a.pos} x1={minX - pad * 0.62} x2={maxX + pad * 0.35} stroke="#dc2626" strokeWidth={sw * 0.6} strokeDasharray={`${sw * 12} ${sw * 4} ${sw * 2} ${sw * 4}`} />
          <circle cy={-a.pos} cx={minX - pad * 0.62 - bubble} r={bubble} fill="#fff" stroke="#0f172a" strokeWidth={sw} />
          <text y={-a.pos} x={minX - pad * 0.62 - bubble} fontSize={txt} textAnchor="middle" dominantBaseline="central" fontFamily="sans-serif">
            {a.name}
          </text>
        </g>
      ))}
      {/* Đường kích thước ngang */}
      {sortedH.length > 1 && (
        <g stroke="#0f172a" strokeWidth={sw * 0.6} fontFamily="sans-serif">
          <line x1={sortedH[0].pos} x2={sortedH[sortedH.length - 1].pos} y1={-dimY} y2={-dimY} />
          {sortedH.map((a) => (
            <line key={a.name} x1={a.pos - sw * 6} x2={a.pos + sw * 6} y1={-dimY + sw * 6} y2={-dimY - sw * 6} strokeWidth={sw} />
          ))}
          {sortedH.slice(1).map((a, i) => (
            <text key={a.name} x={(a.pos + sortedH[i].pos) / 2} y={-dimY - sw * 8} fontSize={txt * 0.75} textAnchor="middle" stroke="none" fill="#0f172a">
              {fmt(a.pos - sortedH[i].pos)}
            </text>
          ))}
        </g>
      )}
      {sortedV.length > 1 && (
        <g stroke="#0f172a" strokeWidth={sw * 0.6} fontFamily="sans-serif">
          <line y1={-sortedV[0].pos} y2={-sortedV[sortedV.length - 1].pos} x1={minX - pad * 0.4} x2={minX - pad * 0.4} />
          {sortedV.map((a) => (
            <line key={a.name} y1={-a.pos - sw * 6} y2={-a.pos + sw * 6} x1={minX - pad * 0.4 - sw * 6} x2={minX - pad * 0.4 + sw * 6} strokeWidth={sw} />
          ))}
          {sortedV.slice(1).map((a, i) => {
            const cy = -(a.pos + sortedV[i].pos) / 2;
            const cx = minX - pad * 0.4 - sw * 8;
            return (
              <text key={a.name} x={cx} y={cy} fontSize={txt * 0.75} textAnchor="middle" stroke="none" fill="#0f172a" transform={`rotate(-90 ${cx} ${cy})`}>
                {fmt(a.pos - sortedV[i].pos)}
              </text>
            );
          })}
        </g>
      )}
      {/* Cao độ tầng */}
      {levelsLines.map((l) => (
        <g key={l.name} fontFamily="sans-serif">
          <line x1={minX - pad * 0.3} x2={maxX + pad * 0.3} y1={-l.z} y2={-l.z} stroke="#94a3b8" strokeWidth={sw * 0.5} strokeDasharray={`${sw * 6} ${sw * 4}`} />
          <path d={`M ${maxX + pad * 0.3} ${-l.z} l ${-bubble * 0.5} ${-bubble * 0.6} h ${bubble} z`} fill="#0f172a" />
          <text x={maxX + pad * 0.32} y={-l.z - bubble * 0.8} fontSize={txt * 0.7} fill="#0f172a">
            {l.z >= 0 ? '+' : ''}
            {fmt(l.z)} {l.name}
          </text>
        </g>
      ))}
      {/* Cấu kiện */}
      {list.map((m) => {
        const a = proj(m.a), b = proj(m.b);
        const isPoint = Math.hypot(a[0] - b[0], a[1] - b[1]) < 1;
        if (isPoint) {
          const w = m.section.b, h = m.section.h;
          return (
            <rect
              key={m.id}
              x={a[0] - w / 2}
              y={-a[1] - h / 2}
              width={w}
              height={h}
              fill={KIND_COLOR[m.kind]}
              stroke="#0f172a"
              strokeWidth={sw * 0.5}
              transform={m.rotation ? `rotate(${-m.rotation} ${a[0]} ${-a[1]})` : undefined}
            />
          );
        }
        const thick = m.kind === 'brace' || m.kind === 'purlin' || m.kind === 'girt' ? sw * 1.1 : Math.max(sw * 2.5, Math.min(m.section.h, 400) * 0.6);
        return (
          <line
            key={m.id}
            x1={a[0]}
            y1={-a[1]}
            x2={b[0]}
            y2={-b[1]}
            stroke={KIND_COLOR[m.kind]}
            strokeWidth={thick}
            strokeDasharray={m.kind === 'brace' ? `${sw * 8} ${sw * 4}` : undefined}
            strokeLinecap="butt"
          />
        );
      })}
      {opt.showMarks &&
        [...marks.values()].map((t, i) => (
          <text key={i} x={t.x} y={t.y - sw * 6} fontSize={txt * 0.6} textAnchor="middle" fill="#0f172a" fontFamily="sans-serif" paintOrder="stroke" stroke="#fff" strokeWidth={sw * 2}>
            {t.t}
          </text>
        ))}
      {/* Khung tên */}
      <g fontFamily="sans-serif">
        <text x={(minX + maxX) / 2} y={-(maxY + pad * 0.6)} fontSize={txt * 1.3} textAnchor="middle" fontWeight="bold" fill="#0f172a">
          {title}
        </text>
        <text x={(minX + maxX) / 2} y={-(maxY + pad * 0.6) + txt * 1.3} fontSize={txt * 0.7} textAnchor="middle" fill="#475569">
          {project.name} · Đơn vị: mm
        </text>
      </g>
    </svg>
  );
});

export default Drawing2D;
