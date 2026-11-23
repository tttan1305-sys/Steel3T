// Thư viện công trình: nhiều dự án lưu riêng trong trình duyệt (localStorage)
import { Project, migrate, uid } from './model';

export interface LibEntry { id: string; name: string; updated: number }
const LIB_KEY = 'steel3t.lib.v1';
const CUR_KEY = 'steel3t.cur';
const OLD_KEY = 'steel3t.project.v2';
const pKey = (id: string) => `steel3t.proj.${id}`;

const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

export function listLib(): LibEntry[] {
  try { return (JSON.parse(get(LIB_KEY) ?? '[]') as LibEntry[]).sort((a, b) => b.updated - a.updated); } catch { return []; }
}
const writeLib = (l: LibEntry[]) => put(LIB_KEY, JSON.stringify(l));

export function loadProj(id: string): Project | null {
  const raw = get(pKey(id));
  if (!raw) return null;
  try { return migrate(JSON.parse(raw)); } catch { return null; }
}
export function saveProj(id: string, p: Project): boolean {
  const ok = put(pKey(id), JSON.stringify(p));
  const l = listLib().filter((e) => e.id !== id);
  writeLib([{ id, name: p.name || 'Công trình', updated: Date.now() }, ...l]);
  put(OLD_KEY, JSON.stringify(p)); // tương thích bản cũ
  return ok;
}
export function addProj(p: Project): string {
  const id = uid('pj');
  saveProj(id, p);
  return id;
}
export function delProj(id: string) {
  try { localStorage.removeItem(pKey(id)); } catch { /* bỏ qua */ }
  writeLib(listLib().filter((e) => e.id !== id));
}
export const curId = () => get(CUR_KEY) ?? '';
export const setCur = (id: string) => put(CUR_KEY, id);

/** Dự án đang mở; lần đầu chuyển dữ liệu bản cũ (1 dự án) vào thư viện */
export function openInitial(fresh: () => Project): { id: string; p: Project } {
  const id = curId();
  const p = id ? loadProj(id) : null;
  if (p) return { id, p };
  const first = listLib()[0];
  if (first) {
    const q = loadProj(first.id);
    if (q) { setCur(first.id); return { id: first.id, p: q }; }
  }
  let old: Project | null = null;
  try { const raw = get(OLD_KEY); if (raw) old = migrate(JSON.parse(raw)); } catch { /* bỏ qua */ }
  const np = old ?? fresh();
  const nid = addProj(np);
  setCur(nid);
  return { id: nid, p: np };
}
