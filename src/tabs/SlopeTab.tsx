// Tab 勾配: 勾配設定 theo mặt (đa giác giao trục) – bấm giao trục trên mặt bằng, chọn 基準通り, kiểu 水上 / 水下基準, 勾配比率, 柱ダイアフラム / 柱合わせ
import { useEffect, useState } from 'react';
import { Field, Num, Section, Sel, TabProps, Text } from '../ui';
import { COL_DIA_LABEL, COL_FIT_LABEL, ColDia, ColFit, SLOPE_KIND_LABEL, SlopeFace, SlopeKind } from '../model';
import { hasPoints, faceAxes, faceAxis, faceGeo, faceKnots, faceProfile, faceZ, newSlopeFace, setFaceDir, setFaceLine } from '../slopeFace';

export interface SlopeTabProps extends TabProps {
  active: string | null;
  setActive: (id: string | null) => void;
  /** đang bấm giao trục để thêm đỉnh */
  picking: boolean;
  setPicking: (v: boolean) => void;
  /** xem 3D (sau khi xác nhận) hay Mặt bằng (để nhập) */
  view3d: boolean;
  setView3d: (on: boolean) => void;
}

export const KINDS: SlopeKind[] = ['flat', 'two', 'leftLow', 'rightHigh', 'rightLow', 'leftHigh'];

/** Biểu tượng nhỏ cho 6 kiểu 勾配 */
export function KindIcon({ k }: { k: SlopeKind }) {
  const tri = (pts: string) => <polygon points={pts} fill="#fca5a5" stroke="#b91c1c" strokeWidth={1} />;
  return (
    <svg width={44} height={22} viewBox="0 0 44 22">
      {k === 'flat' && <line x1={4} y1={14} x2={40} y2={14} stroke="#1d4ed8" strokeWidth={2} />}
      {k === 'two' && <><line x1={4} y1={17} x2={40} y2={6} stroke="#1d4ed8" strokeWidth={2} /><circle cx={4} cy={17} r={2.5} fill="#b91c1c" /><circle cx={40} cy={6} r={2.5} fill="#b91c1c" /></>}
      {k === 'leftLow' && <>{tri('6,18 38,18 38,6')}<circle cx={6} cy={18} r={2.5} fill="#1d4ed8" /></>}
      {k === 'rightHigh' && <>{tri('6,18 38,18 38,6')}<circle cx={38} cy={6} r={2.5} fill="#1d4ed8" /></>}
      {k === 'rightLow' && <>{tri('6,6 6,18 38,18')}<circle cx={38} cy={18} r={2.5} fill="#1d4ed8" /></>}
      {k === 'leftHigh' && <>{tri('6,6 6,18 38,18')}<circle cx={6} cy={6} r={2.5} fill="#1d4ed8" /></>}
    </svg>
  );
}

/** Hình cắt theo 基準通り: đường tầng, đường dốc, 2 trục 開始 / 終了, tam giác 勾配比率, kích thước Y移動量 */
/** ô point đang nhập (để tô sáng trên hình) */
export type PtFocus = { id: string; k: 'x1' | 'y1' | 'x2' | 'y2' } | null;

