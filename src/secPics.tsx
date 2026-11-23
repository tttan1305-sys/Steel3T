// Hình minh họa master 母屋 / 胴縁: tiết diện cây, ピース (支持 / 接続 / コーナー), 部品 – vẽ theo thông số
import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

/** dòng đang nhập (key field) → tô nổi bật phần tương ứng trên hình */
export const HlCtx = createContext('');
const hlOn = (cur: string, f?: string) => !!f && !!cur && f.split(' ').includes(cur);
/** nhóm hình gắn với 1 / nhiều field (cách nhau bởi dấu cách) */
export function Hl({ f, children }: { f: string; children: ReactNode }) {
  const cur = useContext(HlCtx);
  return <g className={hlOn(cur, f) ? 'pic-hl' : undefined}>{children}</g>;
}
import type { FieldVal } from './moya';

type V = Record<string, FieldVal>;
const nums = (s: FieldVal) => String(s ?? '').split(/[x×*ｘ]/i).map((t) => parseFloat(t)).filter((n) => !isNaN(n));
const N = (v: FieldVal | undefined, d = 0) => (v === '' || v == null || isNaN(Number(v)) ? d : Number(v));
const has = (v: FieldVal, s: string) => String(v ?? '').includes(s);
const STEEL = { fill: '#cbd5e1', stroke: '#0f172a' };
const PIECE = { fill: '#fde68a', stroke: '#92400e' };

/** Bảng thông số không có kích thước trên hình: mỗi dòng tô nổi bật khi đang nhập field tương ứng */
export function InfoBox({ v, rows, title = 'Thông số khác' }: { v: V; rows: [string, string][]; title?: string }) {
  const list = rows.filter(([k]) => v[k] !== undefined && v[k] !== '');
  if (!list.length) return null;
  const lh = 15, W = 260;
  return (
    <svg className="info-box" viewBox={`0 0 ${W} ${list.length * lh + 22}`} preserveAspectRatio="xMinYMin meet">
      <text x={4} y={12} fontSize={10} fontWeight={700} fill="#334155">{title}</text>
      {list.map(([k, label], i) => (
        <Hl key={k} f={k}>
          <rect x={0} y={16 + i * lh} width={W} height={lh - 1} fill="#f8fafc" stroke="#e2e8f0" strokeWidth={0.5} />
          <text x={4} y={16 + i * lh + 11} fontSize={10} fill="#475569">{label}</text>
          <text x={130} y={16 + i * lh + 11} fontSize={10} fill="#0f172a">{String(v[k]).replace(/^\d+-/, '')}</text>
        </Hl>
      ))}
    </svg>
  );
}

/** đường kích thước ngang / dọc có chữ */
function Dim(props: { x1: number; y1: number; x2: number; y2: number; t: string | number; off?: number; k?: number; f?: string }) {
  return props.f ? <Hl f={props.f}><DimRaw {...props} /></Hl> : <DimRaw {...props} />;
}
function DimRaw({ x1, y1, x2, y2, t, off = 0, k = 1 }: { x1: number; y1: number; x2: number; y2: number; t: string | number; off?: number; k?: number }) {
  const h = Math.abs(y2 - y1) < 0.01;
  const fs = 10 * k;
  const ox = h ? 0 : off, oy = h ? off : 0;
  const a = [x1 + ox, y1 + oy], b = [x2 + ox, y2 + oy];
  return (
    <g stroke="#2563eb" fill="#2563eb" strokeWidth={0.8 * k}>
      <line x1={x1} y1={y1} x2={a[0]} y2={a[1]} strokeDasharray={`${2 * k} ${2 * k}`} />
      <line x1={x2} y1={y2} x2={b[0]} y2={b[1]} strokeDasharray={`${2 * k} ${2 * k}`} />
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />
      <circle cx={a[0]} cy={a[1]} r={1.5 * k} /><circle cx={b[0]} cy={b[1]} r={1.5 * k} />
      <text stroke="none" fontSize={fs} textAnchor="middle" x={(a[0] + b[0]) / 2 + (h ? 0 : -fs * 0.4 * Math.sign(off || -1) * 1.6)} y={(a[1] + b[1]) / 2 + (h ? (off >= 0 ? fs * 1.1 : -fs * 0.35) : fs * 0.35)}>{t}</text>
    </g>
  );
}

