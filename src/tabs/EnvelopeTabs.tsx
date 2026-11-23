// Tab Mái, Tường, Chi tiết phụ
import { Field, Num, Placeholder, Sel, Section, TabProps, JisSelect, fmtMm } from '../ui';
import { geometry } from '../build';
import { checkParams, sectionCode } from '../model';
import { FULL_BRACE, braceLabel, ensureFullBrace } from '../kiseihin';

export function RoofTab({ p, set, sub, members }: TabProps) {
  const r = p.roof;
  const g = geometry(p);
  const span = g.yN - g.y0;
  const ridge = g.roofZ(g.ridgeY);
  const rafters = members.filter((m) => m.kind === 'rafter');
  const purlins = members.filter((m) => m.kind === 'purlin');
  return (
    <>
      {sub === 'shape' && (
        <Section title="Hình dạng mái">
          <label className="check">
            <input type="checkbox" checked={r.enabled} onChange={(e) => set((d) => (d.roof.enabled = e.target.checked))} /> Có mái (tạo khung kèo tại mỗi trục X)
          </label>
          <div className="grid2">
            <Field label="Kiểu mái">
              <Sel
                value={r.type}
                onChange={(v) => set((d) => (d.roof.type = v))}
                options={[
                  { value: 'gable', label: 'Hai mái dốc' },
                  { value: 'mono', label: 'Một mái dốc' },
                ]}
              />
            </Field>
            <Field label="Độ dốc (quản lý ở tab 勾配)">
              <input type="text" readOnly value={`${p.slope.roofPct}%`} />
            </Field>
            <Field label="Cao độ đỉnh cột (mái đua)">
              <Sel
                value={r.eaveLevel}
                onChange={(v) => set((d) => (d.roof.eaveLevel = v))}
                options={p.levels.map((l) => ({ value: l.id, label: `${l.name} (${l.elevation})` }))}
              />
            </Field>
          </div>
          <table className="table kv">
            <tbody>
              <tr>
                <td>Nhịp nhà (trục Y đầu → cuối)</td>
                <td className="num">{fmtMm(span)} mm</td>
              </tr>
              <tr>
                <td>Cao độ đỉnh mái</td>
                <td className="num">{fmtMm(ridge)} mm</td>
              </tr>
              <tr>
                <td>Góc dốc</td>
                <td className="num">{((Math.atan(p.slope.roofPct / 100) * 180) / Math.PI).toFixed(2)}°</td>
              </tr>
            </tbody>
          </table>
          <p className="muted small">Các cột có đỉnh tại tầng mái đua được tự kéo dài theo đường mái.</p>
        </Section>
      )}
      {sub === 'rafter' && (
        <Section title="Kèo (khung chính)">
          <Field label="Tiết diện kèo">
            <JisSelect p={p} set={set} value={r.rafterSectionId} onChange={(v) => set((d) => (d.roof.rafterSectionId = v))} types={['I', 'Box']} />
          </Field>
          <p className="muted">
            {rafters.length} đoạn kèo trên {p.gridsX.length} khung trục.
          </p>
          <Placeholder title="Sắp có" items={['Kèo vát (tiết diện thay đổi)', 'Chia đoạn kèo & mối nối', 'Vai cột / dầm cầu trục']} />
        </Section>
      )}
      {sub === 'purlin' && (
        <Section title="Xà gồ mái">
          <div className="grid2">
            <Field label="Tiết diện xà gồ">
              <JisSelect p={p} set={set} value={r.purlinSectionId} onChange={(v) => set((d) => (d.roof.purlinSectionId = v))} types={['C', 'Z']} />
            </Field>
            <Field label="Bước xà gồ (mm, theo phương dốc)">
              <Num value={r.purlinSpacing} min={300} step={50} onChange={(v) => set((d) => (d.roof.purlinSpacing = Math.min(v, d.params.purlin.maxSpacing)))} />
            </Field>
            <Field label="Xà gồ đầu tiên cách đỉnh cột (mm)">
              <Num value={r.purlinEdge} min={0} step={50} onChange={(v) => set((d) => (d.roof.purlinEdge = v))} />
            </Field>
          </div>
          <p className="muted">{purlins.length} thanh xà gồ mái (chia theo từng khoang).</p>
          <p className="muted small">
            Theo パラメーター: {sectionCode(p.params.purlin.section)} / {p.params.purlin.material}, bước tối đa {p.params.purlin.maxSpacing} mm.
          </p>
          {checkParams(p).filter((x) => x.startsWith('母屋')).map((x) => (
            <div key={x} className="alert error">⚠ {x}</div>
          ))}
        </Section>
      )}
    </>
  );
}

