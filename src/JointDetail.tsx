// 継手詳細図 (SPL / 二面せん断): vẽ đúng tỉ lệ theo kích thước mối nối + chuỗi kích thước kiểu bản vẽ CAD,
// và bộ nhập thông số theo đúng các đường dim của hình.
import type { BoltGroup, Joint } from './model';
import { groupWidth, jointGap, sideLen } from './jointGeom';
import { Num } from './ui';

export interface SecDim {
  code: string;
  h: number;
  b: number;
  tw: number;
  tf: number;
}

const NS = { vectorEffect: 'non-scaling-stroke' as const };
const K = '#111827';
const DIM = '#111827';

/** Các giá trị suy ra từ Joint (dùng chung cho hình và bảng) */
export function spliceGeom(j: Joint, sec: SecDim) {
  const gap = jointGap(j);
  // chiều dài bản nhập sẵn (thư viện) → suy ra へりあき đầu bản để chuỗi dim khớp tổng
  const fit = (g: BoltGroup, L: number | undefined): BoltGroup => (L && L > 0 ? { ...g, edge2: Math.round(((L - gap) / 2 - g.edge - (g.cols - 1) * g.pitch) * 10) / 10 } : g);
  const fg = fit(j.flangeBolts, j.flangeL), wg = fit(j.webBolts, j.webL);
  const flL = 2 * sideLen(fg) + gap;
  const wL = 2 * sideLen(wg) + gap;
  const wh = j.webH > 0 ? j.webH : Math.max(groupWidth(wg), sec.h - 2 * sec.tf - 40);
  const wi = j.innerW || Math.max(20, Math.round((sec.b - sec.tw) / 2 - 15));
  const g1 = fg.gauge, g2 = fg.gauge2 ?? 0;
  const chidori = g2 > 0 && fg.rows === 2;
  const lines = fg.rows >= 4 && g2 ? [-g1 / 2 - g2, -g1 / 2, g1 / 2, g1 / 2 + g2] : chidori ? [-g1 / 2 - g2, -g1 / 2, g1 / 2, g1 / 2 + g2] : fg.rows === 1 ? [0] : Array.from({ length: fg.rows }, (_, k) => -((fg.rows - 1) * g1) / 2 + k * g1);
  const eV = (wh - (wg.rows - 1) * wg.gauge) / 2;
  return { gap, fg, wg, flL, wL, wh, wi, lines, chidori, eV };
}

/** x các bulông 1 nhóm, 2 bên mối nối */
const sideXs = (g: BoltGroup, gap: number, sd: number) => Array.from({ length: g.cols }, (_, c) => sd * (gap / 2 + g.edge + c * g.pitch));
const chainLabel = (g: BoltGroup, mirror: boolean) => {
  const e1 = g.edge, e2 = g.edge2 ?? g.edge;
  const mid = g.cols > 1 ? (g.cols > 2 ? `${g.pitch}×${g.cols - 1}` : `${g.pitch}`) : '';
  const parts = mirror ? [e1, mid, e2] : [e2, mid, e1];
  return parts.filter((x) => x !== '').join('·');
};
const r0 = (v: number) => Math.round(v * 10) / 10;

