// Bảng マスター dùng chung (母屋 / 胴縁): danh sách + 作成 / 編集 theo 項目名 / 設定値
import { useState } from 'react';
import { Field, Num, Section, Sel, Text } from '../ui';
import { uid } from '../model';
import type { FieldSpec, FieldVal } from '../moya';
import { sizeOf } from '../moya';
import { JIS_SECTIONS } from '../jis';
import SecCodeInput from '../SecCodeInput';
import { PL_T } from '../standards';
import { HlCtx } from '../secPics';
import type { ReactNode } from 'react';
import FloatWin from '../FloatWin';

export interface Rec { id: string; name: string; v: Record<string, FieldVal> }
export interface MasterTab { /** sửa trong cửa sổ riêng (giống 継手): form + hình lớn, ✓ Lưu / ↺ Bỏ */ win?: boolean; k: string; label: string; fields: FieldSpec[]; name: string; prefix: string; col?: (r: Rec) => string; /** hình minh họa theo thông số */ pic?: (r: Rec, all: Record<string, Rec[]>) => ReactNode }

/** サイズ nhập giống master 本体: chọn 規格 → gõ kích thước (danh sách khớp, ↑↓, Enter) – lưu dạng số H×B×C×t */
const CAT_SHORT: Record<string, string> = { 'lip-c': 'リップ溝形鋼', 'light-ch': '軽溝形鋼', channel: '溝形鋼', 'box-stkr': 'STKR', 'box-bcr': 'BCR', 'box-bcp': 'BCP', 'h-narrow': 'H 細幅', 'h-mid': 'H 中幅', 'h-wide': 'H 広幅', angle: '等辺山形鋼', 'angle-u': '不等辺山形鋼', pipe: '鋼管', plate: 'PL' };
function SizeIn({ cats, value, onChange }: { cats: string[]; value: string; onChange: (v: string) => void }) {
  const plate = cats.includes('plate');
  const libs = JIS_SECTIONS.filter((c) => cats.includes(c.id));
  const owner = libs.find((c) => c.items.some((it) => sizeOf(it.spec) === value));
  const [cat, setCat] = useState(owner?.id ?? libs[0]?.id ?? '');
  const cur = libs.find((c) => c.id === cat) ?? libs[0];
  if (plate) {
    const codes = PL_T.map((t) => `PL-${t}`);
    const v = String(value).replace(/^PL-?/i, '');
    return (
      <div className="size-in">
        <SecCodeInput value={v ? `PL-${v}` : ''} codes={codes} onChange={(c) => onChange(c.replace(/^PL-/, ''))} />
        <span className="muted small">{PL_T.includes(Number(v)) ? 'PL theo dãy chiều dày chuẩn' : v ? 'chiều dày ngoài dãy chuẩn' : ''}</span>
      </div>
    );
  }
  const items = (cur?.items ?? []);
  const codeOf = (v: string) => items.find((it) => sizeOf(it.spec) === v)?.code ?? '';
  const hit = items.find((it) => sizeOf(it.spec) === value);
  return (
    <div className="size-in">
      {libs.length > 1 && (
        <div className="seg seg-sm">
          {libs.map((c) => (
            <button key={c.id} className={cur?.id === c.id ? 'on' : ''} onClick={() => setCat(c.id)} title={c.standard}>{CAT_SHORT[c.id] ?? c.name}</button>
          ))}
        </div>
      )}
      <SecCodeInput value={codeOf(value) || value} codes={items.map((it) => it.code)} onChange={(code) => { const it = items.find((x) => x.code === code); if (it) onChange(sizeOf(it.spec)); }} />
      <span className={`small ${hit ? 'muted' : 'jis-own'}`}>{hit ? `${cur?.standard ?? ''} · ${hit.kg} kg/m` : value ? `${value} – không có trong thư viện` : ''}</span>
    </div>
  );
}