export function SlopePreview({ p, f, mid, onAxis, focus }: { p: TabProps['p']; f: SlopeFace; mid: boolean; /** bấm vào trục trên hình → nhập point của trục đó */ onAxis?: (id: string) => void; focus?: PtFocus }) {
  const g = faceGeo(p, f);
  const lv = p.levels.find((l) => l.id === f.level);
  if (!g) return <p className="muted small">Chọn đủ ≥ 3 điểm, 基準通り, 開始 và 終了 để xem hình cắt.</p>;
  const L = Math.abs(g.s1 - g.s0), d = Math.sign(g.s1 - g.s0);
  const zs = faceZ(g, g.s0), ze = faceZ(g, g.s1);
  const prof = faceProfile(g);
  const knots = faceKnots(g);
  const zMin = Math.min(0, ...prof.map((q) => q[1])), zMax = Math.max(0, ...prof.map((q) => q[1]));
  const W = 420, H = 220, pad = 50;
  const k = Math.min((W - 2 * pad) / (L || 1), (H - 90) / Math.max(1, zMax - zMin));
  const X = (t: number) => pad + t * k, Y = (z: number) => H - 50 - (z - zMin) * k;
  const names = (id: string) => [...p.gridsX, ...p.gridsY].find((x) => x.id === id)?.name ?? '?';
  const ref = f.kind === 'rightHigh' || f.kind === 'rightLow' ? L - f.dx : f.kind === 'leftHigh' || f.kind === 'leftLow' ? f.dx : 0;
  const r = f.run ? f.rise / f.run : 0;
  // tam giác 勾配比率 ở giữa đường dốc
  const tm = L / 2, zm = faceZ(g, g.s0 + d * tm);
  const tx = 30, ty = tx * r * (zs > ze ? -1 : 1);
  return (
    <svg className="slope-prev" viewBox={`0 0 ${W} ${H}`} width="100%">
      <line x1={10} y1={Y(0)} x2={W - 10} y2={Y(0)} stroke="#94a3b8" strokeDasharray="6 4" />
      <text x={12} y={Y(0) - 4} fontSize={11} fill="#334155">▽{lv?.name ?? ''}</text>
      {faceAxes(g).map((m, i, all) => {
        const end = i === 0 || i === all.length - 1;
        if (!mid && !end) return null;
        const gl = [...p.gridsX, ...p.gridsY].find((x) => x.id === m.id);
        const t = (m.s - g.s0) * d;
        const col = end ? '#dc2626' : '#f97316', ink = end ? '#0f172a' : '#9a3412';
        const on = focus?.id === m.id;
        return (
          <g key={m.id} className="slope-axis" style={{ cursor: onAxis ? 'pointer' : undefined }} onClick={() => onAxis?.(m.id)}>
            <title>Trục {gl?.name}: bấm để nhập X1 Y1 X2 Y2</title>
            <line x1={X(t)} y1={18} x2={X(t)} y2={H - 30} stroke={col} strokeDasharray="8 3 2 3" strokeWidth={on ? 1.6 : 0.8} />
            <rect x={X(t) - 8} y={18} width={16} height={H - 48} fill="transparent" />
            <circle cx={X(t)} cy={H - 16} r={end ? 12 : 11} fill={on ? '#dcfce7' : '#fff'} stroke={on ? '#16a34a' : ink} strokeWidth={on ? 2 : 1} />
            <text x={X(t)} y={H - 12} fontSize={9} textAnchor="middle">{gl?.name}</text>
          </g>
        );
      })}
      {knots.filter((q) => mid || q.id === f.start || q.id === f.end).map((q) => {
        const on = focus?.id === q.id;
        const fx = on && focus?.k === `x${q.k}`, fy = on && focus?.k === `y${q.k}`;
        const xa = X(q.t0), xp = X(q.t), yp = Y(q.z), y0 = Y(0);
        const hl = '#16a34a';
        const xv = Math.round(Math.abs(q.t - q.t0)), yv = Math.round(q.z);
        return (
          <g key={q.id + q.k}>
            <line x1={xp} y1={y0} x2={xp} y2={yp} stroke={fy ? hl : '#86efac'} strokeWidth={fy ? 2.5 : 0.8} />
            {(fx || xv > 0) && <line x1={xa} y1={yp - 10} x2={xp} y2={yp - 10} stroke={fx ? hl : '#86efac'} strokeWidth={fx ? 2.5 : 0.8} />}
            <circle cx={xp} cy={yp} r={on ? 4.5 : 3.2} fill="#facc15" stroke={on ? hl : '#a16207'} strokeWidth={on ? 1.5 : 0.8} />
            {fx && <text x={(xa + xp) / 2} y={yp - 14} fontSize={10} fontWeight={700} textAnchor="middle" fill={hl}>X{q.k} {xv}</text>}
            {fy && <text x={xp + (q.k === 1 ? -4 : 4)} y={(y0 + yp) / 2} fontSize={10} fontWeight={700} textAnchor={q.k === 1 ? 'end' : 'start'} fill={hl}>Y{q.k} {yv}</text>}
            {!fx && !fy && <text x={xp + (q.k === 1 ? -3 : 3)} y={yp - 5} fontSize={8} textAnchor={q.k === 1 ? 'end' : 'start'} fill="#9a3412">{yv}</text>}
          </g>
        );
      })}
      <defs><marker id="sl-arr" viewBox="0 0 6 6" refX={5} refY={3} markerWidth={6} markerHeight={6} orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#2563eb" /></marker></defs>
      <polyline points={prof.map(([t, z]) => `${X(t)},${Y(z)}`).join(' ')} fill="none" stroke="#dc2626" strokeWidth={2} />
      {f.kind !== 'flat' && f.kind !== 'two' && r > 0 && !hasPoints(f) && (
        <g>
          <polygon points={`${X(tm)},${Y(zm)} ${X(tm) + tx},${Y(zm)} ${X(tm) + tx},${Y(zm) - ty}`} fill="none" stroke="#1d4ed8" />
          <text x={X(tm) + tx + 4} y={Y(zm) - ty / 2} fontSize={10} fill="#1d4ed8">{f.rise}</text>
          <text x={X(tm) + tx / 2} y={Y(zm) + 12} fontSize={10} fill="#1d4ed8" textAnchor="middle">{f.run}</text>
        </g>
      )}
      {f.kind !== 'two' && !hasPoints(f) && (
        <g>
          <circle cx={X(ref)} cy={Y(f.dy)} r={3.5} fill="#1d4ed8" />
          <line x1={X(ref)} y1={Y(0)} x2={X(ref)} y2={Y(f.dy)} stroke="#0f766e" />
          <text x={X(ref) + 4} y={(Y(0) + Y(f.dy)) / 2} fontSize={10} fill="#0f766e">{f.dy}</text>
        </g>
      )}
      <text x={(X(0) + X(L)) / 2} y={14} fontSize={10} textAnchor="middle" fill="#64748b">基準通り {names(f.baseAxis)} · L = {Math.round(L)}</text>
    </svg>
  );
}


