import { useEffect, useRef, useState } from 'react';
import { GridLine, gridPositions, parseSpacing, spacingToString, uid, Project } from '../model';
import { Field, Num, Section, TabProps, Text, fmtMm } from '../ui';

function removeRefs(d: Project) {
  const gx = new Set(d.gridsX.map((g) => g.id));
  const gy = new Set(d.gridsY.map((g) => g.id));
  const lv = new Set(d.levels.map((l) => l.id));
  d.columns = d.columns.filter((c) => gx.has(c.x) && gy.has(c.y) && lv.has(c.base) && lv.has(c.top));
  d.beams = d.beams.filter((b) => (b.p1 && b.p2 && lv.has(b.level)) || gx.has(b.x1) && gx.has(b.x2) && gy.has(b.y1) && gy.has(b.y2) && lv.has(b.level));
  if (!lv.has(d.roof.eaveLevel)) d.roof.eaveLevel = d.levels[d.levels.length - 1]?.id ?? '';
}

function GridEditor({ axis, p, set }: { axis: 'x' | 'y'; p: Project; set: TabProps['set'] }) {
  const key = axis === 'x' ? 'gridsX' : 'gridsY';
  const lines = p[key];
  const pos = gridPositions(lines);
  const [quick, setQuick] = useState(spacingToString(lines));
  // danh sách trục đổi (thêm / xoá / sửa khoảng cách) → ô nhập nhanh theo đúng danh sách
  const sig = spacingToString(lines);
  useEffect(() => setQuick(sig), [sig]);
  // Enter: tên → khoảng cách; khoảng cách ở trục cuối → tự thêm trục mới (tên tăng dần) và đặt con trỏ vào khoảng cách của trục mới
  const tbl = useRef<HTMLTableElement>(null);
  const pend = useRef<{ id: string; f: string } | null>(null);
  useEffect(() => {
    const q = pend.current;
    if (!q) return;
    const el = tbl.current?.querySelector<HTMLInputElement>(`tr[data-row="${q.id}"] [data-f="${q.f}"] input`);
    if (el) {
      pend.current = null;
      el.focus();
      el.select();
    }
  });
  const addGrid = (d: Project, id: string) => {
    const arr = d[key];
    const g = { id, name: arr.length ? nextName(arr[arr.length - 1].name, axis, arr.length) : defName(axis, 0), spacing: arr.length ? arr[arr.length - 1].spacing || 6000 : 0 };
    arr.push(g);
    return g.id;
  };
  const onKey = (e: React.KeyboardEvent, i: number, f: 'n' | 's') => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (f === 'n') pend.current = { id: lines[i].id, f: 's' };
    else if (i + 1 < lines.length) pend.current = { id: lines[i + 1].id, f: 's' };
    else {
      const nid = uid('g' + axis);
      set((d) => void addGrid(d, nid));
      pend.current = { id: nid, f: 's' };
      return;
    }
    const el = tbl.current?.querySelector<HTMLInputElement>(`tr[data-row="${pend.current.id}"] [data-f="${pend.current.f}"] input`);
    if (el) { pend.current = null; el.focus(); el.select(); }
  };

  const applyQuick = () => {
    const vals = parseSpacing(quick);
    if (!vals.length) return;
    set((d) => {
      const old = d[key];
      d[key] = vals.map((s, i): GridLine => ({ id: old[i]?.id ?? uid('g' + axis), name: old[i]?.name ?? '', spacing: s }));
      // tên trục mới: tăng dần theo tên trục trước (X1 → X2, A → B)
      d[key].forEach((g, i, arr) => { if (!g.name) g.name = i ? nextName(arr[i - 1].name, axis, i) : defName(axis, 0); });
      removeRefs(d);
    });
  };

  return (
    <>
      <Section title={axis === 'x' ? 'Trục dọc nhà (phương X): 1, 2, 3…' : 'Trục ngang nhà (phương Y): A, B, C…'}>
        <Field label="Nhập nhanh khoảng cách (mm)" hint="Giá trị đầu là vị trí trục đầu tiên. Ví dụ: 0 6000 3*7500 6000">
          <div className="row-gap">
            <Text value={quick} onChange={setQuick} />
            <button className="primary" onClick={applyQuick}>
              Áp dụng
            </button>
          </div>
        </Field>
      </Section>
      <Section
        title={`Danh sách trục ${axis.toUpperCase()} (${lines.length})`}
        actions={
          <>
            <button
              onClick={() => {
                const nid = uid('g' + axis);
                set((d) => void addGrid(d, nid));
                pend.current = { id: nid, f: 's' };
              }}
            >
              + Thêm trục
            </button>
            <button
              onClick={() =>
                set((d) => {
                  d[key].forEach((g, i) => (g.name = defName(axis, i)));
                })
              }
            >
              Đánh lại tên
            </button>
          </>
        }
      >
        <table className="table" ref={tbl}>
          <thead>
            <tr>
              <th>Tên trục</th>
              <th>Khoảng cách (mm)</th>
              <th>Toạ độ (mm)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((g, i) => (
              <tr key={g.id} data-row={g.id}>
                <td data-f="n" onKeyDown={(e) => onKey(e, i, 'n')}>
                  <Text width={60} value={g.name} onChange={(v) =>
                      set((d) => {
                        const arr = d[key];
                        // các trục phía sau đang đặt tên nối tiếp (hoặc còn trống) → đặt lại tăng dần theo tên mới
                        let k = i + 1;
                        while (k < arr.length && (!arr[k].name || arr[k].name === nextName(arr[k - 1].name, axis, k))) k++;
                        arr[i].name = v;
                        for (let q = i + 1; q < k; q++) arr[q].name = nextName(arr[q - 1].name, axis, q);
                      })
                    }
                  />
                </td>
                <td data-f="s" onKeyDown={(e) => onKey(e, i, 's')}>
                  <Num width={100} value={g.spacing} onChange={(v) => set((d) => (d[key][i].spacing = v))} />
                </td>
                <td className="num">{fmtMm(pos.get(g.id)!)}</td>
                <td>
                  <button
                    className="danger icon"
                    title="Xoá trục (xoá cả cột, dầm gắn với trục này)"
                    disabled={lines.length <= 1}
                    onClick={() =>
                      set((d) => {
                        d[key].splice(i, 1);
                        removeRefs(d);
                      })
                    }
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function LevelEditor({ p, set }: { p: Project; set: TabProps['set'] }) {
  const sorted = [...p.levels].sort((a, b) => b.elevation - a.elevation);
  const tbl = useRef<HTMLTableElement>(null);
  const pend = useRef<{ id: string; f: string } | null>(null);
  const focusPend = () => {
    const q = pend.current;
    const el = q && tbl.current?.querySelector<HTMLInputElement>(`tr[data-row="${q.id}"] [data-f="${q.f}"] input`);
    if (el) {
      pend.current = null;
      el.focus();
      el.select();
    }
  };
  useEffect(focusPend);
  /** thêm tầng trên cùng: tên tăng dần, cách tầng dưới bằng chiều cao tầng trước (mặc định 3500) */
  const addLevel = (d: Project, id: string) => {
    const s = [...d.levels].sort((a, b) => a.elevation - b.elevation);
    const top = s[s.length - 1];
    const h = s.length >= 2 ? top.elevation - s[s.length - 2].elevation : 3500;
    const lv = { id, name: top ? nextLevelName(top.name, s.length) : '1FL', elevation: top ? top.elevation + (h || 3500) : 0 };
    d.levels.push(lv);
    if (!top || !d.levels.some((l) => l.id === d.roof.eaveLevel)) d.roof.eaveLevel = lv.id;
    else if (!d.levels.some((l) => l.id === d.roof.eaveLevel && l.elevation > 0 && l.elevation < lv.elevation)) d.roof.eaveLevel = lv.id;
    return lv.id;
  };
  const add = () => {
    const nid = uid('lv');
    set((d) => void addLevel(d, nid));
    pend.current = { id: nid, f: p.levels.length ? 'h' : 'n' };
  };
  /** đổi chiều cao tầng: tầng này và các tầng phía trên dời theo */
  const setHeight = (id: string, h: number) =>
    set((d) => {
      const s = [...d.levels].sort((a, b) => a.elevation - b.elevation);
      const k = s.findIndex((l) => l.id === id);
      if (k <= 0) return;
      const delta = s[k - 1].elevation + h - s[k].elevation;
      for (let q = k; q < s.length; q++) s[q].elevation += delta;
    });
  const onKey = (e: React.KeyboardEvent, l: { id: string }, f: 'n' | 'h') => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const i = sorted.findIndex((x) => x.id === l.id);
    if (f === 'n' && i < sorted.length - 1) pend.current = { id: l.id, f: 'h' };
    else if (i > 0) pend.current = { id: sorted[i - 1].id, f: 'h' };
    else return add();
    focusPend();
  };
  return (
    <Section title={`Cao độ tầng (${p.levels.length})`} actions={<button onClick={add}>+ Thêm tầng</button>}>
      <table className="table" ref={tbl}>
        <thead>
          <tr>
            <th>Tên tầng</th>
            <th>Chiều cao tầng (mm)</th>
            <th>Cao độ (mm)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map((l, i) => {
            const idx = p.levels.findIndex((x) => x.id === l.id);
            const below = sorted[i + 1];
            return (
              <tr key={l.id} data-row={l.id}>
                <td data-f="n" onKeyDown={(e) => onKey(e, l, 'n')}>
                  <Text width={110} value={l.name} onChange={(v) => set((d) => (d.levels[idx].name = v))} />
                </td>
                <td data-f="h" onKeyDown={(e) => onKey(e, l, 'h')}>
                  {below ? <Num width={90} value={l.elevation - below.elevation} min={1} onChange={(v) => setHeight(l.id, v)} /> : <span className="muted">–</span>}
                </td>
                <td data-f="z">
                  <Num width={90} value={l.elevation} onChange={(v) => set((d) => (d.levels[idx].elevation = v))} />
                </td>
                <td>
                  <button
                    className="danger icon"
                    disabled={p.levels.length <= 1}
                    title="Xoá tầng"
                    onClick={() =>
                      set((d) => {
                        d.levels.splice(idx, 1);
                        removeRefs(d);
                      })
                    }
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

/** Tên trục kế tiếp theo tên trục trước: X1 → X2, 9 → 10, A → B, Y-A → Y-B; không đoán được thì theo thứ tự mặc định */
export function nextName(prev: string, axis: 'x' | 'y', i: number): string {
  const num = prev.match(/^(.*?)(\d+)$/);
  if (num) return num[1] + String(+num[2] + 1).padStart(num[2].length, '0');
  const ch = prev.match(/^(.*?)([A-Ya-y])$/);
  if (ch) return ch[1] + String.fromCharCode(ch[2].charCodeAt(0) + 1);
  return defName(axis, i);
}

/** Tên trục mặc định: X1, X2… / Y1, Y2… */
export const defName = (axis: 'x' | 'y', i: number) => `${axis.toUpperCase()}${i + 1}`;

/** Tên tầng kế tiếp: 2FL → 3FL, Tầng 2 → Tầng 3; không có số → (n+1)FL */
export function nextLevelName(prev: string | undefined, n: number): string {
  const m = prev?.match(/^(\D*)(\d+)(.*)$/);
  return m ? `${m[1]}${+m[2] + 1}${m[3]}` : `${n + 1}FL`;
}

export default function GridTab({ p, set, sub }: TabProps) {
  return (
    <>
      {sub !== 'lv' && (
        <>
          <GridEditor key="x" axis="x" p={p} set={set} />
          <GridEditor key="y" axis="y" p={p} set={set} />
        </>
      )}
      {sub === 'lv' && <LevelEditor p={p} set={set} />}
    </>
  );
}