export function WallTab({ p, set, sub, members }: TabProps) {
  const w = p.walls;
  const girts = members.filter((m) => m.kind === 'girt');
  const sideName = (k: keyof typeof w.sides) => {
    const gx = p.gridsX, gy = p.gridsY;
    return {
      front: `Tường dọc trục ${gy[0]?.name}`,
      back: `Tường dọc trục ${gy[gy.length - 1]?.name}`,
      left: `Tường đầu hồi trục ${gx[0]?.name}`,
      right: `Tường đầu hồi trục ${gx[gx.length - 1]?.name}`,
    }[k];
  };
  return (
    <>
      {sub === 'girt' && (
        <Section title="Xà gồ tường">
          <label className="check">
            <input type="checkbox" checked={w.enabled} onChange={(e) => set((d) => (d.walls.enabled = e.target.checked))} /> Tạo xà gồ tường
          </label>
          <div className="grid2">
            <Field label="Tiết diện">
              <JisSelect p={p} set={set} value={w.girtSectionId} onChange={(v) => set((d) => (d.walls.girtSectionId = v))} types={['C', 'Z']} />
            </Field>
            <Field label="Bước xà gồ (mm)">
              <Num value={w.girtSpacing} min={300} step={50} onChange={(v) => set((d) => (d.walls.girtSpacing = Math.min(v, d.params.girt.maxSpacing)))} />
            </Field>
            <Field label="Thanh đầu tiên cách nền (mm)">
              <Num value={w.firstGirt} min={0} step={50} onChange={(v) => set((d) => (d.walls.firstGirt = v))} />
            </Field>
          </div>
          <p className="muted">{girts.length} thanh xà gồ tường.</p>
          <p className="muted small">
            Theo パラメーター: {sectionCode(p.params.girt.section)} / {p.params.girt.material}, bước tối đa {p.params.girt.maxSpacing} mm.
          </p>
          {checkParams(p).filter((x) => x.startsWith('胴縁')).map((x) => (
            <div key={x} className="alert error">⚠ {x}</div>
          ))}
        </Section>
      )}
      {sub === 'side' && (
        <Section title="Các mặt tường">
          {(Object.keys(w.sides) as (keyof typeof w.sides)[]).map((k) => (
            <label className="check" key={k}>
              <input type="checkbox" checked={w.sides[k]} onChange={(e) => set((d) => (d.walls.sides[k] = e.target.checked))} /> {sideName(k)}
            </label>
          ))}
        </Section>
      )}
      {sub === 'open' && <Placeholder title="Cửa & lỗ mở" items={['Cửa cuốn, cửa đi, cửa sổ theo khoang', 'Tự cắt xà gồ tường tại lỗ mở', 'Khung cửa (trụ, lanh tô)']} />}
    </>
  );
}

export function DetailTab({ p, set, sub }: TabProps) {
  const bays = p.gridsX.slice(0, -1).map((g, i) => ({ i, label: `${g.name} – ${p.gridsX[i + 1].name}` }));
  const toggle = (key: 'roofBays' | 'wallBays', i: number, on: boolean) =>
    set((d) => {
      const arr = d.bracing[key].filter((x) => x !== i);
      if (on) arr.push(i);
      d.bracing[key] = arr.sort((a, b) => a - b);
    });
  const BayPicker = ({ k }: { k: 'roofBays' | 'wallBays' }) => (
    <>
      <Field label="部材名 giằng (từ master)">
        <Sel
          value={p.bracing.memberId}
          onChange={(v) => set((d) => (d.bracing.memberId = v))}
          options={p.master.filter((m) => m.kind === 'brace').map((m) => ({ value: m.id, label: `${m.name} – ${p.sections.find((s) => s.id === m.sectionId)?.code ?? '?'}` }))}
        />
      </Field>
      <div className="kbox">
        <span className="small">📦 hoặc lấy từ フルサト フルブレース: </span>
        <select
          value=""
          onChange={(e) => {
            const dia = +e.target.value;
            if (!dia) return;
            set((d) => {
              const r = ensureFullBrace(d, dia);
              if (r.id) d.bracing.memberId = r.id;
              else if (r.error) console.warn(r.error);
            });
          }}
        >
          <option value="">— chọn quy cách (tự tạo 部材名 FB-M…) —</option>
          {FULL_BRACE.map((r) => (
            <option key={r.d} value={r.d}>
              {braceLabel(r)}
            </option>
          ))}
        </select>
      </div>
      <div className="field-label">Chọn khoang đặt giằng chéo chữ X</div>
      <div className="chips">
        {bays.map((b) => (
          <label key={b.i} className={'chip' + (p.bracing[k].includes(b.i) ? ' on' : '')}>
            <input type="checkbox" checked={p.bracing[k].includes(b.i)} onChange={(e) => toggle(k, b.i, e.target.checked)} />
            {b.label}
          </label>
        ))}
      </div>
    </>
  );
  return (
    <>
      {sub === 'rbrace' && (
        <Section title="Giằng mái">
          <BayPicker k="roofBays" />
        </Section>
      )}
      {sub === 'wbrace' && (
        <Section title="Giằng cột (tường dọc)">
          <BayPicker k="wallBays" />
        </Section>
      )}
      {sub === 'conn' && <Placeholder title="Liên kết, bản mã, bulông" items={['Chân cột: bản đế, bulông neo', 'Nối kèo – cột, nối đỉnh kèo', 'Bản mã liên kết xà gồ', 'Thống kê bulông theo đường kính']} />}
      {sub === 'flash' && <Placeholder title="Diềm, máng xối, phụ kiện" items={['Máng xối, ống xối', 'Diềm mái, diềm góc', 'Thanh chống xà gồ (sag rod)', 'Tôn lợp mái / vách']} />}
    </>
  );
}