/** Đường kích thước ngang tại y, các điểm xs; nhãn cho từng đoạn (null = không ghi) */
function HChain({ xs, y, from, labels, fs }: { xs: number[]; y: number; from: number; labels: (string | null)[]; fs: number }) {
  const t = fs * 0.3;
  return (
    <g>
      <line x1={xs[0]} x2={xs[xs.length - 1]} y1={y} y2={y} stroke={DIM} strokeWidth={0.7} {...NS} />
      {xs.map((x, i) => (
        <g key={i}>
          <line x1={x} x2={x} y1={from} y2={y + (from < y ? t : -t)} stroke={DIM} strokeWidth={0.4} {...NS} />
          <circle cx={x} cy={y} r={fs * 0.09} fill={DIM} />
        </g>
      ))}
      {labels.map((l, i) =>
        l === null ? null : (
          <text key={i} x={(xs[i] + xs[i + 1]) / 2} y={y - fs * 0.25} fontSize={fs} textAnchor="middle" fill={K}>
            {l}
          </text>
        ),
      )}
    </g>
  );
}
function VChain({ ys, x, from, labels, fs, right }: { ys: number[]; x: number; from: number; labels: (string | null)[]; fs: number; right?: boolean }) {
  const t = fs * 0.3;
  return (
    <g>
      <line y1={ys[0]} y2={ys[ys.length - 1]} x1={x} x2={x} stroke={DIM} strokeWidth={0.7} {...NS} />
      {ys.map((y, i) => (
        <g key={i}>
          <line y1={y} y2={y} x1={from} x2={x + (from < x ? t : -t)} stroke={DIM} strokeWidth={0.4} {...NS} />
          <circle cx={x} cy={y} r={fs * 0.09} fill={DIM} />
        </g>
      ))}
      {labels.map((l, i) => {
        if (l === null) return null;
        const cy = (ys[i] + ys[i + 1]) / 2;
        const tx = right ? x + fs * 0.95 : x - fs * 0.3;
        return (
          <text key={i} x={tx} y={cy} fontSize={fs} textAnchor="middle" fill={K} transform={`rotate(-90 ${tx} ${cy})`}>
            {l}
          </text>
        );
      })}
    </g>
  );
}
const Bolt = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill="#fff" stroke={K} strokeWidth={0.9} {...NS} />
    <line x1={x - r * 1.4} x2={x + r * 1.4} y1={y} y2={y} stroke={K} strokeWidth={0.5} {...NS} />
    <line y1={y - r * 1.4} y2={y + r * 1.4} x1={x} x2={x} stroke={K} strokeWidth={0.5} {...NS} />
  </g>
);

