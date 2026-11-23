// Tab 工区 (工区 / グループ / 分類) và tab 塗装
import { Category, Member, PaintSpec, Project, uid } from '../model';
import { selectableKeys } from '../build';
import { Field, Num, Sel, Section, TabProps, Text, fmtKg } from '../ui';

const PALETTE = ['#2563eb', '#d97706', '#059669', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#dc2626', '#64748b'];

/** Chọn các khoá (部材名 / loại cấu kiện) thuộc một nhóm; báo khoá đã thuộc nhóm khác */
function KeyPicker({ p, keys, onChange, taken }: { p: Project; keys: string[]; onChange: (k: string[]) => void; taken: Map<string, string> }) {
  return (
    <div className="keys">
      {selectableKeys(p).map(({ key, label }) => {
        const on = keys.includes(key);
        const other = !on ? taken.get(key) : undefined;
        return (
          <label key={key} className={'chip' + (on ? ' on' : '')} title={other ? `Đang thuộc ${other}` : ''} style={other ? { opacity: 0.55 } : undefined}>
            <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked ? [...keys, key] : keys.filter((k) => k !== key))} />
            {label}
            {other && <span className="small"> ({other})</span>}
          </label>
        );
      })}
    </div>
  );
}

const stats = (members: Member[], f: (m: Member) => boolean) => {
  const ms = members.filter(f);
  return { n: ms.length, kg: ms.reduce((a, m) => a + m.weight, 0), area: ms.reduce((a, m) => a + (m.area ?? 0), 0) };
};

function CategoryEditor({ p, set, members, field, title, hint }: TabProps & { field: 'groups' | 'classes'; title: string; hint: string }) {
  const list = p[field];
  const prop = field === 'groups' ? 'group' : 'cls';
  const takenBy = (except: string) => {
    const m = new Map<string, string>();
    for (const c of list) if (c.id !== except) for (const k of c.keys) m.set(k, c.name);
    return m;
  };
  const dupKeys = (() => {
    const seen = new Map<string, number>();
    for (const c of list) for (const k of c.keys) seen.set(k, (seen.get(k) ?? 0) + 1);
    return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k.slice(2));
  })();
  return (
    <>
      <Section
        title={title}
        actions={
          <button
            className="primary"
            onClick={() => set((d) => void d[field].push({ id: uid('cat'), name: `${field === 'groups' ? 'グループ' : '分類'}${d[field].length + 1}`, color: PALETTE[d[field].length % PALETTE.length], keys: [] }))}
          >
            + Thêm
          </button>
        }
      >
        <p className="muted small">{hint}</p>
        {dupKeys.length > 0 && <div className="alert error">⚠ {dupKeys.join(', ')} đang thuộc nhiều nhóm; cấu kiện sẽ lấy nhóm đứng trước.</div>}
      </Section>
      {list.map((c: Category, i) => {
        const st = stats(members, (m) => m[prop] === c.name);
        return (
          <div className="card" key={c.id}>
            <div className="card-head">
              <input type="color" className="color-input" value={c.color} onChange={(e) => set((d) => (d[field][i].color = e.target.value))} />
              <Text value={c.name} onChange={(v) => set((d) => (d[field][i].name = v))} />
              <button className="danger icon" onClick={() => set((d) => d[field].splice(i, 1))}>
                ✕
              </button>
            </div>
            <KeyPicker p={p} keys={c.keys} taken={takenBy(c.id)} onChange={(k) => set((d) => (d[field][i].keys = k))} />
            <div className="muted small" style={{ marginTop: 6 }}>
              {st.n} cấu kiện · {fmtKg(st.kg)} kg
            </div>
          </div>
        );
      })}
    </>
  );
}

