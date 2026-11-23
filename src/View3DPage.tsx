// Trang 3D riêng: chỉ để xem mô hình 3D, bật/tắt từng lớp
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KIND_COLOR, KIND_LABEL, Member, MemberKind, Project } from './model';
import Viewer3D, { ColorBy, categoryColors } from './Viewer3D';

interface Props {
  project: Project;
  members: Member[];
  onClose: () => void;
}

type Layer = 'kind' | 'zone' | 'group' | 'cls' | 'mark';

export default function View3DPage({ project: p, members, onClose }: Props) {
  const [off, setOff] = useState<Record<Layer, string[]>>({ kind: [], zone: [], group: [], cls: [], mark: [] });
  const [colorBy, setColorBy] = useState<ColorBy>('kind');
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<Layer, boolean>>({ kind: true, zone: true, group: false, cls: false, mark: false });

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  const valueOf = (m: Member, l: Layer) => (l === 'kind' ? m.kind : l === 'mark' ? m.mark : (m[l] ?? '(chưa gán)'));
  const visible = useCallback(
    (m: Member) => (Object.keys(off) as Layer[]).every((l) => !off[l].includes(valueOf(m, l))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [off],
  );

  const layers = useMemo(() => {
    const uniq = (l: Layer) => [...new Set(members.map((m) => valueOf(m, l)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      kind: (Object.keys(KIND_LABEL) as MemberKind[]).filter((k) => members.some((m) => m.kind === k)),
      zone: uniq('zone'),
      group: uniq('group'),
      cls: uniq('cls'),
      mark: uniq('mark'),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const colorOf = (l: Layer, v: string) => {
    if (l === 'kind') return KIND_COLOR[v as MemberKind];
    if (l === 'mark') return undefined;
    return categoryColors(p, l).get(v) ?? '#e2e8f0';
  };
  const label = (l: Layer, v: string) => (l === 'kind' ? KIND_LABEL[v as MemberKind] : v);
  const toggle = (l: Layer, v: string, on: boolean) => setOff({ ...off, [l]: on ? off[l].filter((x) => x !== v) : [...off[l], v] });
  const TITLES: Record<Layer, string> = { kind: 'Loại cấu kiện', zone: '工区', group: 'グループ', cls: '分類', mark: '部材名 / 符号' };
  const shown = members.filter(visible).length;

  return (
    <div className="page3d">
      <aside className="page3d-side">
        <div className="page3d-head">
          <b>Trang 3D</b>
          <button onClick={onClose} title="Đóng (Esc)">
            ✕ Đóng
          </button>
        </div>
        <div className="muted small">
          Đang hiện {shown}/{members.length} cấu kiện
        </div>
        <div className="row-gap" style={{ margin: '6px 0' }}>
          <button onClick={() => setOff({ kind: [], zone: [], group: [], cls: [], mark: [] })}>Hiện tất cả</button>
          <button onClick={() => setOff({ ...off, kind: [...layers.kind] })}>Ẩn tất cả</button>
        </div>
        <label className="field">
          <span className="field-label">Tô màu theo</span>
          <select value={colorBy} onChange={(e) => setColorBy(e.target.value as ColorBy)}>
            <option value="kind">Loại cấu kiện</option>
            <option value="zone">工区</option>
            <option value="group">グループ</option>
            <option value="cls">分類</option>
            <option value="paint">塗装</option>
          </select>
        </label>
        {(Object.keys(layers) as Layer[]).map((l) => (
          <div key={l} className="layer-block">
            <button className="layer-title" onClick={() => setOpen({ ...open, [l]: !open[l] })}>
              {open[l] ? '▾' : '▸'} {TITLES[l]}
              <span className="muted small"> ({layers[l].length - off[l].filter((x) => (layers[l] as string[]).includes(x)).length}/{layers[l].length})</span>
            </button>
            {open[l] && (
              <div className="layer-list">
                {layers[l].map((v) => (
                  <label key={v} className="layer-item">
                    <input type="checkbox" checked={!off[l].includes(v)} onChange={(e) => toggle(l, v, e.target.checked)} />
                    {colorOf(l, v) && <span className="swatch" style={{ background: colorOf(l, v) }} />}
                    {label(l, v)}
                    <span className="muted small">{members.filter((m) => valueOf(m, l) === v).length}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </aside>
      <div className="page3d-view">
        <Viewer3D project={p} members={members} selected={selected} onSelect={setSelected} colorBy={colorBy} visible={visible} hideLegend />
      </div>
    </div>
  );
}