/** Bảng 項目名 / 設定値 */
function RefSel({ f, value, data, onChange }: { f: FieldSpec; value: string; data?: Record<string, Rec[]>; onChange: (x: string) => void }) {
  const all = data?.[f.ref!.tab] ?? [];
  const typed = f.ref!.type ? all.filter((r) => String(r.v.type ?? '').startsWith(f.ref!.type!)) : all;
  const list = typed.length ? typed : all;
  const cur = all.find((r) => r.name === value);
  const none = f.ref!.none ?? '';
  const isNone = !value || value === none;
  const opts = [{ value: none, label: '— なし —' }, ...list.map((r) => ({ value: r.name, label: r.name }))];
  if (!isNone && !list.some((r) => r.name === value)) opts.push({ value, label: `${value} (chưa có trong tab ${f.ref!.label})` });
  return (
    <div className="jis-combo ref-combo">
      <Sel value={value} onChange={onChange} options={opts} />
      <span className={`small ${cur || isNone ? 'muted' : 'jis-own'}`}>
        {cur ? `${String(cur.v.type ?? cur.v.kind ?? '').replace(/^\d+-/, '')} · ${String(cur.v.mat ?? '').replace(/^\d+-/, '')} ${String(cur.v.size ?? '')}` : !isNone ? 'chưa khai báo' : `chọn từ tab ${f.ref!.label} (${list.length})`}
      </span>
    </div>
  );
}

