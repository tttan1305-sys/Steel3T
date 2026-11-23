// Điểm liên kết (point) của từng cây: đầu 左/右, 上/下, 中 (chỗ tách ブラケット / nối cột / クロスプレート)
import { JointPos, Member, Project, Vec3, beamEnd } from './model';
import type { JPoint } from './Viewer3D';
import { linkPoint } from './editOps';

export function jointPoints(p: Project, members: Member[]): JPoint[] {
  const by = new Map<string, Member[]>();
  for (const m of members) {
    if (!m.source || m.part === 'shikuchi' || (m.kind !== 'beam' && m.kind !== 'column' && m.kind !== 'brace')) continue;
    by.set(m.source, [...(by.get(m.source) ?? []), m]);
  }
  const out: JPoint[] = [];
  // 結合 / 切断: 2 đầu đã nối → 1 point chung theo 継手 của liên kết
  const linked: { src: string; at: Vec3 }[] = [];
  for (const lk of p.links ?? []) {
    const lp = linkPoint(members, lk.a, lk.b);
    if (!lp) continue;
    linked.push({ src: lk.a, at: lp.at }, { src: lk.b, at: lp.at });
    const ok = lk.type === 'weld' || p.joints.some((j) => j.id === lk.jointId);
    out.push({ key: `link|${lk.id}`, p: lp.at, color: ok ? '#16a34a' : '#f59e0b' });
  }
  const near = (src: string, pt: Vec3) => linked.some((l) => l.src === src && Math.hypot(l.at[0] - pt[0], l.at[1] - pt[1], l.at[2] - pt[2]) < 400);
  const has = (ms: Member[], pos: JointPos) => ms.some((m) => m.joints?.some((j) => j.pos === pos));
  const add = (key: string, pt: Vec3, ok: boolean, special = false) => near(key.split('|')[0], pt) || out.push({ key, p: pt, color: special ? '#7c3aed' : ok ? '#16a34a' : '#f59e0b' });
  for (const [src, list] of by) {
    const ms = [...list].sort((a, b) => (a.piece ?? 0) - (b.piece ?? 0));
    const kind = ms[0].kind;
    if (kind === 'beam') {
      const bm = p.beams.find((b) => b.id === src);
      if (!bm) continue;
      const r1 = beamEnd(bm, 1) === 'rigid', r2 = beamEnd(bm, 2) === 'rigid';
      add(`${src}|left`, ms[0].a, has(ms, 'left'), r1);
      add(`${src}|right`, ms[ms.length - 1].b, has(ms, 'right'), r2);
      for (let i = 0; i + 1 < ms.length; i++) add(`${src}|mid`, mid(ms[i].b, ms[i + 1].a), has(ms, 'mid'));
    } else if (kind === 'column') {
      if (!p.columns.some((c) => c.id === src)) continue;
      add(`${src}|bottom`, ms[0].a, has(ms, 'bottom'));
      add(`${src}|top`, ms[ms.length - 1].b, has(ms, 'top'));
      for (let i = 0; i + 1 < ms.length; i++) if (!ms[i].dCut) add(`${src}|mid`, mid(ms[i].b, ms[i + 1].a), has(ms, 'mid'));
    } else {
      const br = p.braces?.find((b) => b.id === src);
      if (!br) {
        // 方杖: 左 = đầu cột, 右 = đầu dầm
        if (p.knees?.some((k) => k.id === src)) {
          add(`${src}|left`, ms[0].a, has(ms, 'left'));
          add(`${src}|right`, ms[0].b, has(ms, 'right'));
        }
        continue;
      }
      for (const m of ms) {
        add(`${src}|left`, m.a, has(ms, 'left'));
        add(`${src}|right`, m.b, has(ms, 'right'));
      }
      if (br.x) add(`${src}|mid`, mid(ms[0].a, ms[0].b), has(ms, 'mid'));
    }
  }
  return out;
}
const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
