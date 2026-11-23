import { useState } from 'react';
import { uid, kgPerM, sectionArea, KIND_LABEL } from '../model';
import { Field, Sel, Section, TabProps, Text, fmtKg, fmtMm } from '../ui';
import { bomByMark } from '../build';
import { JIS_MATERIALS, JIS_MATERIAL_GROUPS, JIS_SECTIONS, findJis } from '../jis';

function SectionLib({ p, set }: TabProps) {
  const usage = (id: string) =>
    p.master.filter((m) => m.sectionId === id).length +
    [p.roof.rafterSectionId, p.roof.purlinSectionId, p.walls.girtSectionId].filter((x) => x === id).length;
  return (
    <>
      <Section title="Thêm tiết diện">
        <p className="muted small">Kích thước luôn lấy theo chuẩn JIS. Thêm tiết diện ở tab phụ “規格 JIS”, hoặc chọn trực tiếp trong Master (部材名), 母屋, 胴縁.</p>
      </Section>
      <Section title={`Thư viện tiết diện (${p.sections.length})`}>
        <table className="table">
          <thead>
            <tr>
              <th>Mã</th>
              <th>Loại</th>
              <th>A (cm²)</th>
              <th>kg/m</th>
              <th>VL</th>
              <th>Dùng</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.sections.map((s, i) => {
              const n = usage(s.id);
              return (
                <tr key={s.id}>
                  <td>
                    <b>{s.code}</b>
                    {!findJis(s.code) && <div className="warn-text small">⚠ ngoài JIS</div>}
                  </td>
                  <td>{s.type}</td>
                  <td className="num">{(sectionArea(s) / 100).toFixed(2)}</td>
                  <td className="num">{kgPerM(s).toFixed(2)}</td>
                  <td>
                    <Text width={60} value={s.material} onChange={(v) => set((d) => (d.sections[i].material = v))} />
                  </td>
                  <td className="num">{n}</td>
                  <td>
                    <button className="danger icon" disabled={n > 0} title={n > 0 ? 'Đang được sử dụng' : 'Xoá'} onClick={() => set((d) => d.sections.splice(i, 1))}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}

export default function CodeTab(props: TabProps & { highlight: string | null; onHighlight: (m: string | null) => void }) {
  const { p, sub, members, highlight, onHighlight } = props;
  if (sub === 'sec') return <SectionLib {...props} />;
  if (sub === 'jis') return <JisLib {...props} />;
  if (sub === 'mat') {
    const mats = [...new Set(p.sections.map((s) => s.material))];
    return (
      <Section title="Vật liệu">
        <table className="table">
          <thead>
            <tr>
              <th>Mác thép</th>
              <th>Số tiết diện</th>
              <th>Khối lượng (kg)</th>
            </tr>
          </thead>
          <tbody>
            {mats.map((m) => (
              <tr key={m}>
                <td>{m}</td>
                <td className="num">{p.sections.filter((s) => s.material === m).length}</td>
                <td className="num">{fmtKg(members.filter((x) => x.section.material === m).reduce((a, x) => a + x.weight, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Khối lượng riêng thép: 7850 kg/m³. Đổi mác thép trong thư viện tiết diện.</p>
      </Section>
    );
  }
  const rows = bomByMark(members);
  return (
    <Section title={`Mã cấu kiện (${rows.length})`} actions={highlight && <button onClick={() => onHighlight(null)}>Bỏ chọn</button>}>
      <p className="muted small">Cấu kiện cùng loại, cùng tiết diện, cùng chiều dài được gán cùng mã. Bấm vào một dòng để tô sáng trong 3D.</p>
      <table className="table clickable">
        <thead>
          <tr>
            <th>Mã</th>
            <th>Loại</th>
            <th>Tiết diện</th>
            <th>Dài (mm)</th>
            <th>SL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.mark + "|" + r.length} className={highlight === r.mark ? 'active' : ''} onClick={() => onHighlight(highlight === r.mark ? null : r.mark)}>
              <td>
                <b>{r.mark}</b>
              </td>
              <td>{KIND_LABEL[r.kind]}</td>
              <td>{r.section}</td>
              <td className="num">{fmtMm(r.length)}</td>
              <td className="num">{r.qty}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function JisLib({ p, set }: TabProps) {
  const [cat, setCat] = useState(JIS_SECTIONS[0].id);
  const [view, setView] = useState<'sec' | 'mat'>('sec');
  const [mg, setMg] = useState('');
  const allow = (codes: string[], on: boolean) =>
    set((d) => {
      const a = d.params.member.allowedMaterials.filter((x) => !codes.includes(x));
      if (on) a.push(...codes);
      d.params.member.allowedMaterials = a;
    });
  const c = JIS_SECTIONS.find((x) => x.id === cat)!;
  const has = (code: string) => p.sections.some((s) => s.code === code);
  return (
    <>
      <Section title="規格 – chuẩn thép kết cấu Nhật (JIS)">
        <div className="seg">
          <button className={view === 'sec' ? 'on' : ''} onClick={() => setView('sec')}>
            Kích thước tiết diện
          </button>
          <button className={view === 'mat' ? 'on' : ''} onClick={() => setView('mat')}>
            Vật liệu
          </button>
        </div>
        {view === 'sec' && (
          <Field label="Loại thép">
            <Sel value={cat} onChange={setCat} options={JIS_SECTIONS.map((x) => ({ value: x.id, label: `${x.name} – ${x.standard}` }))} />
          </Field>
        )}
        <p className="muted small">Khối lượng và đặc trưng tiết diện lấy theo bảng catalogue (角形鋼管 BCR/BCP/STKR, 円形鋼管, 溝形鋼, リップ溝形鋼, 軽溝形鋼); H形鋼, 山形鋼 theo bảng JIS; một số cỡ nhỏ và 丸鋼 theo công thức. Rê chuột lên I, Z, i để xem trục yếu / Zp.</p>
      </Section>
      {view === 'sec' ? (
        <Section
          title={`${c.name} (${c.items.length}) · VL mặc định ${c.material}`}
          actions={
            <button
              onClick={() =>
                set((d) => {
                  for (const it of c.items) if (!d.sections.some((s) => s.code === it.code)) d.sections.push({ id: uid('sc'), code: it.code, ...it.spec, material: c.material, kgm: it.kg });
                })
              }
            >
              Thêm tất cả
            </button>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>Quy cách</th>
                <th className="num">A (cm²)</th>
                <th className="num">kg/m</th>
                <th className="num">I (cm⁴)</th>
                <th className="num">Z (cm³)</th>
                <th className="num">i (cm)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {c.items.map((it) => {
                const sec = { id: '', code: it.code, ...it.spec, material: c.material, kgm: it.kg };
                return (
                  <tr key={it.code}>
                    <td>
                      <b>{it.code}</b>
                    </td>
                    <td className="num">{it.props ? it.props.A : (sectionArea(sec) / 100).toFixed(2)}</td>
                    <td className="num">{it.props ? it.kg : kgPerM(sec).toFixed(1)}</td>
                    <td className="num" title={it.props?.Iy ? `Iy ${it.props.Iy}` : ''}>{it.props?.I.toLocaleString() ?? '–'}</td>
                    <td className="num" title={it.props?.Zp ? `Zp ${it.props.Zp}` : it.props?.Zy ? `Zy ${it.props.Zy}` : ''}>{it.props?.Z.toLocaleString() ?? '–'}</td>
                    <td className="num" title={it.props?.iy ? `iy ${it.props.iy}` : ''}>{it.props?.i ?? '–'}</td>
                    <td>
                      {has(it.code) ? (
                        <span className="muted small">✓ Đã có</span>
                      ) : (
                        <button onClick={() => set((d) => void d.sections.push({ id: uid('sc'), code: it.code, ...it.spec, material: c.material, kgm: it.kg }))}>+ Thêm</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      ) : (
        <Section
          title={`Vật liệu JIS (${JIS_MATERIALS.length})`}
          actions={
            <select value={mg} onChange={(e) => setMg(e.target.value)}>
              <option value="">Tất cả nhóm</option>
              {JIS_MATERIAL_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>Mác</th>
                <th>Tiêu chuẩn</th>
                <th className="num">F</th>
                <th className="num">fu</th>
                <th>Cho phép</th>
              </tr>
            </thead>
            {JIS_MATERIAL_GROUPS.filter((g) => !mg || g === mg).map((g) => {
              const list = JIS_MATERIALS.filter((m) => m.group === g);
              const codes = list.map((m) => m.code);
              const nOn = codes.filter((c) => p.params.member.allowedMaterials.includes(c)).length;
              return (
                <tbody key={g}>
                  <tr className="group-row">
                    <td colSpan={4}>
                      <b>{g}</b> <span className="muted small">({list.length})</span>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        title="Cho phép cả nhóm"
                        checked={nOn === codes.length}
                        ref={(el) => el && (el.indeterminate = nOn > 0 && nOn < codes.length)}
                        onChange={(e) => allow(codes, e.target.checked)}
                      />
                    </td>
                  </tr>
                  {list.map((m) => (
                    <tr key={m.code} title={`${m.name}${m.use ? ' – ' + m.use : ''}`}>
                      <td>
                        <b>{m.code}</b>
                        <div className="muted small">
                          {m.name}
                          {m.use && ` · ${m.use}`}
                        </div>
                      </td>
                      <td className="small">{m.standard}</td>
                      <td className="num">{m.F}</td>
                      <td className="num">{m.fu}</td>
                      <td>
                        <input type="checkbox" checked={p.params.member.allowedMaterials.includes(m.code)} onChange={(e) => allow([m.code], e.target.checked)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
          <p className="muted small">F, fu đơn vị N/mm² (t ≤ 40 mm). Cột “Cho phép” đồng bộ với パラメーター › Cột, dầm, giằng.</p>
        </Section>
      )}
    </>
  );
}