/** Hình 継手詳細 (SPL: cánh + bụng; DS: chỉ bụng) */
export function JointDetail({ j, sec }: { j: Joint; sec: SecDim }) {
  const G = spliceGeom(j, sec);
  const { gap, fg, wg, flL, wL, wh, lines, chidori, eV } = G;
  const spl = j.type === 'SPL';
  const H = sec.h, B = sec.b, tf = Math.max(sec.tf, 4);
  const Lmax = Math.max(spl ? flL : 0, wL);
  const X = Lmax / 2 + Math.max(60, Lmax * 0.18); // nửa chiều dài thanh vẽ
  const fs = Math.max(10, (2 * X) / 26);
  const hole = j.bolt.dia + 2;
  const flT = spl ? j.flangeT : 0, inT = spl ? j.innerT : 0;
  // ---- Hình A: mặt bằng cánh (chỉ SPL), tâm (0, 0)
  const yA = 0;
  const fxL = sideXs(fg, gap, -1).reverse(), fxR = sideXs(fg, gap, 1);
  const planHoles: [number, number][] = [];
  if (chidori)
    for (const sd of [-1, 1])
      sideXs(fg, gap, sd).forEach((x, c) => {
        const inner = c % 2 === 0;
        for (const s2 of [-1, 1]) planHoles.push([x, yA + s2 * (inner ? fg.gauge / 2 : fg.gauge / 2 + (fg.gauge2 ?? 0))]);
      });
  else for (const x of [...fxL, ...fxR]) for (const y of lines) planHoles.push([x, yA + y]);
  const aTop = yA - B / 2 - fs * 4.2;
  // ---- Hình B: mặt đứng bụng
  const yB = spl ? yA + B / 2 + fs * 3 + H / 2 + flT : 0;
  const bTop = spl ? aTop : yB - H / 2 - flT - fs * 2;
  const wxL = sideXs(wg, gap, -1).reverse(), wxR = sideXs(wg, gap, 1);
  const wys = Array.from({ length: wg.rows }, (_, k) => yB - ((wg.rows - 1) * wg.gauge) / 2 + k * wg.gauge);
  const bBot = yB + H / 2 + flT + fs * 5.9;
  const left = -X - fs * 4.2, right = X + fs * 4.6;
  const beamPart = (x0: number, x1: number, key: string) => (
    <g key={key}>
      <rect x={x0} y={yB - H / 2} width={x1 - x0} height={H} fill="#f3f4f6" stroke={K} strokeWidth={0.9} {...NS} />
      <line x1={x0} x2={x1} y1={yB - H / 2 + tf} y2={yB - H / 2 + tf} stroke={K} strokeWidth={0.7} {...NS} />
      <line x1={x0} x2={x1} y1={yB + H / 2 - tf} y2={yB + H / 2 - tf} stroke={K} strokeWidth={0.7} {...NS} />
    </g>
  );
  const chainH = (g: BoltGroup, L: number) => {
    const xsL = sideXs(g, gap, -1).reverse(), xsR = sideXs(g, gap, 1);
    return { xs: [-L / 2, ...xsL, -gap / 2, gap / 2, ...xsR, L / 2], n: g.cols };
  };
  const fc = chainH(fg, flL), wc = chainH(wg, wL);
  // nhãn gộp: chỉ ghi ở đoạn giữa nhóm mỗi bên + すきま
  const groupLabels = (g: BoltGroup, xs: number[]) => {
    const labs: (string | null)[] = xs.slice(0, -1).map(() => null);
    return { labs, sideL: chainLabel(g, false), sideR: chainLabel(g, true), xs };
  };
  const fl = groupLabels(fg, fc.xs), wl = groupLabels(wg, wc.xs);
  // lớp làm nổi từng đoạn dim theo thông số đang nhập (data-dk)
  const hiLine = (x1: number, y1: number, x2: number, y2: number, k: string, key: string) => (
    <g key={key} className="dim" data-dk={k}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={0.7} {...NS} />
    </g>
  );
  const hiH = (xs: number[], y: number, p: string) => {
    const m = xs.length / 2; // xs[m-1] = -gap/2, xs[m] = gap/2
    return xs.slice(0, -1).map((x, i) => {
      const k = i === m - 1 ? 's' : i === 0 || i === xs.length - 2 ? p + 'e2' : i === m - 2 || i === m ? p + 'e' : p + 'P ' + p + 'n';
      return hiLine(x, y, xs[i + 1], y, k, p + 'h' + i);
    });
  };
  const hiV = (ys: number[], x: number, kEnd: string, kMid: string, p: string) => ys.slice(0, -1).map((y, i) => hiLine(x, y, x, ys[i + 1], i === 0 || i === ys.length - 2 ? kEnd : kMid, p + 'v' + i));
  const yDimA = aTop + fs * 2.6, yTotA = aTop + fs * 1.2;
  const yDimB = yB + H / 2 + flT + fs * 1.6, yTotB = yDimB + fs * 1.5;
  return (
    <svg className="joint-detail" viewBox={`${left} ${bTop - fs * 0.6} ${right - left} ${bBot - bTop + fs * 0.6}`} style={{ background: '#fff' }}>
      {spl && (
        <g>
          {/* thanh 2 bên (cánh) */}
          {[-1, 1].map((sd) => (
            <g key={sd}>
              <line x1={sd * X} x2={sd * gap / 2} y1={yA - B / 2} y2={yA - B / 2} stroke={K} strokeWidth={0.9} {...NS} />
              <line x1={sd * X} x2={sd * gap / 2} y1={yA + B / 2} y2={yA + B / 2} stroke={K} strokeWidth={0.9} {...NS} />
              <line x1={sd * gap / 2} x2={sd * gap / 2} y1={yA - B / 2} y2={yA + B / 2} stroke={K} strokeWidth={0.9} {...NS} />
              <line x1={sd * X} x2={sd * gap / 2} y1={yA - sec.tw / 2} y2={yA - sec.tw / 2} stroke={K} strokeWidth={0.5} strokeDasharray="5 3" {...NS} />
              <line x1={sd * X} x2={sd * gap / 2} y1={yA + sec.tw / 2} y2={yA + sec.tw / 2} stroke={K} strokeWidth={0.5} strokeDasharray="5 3" {...NS} />
            </g>
          ))}
          <rect x={-flL / 2} y={yA - B / 2} width={flL} height={B} fill="none" stroke={K} strokeWidth={1.3} {...NS} />
          <line x1={-X} x2={X} y1={yA} y2={yA} stroke={K} strokeWidth={0.4} strokeDasharray="14 3 2 3" {...NS} />
          {planHoles.map(([x, y], i) => (
            <Bolt key={i} x={x} y={y} r={hole / 2} />
          ))}
          {/* chuỗi kích thước dọc trục */}
          <HChain xs={fl.xs} y={yDimA} from={yA - B / 2 - fs * 0.3} labels={fl.labs} fs={fs} />
          {hiH(fl.xs, yDimA, 'f')}
          <text x={(fl.xs[0] - gap / 2) / 2} y={yDimA - fs * 0.25} fontSize={fs} textAnchor="middle" fill={K}>{fl.sideL}</text>
          <text x={(fl.xs[fl.xs.length - 1] + gap / 2) / 2} y={yDimA - fs * 0.25} fontSize={fs} textAnchor="middle" fill={K}>{fl.sideR}</text>
          <text x={0} y={yDimA - fs * 0.25} fontSize={fs * 0.85} textAnchor="middle" fill={K}>{gap}</text>
          <HChain xs={[-flL / 2, flL / 2]} y={yTotA} from={yDimA - fs * 0.2} labels={[`${r0(flL)}`]} fs={fs} />
          {/* chuỗi kích thước ngang cánh */}
          {(() => {
            const ys = [yA - B / 2, ...(chidori ? [] : lines.map((l) => yA + l)), ...(chidori ? [yA - fg.gauge / 2 - (fg.gauge2 ?? 0), yA - fg.gauge / 2, yA + fg.gauge / 2, yA + fg.gauge / 2 + (fg.gauge2 ?? 0)] : []), yA + B / 2].sort((a, b) => a - b);
            const labs = ys.slice(0, -1).map((y, i) => `${r0(ys[i + 1] - y)}`);
            return (
              <>
                <VChain ys={ys} x={-X - fs * 1.2} from={-X + fs * 0.2} labels={labs} fs={fs * 0.9} />
                {hiV(ys, -X - fs * 1.2, 'fge', 'fg frows fg2', 'f')}
                <VChain ys={[yA - B / 2, yA + B / 2]} x={-X - fs * 2.8} from={-X - fs * 1.4} labels={[`${B}`]} fs={fs} />
              </>
            );
          })()}
        </g>
      )}
      {/* ---- mặt đứng bụng ---- */}
      {beamPart(-X, -gap / 2, 'l')}
      {beamPart(gap / 2, X, 'r')}
      {spl && (
        <>
          <rect data-dk="fT" x={-flL / 2} y={yB - H / 2 - flT} width={flL} height={flT} fill="#fff" stroke={K} strokeWidth={1.2} {...NS} />
          <rect data-dk="fT" x={-flL / 2} y={yB + H / 2} width={flL} height={flT} fill="#fff" stroke={K} strokeWidth={1.2} {...NS} />
          {inT > 0 && (
            <>
              <rect data-dk="iT iW" x={-flL / 2} y={yB - H / 2 + tf} width={flL} height={inT} fill="#fff" stroke={K} strokeWidth={1} {...NS} />
              <rect data-dk="iT iW" x={-flL / 2} y={yB + H / 2 - tf - inT} width={flL} height={inT} fill="#fff" stroke={K} strokeWidth={1} {...NS} />
            </>
          )}
          {[...fxL, ...fxR].map((x, i) => (
            <g key={i}>
              <line x1={x} x2={x} y1={yB - H / 2 - flT - fs * 0.4} y2={yB - H / 2 + tf + inT + fs * 0.4} stroke={K} strokeWidth={1.1} {...NS} />
              <line x1={x} x2={x} y1={yB + H / 2 - tf - inT - fs * 0.4} y2={yB + H / 2 + flT + fs * 0.4} stroke={K} strokeWidth={1.1} {...NS} />
            </g>
          ))}
        </>
      )}
      <rect data-dk="wT" x={-wL / 2} y={yB - wh / 2} width={wL} height={wh} fill="#fff" fillOpacity={0.9} stroke={K} strokeWidth={1.3} {...NS} />
      <line x1={-gap / 2} x2={-gap / 2} y1={yB - wh / 2} y2={yB + wh / 2} stroke={K} strokeWidth={0.5} strokeDasharray="4 3" {...NS} />
      <line x1={gap / 2} x2={gap / 2} y1={yB - wh / 2} y2={yB + wh / 2} stroke={K} strokeWidth={0.5} strokeDasharray="4 3" {...NS} />
      {[...wxL, ...wxR].map((x) => wys.map((y, k) => <Bolt key={`${x}-${k}`} x={x} y={y} r={hole / 2} />))}
      {/* kích thước đứng bên phải: e · g×n · e và tổng 添板 */}
      {(() => {
        const ys = [yB - wh / 2, ...wys, yB + wh / 2];
        const labs: (string | null)[] = ys.slice(0, -1).map(() => null);
        labs[0] = `${r0(eV)}`;
        labs[labs.length - 1] = `${r0(eV)}`;
        const xr = Math.max(wL / 2, spl ? flL / 2 : 0) + fs * 1.0;
        const midTxt = wg.rows > 2 ? `${wg.gauge}×${wg.rows - 1}` : `${wg.gauge}`;
        return (
          <>
            <VChain ys={ys} x={xr} from={wL / 2 + fs * 0.2} labels={labs} fs={fs * 0.9} right />
            {hiV(ys, xr, 'weV', 'wg wrows', 'w')}
            {wg.rows > 1 && (
              <text x={xr + fs * 0.85} y={yB} fontSize={fs * 0.9} textAnchor="middle" fill={K} transform={`rotate(-90 ${xr + fs * 0.85} ${yB})`}>
                {midTxt}
              </text>
            )}
            <VChain ys={[yB - wh / 2, yB + wh / 2]} x={xr + fs * 2.2} from={xr + fs * 0.3} labels={[`${r0(wh)}`]} fs={fs} right />
          </>
        );
      })()}
      {/* kích thước ngang bụng (dưới) */}
      <HChain xs={wl.xs} y={yDimB} from={yB + wh / 2 + fs * 0.3} labels={wl.labs} fs={fs} />
      {hiH(wl.xs, yDimB, 'w')}
      <text x={(wl.xs[0] - gap / 2) / 2} y={yDimB + fs * 1.05} fontSize={fs} textAnchor="middle" fill={K}>{wl.sideL}</text>
      <text x={(wl.xs[wl.xs.length - 1] + gap / 2) / 2} y={yDimB + fs * 1.05} fontSize={fs} textAnchor="middle" fill={K}>{wl.sideR}</text>
      <text x={0} y={yDimB + fs * 1.05} fontSize={fs * 0.85} textAnchor="middle" fill={K}>{gap}</text>
      <HChain xs={[-wL / 2, wL / 2]} y={yTotB + fs * 0.9} from={yDimB + fs * 0.2} labels={[null]} fs={fs} />
      <text x={0} y={yTotB + fs * 2.05} fontSize={fs} textAnchor="middle" fill={K}>{r0(wL)}</text>
      {/* H bên trái */}
      <VChain ys={[yB - H / 2, yB + H / 2]} x={-X - fs * 1.2} from={-X + fs * 0.2} labels={[`${H}`]} fs={fs * 0.9} />
    </svg>
  );
}

