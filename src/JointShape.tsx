// Hình dáng mối nối mẫu (sơ đồ, đơn vị mm) – vẽ theo số liệu thư viện 継手
import { LibFamily, PinRow, SplRow, HaneRow, isSpl } from './jointLib';
import type { Joint } from './model';
import { sideLen, groupWidth, gplDims, jointGap } from './jointGeom';
import type { Section } from './model';

export const NS = { vectorEffect: 'non-scaling-stroke' as const };
const parseH = (sec: string) => {
  const m = sec.match(/^H-([\d.]+)x([\d.]+)x([\d.]+)x([\d.]+)/);
  return m ? { H: +m[1], B: +m[2], tw: +m[3], tf: +m[4] } : { H: 300, B: 150, tw: 6.5, tf: 9 };
};
export const Bolt = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill="#fff" stroke="#0f172a" strokeWidth={1.2} {...NS} />
    <line x1={x - r * 1.3} x2={x + r * 1.3} y1={y} y2={y} stroke="#0f172a" strokeWidth={0.8} {...NS} />
    <line y1={y - r * 1.3} y2={y + r * 1.3} x1={x} x2={x} stroke="#0f172a" strokeWidth={0.8} {...NS} />
  </g>
);
export const T = ({ x, y, s, children, anchor = 'middle', fill = '#0f172a' }: { x: number; y: number; s: number; children: React.ReactNode; anchor?: 'start' | 'middle' | 'end'; fill?: string }) => (
  <text x={x} y={y} fontSize={s} textAnchor={anchor} fill={fill}>
    {children}
  </text>
);
export const C = { steel: '#cbd5e1', steelS: '#475569', plate: '#fde68a', plateS: '#92400e', plate2: '#fdba74', gpl: '#a5b4fc', gplS: '#3730a3' };

