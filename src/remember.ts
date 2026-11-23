import { useEffect, useRef, useState } from 'react';
import type { Project } from './model';

/** Tập id / tên đang có trong công trình – dùng để bỏ giá trị đã nhớ không còn tồn tại */
function knownRefs(p: Project): Set<string> {
  const s = new Set<string>();
  const add = (xs: { id?: string; name?: string }[] | undefined) => xs?.forEach((x) => { if (x.id) s.add(x.id); if (x.name) s.add(x.name); });
  add(p.levels); add(p.gridsX); add(p.gridsY); add(p.master); add(p.sections); add(p.joints); add(p.bases);
  add((p as unknown as { slopes?: { id: string; name?: string }[] }).slopes);
  add(p.slopeFaces);
  return s;
}

/** Ghép giá trị đã nhớ lên giá trị mặc định: chỉ nhận đúng kiểu; chuỗi tham chiếu (id tầng, 部材名…) phải còn trong công trình */
function merge<T extends object>(init: T, saved: unknown, p: Project, skip: readonly string[]): T {
  if (!saved || typeof saved !== 'object') return init;
  const known = knownRefs(p);
  const out = { ...init } as Record<string, unknown>;
  for (const [k, v] of Object.entries(saved as Record<string, unknown>)) {
    if (skip.includes(k) || !(k in out)) continue;
    const d = out[k];
    if (typeof v === 'string' && typeof d === 'string') {
      const isRef = known.has(d) || /^[a-z]{2,6}_[a-z0-9]{6,}/.test(v);
      // trường tham chiếu (tầng, trục, 部材名…): bỏ giá trị rỗng / không còn trong công trình, giữ mặc định
      if (known.has(d) ? v !== '' && known.has(v) : v === '' || !isRef || known.has(v)) out[k] = v;
    } else if (typeof v === typeof d && v !== null && !Array.isArray(v)) out[k] = v;
  }
  return out as T;
}

/**
 * State nhớ cài đặt nhập lần trước (luôn bật, lưu trong trình duyệt).
 * `skip`: các trường chỉ dùng 1 lần (vị trí đặt, đang sửa…) – không nhớ.
 */
export function useRemembered<T extends object>(key: string, p: Project, init: () => T, skip: readonly string[] = []) {
  const [v, setV] = useState<T>(() => {
    const i = init();
    try {
      const raw = localStorage.getItem('s3t.in.' + key);
      return raw ? merge(i, JSON.parse(raw), p, skip) : i;
    } catch {
      return i;
    }
  });
  // đổi công trình / xoá tầng, trục…: giá trị tham chiếu không còn tồn tại (hoặc rỗng) → về mặc định
  const refKey = [p.levels, p.gridsX, p.gridsY, p.master].map((xs) => xs.map((x) => x.id).join(',')).join('|');
  // giá trị mặc định lần trước: ô người dùng chưa đổi (vẫn = mặc định cũ) thì theo mặc định mới
  // (vd công trình trắng: thêm tầng dần → đỉnh cột / cao độ dầm theo tầng mới, không kẹt ở GL)
  const lastInit = useRef<Record<string, unknown> | null>(null);
  useEffect(() => {
    const known = knownRefs(p);
    const i = init() as Record<string, unknown>;
    const cur = v as Record<string, unknown>;
    const fix: Record<string, unknown> = {};
    const li = lastInit.current;
    for (const [k, d] of Object.entries(i)) {
      if (skip.includes(k) || typeof d !== 'string' || !known.has(d)) continue;
      const c = cur[k];
      if (typeof c === 'string' && (c === '' || !known.has(c) || (li && li[k] === c && c !== d))) fix[k] = d;
    }
    lastInit.current = i;
    if (Object.keys(fix).length) setV((o) => ({ ...o, ...fix }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refKey]);
  useEffect(() => {
    try {
      const o = Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !skip.includes(k)));
      localStorage.setItem('s3t.in.' + key, JSON.stringify(o));
    } catch { /* bỏ qua */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, key]);
  return [v, setV] as const;
}
