import { JIS_BOLT_GRADES } from '../jis';
// Tab 0 パラメーター: tiêu chuẩn của công trình (quyền cao nhất), lưu lại để dùng cho công trình sau
import { useState } from 'react';
import { JIS_SECTIONS, findJis } from '../jis';
import { Params, planShowOf, bracketWeldOf, BracketWeld, Project, SectionSpec, checkParams, defaultParams, ensureSection, sectionCode, ANCHOR_LABEL, MasterKind, MASTER_KIND_LABEL, BeamDir, BEAM_DIR_LABEL, GplCut, GPL_CUT_LABEL, defaultDiaphragm, DiaphragmParams, DiaphragmType, DIAPHRAGM_TYPE_LABEL } from '../model';
import { Field, Num, Sel, Section, TabProps, Text } from '../ui';
import { download } from './OutputTabs';

const LIB_KEY = 'steel3t.params.library';
const DEFAULT_KEY = 'steel3t.params.default';

export function loadLibrary(): Params[] {
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) || '[]');
  } catch {
    return [];
  }
}
function saveLibrary(lib: Params[]) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  } catch {
    /* bỏ qua */
  }
}
/** パラメーター mặc định cho công trình mới (nếu người dùng đã chọn) */
export function defaultParamsForNew(): Params | null {
  try {
    const name = localStorage.getItem(DEFAULT_KEY);
    return loadLibrary().find((x) => x.name === name) ?? null;
  } catch {
    return null;
  }
}

/** Áp パラメーター vào công trình: mọi thiết lập phải theo tiêu chuẩn */
export function applyParams(d: Project) {
  const P = d.params;
  d.roof.purlinSectionId = ensureSection(d, P.purlin.section, P.purlin.material);
  d.roof.purlinSpacing = Math.min(d.roof.purlinSpacing, P.purlin.maxSpacing);
  d.roof.purlinEdge = P.purlin.edge;
  d.walls.girtSectionId = ensureSection(d, P.girt.section, P.girt.material);
  d.walls.girtSpacing = Math.min(d.walls.girtSpacing, P.girt.maxSpacing);
  d.walls.firstGirt = P.girt.firstGirt;
  for (const m of d.master) if (!P.member.allowedMaterials.includes(m.material)) m.material = P.member[m.kind].material;
  for (const id of [d.roof.purlinSectionId, d.walls.girtSectionId]) {
    const s = d.sections.find((x) => x.id === id);
    if (s) s.material = id === d.roof.purlinSectionId ? P.purlin.material : P.girt.material;
  }
}

