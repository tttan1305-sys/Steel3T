// Hình minh hoạ ベース (柱脚): mặt bằng bản đế + mặt đứng bulông neo, kèm kích thước
import type { BasePlate } from './model';
import { baseLayout } from './jointGeom';
import { Bolt, C, Dim, NS, T } from './JointShape';

export interface ColOutline {
  type: string;
  h: number;
  b: number;
  tw?: number;
  tf?: number;
}

export default function BaseShape({ b, col }: { b: BasePlate; col?: ColOutline }) {
  const BL = baseLayout(b);
  const B = b.b, D = b.d, t = b.t, gr = b.grout;
  const L = b.anchor.length, dia = b.anchor.dia;
  const fs = Math.max(B, D, L * 0.6) / 18;
  const hr = BL.hole / 2;
  // ---------- mặt bằng (tâm 0,0; y xuống dưới = -Y khung)
  const X = B / 2 - BL.ex, Y = D / 2 - BL.ey;
  const xs = [...new Set(BL.pts.filter((q) => Math.abs(q[1] + Y) < 1e-6).map((q) => +q[0].toFixed(3)))].sort((a, c) => a - c);
  const ys = [...new Set(BL.pts.filter((q) => Math.abs(q[0] - X) < 1e-6).map((q) => +q[1].toFixed(3)))].sort((a, c) => a - c);
  const cw = col ? (col.type === 'H' ? col.b : col.b) : 0, ch = col ? col.h : 0;
  const plan = (
    <g>
      <polygon data-dk="C B D" points={BL.outline.map(([x, y]) => `${x},${-y}`).join(' ')} fill={C.plate} stroke={C.plateS} strokeWidth={1.4} {...NS} />
      {col && col.type === 'H' && col.tf && col.tw ? (
        <path
          d={`M${-cw / 2},${-ch / 2}h${cw}v${col.tf}h${-(cw - col.tw) / 2}v${ch - 2 * col.tf}h${(cw - col.tw) / 2}v${col.tf}h${-cw}v${-col.tf}h${(cw - col.tw) / 2}v${-(ch - 2 * col.tf)}h${-(cw - col.tw) / 2}z`}
          fill={C.steel}
          fillOpacity={0.6}
          stroke={C.steelS}
          {...NS}
        />
      ) : col ? (
        <g>
          <rect x={-cw / 2} y={-ch / 2} width={cw} height={ch} fill={C.steel} fillOpacity={0.6} stroke={C.steelS} {...NS} />
          {col.tw ? <rect x={-cw / 2 + col.tw} y={-ch / 2 + col.tw} width={cw - 2 * col.tw} height={ch - 2 * col.tw} fill={C.plate} stroke={C.steelS} {...NS} /> : null}
        </g>
      ) : null}
      <line x1={-B / 2 - fs} x2={B / 2 + fs} y1={0} y2={0} stroke="#94a3b8" strokeDasharray="12 6 3 6" strokeWidth={0.7} {...NS} />
      <line y1={-D / 2 - fs} y2={D / 2 + fs} x1={0} x2={0} stroke="#94a3b8" strokeDasharray="12 6 3 6" strokeWidth={0.7} {...NS} />
      <g className="dim" data-dk="nx ny dia">
        {BL.pts.map(([x, y], k) => (
          <Bolt key={k} x={x} y={-y} r={hr} />
        ))}
      </g>
      {/* B, D */}
      <Dim x1={-B / 2} x2={B / 2} y1={-D / 2 - fs * 2.6} y2={-D / 2 - fs * 2.6} s={fs} k="B" label={`B ${B}`} />
      <Dim x1={-B / 2 - fs * 2.6} x2={-B / 2 - fs * 2.6} y1={-D / 2} y2={D / 2} s={fs} k="D" label={`D ${D}`} />
      {/* chuỗi theo X: ex · px… · ex */}
      {[-B / 2, ...xs, B / 2].slice(0, -1).map((x0, k, arr) => {
        const x1 = k + 1 < arr.length ? arr[k + 1] : B / 2;
        const w = Math.round(x1 - x0);
        return w > 0 ? <Dim key={'x' + k} x1={x0} x2={x1} y1={D / 2 + fs * 1.4} y2={D / 2 + fs * 1.4} s={fs} side={1} k={k === 0 || k === arr.length - 1 ? 'ex' : 'nx'} label={w} /> : null;
      })}
      {/* chuỗi theo Y: ey · py… · ey */}
      {[-D / 2, ...ys, D / 2].slice(0, -1).map((y0, k, arr) => {
        const y1 = k + 1 < arr.length ? arr[k + 1] : D / 2;
        const w = Math.round(y1 - y0);
        return w > 0 ? <Dim key={'y' + k} x1={B / 2 + fs * 1.4} x2={B / 2 + fs * 1.4} y1={-y1} y2={-y0} s={fs} side={1} k={k === 0 || k === arr.length - 1 ? 'ey' : 'ny'} label={w} /> : null;
      })}
      {BL.c > 0 && (
        <g className="dim" data-dk="C"><T x={B / 2 - BL.c / 2 + fs * 0.4} y={-D / 2 + BL.c / 2 - fs * 0.6} s={fs * 0.75} anchor="start" fill={C.plateS}>
          C{BL.c}
        </T></g>
      )}
      <T x={0} y={-D / 2 - fs * 4.4} s={fs * 0.95}>
        Mặt bằng · {BL.pts.length}-M{dia} · lỗ φ{BL.hole}
      </T>
    </g>
  );
  // ---------- mặt đứng (gốc: tâm mặt trên bản đế; y xuống)
  const ox = B + fs * 9;
  const top = -BL.proj;
  const bot = top + L;
  const nutH = Math.round(dia * 0.8), wsT = Math.max(3, Math.round(dia * 0.18)), wsW = dia * 2.2;
  const colH = Math.max(120, L * 0.25);
  const conc = t + gr;
  const shape = BL.shape;
  const hook = BL.hook;
  const anchorEl = (x: number, k: number) => {
    const out = x === 0 ? 1 : Math.sign(x);
    const r = dia / 2;
    return (
      <g key={k}>
        <rect x={x - r} y={top} width={dia} height={L - (shape === 'L' || shape === 'J' ? r : 0)} fill="#94a3b8" stroke="#334155" strokeWidth={0.8} {...NS} />
        {/* đai ốc + vòng đệm trên bản đế */}
        <rect x={x - wsW / 2} y={-wsT} width={wsW} height={wsT} fill="#e2e8f0" stroke="#334155" strokeWidth={0.8} {...NS} />
        <rect x={x - dia} y={-wsT - nutH} width={dia * 2} height={nutH} fill="#64748b" stroke="#334155" strokeWidth={0.8} {...NS} />
        <rect x={x - dia} y={-wsT - 2 * nutH - 2} width={dia * 2} height={nutH} fill="#64748b" stroke="#334155" strokeWidth={0.8} {...NS} />
        {(shape === 'L' || shape === 'J') && <rect x={out > 0 ? x - r : x - hook + r} y={bot - dia} width={hook} height={dia} fill="#94a3b8" stroke="#334155" strokeWidth={0.8} {...NS} />}
        {shape === 'J' && <rect x={out > 0 ? x - r + hook - dia : x - hook + r} y={bot - dia - hook * 0.5} width={dia} height={hook * 0.5} fill="#94a3b8" stroke="#334155" strokeWidth={0.8} {...NS} />}
        {shape === 'P' && (
          <g>
            <rect x={x - hook / 2} y={bot - Math.max(9, dia * 0.5) - nutH} width={hook} height={Math.max(9, dia * 0.5)} fill={C.plate} stroke={C.plateS} strokeWidth={0.8} {...NS} />
            <rect x={x - dia} y={bot - nutH} width={dia * 2} height={nutH} fill="#64748b" stroke="#334155" strokeWidth={0.8} {...NS} />
          </g>
        )}
      </g>
    );
  };
  const xe = xs.length ? xs : [0];
  const xmax = Math.max(B / 2, ...xe.map((x) => Math.abs(x) + (shape === 'P' ? hook / 2 : shape === 'I' ? 0 : hook)));
  const elev = (
    <g transform={`translate(${ox},0)`}>
      {/* bê tông + vữa */}
      <rect x={-xmax - fs * 2} y={conc} width={2 * xmax + fs * 4} height={bot - conc + fs * 1.5} fill="#f1f5f9" stroke="#cbd5e1" {...NS} />
      <rect x={-B / 2} y={t} width={B} height={gr} fill="#e7e5e4" stroke="#a8a29e" {...NS} />
      {/* cột */}
      {col && <rect x={-cw / 2} y={-colH} width={cw} height={colH} fill={C.steel} stroke={C.steelS} {...NS} />}
      <rect x={-B / 2} y={0} width={B} height={t} fill={C.plate} stroke={C.plateS} strokeWidth={1.4} {...NS} />
      {xe.map(anchorEl)}
      {/* kích thước */}
      <Dim x1={xmax + fs * 1.2} x2={xmax + fs * 1.2} y1={top} y2={bot} s={fs} side={1} k="L" label={`L ${L}`} />
      <Dim x1={-xmax - fs * 1.2} x2={-xmax - fs * 1.2} y1={top} y2={0} s={fs} k="proj" label={`${BL.proj}`} />
      <Dim x1={-xmax - fs * 1.2} x2={-xmax - fs * 1.2} y1={0} y2={t} s={fs} k="t" label={`t${t}`} />
      {gr > 0 && <Dim x1={-xmax - fs * 2.6} x2={-xmax - fs * 2.6} y1={t} y2={conc} s={fs} k="gr" label={`${gr}`} />}
      {shape !== 'I' && (
        <Dim
          x1={shape === 'P' ? xe[xe.length - 1] - hook / 2 : xe[xe.length - 1] - dia / 2}
          x2={shape === 'P' ? xe[xe.length - 1] + hook / 2 : xe[xe.length - 1] - dia / 2 + hook}
          y1={bot + fs * 1.1}
          y2={bot + fs * 1.1}
          s={fs}
          side={1}
          k="hook"
          label={shape === 'P' ? `□${hook}` : `${hook}`}
        />
      )}
      <T x={0} y={-colH - fs * 0.8} s={fs * 0.95}>
        Mặt đứng · {b.anchor.material} M{dia}×{L} · {shape === 'I' ? 'thẳng' : shape === 'L' ? 'móc L' : shape === 'J' ? 'móc J' : 'アンカープレート'}
      </T>
      <T x={-xmax - fs * 0.2} y={-fs * 0.3} s={fs * 0.6} anchor="end" fill="#64748b">突出</T>
      <T x={-xmax - fs * 2.8} y={conc + gr / 2 + fs * 0.9} s={fs * 0.6} anchor="end" fill="#64748b">モルタル</T>
    </g>
  );
  const vx0 = -B / 2 - fs * 4.5;
  const vx1 = ox + xmax + fs * 4;
  const vy0 = Math.min(-D / 2 - fs * 5.6, -colH - fs * 2);
  const vy1 = Math.max(D / 2 + fs * 3, bot + fs * 3.2);
  return (
    <svg className="joint-shape base-shape" viewBox={`${vx0} ${vy0} ${vx1 - vx0} ${vy1 - vy0}`}>
      {plan}
      {elev}
    </svg>
  );
}