function SplShape({ r, column }: { r: SplRow; column: boolean }) {
  const { H, B, tf } = parseH(r.sec);
  const half = Math.max(r.fL, r.wL) / 2 + 160;
  const fs = Math.max(H, 260) / 13;
  const tfx = Math.max(tf, 8);
  const e3 = r.star ? 70 : 40;
  const hole = r.dia + 2;
  // --- mặt đứng
  const yTop = -H / 2, yBot = H / 2;
  const webBolts: [number, number][] = [];
  const y0 = -((r.mW - 1) * r.pc) / 2;
  for (const sd of [-1, 1]) for (let c = 0; c < r.nW; c++) for (let k = 0; k < r.mW; k++) webBolts.push([sd * (5 + e3 + c * 60), y0 + k * r.pc]);
  const flX: number[] = [];
  const chidori = r.g2 > 0 && r.mF === 2;
  const fp = chidori ? 45 : 60;
  for (const sd of [-1, 1]) for (let c = 0; c < r.nF; c++) flX.push(sd * (5 + 40 + c * fp));
  // --- mặt bằng cánh (bên dưới)
  const py = yBot + 120 + B / 2;
  const holes: [number, number][] = [];
  const lines = r.mF === 4 ? [-r.g1 / 2 - r.g2, -r.g1 / 2, r.g1 / 2, r.g1 / 2 + r.g2] : chidori ? [-r.g1 / 2 - r.g2, -r.g1 / 2, r.g1 / 2, r.g1 / 2 + r.g2] : [-r.g1 / 2, r.g1 / 2];
  for (const sd of [-1, 1])
    if (chidori)
      for (let c = 0; c < r.nF; c++) {
        const inner = c % 2 === 0;
        for (const s2 of [-1, 1]) holes.push([sd * (5 + 40 + c * 45), py + s2 * (inner ? r.g1 / 2 : r.g1 / 2 + r.g2)]);
      }
    else for (let c = 0; c < r.nF; c++) for (const y of lines) holes.push([sd * (5 + 40 + c * 60), py + y]);
  const vbW = 2 * half + 40, vbH = H + 2 * r.fT + B + 120 + 80 + fs * 4;
  const body = (
    <>
      {/* thanh 2 bên */}
      {[-1, 1].map((sd) => (
        <g key={sd}>
          <rect x={sd < 0 ? -half : 5} y={yTop} width={half - 5} height={tfx} fill={C.steel} stroke={C.steelS} {...NS} />
          <rect x={sd < 0 ? -half : 5} y={yBot - tfx} width={half - 5} height={tfx} fill={C.steel} stroke={C.steelS} {...NS} />
          <rect x={sd < 0 ? -half : 5} y={yTop + tfx} width={half - 5} height={H - 2 * tfx} fill="#f1f5f9" stroke={C.steelS} strokeWidth={0.6} {...NS} />
        </g>
      ))}
      {/* bản ghép */}
      <rect x={-r.fL / 2} y={yTop - r.fT} width={r.fL} height={r.fT} fill={C.plate} stroke={C.plateS} {...NS} />
      <rect x={-r.fL / 2} y={yBot} width={r.fL} height={r.fT} fill={C.plate} stroke={C.plateS} {...NS} />
      {r.iT > 0 && (
        <>
          <rect x={-r.fL / 2} y={yTop + tfx} width={r.fL} height={r.iT} fill={C.plate2} stroke={C.plateS} {...NS} />
          <rect x={-r.fL / 2} y={yBot - tfx - r.iT} width={r.fL} height={r.iT} fill={C.plate2} stroke={C.plateS} {...NS} />
        </>
      )}
      <rect x={-r.wL / 2} y={-r.wW / 2} width={r.wL} height={r.wW} fill={C.plate} fillOpacity={0.85} stroke={C.plateS} {...NS} />
      <line x1={0} x2={0} y1={yTop - r.fT - 30} y2={yBot + r.fT + 30} stroke="#dc2626" strokeDasharray="6 4" {...NS} />
      {webBolts.map(([x, y], i) => (
        <Bolt key={i} x={x} y={y} r={hole / 2} />
      ))}
      {flX.map((x, i) => (
        <g key={i}>
          <line x1={x} x2={x} y1={yTop - r.fT - 8} y2={yTop + tfx + r.iT + 8} stroke="#0f172a" strokeWidth={1.4} {...NS} />
          <line x1={x} x2={x} y1={yBot - tfx - r.iT - 8} y2={yBot + r.fT + 8} stroke="#0f172a" strokeWidth={1.4} {...NS} />
        </g>
      ))}
      {/* mặt bằng cánh */}
      <rect x={-half} y={py - B / 2} width={2 * half} height={B} fill={C.steel} fillOpacity={0.5} stroke={C.steelS} {...NS} />
      <rect x={-r.fL / 2} y={py - B / 2} width={r.fL} height={B} fill={C.plate} fillOpacity={0.9} stroke={C.plateS} {...NS} />
      <line x1={0} x2={0} y1={py - B / 2 - 20} y2={py + B / 2 + 20} stroke="#dc2626" strokeDasharray="6 4" {...NS} />
      {holes.map(([x, y], i) => (
        <Bolt key={i} x={x} y={y} r={hole / 2} />
      ))}
    </>
  );
  const ty = py + B / 2 + fs * 1.6;
  return (
    <svg className="joint-shape" viewBox={`${-vbW / 2} ${yTop - r.fT - fs * 2.2} ${vbW} ${vbH}`}>
      <T x={0} y={yTop - r.fT - fs * 0.9} s={fs}>
        {column ? '柱継手' : '梁継手'} {r.sec} · M{r.dia}
      </T>
      {body}
      <T x={-half} y={ty} s={fs * 0.85} anchor="start">
        外添板 {r.fT}×{r.fL}
        {r.iT ? `  内添板 ${r.iT}×${r.iW}` : ''}  ウェブ添板 {r.wT}×{r.wW}×{r.wL}
      </T>
      <T x={-half} y={ty + fs * 1.15} s={fs * 0.85} anchor="start">
        F: {r.nF}×{r.mF} g1 {r.g1}
        {r.g2 ? ` g2 ${r.g2}` : ''}
        {chidori ? ' (チドリ)' : r.mF === 4 ? ' (ダブル)' : ''} · W: {r.mW}×{r.nW} pc {r.pc}
        {r.star ? ' · e3 70' : ''}
      </T>
    </svg>
  );
}