/** Tiết diện tiêu chuẩn 母屋・胴縁: chỉ chọn theo JIS (リップ溝形鋼) */
function SpecEditor({ spec, onChange }: { spec: SectionSpec; onChange: (s: SectionSpec) => void }) {
  const code = sectionCode(spec);
  const cats = JIS_SECTIONS.filter((c) => c.items.some((i) => i.spec.type === 'C' || i.spec.type === 'Z'));
  return (
    <Field label="Tiết diện (JIS)">
      <select
        value={code}
        onChange={(e) => {
          const f = findJis(e.target.value);
          if (f) onChange({ ...f.item.spec });
        }}
      >
        {!findJis(code) && <option value={code}>⚠ {code} (ngoài JIS)</option>}
        {cats.map((c) => (
          <optgroup key={c.id} label={`${c.name} – ${c.standard}`}>
            {c.items.map((i) => (
              <option key={i.code} value={i.code}>
                {i.code} · {i.kg} kg/m
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}

export default function ParamsTab({ p, set, sub }: TabProps) {
  const P = p.params;
  const issues = checkParams(p);
  const [lib, setLib] = useState<Params[]>(loadLibrary);
  const [defName, setDefName] = useState(() => {
    try {
      return localStorage.getItem(DEFAULT_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const up = (fn: (P: Params) => void) => set((d) => fn(d.params));
  const dia = { ...defaultDiaphragm(), ...(P.member.diaphragm ?? {}) };
  const upD = (fn: (d: DiaphragmParams) => void) => up((x) => { x.member.diaphragm = { ...defaultDiaphragm(), ...(x.member.diaphragm ?? {}) }; fn(x.member.diaphragm); });

  const status = (
    <Section title="Kiểm tra tuân thủ パラメーター" actions={<button className="primary" onClick={() => set((d) => applyParams(d))}>Áp dụng cho công trình</button>}>
      {issues.length ? (
        <div className="alert error">
          {issues.map((x) => (
            <div key={x}>⚠ {x}</div>
          ))}
        </div>
      ) : (
        <div className="alert ok">✓ Công trình đang tuân theo “{P.name}”.</div>
      )}
    </Section>
  );

  if (sub === 'weld')
    return (
      <>
        {status}
        <Section title="Tiêu chuẩn hàn (溶接)" actions={<button onClick={() => up((x) => void x.weld.rows.push({ tMax: 25, leg: 12, kind: '隅肉 (fillet)' }))}>+ Thêm dòng</button>}>
          <table className="table">
            <thead>
              <tr>
                <th>Chiều dày bản ≤ (mm)</th>
                <th>Cạnh hàn (mm)</th>
                <th>Loại hàn</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {P.weld.rows.map((r, i) => (
                <tr key={i}>
                  <td>
                    <Num value={r.tMax} onChange={(v) => up((x) => (x.weld.rows[i].tMax = v))} />
                  </td>
                  <td>
                    <Num value={r.leg} onChange={(v) => up((x) => (x.weld.rows[i].leg = v))} />
                  </td>
                  <td>
                    <Sel
                      value={r.kind}
                      onChange={(v) => up((x) => (x.weld.rows[i].kind = v))}
                      options={['隅肉 (fillet)', '部分溶込み (PJP)', '完全溶込み (CJP)'].map((k) => ({ value: k, label: k }))}
                    />
                  </td>
                  <td>
                    <button className="danger icon" onClick={() => up((x) => void x.weld.rows.splice(i, 1))}>
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Field label="Que hàn / dây hàn">
            <Text value={P.weld.electrode} onChange={(v) => up((x) => (x.weld.electrode = v))} />
          </Field>
          <Field label="Liên kết cột – dầm">
            <Text value={P.weld.columnBeam} onChange={(v) => up((x) => (x.weld.columnBeam = v))} />
          </Field>
          <Field label="Kiểm tra">
            <Text value={P.weld.inspection} onChange={(v) => up((x) => (x.weld.inspection = v))} />
          </Field>
          <p className="muted small">Cạnh hàn của mối nối (継手) loại hàn tự lấy theo bảng này.</p>
        </Section>
        {(() => {
          const bw = bracketWeldOf(P);
          const setB = (f: (b: BracketWeld) => void) => up((x) => { const b = bracketWeldOf(x); f(b); x.weld.bracket = b; });
          return (
            <Section title="Hàn ブラケット ↔ 本柱">
              <p className="muted small">Mặt trên / dưới FLG của 大梁 (ブラケット) hàn với tấm ダイアフラム bằng 完全溶込み溶接 (開先). Web hàn với mặt ngoài 部材 liên kết. Các chi tiết hàn với nhau gộp thành 1 組立品.</p>
              <Field label="FLG: ルート間隔 (mm)">
                <Num value={bw.rootGap} onChange={(v) => setB((b) => (b.rootGap = v))} />
              </Field>
              <Field label="FLG: 開先角度 (°)">
                <Num value={bw.bevel} onChange={(v) => setB((b) => (b.bevel = v))} />
              </Field>
              <Field label="Web: kiểu hàn">
                <Sel value={bw.webKind} onChange={(v) => setB((b) => (b.webKind = v as BracketWeld['webKind']))} options={[{ value: '隅肉', label: '隅肉溶接 (両面)' }, { value: '完全溶込み', label: '完全溶込み溶接' }]} />
              </Field>
              <Field label="ブラケット: 形状">
                <Sel value={bw.scallop ?? 'non'} onChange={(v) => setB((b) => (b.scallop = v as 'scallop' | 'non'))} options={[{ value: 'non', label: 'ノンスカラップ (không khoét bụng)' }, { value: 'scallop', label: 'スカラップ (khoét bụng r1 / r2)' }]} />
              </Field>
              {bw.scallop === 'scallop' && (
                <div className="grid2">
                  <Field label="r1 (mm)">
                    <Num value={bw.r1 ?? 35} onChange={(v) => setB((b) => (b.r1 = v))} />
                  </Field>
                  <Field label="r2 (mm)">
                    <Num value={bw.r2 ?? 10} onChange={(v) => setB((b) => (b.r2 = v))} />
                  </Field>
                </div>
              )}
              {bw.webKind === '隅肉' && (
                <Field label="Web: 脚長 S (mm, 0 = theo bảng)">
                  <Num value={bw.webLeg} onChange={(v) => setB((b) => (b.webLeg = v))} />
                </Field>
              )}
            </Section>
          );
        })()}
      </>
    );

  if (sub === 'member')
    return (
      <>
        {status}
        <Section title="Tiêu chuẩn cột, dầm, giằng">
          <Field label="Vật liệu được phép (cách nhau bởi dấu phẩy)">
            <Text value={P.member.allowedMaterials.join(', ')} onChange={(v) => up((x) => (x.member.allowedMaterials = v.split(',').map((s) => s.trim()).filter(Boolean)))} />
          </Field>
          <table className="table">
            <thead>
              <tr>
                <th>Loại</th>
                <th>Vật liệu mặc định</th>
                <th>Tiền tố 部材名</th>
              </tr>
            </thead>
            <tbody>
              {(['column', 'beam', 'brace'] as MasterKind[]).map((k) => (
                <tr key={k}>
                  <td>{MASTER_KIND_LABEL[k]}</td>
                  <td>
                    <Sel value={P.member[k].material} onChange={(v) => up((x) => (x.member[k].material = v))} options={P.member.allowedMaterials.map((m) => ({ value: m, label: m }))} />
                  </td>
                  <td>
                    <Text width={60} value={P.member[k].prefix} onChange={(v) => up((x) => (x.member[k].prefix = v))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid2" style={{ marginTop: 8 }}>
            <Field label="Mặt trên dầm so với cao độ tầng (mm)">
              <Num value={P.member.beamTopOffset} step={5} onChange={(v) => up((x) => (x.member.beamTopOffset = v))} />
            </Field>
            <Field label="Điểm chuẩn mặc định cột biên">
              <Sel value={String(P.member.defaultAnchorEdge)} onChange={(v) => up((x) => (x.member.defaultAnchorEdge = +v))} options={ANCHOR_LABEL.map((l, i) => ({ value: String(i), label: l }))} />
            </Field>
            <Field label="Cấp bulông">
              <Sel value={P.member.boltGrade} onChange={(v) => up((x) => (x.member.boltGrade = v))} options={JIS_BOLT_GRADES.map((m) => ({ value: m, label: m }))} />
            </Field>
            <Field label="Hướng lắp dầm (左側 → 右側)" hint="Áp cho mọi dầm, từng dầm vẫn sửa được ở Nhập dầm">
              <Sel value={P.member.beamDir ?? 'asc'} onChange={(v) => up((x) => (x.member.beamDir = v as BeamDir))} options={(Object.keys(BEAM_DIR_LABEL) as BeamDir[]).map((k) => ({ value: k, label: BEAM_DIR_LABEL[k] }))} />
            </Field>
            <Field label="GPL: hình dạng cắt FLG" hint="Mặc định cho mọi 継手 GPL, từng 継手 sửa được">
              <Sel value={P.member.gplCut ?? 'one'} onChange={(v) => up((x) => (x.member.gplCut = v as GplCut))} options={(Object.keys(GPL_CUT_LABEL) as GplCut[]).map((k) => ({ value: k, label: GPL_CUT_LABEL[k] }))} />
            </Field>
            <Field label="GPL: t chuẩn so diện tích (mm)" hint="Diện tích chuẩn = cao GPL 片刃落とし × t này">
              <Num value={P.member.gplTref ?? 9} step={1} onChange={(v) => up((x) => (x.member.gplTref = v))} />
            </Field>
          </div>
          <h4 style={{ margin: '12px 0 4px' }}>ダイアフラム · 仕口 (mối nối ブラケット của 本柱)</h4>
          <div className="grid2">
            <Field label="Loại ダイアフラム (角形・円形鋼管)" hint="通し: cắt cột thành 下柱 / 仕口コア / 上柱. H柱 luôn dùng 水平スチフナー">
              <Sel value={dia.type} onChange={(v) => upD((d) => (d.type = v as DiaphragmType))} options={(Object.keys(DIAPHRAGM_TYPE_LABEL) as DiaphragmType[]).map((k) => ({ value: k, label: DIAPHRAGM_TYPE_LABEL[k] }))} />
            </Field>
            <Field label="通し: t = max(t cánh dầm, t cột) + n size">
              <Num value={dia.addThrough} step={1} onChange={(v) => upD((d) => (d.addThrough = v))} />
            </Field>
            <Field label="内 / スチフナー: t = t cánh dầm + n size">
              <Num value={dia.addInner} step={1} onChange={(v) => upD((d) => (d.addInner = v))} />
            </Field>
            <Field label="出寸法 e (mm) – mặc định 25" hint="Khoảng từ mặt cột tới mép ダイアフラム. 0 = tự động 25 (t cột < 28) / 30 (t ≥ 28). Master 本柱 có thể nhập riêng">
              <Num value={dia.overhang} step={5} onChange={(v) => upD((d) => (d.overhang = v))} />
            </Field>
            <Field label="Khoảng hở tối thiểu 2 ダイアフラム (mm)" hint="Kiểm thêm ≥ 10t (để UT)">
              <Num value={dia.minGap} step={10} onChange={(v) => upD((d) => (d.minGap = v))} />
            </Field>
            <Field label="Gộp cánh dầm chênh ≤ (mm)" hint="Dầm khác chiều cao: cánh gần nhau dùng chung 1 ダイアフラム">
              <Num value={dia.merge} step={5} onChange={(v) => upD((d) => (d.merge = v))} />
            </Field>
            <Field label="m1 · m2 tối thiểu (mm)" hint="Khoảng từ mép cánh dầm (tại mép ダイアフラム) tới mặt trên / dưới ダイアフラム. Dầm dốc: cánh cắt đứng cao tf/cosθ → chưa đủ thì tăng t theo dãy PL">
              <Num value={dia.minM ?? 3} step={1} onChange={(v) => upD((d) => (d.minM = v))} />
            </Field>
          </div>
          <p className="muted small">Dãy chiều dày bản: 6·9·12·16·19·22·25·28·32·36·40… Ví dụ cánh dầm 16, cột 12 → 通し max 16 {'+'}2 size = 22; nếu m1 / m2 &lt; tối thiểu thì tăng tiếp (25, 28…). 内 {'+'}1 size theo t cánh dầm.</p>
          <p className="muted small">Master (部材名) chỉ chấp nhận vật liệu trong danh sách. Ví dụ quy tắc đặt tên: tầng + tiền tố + số (1{P.member.column.prefix}1, 2{P.member.beam.prefix}1).</p>
        </Section>
        <Section title="Hiển thị trên Mặt bằng / Trục">
          <div className="row-gap">
            {([['memberName', 'Tên 部材'], ['jointName', 'Tên 継手 (ブラケット / ピン)'], ['plates', 'Tấm SPL / GPL'], ['bolts', 'Bulông'], ['diaphragm', 'Tấm ダイアフラム']] as const).map(([k, l]) => (
              <label key={k} className="check">
                <input type="checkbox" checked={planShowOf(P)[k]} onChange={(e) => up((x) => void (x.plan = { ...planShowOf(x), [k]: e.target.checked }))} /> {l}
              </label>
            ))}
          </div>
          <p className="muted small">Bật / tắt các lớp hiển thị trên bản vẽ Mặt bằng / Trục (本体 › Mặt bằng / Trục).</p>
        </Section>
      </>
    );

  if (sub === 'sec2')
    return (
      <>
        {status}
        <Section title="Tiêu chuẩn 母屋 (xà gồ mái)">
          <SpecEditor spec={P.purlin.section} onChange={(s) => up((x) => (x.purlin.section = s))} />
          <div className="grid2">
            <Field label="Vật liệu">
              <Text value={P.purlin.material} onChange={(v) => up((x) => (x.purlin.material = v))} />
            </Field>
            <Field label="Bước tối đa (mm)">
              <Num value={P.purlin.maxSpacing} min={300} step={50} onChange={(v) => up((x) => (x.purlin.maxSpacing = v))} />
            </Field>
            <Field label="Xà gồ đầu cách đỉnh cột (mm)">
              <Num value={P.purlin.edge} min={0} step={50} onChange={(v) => up((x) => (x.purlin.edge = v))} />
            </Field>
          </div>
          <div className="muted small">Mã: {sectionCode(P.purlin.section)}</div>
        </Section>
        <Section title="Tiêu chuẩn 胴縁 (xà gồ tường)">
          <SpecEditor spec={P.girt.section} onChange={(s) => up((x) => (x.girt.section = s))} />
          <div className="grid2">
            <Field label="Vật liệu">
              <Text value={P.girt.material} onChange={(v) => up((x) => (x.girt.material = v))} />
            </Field>
            <Field label="Bước tối đa (mm)">
              <Num value={P.girt.maxSpacing} min={300} step={50} onChange={(v) => up((x) => (x.girt.maxSpacing = v))} />
            </Field>
            <Field label="Thanh đầu cách nền (mm)">
              <Num value={P.girt.firstGirt} min={0} step={50} onChange={(v) => up((x) => (x.girt.firstGirt = v))} />
            </Field>
          </div>
          <div className="muted small">Mã: {sectionCode(P.girt.section)}</div>
        </Section>
      </>
    );

  // Thư viện: lưu / nạp / mặc định cho công trình mới
  const saveToLib = () => {
    const next = [...lib.filter((x) => x.name !== P.name), structuredClone(P)];
    setLib(next);
    saveLibrary(next);
  };
  return (
    <>
      {status}
      <Section title="パラメーター đang dùng">
        <Field label="Tên bộ tiêu chuẩn">
          <Text value={P.name} onChange={(v) => up((x) => (x.name = v))} />
        </Field>
        <div className="row-gap">
          <button className="primary" onClick={saveToLib}>
            Lưu vào thư viện
          </button>
          <button onClick={() => download(`${P.name}.params.json`, JSON.stringify(P, null, 2), 'application/json')}>Xuất file</button>
          <label className="file-btn">
            Nhập file…
            <input
              type="file"
              accept=".json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f)
                  f.text().then((t) => {
                    try {
                      const np = { ...defaultParams(), ...JSON.parse(t) } as Params;
                      set((d) => {
                        d.params = np;
                        applyParams(d);
                      });
                    } catch {
                      alert('File パラメーター không hợp lệ');
                    }
                  });
                e.target.value = '';
              }}
            />
          </label>
          <button onClick={() => set((d) => void (d.params = defaultParams()))}>Về mặc định</button>
        </div>
      </Section>
      <Section title={`Thư viện パラメーター (${lib.length})`}>
        <p className="muted small">Thư viện lưu trong trình duyệt này. Nạp một bộ vào công trình sẽ áp dụng ngay mọi tiêu chuẩn. Bộ được đánh dấu ★ tự áp dụng cho công trình mới.</p>
        <table className="table">
          <tbody>
            {lib.map((x) => (
              <tr key={x.name}>
                <td>
                  {defName === x.name ? '★ ' : ''}
                  <b>{x.name}</b>
                </td>
                <td>
                  <div className="row-gap">
                    <button
                      className="primary"
                      onClick={() =>
                        set((d) => {
                          d.params = { ...defaultParams(), ...structuredClone(x) };
                          applyParams(d);
                        })
                      }
                    >
                      Nạp
                    </button>
                    <button
                      onClick={() => {
                        const v = defName === x.name ? '' : x.name;
                        setDefName(v);
                        try {
                          localStorage.setItem(DEFAULT_KEY, v);
                        } catch {
                          /* bỏ qua */
                        }
                      }}
                    >
                      {defName === x.name ? 'Bỏ ★' : '★ Mặc định'}
                    </button>
                    <button
                      className="danger icon"
                      onClick={() => {
                        const next = lib.filter((y) => y.name !== x.name);
                        setLib(next);
                        saveLibrary(next);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!lib.length && (
              <tr>
                <td className="muted">Chưa có bộ nào. Bấm “Lưu vào thư viện”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Section>
    </>
  );
}