export function PropTable({ fields, v, onChange, data, focus, onFocus }: { fields: FieldSpec[]; v: Record<string, FieldVal>; onChange: (k: string, x: FieldVal) => void; data?: Record<string, Rec[]>; focus?: string; onFocus?: (k: string) => void }) {
  return (
    <table className="table kv prop-table">
      <thead>
        <tr><th>項目名</th><th>設定値</th></tr>
      </thead>
      <tbody>
        {fields.filter((f) => !f.when || f.when(v)).map((f) => (
          <tr key={f.k} className={focus === f.k ? 'row-focus' : ''} onFocusCapture={() => onFocus?.(f.k)} onPointerDown={() => onFocus?.(f.k)}>
            <td>{f.label}</td>
            <td>
              {f.t === 'ref' && f.ref ? (
                <RefSel f={f} value={String(v[f.k] ?? '')} data={data} onChange={(x) => onChange(f.k, x)} />
              ) : f.t === 'num' ? (
                <Num signed value={Number(v[f.k] ?? 0)} onChange={(x) => onChange(f.k, x)} />
              ) : f.t === 'jis' && f.cats?.(v).length ? (
                <SizeIn cats={f.cats(v)} value={String(v[f.k] ?? '')} onChange={(x) => onChange(f.k, x)} />
              ) : f.t === 'sel' ? (
                <Sel value={String(v[f.k] ?? '')} onChange={(x) => onChange(f.k, x)} options={[...new Set([...(f.optsFn?.(v).length ? f.optsFn(v) : f.opts ?? []), String(v[f.k] ?? '')])].filter((o) => o !== '').map((o) => ({ value: o, label: o }))} />
              ) : (
                <Text value={String(v[f.k] ?? '')} onChange={(x) => onChange(f.k, x)} />
              )}
              {f.hint && <div className="muted small">{f.hint}</div>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const NONE = new Set(['', '<なし>', '<無>', 'マスター参照']);
/** Tên ピース / 部品 được dùng nhưng chưa khai báo (hiện chữ đỏ) */
export function usedNames(data: Record<string, Rec[]>, k: string): string[] {
  const keys: Record<string, string[]> = {
    pieces: ['support', 'connect', 'corner'],
    parts: ['filler', 'endPart', 'reinforce', 'lipFiller', 'lipFillerL', 'lipFillerR'],
  };
  const want = keys[k];
  if (!want) return [];
  const s = new Set<string>();
  for (const list of Object.values(data)) for (const r of list) for (const f of want) { const v = String(r.v[f] ?? ''); if (!NONE.has(v)) s.add(v); }
  return [...s].filter((n) => !(data[k] ?? []).some((x) => x.name === n));
}

export function MasterEditor({ data, tabs, edit, defaults, imports }: {
  data: Record<string, Rec[]>; tabs: MasterTab[]; edit: (fn: (d: Record<string, Rec[]>) => void) => void;
  /** mẫu giá trị (không tự thêm vào công trình) */
  defaults: Record<string, Rec[]>;
  /** nhập bản ghi từ tab khác (vd ピース của 胴縁) */
  imports?: { label: string; data: Record<string, Rec[]> }[];
}) {
  const [mk, setMk] = useState(tabs[0].k);
  const [cur, setCur] = useState<string | null>(null);
  const [fk, setFk] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const T = tabs.find((t) => t.k === mk) ?? tabs[0];
  const list = data[T.k] ?? [];
  const it = list.find((x) => x.id === cur) ?? list[0];
  const missing = usedNames(data, T.k);
  const create = (name?: string) => {
    const id = uid('mx');
    edit((d) => {
      const arr = (d[T.k] = d[T.k] ?? []);
      const dl = defaults[T.k] ?? [];
      const base = dl.find((x) => x.name === name) ?? dl[0];
      let nm = name ?? `${T.prefix}${arr.length + 1}`;
      for (let i = arr.length + 2; arr.some((x) => x.name === nm); i++) nm = `${T.prefix}${i}`;
      arr.push({ id, name: nm, v: { ...(base?.v ?? {}) } });
    });
    setCur(id);
    if ((T.win !== false)) setOpen(id);
  };
  /** nhập 1 bản ghi (mẫu hoặc từ tab khác) – giữ tên, đổi tên nếu trùng */
  const importRec = (r: Rec) => {
    const id = uid('mx');
    edit((d) => {
      const arr = (d[T.k] = d[T.k] ?? []);
      let nm = r.name;
      for (let i = 2; arr.some((x) => x.name === nm); i++) nm = `${r.name}_${i}`;
      arr.push({ id, name: nm, v: { ...r.v } });
    });
    setCur(id);
    if ((T.win !== false)) setOpen(id);
  };
  const srcs = [{ label: 'mẫu', data: defaults }, ...(imports ?? [])].map((x) => ({ label: x.label, list: x.data[T.k] ?? [] })).filter((x) => x.list.length);
  const upd = (fn: (r: Rec) => void) => edit((d) => { const r = (d[T.k] ?? []).find((y) => y.id === it?.id); if (r) fn(r); });
  return (
    <>
      <div className="seg">
        {tabs.map((t) => (
          <button key={t.k} className={mk === t.k ? 'on' : ''} onClick={() => { setMk(t.k); setCur(null); }}>{t.label}</button>
        ))}
      </div>
      <Section title={`${T.label}マスター (${list.length})`} actions={
        <span className="row-gap">
          {srcs.length > 0 && T.k !== 'members' && (
            <select value="" onChange={(e) => { const [i, j] = e.target.value.split(':').map(Number); const r = srcs[i]?.list[j]; if (r) importRec(r); }} title="Nhập từ mẫu hoặc tab khác">
              <option value="">Nhập từ… ▾</option>
              {srcs.map((s0, i) => (
                <optgroup key={i} label={s0.label}>
                  {s0.list.map((r, j) => <option key={j} value={`${i}:${j}`}>{r.name} – {String(r.v.type ?? r.v.kind ?? r.v.mat ?? '').replace(/^\d+-/, '')}</option>)}
                </optgroup>
              ))}
            </select>
          )}
          <button className="primary" data-enter-new onClick={() => create()}>+ 作成</button>
        </span>
      }>
        {!list.length && T.k !== 'members' && <p className="muted small">Chưa có {T.label}. {T.label} chỉ được tạo khi bấm + 作成 hoặc nhập từ mẫu / tab khác.</p>}
        <table className="table compact moya-list">
          <thead>
            <tr><th>{T.name}</th><th>種類 / サイズ</th><th>材質</th><th /></tr>
          </thead>
          <tbody>
            {list.map((x) => (
              <tr key={x.id} className={x.id === it?.id ? 'sel' : ''} onClick={() => { setCur(x.id); if ((T.win !== false)) setOpen(x.id); }} style={(T.win !== false) ? { cursor: 'pointer' } : undefined} title={(T.win !== false) ? 'Bấm để mở cửa sổ sửa' : undefined}>
                <td><b>{x.name}</b></td>
                <td>{T.col ? T.col(x) : `${String(x.v.mat ?? x.v.type ?? x.v.kind ?? '').replace(/^\d+-/, '')} ${String(x.v.size ?? '')}`}</td>
                <td>{String(x.v.grade ?? '').replace(/^\d+-/, '')}</td>
                <td>
                  <button className="link" onClick={(e) => { e.stopPropagation(); edit((d) => { d[T.k] = (d[T.k] ?? []).filter((y) => y.id !== x.id); }); }}>Xoá</button>
                </td>
              </tr>
            ))}
            {missing.map((n) => (
              <tr key={n} className="missing" onClick={() => create(n)}>
                <td><b>{n}</b></td>
                <td colSpan={3}>chưa khai báo – bấm để 作成</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      {(T.win !== false) && <p className="muted small">Bấm 1 dòng để mở cửa sổ sửa {T.label} (form + hình minh họa) · ▲▼ chuyển {T.label} · Enter: sang dòng kế, ô cuối = ✓ Lưu · Esc: bỏ.</p>}
      {(T.win !== false) && open && list.some((x) => x.id === open) && (
        <MasterWin key={open} T={T} list={list} id={open} data={data} setId={(x) => { setOpen(x); setCur(x); }} onClose={() => setOpen(null)}
          save={(r) => edit((d) => { const arr = d[T.k] ?? []; const i = arr.findIndex((y) => y.id === r.id); if (i >= 0) arr[i] = r; })}
          createNew={() => create()} />
      )}
      {it && !(T.win !== false) && (
        <Section title={`編集: ${it.name}`}>
          <div className="enter-form">
          <Field label={T.name}>
            <Text value={it.name} onChange={(v) => upd((r) => (r.name = v))} />
          </Field>
          <div className="master-edit">
            {T.pic && (
              <div className="master-pic">
                <HlCtx.Provider value={fk}>{T.pic(it, data)}</HlCtx.Provider>
                {(() => {
                  const f = T.fields.find((x) => x.k === fk && (!x.when || x.when(it.v)));
                  return f ? <div className="pic-focus">▶ {f.label}: <b>{String(it.v[f.k] ?? '')}</b></div> : null;
                })()}
              </div>
            )}
            <PropTable fields={T.fields} v={it.v} data={data} focus={fk} onFocus={setFk} onChange={(k, val) => upd((r) => (r.v[k] = val))} />
          </div>
          <div className="enter-confirm">
            <button className="primary" data-enter-confirm title={`Xác nhận ${it.name} và tạo ${T.label} mới`} onClick={(e) => {
              const scope = (e.currentTarget as HTMLElement).closest('aside') ?? document;
              create();
              const go = (n: number) => setTimeout(() => {
                const f = scope.querySelector<HTMLInputElement>('.enter-form input');
                if (f) { f.focus(); f.select(); return; }
                if (n > 0) go(n - 1);
              }, 50);
              go(3);
            }}>✓ Tạo {T.label}</button>
          </div>
          </div>
          <p className="muted small">Enter: sang dòng kế tiếp · Enter ở dòng cuối: đến nút Tạo · Enter / bấm Tạo: xác nhận, tạo {T.label} mới và quay về ô {T.name}.</p>
        </Section>
      )}
    </>
  );
}

/** Cửa sổ sửa 1 bản ghi master (giống cửa sổ 継手): bản nháp, ✓ Lưu / ↺ Bỏ, ▲▼ chuyển bản ghi */
function MasterWin({ T, list, id, data, setId, onClose, save, createNew }: {
  T: MasterTab; list: Rec[]; id: string; data: Record<string, Rec[]>; setId: (id: string) => void; onClose: () => void; save: (r: Rec) => void; createNew: () => void;
}) {
  const src = list.find((x) => x.id === id)!;
  const [dr, setDr] = useState<Rec>(() => JSON.parse(JSON.stringify(src)));
  const [fk, setFk] = useState('');
  const dirty = JSON.stringify(dr) !== JSON.stringify(src);
  const idx = list.findIndex((x) => x.id === id);
  const doSave = () => { if (dirty) save(dr); };
  const nav = (d: number) => { const n = list[idx + d]; if (!n) return; doSave(); setId(n.id); };
  const discard = () => setDr(JSON.parse(JSON.stringify(src)));
  const live = { ...data, [T.k]: list.map((x) => (x.id === dr.id ? dr : x)) };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const tag = t.tagName;
    if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
      // ô gõ kích thước (danh sách khớp) tự xử lý Enter
      if (t.closest('.sec-in') && !e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      const f = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.jed-main input, .jed-main select'));
      const k = f.indexOf(t);
      if (!e.ctrlKey && k >= 0 && k + 1 < f.length) { f[k + 1].focus(); (f[k + 1] as HTMLInputElement).select?.(); }
      else doSave();
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); if (dirty) discard(); else onClose(); }
  };
  const W0 = Math.min(1000, window.innerWidth - 20);
  const def = { x: Math.max(10, window.innerWidth - W0 - 20), y: 70, w: W0, h: Math.min(860, window.innerHeight - 90) };
  const f = T.fields.find((x) => x.k === fk && (!x.when || x.when(dr.v)));
  return (
    <FloatWin
      id={`master-${T.k}`}
      flush
      def={def}
      onClose={() => { onClose(); }}
      title={<>✎ {T.label} {dr.name} {dirty && <span title="Có thay đổi chưa lưu">●</span>} <span className="small" style={{ opacity: 0.7 }}>{idx + 1}/{list.length}</span></>}
      extra={<><button title={`${T.label} trước`} onClick={() => nav(-1)}>▲</button><button title={`${T.label} sau`} onClick={() => nav(1)}>▼</button></>}
    >
      <div className="jed" onKeyDown={onKey} tabIndex={-1}>
        <div className="jed-row">
          <div className="jed-main">
            <Field label={T.name}><Text value={dr.name} onChange={(v) => setDr({ ...dr, name: v })} /></Field>
            <PropTable fields={T.fields} v={dr.v} data={live} focus={fk} onFocus={setFk} onChange={(k, val) => setDr((r) => ({ ...r, v: { ...r.v, [k]: val } }))} />
          </div>
          <div className="jed-fig master-fig">
            {T.pic && <HlCtx.Provider value={fk}>{T.pic(dr, live)}</HlCtx.Provider>}
            {f && <div className="pic-focus">▶ {f.label}: <b>{String(dr.v[f.k] ?? '')}</b></div>}
          </div>
        </div>
        <div className="jed-foot">
          <button className="primary" disabled={!dirty} onClick={doSave} title="Lưu thay đổi (Enter ở ô cuối, hoặc Ctrl+Enter)">✓ Lưu (Enter)</button>
          <button disabled={!dirty} onClick={discard} title="Bỏ các thay đổi chưa lưu (Esc)">↺ Bỏ (Esc)</button>
          <button onClick={() => { doSave(); createNew(); }} title={`Lưu và tạo ${T.label} mới`}>+ Lưu & tạo mới</button>
          <span className="small muted">{dirty ? 'Có thay đổi chưa lưu' : 'Đã lưu'}</span>
        </div>
      </div>
    </FloatWin>
  );
}
