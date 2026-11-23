// Hình minh hoạ 継手 ブレース: GPL đầu giằng (図1/図2/図3/ブレースシート) + クロスプレート 中
import type { Joint, Member, Project } from './model';
import { braceDims, braceGusset } from './braceGusset';
import { BRACE_SHEET } from './kiseihin';
import { Bolt, C, Dim, NS, T } from './JointShape';

const fakeP = { braces: [], knees: [], plates: [] } as unknown as Project;
const mem = (a: [number, number, number], b: [number, number, number], w: number) => ({ id: 'x', a, b, section: { b: w, h: w } }) as unknown as Member;

export default function BraceShape({ j, shape, secW = 75, p }: { j: Joint; shape: string; secW?: number; p?: Project }) {
  const D = braceDims(j, secW);
  const sheet = j.sheet ? BRACE_SHEET.find((s) => s.code === j.sheet) : undefined;
  const jj = { ...j, shape } as Joint;
  const P = p ? ({ ...p, braces: [], knees: [] } as unknown as Project) : fakeP;
  // giằng 45° trong mặt phẳng XZ
  const m1 = mem([0, 0, 0], [3000, 0, 3000], secW);
  const m2 = mem([0, 0, 3000], [3000, 0, 0], secW);
  const g = braceGusset(P, m1, 'left', jj);
  const L = sheet && shape === 'sheet' ? sheet.D : D.L;
  const fs = Math.max(L, D.midL * 0.8, 180) / 13;
  const xs = g.pts.map((q) => q[0]), ys = g.pts.map((q) => q[1]);
  const minU = Math.min(...xs, 0), maxU = Math.max(...xs, L);
  const minV = Math.min(...ys), maxV = Math.max(...ys);
  // thanh giằng: bắt đầu trước bulông trong cùng một đoạn
  const holesU = g.holes.map((h) => h.c[0]);
  const brStart = Math.max(minU, Math.min(...holesU) - D.edge);
  const brEnd = maxU + L * 0.6;
  const hw = Math.max(secW, 40) / 2;
  // trục khung trong (u,v): e1=(1,0,0) → u=0.707, v=…; vẽ đường mặt cột / dầm
  const e1uv: [number, number] = [g.u[0], g.v[0]];
  const e2uv: [number, number] = [g.u[2], g.v[2]];
  const far = (maxU - minU) * 1.6;
  const left = (
    <g>
      {shape !== 'sheet' && shape !== 'fig2' && (
        <>
          <line x1={0} y1={0} x2={e1uv[0] * far} y2={-e1uv[1] * far} stroke={C.steelS} strokeWidth={3} strokeOpacity={0.35} {...NS} />
          <line x1={0} y1={0} x2={e2uv[0] * far} y2={-e2uv[1] * far} stroke={C.steelS} strokeWidth={3} strokeOpacity={0.35} {...NS} />
        </>
      )}
      <polygon data-dk="T" points={g.pts.map(([u, v]) => `${u},${-v}`).join(' ')} fill={C.gpl} stroke={C.gplS} strokeWidth={1.4} {...NS} />
      <rect x={brStart} y={-hw} width={brEnd - brStart} height={2 * hw} fill={C.steel} fillOpacity={0.55} stroke={C.steelS} strokeDasharray="6 3" {...NS} />
      <line x1={minU - fs} x2={brEnd} y1={0} y2={0} stroke="#94a3b8" strokeDasharray="12 6 3 6" strokeWidth={0.7} {...NS} />
      <g className="dim" data-dk="P n dia">
        {g.holes.map((h, k) => (
          <Bolt key={k} x={h.c[0]} y={-h.c[1]} r={h.r} />
        ))}
      </g>
      <Dim x1={Math.min(0, minU)} x2={L} y1={-maxV - fs * 1.6} y2={-maxV - fs * 1.6} s={fs} k="L" label={`L ${Math.round(L - Math.min(0, minU))}`} />
      {shape !== 'sheet' && (
        <>
          {/* chuỗi bulông: P × (n-1) · e */}
          {D.cols > 1 && <Dim x1={L - D.edge - D.span} x2={L - D.edge} y1={-minV + fs * 1.4} y2={-minV + fs * 1.4} s={fs} side={1} k="P n" label={`${D.pitch}×${D.cols - 1}`} />}
          <Dim x1={L - D.edge} x2={L} y1={-minV + fs * 1.4} y2={-minV + fs * 1.4} s={fs} side={1} k="e" label={`e${D.edge}`} />
        </>
      )}
      {shape === 'fig2' && (
        <>
          {[-1, 1].map((k) => (
            <line key={k} x1={L} x2={brEnd + fs * 1.6} y1={(k * D.W) / 2} y2={(k * D.W) / 2} stroke="#2563eb" strokeWidth={0.5} strokeDasharray="3 3" {...NS} />
          ))}
          <Dim x1={brEnd + fs * 1.2} x2={brEnd + fs * 1.2} y1={-D.W / 2} y2={D.W / 2} s={fs} side={1} k="W" label={`W ${D.W}`} />
          <Dim x1={-40 - fs * 1.2} x2={-40 - fs * 1.2} y1={-D.W0 / 2} y2={D.W0 / 2} s={fs} k="W0" label={`W0 ${D.W0}`} />
        </>
      )}
      {sheet && shape === 'sheet' && (
        <>
          {[-1, 1].map((k) => (
            <line key={k} x1={L} x2={brEnd + fs * 1.6} y1={(k * sheet.B) / 2} y2={(k * sheet.B) / 2} stroke="#2563eb" strokeWidth={0.5} strokeDasharray="3 3" {...NS} />
          ))}
          <Dim x1={brEnd + fs * 1.2} x2={brEnd + fs * 1.2} y1={-sheet.B / 2} y2={sheet.B / 2} s={fs} side={1} label={`B ${sheet.B}`} />
          <Dim x1={-fs * 1.2} x2={-fs * 1.2} y1={-sheet.A / 2} y2={sheet.A / 2} s={fs} label={`A ${sheet.A}`} />
          <Dim x1={L - sheet.C} x2={L} y1={-minV + fs * 1.4} y2={-minV + fs * 1.4} s={fs} side={1} label={`C ${sheet.C}`} />
          <Dim x1={0} x2={sheet.E} y1={-minV + fs * 1.4} y2={-minV + fs * 1.4} s={fs} side={1} label={`E ${sheet.E}`} />
        </>
      )}
      <T x={(minU + brEnd) / 2} y={-maxV - fs * 3.4} s={fs * 0.9}>
        GPL đầu giằng · t{g.t} · {g.holes.length}-M{j.bolt.dia}
      </T>
    </g>
  );
  // --- クロスプレート (hệ khung: x ngang, y đứng)
  const gm1 = braceGusset(P, m1, 'mid', jj);
  const gm2 = braceGusset(P, m2, 'mid', jj);
  const toF = (gg: typeof gm1, c: [number, number]): [number, number] => {
    const X = gg.u[0] * c[0] + gg.v[0] * c[1];
    const Z = gg.u[2] * c[0] + gg.v[2] * c[1];
    return [X, -Z];
  };
  const hx = D.midL / 2, hy = D.midW / 2;
  const ox = maxU + L * 0.6 + hx + fs * 5;
  const reach = Math.hypot(hx, hy) + L * 0.4;
  const mid = (
    <g transform={`translate(${ox},0)`}>
      {[1, -1].map((s) => (
        <g key={s} transform={`rotate(${s * -45})`}>
          <rect x={-reach} y={-hw} width={2 * reach} height={2 * hw} fill={C.steel} fillOpacity={0.45} stroke={C.steelS} strokeDasharray="6 3" {...NS} />
        </g>
      ))}
      <rect data-dk="mt" x={-hx} y={-hy} width={2 * hx} height={2 * hy} fill={C.gpl} fillOpacity={0.85} stroke={C.gplS} strokeWidth={1.4} {...NS} />
      <g className="dim" data-dk="mn P dia">
      {[gm1, gm2].flatMap((gg, i) =>
        gg.holes.map((h, k) => {
          const [x, y] = toF(gg, h.c);
          return <Bolt key={i + '-' + k} x={x} y={y} r={h.r} />;
        }),
      )}
      </g>
      <Dim x1={-hx} x2={hx} y1={-hy - fs * 1.4} y2={-hy - fs * 1.4} s={fs} k="ml" label={`${D.midL}`} />
      <Dim x1={hx + fs * 1.4} x2={hx + fs * 1.4} y1={-hy} y2={hy} s={fs} side={1} k="mw" label={`${D.midW}`} />
      <T x={0} y={-hy - fs * 3.4} s={fs * 0.9}>
        中 クロスプレート · t{D.midT} · {D.midN} bulông/phía
      </T>
    </g>
  );
  const vx0 = Math.min(minU, -40) - fs * 3.2;
  const vx1 = ox + Math.max(hx, reach * 0.72) + fs * 3;
  const vy0 = Math.min(-maxV - fs * 4.6, -Math.max(hy, reach * 0.72) - fs * 4.4);
  const vy1 = Math.max(-minV + fs * 3, Math.max(hy, reach * 0.72) + fs * 1.5);
  return (
    <svg className="joint-shape" viewBox={`${vx0} ${vy0} ${vx1 - vx0} ${vy1 - vy0}`}>
      {left}
      {mid}
    </svg>
  );
}