/** Point của từng trục: X1 (trái trục), Y1, X2 (phải trục), Y2 – nhập riêng, không liên quan nhau. Ô đang nhập được tô sáng trên hình */
function MidAxes({ p, f, upd, mid, focus, setFocus }: { p: TabProps['p']; f: SlopeFace; upd: (fn: (x: SlopeFace) => void) => void; mid: boolean; focus: PtFocus; setFocus: (x: PtFocus) => void }) {
  const g = faceGeo(p, f);
  if (!g) return null;
  const name = (id: string) => [...p.gridsX, ...p.gridsY].find((x) => x.id === id)?.name ?? '?';
  const set = (id: string, k: 'x1' | 'y1' | 'x2' | 'y2', v: number) => upd((x) => { ((x.adj ??= {})[id] ??= {})[k] = v; });
  const ks = faceKnots(g);
  const cell = (id: string, k: 'x1' | 'y1' | 'x2' | 'y2') => {
    const a = f.adj?.[id] ?? {};
    const q = ks.find((x) => x.id === id && x.k === (k.endsWith('1') ? 1 : 2));
    const v = k.startsWith('x') ? a[k] ?? 0 : a[k] ?? Math.round(q?.z ?? 0);
    const on = focus?.id === id && focus.k === k;
    return (
      <td className={on ? 'pt-on' : ''} onFocus={() => setFocus({ id, k })} onBlur={() => setFocus(null)}>
        <Num signed value={v} onChange={(val) => set(id, k, val)} />
      </td>
    );
  };
  return (
    <table className="table compact slope-mid" data-axes>
      <thead>
        <tr><th>通り</th><th>X1</th><th>Y1</th><th>X2</th><th>Y2</th></tr>
      </thead>
      <tbody>
        {faceAxes(g).filter((m, i, all) => mid || i === 0 || i === all.length - 1).map((m) => (
          <tr key={m.id} data-axis={m.id} className={focus?.id === m.id ? 'on' : ''}>
            <td><b>{name(m.id)}</b></td>
            {cell(m.id, 'x1')}
            {cell(m.id, 'y1')}
            {cell(m.id, 'x2')}
            {cell(m.id, 'y2')}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Hình minh họa 柱ダイアフラム / 柱合わせ cho 1 cột (水下 / 標準 / 水上) */
function ColPic({ dia, fit, role }: { dia: ColDia; fit: ColFit; role: 'low' | 'std' | 'high' }) {
  const W = 150, H = 120, cx = 75, cw = 28, k = 0.32; // độ dốc hình vẽ
  const bh = 34; // chiều cao dầm
  const yAt = (x: number) => 52 - (x - cx) * k; // mặt trên dầm tại x
  const xl = cx - cw / 2, xr = cx + cw / 2;
  const topL = yAt(xl), topR = yAt(xr), topC = yAt(cx);
  const colTop = fit === 'low' ? Math.max(topL, topR) : fit === 'high' ? Math.min(topL, topR) : fit === 'center' ? topC : topC - 14;
  const beams = role === 'low' ? [[xr, W - 4]] : role === 'high' ? [[4, xl]] : [[4, xl], [xr, W - 4]];
  const dl = (y0: number, slope: boolean) => (slope ? `M${xl - 3},${y0 + (xl - cx) * -k} L${xr + 3},${y0 + (xr - cx) * -k}` : `M${xl - 3},${y0} L${xr + 3},${y0}`);
  const fl = dia === 'slope';
  const yTopD = fl ? topC : Math.min(topL, topR), yBotD = fl ? topC + bh : Math.max(topL, topR) + bh;
  return (
    <svg className="col-pic" viewBox={`0 0 ${W} ${H}`} width="100%">
      <rect x={xl} y={colTop} width={cw} height={H - 8 - colTop} fill="#bfdbfe" stroke="#1d4ed8" />
      {beams.map(([a, b], i) => (
        <path key={i} d={`M${a},${yAt(a)} L${b},${yAt(b)} L${b},${yAt(b) + bh} L${a},${yAt(a) + bh} Z`} fill="#fde68a" stroke="#b45309" />
      ))}
      <path d={dl(fl ? topC : yTopD, fl)} stroke="#dc2626" strokeWidth={3} />
      <path d={dl(fl ? topC + bh : yBotD, fl)} stroke="#dc2626" strokeWidth={3} />
      <line x1={xl - 10} y1={colTop} x2={xr + 10} y2={colTop} stroke="#0f766e" strokeDasharray="3 2" />
      <text x={xr + 12} y={colTop + 3} fontSize={9} fill="#0f766e">{fit === 'none' ? 'đỉnh cột' : COL_FIT_LABEL[fit].replace(/^\d - /, '')}</text>
      <text x={4} y={H - 2} fontSize={9} fill="#dc2626">{fl ? 'ダイア nghiêng' : 'ダイア phẳng'}</text>
    </svg>
  );
}

export default function SlopeTab({ p, set, active, setActive, setPicking, view3d, setView3d }: SlopeTabProps) {
  const list = p.slopeFaces ?? [];
  const f = list.find((x) => x.id === active) ?? null;
  const [ptFocus, setPtFocus] = useState<PtFocus>(null);
  const [mid, setMidS] = useState(() => { try { return localStorage.getItem('steel3t.slopeMid') !== '0'; } catch { return true; } });
  const setMid = (v: boolean) => { setMidS(v); try { localStorage.setItem('steel3t.slopeMid', v ? '1' : '0'); } catch { /* */ } };
  // nhớ tùy chọn lần trước (kiểu, 勾配比率, 移動量, cột)
  useEffect(() => {
    if (!f) return;
    try { localStorage.setItem('steel3t.slopeLast', JSON.stringify({ kind: f.kind, run: f.run, rise: f.rise, dx: f.dx, dy: f.dy, dy2: f.dy2, cols: f.cols })); } catch { /* */ }
  }, [f?.kind, f?.run, f?.rise, f?.dx, f?.dy, f?.dy2, JSON.stringify(f?.cols)]); // eslint-disable-line react-hooks/exhaustive-deps
  const upd = (patch: Partial<SlopeFace> | ((x: SlopeFace) => void)) =>
    set((d) => {
      const x = d.slopeFaces?.find((v) => v.id === active);
      if (!x) return;
      if (typeof patch === 'function') patch(x);
      else Object.assign(x, patch);
    });
  const lvOpts = [...p.levels].sort((a, b) => a.elevation - b.elevation).map((l) => ({ value: l.id, label: `${l.name} (${l.elevation})` }));
  const topLv = [...p.levels].sort((a, b) => b.elevation - a.elevation)[0]?.id ?? '';
  const gridName = (id: string) => [...p.gridsX, ...p.gridsY].find((x) => x.id === id)?.name ?? '?';
  const add = (mode: 'area' | 'line') => {
    const nf = newSlopeFace(p, list.length + 1, f?.level ?? topLv, mode);
    try { const last = JSON.parse(localStorage.getItem('steel3t.slopeLast') ?? 'null'); if (last) Object.assign(nf, last); } catch { /* */ }
    if (nf.dy2 === undefined) nf.dy2 = nf.dy;
    set((d) => void (d.slopeFaces = [...(d.slopeFaces ?? []), nf]));
    setActive(nf.id);
    setPicking(true);
    setView3d(false);
  };
  // bấm trục trên hình → nhảy tới ô X1 của trục đó
  const focusAxis = (id: string) => {
    const el = document.querySelector<HTMLInputElement>(`table[data-axes] tr[data-axis="${id}"] input`);
    if (el) { el.focus(); el.select(); el.scrollIntoView({ block: 'nearest' }); }
  };
  const confirm = () => {
    upd({ ok: true });
    // xác nhận xong → thoát lệnh (bỏ chọn mặt 勾配, xem 3D)
    setPicking(false);
    setActive(null);
    setView3d(true);
  };

  // trục vuông góc với 基準通り (để chọn 開始 / 終了)
  const ax = f ? faceAxis(p, f) : null;
  const perp = ax === 'y' ? p.gridsY : ax === 'x' ? p.gridsX : [];

  return (
    <>
      <Section title={`勾配設定 (${list.length})`}>
        <div className="row-gap">
          <button className="primary" onClick={() => add('area')}>+ 勾配 vùng</button>
          <button className="primary" onClick={() => add('line')}>+ 勾配 đường</button>
          <span style={{ flex: 1 }} />
          <div className="seg">
            <button className={!view3d ? 'on' : ''} onClick={() => setView3d(false)}>Mặt bằng</button>
            <button className={view3d ? 'on' : ''} onClick={() => setView3d(true)}>3D</button>
          </div>
        </div>
        <p className="muted small">
          勾配 vùng: kéo khung quét 1 vùng trên Mặt bằng (hoặc bấm 2 góc đối diện) – mọi cây trong vùng nghiêng theo 勾配. 勾配 đường: bấm 1 đường trục – các cây trên trục đó nghiêng theo 勾配. Nhập xong bấm ✓ Xác nhận để áp và xem trên 3D.
        </p>
        {!list.length && <p className="muted small">Chưa có 勾配.</p>}
        <div className="chips">
          {list.map((x) => (
            <button key={x.id} className={'chip' + (x.id === active ? ' on' : '')} onClick={() => { setActive(x.id === active ? null : x.id); setPicking(false); }}>
              {x.ok === false ? '○ ' : '✓ '}{x.name} · {x.mode === 'line' ? 'đường' : 'vùng'} · {p.levels.find((l) => l.id === x.level)?.name ?? '?'} · {SLOPE_KIND_LABEL[x.kind]}
            </button>
          ))}
        </div>
      </Section>

      {f && (
        <>
          <Section
            title={`① Mặt ${f.name}`}
            actions={
              <button className="danger" onClick={() => { set((d) => void (d.slopeFaces = (d.slopeFaces ?? []).filter((x) => x.id !== f.id))); setActive(null); setPicking(false); }}>
                Xoá
              </button>
            }
          >
            <div className="grid2">
              <Field label="名称">
                <Text value={f.name} onChange={(v) => upd({ name: v })} />
              </Field>
              <Field label="階高名">
                <Sel value={f.level} onChange={(v) => upd({ level: v })} options={lvOpts} />
              </Field>
            </div>
            {f.mode === 'line' ? (
              <Field label="Trục (勾配 đường) – bấm đường trục trên Mặt bằng hoặc chọn">
                <Sel
                  value={f.baseAxis}
                  onChange={(v) => upd((x) => setFaceLine(p, x, v))}
                  options={[{ value: '', label: '— chọn trục —' }, ...p.gridsX.map((g) => ({ value: g.id, label: `${g.name} (trục số X)` })), ...p.gridsY.map((g) => ({ value: g.id, label: `${g.name} (trục chữ Y)` }))]}
                />
              </Field>
            ) : (
              <>
                <Field label="Vùng (giao trục góc)">
                  <div className="muted small">{f.pts.length ? f.pts.map(([x, y], i) => `${'①②③④⑤⑥⑦⑧⑨⑩'[i] ?? i + 1} ${gridName(x)}-${gridName(y)}`).join(' → ') : 'Chưa có: kéo khung quét trên Mặt bằng, bấm 2 góc đối diện, hoặc chọn giao trục ở dòng dưới.'}</div>
                </Field>
                {(() => {
                  // chọn vùng bằng giao trục: Từ (X, Y) đến (X, Y) → khung chữ nhật, không cần quét
                  const c0 = f.pts[0], c2 = f.pts.length === 4 ? f.pts[2] : f.pts[1];
                  const v = [c0?.[0] ?? '', c0?.[1] ?? '', c2?.[0] ?? '', c2?.[1] ?? ''];
                  const setC = (k: number, id: string) =>
                    upd((x) => {
                      const n = [...v];
                      n[k] = id;
                      const [xa, ya, xb, yb] = n;
                      if (xa && ya && xb && yb && xa !== xb && ya !== yb) {
                        x.pts = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
                        setFaceDir(p, x, faceAxis(p, x) ?? 'y');
                      } else x.pts = [[xa || p.gridsX[0]?.id, ya || p.gridsY[0]?.id], ...(xb || yb ? [[xb || xa || p.gridsX[0]?.id, yb || ya || p.gridsY[0]?.id] as [string, string]] : [])] as [string, string][];
                    });
                  const ox = [{ value: '', label: 'X' }, ...p.gridsX.map((g) => ({ value: g.id, label: g.name }))];
                  const oy = [{ value: '', label: 'Y' }, ...p.gridsY.map((g) => ({ value: g.id, label: g.name }))];
                  return (
                    <Field label="Chọn giao trục (không cần quét)">
                      <div className="slope-rect">
                        <span>Từ</span>
                        <Sel value={v[0]} onChange={(id) => setC(0, id)} options={ox} />
                        <Sel value={v[1]} onChange={(id) => setC(1, id)} options={oy} />
                        <span>đến</span>
                        <Sel value={v[2]} onChange={(id) => setC(2, id)} options={ox} />
                        <Sel value={v[3]} onChange={(id) => setC(3, id)} options={oy} />
                      </div>
                    </Field>
                  );
                })()}
                <div className="row-gap">
                  <button disabled={!f.pts.length} onClick={() => upd((x) => void x.pts.pop())}>↶ Bỏ điểm cuối</button>
                  <button disabled={!f.pts.length} onClick={() => upd({ pts: [] })}>Xoá vùng</button>
                </div>
              </>
            )}
          </Section>

          <Section title="② 勾配">
            {f.mode !== 'line' && (
              <Field label="Phương dốc">
                <div className="seg">
                  <button className={ax === 'y' ? 'on' : ''} onClick={() => upd((x) => setFaceDir(p, x, 'y'))}>Theo trục chữ (Y)</button>
                  <button className={ax === 'x' ? 'on' : ''} onClick={() => upd((x) => setFaceDir(p, x, 'x'))}>Theo trục số (X)</button>
                </div>
              </Field>
            )}
            <div className="slope-kinds">
              {KINDS.map((k) => (
                <button key={k} className={f.kind === k ? 'on' : ''} onClick={() => upd({ kind: k })}>
                  <KindIcon k={k} />
                  <span>{SLOPE_KIND_LABEL[k]}</span>
                </button>
              ))}
            </div>
            <div className="grid2">
              <Field label="開始 (trái)">
                <Sel value={f.start} onChange={(v) => upd({ start: v })} options={[{ value: '', label: '—' }, ...perp.map((g) => ({ value: g.id, label: g.name }))]} />
              </Field>
              <Field label="終了 (phải)">
                <Sel value={f.end} onChange={(v) => upd({ end: v })} options={[{ value: '', label: '—' }, ...perp.map((g) => ({ value: g.id, label: g.name }))]} />
              </Field>
            </div>
            {f.kind === 'two' ? (
              <div className="grid2">
                <Field label="Y移動量 開始側 (mm)">
                  <Num signed value={f.dy} onChange={(v) => upd({ dy: v, dy2: f.dy2 ?? f.dy })} />
                </Field>
                <Field label="Y移動量 終了側 (mm)">
                  <Num signed value={f.dy2 ?? f.dy} onChange={(v) => upd({ dy2: v })} />
                </Field>
              </div>
            ) : (
              <div className="grid2">
                <Field label={`X移動量 (${f.kind === 'rightHigh' || f.kind === 'rightLow' ? gridName(f.end) : gridName(f.start)}側, mm)`}>
                  <Num value={f.dx} onChange={(v) => upd({ dx: v })} />
                </Field>
                <Field label="Y移動量 (mm)">
                  <Num signed value={f.dy} onChange={(v) => upd({ dy: v })} />
                </Field>
              </div>
            )}
            {f.kind !== 'flat' && f.kind !== 'two' && (
              <Field label="勾配比率 (ngang : đứng)">
                <div className="slope-ratio">
                  <Num value={f.run} onChange={(v) => upd({ run: v })} />
                  <span>:</span>
                  <Num value={f.rise} onChange={(v) => upd({ rise: v })} />
                </div>
              </Field>
            )}
            <label className="check small"><input type="checkbox" checked={mid} onChange={(e) => setMid(e.target.checked)} /> Hiện các trục giữa</label>
            <SlopePreview p={p} f={f} mid={mid} onAxis={focusAxis} focus={ptFocus} />
            <MidAxes p={p} f={f} upd={upd} mid={mid} focus={ptFocus} setFocus={setPtFocus} />
          </Section>

          <Section title="③ 勾配設定基準 · cột">
            <table className="table slope-cols">
              <thead>
                <tr>
                  <th />
                  <th>水下</th>
                  <th>標準</th>
                  <th>水上</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>柱ダイアフラム</td>
                  {(['low', 'std', 'high'] as const).map((r) => (
                    <td key={r}>
                      <Sel value={f.cols[r].dia} onChange={(v) => upd((x) => void (x.cols[r].dia = v as ColDia))} options={(Object.keys(COL_DIA_LABEL) as ColDia[]).map((k) => ({ value: k, label: COL_DIA_LABEL[k] }))} />
                    </td>
                  ))}
                </tr>
                <tr>
                  <td>柱合わせ</td>
                  {(['low', 'std', 'high'] as const).map((r) => (
                    <td key={r}>
                      <Sel value={f.cols[r].fit} onChange={(v) => upd((x) => void (x.cols[r].fit = v as ColFit))} options={(Object.keys(COL_FIT_LABEL) as ColFit[]).map((k) => ({ value: k, label: COL_FIT_LABEL[k] }))} />
                    </td>
                  ))}
                </tr>
                <tr className="col-pics">
                  <td className="muted small">Hình minh họa</td>
                  {(['low', 'std', 'high'] as const).map((r) => (
                    <td key={r}><ColPic dia={f.cols[r].dia} fit={f.cols[r].fit} role={r} /></td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="muted small">ダイア đỏ = 柱ダイアフラム, nét xanh = cao độ đỉnh cột theo 柱合わせ (水下ダイア: theo mép dầm thấp · 水上ダイア: theo mép dầm cao · 柱芯: theo tâm cột).</p>
          </Section>
          <div className="row-gap" style={{ margin: '8px 0 16px' }}>
            <button className="primary" disabled={!faceGeo(p, f)} onClick={confirm}>
              ✓ Xác nhận 勾配{f.ok === false ? '' : ' (đã áp)'}
            </button>
            {!faceGeo(p, f) && <span className="muted small">Chưa đủ: {f.mode === 'line' ? 'chọn trục' : 'quét vùng'}, 開始 / 終了.</span>}
          </div>
        </>
      )}
    </>
  );
}