function PinShape({ r, double }: { r: PinRow; double: boolean }) {
  const { H, tf } = parseH(r.sec);
  const fs = Math.max(H, 260) / 13;
  const tfx = Math.max(tf, 8);
  const hole = r.dia + 2;
  const plH = (r.n - 1) * 60 + 80;
  const ys = Array.from({ length: r.n }, (_, k) => -((r.n - 1) * 60) / 2 + k * 60);
  // BJ-1: GPL 0..90, dầm từ 10, bulông x = 50 ; BJ-2: GPL 0..80 (bulông 40), dầm từ 90, bulông 130, WPL 0..170
  const gplL = double ? 80 : 90;
  const beamX = double ? 90 : 10;
  const bx = double ? [40, 130] : [50];
  const len = 520;
  return (
    <svg className="joint-shape" viewBox={`${-140} ${-H / 2 - 80 - fs * 1.6} ${len + 180} ${H + 160 + fs * 3.6}`}>
      <T x={len / 2 + 40} y={-H / 2 - 80 - fs * 0.4} s={fs}>
        {double ? 'BJ-2' : 'BJ-1'} {r.sec} · M{r.dia} × {r.n}
      </T>
      {/* cột */}
      <rect x={-120} y={-H / 2 - 80} width={20} height={H + 160} fill={C.steel} stroke={C.steelS} {...NS} />
      <rect x={-100} y={-H / 2 - 80} width={80} height={H + 160} fill="#f1f5f9" stroke={C.steelS} strokeWidth={0.6} {...NS} />
      <rect x={-20} y={-H / 2 - 80} width={20} height={H + 160} fill={C.steel} stroke={C.steelS} {...NS} />
      {/* dầm */}
      <rect x={beamX} y={-H / 2} width={len - beamX} height={tfx} fill={C.steel} stroke={C.steelS} {...NS} />
      <rect x={beamX} y={H / 2 - tfx} width={len - beamX} height={tfx} fill={C.steel} stroke={C.steelS} {...NS} />
      <rect x={beamX} y={-H / 2 + tfx} width={len - beamX} height={H - 2 * tfx} fill="#f1f5f9" stroke={C.steelS} strokeWidth={0.6} {...NS} />
      {/* GPL hàn vào cột */}
      <rect x={0} y={-plH / 2} width={gplL} height={plH} fill={C.gpl} stroke={C.gplS} {...NS} />
      <path d={`M0 ${-plH / 2} l-8 -8 M0 ${plH / 2} l-8 8`} stroke={C.gplS} {...NS} />
      {double && <rect x={0} y={-plH / 2 + 5} width={170} height={plH - 10} fill={C.plate} fillOpacity={0.75} stroke={C.plateS} {...NS} />}
      {bx.map((x) => ys.map((y, k) => <Bolt key={`${x}-${k}`} x={x} y={y} r={hole / 2} />))}
      <T x={-130} y={H / 2 + 80 + fs * 1.4} s={fs * 0.85} anchor="start">
        GPL t{r.gpl}
        {double ? ` + WPL t${r.wpl} ダブル (二面せん断)` : ' (一面せん断)'} · p60 · e40
        {r.note ? ` · ${r.note}` : ''}
      </T>
    </svg>
  );
}

function HaneShape({ r }: { r: HaneRow }) {
  const w = 2 * r.e2;
  const fs = 17;
  return (
    <svg className="joint-shape" viewBox={`-40 -${w / 2 + 60} ${r.L + r.Ss + 300} ${w + 140}`}>
      <T x={(r.L + r.Ss + 200) / 2} y={-w / 2 - 25} s={fs}>
        羽子板ボルト M{r.d} · {r.bolt}
      </T>
      <rect x={0} y={-w / 2} width={r.L} height={w} rx={r.e2 * 0.6} fill={C.gpl} stroke={C.gplS} {...NS} />
      <Bolt x={r.e1} y={0} r={r.R / 2} />
      <line x1={r.L - r.lb} x2={r.L + 40} y1={0} y2={0} stroke="#0f172a" strokeWidth={r.d1 / 2} />
      <rect x={r.L + 40} y={-r.d} width={r.Ss} height={2 * r.d} rx={4} fill={C.steel} stroke={C.steelS} {...NS} />
      <line x1={r.L + 40 + r.Ss} x2={r.L + r.Ss + 220} y1={0} y2={0} stroke="#0f172a" strokeWidth={r.d1 / 2} />
      <T x={0} y={w / 2 + 40} s={fs * 0.85} anchor="start">
        t{r.t} · L{r.L} · e1 {r.e1} · e2 {r.e2} · e3 {r.e3} · hàn ≥{r.lb} · Ss {r.Ss}
      </T>
    </svg>
  );
}

