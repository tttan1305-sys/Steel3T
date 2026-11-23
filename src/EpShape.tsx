// Hình エレクションピース (mối nối giữa 本柱 hàn tại công trường), đúng tỉ lệ theo tiết diện thật:
// 正面 (nhìn thẳng vào mặt cột) · 側面 (nhìn ngang) · 平面 (mặt cắt bằng). Mỗi đường dim có data-dk để tô sáng khi nhập.
import { Joint, Section, epGap, epOf } from './model';
import { Bolt, Dim, NS, T } from './JointShape';
import { epBoltZ, epFaces, epSpots } from './jointGeom';
import { boxCornerR } from './section3d';

/** path SVG hình chữ nhật bo góc, tâm tại gốc */
const rrect = (w: number, h: number, r: number) => {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  return `M${-w / 2 + q} ${-h / 2}h${w - 2 * q}a${q} ${q} 0 0 1 ${q} ${q}v${h - 2 * q}a${q} ${q} 0 0 1 ${-q} ${q}h${-(w - 2 * q)}a${q} ${q} 0 0 1 ${-q} ${-q}v${-(h - 2 * q)}a${q} ${q} 0 0 1 ${q} ${-q}z`;
};

type SecDim = Pick<Section, 'b' | 'h' | 'tw' | 'tf' | 'type'> & { material?: string };

const COL = { fill: '#e2e8f0', stroke: '#475569' };
const PC = { fill: '#fde68a', stroke: '#92400e' }; // ピース
const SP = { fill: '#fdba74', stroke: '#9a3412' }; // 添板
const SD = { fill: '#86efac', stroke: '#166534' }; // 下がり止め
const KP = { fill: '#ef4444', stroke: '#991b1b' }; // カドピタ (裏当て金)

