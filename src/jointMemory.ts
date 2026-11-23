// Định dạng 継手 đã lưu theo kích thước cây (lưu trên máy, dùng chung mọi công trình):
// bấm 💾 Lưu định dạng → nhớ tối đa 3 lần gần nhất cho mỗi loại 継手 + quy cách; tạo 継手 mới cùng loại + quy cách → mặc định lấy lần gần nhất
import type { Joint, Project } from './model';
import { jointUsers } from './model';

const KEY = 'steel3t.jointMem';
export const MAX_FMT = 3;
export interface Fmt { at: number; j: Partial<Joint> }
type Mem = Record<string, Fmt[]>;

const load = (): Mem => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Fmt | Fmt[]>;
    const m: Mem = {};
    for (const [k, v] of Object.entries(raw)) m[k] = Array.isArray(v) ? v : [v];
    return m;
  } catch { return {}; }
};
const save = (m: Mem) => { try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* đầy / bị chặn */ } };
export const memKey = (target: string, type: string, code: string) => `${target}|${type}|${code}`;

/** các quy cách tiết diện của cây đang dùng 継手 */
export function jointCodes(p: Project, id: string): string[] {
  return [...new Set(jointUsers(p, id).map((u) => p.sections.find((s) => s.id === u.m.sectionId)?.code).filter((c): c is string => !!c))];
}

const strip = (j: Joint): Partial<Joint> => { const { id: _i, name: _n, ...rest } = structuredClone(j); return rest; };

/** Lưu định dạng 継手 (cho mọi quy cách cây đang dùng). Trả về các quy cách đã lưu */
export function saveFormat(p: Project, j: Joint): string[] {
  const codes = jointCodes(p, j.id);
  if (!codes.length) return [];
  const m = load();
  const v = strip(j), sv = JSON.stringify(v);
  for (const c of codes) {
    const k = memKey(j.target, j.type, c);
    m[k] = [{ at: Date.now(), j: v }, ...(m[k] ?? []).filter((x) => JSON.stringify(x.j) !== sv)].slice(0, MAX_FMT);
  }
  save(m);
  return codes;
}

/** Các lần lưu (mới nhất trước) cho loại 継手 + quy cách */
export const formatsOf = (target: string, type: string, code: string): Fmt[] => load()[memKey(target, type, code)] ?? [];

/** Lần lưu gần nhất */
export function recallJoint(target: string, type: string, code: string): Partial<Joint> | undefined {
  return formatsOf(target, type, code)[0]?.j;
}

/** Áp 1 định dạng vào 継手 (giữ id, tên) */
export function applyFormat(j: Joint, f: Partial<Joint>) {
  Object.assign(j, structuredClone(f), { id: j.id, name: j.name });
}

/** Áp lần lưu gần nhất vào 継手 mới. Trả về true nếu có áp */
export function applyRemembered(j: Joint, code?: string): boolean {
  if (!code) return false;
  const r = recallJoint(j.target, j.type, code);
  if (!r) return false;
  applyFormat(j, r);
  return true;
}

/** Tóm tắt 1 định dạng để hiện trong danh sách */
export function fmtSummary(f: Partial<Joint>): string {
  const b = f.webBolts, fb = f.flangeBolts;
  const parts = [f.bolt ? `M${f.bolt.dia}` : '', f.webT ? `t${f.webT}` : ''];
  if (f.type === 'EP' && f.ep) parts.push(`EP ${f.ep.faces}面 ${f.ep.nb}本`);
  else {
    if (b) parts.push(`W ${b.rows}×${b.cols} P${b.pitch}`);
    if (f.type === 'SPL' && fb) parts.push(`F ${fb.rows}×${fb.cols}`);
  }
  return parts.filter(Boolean).join(' · ');
}

export const memCount = () => Object.keys(load()).length;
export const memList = () => Object.entries(load()).map(([k, v]) => ({ k, at: v[0]?.at ?? 0, n: v.length }));
export const memClear = () => save({});
export const memDelete = (k: string) => { const m = load(); delete m[k]; save(m); };
