// 本体 › 継手 › 接続 · 合掌PL: các liên kết 2 cây do lệnh 切断 / 結合 tạo ra (SPL hoặc hàn + 合掌プレート)
import { Fragment, useState } from 'react';
import { GasshoPlate, Member, MemberLink, Project, jointTypeName, newGassho } from '../model';
import { Field, Num, Section, Sel, TabProps, Text } from '../ui';
import { Dim, NS, T } from '../JointShape';
import { linkPoint } from '../editOps';

/** Hình 合掌プレート: 2 cây gặp nhau tại mối hàn, tấm ốp bụng với các dim (tô sáng khi nhập) */
function GasshoShape({ g, h, tf, angle }: { g: GasshoPlate; h: number; tf: number; angle: number }) {
  const fs = Math.max(h, 300) / 12;
  const len = Math.max(g.L, h) * 1.1 + 200;
  // cây 1 nằm ngang bên trái, cây 2 nghiêng theo góc giữa 2 cây (độ) bên phải
  const a = (angle * Math.PI) / 180;
  const beam = (rot: number, key: string) => (
    <g key={key} transform={`rotate(${rot})`}>
      <rect x={0} y={-h / 2} width={len} height={tf} fill="#cbd5e1" stroke="#475569" {...NS} />
      <rect x={0} y={h / 2 - tf} width={len} height={tf} fill="#cbd5e1" stroke="#475569" {...NS} />
      <rect x={0} y={-h / 2 + tf} width={len} height={h - 2 * tf} fill="#f1f5f9" stroke="#475569" strokeWidth={0.6} {...NS} />
    </g>
  );
  const x0 = g.off - g.L / 2, y0 = -g.offV - g.H / 2;
  const W = 2 * len + 4 * fs, H = Math.max(h, g.H + Math.abs(g.offV) * 2) + len * Math.abs(Math.sin(a)) + 8 * fs;
  return (
    <svg className="joint-shape" viewBox={`${-len - 2 * fs} ${-H / 2 - fs} ${W} ${H}`}>
      <T x={-len} y={-H / 2 + fs * 0.6} s={fs * 0.8} anchor="start">
        {g.name} · 合掌プレート PL-{g.t}×{g.H}×{g.L} · {g.sides === 2 ? '2 mặt' : '1 mặt'}
      </T>
      {beam(180, 'a')}
      {beam(-angle, 'b')}
      {/* mối hàn */}
      <line x1={0} x2={0} y1={-h / 2} y2={h / 2} stroke="#dc2626" strokeWidth={2} {...NS} />
      <rect data-dk="gL gH gt" x={x0} y={y0} width={g.L} height={g.H} fill="#67e8f9" fillOpacity={0.75} stroke="#0e7490" {...NS} />
      <line x1={-len} x2={len} y1={0} y2={0} stroke="#0891b2" strokeWidth={0.7} strokeDasharray="14 4 3 4" {...NS} />
      <Dim x1={x0} x2={x0 + g.L} y1={y0 - fs * 1.2} y2={y0 - fs * 1.2} s={fs} k="gL" label={`L ${g.L}`} />
      <Dim x1={x0 - fs * 1.2} x2={x0 - fs * 1.2} y1={y0} y2={y0 + g.H} s={fs} k="gH" label={`H ${g.H}`} />
      {g.off !== 0 ? <Dim x1={0} x2={g.off} y1={y0 + g.H + fs * 1.4} y2={y0 + g.H + fs * 1.4} s={fs} side={1} k="goff" label={g.off} /> : <T x={0} y={y0 + g.H + fs * 1.6} s={fs * 0.7} fill="#0e7490">dọc 0</T>}
      {g.offV !== 0 ? <Dim x1={x0 + g.L + fs * 1.2} x2={x0 + g.L + fs * 1.2} y1={0} y2={-g.offV} s={fs} side={1} k="goffV" label={g.offV} /> : <T x={x0 + g.L + fs * 1.6} y={-fs * 0.3} s={fs * 0.7} anchor="start" fill="#0e7490">đứng 0</T>}
      <T x={0} y={h / 2 + fs * 1.4} s={fs * 0.7} fill="#dc2626">mối hàn</T>
    </svg>
  );
}