/** khung SVG tự co theo hộp (mm) */
function Frame({ x, y, w, h, children, title }: { x: number; y: number; w: number; h: number; children: (k: number) => ReactNode; title?: string }) {
  const pad = Math.max(w, h) * 0.28;
  const k = Math.max(w, h) / 170;
  return (
    <svg viewBox={`${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}`} preserveAspectRatio="xMidYMid meet">
      {title && <text x={x - pad * 0.9} y={y - pad * 0.55} fontSize={11 * k} fill="#334155" fontWeight={700}>{title}</text>}
      {children(k)}
    </svg>
  );
}

// ================= Tiết diện cây =================
/** đa giác tiết diện (gốc tại tâm, y xuống) */
function shape(type: string, h: number, b: number, c: number, t: number, tf = t): string {
  const P = (pts: number[][]) => pts.map((q) => q.join(',')).join(' ');
  const H = h / 2;
  if (type === 'C') {
    const x0 = -b / 2, x1 = b / 2;
    if (!c) return P([[x0, -H], [x1, -H], [x1, -H + tf], [x0 + t, -H + tf], [x0 + t, H - tf], [x1, H - tf], [x1, H], [x0, H]]);
    return P([[x0, -H], [x1, -H], [x1, -H + c], [x1 - t, -H + c], [x1 - t, -H + t], [x0 + t, -H + t], [x0 + t, H - t], [x1 - t, H - t], [x1 - t, H - c], [x1, H - c], [x1, H], [x0, H]]);
  }
  if (type === 'I') return P([[-b / 2, -H], [b / 2, -H], [b / 2, -H + tf], [t / 2, -H + tf], [t / 2, H - tf], [b / 2, H - tf], [b / 2, H], [-b / 2, H], [-b / 2, H - tf], [-t / 2, H - tf], [-t / 2, -H + tf], [-b / 2, -H + tf]]);
  if (type === 'L') return P([[0, 0], [t, 0], [t, h - t], [b, h - t], [b, h], [0, h]].map(([x, y]) => [x - b / 3, y - h / 2]));
  return '';
}
const refN = (x: FieldVal) => { const t = String(x ?? ''); return !t || t === '<なし>' ? 'なし' : t; };
export function memberType(v: V): 'C' | 'Box' | 'I' {
  const m = String(v.mat ?? '');
  return m.includes('角形') || m.includes('コラム') ? 'Box' : m.includes('H形') ? 'I' : 'C';
}
export function SectionPic({ v }: { v: V }) {
  const type = memberType(v);
  const n = nums(v.size);
  const [h = 100, b = 50, c3 = 20, t4 = 2.3] = n;
  const isBox = type === 'Box', isI = type === 'I';
  const c = isBox || isI ? 0 : c3, t = isBox ? c3 || 2.3 : isI ? c3 || 6 : t4, tf = isI ? t4 || 9 : t;
  const combo = String(v.combo ?? '1-[');
  const gap = N(v.comboGap, 0);
  const two = type === 'C' && (combo.startsWith('2') || combo.startsWith('3'));
  const off = (b + gap) / 2;
  const W = two ? 2 * b + gap : b;
  const pos = String(v.piecePos ?? '');
  return (
    <div className="pic-col">
    <Frame x={-W / 2} y={-h / 2} w={W} h={h} title={`${String(v.mat ?? '').replace(/^\d+-/, '')} ${v.size ?? ''}`}>
      {(k) => (
        <>
          <Hl f="mat size grade combo">{isBox ? (
            <path d={`M${-b / 2},${-h / 2} h${b} v${h} h${-b} Z M${-b / 2 + t},${-h / 2 + t} v${h - 2 * t} h${b - 2 * t} v${-(h - 2 * t)} Z`} fillRule="evenodd" {...STEEL} strokeWidth={k} />
          ) : two ? (
            [-1, 1].map((sg) => {
              // ][: lưng quay ra ngoài; []: lưng quay vào trong
              const face = combo.startsWith('2') ? sg : -sg;
              return <polygon key={sg} points={shape('C', h, b, c, t)} transform={`translate(${sg * off},0) scale(${face},1)`} {...STEEL} strokeWidth={k} />;
            })
          ) : (
            <polygon points={shape(type, h, b, c, t, tf)} {...STEEL} strokeWidth={k} />
          )}</Hl>
          <Dim f="size" x1={-W / 2} y1={-h / 2} x2={-W / 2} y2={h / 2} off={-14 * k} t={`H ${h}`} k={k} />
          <Dim f="size" x1={two ? off - b / 2 : -b / 2} y1={h / 2} x2={two ? off + b / 2 : b / 2} y2={h / 2} off={14 * k} t={`B ${b}`} k={k} />
          {type === 'C' && c > 0 && <Dim f="size" x1={(two ? off : 0) + b / 2} y1={-h / 2} x2={(two ? off : 0) + b / 2} y2={-h / 2 + c} off={12 * k} t={`C ${c}`} k={k} />}
          {two && <Dim f="comboGap combo filler" x1={-gap / 2} y1={-h / 2} x2={gap / 2} y2={-h / 2} off={-12 * k} t={`すきま ${gap}`} k={k} />}
          <Hl f="stdLen"><text x={-W / 2} y={h / 2 + 34 * k} fontSize={9 * k} fill="#334155">定尺 {String(v.stdLen ?? '')} m</text></Hl>
          <Hl f="support connect corner endPart reinforce"><text x={-W / 2} y={h / 2 + 46 * k} fontSize={8 * k} fill="#334155">支持 {refN(v.support)} · 接続 {refN(v.connect)} · コーナー {refN(v.corner)}</text></Hl>
          <text x={W / 2 + 6 * k} y={h / 2 - 4 * k} fontSize={10 * k} fill="#0f172a">t {t}{isI ? ` / ${tf}` : ''}</text>
          {pos && type === 'C' && !two && (
            <Hl f="piecePos">
              {/* vị trí gắn ピース: 背 = phía bụng, 腹 = phía mở リップ */}
              {(pos.includes('背') || pos.includes('両側')) && <rect x={-b / 2 - 6 * k} y={-h * 0.3} width={4 * k} height={h * 0.6} {...PIECE} strokeWidth={k * 0.6} />}
              {(pos.includes('腹') || pos.includes('両側')) && <rect x={b / 2 + 2 * k} y={-h * 0.3} width={4 * k} height={h * 0.6} {...PIECE} strokeWidth={k * 0.6} />}
              {pos.includes('中心') && <line x1={0} y1={-h / 2 - 8 * k} x2={0} y2={h / 2 + 8 * k} stroke="#b45309" strokeDasharray={`${4 * k} ${2 * k}`} />}
              <text x={-W / 2} y={-h / 2 - 10 * k} fontSize={9 * k} fill="#92400e">ピース: {pos.replace(/^\d+-/, '')}</text>
            </Hl>
          )}
        </>
      )}
    </Frame>
    <InfoBox v={v} rows={[['grade', '材質'], ['combo', '鋼材組み合わせ'], ['filler', 'フィラー'], ['endPart', '端部部品'], ['reinforce', '補強部品'], ['support', '支持ピース'], ['connect', '接続ピース'], ['corner', 'コーナーピース']]} />
    </div>
  );
}