export function EpShape({ j, sec }: { j: Joint; sec: SecDim }) {
  const e = epOf(j);
  const gap = epGap(j);
  const B = sec.b, Hs = sec.h; // bề rộng mặt (theo x) · chiều sâu (theo y)
  const fs = Math.max(B, Hs, 300) / 13;
  const hole = j.bolt.dia + 2;
  const zs = epBoltZ(j);
  const hollow = sec.type === 'Box' || sec.type === 'Pipe';
  const us = epSpots(e.n, e.sp, e.off);
  const sds = hollow && e.sdN > 0 ? epSpots(e.sdN, e.sdSp, e.sdOff) : [];
  const kp = hollow && e.kpOn;
  const HID = { strokeDasharray: '6 3', fill: 'none' };
  const ext = Math.max(e.h + gap / 2, e.spL / 2) + 1.5 * fs; // nửa chiều cao đoạn cột vẽ
  // SVG: y màn hình hướng xuống → z (lên) = −y
  const colPair = (x0: number, w: number) => (
    <>
      <rect x={x0} y={-ext} width={w} height={ext - gap / 2} fill={COL.fill} stroke={COL.stroke} {...NS} />
      <rect x={x0} y={gap / 2} width={w} height={ext - gap / 2} fill={COL.fill} stroke={COL.stroke} {...NS} />
    </>
  );

  // ---------- 正面: nhìn thẳng vào mặt +Y, ngang = dọc mặt cột (x) ----------
  const front = (
    <g>
      {colPair(-B / 2, B)}
      <T x={0} y={-ext + fs} s={fs * 0.7}>cột trên</T>
      <T x={0} y={ext - 0.4 * fs} s={fs * 0.7}>cột dưới</T>
      {/* bên trong cột (nét đứt): カドピタ và 下がり止め ở mặt trong */}
      {kp && <rect data-dk="ekp ekpw ekpu" x={-B / 2 + sec.tw} y={-e.kpUp} width={B - 2 * sec.tw} height={e.kpW} stroke={KP.stroke} {...HID} {...NS} />}
      {sds.map((u, i) => (
        <rect key={`sd${i}`} data-dk="esdn esdw esdh esdz esdsp esdoff" x={u - e.sdW / 2} y={-gap / 2 - e.sdZ - e.sdH} width={e.sdW} height={e.sdH} stroke={SD.stroke} {...HID} {...NS} />
      ))}
      {/* ピース + 添板 nhìn từ đầu */}
      {us.map((u, i) => (
        <g key={`p${i}`}>
          <rect data-dk="et en esp eoff eh" x={u - e.t / 2} y={-gap / 2 - e.h} width={e.t} height={e.h} fill={PC.fill} stroke={PC.stroke} {...NS} />
          <rect data-dk="et en esp eoff eh" x={u - e.t / 2} y={gap / 2} width={e.t} height={e.h} fill={PC.fill} stroke={PC.stroke} {...NS} />
          {[-1, 1].map((s) => (
            <rect key={s} data-dk="est esl" x={s > 0 ? u + e.t / 2 : u - e.t / 2 - e.spT} y={-e.spL / 2} width={e.spT} height={e.spL} fill={SP.fill} stroke={SP.stroke} {...NS} />
          ))}
        </g>
      ))}
      <line x1={-B / 2 - fs} x2={B / 2 + fs} y1={0} y2={0} stroke="#dc2626" strokeWidth={0.8} strokeDasharray="8 4" {...NS} />
      <Dim x1={-B / 2} x2={B / 2} y1={-ext - fs * 0.6} y2={-ext - fs * 0.6} s={fs} label={`mặt cột ${B}`} />
      {us.length > 1 && <Dim x1={us[0]} x2={us[1]} y1={-ext - fs * 2} y2={-ext - fs * 2} s={fs} k="esp" label={`ピース cách ${e.sp}`} />}
      {e.off !== 0 && <Dim x1={0} x2={e.off} y1={ext + fs * 0.8} y2={ext + fs * 0.8} s={fs} side={1} k="eoff" label={`lệch ${e.off}`} />}
      {sds.length > 0 && <Dim x1={sds[0] - e.sdW / 2} x2={sds[0] + e.sdW / 2} y1={-gap / 2 - e.sdZ - e.sdH - fs * 0.5} y2={-gap / 2 - e.sdZ - e.sdH - fs * 0.5} s={fs} k="esdw" label={`下がり止め ${e.sdW}`} />}
      {sds.length > 1 && <Dim x1={sds[0]} x2={sds[1]} y1={ext + fs * 2.2} y2={ext + fs * 2.2} s={fs} side={1} k="esdsp" label={`下がり止め cách ${e.sdSp}`} />}
      <T x={0} y={ext + fs * 3.6} s={fs * 0.8}>正面 (nét đứt: bên trong cột)</T>
    </g>
  );

  // ---------- 側面: ngang = phương nhô ra (mặt cột ở x = 0), cột thể hiện chiều sâu thật ----------
  const xb = e.w - e.spW / 2;
  const side = (
    <g>
      {colPair(-Hs, Hs)}
      {[-1, 1].map((s) => (
        <rect key={s} data-dk="eh ew et" x={0} y={s < 0 ? -gap / 2 - e.h : gap / 2} width={e.w} height={e.h} fill={PC.fill} stroke={PC.stroke} {...NS} />
      ))}
      <rect data-dk="esl esw est" x={e.w - e.spW} y={-e.spL / 2} width={e.spW} height={e.spL} fill={SP.fill} fillOpacity={0.75} stroke={SP.stroke} {...NS} />
      {[-1, 1].flatMap((s) => zs.map((z) => <Bolt key={`${s}${z}`} x={xb} y={-s * z} r={hole / 2} />))}
      <line x1={-Hs - fs} x2={e.w + 5 * fs} y1={0} y2={0} stroke="#dc2626" strokeWidth={0.8} strokeDasharray="8 4" {...NS} />
      <Dim x1={-Hs} x2={0} y1={-ext - fs * 0.6} y2={-ext - fs * 0.6} s={fs} label={`cột ${Hs}`} />
      <Dim x1={0} x2={e.w} y1={-ext - fs * 2} y2={-ext - fs * 2} s={fs} k="ew" label={`ピース ${e.w}`} />
      <Dim x1={e.w - e.spW} x2={e.w} y1={ext + fs * 0.8} y2={ext + fs * 0.8} s={fs} side={1} k="esw" label={`添板 ${e.spW}`} />
      <Dim x1={e.w + fs * 1.3} x2={e.w + fs * 1.3} y1={-gap / 2 - e.h} y2={-gap / 2} s={fs} side={1} k="eh" label={`ピース ${e.h}`} />
      <Dim x1={e.w + fs * 3} x2={e.w + fs * 3} y1={-e.spL / 2} y2={e.spL / 2} s={fs} side={1} k="esl" label={`添板 ${e.spL}`} />
      <Dim x1={e.w + fs * 4.7} x2={e.w + fs * 4.7} y1={-gap / 2} y2={gap / 2} s={fs} side={1} k="eg" label={`khe ${gap}`} />
      <Dim x1={xb - fs * 1.2} x2={xb - fs * 1.2} y1={0} y2={-zs[0]} s={fs} k="ee" label={`e ${e.edge}`} />
      {zs.length > 1 && <Dim x1={xb - fs * 1.2} x2={xb - fs * 1.2} y1={-zs[0]} y2={-zs[1]} s={fs} k="ep" label={`P ${e.pitch}`} />}
      <T x={-Hs / 2 + e.w / 2} y={ext + fs * 3.6} s={fs * 0.8}>側面</T>
    </g>
  );

  // ---------- 平面: tiết diện thật + ピース, 添板, 下がり止め, カドビタ ----------
  const box = sec.type === 'Box' || sec.type === 'Pipe';
  // góc bo cột hộp theo chuẩn (BCR 3.5t, STKR 2.5t); ống tròn = nửa đường kính
  const Rc = sec.type === 'Pipe' ? B / 2 : boxCornerR({ ...sec, material: sec.material ?? '' } as Section), Ri = sec.type === 'Pipe' ? B / 2 - sec.tw : Math.max(0, Rc - sec.tw);
  const plan = (
    <g>
      {box ? (
        <>
          <path d={rrect(B, Hs, Rc)} fill={COL.fill} stroke={COL.stroke} {...NS} />
          <path d={rrect(B - 2 * sec.tw, Hs - 2 * sec.tw, Ri)} fill="#fff" stroke={COL.stroke} strokeWidth={0.6} {...NS} />
          {kp && sec.type === 'Box' && (
            <path data-dk="ekp ekpt" d={rrect(B - 2 * sec.tw, Hs - 2 * sec.tw, Ri) + rrect(B - 2 * sec.tw - 2 * e.kpT, Hs - 2 * sec.tw - 2 * e.kpT, Math.max(0, Ri - e.kpT))} fillRule="evenodd" fill={KP.fill} stroke={KP.stroke} {...NS} />
          )}
        </>
      ) : (
        <path d={`M${-B / 2} ${-Hs / 2}h${B}v${sec.tf}h${-(B - sec.tw) / 2}v${Hs - 2 * sec.tf}h${(B - sec.tw) / 2}v${sec.tf}h${-B}v${-sec.tf}h${(B - sec.tw) / 2}v${-(Hs - 2 * sec.tf)}h${-(B - sec.tw) / 2}z`} fill={COL.fill} stroke={COL.stroke} {...NS} />
      )}
      {epFaces(sec, j).map((f, i) => {
        // hình chữ nhật theo (khoảng pháp tuyến r0..r1, khoảng ngang t0..t1); y SVG = −y tiết diện
        const R = (r0: number, r1: number, t0: number, t1: number, c: { fill: string; stroke: string }, dk: string, k: string) =>
          f.axis === 'y' ? (
            <rect key={k} data-dk={dk} x={t0} y={f.sg > 0 ? -r1 : r0} width={t1 - t0} height={r1 - r0} fill={c.fill} stroke={c.stroke} {...NS} />
          ) : (
            <rect key={k} data-dk={dk} x={f.sg > 0 ? r0 : -r1} y={-t1} width={r1 - r0} height={t1 - t0} fill={c.fill} stroke={c.stroke} {...NS} />
          );
        const r0 = f.face, r1 = f.face + e.w, rs = r1 - e.spW;
        return (
          <g key={i}>
            {us.flatMap((u, q) => [
              R(r0, r1, u - e.t / 2, u + e.t / 2, PC, 'et ew en esp eoff', `p${q}`),
              R(rs, r1, u + e.t / 2, u + e.t / 2 + e.spT, SP, 'est esw', `a${q}`),
              R(rs, r1, u - e.t / 2 - e.spT, u - e.t / 2, SP, 'est esw', `b${q}`),
            ])}
          </g>
        );
      })}
      {/* mặt trong: カドピタ (vòng đỏ) và 下がり止め */}
      {hollow &&
        epFaces(sec, j, 4).map((f0, i) => {
          const fi = f0.face - sec.tw, hi = f0.half - sec.tw;
          const R = (r0: number, r1: number, t0: number, t1: number, c: { fill: string; stroke: string }, dk: string, k: string) =>
            f0.axis === 'y' ? (
              <rect key={k} data-dk={dk} x={t0} y={f0.sg > 0 ? -r1 : r0} width={t1 - t0} height={r1 - r0} fill={c.fill} stroke={c.stroke} {...NS} />
            ) : (
              <rect key={k} data-dk={dk} x={f0.sg > 0 ? r0 : -r1} y={-t1} width={r1 - r0} height={t1 - t0} fill={c.fill} stroke={c.stroke} {...NS} />
            );
          const cut = f0.axis === 'x' ? e.kpT : 0;
          return (
            <g key={`in${i}`}>
              {kp && sec.type !== 'Box' && R(fi - e.kpT, fi, -hi + cut, hi - cut, KP, 'ekp ekpt', 'kp')}
              {sds.map((u, q) => R(fi - e.sdT, fi, u - e.sdW / 2, u + e.sdW / 2, SD, 'esdn esdt esdw esdsp esdoff', `s${q}`))}
            </g>
          );
        })}
      <Dim x1={us[0] - e.t / 2} x2={us[0] + e.t / 2} y1={-Hs / 2 - e.w - fs * 1.1} y2={-Hs / 2 - e.w - fs * 1.1} s={fs} k="et" label={`t ${e.t}`} />
      <Dim x1={us[0] + e.t / 2} x2={us[0] + e.t / 2 + e.spT} y1={-Hs / 2 - e.w - fs * 2.5} y2={-Hs / 2 - e.w - fs * 2.5} s={fs} k="est" label={`添板 ${e.spT}`} />
      <T x={0} y={Hs / 2 + e.w + fs * 3.6} s={fs * 0.8}>平面 · {e.faces} mặt × {e.n} ピース</T>
    </g>
  );

  // ---------- 断面詳細: cắt qua thành cột tại mối hàn (như 使用例 của カドピタ) ----------
  const tw = sec.tw;
  const dHalf = Math.max(gap / 2 + e.sdZ + e.sdH, e.kpUp, e.kpW - e.kpUp, 3 * tw) + 2 * tw;
  const fd = Math.max(dHalf, 3 * tw) / 9; // cỡ chữ cho hình chi tiết
  const bev = tw * Math.tan((35 * Math.PI) / 180); // vát 35°
  const inX = -tw; // mặt trong thành cột (x = 0 là mặt ngoài)
  const detail = hollow && (kp || sds.length > 0) && (
    <g>
      {/* thành cột trên (vát 35° phía ngoài) và cột dưới */}
      <path d={`M${inX} ${-dHalf} H0 V${-gap / 2 - bev} L${inX + 1.5} ${-gap / 2} H${inX} Z`} fill={COL.fill} stroke={COL.stroke} {...NS} />
      <rect x={inX} y={gap / 2} width={tw} height={dHalf - gap / 2} fill={COL.fill} stroke={COL.stroke} {...NS} />
      <T x={inX / 2} y={-dHalf + fd * 1.2} s={fd * 0.8}>cột trên</T>
      <T x={inX / 2} y={dHalf - fd * 0.4} s={fd * 0.8}>cột dưới</T>
      {kp && <rect data-dk="ekp ekpt ekpw ekpu" x={inX - e.kpT} y={-e.kpUp} width={e.kpT} height={e.kpW} fill={KP.fill} stroke={KP.stroke} {...NS} />}
      {sds.length > 0 && <rect data-dk="esdn esdt esdh esdz" x={inX - e.sdT} y={-gap / 2 - e.sdZ - e.sdH} width={e.sdT} height={e.sdH} fill="#94a3b8" stroke="#334155" {...NS} />}
      {kp && <T x={inX - Math.max(e.kpT, e.sdT) - fd * 2.4} y={-e.kpUp + e.kpW / 2 + fd * 0.3} s={fd * 0.75} anchor="end" fill={KP.stroke}>カドピタ</T>}
      {sds.length > 0 && <T x={inX - Math.max(e.kpT, e.sdT) - fd * 2.4} y={-gap / 2 - e.sdZ - e.sdH / 2 + fd * 0.3} s={fd * 0.75} anchor="end">下がり止め</T>}
      {/* dims */}
      <Dim x1={fd * 1.2} x2={fd * 1.2} y1={-gap / 2} y2={gap / 2} s={fd} side={1} k="eg" label={`RG ${gap}`} />
      <T x={fd * 0.6} y={-gap / 2 - bev - fd * 0.3} s={fd * 0.7} anchor="start">35°</T>
      {kp && (
        <>
          <Dim x1={inX - Math.max(e.kpT, e.sdT) - fd * 1.2} x2={inX - Math.max(e.kpT, e.sdT) - fd * 1.2} y1={-e.kpUp} y2={-e.kpUp + e.kpW} s={fd} k="ekpw" label={e.kpW} />
          <Dim x1={fd * 3} x2={fd * 3} y1={-e.kpUp} y2={0} s={fd} side={1} k="ekpu" label={`↑${e.kpUp}`} />
          <Dim x1={inX - e.kpT} x2={inX} y1={dHalf - fd * 2} y2={dHalf - fd * 2} s={fd} k="ekpt" label={`t ${e.kpT}`} />
        </>
      )}
      {sds.length > 0 && (
        <>
          <Dim x1={inX - Math.max(e.kpT, e.sdT) - fd * 1.2} x2={inX - Math.max(e.kpT, e.sdT) - fd * 1.2} y1={-gap / 2 - e.sdZ - e.sdH} y2={-gap / 2 - e.sdZ} s={fd} k="esdh" label={e.sdH} />
          <Dim x1={fd * 5} x2={fd * 5} y1={-gap / 2 - e.sdZ} y2={-gap / 2} s={fd} side={1} k="esdz" label={e.sdZ} />
          <Dim x1={inX - e.sdT} x2={inX} y1={-dHalf + fd * 2.4} y2={-dHalf + fd * 2.4} s={fd} k="esdt" label={`t ${e.sdT}`} />
        </>
      )}
      <line x1={inX - 12 * fd} x2={fd * 7} y1={0} y2={0} stroke="#dc2626" strokeWidth={0.6} strokeDasharray="6 3" {...NS} />
      <T x={inX - 3 * fd} y={dHalf + fd * 1.4} s={fd * 0.85}>断面詳細 (thành cột {tw})</T>
    </g>
  );
  // 3 hình xếp dọc, mỗi hình rộng hết khung và đúng tỉ lệ theo tiết diện thật
  const top = -ext - 3 * fs, hV = 2 * ext + 7.5 * fs;
  const wF = B + 8 * fs;
  const wS = Hs + e.w + 9 * fs;
  const hP = Hs + 2 * e.w + 8.5 * fs, wP = B + 2 * e.w + 6 * fs;
  return (
    <div className="ep-figs">
      <div className="small ep-title">
        {j.name} · エレクションピース PL-{e.t}×{e.w}×{e.h} · 添板 2-PL-{e.spT}×{e.spW}×{e.spL} · {e.faces} mặt × {e.n} ピース · {2 * Math.max(1, e.nb)}-M{j.bolt.dia} / ピース · khe {gap}
      </div>
      <svg className="joint-shape" viewBox={`${-wF / 2} ${top} ${wF} ${hV}`}>{front}</svg>
      <svg className="joint-shape" viewBox={`${-Hs - 2 * fs} ${top} ${wS} ${hV}`}>{side}</svg>
      <svg className="joint-shape" viewBox={`${-wP / 2} ${-Hs / 2 - e.w - 3.5 * fs} ${wP} ${hP}`}>{plan}</svg>
      {detail && <svg className="joint-shape" viewBox={`${inX - 13 * fd} ${-dHalf - fd} ${21 * fd + tw} ${2 * dHalf + 3 * fd}`}>{detail}</svg>}
    </div>
  );
}