/** Bảng 継手 (như bản vẽ 継手詳細図) */
export function JointTable({ j, sec }: { j: Joint; sec: SecDim }) {
  const G = spliceGeom(j, sec);
  const bolt = `${j.bolt.grade === 'S10T' ? 'HTB S10T' : j.bolt.grade}`;
  const spl = j.type === 'SPL';
  return (
    <table className="jd-table">
      <tbody>
        <tr>
          <th>記号</th>
          <td colSpan={2}>{j.name}</td>
        </tr>
        <tr>
          <th>鉄骨</th>
          <td colSpan={2}>{sec.code.replace(/x/g, ' × ').replace('H-', 'H - ')}</td>
        </tr>
        {spl && (
          <>
            <tr>
              <th rowSpan={j.innerT > 0 ? 3 : 2}>フランジ</th>
              <td>外添板</td>
              <td>PL-{j.flangeT} × {sec.b} × {r0(G.flL)}</td>
            </tr>
            {j.innerT > 0 && (
              <tr>
                <td>内添板</td>
                <td>PL-{j.innerT} × {G.wi} × {r0(G.flL)}</td>
              </tr>
            )}
            <tr>
              <td>ボルト</td>
              <td>
                {bolt} {G.fg.rows * G.fg.cols}-M{j.bolt.dia}
              </td>
            </tr>
          </>
        )}
        <tr>
          <th rowSpan={2}>ウェブ</th>
          <td>添板</td>
          <td>PL-{j.webT} × {r0(G.wh)} × {r0(G.wL)}</td>
        </tr>
        <tr>
          <td>ボルト</td>
          <td>
            {bolt} {G.wg.rows * G.wg.cols}-M{j.bolt.dia}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

/** Nhập thông số theo đúng các đường dim của hình (mỗi ô một thông số, không phép tính, không ràng buộc) */
export function JointDimEditor({ j, sec, upd }: { j: Joint; sec: SecDim; upd: (fn: (x: Joint) => void) => void }) {
  const G = spliceGeom(j, sec);
  const fg = G.fg, wg = G.wg;
  const spl = j.type === 'SPL';
  const n = (k: string, tag: string, v: number, on: (v: number) => void, min = 0, step = 5) => (
    <label className="dc-in" data-dim={k}>
      <span className="dc-tag">{tag}</span>
      <Num value={r0(v)} min={min} step={step} onChange={on} />
    </label>
  );
  // giữ nguyên các thông số khác khi sửa 1 ô: chốt edge2 hiện tại rồi bỏ chiều dài bản cố định
  const setF = (fn: (g: BoltGroup) => void) => upd((x) => { x.flangeBolts.edge2 = G.fg.edge2 ?? G.fg.edge; fn(x.flangeBolts); x.flangeL = 0; });
  const setW = (fn: (g: BoltGroup) => void) => upd((x) => { x.webBolts.edge2 = G.wg.edge2 ?? G.wg.edge; fn(x.webBolts); x.webL = 0; });
  const along = (p: 'f' | 'w', g: BoltGroup, set: (fn: (g: BoltGroup) => void) => void) => (
    <div className="dc-row">
      {n(p + 'e2', 'e đầu bản', g.edge2 ?? g.edge, (v) => set((x) => (x.edge2 = v)))}
      {n(p + 'P', 'P', g.pitch, (v) => set((x) => (x.pitch = v)))}
      {n(p + 'n', 'số bulông/bên', g.cols, (v) => set((x) => (x.cols = Math.max(1, v))), 1, 1)}
      {n(p + 'e', 'e mối nối', g.edge, (v) => set((x) => (x.edge = v)))}
      {n('s', 'すきま', G.gap, (v) => upd((x) => { x.flangeBolts.edge2 = G.fg.edge2 ?? G.fg.edge; x.webBolts.edge2 = G.wg.edge2 ?? G.wg.edge; x.gap = v; x.flangeL = 0; x.webL = 0; }), 0, 1)}
    </div>
  );
  const fe = (sec.b - (fg.rows - 1) * fg.gauge - (fg.rows >= 4 ? 2 * (fg.gauge2 ?? 0) : 0)) / 2;
  // ウェブ đứng: luôn chốt chiều cao 添板 = 2e + g×(hàng−1) để e giữ đúng như nhập
  const setV = (e: number, g: number, rows: number) => upd((x) => { x.webBolts.gauge = g; x.webBolts.rows = Math.max(1, rows); x.webH = r0(2 * e + (x.webBolts.rows - 1) * g); });
  return (
    <div className="jd-editor">
      {spl && (
        <>
          <div className="field-label">フランジ · dọc trục</div>
          {along('f', fg, setF)}
          <div className="field-label">フランジ · ngang</div>
          <div className="dc-row">
            {n('fge', 'e mép', fe, (v) => setF((x) => (x.gauge = Math.max(0, sec.b - 2 * v - (x.rows >= 4 ? 2 * (x.gauge2 ?? 0) : 0)) / Math.max(1, x.rows - 1))))}
            {n('fg', 'g', fg.rows === 1 ? 0 : fg.gauge, (v) => setF((x) => (x.gauge = v)))}
            {n('frows', 'số hàng', fg.rows, (v) => setF((x) => (x.rows = Math.max(1, v))), 1, 1)}
            {n('fg2', 'g2', fg.gauge2 ?? 0, (v) => setF((x) => (x.gauge2 = v)))}
          </div>
          <div className="field-label">添板 cánh</div>
          <div className="dc-row">
            {n('fT', '外 t', j.flangeT, (v) => upd((x) => (x.flangeT = v)), 1, 1)}
            {n('iT', '内 t', j.innerT, (v) => upd((x) => (x.innerT = v)), 0, 1)}
            {n('iW', '内 rộng', G.wi, (v) => upd((x) => (x.innerW = v)), 10, 5)}
          </div>
        </>
      )}
      <div className="field-label">ウェブ · đứng</div>
      <div className="dc-row">
        {n('weV', 'e trên/dưới', G.eV, (v) => setV(v, wg.gauge, wg.rows))}
        {n('wg', 'g', wg.gauge, (v) => setV(G.eV, v, wg.rows))}
        {n('wrows', 'số hàng', wg.rows, (v) => setV(G.eV, wg.gauge, v), 1, 1)}
      </div>
      <div className="field-label">ウェブ · ngang</div>
      {along('w', wg, setW)}
      <div className="dc-row">
        {n('wT', '添板 t', j.webT, (v) => upd((x) => (x.webT = v)), 1, 1)}
      </div>
    </div>
  );
}