// ================= ピース =================
function bolts(x0: number, y0: number, nx: number, ny: number, px: number, py: number, d: number, k: number) {
  const out: ReactNode[] = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push(<circle key={`${x0}-${i}-${j}`} cx={x0 + i * px} cy={y0 + j * py} r={Math.max(d / 2 + 1, 2 * k)} fill="#fff" stroke="#b91c1c" strokeWidth={k} />);
  return out;
}
export function PiecePic({ v }: { v: V }) {
  const isL = has(v.mat, 'L形鋼');
  const corner = has(v.type, 'コーナー'), conn = has(v.type, '接続');
  const n = nums(v.size);
  const [A = 100, B = 75, t = 7] = isL ? n : [N(v.rise, 0) + 100, 0, n[0] || 6];
  const L = N(v.len, 100) || 100;
  const boltOn = has(v.webConn, 'ボルト');
  const d = N(v.boltDia, 12);
  const ev = N(v.edgeV, 25), eL = N(v.edgeL, 25), eR = N(v.edgeR, 25);
  const rows = Math.max(1, N(v.rows, 1));
  const pv = rows > 1 ? Math.max(30, (A - 2 * ev) / (rows - 1)) : 0;
  // mặt trước (thấy bulông): rộng L, cao A
  const H = A;
  const shapeTop = String(v.plShape ?? '').includes('7');
  const sc = has(v.scKind, 'なし') ? 0 : N(v.scR, 0);
  const lip = has(v.lipStyle, 'あり');
  const front = (k: number) => {
    const out: ReactNode[] = [];
    if (!isL && shapeTop) out.push(<Hl key="pl" f="type gen mat grade plShape plLen"><polygon points={`0,0 ${L - H * 0.3},0 ${L},${H * 0.3} ${L},${H} 0,${H}`} {...PIECE} strokeWidth={k} /></Hl>);
    else out.push(<Hl key="pl" f="type gen mat grade plLen"><rect x={0} y={0} width={L} height={H} {...PIECE} strokeWidth={k} /></Hl>);
    if (!isL && sc > 0) out.push(<Hl key="sc" f="scKind scR"><path d={`M0,${H - sc} A${sc},${sc} 0 0 1 ${sc},${H}`} fill="#fff" stroke={PIECE.stroke} strokeWidth={k} /></Hl>);
    if (isL) out.push(<Hl key="heel" f="size"><line x1={0} y1={H - t} x2={L} y2={H - t} stroke={PIECE.stroke} strokeWidth={k * 0.8} strokeDasharray={`${3 * k} ${2 * k}`} /></Hl>);
    if (boltOn) {
      if (conn) {
        const cl = Math.max(1, N(v.colsL, 1)), cr = Math.max(1, N(v.colsR, 1)), pl = N(v.pitchL, 50), pr = N(v.pitchR, 50);
        out.push(<Hl key="bl" f="boltDia boltType rows colsL webConn boltThru drill slot">{bolts(eL, ev, cl, rows, pl, pv, d, k)}</Hl>);
        out.push(<Hl key="br" f="boltDia boltType rows colsR webConn boltThru drill slot">{bolts(L - eR - (cr - 1) * pr, ev, cr, rows, pr, pv, d, k)}</Hl>);
        out.push(<line key="mid" x1={L / 2} y1={-8 * k} x2={L / 2} y2={H + 8 * k} stroke="#64748b" strokeDasharray={`${4 * k} ${3 * k}`} strokeWidth={k} />);
        out.push(<text key="ml" x={L / 4} y={-6 * k} fontSize={9 * k} textAnchor="middle" fill="#334155">左側 胴縁</text>, <text key="mr" x={(3 * L) / 4} y={-6 * k} fontSize={9 * k} textAnchor="middle" fill="#334155">右側 胴縁</text>);
        out.push(<Dim key="pl" f="pitchL" x1={eL} y1={H} x2={eL + (cl - 1) * pl} y2={H} off={12 * k} t={cl > 1 ? pl : ''} k={k} />);
        if (cr > 1) out.push(<Dim key="pr" f="pitchR" x1={L - eR - (cr - 1) * pr} y1={H} x2={L - eR} y2={H} off={12 * k} t={pr} k={k} />);
        out.push(<Dim key="eL" f="edgeL endL" x1={0} y1={H} x2={eL} y2={H} off={26 * k} t={eL} k={k} />);
        out.push(<Dim key="eR" f="edgeR endR" x1={L - eR} y1={H} x2={L} y2={H} off={26 * k} t={eR} k={k} />);
      } else {
        const cols = Math.max(1, N(v.cols, 1)), p = N(v.pitch, 50);
        const x0 = cols > 1 ? eL : (L - (eL - eR)) / 2;
        out.push(<Hl key="bo" f="boltDia boltType rows cols webConn boltThru drill slot hole1">{bolts(x0, ev, cols, rows, p, pv, d, k)}</Hl>);
        if (cols > 1) out.push(<Dim key="p" f="pitch" x1={x0} y1={H} x2={x0 + p} y2={H} off={12 * k} t={p} k={k} />);
        out.push(<Dim key="el" f="edgeL" x1={0} y1={H} x2={x0} y2={H} off={26 * k} t={eL} k={k} />);
        const xe = x0 + (cols - 1) * p;
        out.push(<Dim key="er" f="edgeR" x1={xe} y1={H} x2={L} y2={H} off={26 * k} t={L - xe} k={k} />);
      }
 out.push(<Dim key="ev" f="edgeV" x1={L} y1={0} x2={L} y2={ev} off={12 * k} t={ev} k={k} />);
      if (lip) out.push(<Hl key="lfh" f="lipStyle lipFiller lipFillerL lipFillerR boxStyle"><rect x={eL - 15} y={ev - 15} width={conn ? L - eL - eR + 30 : 30 + Math.max(0, (N(v.cols, 1) - 1) * N(v.pitch, 50))} height={30 + (rows - 1) * pv} fill="none" stroke="#7c3aed" strokeDasharray={`${3 * k} ${2 * k}`} strokeWidth={k} /></Hl>);
    }
    out.push(<Dim key="L" f="len" x1={0} y1={0} x2={L} y2={0} off={-14 * k} t={`長さ ${L}`} k={k} />);
    out.push(<Dim key="H" f="size autoSize rise plRise" x1={0} y1={0} x2={0} y2={H} off={-14 * k} t={isL ? A : H} k={k} />);
    return out;
  };
  // mặt cắt: L A×B×t (hoặc tấm t) + cánh dầm mẹ + C 母屋
  const side = (k: number) => {
    const out: ReactNode[] = [];
    out.push(<Hl key="flg" f="flgConn weld"><rect x={-60} y={H} width={160} height={12} {...STEEL} strokeWidth={k} /><text x={-58} y={H + 24} fontSize={9 * k} fill="#334155">親部材 · {String(v.flgConn ?? '').replace(/^\d+-/, '')}</text></Hl>);
    if (isL) out.push(<Hl key="L" f="mat size"><polygon points={`0,0 ${t},0 ${t},${H - t} ${B},${H - t} ${B},${H} 0,${H}`} {...PIECE} strokeWidth={k} /></Hl>);
    else out.push(<Hl key="P" f="mat size"><rect x={0} y={0} width={t} height={H} {...PIECE} strokeWidth={k} /></Hl>);
    // C 母屋 cạnh ピース (bụng áp vào)
    out.push(<polygon key="C" points={shape('C', H * 0.9, 45, 15, 2.3)} transform={`translate(${-23 - 1},${H * 0.45})`} fill="#e2e8f0" stroke="#475569" strokeWidth={k} />);
    if (boltOn) out.push(<Hl key="b" f="boltPos boltDia webConn"><line x1={-40} y1={ev} x2={t + 14} y2={ev} stroke="#b91c1c" strokeWidth={2.5 * k} /></Hl>);
    if (isL) out.push(<Dim key="B" f="size" x1={0} y1={H} x2={B} y2={H} off={30 * k} t={`B ${B}`} k={k} />);
    out.push(<text key="t" x={t + 4} y={H / 3} fontSize={9 * k} fill="#92400e">t {t}</text>);
    return out;
  };
  return (
    <div className="pic-row">
      <Frame x={0} y={0} w={L} h={H} title={`${corner ? 'コーナー' : conn ? '接続' : '支持'}ピース – mặt trước`}>{front}</Frame>
      <Frame x={-70} y={0} w={180} h={H + 20} title="Mặt cắt">{side}</Frame>
      <InfoBox v={v} rows={[['type', 'ピース種類'], ['gen', '型紙・部品名生成'], ['grade', '材質'], ['gap', 'すきま'], ['autoSize', '自動サイズ調整'], ['angle', '角度ピース化許可'], ['rib', '補強リブ'], ['webConn', '接続(ウェブ)'], ['plFit', 'PL 合わせ位置'], ['plOff', 'PL オフセット'], ['plLimit', 'PL 処理制限'], ['plRiseKind', 'PL 立ち上がり種類'], ['boxStyle', '□形鋼接続ｽﾀｲﾙ'], ['lipStyle', 'リップ側接続'], ['lipFiller', 'リップフィラー'], ['lipFillerL', 'リップフィラー(左)'], ['lipFillerR', 'リップフィラー(右)'], ['boltType', 'ボルト種類'], ['boltThru', 'ボルト貫通'], ['drill', 'ボルトキリ径'], ['slot', '長穴幅'], ['hole1', '第一穴位置'], ['flgConn', '接続(フランジ)'], ['weld', '溶接しろ'], ['backRib', '裏リブ板厚']]} />
    </div>
  );
}

