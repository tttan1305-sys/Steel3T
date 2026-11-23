import { download } from './OutputTabs';
// Tab 出荷リスト: danh sách xuất hàng, xuất file Excel (.xlsx)
import * as XLSX from 'xlsx';
import { KIND_LABEL, Member, Project } from '../model';
import { Field, Sel, Section, fmtKg, fmtMm } from '../ui';
import { baseKg, boltGrips, boltsPerLocation, jointPlates, plateKg } from '../jointGeom';
import { boltLength } from '../kiseihin';
import { jointMaterial, jointUsers, JOINT_POS_LABEL, jointTypeName } from '../model';

export interface ShipFilter {
  zone: string;
  group: string;
  cls: string;
}

export interface ShipRow {
  zone: string;
  group: string;
  cls: string;
  item: string; // 品名
  mark: string; // 符号
  section: string;
  material: string;
  length: number;
  qty: number;
  unit: number;
  total: number;
  area: number;
  paint: string;
  joint: string;
  asm: string;
}

export function filterMembers(members: Member[], f: ShipFilter) {
  return members.filter((m) => (!f.zone || m.zone === f.zone) && (!f.group || m.group === f.group) && (!f.cls || m.cls === f.cls));
}

export function shipRows(members: Member[]): ShipRow[] {
  const map = new Map<string, ShipRow>();
  for (const m of members) {
    const k = [m.zone, m.group, m.cls, m.mark, m.length, m.paint, m.asm].join('|');
    const r = map.get(k);
    if (r) {
      r.qty++;
      r.total += m.weight;
      r.area += m.area ?? 0;
    } else
      map.set(k, {
        zone: m.zone ?? '',
        group: m.group ?? '',
        cls: m.cls ?? '',
        item: KIND_LABEL[m.kind],
        mark: m.mark,
        section: m.section.code,
        material: m.section.material,
        length: m.length,
        qty: 1,
        unit: m.weight,
        total: m.weight,
        area: m.area ?? 0,
        paint: m.paint ?? '',
        joint: m.joint ?? '',
        asm: m.asm ?? '',
      });
  }
  return [...map.values()].sort(
    (a, b) => a.zone.localeCompare(b.zone) || a.group.localeCompare(b.group) || a.mark.localeCompare(b.mark, undefined, { numeric: true }) || b.length - a.length,
  );
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function exportShipXlsx(p: Project, members: Member[], f: ShipFilter) {
  const ms = filterMembers(members, f);
  const rows = shipRows(ms);
  const wb = XLSX.utils.book_new();
  const head = ['No', '工区', 'グループ', '分類', '品名', '符号', '断面', '材質', '長さ(mm)', '数量', '単重(kg)', '総重量(kg)', '塗装面積(m²)', '塗装', '継手', '組立品'];
  const total = rows.reduce((a, r) => a + r.total, 0);
  const data = [
    [`出荷リスト – ${p.name}`],
    [`Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}`, '', '', `Lọc: ${[f.zone, f.group, f.cls].filter(Boolean).join(' / ') || 'Tất cả'}`],
    [],
    head,
    ...rows.map((r, i) => [i + 1, r.zone, r.group, r.cls, r.item, r.mark, r.section, r.material, r.length, r.qty, r1(r.unit), r1(r.total), r1(r.area), r.paint, r.joint, r.asm]),
    [],
    ['', '', '', '', '', '', '', '', 'Tổng', rows.reduce((a, r) => a + r.qty, 0), '', r1(total), r1(rows.reduce((a, r) => a + r.area, 0))],
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [5, 8, 12, 10, 10, 8, 18, 8, 10, 6, 10, 12, 12, 14, 8].map((w) => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, '出荷リスト');
  const ar = asmRows(ms);
  if (ar.length) {
    const d2: (string | number)[][] = [['No', '組立品符号', '構成部材', '数量', '単重(kg)', '総重量(kg)']];
    ar.forEach((r, i) => d2.push([i + 1, r.mark, r.parts.map((x) => `${x.mark}(${x.section} L${x.length})×${x.n}`).join(', '), r.qty, r1(r.unit), r1(r.unit * r.qty)]));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(d2), '組立品');
  }

  // Tổng hợp theo 工区 × グループ
  const zones = [...new Set(ms.map((m) => m.zone ?? '(chưa gán)'))];
  const groups = [...new Set(ms.map((m) => m.group ?? '(chưa gán)'))];
  const sum = [
    ['集計 (kg)', ...groups, 'Tổng'],
    ...zones.map((z) => {
      const vals = groups.map((g) => r1(ms.filter((m) => (m.zone ?? '(chưa gán)') === z && (m.group ?? '(chưa gán)') === g).reduce((a, m) => a + m.weight, 0)));
      return [z, ...vals, r1(vals.reduce((a, v) => a + v, 0))];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sum), '集計');

  // 継手
  if (p.joints.length) {
    const jr: (string | number)[][] = [['継手', '対象', '種類', '部材名', '箇所', 'Bulông/箇所', 'Tổng bulông', 'Bulông', 'Vật liệu bản', 'KL bản ghép (kg)', 'Pitch/Gauge/へりあき (bụng)', '首下長さ (トルシア)']];
    for (const j of p.joints) {
      const cnt = (m: (typeof ms)[number]) => (m.joints ?? []).filter((x) => x.name === j.name && !x.dup).length;
      const locs = ms.reduce((a, m) => a + cnt(m), 0);
      const kg = ms.reduce((a, m) => a + cnt(m) * jointPlates(m.section, j, 0).reduce((x, pl) => x + plateKg(pl), 0), 0);
      jr.push([
        j.name,
        j.target === 'beam' ? '梁' : '柱',
        jointTypeName(j.type),
        jointUsers(p, j.id).map((u) => u.m.name + '(' + u.pos.map((x) => JOINT_POS_LABEL[x]).join('') + ')').join(', '),
        locs,
        boltsPerLocation(j),
        boltsPerLocation(j) * locs,
        `${j.bolt.grade} M${j.bolt.dia}`,
        jointMaterial(p, j),
        r1(kg),
        `${j.webBolts.pitch}/${j.webBolts.gauge}/${j.webBolts.edge}`,
        (() => {
          const m0 = ms.find((m) => cnt(m));
          return m0 ? boltGrips(m0.section, j).map((g) => `${g.label} M${j.bolt.dia}×${boltLength(j.bolt.dia, g.grip, j.bolt.grade).L}`).join(', ') : '';
        })(),
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(jr), '継手');
  }
  if (p.bases.length) {
    const br: (string | number)[][] = [['ベース', '種類', '部材名', 'Số chân', 'Bản đế t×B×D', 'Vật liệu', 'KL/cái (kg)', 'アンカーボルト', 'Tổng bulông neo']];
    for (const b of p.bases) {
      const n = ms.filter((m) => m.base === b.name).length;
      br.push([
        b.name,
        b.kind,
        b.memberIds.map((id) => p.master.find((m) => m.id === id)?.name ?? '').join(', '),
        n,
        `${b.t}×${b.b}×${b.d}`,
        b.material,
        r1(baseKg(b)),
        `${b.anchor.material} M${b.anchor.dia}×${b.anchor.length}`,
        b.anchor.n * n,
      ]);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(br), 'ベース');
  }
  download(`${p.name}-出荷リスト.xlsx`, XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function ShipPanel({ p, members, f, setF }: { p: Project; members: Member[]; f: ShipFilter; setF: (f: ShipFilter) => void }) {
  const ms = filterMembers(members, f);
  const opt = (names: string[]) => [{ value: '', label: 'Tất cả' }, ...names.map((n) => ({ value: n, label: n }))];
  return (
    <>
      <Section title="Lọc 出荷リスト">
        <Field label="工区">
          <Sel value={f.zone} onChange={(v) => setF({ ...f, zone: v })} options={opt(p.zones.map((z) => z.name))} />
        </Field>
        <div className="grid2">
          <Field label="グループ">
            <Sel value={f.group} onChange={(v) => setF({ ...f, group: v })} options={opt(p.groups.map((z) => z.name))} />
          </Field>
          <Field label="分類">
            <Sel value={f.cls} onChange={(v) => setF({ ...f, cls: v })} options={opt(p.classes.map((z) => z.name))} />
          </Field>
        </div>
      </Section>
      <Section title="Xuất file">
        <table className="table kv">
          <tbody>
            <tr>
              <td>Số cấu kiện</td>
              <td className="num">{ms.length}</td>
            </tr>
            <tr>
              <td>Tổng khối lượng</td>
              <td className="num">{fmtKg(ms.reduce((a, m) => a + m.weight, 0))} kg</td>
            </tr>
          </tbody>
        </table>
        <button className="primary" style={{ marginTop: 8 }} onClick={() => exportShipXlsx(p, members, f)}>
          Xuất Excel (.xlsx)
        </button>
        <p className="muted small">File gồm các sheet: 出荷リスト (chi tiết), 集計 (工区 × グループ), 継手 (số bulông, KL bản ghép), ベース (bản đế, bulông neo).</p>
      </Section>
    </>
  );
}

/** 組立品: gom chi tiết hàn với nhau theo cụm, cụm cùng cấu tạo gộp số lượng */
export function asmRows(ms: Member[]) {
  const byId = new Map<string, Member[]>();
  for (const m of ms) if (m.asmId) byId.set(m.asmId, [...(byId.get(m.asmId) ?? []), m]);
  const map = new Map<string, { mark: string; parts: { mark: string; item: string; section: string; length: number; n: number; kg: number }[]; qty: number; unit: number }>();
  for (const parts of byId.values()) {
    const mark = parts[0].asm ?? parts[0].mark;
    const r = map.get(mark);
    if (r) { r.qty++; continue; }
    const pm = new Map<string, { mark: string; item: string; section: string; length: number; n: number; kg: number }>();
    for (const m of parts) {
      const k = m.mark + '|' + m.length;
      const x = pm.get(k);
      if (x) x.n++;
      else pm.set(k, { mark: m.mark, item: m.part === 'shikuchi' ? '仕口' : KIND_LABEL[m.kind], section: m.section.code, length: m.length, n: 1, kg: m.weight });
    }
    map.set(mark, { mark, parts: [...pm.values()], qty: 1, unit: parts.reduce((a, m) => a + m.weight, 0) });
  }
  return [...map.values()].sort((a, b) => a.mark.localeCompare(b.mark, undefined, { numeric: true }));
}

export function ShipTable({ members, f, sub }: { members: Member[]; f: ShipFilter; sub: string }) {
  const ms = filterMembers(members, f);
  if (sub === 'asm') {
    const rows = asmRows(ms);
    const single = ms.filter((m) => !m.asmId).length;
    return (
      <div className="bom">
        <h2>組立品 – cụm chi tiết hàn với nhau</h2>
        <p className="muted small">Chi tiết được ràng buộc hàn với nhau (cột cắt bởi 通しダイアフラム, ブラケット hàn vào 本柱, 結合 hàn) gom thành 1 組立品. Cụm cùng cấu tạo gộp số lượng. Chi tiết đơn (không hàn với chi tiết khác): {single}.</p>
        <table className="table big">
          <thead>
            <tr>
              <th>No</th>
              <th>組立品符号</th>
              <th>構成部材 (符号 · 品名 · 断面 · 長さ × số)</th>
              <th className="num">数量</th>
              <th className="num">単重 (kg)</th>
              <th className="num">総重量 (kg)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.mark}>
                <td className="num">{i + 1}</td>
                <td><b>{r.mark}</b></td>
                <td>
                  {r.parts.map((x, k) => (
                    <div key={k}>{x.mark} · {x.item} · {x.section} · {fmtMm(x.length)} × {x.n}</div>
                  ))}
                </td>
                <td className="num">{r.qty}</td>
                <td className="num">{fmtKg(r.unit)}</td>
                <td className="num">{fmtKg(r.unit * r.qty)}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={3}>Tổng cộng</td>
              <td className="num">{rows.reduce((a, r) => a + r.qty, 0)}</td>
              <td />
              <td className="num">{fmtKg(rows.reduce((a, r) => a + r.unit * r.qty, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
  if (sub === 'sum') {
    const zones = [...new Set(ms.map((m) => m.zone ?? '(chưa gán)'))];
    const groups = [...new Set(ms.map((m) => m.group ?? '(chưa gán)'))];
    return (
      <div className="bom">
        <h2>集計 – 工区 × グループ (kg)</h2>
        <table className="table big">
          <thead>
            <tr>
              <th>工区</th>
              {groups.map((g) => (
                <th key={g} className="num">
                  {g}
                </th>
              ))}
              <th className="num">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((z) => {
              const vals = groups.map((g) => ms.filter((m) => (m.zone ?? '(chưa gán)') === z && (m.group ?? '(chưa gán)') === g).reduce((a, m) => a + m.weight, 0));
              return (
                <tr key={z}>
                  <td>
                    <b>{z}</b>
                  </td>
                  {vals.map((v, i) => (
                    <td key={i} className="num">
                      {fmtKg(v)}
                    </td>
                  ))}
                  <td className="num">
                    <b>{fmtKg(vals.reduce((a, v) => a + v, 0))}</b>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  const rows = shipRows(ms);
  return (
    <div className="bom">
      <h2>出荷リスト</h2>
      <table className="table big">
        <thead>
          <tr>
            <th>No</th>
            <th>工区</th>
            <th>グループ</th>
            <th>分類</th>
            <th>品名</th>
            <th>符号</th>
            <th>断面</th>
            <th>材質</th>
            <th className="num">長さ</th>
            <th className="num">数量</th>
            <th className="num">総重量 (kg)</th>
            <th>塗装</th>
            <th>継手</th>
            <th>組立品</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="num">{i + 1}</td>
              <td>{r.zone}</td>
              <td>{r.group}</td>
              <td>{r.cls}</td>
              <td>{r.item}</td>
              <td>
                <b>{r.mark}</b>
              </td>
              <td>{r.section}</td>
              <td>{r.material}</td>
              <td className="num">{fmtMm(r.length)}</td>
              <td className="num">{r.qty}</td>
              <td className="num">{fmtKg(r.total)}</td>
              <td>{r.paint}</td>
              <td>{r.joint}</td>
              <td>{r.asm}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={9}>Tổng cộng</td>
            <td className="num">{rows.reduce((a, r) => a + r.qty, 0)}</td>
            <td className="num">{fmtKg(rows.reduce((a, r) => a + r.total, 0))}</td>
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