function ZoneEditor({ p, set, members }: TabProps) {
  const gOpts = p.gridsX.map((g) => ({ value: g.id, label: `Trục ${g.name}` }));
  const none = stats(members, (m) => !m.zone);
  return (
    <>
      <Section
        title="工区 – phân khu thi công"
        actions={
          <button
            className="primary"
            onClick={() =>
              set((d) =>
                void d.zones.push({ id: uid('zn'), name: `${d.zones.length + 1}工区`, color: PALETTE[(d.zones.length + 5) % PALETTE.length], x1: d.gridsX[0]?.id ?? '', x2: d.gridsX[d.gridsX.length - 1]?.id ?? '' }),
              )
            }
          >
            + Thêm 工区
          </button>
        }
      >
        <p className="muted small">Mỗi 工区 là một dải theo trục số (X). Cấu kiện thuộc 工区 theo vị trí giữa thanh; thanh nằm đúng trục ranh giới thuộc 工区 đứng trước.</p>
        {none.n > 0 && <div className="alert info">{none.n} cấu kiện chưa thuộc 工区 nào.</div>}
      </Section>
      {p.zones.map((z, i) => {
        const st = stats(members, (m) => m.zone === z.name);
        return (
          <div className="card" key={z.id}>
            <div className="card-head">
              <input type="color" className="color-input" value={z.color} onChange={(e) => set((d) => (d.zones[i].color = e.target.value))} />
              <Text value={z.name} onChange={(v) => set((d) => (d.zones[i].name = v))} />
              <button className="danger icon" onClick={() => set((d) => d.zones.splice(i, 1))}>
                ✕
              </button>
            </div>
            <div className="grid2">
              <Field label="Từ trục">
                <Sel value={z.x1} onChange={(v) => set((d) => (d.zones[i].x1 = v))} options={gOpts} />
              </Field>
              <Field label="Đến trục">
                <Sel value={z.x2} onChange={(v) => set((d) => (d.zones[i].x2 = v))} options={gOpts} />
              </Field>
            </div>
            <div className="muted small">
              {st.n} cấu kiện · {fmtKg(st.kg)} kg
            </div>
          </div>
        );
      })}
    </>
  );
}

export function ZoneTab(props: TabProps) {
  if (props.sub === 'group')
    return <CategoryEditor {...props} field="groups" title="グループ – nhóm vật liệu" hint="Chọn 部材名 hoặc loại cấu kiện cho từng nhóm. Tên nhóm hiện trong 出荷リスト và trong 作図 (lọc bản vẽ theo nhóm)." />;
  if (props.sub === 'cls')
    return <CategoryEditor {...props} field="classes" title="分類 – phân loại" hint="Dùng giống グループ, là một cách phân loại thứ hai (vd: 本体鉄骨 / 二次部材). Hiện trong 出荷リスト và 作図." />;
  return <ZoneEditor {...props} />;
}