// ================= 部品 =================
export function PartPic({ v }: { v: V }) {
  return (
    <div className="pic-col">
      <PartPicMain v={v} />
      <InfoBox v={v} rows={[['kind', '部品種類'], ['auto', '自動調整'], ['fillerType', 'フィラー種類'], ['pos', 'フィラー位置'], ['mat', '材種'], ['grade', '材質'], ['boltType', 'ボルト種類'], ['stagger', 'ボルト千鳥'], ['tmpl', '型紙出力']]} />
    </div>
  );
}
function PartPicMain({ v }: { v: V }) {
  const t = N(v.size, 6) || 6;
  if (has(v.kind, '塞ぎ')) {
    const w = N(v.plW, 100) || 100;
    return (
      <Frame x={-w / 2} y={-w / 2} w={w} h={w} title="塞ぎ部材 (盲PL) – đầu ống vuông">
        {(k) => (
          <>
            <Hl f="kind mat"><rect x={-w / 2} y={-w / 2} width={w} height={w} {...PIECE} strokeWidth={k} /></Hl>
            <rect x={-w / 2 + 6} y={-w / 2 + 6} width={w - 12} height={w - 12} fill="none" stroke="#475569" strokeDasharray={`${3 * k} ${2 * k}`} strokeWidth={k} />
            <Dim f="plW auto" x1={-w / 2} y1={w / 2} x2={w / 2} y2={w / 2} off={12 * k} t={`プレート幅 ${has(v.auto, '自動') ? 'tự động' : w}`} k={k} />
            <Hl f="size"><text x={w / 2 + 4 * k} y={0} fontSize={10 * k} fill="#92400e">t {t}</text></Hl>
          </>
        )}
      </Frame>
    );
  }
  if (has(v.kind, '腹側')) {
    const w = N(v.w, 40) || 40, l = N(v.l, 100) || 100, inside = has(v.pos, '内'), off = N(v.off, 0);
    // C 100×50×20×2.3 nằm ngang, リップ hướng lên (giống hình mẫu) – フィラー tại mặt リップ
    const H = 100, B = 50, C = 20, T = 2.3;
    const yTop = -B / 2; // mặt リップ
    const fy = inside ? yTop + T : yTop - t;
    return (
      <div className="pic-row">
        <Frame x={-60} y={-45} w={120} h={90} title={`腹側フィラー (${inside ? '内側' : '外側'})`}>
          {(k) => (
            <>
              <polygon points={shape('C', H, B, C, T)} transform="rotate(-90)" {...STEEL} strokeWidth={k} />
              <Hl f="pos size w off kind mat"><rect x={off - w / 2} y={fy} width={w} height={t} fill="#fca5a5" stroke="#b91c1c" strokeWidth={k} /></Hl>
              <Dim f="w" x1={off - w / 2} y1={fy} x2={off + w / 2} y2={fy} off={-12 * k} t={`板幅 ${w}`} k={k} />
              <Hl f="off"><line x1={0} y1={-B / 2 - 26 * k} x2={0} y2={B / 2 + 6 * k} stroke="#64748b" strokeDasharray={`${4 * k} ${2 * k}`} strokeWidth={k * 0.8} /><text x={2 * k} y={B / 2 + 14 * k} fontSize={8 * k} fill="#334155">中心{off ? ` → ずれ ${off}` : ' (mặc định)'}</text></Hl>
              <Hl f="size"><text x={off + w / 2 + 3 * k} y={fy + t} fontSize={9 * k} fill="#b91c1c">t {t}</text></Hl>
              <text x={-58} y={B / 2 + 26 * k} fontSize={8 * k} fill="#475569">{inside ? '内側: lắp giữa 2 リップ, mặt ngoài = mặt trong リップ' : '外側: đặt trên mặt リップ, ピース áp lên フィラー'}</text>
            </>
          )}
        </Frame>
        <Frame x={0} y={0} w={l} h={w} title="Mặt trước">
          {(k) => (<><Hl f="l w size"><rect x={0} y={0} width={l} height={w} fill="#fca5a5" stroke="#b91c1c" strokeWidth={k} /></Hl><Dim f="l" x1={0} y1={w} x2={l} y2={w} off={12 * k} t={`板長さ ${l}`} k={k} /><Dim f="w" x1={l} y1={0} x2={l} y2={w} off={12 * k} t={w} k={k} /></>)}
        </Frame>
      </div>
    );
  }
  // フィラー板 (có bulông)
  const bolt = has(v.fillerType, 'ボルト');
  const rows = Math.max(1, N(v.rows, 1)), cols = Math.max(1, N(v.cols, 2));
  const pv = N(v.pv, 60), ph = N(v.ph, 50), eT = N(v.eTop, 25), eB = N(v.eBot, 25), eS = N(v.eSide, 25);
  const W = 2 * eS + (cols - 1) * ph, H = eT + eB + (rows - 1) * pv;
  const d = N(v.boltDia, 12);
  const stag = has(v.stagger, 'あり');
  return (
    <Frame x={0} y={0} w={W} h={H} title={`フィラー板 PL-${t}`}>
      {(k) => (
        <>
          <Hl f="kind fillerType mat size"><rect x={0} y={0} width={W} height={H} {...PIECE} strokeWidth={k} /></Hl>
          <Hl f="boltType boltDia rows cols stagger fillerType">{(bolt || true) &&
            Array.from({ length: rows }).flatMap((_, j) =>
              Array.from({ length: cols }).map((__, i) => (
                <circle key={`${i}-${j}`} cx={eS + i * ph + (stag && j % 2 ? ph / 2 : 0)} cy={eT + j * pv} r={Math.max(d / 2 + 1, 2 * k)} fill="#fff" stroke="#b91c1c" strokeWidth={k} />
              )),
            )}</Hl>
          <Dim f="cols" x1={0} y1={H} x2={W} y2={H} off={26 * k} t={`W ${W}`} k={k} />
          <Dim f="rows" x1={W} y1={0} x2={W} y2={H} off={26 * k} t={`H ${H}`} k={k} />
          <Dim f="eSide" x1={0} y1={0} x2={eS} y2={0} off={-10 * k} t={eS} k={k} />
          <Dim f="eSide" x1={W - eS} y1={H} x2={W} y2={H} off={12 * k} t={eS} k={k} />
          {cols > 1 && <Dim f="ph" x1={eS} y1={0} x2={eS + ph} y2={0} off={-10 * k} t={ph} k={k} />}
          <Dim f="eTop" x1={0} y1={0} x2={0} y2={eT} off={-12 * k} t={eT} k={k} />
          <Dim f="eBot" x1={W} y1={H - eB} x2={W} y2={H} off={12 * k} t={eB} k={k} />
          {rows > 1 && <Dim f="pv" x1={0} y1={eT} x2={0} y2={eT + pv} off={-12 * k} t={pv} k={k} />}
          <Hl f="boltDia"><text x={eS + 2 * k + Math.max(d / 2 + 1, 2 * k)} y={eT - Math.max(d / 2 + 1, 2 * k) - 2 * k} fontSize={9 * k} fill="#b91c1c">φ{d}</text></Hl>
        </>
      )}
    </Frame>
  );
}

