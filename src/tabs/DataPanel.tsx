// 本体 › データ: xem và sửa toạ độ điểm đầu / điểm cuối của cột, dầm đã nhập
import { useEffect, useState } from 'react';
import { Member, Project } from '../model';
import { Section, Sel, TabProps } from '../ui';
import { beamEnds, geometry } from '../build';

/** Ô số ghi nhận khi rời ô / Enter (không cập nhật theo từng phím) */
function CNum({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [t, setT] = useState(String(value));
  useEffect(() => setT(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(t);
    if (!isNaN(v) && v !== value) onCommit(v);
    else setT(String(value));
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      className="dt-in"
      value={t}
      onChange={(e) => setT(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') { setT(String(value)); (e.currentTarget as HTMLInputElement).blur(); }
      }}
    />
  );
}

type Kind = 'all' | 'column' | 'post' | 'beam' | 'sbeam';
const KIND_LABEL: Record<Kind, string> = { all: 'Tất cả', column: '本柱', post: '間柱', beam: '大梁', sbeam: '小梁' };

interface Row {
  id: string;
  kind: Exclude<Kind, 'all'>;
  name: string;
  s: [number, number, number];
  e: [number, number, number];
  member?: string;
}

export default function DataPanel({ p, set, members, selected, setSelected }: { p: Project; set: TabProps['set']; members: Member[]; selected: string | null; setSelected: (id: string | null) => void }) {
  const [kind, setKind] = useState<Kind>('all');
  const [q, setQ] = useState('');
  const g = geometry(p);
  const r = Math.round;
  const mName = (id: string) => p.master.find((m) => m.id === id)?.name ?? '?';
  const lvZ = (id: string) => p.levels.find((l) => l.id === id)?.elevation ?? 0;
  const rows: Row[] = [];
  for (const c of p.columns) {
    const ps = members.filter((m) => m.source === c.id);
    if (!ps.length) continue;
    const zs = ps.flatMap((m) => [m.a[2], m.b[2]]);
    rows.push({ id: c.id, kind: c.role === 'post' ? 'post' : 'column', name: mName(c.memberId), s: [r(ps[0].a[0]), r(ps[0].a[1]), r(Math.min(...zs))], e: [r(ps[0].a[0]), r(ps[0].a[1]), r(Math.max(...zs))], member: ps[0].id });
  }
  for (const b of p.beams) {
    const [e1, e2] = beamEnds(g, b, p.params.member.beamDir);
    if (e1.includes(undefined) || e2.includes(undefined)) continue;
    const z0 = lvZ(b.level) + (b.dz ?? 0);
    rows.push({ id: b.id, kind: b.role === 'sub' ? 'sbeam' : 'beam', name: mName(b.memberId), s: [r(e1[0]!), r(e1[1]!), r(z0 + (b.up1 ?? 0))], e: [r(e2[0]!), r(e2[1]!), r(z0 + (b.up2 ?? 0))], member: members.find((m) => m.source === b.id)?.id });
  }
  const selSrc = members.find((m) => m.id === selected)?.source;
  const shown = rows.filter((x) => (kind === 'all' || x.kind === kind) && (!q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase())));
  useEffect(() => {
    if (selSrc) document.querySelector(`[data-dtrow="${selSrc}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selSrc]);

  /** ghi toạ độ mới: k = 0 điểm đầu / 1 điểm cuối, ax = 0 X / 1 Y / 2 Z */
  const write = (row: Row, k: 0 | 1, ax: 0 | 1 | 2, v: number) =>
    set((d) => {
      if (row.kind === 'column' || row.kind === 'post') {
        const c = d.columns.find((x) => x.id === row.id);
        if (!c) return;
        if (ax === 2) {
          if (k === 0) c.zb = v;
          else c.zt = v;
          return;
        }
        // X / Y: dời cột theo dx / dy (giữ giao trục, điểm chuẩn)
        const dv = v - row.s[ax];
        if (c.pt) c.pt = ax === 0 ? [c.pt[0] + dv, c.pt[1]] : [c.pt[0], c.pt[1] + dv];
        else if (ax === 0) c.dx += dv;
        else c.dy += dv;
        return;
      }
      const b = d.beams.find((x) => x.id === row.id);
      if (!b) return;
      if (ax === 2) {
        const z0 = (d.levels.find((l) => l.id === b.level)?.elevation ?? 0) + (b.dz ?? 0);
        if (k === 0) b.up1 = v - z0;
        else b.up2 = v - z0;
        return;
      }
      // X / Y: dầm chuyển sang toạ độ tự do (p1 → p2 theo thứ tự đang hiện)
      const p1: [number, number] = [row.s[0], row.s[1]], p2: [number, number] = [row.e[0], row.e[1]];
      (k === 0 ? p1 : p2)[ax] = v;
      b.p1 = p1;
      b.p2 = p2;
    });

  return (
    <Section title={`データ – điểm đầu / điểm cuối (${shown.length}/${rows.length})`}>
      <div className="row-gap" style={{ marginBottom: 8 }}>
        <Sel value={kind} onChange={(v: Kind) => setKind(v)} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <input type="text" placeholder="Lọc 部材名…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 120 }} />
      </div>
      <p className="muted small">
        Đơn vị mm. Cột: X, Y = tâm cột, Z = chân / đỉnh. Dầm: X, Y = điểm trên đường đặt (trước khi lệch), Z = cao độ đặt (theo 上下基準). Sửa ô rồi Enter hoặc rời ô để ghi · bấm dòng để chọn trên 3D · ↶ để hoàn tác.
      </p>
      <div className="table-wrap">
        <table className="table dtable">
          <thead>
            <tr>
              <th rowSpan={2}>Loại</th>
              <th rowSpan={2}>部材名</th>
              <th colSpan={3}>Điểm đầu</th>
              <th colSpan={3}>Điểm cuối</th>
            </tr>
            <tr>
              <th>X</th>
              <th>Y</th>
              <th>Z</th>
              <th>X</th>
              <th>Y</th>
              <th>Z</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => {
              const col = row.kind === 'column' || row.kind === 'post';
              return (
                <tr key={row.id} data-dtrow={row.id} className={selSrc === row.id ? 'sel' : ''} onClick={() => row.member && setSelected(row.member)}>
                  <td className="small nowrap">{KIND_LABEL[row.kind]}</td>
                  <td className="nowrap"><b>{row.name}</b></td>
                  {([0, 1] as const).map((k) =>
                    ([0, 1, 2] as const).map((ax) => (
                      <td key={`${k}${ax}`}>
                        {/* cột: X, Y của điểm cuối = điểm đầu (cột thẳng đứng) */}
                        {col && k === 1 && ax < 2 ? <span className="muted small">{(k === 1 ? row.e : row.s)[ax]}</span> : <CNum value={(k === 0 ? row.s : row.e)[ax]} onCommit={(v) => write(row, k, ax, v)} />}
                      </td>
                    )),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
