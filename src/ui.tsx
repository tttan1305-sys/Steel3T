import { ReactNode, useEffect, useRef, useState } from 'react';
import { Project, Member, uid } from './model';
import { JIS_SECTIONS, findJis } from './jis';

export type Updater = (fn: (draft: Project) => void) => void;

export interface TabProps {
  p: Project;
  set: Updater;
  sub: string;
  members: Member[];
}

export function Field({ label, children, hint, dim }: { label: string; children: ReactNode; hint?: string; dim?: string }) {
  return (
    <label className="field" data-dim={dim}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Ô nhập số: cho phép gõ tự do, chỉ ghi nhận khi giá trị hợp lệ. */
export function Num({ value, onChange, step = 1, min, width, signed }: { value: number; onChange: (v: number) => void; step?: number; min?: number; width?: number; signed?: boolean }) {
  const [txt, setTxt] = useState(String(value));
  const focused = useRef(false);
  // đang gõ thì giữ nguyên đúng chữ số người nhập; rời ô mới đồng bộ lại
  useEffect(() => {
    if (!focused.current) setTxt(String(value));
  }, [value]);
  const input = (
    <input
      type="text"
      inputMode={signed ? 'text' : 'decimal'}
      value={txt}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setTxt(String(value));
      }}
      step={step}
      min={min}
      style={width ? { width } : undefined}
      onChange={(e) => {
        setTxt(e.target.value);
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && (min === undefined || v >= min)) onChange(v);
      }}
    />
  );
  return input;
}

export function Text({ value, onChange, width }: { value: string; onChange: (v: string) => void; width?: number }) {
  return <input type="text" value={value} style={width ? { width } : undefined} onChange={(e) => onChange(e.target.value)} />;
}

export function Sel<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="panel-section">
      <div className="panel-section-head">
        <h3>{title}</h3>
        <div className="row-gap">{actions}</div>
      </div>
      {children}
    </div>
  );
}

export function Placeholder({ title, items }: { title: string; items: string[] }) {
  return (
    <Section title={title}>
      <div className="placeholder">
        <p>Chức năng này sẽ được phát triển ở giai đoạn sau. Dự kiến gồm:</p>
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export const sectionOptions = (p: Project, types?: string[]) =>
  p.sections.filter((s) => !types || types.includes(s.type)).map((s) => ({ value: s.id, label: s.code }));

export const fmtKg = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
export const fmtMm = (v: number) => Math.round(v).toLocaleString('vi-VN');

/**
 * Chọn tiết diện: chỉ cho chọn theo chuẩn JIS. Tiết diện được tự thêm vào thư viện công trình khi chọn.
 * value / onChange là id tiết diện trong công trình.
 */
export function JisSelect({ p, set, value, onChange, types }: { p: Project; set: Updater; value: string; onChange: (id: string) => void; types: string[] }) {
  const cur = p.sections.find((s) => s.id === value);
  const curJis = cur && findJis(cur.code);
  return (
    <select
      value={cur?.code ?? ''}
      onChange={(e) => {
        const code = e.target.value;
        const ex = p.sections.find((s) => s.code === code);
        if (ex) return onChange(ex.id);
        const f = findJis(code);
        if (!f) return;
        const id = uid('sc');
        set((d) => void d.sections.push({ id, code, ...f.item.spec, material: f.cat.material, kgm: f.item.kg }));
        onChange(id);
      }}
    >
      {!value && <option value="">— chọn —</option>}
      {cur && !curJis && <option value={cur.code}>⚠ {cur.code} (ngoài JIS)</option>}
      {JIS_SECTIONS.filter((c) => c.items.some((it) => types.includes(it.spec.type))).map((c) => (
        <optgroup key={c.id} label={c.name}>
          {c.items.map((it) => (
            <option key={it.code} value={it.code}>
              {it.code} · {it.kg} kg/m
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