/** 開口 (胴縁): khung cửa với 上 / 下 / 左 / 右 部材 */
export function OpenPic({ v }: { v: V }) {
  return (
    <div className="pic-col">
      <OpenPicMain v={v} />
      <InfoBox v={v} rows={[['kind', '開口種類'], ['thru', '部材通し方向'], ['mount', 'ピース取付け'], ['jOpen', '開口部取合'], ['jThru', '通し部取合'], ['note', '開口表記'], ['shBase', 'シャッター基準'], ['topDir', '上胴縁向き'], ['botDir', '下胴縁向き']]} />
    </div>
  );
}
function OpenPicMain({ v }: { v: V }) {
  const w = N(v.w, 1800) || 1800, h = N(v.h, 1200) || 1200;
  return (
    <Frame x={0} y={0} w={w} h={h} title={String(v.kind ?? '').replace(/^\d+-/, '')}>
      {(k) => (
        <>
          <Hl f="kind"><rect x={0} y={0} width={w} height={h} fill="#e0f2fe" stroke="#0369a1" strokeWidth={k} /></Hl>
          <Hl f="note"><line x1={0} y1={0} x2={w} y2={h} stroke="#93c5fd" strokeWidth={k} /><line x1={w} y1={0} x2={0} y2={h} stroke="#93c5fd" strokeWidth={k} /></Hl>
          <Hl f="mTop topDir thru"><rect x={-40} y={-60} width={w + 80} height={60} {...PIECE} strokeWidth={k} /></Hl>
          <Hl f="mBot botDir thru"><rect x={-40} y={h} width={w + 80} height={60} {...PIECE} strokeWidth={k} /></Hl>
          <Hl f="mLeft thru"><rect x={-60} y={0} width={60} height={h} {...PIECE} strokeWidth={k} /><text x={-70} y={h / 2} fontSize={11 * k} textAnchor="end" fill="#92400e">左 {String(v.mLeft ?? '')}</text></Hl>
          <Hl f="mRight thru"><rect x={w} y={0} width={60} height={h} {...PIECE} strokeWidth={k} /><text x={w + 70} y={h / 2} fontSize={11 * k} fill="#92400e">右 {String(v.mRight ?? '')}</text></Hl>
          <Hl f="gap"><text x={w / 2} y={h / 2} fontSize={11 * k} textAnchor="middle" fill="#0369a1">すきま {String(v.gap ?? 0)}</text></Hl>
          {v.shW !== undefined && <Dim f="shW" x1={w / 2 - N(v.shW, 0) / 2} y1={-60} x2={w / 2 + N(v.shW, 0) / 2} y2={-60} off={-30 * k} t={`シャッター幅 ${N(v.shW, 0)}`} k={k} />}
          <Hl f="mTop topDir"><text x={w / 2} y={-70} fontSize={11 * k} textAnchor="middle" fill="#92400e">上胴縁 {String(v.mTop ?? '')}</text></Hl>
          <Hl f="mBot botDir"><text x={w / 2} y={h + 60 + 14 * k} fontSize={11 * k} textAnchor="middle" fill="#92400e">下胴縁 {String(v.mBot ?? '')}</text></Hl>
          <Dim f="w" x1={0} y1={h} x2={w} y2={h} off={90 + 20 * k} t={`W ${w}`} k={k} />
          <Dim f="h" x1={w} y1={0} x2={w} y2={h} off={140 + 10 * k} t={`H ${h}`} k={k} />
        </>
      )}
    </Frame>
  );
}

