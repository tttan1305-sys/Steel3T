import { JIS_ANCHOR_GRADES, JIS_BOLT_GRADES } from '../jis';
// 本体 › 継手: quản lý mối nối dầm, cột (GPL / 二面せん断 / SPL) và ベース chân cột
import React, { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { BasePlate, BoltGroup, Joint, JointPos, JointType, JOINT_POS_LABEL, JOINT_TYPE_LABEL, Project, defaultJointType, lrFreeOf, beamJointPrefix, beamJointRenames, nextJointName, jointUsers, newBase, newJoint, GplCut, GPL_CUT_LABEL, weldS, EpSpec, epOf, epGap, jointTypeName, KADOPITA_SIZES } from '../model';
import { Field, Num, Sel, Section, TabProps, Text, fmtKg } from '../ui';
import { BOLT_STD } from '../jis';
import { ANCHOR_DIAS, BRACE_SHEET, FREE_BASE, anchorRow, boltLength, freeBaseCode } from '../kiseihin';
import { BRACE_SHAPES, braceDims } from '../braceGusset';
import JointLibrary from './JointLibrary';
import { applyFormat, applyRemembered, fmtSummary, formatsOf, jointCodes, memClear, memCount, memDelete, memList, saveFormat, MAX_FMT } from '../jointMemory';
import LinkPanel from './LinkPanel';
import { JointLiveShape } from '../JointShape';
import { EpShape } from '../EpShape';
import FloatWin from '../FloatWin';
import { Fig, FigCtx } from '../FigSlot';
import { JointDetail, JointDimEditor, JointTable } from '../JointDetail';
import { LIB_FAMILIES, LibFamily, applyTemplate, libRows } from '../jointLib';
import { boltGrips, boltWarnings, boltsPerLocation, groupWidth, jointPlates, plateKg, sideLen, gplDims, baseLayout } from '../jointGeom';
import BaseShape from '../BaseShape';
import BraceShape from '../BraceShape';
import JointPreviewWin, { PreviewReq } from '../JointPreview';

const matOptions = (p: Project, cur: string) => [
  ...(p.params.member.allowedMaterials.includes(cur) ? [] : [{ value: cur, label: `⚠ ${cur}` }]),
  ...p.params.member.allowedMaterials.map((m) => ({ value: m, label: m })),
];

/** Gán 継手 cho 部材名 tại một vị trí (上/下/中 hoặc 左/右/中) */
export function assignJoint(d: Project, jointId: string | null, masterId: string, pos: JointPos) {
  const m = d.master.find((x) => x.id === masterId);
  if (!m) return;
  m.joints = { ...(m.joints ?? {}) };
  if (jointId) m.joints[pos] = jointId;
  else delete m.joints[pos];
}
export function assignBase(d: Project, baseId: string | null, masterId: string) {
  for (const b of d.bases) b.memberIds = b.memberIds.filter((x) => x !== masterId);
  const b = d.bases.find((x) => x.id === baseId);
  if (b) b.memberIds.push(masterId);
}

/** Bộ nhớ 継手 theo kích thước (dùng chung mọi công trình trên máy này) */
function JointMemPanel() {
  const [, bump] = useState(0);
  const list = memList().sort((a, b) => b.at - a.at);
  const n = memCount();
  return (
    <details className="jmem">
      <summary>💾 Định dạng 継手 đã lưu theo kích thước: <b>{n}</b></summary>
      <div className="muted small">Trong cửa sổ sửa 継手, bấm 💾 Lưu định dạng để nhớ cài đặt (số bulông, ピッチ, へりあき, tấm…) theo loại 継手 + kích thước cây, giữ 3 lần gần nhất. Tạo 継手 mới cùng loại + kích thước sẽ mặc định lấy lần gần nhất; chọn lần khác ở ô “Định dạng đã lưu”.</div>
      {n > 0 && (
        <table className="table compact">
          <thead><tr><th>Đối tượng</th><th>Loại</th><th>Kích thước</th><th>Số lần</th><th>Gần nhất</th><th /></tr></thead>
          <tbody>
            {list.slice(0, 50).map(({ k, at, n: cnt }) => {
              const [t, ty, code] = k.split('|');
              return (
                <tr key={k}>
                  <td>{t === 'beam' ? 'Dầm' : t === 'column' ? 'Cột' : 'ブレース'}</td>
                  <td>{ty}</td>
                  <td className="nowrap">{code}</td>
                  <td>{cnt}</td>
                  <td className="small nowrap">{new Date(at).toLocaleString()}</td>
                  <td><button className="link" onClick={() => { memDelete(k); bump((x) => x + 1); }}>Xoá</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {n > 0 && <button className="link" onClick={() => { memClear(); bump((x) => x + 1); }}>Xoá hết bộ nhớ</button>}
    </details>
  );
}

/** Gán theo tên gõ vào: tên mới thì tạo 継手 mới (kiểu gợi ý theo vị trí) và hiện trong tab 継手. Trả về lỗi nếu có. */
export function assignJointByName(d: Project, name: string, masterId: string, pos: JointPos, type?: JointType): string | null {
  const m = d.master.find((x) => x.id === masterId);
  if (!m) return null;
  const target = m.kind;
  const n = name.trim();
  if (!n) return assignJoint(d, null, masterId, pos), null;
  let j = d.joints.find((x) => x.name === n);
  if (j && j.target !== target) return `継手 ${n} đã dùng cho ${j.target === 'beam' ? 'dầm' : j.target === 'column' ? 'cột' : 'ブレース'}.`;
  if (!j) {
    j = newJoint(d.joints.filter((x) => x.target === target).length + 1, target, d.params);
    j.name = n;
    if (target !== 'brace') j.type = type ?? (target === 'column' && pos === 'mid' ? 'EP' : defaultJointType(pos));
    if (j.type === 'EP') { j.ep = epOf(j); j.gap = 7; }
    j.pos = 0;
    // cài đặt đã nhớ từ công trình trước cho cùng loại 継手 + quy cách cây
    applyRemembered(j, d.sections.find((s) => s.id === m.sectionId)?.code);
    d.joints.push(j);
  } else if (type && target !== 'brace') j.type = type;
  assignJoint(d, j.id, masterId, pos);
  return null;
}
export function assignBaseByName(d: Project, name: string, masterId: string) {
  const n = name.trim();
  if (!n) return assignBase(d, null, masterId);
  let b = d.bases.find((x) => x.name === n);
  if (!b) {
    b = newBase(d.bases.length + 1);
    b.name = n;
    d.bases.push(b);
  }
  assignBase(d, b.id, masterId);
}

/** Ô nhập tên có gợi ý; ghi nhận khi rời ô hoặc Enter. */
export function NameCombo({ value, options, onCommit, width, placeholder, className }: { value: string; options: (string | { value: string; label: string })[]; onCommit: (v: string) => void; width?: number; placeholder?: string; className?: string }) {
  const [t, setT] = useState(value);
  const [listId] = useState(() => 'nc' + Math.random().toString(36).slice(2, 8));
  useEffect(() => setT(value), [value]);
  const commit = () => t.trim() !== value && onCommit(t);
  return (
    <>
      <input
        type="text"
        list={listId}
        className={className}
        value={t}
        placeholder={placeholder}
        style={width ? { width } : undefined}
        onChange={(e) => setT(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      <datalist id={listId}>
        {options.map((o) =>
          typeof o === 'string' ? <option key={o} value={o} /> : <option key={o.value} value={o.value} label={o.label} />,
        )}
      </datalist>
    </>
  );
}

function BoltGroupEditor({ g, onChange, title, g2, extra }: { g: BoltGroup; onChange: (g: BoltGroup) => void; title: string; g2?: boolean; extra?: ReactNode }) {
  const f = (k: keyof BoltGroup) => <Num value={g[k] ?? 0} min={k === 'rows' || k === 'cols' ? 1 : 0} step={k === 'rows' || k === 'cols' ? 1 : 5} onChange={(v) => onChange({ ...g, [k]: v })} />;
  return (
    <div className="bolt-group">
      <div className="field-label">{title}</div>
      <div className="bg-grid">
        <label>
          Số hàng {f('rows')}
        </label>
        <label>
          Số cột / bên {f('cols')}
        </label>
        <label>
          Pitch P {f('pitch')}
        </label>
        <label>
          Gauge g {f('gauge')}
        </label>
        <label>
          へりあき e {f('edge')}
        </label>
        {g2 && (
          <label title="Gauge thứ 2: 2 hàng + g2 = チドリ, 4 hàng = ダブル">
            g2 {f('gauge2')}
          </label>
        )}
        {extra}
      </div>
    </div>
  );
}

/** Sơ đồ bố trí bulông trên bản bụng (nhìn đứng) */
function BoltSketch({ j }: { j: Joint }) {
  const g = j.webBolts;
  const side = sideLen(g);
  const W = j.type === 'GPL' ? side + 40 : 2 * side + 10;
  const H = groupWidth(g);
  const holes: [number, number][] = [];
  const sides = j.type === 'GPL' ? [1] : [-1, 1];
  for (const sd of sides)
    for (let c = 0; c < g.cols; c++)
      for (let r = 0; r < g.rows; r++) {
        const x = j.type === 'GPL' ? 40 + g.edge + c * g.pitch - W / 2 : sd * (5 + g.edge + c * g.pitch);
        holes.push([x, -H / 2 + g.edge + r * g.gauge]);
      }
  const pad = 40;
  const fs = Math.max(W, H) / 14;
  const hole = BOLT_STD[j.bolt.dia]?.hole ?? j.bolt.dia + 2;
  return (
    <svg className="bolt-sketch" viewBox={`${-W / 2 - pad} ${-H / 2 - pad} ${W + 2 * pad} ${H + 2 * pad + fs * 1.5}`}>
      <rect x={-W / 2} y={-H / 2} width={W} height={H} fill="#fde68a" stroke="#92400e" strokeWidth={2} />
      {j.type !== 'GPL' && <line x1={0} x2={0} y1={-H / 2 - 20} y2={H / 2 + 20} stroke="#dc2626" strokeDasharray="8 4" strokeWidth={2} />}
      {j.type === 'GPL' && <rect x={-W / 2 - 12} y={-H / 2 - 20} width={12} height={H + 40} fill="#94a3b8" />}
      {holes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={hole / 2} fill="#fff" stroke="#0f172a" strokeWidth={2} />
      ))}
      <text x={0} y={H / 2 + pad * 0.6 + fs} fontSize={fs} textAnchor="middle" fill="#0f172a">
        {Math.round(W)} × {Math.round(H)} · P{g.pitch} g{g.gauge} e{g.edge} · M{j.bolt.dia} lỗ Ø{hole}
      </text>
    </svg>
  );
}

/** GPL: クリアランス, サイズS mối hàn, hình dạng cắt FLG và kiểm tra diện tích */
/** Sửa kích thước GPL theo đúng các đường dim trên hình (mỗi ô một thông số, không phép tính) */
function GplDimEditor({ j, sec, upd }: { j: Joint; sec: Project['sections'][number]; upd: (fn: (x: Joint) => void) => void }) {
  const D = gplDims(sec, j);
  const wg = j.webBolts;
  const r = (v: number) => Math.round(v * 10) / 10;
  const n = (k: string, tag: string, v: number, on: (v: number) => void, min = 0, step = 5) => (
    <label className="dc-in" data-dim={k}>
      <span className="dc-tag">{tag}</span>
      <Num value={r(v)} min={min} step={step} onChange={on} />
    </label>
  );
  const setWebL = (x: Joint, L: number) => (x.webL = Math.max(20, L - (x.clear ?? 10)));
  /** giữ mép trên / mép dưới đúng như nhập: H bản = top + g×(hàng−1) + bot */
  const fitV = (x: Joint, top: number, bot: number) => {
    const sp = (x.webBolts.rows - 1) * x.webBolts.gauge;
    const h = top + sp + bot;
    // không làm tròn: mép trên / mép dưới giữ đúng số đã nhập
    x.webH = h;
    x.boltOy = (x.gplOy ?? 0) + h / 2 - top - sp / 2;
  };
  return (
    <div className="jd-editor">
      <div className="field-label">Ngang</div>
      <div className="dc-row">
        {n('a', 'a (mặt cột → bulông)', D.a, (v) => upd((x) => setWebL(x, v + (x.webBolts.cols - 1) * x.webBolts.pitch + x.webBolts.edge)))}
        {n('P', 'P', wg.pitch, (v) => upd((x) => { const a = D.a; x.webBolts.pitch = v; setWebL(x, a + (x.webBolts.cols - 1) * v + x.webBolts.edge); }))}
        {n('n', 'số bulông', wg.cols, (v) => upd((x) => { const a = D.a; x.webBolts.cols = Math.max(1, v); setWebL(x, a + (x.webBolts.cols - 1) * x.webBolts.pitch + x.webBolts.edge); }), 1, 1)}
        {n('e', 'e', wg.edge, (v) => upd((x) => { const a = D.a; x.webBolts.edge = v; setWebL(x, a + (x.webBolts.cols - 1) * x.webBolts.pitch + v); }))}
        {n('s', 'すきま s', D.cl, (v) => upd((x) => { const L = D.L; x.clear = v; setWebL(x, L); }), 0, 1)}
      </div>
      <div className="field-label">Đứng</div>
      <div className="dc-row">
        {n('top', 'mép trên', D.top, (v) => upd((x) => fitV(x, v, D.bot)))}
        {n('g', 'g', wg.gauge, (v) => upd((x) => { x.webBolts.gauge = v; fitV(x, D.top, D.bot); }))}
        {n('rows', 'số hàng', wg.rows, (v) => upd((x) => { x.webBolts.rows = Math.max(1, v); fitV(x, D.top, D.bot); }), 1, 1)}
        {n('bot', 'mép dưới', D.bot, (v) => upd((x) => fitV(x, D.top, v)))}
      </div>
      <div className="dc-row">
        {/* lệch tâm: dời cả tấm và bulông, giữ mép trên / dưới */}
        <label className="dc-in" data-dim="goy">
          <span className="dc-tag">tâm GPL ↔ tâm 部材 (+ lên)</span>
          <Num value={r(D.gs.oy)} step={5} onChange={(v) => upd((x) => { if (!(x.webH > 0)) x.webH = D.gs.h; x.gplOy = v; x.boltOy = (x.boltOy ?? 0) + v - D.gs.oy; })} />
        </label>
      </div>
    </div>
  );
}

/** エレクションピース: mỗi ô một đường dim trên hình (ô đang nhập → dim tô đỏ) */
function EpDimEditor({ j, upd, sec }: { j: Joint; upd: (fn: (x: Joint) => void) => void; sec?: Project['sections'][number] }) {
  const e = epOf(j);
  const n = (k: string, tag: string, key: keyof EpSpec, min = 0, step = 5) => (
    <label className="dc-in" data-dim={k}>
      <span className="dc-tag">{tag}</span>
      <Num value={e[key] as number} min={min} step={step} onChange={(v) => upd((x) => (x.ep = { ...epOf(x), [key]: v }))} />
    </label>
  );
  return (
    <div className="jd-editor">
      <div className="field-label">Khe cột trên – cột dưới</div>
      <div className="dc-row">
        <label className="dc-in" data-dim="eg">
          <span className="dc-tag">ルートギャップ</span>
          <Num value={epGap(j)} min={0} step={1} onChange={(v) => upd((x) => (x.gap = v))} />
        </label>
      </div>
      <div className="field-label">ピース (cột trên 1 tấm, cột dưới 1 tấm, nối bằng 2 添板)</div>
      <div className="dc-row">
        <label className="dc-in">
          <span className="dc-tag">Số mặt cột</span>
          <Sel value={String(e.faces)} onChange={(v) => upd((x) => (x.ep = { ...epOf(x), faces: v === '2' ? 2 : 4 }))} options={[{ value: '4', label: '4 mặt' }, { value: '2', label: '2 mặt' }]} />
        </label>
        {n('en', 'số ピース / mặt', 'n', 1, 1)}
        {n('esp', 'cách nhau', 'sp')}
        {n('eoff', 'lệch tâm', 'off')}
      </div>
      <div className="dc-row">
        {n('et', 't dày', 't', 1, 1)}
        {n('ew', 'nhô ra', 'w', 10)}
        {n('eh', 'cao mỗi tấm', 'h', 10)}
      </div>
      <div className="field-label">添板 (2 tấm kẹp 2 bên ピース)</div>
      <div className="dc-row">
        {n('est', 't dày', 'spT', 1, 1)}
        {n('esw', 'rộng', 'spW', 10)}
        {n('esl', 'dài', 'spL', 10)}
      </div>
      <div className="field-label">Bulông (mỗi bên mối nối)</div>
      <div className="dc-row">
        {n('enb', 'số bulông', 'nb', 1, 1)}
        {n('ep', 'P ピッチ', 'pitch')}
        {n('ee', 'e mối nối → bulông', 'edge')}
      </div>
      <div className="field-label">カドピタ (コラム用裏当て金 – vòng lót mặt trong cột tại mối hàn)</div>
      <div className="dc-row">
        <label className="dc-in" data-dim="ekp">
          <span className="dc-tag">Quy cách</span>
          <Sel
            value={e.kpOn ? KADOPITA_SIZES.find((k) => k.t === e.kpT && k.w === e.kpW)?.code ?? '*' : ''}
            onChange={(v) => upd((x) => { const k = KADOPITA_SIZES.find((q) => q.code === v); x.ep = { ...epOf(x), kpOn: v !== '', ...(k ? { kpT: k.t, kpW: k.w } : {}) }; })}
            options={[{ value: '', label: 'Không dùng' }, ...KADOPITA_SIZES.map((k) => ({ value: k.code, label: k.code })), { value: '*', label: 'Tự nhập' }]}
          />
        </label>
        {e.kpOn && n('ekpt', 't', 'kpT', 1, 1)}
        {e.kpOn && n('ekpw', 'rộng', 'kpW', 5)}
        {e.kpOn && n('ekpu', 'mép trên cao hơn mối nối', 'kpUp', -100, 1)}
      </div>
      <div className="field-label">下がり止め (PL ở 4 mặt trong cột trên, phía trên カドピタ)</div>
      <div className="dc-row">
        {n('esdn', 'số tấm / mặt (0 = không)', 'sdN', 0, 1)}
        {n('esdt', 't', 'sdT', 1, 1)}
        {n('esdw', 'rộng', 'sdW', 5)}
        {n('esdh', 'cao', 'sdH', 5)}
      </div>
      <div className="dc-row">
        {n('esdz', 'mép dưới cách mối nối', 'sdZ', 0, 1)}
        {n('esdsp', 'cách nhau', 'sdSp')}
        {n('esdoff', 'lệch tâm', 'sdOff')}
      </div>
      {sec && sec.type !== 'Box' && sec.type !== 'Pipe' && <div className="muted small">カドピタ / 下がり止め chỉ dùng cho cột hộp (BCR / BCP / STKR).</div>}
    </div>
  );
}

function GplParams({ p, j, sec, upd }: { p: Project; j: Joint; sec?: Project['sections'][number]; upd: (fn: (x: Joint) => void) => void }) {
  const defCut = p.params.member.gplCut ?? 'one';
  const w = weldS(j.webT);
  return (
    <div className="gpl-box">
      <div className="grid3">
        <Field label="サイズS mối hàn">
          <input className="input" readOnly value={`S = ${w.s} (max ${w.max})`} />
        </Field>
        <Field label="Hình dạng GPL">
          <Sel
            value={j.flgCut ?? ''}
            onChange={(v) => upd((x) => (v ? (x.flgCut = v as GplCut) : delete x.flgCut))}
            options={[{ value: '', label: `Theo パラメーター (${GPL_CUT_LABEL[defCut]})` }, ...(Object.keys(GPL_CUT_LABEL) as GplCut[]).map((k) => ({ value: k, label: GPL_CUT_LABEL[k] }))]}
          />
        </Field>
      </div>
    </div>
  );
}

/** 継手 ブレース: GPL (ブレースシート フルサト / hình dạng 図1–図3 / PL tự vẽ), クロスプレート ở 中 */
export function BraceJointCard({ p, set, j, i }: { p: Project; set: TabProps['set']; j: Joint; i: number }) {
  const upd = (fn: (x: Joint) => void) => set((d) => fn(d.joints[i]));
  const users = jointUsers(p, j.id);
  const bsec = p.sections.find((s) => s.id === (users[0]?.m as { sectionId?: string } | undefined)?.sectionId);
  const secW = bsec ? Math.max(bsec.b, bsec.h) : 75;
  const BD = braceDims(j, secW);
  const shapeKey = j.shape ?? (j.sheet ? 'sheet' : 'fig2');
  return (
    <div className="jcard">
      <div className="chips">
        {users.map((u) => (
          <span key={u.m.id} className="chip on">
            {u.m.name} ({u.pos.map((x) => JOINT_POS_LABEL[x]).join('')})
          </span>
        ))}
      </div>
      <div className="grid3">
        <Field label="Tên">
          <Text value={j.name} onChange={(v) => upd((x) => (x.name = v))} />
        </Field>
        <Field label="ブレースシート (フルサト)">
          <Sel
            value={j.sheet ?? ''}
            onChange={(v) =>
              upd((x) => {
                const s = BRACE_SHEET.find((b) => b.code === v);
                if (!s) return void delete x.sheet;
                x.sheet = s.code;
                x.webT = s.t;
                x.bolt.dia = s.bolt;
                x.plateMaterial = 'SN400B';
                x.shape = 'sheet';
              })
            }
            options={[{ value: '', label: '— tự nhập —' }, ...BRACE_SHEET.map((s) => ({ value: s.code, label: `${s.code}${s.stock ? '' : ' (特注)'} · t${s.t} · ${s.A}×${s.D} · φ${s.d}` }))]}
          />
        </Field>
        <Field label="Hình dạng GPL mặc định">
          <Sel value={j.shape ?? 'fig2'} onChange={(v) => upd((x) => (x.shape = v))} options={[...BRACE_SHAPES.map((b) => ({ value: b.key, label: b.label })), ...(p.plates ?? []).filter((pl) => pl.jointId === j.id || (!pl.jointId && pl.id === j.shape)).map((pl) => ({ value: pl.id, label: `✏ PL tự vẽ (${pl.name})` }))]} />
        </Field>
        <Field label="t GPL" dim="T">
          <Num value={j.webT} min={1} onChange={(v) => upd((x) => (x.webT = v))} />
        </Field>
        <Field label="Bulông">
          <Sel value={String(j.bolt.dia)} onChange={(v) => upd((x) => (x.bolt.dia = +v))} options={[12, 16, 20, 22, 24].map((d) => ({ value: String(d), label: `M${d}` }))} />
        </Field>
        <Field label="Số bulông · pitch" dim="P n">
          <div className="row-gap">
            <Num value={j.webBolts.cols} min={1} onChange={(v) => upd((x) => (x.webBolts.cols = Math.max(1, v)))} />
            <Num value={j.webBolts.pitch} min={30} step={5} onChange={(v) => upd((x) => (x.webBolts.pitch = v))} />
          </div>
        </Field>
      </div>
      <div className="field-label">Kích thước GPL đầu giằng (0 = tự tính)</div>
      <div className="grid3">
        <Field label="Mép e (bulông ngoài → mép)" dim="e">
          <Num value={j.webBolts.edge} min={20} step={5} onChange={(v) => upd((x) => (x.webBolts.edge = v))} />
        </Field>
        <Field label={`L dọc giằng (${BD.L})`} dim="L">
          <Num value={j.brL ?? 0} min={0} step={10} onChange={(v) => upd((x) => (v > 0 ? (x.brL = v) : delete x.brL))} />
        </Field>
        <Field label={`W rộng đầu (${BD.W})`} dim="W">
          <Num value={j.brW ?? 0} min={0} step={5} onChange={(v) => upd((x) => (v > 0 ? (x.brW = v) : delete x.brW))} />
        </Field>
        {shapeKey === 'fig2' && (
          <Field label={`W0 rộng chân 図2 (${BD.W0})`} dim="W0">
            <Num value={j.brW0 ?? 0} min={0} step={10} onChange={(v) => upd((x) => (v > 0 ? (x.brW0 = v) : delete x.brW0))} />
          </Field>
        )}
      </div>
      <div className="field-label">中 クロスプレート (giao điểm giằng chéo)</div>
      <div className="grid3">
        <Field label={`t (${BD.midT})`} dim="mt">
          <Num value={j.midT ?? 0} min={0} onChange={(v) => upd((x) => (v > 0 ? (x.midT = v) : delete x.midT))} />
        </Field>
        <Field label="Bulông mỗi phía" dim="mn">
          <Num value={BD.midN} min={1} onChange={(v) => upd((x) => (x.midN = Math.max(1, v)))} />
        </Field>
        <Field label={`Dài ngang (${BD.midL})`} dim="ml">
          <Num value={j.midL ?? 0} min={0} step={10} onChange={(v) => upd((x) => (v > 0 ? (x.midL = v) : delete x.midL))} />
        </Field>
        <Field label={`Cao đứng (${BD.midW})`} dim="mw">
          <Num value={j.midW ?? 0} min={0} step={10} onChange={(v) => upd((x) => (v > 0 ? (x.midW = v) : delete x.midW))} />
        </Field>
      </div>
      <Fig><BraceShape j={j} shape={shapeKey} secW={secW} p={p} /></Fig>
    </div>
  );
}

function JointCard({ p, set, j, i, used }: { p: Project; set: TabProps['set']; j: Joint; i: number; used: number }) {
  const upd = (fn: (x: Joint) => void) => set((d) => fn(d.joints[i]));
  const kind = j.target;
  const users = jointUsers(p, j.id);
  // tiết diện mẫu để tính bản ghép: tiết diện của 部材名 đầu tiên
  // 継手 cột chưa gán: lấy tiết diện của 本柱 đầu tiên (hình theo kích thước thật của cột)
  const colSec = kind === 'column' ? p.sections.find((s) => s.id === p.master.find((m) => m.kind === 'column' && m.role !== 'post')?.sectionId) : undefined;
  const sec = p.sections.find((s) => s.id === users[0]?.m.sectionId) ?? colSec ?? p.sections.find((s) => s.type === 'I');
  const plates = sec ? jointPlates(sec, j, 0) : [];
  const perLoc = boltsPerLocation(j);
  const warns = boltWarnings(j, BOLT_STD[j.bolt.dia]);
  return (
    <div className="card">
      <div className="card-head">
        <Text width={70} value={j.name} onChange={(v) => upd((x) => (x.name = v))} />
        <Sel value={j.type} onChange={(v: JointType) => upd((x) => { x.type = v; if (v === 'EP') { x.ep = epOf(x); x.gap = 7; } })} options={(Object.keys(JOINT_TYPE_LABEL) as JointType[]).filter((t) => t !== 'EP' || kind === 'column').map((t) => ({ value: t, label: JOINT_TYPE_LABEL[t] }))} />
        <button className="danger icon" onClick={() => set((d) => void d.joints.splice(i, 1))}>
          ✕
        </button>
      </div>
      <div className="row-gap" style={{ margin: '4px 0 8px' }}>
        <span className="small muted">📚 Nạp từ thư viện:</span>
        <select
          value=""
          onChange={(e) => {
            const [f, sec] = e.target.value.split('|') as [LibFamily, string];
            const r = libRows(f).find((x) => x.sec === sec);
            if (r) upd((x) => applyTemplate(x, f, r));
          }}
        >
          <option value="">— chọn mẫu{sec ? ` (${sec.code})` : ''} —</option>
          {LIB_FAMILIES.filter((f) => f.target === kind).map((f) => {
            const rows = libRows(f.id);
            const match = rows.filter((r) => r.sec === sec?.code);
            return (
              <optgroup key={f.id} label={f.name}>
                {(match.length ? match : rows).map((r) => (
                  <option key={r.sec} value={`${f.id}|${r.sec}`}>
                    {r.sec}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>
      <div className="field-label">部材名 áp dụng</div>
      <div className="keys" style={{ marginBottom: 8 }}>
        {users.map((u) => (
          <span key={u.m.id} className="chip on">
            {u.m.name} ({u.pos.map((x) => JOINT_POS_LABEL[x]).join('')})
          </span>
        ))}
      </div>
      <div className="grid3">
        <Field label="Vật liệu bản">
          <Sel
            value={j.matMode === 'custom' ? j.plateMaterial : '@member'}
            onChange={(v) => upd((x) => { if (v === '@member') x.matMode = 'member'; else { x.matMode = 'custom'; x.plateMaterial = v; } })}
            options={[{ value: '@member', label: `Theo 部材 (${[...new Set(users.map((u) => u.m.material))].join(" / ") || "—"})` }, ...matOptions(p, j.plateMaterial)]}
          />
        </Field>
        <Field label="Bulông">
          <Sel value={String(j.bolt.dia)} onChange={(v) => upd((x) => (x.bolt.dia = +v))} options={[16, 20, 22, 24].map((d) => ({ value: String(d), label: `M${d}` }))} />
        </Field>
        <Field label="Cấp bulông">
          <Sel value={j.bolt.grade} onChange={(v) => upd((x) => (x.bolt.grade = v))} options={JIS_BOLT_GRADES.map((g) => ({ value: g, label: g }))} />
        </Field>
        {j.type === 'GPL' && (
          <Field label="t bản mã">
            <Num value={j.webT} min={1} onChange={(v) => upd((x) => (x.webT = v))} />
          </Field>
        )}
        <Field label={kind === 'column' ? 'Vị trí 中: từ chân cột (0 = giữa)' : 'Vị trí 中: từ đầu 左 (0 = giữa)'}>
          <Num value={j.pos} min={0} step={50} onChange={(v) => upd((x) => (x.pos = v))} />
        </Field>
      </div>
      {j.type === 'GPL' && <GplParams p={p} j={j} sec={sec} upd={upd} />}
      {j.type === 'EP' ? (
        <div className="jd-wrap">
          <EpDimEditor j={j} upd={upd} sec={sec} />
          <Fig>{sec ? <EpShape j={j} sec={sec} /> : <EpShape j={j} sec={{ b: 400, h: 400, tw: 12, tf: 12, type: 'Box' }} />}</Fig>
        </div>
      ) : j.type !== 'GPL' && sec ? (
        <div className="jd-wrap">
          <JointDimEditor j={j} sec={sec} upd={upd} />
          <Fig><JointDetail j={j} sec={sec} /></Fig>
          <JointTable j={j} sec={sec} />
        </div>
      ) : (
        <>
          {j.type === 'SPL' && !sec && <BoltGroupEditor g2 title="Bulông cánh (mỗi cánh, mỗi bên)" g={j.flangeBolts} onChange={(g) => upd((x) => (x.flangeBolts = g))} />}
          {!sec && <BoltGroupEditor title={j.type === 'GPL' ? 'Bulông bản mã (phía dầm)' : 'Bulông bụng (mỗi bên)'} g={j.webBolts} onChange={(g) => upd((x) => (x.webBolts = g))} />}
          {j.type === 'GPL' && sec && <GplDimEditor j={j} sec={sec} upd={upd} />}
          <Fig>{sec ? <JointLiveShape j={j} sec={sec} /> : <BoltSketch j={j} />}</Fig>
        </>
      )}
      {warns.map((w) => (
        <div key={w} className="alert error">
          ⚠ {w}
        </div>
      ))}
      {j.bolt.grade !== p.params.member.boltGrade && <div className="alert error">⚠ Cấp bulông khác パラメーター ({p.params.member.boltGrade}).</div>}
      <table className="table kv small">
        <tbody>
          <tr>
            <td>Bản ghép / vị trí</td>
            <td className="num">
              {plates.length} bản · {fmtKg(plates.reduce((a, pl) => a + plateKg(pl), 0))} kg {sec ? `(theo ${sec.code})` : ''}
            </td>
          </tr>
          <tr>
            <td>Bulông / vị trí</td>
            <td className="num">{perLoc}</td>
          </tr>
          {sec &&
            boltGrips(sec, j).map((g) => {
              const L = boltLength(j.bolt.dia, g.grip, j.bolt.grade);
              return (
                <tr key={g.label}>
                  <td>首下長さ {g.label}</td>
                  <td className="num">
                    締付 {g.grip} + {L.add} = {L.calc} → <b>M{j.bolt.dia}×{L.L}</b> · 余長 {L.yochou} mm ≈ {L.threads} 山
                    {!L.ok && ' · ⚠ ngoài dải トルシア có sẵn'}
                    {!L.threadOk && ' · ⚠ 余長 phải 1–6 山'}
                  </td>
                </tr>
              );
            })}
          <tr>
            <td>Số vị trí trong công trình</td>
            <td className="num">{used}</td>
          </tr>
          <tr>
            <td>Tổng bulông</td>
            <td className="num">
              {perLoc * used} × {j.bolt.grade} M{j.bolt.dia}
            </td>
          </tr>
        </tbody>
      </table>
      <Field label="Ghi chú">
        <Text value={j.note} onChange={(v) => upd((x) => (x.note = v))} />
      </Field>
    </div>
  );
}

function BaseCard({ p, set, b, i }: { p: Project; set: TabProps['set']; b: BasePlate; i: number }) {
  const upd = (fn: (x: BasePlate) => void) => set((d) => fn(d.bases[i]));
  const cols = p.master.filter((m) => m.kind === 'column');
  const owner = new Map<string, string>();
  for (const o of p.bases) if (o.id !== b.id) for (const id of o.memberIds) owner.set(id, o.name);
  const colSec = p.sections.find((s) => s.id === p.master.find((m) => b.memberIds.includes(m.id))?.sectionId);
  const colSize = colSec?.type === 'Box' && colSec.h === colSec.b ? colSec.h : 0;
  const fbRows = FREE_BASE.filter((r) => !colSize || r.col === colSize);
  const BL = baseLayout(b);
  /** sửa thông số bulông neo, giữ anchor.n = số bulông thực theo bố trí */
  const updA = (fn: (a: BasePlate['anchor']) => void) =>
    upd((x) => {
      const L0 = baseLayout(x);
      x.anchor.nx = x.anchor.nx ?? L0.nx;
      x.anchor.ny = x.anchor.ny ?? L0.ny;
      fn(x.anchor);
      x.anchor.n = baseLayout(x).pts.length;
    });
  return (
    <div className="card">
      <div className="card-head">
        <Text width={70} value={b.name} onChange={(v) => upd((x) => (x.name = v))} />
        <Sel
          value={b.kind}
          onChange={(v) => upd((x) => (x.kind = v))}
          options={[
            { value: '露出', label: '露出柱脚 (lộ)' },
            { value: '根巻', label: '根巻柱脚 (bọc chân)' },
            { value: '埋込', label: '埋込柱脚 (chôn)' },
          ]}
        />
        <button className="danger icon" onClick={() => set((d) => void d.bases.splice(i, 1))}>
          ✕
        </button>
      </div>
      <div className="field-label">部材名 cột áp dụng</div>
      <div className="keys" style={{ marginBottom: 8 }}>
        {cols.map((c) => {
          const on = b.memberIds.includes(c.id);
          const other = !on && owner.get(c.id);
          return (
            <label key={c.id} className={'chip' + (on ? ' on' : '')} style={other ? { opacity: 0.55 } : undefined}>
              <input type="checkbox" checked={on} onChange={(e) => set((d) => (e.target.checked ? assignBase(d, b.id, c.id) : void (d.bases[i].memberIds = d.bases[i].memberIds.filter((y) => y !== c.id))))} />
              {c.name}
              {other && <span className="small"> ({other})</span>}
            </label>
          );
        })}
      </div>
      <div className="grid3">
        <Field label="Bản đế t" dim="t">
          <Num value={b.t} min={1} onChange={(v) => upd((x) => (x.t = v))} />
        </Field>
        <Field label="B (theo X)" dim="B">
          <Num value={b.b} min={1} step={10} onChange={(v) => upd((x) => (x.b = v))} />
        </Field>
        <Field label="D (theo Y)" dim="D">
          <Num value={b.d} min={1} step={10} onChange={(v) => upd((x) => (x.d = v))} />
        </Field>
        <Field label="Vật liệu bản đế">
          <Sel value={b.material} onChange={(v) => upd((x) => (x.material = v))} options={matOptions(p, b.material)} />
        </Field>
        <Field label="Vữa (mm)" dim="gr">
          <Num value={b.grout} min={0} step={5} onChange={(v) => upd((x) => (x.grout = v))} />
        </Field>
        <Field label="隅切り C (cắt góc)" dim="C">
          <Num value={b.chamfer ?? 0} min={0} step={5} onChange={(v) => upd((x) => (v > 0 ? (x.chamfer = v) : delete x.chamfer))} />
        </Field>
      </div>
      <Fig><BaseShape b={b} col={colSec ? { type: colSec.type, h: colSec.h, b: colSec.b, tw: colSec.tw, tf: colSec.tf } : undefined} /></Fig>
      <div className="kbox">
        <span className="small">📦 フルサト フリーベース{colSize ? ` (□${colSize})` : ''}: </span>
        <select
          value=""
          onChange={(e) => {
            const r = fbRows.find((x) => `${x.col}|${freeBaseCode(x)}` === e.target.value);
            if (r)
              upd((x) => {
                x.anchor.dia = r.d;
                x.anchor.n = r.n;
                x.anchor.ny = Math.floor(r.n / 4) + 1;
                x.anchor.nx = r.n / 2 - x.anchor.ny + 2;
                x.anchor.material = 'ABR490';
                x.anchor.length = anchorRow('ABR490', r.d)?.Lt ?? x.anchor.length;
                x.material = 'SN490B';
                x.note = `フリーベース ${freeBaseCode(r)} (□${r.col}, K=${r.k.toLocaleString()} kN·m/rad)`;
              });
          }}
        >
          <option value="">{fbRows.length ? '— chọn quy cách —' : 'chỉ cho cột □150–□350'}</option>
          {fbRows.map((r) => (
            <option key={`${r.col}|${freeBaseCode(r)}`} value={`${r.col}|${freeBaseCode(r)}`}>
              {colSize ? '' : `□${r.col} · `}
              {freeBaseCode(r)} · K {r.k.toLocaleString()} kN·m/rad
            </option>
          ))}
        </select>
      </div>
      <div className="field-label">アンカーボルト</div>
      <div className="grid3">
        <Field label="Đường kính M" dim="dia">
          <Sel value={String(b.anchor.dia)} onChange={(v) => upd((x) => (x.anchor.dia = +v))} options={(ANCHOR_DIAS.includes(b.anchor.dia) ? ANCHOR_DIAS : [b.anchor.dia, ...ANCHOR_DIAS]).map((d) => ({ value: String(d), label: `M${d}` }))} />
        </Field>
        <Field label={`Số bulông/cạnh X · Y (tổng ${BL.pts.length})`} dim="nx ny">
          <div className="row-gap">
            <Num value={BL.nx} min={1} onChange={(v) => updA((a) => (a.nx = Math.max(1, v)))} />
            <Num value={BL.ny} min={2} onChange={(v) => updA((a) => (a.ny = Math.max(2, v)))} />
          </div>
        </Field>
        <Field label="Mép ex · ey (tâm bulông → mép)" dim="ex ey">
          <div className="row-gap">
            <Num value={BL.ex} min={20} step={5} onChange={(v) => updA((a) => (a.ex = v))} />
            <Num value={BL.ey} min={20} step={5} onChange={(v) => updA((a) => (a.ey = v))} />
          </div>
        </Field>
        <Field label="Chiều dài L (tổng)" dim="L">
          <Num value={b.anchor.length} min={100} step={50} onChange={(v) => upd((x) => (x.anchor.length = v))} />
        </Field>
        <Field label="Hình dạng">
          <Sel
            value={BL.shape}
            onChange={(v) => updA((a) => {
              a.shape = v as 'I' | 'L' | 'J' | 'P';
              delete a.hook;
            })}
            options={[
              { value: 'I', label: 'I · thẳng' },
              { value: 'L', label: 'L · móc vuông' },
              { value: 'J', label: 'J · móc chữ J' },
              { value: 'P', label: 'P · ナット + アンカープレート' },
            ]}
          />
        </Field>
        {BL.shape !== 'I' && (
          <Field label={BL.shape === 'P' ? 'Cạnh アンカープレート' : 'Chiều dài móc'} dim="hook">
            <Num value={BL.hook} min={20} step={10} onChange={(v) => updA((a) => (a.hook = v))} />
          </Field>
        )}
        <Field label="突出 (nhô trên bản đế)" dim="proj">
          <Num value={BL.proj} min={10} step={5} onChange={(v) => updA((a) => (a.proj = v))} />
        </Field>
        <Field label="Vật liệu">
          <Sel value={b.anchor.material} onChange={(v) => upd((x) => (x.anchor.material = v))} options={(JIS_ANCHOR_GRADES.includes(b.anchor.material) ? JIS_ANCHOR_GRADES : [b.anchor.material, ...JIS_ANCHOR_GRADES]).map((m) => ({ value: m, label: m }))} />
        </Field>
      </div>
    </div>
  );
}

/** Cửa sổ sửa 継手 / ベース riêng: sửa trên bản nháp, Enter = ô kế tiếp (ô cuối = lưu), Ctrl+Enter / ✓ Lưu = lưu, Esc = bỏ, ↑↓ = mối nối khác */
function EditorWin({ p, set, kind, id, list, onNav, onClose, focusIdx, usedCount }: {
  p: Project;
  set: TabProps['set'];
  kind: 'joint' | 'base';
  id: string;
  list: { id: string; name: string }[];
  onNav: (d: number) => void;
  onClose: () => void;
  focusIdx: React.MutableRefObject<number>;
  usedCount: (j: Joint) => number;
}) {
  const [draft, setDraft] = useState<Project>(() => structuredClone(p));
  const [msg, setMsg] = useState('');
  const [fmtTick, setFmtTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [figEl, setFigEl] = useState<HTMLDivElement | null>(null);
  const pick = (q: Project) => JSON.stringify([q.joints, q.bases, q.plates ?? [], q.master]);
  const dirty = pick(draft) !== pick(p);
  const dset: TabProps['set'] = (fn) =>
    setDraft((o) => {
      const n = structuredClone(o);
      fn(n);
      return n;
    });
  const save = () => {
    if (!dirty) return setMsg('Không có thay đổi.');
    const dj = structuredClone(draft);
    set((d) => {
      d.joints = dj.joints;
      d.bases = dj.bases;
      d.plates = dj.plates;
      d.master = dj.master;
    });
    setMsg('✓ Đã lưu.');
  };
  const discard = () => {
    setDraft(structuredClone(p));
    setMsg('Đã bỏ thay đổi.');
  };
  const fields = () => [...(bodyRef.current?.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=hidden]), select') ?? [])].filter((e) => !(e as HTMLInputElement).disabled && e.offsetParent !== null);
  // mở mối nối mới: đặt con trỏ vào đúng ô đang sửa ở mối nối trước
  useEffect(() => {
    const f = fields();
    const k = focusIdx.current;
    if (k >= 0 && f[k]) (f[k] as HTMLInputElement).focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const nav = (d: number) => {
    if (dirty) return setMsg('Chưa lưu thay đổi: Enter / ✓ Lưu để lưu, Esc để bỏ, rồi mới chuyển mối nối.');
    focusIdx.current = fields().indexOf(document.activeElement as HTMLElement);
    onNav(d);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const tag = t.tagName;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      return save();
    }
    if (e.key === 'Enter' && (tag === 'INPUT' || tag === 'SELECT')) {
      e.preventDefault();
      // gõ xong 1 ô → sang ô kế tiếp; ô cuối → lưu
      (t as HTMLInputElement).blur?.();
      const f = fields();
      const k = f.indexOf(t);
      if (k >= 0 && k + 1 < f.length) {
        f[k + 1].focus();
        (f[k + 1] as HTMLInputElement).select?.();
      } else save();
      return;
    }
    if (e.key === 'Enter' && tag !== 'BUTTON' && tag !== 'TEXTAREA') {
      e.preventDefault();
      return save();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      return dirty ? discard() : onClose();
    }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && tag !== 'SELECT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      nav(e.key === 'ArrowUp' ? -1 : 1);
    }
  };
  const idx = list.findIndex((x) => x.id === id);
  const ji = draft.joints.findIndex((x) => x.id === id);
  const bi = draft.bases.findIndex((x) => x.id === id);
  const j = draft.joints[ji], b = draft.bases[bi];
  const W0 = Math.min(980, window.innerWidth - 20);
  const def = { x: Math.max(10, window.innerWidth - W0 - 20), y: 70, w: W0, h: Math.min(860, window.innerHeight - 90) };
  return (
    <FloatWin
      id="joint-ed2"
      flush
      def={def}
      onClose={onClose}
      title={
        <>
          ✎ {kind === 'base' ? 'ベース' : '継手'} {j?.name ?? b?.name ?? ''} {dirty && <span title="Có thay đổi chưa lưu">●</span>}{' '}
          <span className="small" style={{ opacity: 0.7 }}>
            {idx + 1}/{list.length}
          </span>
        </>
      }
      extra={
        <>
          <button title="Mối nối trước (↑)" onClick={() => nav(-1)}>▲</button>
          <button title="Mối nối sau (↓)" onClick={() => nav(1)}>▼</button>
        </>
      }
    >
      <div ref={bodyRef} className="jed" onKeyDown={onKey} tabIndex={-1}>
        <div className="jed-row">
        <div className="jed-main">
        <FigCtx.Provider value={figEl}>
        {kind === 'base' ? (
          b ? <BaseCard p={draft} set={dset} b={b} i={bi} /> : <p className="muted">Đã xoá.</p>
        ) : j ? (
          j.target === 'brace' ? <BraceJointCard p={draft} set={dset} j={j} i={ji} /> : <JointCard p={draft} set={dset} j={j} i={ji} used={usedCount(j)} />
        ) : (
          <p className="muted">Đã xoá.</p>
        )}
        </FigCtx.Provider>
        </div>
        <div className="jed-fig" ref={setFigEl} />
        </div>
        <div className="jed-foot">
          <button className="primary" disabled={!dirty} onClick={save} title="Lưu thay đổi (Enter ở ô cuối, hoặc Ctrl+Enter)">
            ✓ Lưu (Enter)
          </button>
          <button disabled={!dirty} onClick={discard} title="Bỏ các thay đổi chưa lưu (Esc)">
            ↺ Bỏ (Esc)
          </button>
          {j && (() => {
            // định dạng đã lưu theo kích thước cây (tối đa 3 lần gần nhất)
            const codes = jointCodes(draft, j.id);
            const fm = codes.length ? formatsOf(j.target, j.type, codes[0]) : [];
            return (
              <span className="jfmt">
                <button
                  disabled={!codes.length}
                  title={codes.length ? `Lưu định dạng hiện tại cho ${codes.join(', ')} (giữ ${MAX_FMT} lần gần nhất)` : '継手 chưa gán cho 部材名 nào – chưa biết kích thước cây'}
                  onClick={() => { const c = saveFormat(draft, j); setMsg(`💾 Đã lưu định dạng cho ${c.join(', ')}. Lần sau tạo ${j.name.replace(/\d+$/, '')}… cùng kích thước sẽ lấy theo lần này.`); setFmtTick((x) => x + 1); }}
                >
                  💾 Lưu định dạng{codes.length ? ` (${codes[0]}${codes.length > 1 ? ` +${codes.length - 1}` : ''})` : ''}
                </button>
                {fm.length > 0 && (
                  <select
                    value=""
                    title="Chọn 1 trong các lần lưu gần nhất để áp vào 継手 này"
                    onChange={(e) => {
                      const f = fm[+e.target.value];
                      if (!f) return;
                      dset((d) => { const x = d.joints.find((q) => q.id === j.id); if (x) applyFormat(x, f.j); });
                      setMsg(`Đã áp định dạng lần ${+e.target.value + 1}. Bấm ✓ Lưu để giữ.`);
                    }}
                  >
                    <option value="">Định dạng đã lưu ({fm.length}) ▾</option>
                    {fm.map((f, i) => (
                      <option key={f.at} value={i}>
                        {i === 0 ? '★ ' : ''}Lần {i + 1}{i === 0 ? ' (gần nhất)' : ''} · {new Date(f.at).toLocaleString()} · {fmtSummary(f.j)}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            );
          })()}
          <span className="small muted" data-fmt={fmtTick}>{msg}</span>
        </div>
      </div>
    </FloatWin>
  );
}

/** 大梁 · 小梁: gán 継手 左 / 中 / 右 ngay trong tab 継手, và gộp 継手 của các 部材名 cùng kích thước + cùng vật liệu */
function BeamJointAssign({ p, set }: { p: Project; set: TabProps['set'] }) {
  const beams = p.master.filter((m) => m.kind === 'beam' && m.role !== 'knee');
  const names = p.joints.filter((j) => j.target === 'beam').map((j) => j.name);
  const POS: JointPos[] = ['left', 'mid', 'right'];
  const [err, setErr] = useState('');
  const [pv, setPv] = useState<PreviewReq | null>(null);
  const secCode = (id: string) => p.sections.find((s) => s.id === id)?.code ?? '?';
  const jn = (id?: string) => (id ? p.joints.find((j) => j.id === id)?.name ?? '' : '');
  const roleOf = (m: (typeof beams)[number]) => (m.role === 'sub' ? '小梁' : '大梁');
  // nhóm cùng kích thước (mã tiết diện) + cùng vật liệu (大梁 và 小梁 tách riêng vì quy tắc tên khác nhau)
  const groups = new Map<string, typeof beams>();
  for (const m of beams) {
    const k = `${secCode(m.sectionId)}|${m.material}|${roleOf(m)}`;
    groups.set(k, [...(groups.get(k) ?? []), m]);
  }
  /**
   * 1 nút: 大梁 → bỏ 左右, mỗi nhóm cùng kích thước + vật liệu dùng chung 1 継手 中 (giữ cái đã có, chưa có thì tạo SPL);
   * 小梁 → bỏ 中, 左 = 右, mỗi nhóm dùng chung 1 継手 GPL. Sau đó đặt lại tên toàn bộ theo quy tắc.
   */
  const autoAll = () =>
    set((d) => {
      const bms = d.master.filter((m) => m.kind === 'beam' && m.role !== 'knee');
      const isBeamJ = (id?: string) => !!id && d.joints.some((j) => j.id === id && j.target === 'beam');
      const before = new Set(bms.flatMap((m) => Object.values(m.joints ?? {})));
      const used = new Set(d.joints.map((j) => j.name));
      const fresh = (type: JointType, pre: string) => {
        const j = newJoint(1, 'beam', d.params);
        j.name = nextJointName(d, pre, used);
        j.type = type;
        used.add(j.name);
        d.joints.push(j);
        return j.id;
      };
      const sc = (id: string) => d.sections.find((s) => s.id === id)?.code ?? '?';
      const gs = new Map<string, typeof bms>();
      for (const m of bms) {
        const k = `${sc(m.sectionId)}|${m.material}|${m.role === 'sub' ? 'sub' : 'main'}`;
        gs.set(k, [...(gs.get(k) ?? []), m]);
      }
      const claimed = new Set<string>();
      for (const ms of gs.values()) {
        const sub = ms[0].role === 'sub';
        const want: JointPos[] = sub ? ['left', 'right'] : ['mid'];
        const drop: JointPos[] = sub ? ['mid'] : ['left', 'right'];
        const cand = ms.flatMap((m) => want.map((pos) => m.joints?.[pos])).find((id) => isBeamJ(id) && !claimed.has(id!));
        const id = cand ?? fresh(sub ? 'GPL' : 'SPL', beamJointPrefix(ms[0].role, want[0]));
        claimed.add(id);
        for (const m of ms) {
          for (const pos of drop) assignJoint(d, null, m.id, pos);
          for (const pos of want) assignJoint(d, id, m.id, pos);
          delete m.lrFree;
        }
      }
      const after = new Set(d.master.flatMap((m) => Object.values(m.joints ?? {})));
      d.joints = d.joints.filter((j) => !before.has(j.id) || after.has(j.id));
      // đặt tên theo quy tắc (qua tên tạm để không trùng giữa chừng)
      const rn = beamJointRenames(d);
      for (const [id] of rn) { const j = d.joints.find((x) => x.id === id); if (j) j.name = `__${id}`; }
      for (const [id, nm] of rn) { const j = d.joints.find((x) => x.id === id); if (j) j.name = nm; }
    });
  const renames = beamJointRenames(p);
  const show = (m: (typeof beams)[number], pos: JointPos, name: string) =>
    name.trim() && setPv({ name, target: 'beam', secCode: secCode(m.sectionId), where: `${m.name} ${roleOf(m)} ${JOINT_POS_LABEL[pos]}` });
  return (
    <Section title="Gán 継手 cho 大梁 · 小梁">
      <div className="bja-tools small">
        <span className="muted">Quy tắc tên: 大梁 左右 GBJ · 中 GJ — 小梁 左右 BJ · 中 BGJ</span>
        <button
          disabled={!renames.length}
          title={renames.map(([id, nm]) => `${jn(id)} → ${nm}`).join('\n')}
          onClick={() =>
            set((d) => {
              for (const [id, nm] of beamJointRenames(d)) {
                const j = d.joints.find((x) => x.id === id);
                if (j) j.name = nm;
              }
            })
          }
        >
          🏷 Đặt lại tên theo quy tắc{renames.length ? ` (${renames.length})` : ''}
        </button>
      </div>
      <div className="table-wrap">
        <table className="table bja">
          <thead>
            <tr>
              <th>部材名</th>
              <th>Kích thước</th>
              <th>Vật liệu</th>
              {POS.map((pos) => (
                <th key={pos}>{JOINT_POS_LABEL[pos]}</th>
              ))}
              <th title="Bật: chọn 左 thì 右 tự theo và ngược lại">左=右</th>
            </tr>
          </thead>
          <tbody>
            {beams.map((m) => (
              <tr key={m.id}>
                <td className="nowrap">
                  <b>{m.name}</b> <span className="small muted">{m.role === 'sub' ? '小梁' : '大梁'}</span>
                </td>
                <td className="small nowrap">{secCode(m.sectionId)}</td>
                <td className="small">{m.material}</td>
                {POS.map((pos) => (
                  <td key={pos}>
                    <span className="jcell" onFocus={() => pv && m.joints?.[pos] && show(m, pos, jn(m.joints[pos]))}>
                      <NameCombo
                        width={58}
                        value={jn(m.joints?.[pos])}
                        options={[nextJointName(p, beamJointPrefix(m.role, pos)), ...names]}
                        placeholder="—"
                        onCommit={(v) => {
                          const ex = p.joints.find((j) => j.name === v.trim());
                          if (ex && ex.target !== 'beam') return setErr(`継手 ${ex.name} đang dùng cho ${ex.target === 'column' ? 'cột' : 'ブレース'}.`);
                          setErr('');
                          // 左 / 右 mặc định giống nhau: bên kia trống hoặc đang giống bên này thì đổi theo
                          const other: JointPos | undefined = pos === 'left' ? 'right' : pos === 'right' ? 'left' : undefined;
                          const follow = other && !lrFreeOf(m);
                          set((d) => {
                            assignJointByName(d, v, m.id, pos);
                            if (follow) assignJointByName(d, v, m.id, other!);
                          });
                          show(m, pos, v);
                        }}
                      />
                      {m.joints?.[pos] && (
                        <button className="icon jpv-btn" title="Xem hình minh họa 継手" onClick={() => show(m, pos, jn(m.joints![pos]))}>
                          👁
                        </button>
                      )}
                    </span>
                  </td>
                ))}
                <td className="center">
                  <input
                    type="checkbox"
                    title="左 = 右: chọn 1 bên thì bên kia tự theo"
                    checked={!lrFreeOf(m)}
                    onChange={(e) => {
                      const same = e.target.checked;
                      set((d) => {
                        const x = d.master.find((q) => q.id === m.id);
                        if (!x) return;
                        x.lrFree = !same;
                        if (same) assignJoint(d, x.joints?.left ?? x.joints?.right ?? null, x.id, x.joints?.left ? 'right' : 'left');
                      });
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {err && <div className="alert error small">{err}</div>}
      <div className="bja-merge">
        <button className="primary" onClick={autoAll}>
          ⚙ Tạo / gộp 継手 tự động
        </button>
        <div className="small muted" style={{ marginTop: 4 }}>
          大梁: để trống 左 · 右, cùng kích thước + vật liệu dùng chung 1 継手 中 (GJ). 小梁: 左 = 右 dùng chung 1 継手 (BJ), không có 中. 継手 đã có được giữ lại, thiếu thì tạo mới, rồi đặt lại tên theo quy tắc. (↶ để hoàn tác)
        </div>
      </div>
      {pv && <JointPreviewWin p={p} req={pv} onClose={() => setPv(null)} />}
    </Section>
  );
}

export default function JointTab({ p, set, members }: TabProps) {
  const [view, setView] = useState<'beam' | 'column' | 'brace' | 'base' | 'link' | 'lib'>('beam');
  const [open, setOpen] = useState<string | null>(null);
  const focusIdx = useRef(-1);
  const usedCount = (j: Joint) => members.reduce((a, m) => a + (m.joints ?? []).filter((x) => x.name === j.name).length, 0);
  const list = view === 'base' ? p.bases.map((b) => ({ id: b.id, name: b.name })) : p.joints.filter((j) => j.target === view).map((j) => ({ id: j.id, name: j.name }));
  const nav = (d: number) => {
    if (!list.length) return;
    const k = list.findIndex((x) => x.id === open);
    const n = list[Math.max(0, Math.min(list.length - 1, (k < 0 ? 0 : k + d)))];
    setOpen(n.id);
    document.querySelector(`[data-jrow="${n.id}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  // ↑↓ trên bảng danh sách (khi con trỏ không ở ô nhập)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (view === 'lib' || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const t = e.target as HTMLElement;
      if (t.closest('.jed') || ['INPUT', 'SELECT', 'TEXTAREA'].includes(t.tagName)) return;
      if (!t.closest('.jlist') && t !== document.body) return;
      e.preventDefault();
      focusIdx.current = -1;
      nav(e.key === 'ArrowUp' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const kind = view === 'base' ? 'base' : 'joint';
  return (
    <>
      <Section title="継手 – mối nối & ベース">
        <div className="seg">
          {(
            [
              ['beam', '継手 dầm'],
              ['column', '継手 cột'],
              ['brace', '継手 ブレース'],
              ['base', 'ベース (chân cột)'],
              ['link', '接続 · 合掌PL'],
              ['lib', '📚 Thư viện mẫu'],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>
              {l}
            </button>
          ))}
        </div>
        {view === 'link' ? (
          <LinkPanel p={p} set={set} members={members} />
        ) : view === 'lib' ? (
          <JointLibrary p={p} set={set} />
        ) : view === 'base' ? (
          <button className="primary" onClick={() => { const b = newBase(p.bases.length + 1); set((d) => void d.bases.push(b)); setOpen(b.id); }}>
            + Thêm ベース
          </button>
        ) : (
          <button className="primary" onClick={() => { const j = newJoint(p.joints.filter((x) => x.target === view).length + 1, view, p.params); if (view === 'column') { j.type = 'EP'; j.ep = epOf(j); j.gap = 7; } set((d) => void d.joints.push(j)); setOpen(j.id); }}>
            + Thêm 継手 {view === 'beam' ? 'dầm' : view === 'column' ? 'cột' : 'ブレース'}
          </button>
        )}
      </Section>
      {(view === 'beam' || view === 'column' || view === 'brace') && <JointMemPanel />}
      {view === 'beam' && <BeamJointAssign p={p} set={set} />}
      {view !== 'lib' && view !== 'link' && <Section title={view === 'base' ? `ベース (${p.bases.length})` : `継手 ${view === 'beam' ? 'dầm' : view === 'column' ? 'cột' : 'ブレース'} (${p.joints.filter((j) => j.target === view).length})`}>
        <table className="table jlist">
          <thead>
            {view === 'base' ? (
              <tr>
                <th>Tên</th>
                <th>Bản đế</th>
                <th>Bulông neo</th>
                <th>部材名</th>
                <th />
              </tr>
            ) : (
              <tr>
                <th>Tên</th>
                <th>Kiểu</th>
                <th>Bulông</th>
                <th>部材名 (vị trí)</th>
                <th className="num">Số chỗ</th>
                <th />
              </tr>
            )}
          </thead>
          <tbody>
            {view === 'base'
              ? p.bases.map((b, i) => {
                  const on = open === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr className={'jrow' + (on ? ' sel' : '')} data-jrow={b.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) { focusIdx.current = -1; setOpen(b.id); } }}>
                        <td>
                          <b>{b.name}</b>
                        </td>
                        <td className="small">
                          {b.kind} {b.t}×{b.b}×{b.d} {b.material}
                        </td>
                        <td className="small">
                          {b.anchor.n}×M{b.anchor.dia} {b.anchor.material}
                        </td>
                        <td className="small">{b.memberIds.map((id) => p.master.find((m) => m.id === id)?.name).filter(Boolean).join(', ') || '–'}</td>
                        <td className="nowrap">
                          <button className={'icon' + (on ? ' on' : '')} title={on ? 'Thu gọn' : 'Hiển thị / sửa chi tiết'} onClick={() => setOpen(on ? null : b.id)}>
                            ✎
                          </button>
                          <button className="danger icon" title="Xoá" onClick={() => set((d) => void d.bases.splice(i, 1))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              : p.joints.map((j, i) => {
                  if (j.target !== view) return null;
                  const on = open === j.id;
                  const users = jointUsers(p, j.id);
                  return (
                    <Fragment key={j.id}>
                      <tr className={'jrow' + (on ? ' sel' : '')} data-jrow={j.id} onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) { focusIdx.current = -1; setOpen(j.id); } }}>
                        <td>
                          <b>{j.name}</b>
                        </td>
                        <td className="small">{jointTypeName(j.type)}</td>
                        <td className="small">
                          {boltsPerLocation(j)}×{j.bolt.grade} M{j.bolt.dia}
                        </td>
                        <td className="small">{users.map((u) => `${u.m.name}(${u.pos.map((x) => JOINT_POS_LABEL[x]).join('')})`).join(', ') || '–'}</td>
                        <td className="num">{usedCount(j)}</td>
                        <td className="nowrap">
                          <button className={'icon' + (on ? ' on' : '')} title={on ? 'Thu gọn' : 'Hiển thị / sửa chi tiết'} onClick={() => setOpen(on ? null : j.id)}>
                            ✎
                          </button>
                          <button className="danger icon" title="Xoá" onClick={() => set((d) => void d.joints.splice(i, 1))}>
                            ✕
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
          </tbody>
        </table>
      </Section>}
      {view !== 'lib' && view !== 'link' && open && list.some((x) => x.id === open) && (
        <EditorWin key={open} p={p} set={set} kind={kind} id={open} list={list} onNav={nav} onClose={() => setOpen(null)} focusIdx={focusIdx} usedCount={usedCount} />
      )}
    </>
  );
}
