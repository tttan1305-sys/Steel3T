// Hộp quản lý công trình: tạo mới, nhân bản, mở, đổi tên, tải file, xoá
import { useRef, useState } from 'react';
import { Project, migrate } from './model';
import { LibEntry, addProj, delProj, listLib, loadProj, saveProj } from './projectLib';
import { download } from './tabs/OutputTabs';

interface Props {
  cur: string;
  p: Project;
  /** công trình trắng */
  fresh: () => Project;
  /** nhà xưởng mẫu */
  sample: () => Project;
  /** mở công trình (rename: đổi tên công trình đang mở) */
  onOpen: (id: string, rename?: string) => void;
  onClose: () => void;
}
const fmtT = (t: number) => new Date(t).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

export default function ProjectsDialog({ cur, p, fresh, sample, onOpen, onClose }: Props) {
  const [lib, setLib] = useState<LibEntry[]>(() => listLib());
  const [name, setName] = useState('');
  const [ren, setRen] = useState<{ id: string; name: string } | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setLib(listLib());

  const create = (how: 'blank' | 'copy' | 'sample') => {
    saveProj(cur, p); // lưu công trình đang mở trước khi chuyển
    const np = how === 'copy' ? structuredClone(p) : how === 'sample' ? sample() : fresh();
    np.name = name.trim() || (how === 'copy' ? `${p.name} (bản sao)` : how === 'sample' ? 'Nhà xưởng mẫu' : `Công trình mới ${lib.length + 1}`);
    onOpen(addProj(np));
  };
  const importFile = (f: File) =>
    f.text().then((t) => {
      try {
        const np = migrate(JSON.parse(t));
        if (!np.gridsX || !np.levels) throw new Error('Sai định dạng');
        saveProj(cur, p);
        onOpen(addProj(np));
      } catch (e) {
        setMsg('Không đọc được file: ' + (e as Error).message);
      }
    });

  return (
    <div className="pj-back" onClick={onClose}>
      <div className="pj-box" onClick={(e) => e.stopPropagation()}>
        <div className="pj-head">
          <b>📁 Công trình</b>
          <span className="muted small">Lưu tự động trong trình duyệt này · mỗi công trình riêng một file</span>
          <span style={{ flex: 1 }} />
          <button className="icon" onClick={onClose}>✕</button>
        </div>
        <div className="pj-new">
          <input className="input" placeholder="Tên công trình mới" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" onClick={() => create('blank')} title="Công trình trắng: chỉ có lưới trục và tầng, chưa có cấu kiện">+ Tạo mới (trắng)</button>
          <button onClick={() => create('copy')} title="Sao chép công trình đang mở thành công trình mới">⧉ Nhân bản bản đang mở</button>
          <button onClick={() => create('sample')} title="Tạo từ nhà xưởng mẫu (có sẵn cột, dầm, mái)">🏭 Từ nhà mẫu</button>
          <button onClick={() => fileRef.current?.click()}>📂 Mở từ file…</button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </div>
        {msg && <div className="alert error">{msg}</div>}
        <div className="pj-list">
          {lib.map((e) => {
            const on = e.id === cur;
            return (
              <div key={e.id} className={'pj-row' + (on ? ' on' : '')}>
                {ren?.id === e.id ? (
                  <input
                    className="input"
                    autoFocus
                    value={ren.name}
                    onChange={(ev) => setRen({ ...ren, name: ev.target.value })}
                    onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
                    onBlur={() => {
                      const q = on ? p : loadProj(e.id);
                      if (q && ren.name.trim()) {
                        if (on) onOpen(e.id, ren.name.trim());
                        else { q.name = ren.name.trim(); saveProj(e.id, q); }
                      }
                      setRen(null);
                      refresh();
                    }}
                  />
                ) : (
                  <div className="pj-name">
                    <b>{on ? (p.name || e.name) : e.name}</b> {on && <span className="pill on">đang mở</span>}
                    <div className="muted small">Sửa lần cuối {fmtT(e.updated)}</div>
                  </div>
                )}
                <div className="pj-btns">
                  {!on && <button className="primary" onClick={() => { saveProj(cur, p); onOpen(e.id); }}>Mở</button>}
                  <button title="Đổi tên" onClick={() => setRen({ id: e.id, name: on ? p.name : e.name })}>✎</button>
                  <button
                    title="Tải file .json về máy"
                    onClick={() => {
                      const q = on ? p : loadProj(e.id);
                      if (q) download(`${q.name || 'cong-trinh'}.steel3t.json`, JSON.stringify(q, null, 2), 'application/json');
                    }}
                  >
                    ⬇ File
                  </button>
                  {!on &&
                    (delId === e.id ? (
                      <button className="danger" onClick={() => { delProj(e.id); setDelId(null); refresh(); }}>Xoá hẳn?</button>
                    ) : (
                      <button title="Xoá công trình" onClick={() => setDelId(e.id)}>🗑</button>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