export default function LinkPanel({ p, set, members }: { p: Project; set: TabProps['set']; members: Member[] }) {
  const links = p.links ?? [];
  const [open, setOpen] = useState<string | null>(links.find((l) => l.plate)?.id ?? null);
  const label = (src: string) => members.find((m) => m.source === src)?.mark ?? '(đã xoá)';
  const sec = (src: string) => members.find((m) => m.source === src)?.section;
  const upd = (id: string, fn: (l: MemberLink) => void) => set((d) => { const l = d.links?.find((x) => x.id === id); if (l) fn(l); });
  const angleOf = (l: MemberLink) => {
    const da = members.find((m) => m.source === l.a), db = members.find((m) => m.source === l.b);
    if (!da || !db) return 0;
    const u = [da.b[0] - da.a[0], da.b[1] - da.a[1], da.b[2] - da.a[2]], v = [db.b[0] - db.a[0], db.b[1] - db.a[1], db.b[2] - db.a[2]];
    const c = Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v) || 1);
    return Math.round((Math.acos(Math.min(1, c)) * 180) / Math.PI);
  };
  return (
    <Section title={`接続 · 合掌プレート (${links.length})`}>
      {!links.length && <p className="muted small">Chưa có liên kết. Dùng lệnh ✂ 切断 hoặc ⧉ 結合 ở tab Nhập cột · dầm.</p>}
      {!!links.length && (
        <table className="table jlist">
          <thead>
            <tr>
              <th>Cây 1</th>
              <th>Cây 2</th>
              <th>Kiểu</th>
              <th>継手 / 合掌PL</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {links.map((l) => {
              const on = open === l.id;
              const j = l.jointId ? p.joints.find((x) => x.id === l.jointId) : undefined;
              const lp = linkPoint(members, l.a, l.b);
              const s = sec(l.a);
              return (
                <Fragment key={l.id}>
                  <tr className={'jrow' + (on ? ' sel' : '')} onClick={(e) => !(e.target as HTMLElement).closest('button') && setOpen(on ? null : l.id)}>
                    <td><b>{label(l.a)}</b></td>
                    <td><b>{label(l.b)}</b></td>
                    <td className="small">{l.type === 'spl' ? (j ? jointTypeName(j.type) : '継手') : 'Hàn'}</td>
                    <td className="small">{l.type === 'spl' ? j?.name ?? '?' : l.plate ? `${l.plate.name} PL-${l.plate.t}×${l.plate.H}×${l.plate.L}` : '–'}</td>
                    <td className="nowrap">
                      <button className={'icon' + (on ? ' on' : '')} title="Sửa" onClick={() => setOpen(on ? null : l.id)}>✎</button>
                      <button className="danger icon" title="Xoá liên kết (2 cây giữ nguyên)" onClick={() => set((d) => void (d.links = (d.links ?? []).filter((x) => x.id !== l.id)))}>✕</button>
                    </td>
                  </tr>
                  {on && (
                    <tr>
                      <td colSpan={5}>
                        <div className="card">
                          {lp && <div className="small muted">Điểm nối: X {Math.round(lp.at[0])} · Y {Math.round(lp.at[1])} · Z {Math.round(lp.at[2])} · góc 2 cây {angleOf(l)}°</div>}
                          <div className="grid3">
                            <Field label="Kiểu nối">
                              <Sel
                                value={l.type}
                                onChange={(v: 'spl' | 'weld') => upd(l.id, (x) => { x.type = v; if (v === 'spl') x.jointId ??= p.joints.find((q) => (q.type === 'SPL' || q.type === 'EP') && q.target !== 'brace')?.id; })}
                                options={[{ value: 'spl', label: '継手 (bulông)' }, { value: 'weld', label: 'Hàn (溶接)' }]}
                              />
                            </Field>
                            {l.type === 'spl' && (
                              <Field label="継手">
                                <Sel value={l.jointId ?? ''} onChange={(v) => upd(l.id, (x) => (x.jointId = v))} options={p.joints.filter((q) => q.type === 'SPL' || q.type === 'EP').map((q) => ({ value: q.id, label: `${q.name} · ${jointTypeName(q.type)}` }))} />
                              </Field>
                            )}
                            {l.type === 'weld' && (
                              <Field label="合掌プレート">
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={!!l.plate}
                                    onChange={(e) => upd(l.id, (x) => (x.plate = e.target.checked ? newGassho(links.filter((q) => q.plate).length + 1, s?.h) : undefined))}
                                  />{' '}
                                  Có tấm
                                </label>
                              </Field>
                            )}
                          </div>
                          {l.type === 'weld' && l.plate && (
                            <div className="jd-wrap">
                              <div className="jd-editor">
                                <div className="dc-row">
                                  <label className="dc-in"><span className="dc-tag">Tên</span><Text width={70} value={l.plate.name} onChange={(v) => upd(l.id, (x) => (x.plate!.name = v))} /></label>
                                  <label className="dc-in" data-dim="gt"><span className="dc-tag">t</span><Num value={l.plate.t} min={1} onChange={(v) => upd(l.id, (x) => (x.plate!.t = v))} /></label>
                                  <label className="dc-in" data-dim="gL"><span className="dc-tag">L dài</span><Num value={l.plate.L} min={10} onChange={(v) => upd(l.id, (x) => (x.plate!.L = v))} /></label>
                                  <label className="dc-in" data-dim="gH"><span className="dc-tag">H cao</span><Num value={l.plate.H} min={10} onChange={(v) => upd(l.id, (x) => (x.plate!.H = v))} /></label>
                                </div>
                                <div className="dc-row">
                                  <label className="dc-in" data-dim="goff"><span className="dc-tag">Dời dọc (+ theo cây 1)</span><Num value={l.plate.off} onChange={(v) => upd(l.id, (x) => (x.plate!.off = v))} /></label>
                                  <label className="dc-in" data-dim="goffV"><span className="dc-tag">Dời đứng (+ lên)</span><Num value={l.plate.offV} onChange={(v) => upd(l.id, (x) => (x.plate!.offV = v))} /></label>
                                  <label className="dc-in"><span className="dc-tag">Số mặt</span>
                                    <Sel value={String(l.plate.sides)} onChange={(v) => upd(l.id, (x) => (x.plate!.sides = v === '1' ? 1 : 2))} options={[{ value: '2', label: '2 mặt bụng' }, { value: '1', label: '1 mặt' }]} />
                                  </label>
                                  <label className="dc-in"><span className="dc-tag">Vật liệu</span>
                                    <Sel value={l.plate.material ?? ''} onChange={(v) => upd(l.id, (x) => (v ? (x.plate!.material = v) : delete x.plate!.material))} options={[{ value: '', label: 'Theo 部材' }, ...p.params.member.allowedMaterials.map((m) => ({ value: m, label: m }))]} />
                                  </label>
                                </div>
                              </div>
                              <GasshoShape g={l.plate} h={s?.h ?? 300} tf={Math.max(s?.tf ?? 9, 6)} angle={angleOf(l)} />
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}
