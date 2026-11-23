// Tab 本体 › 仕口: sửa / thêm / xoá cụm 仕口 (ダイアフラム) của từng 本柱
import { useEffect, useMemo, useState } from 'react';
import { bracketWeldOf, DIAPHRAGM_TYPE_LABEL, DiaphragmType, Member, Project, ShikuchiEdit, SkInfo, uid } from '../model';
import { diaParams } from '../build';
import { diaphragmOverhang } from '../standards';
import { Field, Num, Section, TabProps } from '../ui';

const r0 = (v: number) => Math.round(v);
const TYPE_JP: Record<SkInfo['type'], string> = { through: '通し', inner: '内', stiff: 'スチフナー' };

interface Props extends TabProps {
  selected: string | null;
  setSelected: (id: string | null) => void;
}

export default function ShikuchiPanel({ p, set, members, selected, setSelected }: Props) {
  const cols = useMemo(() => p.columns.filter((c) => c.role !== 'post' && !c.pt), [p.columns]);
  const gName = (ax: 'x' | 'y', id: string) => (ax === 'x' ? p.gridsX : p.gridsY).find((g) => g.id === id)?.name ?? '?';
  const mName = (id: string) => p.master.find((m) => m.id === id)?.name ?? '?';
  const label = (c: Project['columns'][number]) => `${mName(c.memberId)} · ${gName('x', c.x)}-${gName('y', c.y)}`;
  const [colId, setColId] = useState<string>(cols[0]?.id ?? '');
  // chọn cột trên 3D → đổi cột đang sửa
  const selMember = members.find((m) => m.id === selected);
  useEffect(() => {
    if (selMember?.kind === 'column' && selMember.source && cols.some((c) => c.id === selMember.source)) setColId(selMember.source);
  }, [selMember?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const col = cols.find((c) => c.id === colId);
  const pieces = members.filter((m) => m.source === colId && m.kind === 'column');
  const sec = pieces.find((m) => !m.part)?.section ?? pieces[0]?.section;
  const tube = sec?.type === 'Box' || sec?.type === 'Pipe';
  const list: { info: SkInfo; m: Member }[] = pieces.flatMap((m) => (m.sk ?? []).map((info) => ({ info, m }))).sort((a, b) => a.info.zc - b.info.zc);
  const eds = col?.shikuchi ?? [];
  const dels = eds.filter((e) => e.mode === 'del');
  const dp = diaParams(p);
  const zRange = pieces.length ? [Math.min(...pieces.map((m) => Math.min(m.a[2], m.b[2]))), Math.max(...pieces.map((m) => Math.max(m.a[2], m.b[2])))] : [0, 0];

  const editCol = (fn: (arr: ShikuchiEdit[]) => ShikuchiEdit[]) =>
    set((d) => {
      const c = d.columns.find((x) => x.id === colId);
      if (!c) return;
      const arr = fn([...(c.shikuchi ?? [])]);
      c.shikuchi = arr.length ? arr : undefined;
    });
  const patch = (info: SkInfo, pt: Partial<ShikuchiEdit>) =>
    editCol((arr) => {
      const i = info.editId ? arr.findIndex((e) => e.id === info.editId) : -1;
      if (i >= 0) arr[i] = { ...arr[i], ...pt };
      else arr.push({ id: uid('sk'), z: r0(info.zc), mode: 'edit', ...pt });
      return arr;
    });
  const remove = (info: SkInfo) =>
    editCol((arr) => {
      const rest = arr.filter((e) => e.id !== info.editId);
      return info.auto ? [...rest, { id: uid('sk'), z: r0(info.zc), mode: 'del' }] : rest;
    });
  const reset = (info: SkInfo) => editCol((arr) => arr.filter((e) => e.id !== info.editId));

  // thêm cụm mới
  const [nz, setNz] = useState(3000);
  const [nh, setNh] = useState(300);
  const [nt, setNt] = useState<DiaphragmType>(dp.type);
  const lvls = [...p.levels].sort((a, b) => a.elevation - b.elevation);
  const add = () =>
    editCol((arr) => [...arr, { id: uid('sk'), z: nz, mode: 'add', h: nh, type: tube ? nt : undefined }]);

  const focus = (m: Member) => setSelected(m.id);

  return (
    <>
      <Section title="仕口 · ダイアフラム của 本柱">
        <p className="muted small">
          Cụm 仕口 tự sinh tại đầu dầm 剛接合 (ブラケット) theo パラメーター ({DIAPHRAGM_TYPE_LABEL[dp.type]}, 通し +{dp.addThrough} size, 内 +{dp.addInner} size,
          出寸法 {dp.overhang || 'tự động 25/30'}). Ở đây sửa riêng từng cụm, thêm cụm mới hoặc xoá. Bấm cột trên 3D để chọn.
        </p>
        <Field label="Cột (本柱)">
          <select value={colId} onChange={(e) => setColId(e.target.value)}>
            {cols.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)} {c.shikuchi?.length ? '✎' : ''}
              </option>
            ))}
          </select>
        </Field>
        {sec && (
          <div className="muted small" style={{ marginTop: 4 }}>
            Tiết diện {sec.code} · {tube ? 'ống → ダイアフラム' : 'H → 水平スチフナー'} · cao độ {r0(zRange[0])} – {r0(zRange[1])} · 出寸法 tự động {diaphragmOverhang(sec.tw)} mm
          </div>
        )}
      </Section>

      {(() => {
        const bw = bracketWeldOf(p.params);
        return (
          <Section title="Hàn ブラケット ↔ 本柱 (theo パラメーター)">
            <table className="table kv">
              <tbody>
                <tr><td>FLG trên / dưới ↔ ダイアフラム</td><td>完全溶込み溶接 · ルート間隔 {bw.rootGap} · 開先角度 {bw.bevel}°</td></tr>
                <tr><td>Web ↔ mặt ngoài 部材</td><td>{bw.webKind === '隅肉' ? `隅肉溶接 (両面) · 脚長 ${bw.webLeg || 'theo bảng chiều dày web'}` : '完全溶込み溶接'}</td></tr>
                <tr><td>組立品</td><td>Cột + 仕口 + ブラケット hàn với nhau → 1 cụm (xem 出荷リスト › 組立品)</td></tr>
              </tbody>
            </table>
          </Section>
        );
      })()}
      <Section title={`Các cụm 仕口 (${list.length})`}>
        {!list.length && <p className="muted small">Cột này chưa có 仕口. Gắn dầm 剛接合 hoặc thêm tay ở dưới.</p>}
        {list.map(({ info, m }, i) => {
          const ed = eds.find((e) => e.id === info.editId);
          return (
            <div key={`${info.zc}-${i}`} className="sk-card" data-sk={i}>
              <div className="sk-head">
                <b>
                  仕口 {i + 1} · {TYPE_JP[info.type]}
                </b>
                <span className={`pill ${info.auto ? '' : 'on'}`}>{info.auto ? (ed ? 'tự động · đã sửa' : 'tự động') : 'thêm tay'}</span>
                <span className="muted small">tâm z = {r0(info.zc)}</span>
                <span style={{ flex: 1 }} />
                <button onClick={() => focus(m)} title="Chọn trên 3D">
                  👁
                </button>
                {ed && info.auto && (
                  <button onClick={() => reset(info)} title="Bỏ chỉnh sửa, về theo パラメーター">
                    ↺
                  </button>
                )}
                <button className="danger" onClick={() => remove(info)} title="Xoá cụm 仕口 này">
                  🗑 Xoá
                </button>
              </div>
              <div className="grid2">
                {!info.auto && (
                  <Field label="Cao độ tâm cụm z (mm)">
                    <Num value={r0(info.zc)} step={10} onChange={(v) => patch(info, { z: v })} />
                  </Field>
                )}
                {tube && (
                  <Field label="Loại ダイアフラム">
                    <select value={info.type === 'through' ? 'through' : 'inner'} onChange={(e) => patch(info, { type: e.target.value as DiaphragmType })}>
                      <option value="through">通しダイアフラム</option>
                      <option value="inner">内ダイアフラム</option>
                    </select>
                  </Field>
                )}
                {info.type === 'through' && (
                  <Field label="出寸法 e (mm)">
                    <Num value={info.overhang} step={5} min={0} onChange={(v) => patch(info, { overhang: v })} />
                  </Field>
                )}
                <Field label="Khoảng cách tâm 2 bản (mm)" hint="= chiều cao cụm 仕口">
                  <Num value={r0(info.h)} step={10} min={0} onChange={(v) => patch(info, { h: v })} />
                </Field>
                <Field label="t bản trên (mm)">
                  <Num value={info.tTop} step={1} min={1} onChange={(v) => patch(info, { tTop: v })} />
                </Field>
                <Field label="t bản dưới (mm)">
                  <Num value={info.tBot} step={1} min={1} onChange={(v) => patch(info, { tBot: v })} />
                </Field>
                {info.type === 'through' && (
                  <Field label="t ống lõi 仕口コア (mm)" hint={`Cột t = ${sec?.tw ?? '?'}`}>
                    <Num value={info.coreT ?? sec?.tw ?? 0} step={1} min={1} onChange={(v) => patch(info, { coreT: v })} />
                  </Field>
                )}
              </div>
              {info.type === 'through' && (
                <div className="muted small">
                  仕口コア: {sec?.code.replace(/[\d.]+$/, String(info.coreT ?? sec?.tw))} · L = {info.coreLen} mm · ダイアフラム PL-{info.tTop}/{info.tBot} ×{' '}
                  {sec ? (sec.type === 'Pipe' ? `φ${r0(sec.h + 2 * info.overhang)}` : `${r0(sec.b + 2 * info.overhang)}×${r0(sec.h + 2 * info.overhang)}`) : ''}
                </div>
              )}
              {info.warn?.map((w) => (
                <div key={w} className="small" style={{ color: '#dc2626' }}>
                  ⚠ {w}
                </div>
              ))}
            </div>
          );
        })}
        {dels.length > 0 && (
          <div className="muted small" style={{ marginTop: 6 }}>
            Đã xoá {dels.length} cụm tự động:{' '}
            {dels.map((e) => (
              <button key={e.id} className="pill" onClick={() => editCol((arr) => arr.filter((x) => x.id !== e.id))} title="Khôi phục">
                ↺ z {e.z}
              </button>
            ))}
          </div>
        )}
      </Section>

      <Section title="Thêm 仕口 vào cột">
        <div className="grid2">
          <Field label="Cao độ tâm z (mm)">
            <Num value={nz} step={10} onChange={setNz} />
          </Field>
          <Field label="Lấy theo tầng">
            <select value="" onChange={(e) => e.target.value && setNz(+e.target.value - nh / 2)}>
              <option value="">– chọn tầng (mặt trên = tầng) –</option>
              {lvls.map((l) => (
                <option key={l.id} value={l.elevation}>
                  {l.name} ({l.elevation})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Khoảng cách tâm 2 bản h (mm)">
            <Num value={nh} step={10} min={50} onChange={setNh} />
          </Field>
          {tube && (
            <Field label="Loại">
              <select value={nt} onChange={(e) => setNt(e.target.value as DiaphragmType)}>
                <option value="through">通しダイアフラム</option>
                <option value="inner">内ダイアフラム</option>
              </select>
            </Field>
          )}
        </div>
        <button className="primary" disabled={!col || nz < zRange[0] || nz > zRange[1]} onClick={add} style={{ marginTop: 8 }}>
          + Thêm 仕口
        </button>
        {col && (nz < zRange[0] || nz > zRange[1]) && <div className="small" style={{ color: '#dc2626' }}>z phải nằm trong cột ({r0(zRange[0])} – {r0(zRange[1])})</div>}
      </Section>
    </>
  );
}