export default function JointShape({ family, row }: { family: LibFamily; row: SplRow | PinRow | HaneRow }) {
  if (family === 'HB') return <HaneShape r={row as HaneRow} />;
  const r = row as SplRow | PinRow;
  if (isSpl(r)) return <SplShape r={r} column={family === 'CJ'} />;
  return <PinShape r={r} double={family === 'BJ2'} />;
}

// ── Hình mối nối theo đúng số liệu đã nhập (継手 thực tế của công trình) ──────────

interface SecDim {
  code: string;
  h: number;
  b: number;
  tw: number;
  tf: number;
}

/** Đường kích thước (ngang nếu y1 = y2, đứng nếu x1 = x2) */
export function Dim({ x1, y1, x2, y2, s, label, side = -1, k }: { x1: number; y1: number; x2: number; y2: number; s: number; label: string | number; side?: number; k?: string }) {
  const hz = Math.abs(y1 - y2) < 1e-6;
  const t = s * 0.35;
  return (
    <g className="dim" data-dk={k}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#2563eb" strokeWidth={0.9} {...NS} />
      {hz ? (
        <>
          <line x1={x1} x2={x1} y1={y1 - t} y2={y1 + t} stroke="#2563eb" strokeWidth={0.9} {...NS} />
          <line x1={x2} x2={x2} y1={y2 - t} y2={y2 + t} stroke="#2563eb" strokeWidth={0.9} {...NS} />
          <T x={(x1 + x2) / 2} y={y1 + (side < 0 ? -s * 0.3 : s * 1.0)} s={s * 0.8} fill="#1d4ed8">
            {label}
          </T>
        </>
      ) : (
        <>
          <line y1={y1} y2={y1} x1={x1 - t} x2={x1 + t} stroke="#2563eb" strokeWidth={0.9} {...NS} />
          <line y1={y2} y2={y2} x1={x2 - t} x2={x2 + t} stroke="#2563eb" strokeWidth={0.9} {...NS} />
          <text x={x1 + (side < 0 ? -s * 0.35 : s * 0.35)} y={(y1 + y2) / 2} fontSize={s * 0.8} fill="#1d4ed8" textAnchor="middle" transform={`rotate(-90 ${x1 + (side < 0 ? -s * 0.35 : s * 0.35)} ${(y1 + y2) / 2})`}>
            {label}
          </text>
        </>
      )}
    </g>
  );
}

/** Lỗ bulông 1 nhóm, đối xứng 2 bên đường nối (cx) */
const groupXs = (cx: number, g: { cols: number; pitch: number; edge: number }, gap: number) => {
  const xs: number[] = [];
  for (const sd of [-1, 1]) for (let c = 0; c < g.cols; c++) xs.push(cx + sd * (gap / 2 + g.edge + c * g.pitch));
  return xs;
};
const groupYs = (g: { rows: number; gauge: number }) => Array.from({ length: g.rows }, (_, k) => -((g.rows - 1) * g.gauge) / 2 + k * g.gauge);