/**
 * Hình nhập ピース (支持 / 接続 / コーナー): mặt cắt cây 母屋 / 胴縁 (C), 親部材 phía dưới, ピース theo
 * 合わせ位置 上 / 中 / 下, 取付方向 背 / 腹 (+ フィラー), chân L 外 / 内.
 */
export function PcPic({ mem, pc, filler, align, side, leg, kind }: { mem?: V; pc?: V; filler?: V; align: string; side: string; leg: string; kind: string }) {
  const type = mem ? memberType(mem) : 'C';
  const n = nums(mem?.size ?? '100x50x20x2.3');
  const [h = 100, b = 50, c0 = 20, t0 = 2.3] = n;
  const c = type === 'C' ? c0 : 0, t = type === 'C' ? t0 : c0 || 2.3;
  const isL = has(pc?.mat ?? '4-L形鋼', 'L形鋼');
  const pn = nums(pc?.size ?? (isL ? '100x75x7' : '6'));
  const tp = isL ? pn[2] ?? 7 : pn[0] ?? 6, B = isL ? pn[1] ?? 75 : tp;
  const gap = 40; // khoảng cách đáy cây → mặt 親部材 (minh hoạ)
  const ySurf = h / 2 + gap; // y xuống
  const ev = N(pc?.edgeV, 25), Z = 2 * ev;
  const inner = h / 2 - t;
  // vùng bulông (y xuống: −h/2 = cánh trên)
  const top = align === '上' ? -inner : align === '下' ? inner - Z : -Z / 2;
  const belly = side === '腹';
  const fOut = belly && filler && has(filler.pos, '外');
  const tF = filler ? N(filler.size, 6) || 6 : 0;
  const xF = belly ? b / 2 + (fOut ? tF : 0) : -b / 2;
  const dir = belly ? 1 : -1;
  const inL = leg === '内' && isL;
  const xHeel = inL ? xF + dir * tp : xF;
  const X = inL ? -dir : dir;
  // chân đứng (áp cây) + chân nằm (trên 親部材)
  const legV = `M${xHeel},${ySurf} L${xHeel},${top} L${xHeel + X * tp},${top} L${xHeel + X * tp},${ySurf} Z`;
  const legH = isL ? `M${xHeel},${ySurf} L${xHeel + X * B},${ySurf} L${xHeel + X * B},${ySurf - tp} L${xHeel},${ySurf - tp} Z` : '';
  const W = Math.max(b, B) * 2 + 60;
  return (
    <Frame x={-W / 2} y={-h / 2 - 10} w={W} h={h + gap + 30} title={`${kind} – mặt cắt`}>
      {(k) => (
        <>
          <Hl f="buzai method"><rect x={-W / 2} y={ySurf} width={W} height={10} {...STEEL} strokeWidth={k} /><text x={-W / 2} y={ySurf + 22 * k} fontSize={9 * k} fill="#334155">親部材 (大梁 / 柱)</text></Hl>
          <Hl f="targets method"><polygon points={type === 'C' ? shape('C', h, b, c, t) : `${-b / 2},${-h / 2} ${b / 2},${-h / 2} ${b / 2},${h / 2} ${-b / 2},${h / 2}`} {...STEEL} strokeWidth={k} /></Hl>
          {belly && filler && (
            <Hl f="side piece"><rect x={fOut ? b / 2 : b / 2 - t - tF} y={-N(filler.w, 50) / 2 + N(filler.off, 0)} width={tF} height={N(filler.w, 50)} fill="#fca5a5" stroke="#b91c1c" strokeWidth={k} /></Hl>
          )}
          <Hl f="piece side leg align"><path d={legV + legH} {...PIECE} strokeWidth={k} /></Hl>
          <Hl f="align"><line x1={xHeel - 30 * dir} y1={top + ev} x2={xHeel + 14 * dir} y2={top + ev} stroke="#b91c1c" strokeWidth={2.5 * k} /></Hl>
          <Hl f="align"><text x={-b / 2} y={-h / 2 - 8 * k} fontSize={9 * k} fill="#1d4ed8">合わせ {align} {align === '上' ? '(mép dưới FLG trên)' : align === '下' ? '(mép trên FLG dưới)' : '(tâm cây)'}</text></Hl>
          <Hl f="side"><text x={belly ? b / 2 + 4 : -b / 2 - 70} y={h / 2 + 14 * k} fontSize={9 * k} fill="#92400e">{belly ? '腹 (mặt リップ)' : '背 (mặt bụng)'}</text></Hl>
          <Hl f="leg"><text x={xHeel + X * B * 0.4} y={ySurf - tp - 4 * k} fontSize={8 * k} fill="#92400e">{isL ? `L ${leg}` : 'PL'}</text></Hl>
        </>
      )}
    </Frame>
  );
}
