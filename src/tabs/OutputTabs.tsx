import { Member, MemberKind, KIND_LABEL, Project } from '../model';
import { bomByMark, bomBySection } from '../build';
import { Field, Sel, Section, fmtKg, fmtMm } from '../ui';
import { DrawingOptions } from '../Drawing2D';

type ClaudeWin = { claude?: { use?: (n: string) => Promise<unknown> } };
type Dl = { save: (r: { filename: string; data: string | Blob | ArrayBuffer | ArrayBufferView }) => Promise<unknown> } | null;
let dlP: Promise<Dl> | null = null;
/** khi chạy trong Artifact claude.ai: tải file qua capability downloads (link <a download> bị chặn) */
const claudeDl = (): Promise<Dl> => {
  const c = (window as unknown as ClaudeWin).claude;
  if (!c?.use) return Promise.resolve(null);
  dlP ??= c.use('downloads').then((d) => (d as Dl) ?? null).catch(() => null);
  return dlP;
};
setTimeout(() => void claudeDl(), 0);

function plainDownload(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function download(name: string, content: string | Blob | ArrayBuffer, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  claudeDl().then((d) => {
    if (!d) return plainDownload(name, blob);
    d.save({ filename: name, data: blob }).catch((e: { code?: string; message?: string }) => {
      if (e?.code !== 'declined') alert('Không tải được file: ' + (e?.message ?? e?.code ?? ''));
    });
  });
}

export function DrawingPanel({ p, opt, setOpt, onExport }: { p: Project; opt: DrawingOptions; setOpt: (o: DrawingOptions) => void; onExport: () => void }) {
  return (
    <Section title="Thiết lập bản vẽ">
      {opt.kind === 'plan' && (
        <Field label="Tầng">
          <Sel value={opt.levelId} onChange={(v) => setOpt({ ...opt, levelId: v })} options={p.levels.map((l) => ({ value: l.id, label: `${l.name} (+${l.elevation})` }))} />
        </Field>
      )}
      {opt.kind === 'frame' && (
        <Field label="Khung tại trục">
          <Sel value={opt.gridXId} onChange={(v) => setOpt({ ...opt, gridXId: v })} options={p.gridsX.map((g) => ({ value: g.id, label: `Trục ${g.name}` }))} />
        </Field>
      )}
      {opt.kind === 'wall' && (
        <Field label="Mặt tường">
          <Sel
            value={opt.wallSide}
            onChange={(v) => setOpt({ ...opt, wallSide: v })}
            options={[
              { value: 'front', label: `Trục ${p.gridsY[0]?.name}` },
              { value: 'back', label: `Trục ${p.gridsY[p.gridsY.length - 1]?.name}` },
            ]}
          />
        </Field>
      )}
      <div className="grid2">
        <Field label="Lọc theo">
          <Sel
            value={opt.filterBy}
            onChange={(v) => setOpt({ ...opt, filterBy: v, filterVal: '' })}
            options={[
              { value: '', label: 'Không lọc' },
              { value: 'zone', label: '工区' },
              { value: 'group', label: 'グループ' },
              { value: 'cls', label: '分類' },
            ]}
          />
        </Field>
        {opt.filterBy && (
          <Field label="Giá trị">
            <Sel
              value={opt.filterVal}
              onChange={(v) => setOpt({ ...opt, filterVal: v })}
              options={[{ value: '', label: 'Tất cả' }, ...{ zone: p.zones, group: p.groups, cls: p.classes }[opt.filterBy].map((x) => ({ value: x.name, label: x.name }))]}
            />
          </Field>
        )}
      </div>
      <label className="check">
        <input type="checkbox" checked={opt.showMarks} onChange={(e) => setOpt({ ...opt, showMarks: e.target.checked })} /> Hiện mã cấu kiện
      </label>
      <div className="row-gap">
        <button className="primary" onClick={onExport}>
          Xuất SVG
        </button>
        <button onClick={() => window.print()}>In / PDF</button>
      </div>
      <p className="muted small">File SVG mở được bằng AutoCAD (Import), Illustrator, Inkscape hoặc trình duyệt.</p>
    </Section>
  );
}

function toCsv(rows: (string | number)[][]) {
  return '﻿' + rows.map((r) => r.map((c) => (typeof c === 'string' && /[",;\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}

export function BomPanel({ p, members }: { p: Project; members: Member[] }) {
  const total = members.reduce((a, m) => a + m.weight, 0);
  const kinds = Object.keys(KIND_LABEL) as MemberKind[];
  const exportMark = () => {
    const rows = bomByMark(members);
    download(
      `${p.name}-list-dat-hang-theo-cau-kien.csv`,
      toCsv([
        ['Mã', 'Loại', 'Tiết diện', 'Vật liệu', 'Dài (mm)', 'SL', 'KL 1 cái (kg)', 'Tổng KL (kg)'],
        ...rows.map((r) => [r.mark, KIND_LABEL[r.kind], r.section, r.material, r.length, r.qty, r.unitWeight.toFixed(2), r.totalWeight.toFixed(2)]),
        ['', '', '', '', '', '', 'Tổng', total.toFixed(2)],
      ]),
      'text/csv',
    );
  };
  const exportSec = () => {
    const rows = bomBySection(members);
    download(
      `${p.name}-list-dat-hang-theo-tiet-dien.csv`,
      toCsv([
        ['Tiết diện', 'Vật liệu', 'kg/m', 'Số thanh', 'Tổng dài (m)', 'Tổng KL (kg)'],
        ...rows.map((r) => [r.section, r.material, r.kgm.toFixed(2), r.count, (r.totalLength / 1000).toFixed(2), r.totalWeight.toFixed(2)]),
        ['', '', '', '', 'Tổng', total.toFixed(2)],
      ]),
      'text/csv',
    );
  };
  return (
    <>
      <Section title="Tổng hợp khối lượng">
        <table className="table kv">
          <tbody>
            {kinds.map((k) => {
              const ms = members.filter((m) => m.kind === k);
              if (!ms.length) return null;
              return (
                <tr key={k}>
                  <td>
                    {KIND_LABEL[k]} ({ms.length})
                  </td>
                  <td className="num">{fmtKg(ms.reduce((a, m) => a + m.weight, 0))} kg</td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Tổng cộng</td>
              <td className="num">{fmtKg(total)} kg</td>
            </tr>
          </tbody>
        </table>
      </Section>
      <Section title="Xuất file">
        <div className="row-gap">
          <button className="primary" onClick={exportMark}>
            CSV theo cấu kiện
          </button>
          <button className="primary" onClick={exportSec}>
            CSV theo tiết diện
          </button>
        </div>
        <p className="muted small">CSV mở trực tiếp bằng Excel (UTF-8, có dấu tiếng Việt).</p>
      </Section>
    </>
  );
}

export function BomTable({ members, sub }: { members: Member[]; sub: string }) {
  const total = members.reduce((a, m) => a + m.weight, 0);
  if (sub === 'sec') {
    const rows = bomBySection(members);
    return (
      <div className="bom">
        <h2>LIST ĐẶT HÀNG THEO TIẾT DIỆN</h2>
        <table className="table big">
          <thead>
            <tr>
              <th>STT</th>
              <th>Tiết diện</th>
              <th>Vật liệu</th>
              <th>kg/m</th>
              <th>Số thanh</th>
              <th>Tổng dài (m)</th>
              <th>Tổng KL (kg)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.section}>
                <td className="num">{i + 1}</td>
                <td>
                  <b>{r.section}</b>
                </td>
                <td>{r.material}</td>
                <td className="num">{r.kgm.toFixed(2)}</td>
                <td className="num">{r.count}</td>
                <td className="num">{(r.totalLength / 1000).toFixed(2)}</td>
                <td className="num">{fmtKg(r.totalWeight)}</td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={6}>Tổng cộng</td>
              <td className="num">{fmtKg(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  }
  const rows = bomByMark(members);
  return (
    <div className="bom">
      <h2>LIST ĐẶT HÀNG THEO CẤU KIỆN</h2>
      <table className="table big">
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã</th>
            <th>Loại</th>
            <th>Tiết diện</th>
            <th>Vật liệu</th>
            <th>Dài (mm)</th>
            <th>SL</th>
            <th>KL 1 cái (kg)</th>
            <th>Tổng KL (kg)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.mark + "|" + r.length}>
              <td className="num">{i + 1}</td>
              <td>
                <b>{r.mark}</b>
              </td>
              <td>{KIND_LABEL[r.kind]}</td>
              <td>{r.section}</td>
              <td>{r.material}</td>
              <td className="num">{fmtMm(r.length)}</td>
              <td className="num">{r.qty}</td>
              <td className="num">{fmtKg(r.unitWeight)}</td>
              <td className="num">{fmtKg(r.totalWeight)}</td>
            </tr>
          ))}
          <tr className="total">
            <td colSpan={8}>Tổng cộng</td>
            <td className="num">{fmtKg(total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