export function JointLiveShape({ j, sec }: { j: Joint; sec: SecDim }) {
  const H = sec.h, B = sec.b, tf = Math.max(sec.tf, 6);
  const fs = Math.max(H, 260) / 13;
  const hole = j.bolt.dia + 2;
  const gap = jointGap(j);
  const wg = j.webBolts;
  const wh = j.webH > 0 ? j.webH : Math.max(groupWidth(wg), H - 2 * sec.tf - 40);
  const title = `${j.name} · ${j.target === 'column' ? '柱継手' : '梁継手'} ${j.type === 'DS' ? '二面せん断' : j.type} · ${sec.code} · ${j.bolt.grade} M${j.bolt.dia}`;
  const beam = (x0: number, x1: number, key: string) => (
    <g key={key}>
      <rect x={x0} y={-H / 2} width={x1 - x0} height={tf} fill={C.steel} stroke={C.steelS} {...NS} />
      <rect x={x0} y={H / 2 - tf} width={x1 - x0} height={tf} fill={C.steel} stroke={C.steelS} {...NS} />
      <rect x={x0} y={-H / 2 + tf} width={x1 - x0} height={H - 2 * tf} fill="#f1f5f9" stroke={C.steelS} strokeWidth={0.6} {...NS} />
    </g>
  );

  if (j.type === 'SPL') {
    const fg = j.flangeBolts;
    const flL = j.flangeL || 2 * sideLen(fg) + gap;
    const wL = j.webL || 2 * sideLen(wg) + gap;
    const half = Math.max(flL, wL) / 2 + 140;
    const wi = j.innerW || Math.max(20, (B - sec.tw) / 2 - 15);
    const chidori = (fg.gauge2 ?? 0) > 0 && fg.rows === 2;
    const fx = groupXs(0, fg, gap);
    const wx = groupXs(0, wg, gap);
    const wy = groupYs(wg);
    const py = H / 2 + j.flangeT + 3 * fs + B / 2;
    const g1 = fg.gauge, g2 = fg.gauge2 ?? 0;
    const lines = fg.rows >= 4 && g2 ? [-g1 / 2 - g2, -g1 / 2, g1 / 2, g1 / 2 + g2] : fg.rows === 1 ? [0] : groupYs(fg);
    const planHoles: [number, number][] = [];
    if (chidori)
      for (const sd of [-1, 1])
        for (let c = 0; c < fg.cols; c++) {
          const x = sd * (gap / 2 + fg.edge + c * fg.pitch);
          const inner = c % 2 === 0;
          for (const s2 of [-1, 1]) planHoles.push([x, py + s2 * (inner ? g1 / 2 : g1 / 2 + g2)]);
        }
    else for (const x of fx) for (const y of lines) planHoles.push([x, py + y]);
    const yTop = -H / 2 - j.flangeT;
    const vbTop = yTop - fs * 4.2;
    const vbBot = py + B / 2 + fs * 4.2;
    return (
      <svg className="joint-shape" viewBox={`${-half - fs * 2} ${vbTop} ${2 * half + fs * 4} ${vbBot - vbTop}`}>
        <T x={0} y={vbTop + fs * 1.1} s={fs}>
          {title}
        </T>
        {beam(-half, -gap / 2, 'a')}
        {beam(gap / 2, half, 'b')}
        <rect data-dk="fT" x={-flL / 2} y={yTop} width={flL} height={j.flangeT} fill={C.plate} stroke={C.plateS} {...NS} />
        <rect data-dk="fT" x={-flL / 2} y={H / 2} width={flL} height={j.flangeT} fill={C.plate} stroke={C.plateS} {...NS} />
        {j.innerT > 0 && (
          <>
            <rect data-dk="iT" x={-flL / 2} y={-H / 2 + tf} width={flL} height={j.innerT} fill={C.plate2} stroke={C.plateS} {...NS} />
            <rect data-dk="iT" x={-flL / 2} y={H / 2 - tf - j.innerT} width={flL} height={j.innerT} fill={C.plate2} stroke={C.plateS} {...NS} />
          </>
        )}
        <rect data-dk="wT" x={-wL / 2} y={-wh / 2} width={wL} height={wh} fill={C.plate} fillOpacity={0.85} stroke={C.plateS} {...NS} />
        <line x1={0} x2={0} y1={yTop - 20} y2={H / 2 + j.flangeT + 20} stroke="#dc2626" strokeDasharray="6 4" {...NS} />
        {wx.map((x) => wy.map((y, k) => <Bolt key={`w${x}-${k}`} x={x} y={y} r={hole / 2} />))}
        {fx.map((x, i) => (
          <g key={i}>
            <line x1={x} x2={x} y1={yTop - 8} y2={-H / 2 + tf + j.innerT + 8} stroke="#0f172a" strokeWidth={1.4} {...NS} />
            <line x1={x} x2={x} y1={H / 2 - tf - j.innerT - 8} y2={H / 2 + j.flangeT + 8} stroke="#0f172a" strokeWidth={1.4} {...NS} />
          </g>
        ))}
        {/* kích thước mặt đứng */}
        <Dim x1={-flL / 2} x2={flL / 2} y1={yTop - fs * 1.4} y2={yTop - fs * 1.4} s={fs} k="fT" label={`外 PL-${j.flangeT}×${B}×${flL}`} />
        <Dim x1={wL / 2 + fs * 1.2} x2={wL / 2 + fs * 1.2} y1={-wh / 2} y2={wh / 2} s={fs} side={1} k="wT" label={`PL-${j.webT}×${Math.round(wh)}×${wL}`} />
        {wg.rows > 1 && <Dim x1={-wL / 2 - fs * 1.2} x2={-wL / 2 - fs * 1.2} y1={wy[0]} y2={wy[wy.length - 1]} s={fs} k="wg wrows" label={`${wg.rows - 1}@${wg.gauge}`} />}
        <Dim x1={-wL / 2 - fs * 1.2} x2={-wL / 2 - fs * 1.2} y1={-wh / 2} y2={wy[0]} s={fs} k="weV" label={Math.round(wy[0] + wh / 2)} />
        <Dim x1={-wL / 2 - fs * 1.2} x2={-wL / 2 - fs * 1.2} y1={wy[wy.length - 1]} y2={wh / 2} s={fs} k="weV" label={Math.round(wh / 2 - wy[wy.length - 1])} />
        {/* chuỗi ngang bụng (nửa phải): e mối nối · P · e đầu bản */}
        <Dim x1={gap / 2} x2={gap / 2 + wg.edge} y1={wh / 2 - fs * 0.5} y2={wh / 2 - fs * 0.5} s={fs * 0.8} k="we" label={wg.edge} />
        {wg.cols > 1 && <Dim x1={gap / 2 + wg.edge} x2={gap / 2 + wg.edge + (wg.cols - 1) * wg.pitch} y1={wh / 2 - fs * 0.5} y2={wh / 2 - fs * 0.5} s={fs * 0.8} k="wP wn" label={`${wg.cols - 1}@${wg.pitch}`} />}
        <Dim x1={gap / 2 + wg.edge + (wg.cols - 1) * wg.pitch} x2={wL / 2} y1={wh / 2 - fs * 0.5} y2={wh / 2 - fs * 0.5} s={fs * 0.8} k="we2" label={Math.round(wL / 2 - gap / 2 - wg.edge - (wg.cols - 1) * wg.pitch)} />
        <Dim x1={-half + 20} x2={-half + 20} y1={-H / 2} y2={H / 2} s={fs} label={`H ${H}`} />
        {/* mặt bằng cánh */}
        <rect x={-half} y={py - B / 2} width={half - gap / 2} height={B} fill={C.steel} fillOpacity={0.5} stroke={C.steelS} {...NS} />
        <rect x={gap / 2} y={py - B / 2} width={half - gap / 2} height={B} fill={C.steel} fillOpacity={0.5} stroke={C.steelS} {...NS} />
        <rect x={-flL / 2} y={py - B / 2} width={flL} height={B} fill={C.plate} fillOpacity={0.9} stroke={C.plateS} {...NS} />
        <line x1={0} x2={0} y1={py - B / 2 - 20} y2={py + B / 2 + 20} stroke="#dc2626" strokeDasharray="6 4" {...NS} />
        {planHoles.map(([x, y], i) => (
          <Bolt key={i} x={x} y={y} r={hole / 2} />
        ))}
        <Dim x1={gap / 2} x2={gap / 2 + fg.edge} y1={py + B / 2 + fs * 1.2} y2={py + B / 2 + fs * 1.2} s={fs} side={1} k="fe" label={fg.edge} />
        {fg.cols > 1 && (
          <Dim x1={gap / 2 + fg.edge} x2={gap / 2 + fg.edge + (fg.cols - 1) * fg.pitch} y1={py + B / 2 + fs * 1.2} y2={py + B / 2 + fs * 1.2} s={fs} side={1} k="fP fn" label={`${fg.cols - 1}@${fg.pitch}`} />
        )}
        <Dim x1={gap / 2 + fg.edge + (fg.cols - 1) * fg.pitch} x2={flL / 2} y1={py + B / 2 + fs * 1.2} y2={py + B / 2 + fs * 1.2} s={fs} side={1} k="fe2" label={Math.round(flL / 2 - gap / 2 - fg.edge - (fg.cols - 1) * fg.pitch)} />
        <Dim x1={-gap / 2} x2={gap / 2} y1={py - B / 2 - fs * 0.8} y2={py - B / 2 - fs * 0.8} s={fs * 0.8} k="s" label={`s${gap}`} />
        {lines.length > 1 && (
          <Dim x1={-flL / 2 - fs * 1.2} x2={-flL / 2 - fs * 1.2} y1={py - B / 2} y2={py + lines[0]} s={fs} k="fge" label={Math.round(lines[0] + B / 2)} />
        )}
        <Dim x1={-half + 20} x2={-half + 20} y1={py - B / 2} y2={py + B / 2} s={fs} label={`B ${B}`} />
        {lines.length > 1 && <Dim x1={flL / 2 + fs * 1.2} x2={flL / 2 + fs * 1.2} y1={py - g1 / 2} y2={py + g1 / 2} s={fs} side={1} k="fg frows fg2" label={`g ${g1}`} />}
        <T x={-half} y={py + B / 2 + fs * 3.4} s={fs * 0.8} anchor="start">
          Cánh {fg.rows}×{fg.cols}/bên{chidori ? ' チドリ' : ''}
          {j.innerT > 0 ? ` · 内 PL-${j.innerT}×${Math.round(wi)}×${flL} ×2` : ''} · Bụng {wg.rows}×{wg.cols}/bên P{wg.pitch} · lỗ φ{hole}
        </T>
      </svg>
    );
  }

  // GPL (一面せん断) và DS (二面せん断): mặt cột ở x = 0
  const ds = j.type === 'DS';
  const sl = sideLen(wg);
  const cx = ds ? sl + gap / 2 : 0; // đường nối (DS)
  // GPL 1 mặt: kích thước theo đúng hình học 3D (tổng chiều dài từ mặt cột = すきま + phần chồng dầm)
  const GD = ds ? null : gplDims(sec as unknown as Section, j);
  const gplL = ds ? cx - gap / 2 : GD!.L;
  const pT = GD ? -(GD.gs.oy + GD.gs.h / 2) : -wh / 2, pB = GD ? -(GD.gs.oy - GD.gs.h / 2) : wh / 2; // mép trên / dưới bản (SVG)
  const wpL = ds ? j.webL || 2 * sl + gap : 0;
  const cl = j.clear ?? 10; // すきま s: mép 部材 (mặt cột / dầm chính) ↔ đầu dầm
  const beamX = ds ? cx + gap / 2 : cl;
  const len = Math.max(gplL, cx + wpL / 2) + 260;
  const xs = ds ? groupXs(cx, wg, gap) : Array.from({ length: wg.cols }, (_, c) => gplL - wg.edge - c * wg.pitch);
  const ys = groupYs(wg).map((y) => y - (GD?.oy ?? 0));
  const gT = ds ? j.gplT || j.webT : j.webT;
  const vbTop = -H / 2 - 80 - fs * 3.2;
  const vbH = H + 160 + fs * 6.4;
  return (
    <svg className="joint-shape" viewBox={`${-140 - fs * 2} ${vbTop} ${len + 160 + fs * 3} ${vbH}`}>
      <T x={-130 - fs} y={vbTop + fs * 1.1} s={fs * 0.85} anchor="start">
        {title}
      </T>
      <rect x={-120} y={-H / 2 - 80} width={20} height={H + 160} fill={C.steel} stroke={C.steelS} {...NS} />
      <rect x={-100} y={-H / 2 - 80} width={80} height={H + 160} fill="#f1f5f9" stroke={C.steelS} strokeWidth={0.6} {...NS} />
      <rect x={-20} y={-H / 2 - 80} width={20} height={H + 160} fill={C.steel} stroke={C.steelS} {...NS} />
      {beam(beamX, len, 'b')}
      <rect x={0} y={pT} width={gplL} height={pB - pT} fill={C.gpl} stroke={C.gplS} {...NS} />
      <path d={`M0 ${pT} l-8 -8 M0 ${pB} l-8 8`} stroke={C.gplS} {...NS} />
      {ds && <rect x={cx - wpL / 2} y={-wh / 2 + 5} width={wpL} height={wh - 10} fill={C.plate} fillOpacity={0.75} stroke={C.plateS} {...NS} />}
      {ds && <line x1={cx} x2={cx} y1={-H / 2 - 20} y2={H / 2 + 20} stroke="#dc2626" strokeDasharray="6 4" {...NS} />}
      {xs.map((x) => ys.map((y, k) => <Bolt key={`${x}-${k}`} x={x} y={y} r={hole / 2} />))}
      <Dim x1={0} x2={gplL} y1={ds ? -H / 2 - 40 : -H / 2 - 30 - fs * 1.5} y2={ds ? -H / 2 - 40 : -H / 2 - 30 - fs * 1.5} s={fs} k="L" label={`GPL ${Math.round(gplL)}`} />
      {!ds && (() => {
        // chuỗi kích thước có tên thông số: mặt cột → bulông, P, e
        const xl = Math.min(...xs), xr = Math.max(...xs), y = -H / 2 - 30;
        const ye = pT, yb = Math.min(...ys), yB = Math.max(...ys);
        return (
          <g>
            <Dim x1={0} x2={xl} y1={y} y2={y} s={fs} k="a" label={`${Math.round(xl)}`} />
            {wg.cols > 1 && <Dim x1={xl} x2={xr} y1={y} y2={y} s={fs} side={1} k="P n" label={wg.cols === 2 ? `P${wg.pitch}` : `P${wg.cols - 1}@${wg.pitch}`} />}
            <Dim x1={xr} x2={gplL} y1={y} y2={y} s={fs} k="e" label={`e${wg.edge}`} />
            <Dim x1={-140} x2={-140} y1={ye} y2={yb} s={fs} k="top" label={`${Math.round(yb - ye)}`} />
            <Dim x1={-140} x2={-140} y1={yB} y2={pB} s={fs} k="bot" label={`${Math.round(pB - yB)}`} />
            {/* tâm 部材 ↔ tâm GPL */}
            <g className="dim" data-dk="goy">
              <line x1={-30} x2={len} y1={0} y2={0} stroke="#0891b2" strokeWidth={0.8} strokeDasharray="14 4 3 4" {...NS} />
              <line x1={-10} x2={gplL + fs * 3.2} y1={(pT + pB) / 2} y2={(pT + pB) / 2} stroke="#0891b2" strokeWidth={0.8} strokeDasharray="3 3" {...NS} />
              {Math.abs(GD!.gs.oy) > 0.5 ? (
                <Dim x1={gplL + fs * 2.4} x2={gplL + fs * 2.4} y1={(pT + pB) / 2} y2={0} s={fs} side={1} k="goy" label={`${Math.round(GD!.gs.oy * 10) / 10}`} />
              ) : (
                <T x={gplL + fs * 2.6} y={-fs * 0.4} s={fs * 0.8} anchor="start" fill="#0e7490">
                  0
                </T>
              )}
            </g>
            {/* すきま s */}
            <g className="dim" data-dk="s">
            <line x1={0} x2={0} y1={H / 2} y2={H / 2 + 50} stroke="#db2777" strokeWidth={0.9} {...NS} />
            <line x1={cl} x2={cl} y1={H / 2} y2={H / 2 + 50} stroke="#db2777" strokeWidth={0.9} {...NS} />
            <path d={`M${-30} ${H / 2 + 40} H${cl + 30}`} stroke="#db2777" strokeWidth={0.9} {...NS} />
            <T x={cl + 34} y={H / 2 + 40 + fs * 0.3} s={fs * 0.8} anchor="start" fill="#be185d">
              s = {cl} (すきま)
            </T>
            </g>
          </g>
        );
      })()}
      {ds && <Dim x1={cx - wpL / 2} x2={cx + wpL / 2} y1={H / 2 + 40} y2={H / 2 + 40} s={fs} side={1} label={`WPL ${wpL}`} />}
      <Dim x1={len - 30} x2={len - 30} y1={pT} y2={pB} s={fs} side={1} k="H" label={`H ${Math.round(pB - pT)}`} />
      {wg.rows > 1 && <Dim x1={-140} x2={-140} y1={ys[0]} y2={ys[ys.length - 1]} s={fs} k="g rows" label={`g ${wg.rows - 1}@${wg.gauge}`} />}
      <T x={-130} y={H / 2 + 80 + fs * 1.6} s={fs * 0.8} anchor="start">
        GPL t{gT}
        {ds ? ` + WPL t${j.webT} ×2 (二面せん断)` : ' (一面せん断)'} · {wg.rows}×{wg.cols} P{wg.pitch} g{wg.gauge} e{wg.edge}{ds ? '' : ` s${cl}`} · lỗ φ{hole}
      </T>
    </svg>
  );
}