export function PaintTab({ p, set, members, sub }: TabProps) {
  const takenBy = (except: string) => {
    const m = new Map<string, string>();
    for (const c of p.paints) if (c.id !== except) for (const k of c.keys) m.set(k, c.name);
    return m;
  };
  if (sub === 'sum') {
    const rows = [...p.paints.map((s) => ({ s, ...stats(members, (m) => m.paint === s.name) })), { s: null as PaintSpec | null, ...stats(members, (m) => !m.paint) }];
    return (
      <Section title="Tổng hợp 塗装">
        <table className="table">
          <thead>
            <tr>
              <th>Chỉ thị</th>
              <th>Quy cách</th>
              <th className="num">SL</th>
              <th className="num">KL (kg)</th>
              <th className="num">Diện tích (m²)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s?.id ?? 'none'}>
                <td>
                  {r.s ? (
                    <>
                      <span className="swatch" style={{ background: r.s.color }} /> {r.s.name}
                    </>
                  ) : (
                    <span className="muted">Chưa chỉ thị</span>
                  )}
                </td>
                <td className="small">{r.s ? `${r.s.kind === 'galv' ? 'メッキ' : '塗装'} ${r.s.spec} · ${r.s.coats} lớp · ${r.s.thickness} µm` : ''}</td>
                <td className="num">{r.n}</td>
                <td className="num">{fmtKg(r.kg)}</td>
                <td className="num">{r.area.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">Diện tích sơn = chu vi tiết diện × chiều dài (bề mặt ngoài).</p>
      </Section>
    );
  }
  return (
    <>
      <Section
        title="Chỉ thị 塗装 / メッキ"
        actions={
          <button
            className="primary"
            onClick={() => set((d) => void d.paints.push({ id: uid('pt'), name: `塗装${d.paints.length + 1}`, kind: 'paint', color: PALETTE[d.paints.length % PALETTE.length], spec: '', coats: 1, thickness: 35, keys: [] }))}
          >
            + Thêm chỉ thị
          </button>
        }
      >
        <p className="muted small">Chọn vật liệu (部材名 hoặc loại cấu kiện) áp dụng cho mỗi chỉ thị. Bên phải 3D tô màu theo chỉ thị sơn.</p>
      </Section>
      {p.paints.map((s, i) => {
        const st = stats(members, (m) => m.paint === s.name);
        return (
          <div className="card" key={s.id}>
            <div className="card-head">
              <input type="color" className="color-input" value={s.color} onChange={(e) => set((d) => (d.paints[i].color = e.target.value))} />
              <Text value={s.name} onChange={(v) => set((d) => (d.paints[i].name = v))} />
              <button className="danger icon" onClick={() => set((d) => d.paints.splice(i, 1))}>
                ✕
              </button>
            </div>
            <div className="grid2">
              <Field label="Loại">
                <Sel
                  value={s.kind}
                  onChange={(v) => set((d) => (d.paints[i].kind = v))}
                  options={[
                    { value: 'paint', label: '塗装 (sơn)' },
                    { value: 'galv', label: 'メッキ (mạ kẽm)' },
                  ]}
                />
              </Field>
              <Field label="Quy cách / tiêu chuẩn">
                <Text value={s.spec} onChange={(v) => set((d) => (d.paints[i].spec = v))} />
              </Field>
              <Field label="Số lớp">
                <Num value={s.coats} min={1} onChange={(v) => set((d) => (d.paints[i].coats = v))} />
              </Field>
              <Field label={s.kind === 'galv' ? 'Chiều dày mạ (µm)' : 'Chiều dày màng (µm)'}>
                <Num value={s.thickness} min={0} onChange={(v) => set((d) => (d.paints[i].thickness = v))} />
              </Field>
            </div>
            <KeyPicker p={p} keys={s.keys} taken={takenBy(s.id)} onChange={(k) => set((d) => (d.paints[i].keys = k))} />
            {s.kind === 'galv' && /HDZ\s?\d/.test(s.spec) && <div className="alert error">⚠ Ký hiệu cũ. JIS H 8641:2021 dùng HDZT (µm): HDZ35→HDZT49, HDZ55→HDZT77.</div>}
            {s.kind === 'galv' &&
              (() => {
                const big = members.filter((m) => m.paint === s.name && (m.length > 9500 || Math.min(m.section.h, m.section.b) > 1500));
                return big.length ? (
                  <div className="alert error">
                    ⚠ {big.length} cấu kiện có thể vượt bể mạ (~10 m × 1.5 m × sâu 2.0 m, trừ 0.4 m xỉ): {[...new Set(big.map((m) => m.mark))].slice(0, 6).join(', ')}. Mạ 1 lần nhúng, cần chia đoạn và hỏi xưởng mạ.
                  </div>
                ) : null;
              })()}
            <div className="muted small" style={{ marginTop: 6 }}>
              {st.n} cấu kiện · {fmtKg(st.kg)} kg · {st.area.toFixed(1)} m²
            </div>
          </div>
        );
      })}
    </>
  );
}
