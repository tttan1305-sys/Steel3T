// Tab 母屋: 母屋マスター (部材・ピース・部品) → 母屋配置面 (勾配変換) → 母屋 入力 (間隔) → 支持ピース
import { useEffect, useState } from 'react';
import { Field, Num, Section, Sel, TabProps, Text } from '../ui';
import { KINDS, KindIcon, SlopePreview } from './SlopeTab';
import { faceAxis, newSlopeFace, setFaceDir } from '../slopeFace';
import { SLOPE_KIND_LABEL } from '../model';
import type { SlopeFace } from '../model';
import { PartPic, PiecePic, SectionPic } from '../secPics';
import { MasterEditor, MasterTab, Rec } from './MasterEditor';
import PiecePanel, { PC_SUBS } from './PiecePanel';
import type { PcDraft } from '../pieceSet';
import { uid } from '../model';
import { girtOf } from '../girt';
import {
  MEMBER_FIELDS, MOYA_BASES, MOYA_DIRS, MOYA_FITS, MOYA_SIDES, MoyaPlace, PART_FIELDS, PIECE_FIELDS,
  defaultMoya, ensureMoya, moyaTemplates, moyaGeo, moyaOf, moyaOffsets, moyaPreview, planeFace,
} from '../moya';
import type { MoyaBatch, MoyaPlane } from '../moya';

export interface MoyaRef { key: string; label: string; a: [number, number]; b: [number, number] }
export interface MoyaDraft extends MoyaPlace, MoyaBatch {
  plane: string;
  ref: string;
}
export const initialMoyaDraft = (): MoyaDraft => ({ plane: '', ref: '', member: 'M1', dir: '1-(水上)パラメーター参照', base: '2-部材芯', side: '2-上側', fit: '2-上合わせ', count: 1, baseGap: 0, gap: 800, sign: 1, mode: 'gap', ds: '1500 3000', cum: false, ref2: '', n: 4, place: 'inner' });

export interface MoyaTabProps extends TabProps {
  draft: MoyaDraft;
  setDraft: (d: MoyaDraft) => void;
  refs: MoyaRef[];
  view3d: boolean;
  setView3d: (on: boolean) => void;
  sel: string | null;
  setSel: (id: string | null) => void;
  pcDraft: PcDraft;
  setPcDraft: (d: PcDraft) => void;
  pcSel: string | null;
  setPcSel: (id: string | null) => void;
}

const MOYA_TABS: MasterTab[] = [
  { k: 'members', label: '部材', fields: MEMBER_FIELDS, name: '部材名', prefix: 'M', pic: (r) => <SectionPic v={r.v} /> },
  { win: true, k: 'pieces', label: 'ピース', fields: PIECE_FIELDS, name: 'ピース名', prefix: 'P', pic: (r) => <PiecePic v={r.v} /> },
  { k: 'parts', label: '部品', fields: PART_FIELDS, name: '部品名', prefix: 'F', pic: (r) => <PartPic v={r.v} /> },
];

function MasterPanel({ p, set }: TabProps) {
  const md = moyaOf(p);
  const def = defaultMoya();
  return (
    <MasterEditor
      data={{ members: md.members, pieces: md.pieces, parts: md.parts }}
      tabs={MOYA_TABS}
      defaults={{ members: def.members, ...moyaTemplates() }}
      imports={[{ label: 'tab 胴縁', data: { pieces: girtOf(p).pieces, parts: girtOf(p).parts } }]}
      edit={(fn) => set((d) => { const m = ensureMoya(d); const o: Record<string, Rec[]> = { members: m.members, pieces: m.pieces, parts: m.parts }; fn(o); m.members = o.members; m.pieces = o.pieces; m.parts = o.parts; })}
    />
  );
}

/** Nhập 勾配 riêng cho 母屋配置面 (giống tab 勾配, chỉ ảnh hưởng 母屋) */
function MoyaSlopeEditor({ p, f, upd }: { p: TabProps['p']; f: SlopeFace; upd: (fn: (x: SlopeFace) => void) => void }) {
  const [mid, setMid] = useState(true);
  const ax = faceAxis(p, f);
  const perp = ax === 'y' ? p.gridsY : ax === 'x' ? p.gridsX : [];
  const c0 = f.pts[0], c2 = f.pts.length === 4 ? f.pts[2] : f.pts[1];
  const v = [c0?.[0] ?? '', c0?.[1] ?? '', c2?.[0] ?? '', c2?.[1] ?? ''];
  const setC = (k: number, id: string) =>
    upd((x) => {
      const n = [...v];
      n[k] = id;
      const [xa, ya, xb, yb] = n;
      if (xa && ya && xb && yb && xa !== xb && ya !== yb) {
        x.pts = [[xa, ya], [xb, ya], [xb, yb], [xa, yb]];
        setFaceDir(p, x, faceAxis(p, x) ?? 'y');
      } else x.pts = [[xa || p.gridsX[0]?.id, ya || p.gridsY[0]?.id], [xb || p.gridsX[p.gridsX.length - 1]?.id, yb || p.gridsY[p.gridsY.length - 1]?.id]] as [string, string][];
    });
  const ox = [{ value: '', label: 'X' }, ...p.gridsX.map((g) => ({ value: g.id, label: g.name }))];
  const oy = [{ value: '', label: 'Y' }, ...p.gridsY.map((g) => ({ value: g.id, label: g.name }))];
  const gname = (id: string) => [...p.gridsX, ...p.gridsY].find((x) => x.id === id)?.name ?? '?';
  return (
    <>
      <div className="grid2">
        <Field label="階高名">
          <Sel value={f.level} onChange={(id) => upd((x) => void (x.level = id))} options={[...p.levels].sort((a, b) => a.elevation - b.elevation).map((l) => ({ value: l.id, label: `${l.name} (${l.elevation})` }))} />
        </Field>
        <Field label="Phương dốc">
          <div className="seg" style={{ margin: 0 }}>
            <button className={ax === 'y' ? 'on' : ''} onClick={() => upd((x) => setFaceDir(p, x, 'y'))}>Theo Y</button>
            <button className={ax === 'x' ? 'on' : ''} onClick={() => upd((x) => setFaceDir(p, x, 'x'))}>Theo X</button>
          </div>
        </Field>
      </div>
      <Field label="Vùng (giao trục)">
        <div className="slope-rect">
          <span>Từ</span>
          <Sel value={v[0]} onChange={(id) => setC(0, id)} options={ox} />
          <Sel value={v[1]} onChange={(id) => setC(1, id)} options={oy} />
          <span>đến</span>
          <Sel value={v[2]} onChange={(id) => setC(2, id)} options={ox} />
          <Sel value={v[3]} onChange={(id) => setC(3, id)} options={oy} />
        </div>
      </Field>
      <div className="slope-kinds">
        {KINDS.map((k) => (
          <button key={k} className={f.kind === k ? 'on' : ''} onClick={() => upd((x) => void (x.kind = k))}>
            <KindIcon k={k} />
            <span>{SLOPE_KIND_LABEL[k]}</span>
          </button>
        ))}
      </div>
      <div className="grid2">
        <Field label="開始 (trái)"><Sel value={f.start} onChange={(id) => upd((x) => void (x.start = id))} options={[{ value: '', label: '—' }, ...perp.map((g) => ({ value: g.id, label: g.name }))]} /></Field>
        <Field label="終了 (phải)"><Sel value={f.end} onChange={(id) => upd((x) => void (x.end = id))} options={[{ value: '', label: '—' }, ...perp.map((g) => ({ value: g.id, label: g.name }))]} /></Field>
      </div>
      {f.kind === 'two' ? (
        <div className="grid2">
          <Field label="Y移動量 開始側 (mm)"><Num signed value={f.dy} onChange={(n) => upd((x) => { x.dy2 = x.dy2 ?? x.dy; x.dy = n; })} /></Field>
          <Field label="Y移動量 終了側 (mm)"><Num signed value={f.dy2 ?? f.dy} onChange={(n) => upd((x) => void (x.dy2 = n))} /></Field>
        </div>
      ) : (
        <div className="grid2">
          <Field label={`X移動量 (${f.kind === 'rightHigh' || f.kind === 'rightLow' ? gname(f.end) : gname(f.start)}側, mm)`}><Num value={f.dx} onChange={(n) => upd((x) => void (x.dx = n))} /></Field>
          <Field label="Y移動量 (mm)"><Num signed value={f.dy} onChange={(n) => upd((x) => void (x.dy = n))} /></Field>
        </div>
      )}
      {f.kind !== 'flat' && f.kind !== 'two' && (
        <Field label="勾配比率 (ngang : đứng)">
          <div className="slope-ratio">
            <Num value={f.run} onChange={(n) => upd((x) => void (x.run = n))} />
            <span>:</span>
            <Num value={f.rise} onChange={(n) => upd((x) => void (x.rise = n))} />
          </div>
        </Field>
      )}
      <label className="check small"><input type="checkbox" checked={mid} onChange={(e) => setMid(e.target.checked)} /> Hiện các trục giữa</label>
      <SlopePreview p={p} f={f} mid={mid} />
    </>
  );
}

function PlanePanel({ p, set, draft, setDraft }: MoyaTabProps) {
  const md = moyaOf(p);
  const faces = (p.slopeFaces ?? []).filter((f) => f.ok !== false && f.mode !== 'line');
  const topLv = [...p.levels].sort((a, b) => b.elevation - a.elevation)[0]?.id ?? '';
  const updPl = (id: string, fn: (pl: MoyaPlane) => void) => set((d) => { const x = ensureMoya(d).planes.find((y) => y.id === id); if (x) fn(x); });
  const addNew = () => {
    const id = uid('mpl');
    set((d) => {
      const m = ensureMoya(d);
      const f = newSlopeFace(p, m.planes.length + 1, topLv, 'area');
      f.ok = true;
      f.dy2 = f.dy;
      f.pts = [[p.gridsX[0]?.id ?? '', p.gridsY[0]?.id ?? ''], [p.gridsX[p.gridsX.length - 1]?.id ?? '', p.gridsY[0]?.id ?? ''], [p.gridsX[p.gridsX.length - 1]?.id ?? '', p.gridsY[p.gridsY.length - 1]?.id ?? ''], [p.gridsX[0]?.id ?? '', p.gridsY[p.gridsY.length - 1]?.id ?? '']];
      setFaceDir(p, f, 'y');
      m.planes.push({ id, name: `母屋面${m.planes.length + 1}`, faceId: '', gap: 125, face: f });
    });
    if (!draft.plane) setDraft({ ...draft, plane: id });
  };
  return (
    <>
      <Section title="母屋配置面 – 勾配">
        <p className="muted small">勾配 của 母屋 nhập ngay ở đây và chỉ ảnh hưởng 母屋, không làm thay đổi 本体.</p>
        <div className="row-gap">
          <button className="primary" onClick={addNew}>+ 母屋配置面 (勾配 mới)</button>
          {faces.length > 0 && (
            <Sel value="" onChange={(fid) => { const f = faces.find((x) => x.id === fid); if (!f) return; set((d) => { const m = ensureMoya(d); m.planes.push({ id: uid('mpl'), name: f.name, faceId: '', gap: 125, face: { ...JSON.parse(JSON.stringify(f)), id: uid('sf') } }); }); }}
              options={[{ value: '', label: '+ chép từ tab 勾配…' }, ...faces.map((f) => ({ value: f.id, label: f.name }))]} />
          )}
        </div>
      </Section>
      {md.planes.map((pl) => {
        const f = planeFace(p, pl);
        return (
          <Section key={pl.id} title={`母屋配置面勾配設定: ${pl.name}`} actions={<button className="link" onClick={() => set((d) => { const m = ensureMoya(d); m.planes = m.planes.filter((x) => x.id !== pl.id); m.items = m.items.filter((x) => x.plane !== pl.id); })}>Xoá</button>}>
            <div className="grid2">
              <Field label="名称"><Text value={pl.name} onChange={(v) => updPl(pl.id, (x) => void (x.name = v))} /></Field>
              <Field label="間隔 (mm)"><Num value={pl.gap} onChange={(v) => updPl(pl.id, (x) => void (x.gap = v))} /></Field>
            </div>
            <MoyaGapSketch gap={pl.gap} />
            {f && !pl.face && (
              <div className="alert">Đang dùng 勾配 「{f.name}」 của tab 勾配. <button className="link" onClick={() => updPl(pl.id, (x) => { x.face = { ...JSON.parse(JSON.stringify(f)), id: uid('sf') }; x.faceId = ''; })}>Tách thành 勾配 riêng của 母屋</button></div>
            )}
            {pl.face && <MoyaSlopeEditor p={p} f={pl.face} upd={(fn) => updPl(pl.id, (x) => { if (x.face) fn(x.face); })} />}
          </Section>
        );
      })}
    </>
  );
}

/** Hình minh hoạ 間隔: đường 勾配 → 天端 母屋 */
function MoyaGapSketch({ gap }: { gap: number }) {
  return (
    <svg viewBox="0 0 260 110" width="100%" style={{ maxWidth: 320 }}>
      <line x1={10} y1={95} x2={250} y2={35} stroke="#ec4899" strokeDasharray="6 4" />
      <text x={200} y={60} fontSize={10} fill="#be185d">勾配ライン</text>
      <g transform="translate(120,46) rotate(-14)">
        <rect x={-14} y={-22} width={28} height={22} fill="#e2e8f0" stroke="#0f172a" />
        <line x1={0} y1={-22} x2={0} y2={-48} stroke="#2563eb" />
      </g>
      <line x1={78} y1={78} x2={70} y2={45} stroke="#2563eb" markerEnd="url(#ar)" />
      <defs>
        <marker id="ar" markerWidth={6} markerHeight={6} refX={3} refY={3} orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#2563eb" /></marker>
      </defs>
      <text x={20} y={40} fontSize={11} fill="#1d4ed8">間隔 {gap}</text>
    </svg>
  );
}

/** Hình minh họa cách chia giữa 2 đường */
function DivSketch({ n, place }: { n: number; place: string }) {
  const W = 260, x0 = 20, x1 = 240, m = Math.min(12, Math.max(1, n));
  const xs: number[] = [];
  for (let i = 1; i <= m; i++) xs.push(place === 'mid' ? x0 + ((x1 - x0) * (i - 0.5)) / m : place === 'inner' ? x0 + ((x1 - x0) * i) / (m + 1) : x0 + ((x1 - x0) * i) / m);
  if (place === 'step') xs.unshift(x0);
  return (
    <svg viewBox={`0 0 ${W} 60`} width="100%" style={{ maxWidth: 320, display: 'block' }}>
      {[x0, x1].map((x) => <line key={x} x1={x} y1={6} x2={x} y2={54} stroke="#7c3aed" strokeWidth={2} />)}
      {xs.map((x, i) => <rect key={i} x={x - 3} y={14} width={6} height={32} fill="#fdba74" stroke="#c2410c" />)}
      <text x={x0} y={60} fontSize={9} fill="#7c3aed">基準線</text>
      <text x={x1 - 30} y={60} fontSize={9} fill="#7c3aed">đường 2</text>
    </svg>
  );
}

function PlacePanel(props: MoyaTabProps) {
  const { p, set, draft, setDraft, refs, sel, setSel } = props;
  const md = moyaOf(p);
  const upd = (patch: Partial<MoyaDraft>) => setDraft({ ...draft, ...patch });
  const ref = refs.find((r) => r.key === draft.ref);
  const plane = md.planes.find((x) => x.id === draft.plane);
  useEffect(() => { if (!plane && md.planes[0]) setDraft({ ...draft, plane: md.planes[0].id }); }); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = ref && plane ? moyaPreview(p, { plane: plane.id, ref: ref.key, refLabel: ref.label, a: ref.a, b: ref.b, member: draft.member, dir: draft.dir, base: draft.base, side: draft.side, fit: draft.fit, extL: 0, extR: 0 }, moyaOffsets(draft, ref, refs.find((r) => r.key === draft.ref2))) : [];
  const ok = () => {
    set((d) => {
      const m = ensureMoya(d);
      for (const it of prev) m.items.push({ ...it, id: uid('my') });
    });
    setDraft({ ...draft, ref: '' });
  };
  const cur = md.items.find((x) => x.id === sel);
  if (!md.planes.length) return <Section title="母屋 入力"><div className="alert">Hãy tạo 母屋配置面 trước (tab phụ 配置面 → 勾配変換).</div></Section>;
  return (
    <>
      <Section title="① 配置面">
        <div className="chips">
          {md.planes.map((pl) => (
            <label key={pl.id} className={`chip ${draft.plane === pl.id ? 'on' : ''}`} onClick={() => upd({ plane: pl.id })}>
              {pl.name} (間隔 {pl.gap})
            </label>
          ))}
        </div>
      </Section>
      <Section title="② 母屋 – 入力">
        <table className="table kv prop-table">
          <tbody>
            <tr><td>部材名</td><td><Sel value={draft.member} onChange={(v) => upd({ member: v })} options={md.members.map((m) => ({ value: m.name, label: `${m.name} – ${String(m.v.size)}` }))} /></td></tr>
            <tr><td>部材向き</td><td><Sel value={draft.dir} onChange={(v) => upd({ dir: v })} options={MOYA_DIRS.map((x) => ({ value: x, label: x }))} /></td></tr>
            <tr><td>配置基準</td><td><Sel value={draft.base} onChange={(v) => upd({ base: v })} options={MOYA_BASES.map((x) => ({ value: x, label: x }))} /></td></tr>
            <tr><td>配置基準(側面)</td><td><Sel value={draft.side} onChange={(v) => upd({ side: v })} options={MOYA_SIDES.map((x) => ({ value: x, label: x }))} /></td></tr>
            <tr><td>配置面合わせ</td><td><Sel value={draft.fit} onChange={(v) => upd({ fit: v })} options={MOYA_FITS.map((x) => ({ value: x, label: x }))} /></td></tr>
          </tbody>
        </table>
      </Section>
      <Section title="③ 基準線 + 間隔">
        <Field label="基準線 (bấm đường trục / 大梁 trên mặt bằng hoặc chọn)">
          <Sel value={draft.ref} onChange={(v) => upd({ ref: v })} options={[{ value: '', label: '— chọn —' }, ...refs.map((r) => ({ value: r.key, label: r.label }))]} />
        </Field>
        <div className="seg">
          {([['gap', '本数 + 間隔'], ['ds', 'Khoảng cách'], ['div', 'Chia đều 2 đường']] as const).map(([k, l]) => (
            <button key={k} className={(draft.mode ?? 'gap') === k ? 'on' : ''} onClick={() => upd({ mode: k })}>{l}</button>
          ))}
        </div>
        {(draft.mode ?? 'gap') === 'gap' && (
          <div className="grid3">
            <Field label="本数"><Num value={draft.count} min={1} onChange={(v) => upd({ count: Math.max(1, Math.round(v)) })} /></Field>
            <Field label="基準間隔"><Num value={draft.baseGap} onChange={(v) => upd({ baseGap: v })} /></Field>
            <Field label="母屋間隔"><Num value={draft.gap} onChange={(v) => upd({ gap: v })} /></Field>
          </div>
        )}
        {draft.mode === 'ds' && (
          <>
            <Field label="Khoảng cách tới 基準線 (mm): vd 1500 3000 · 4*1200 (cộng dồn)"><Text value={draft.ds ?? ''} onChange={(v) => upd({ ds: v })} /></Field>
            <label className="check small"><input type="checkbox" checked={!!draft.cum} onChange={(e) => upd({ cum: e.target.checked })} /> Cộng dồn (1500 1500 → 1500, 3000)</label>
          </>
        )}
        {draft.mode === 'div' && (
          <>
            <Field label="Đường giới hạn 2 (bấm đường thứ 2 trên mặt bằng hoặc chọn)">
              <Sel value={draft.ref2 ?? ''} onChange={(v) => upd({ ref2: v })} options={[{ value: '', label: '— chọn —' }, ...refs.filter((r) => r.key !== draft.ref).map((r) => ({ value: r.key, label: r.label }))]} />
            </Field>
            <div className="grid2">
              <Field label="本数"><Num value={draft.n ?? 4} min={1} onChange={(v) => upd({ n: Math.max(1, Math.round(v)) })} /></Field>
              <Field label="Cách chia">
                <Sel value={draft.place ?? 'inner'} onChange={(v) => upd({ place: v as MoyaBatch['place'] })} options={[{ value: 'inner', label: 'Cách đều, không nằm trên 2 đường' }, { value: 'step', label: 'Gồm cả 2 đường giới hạn' }, { value: 'mid', label: 'Giữa mỗi ô' }]} />
              </Field>
            </div>
            <DivSketch n={draft.n ?? 4} place={draft.place ?? 'inner'} />
          </>
        )}
        {draft.mode !== 'div' && (
          <div className="seg">
            <span className="muted small">Phía đặt:</span>
            <button className={draft.sign > 0 ? 'on' : ''} onClick={() => upd({ sign: 1 })}>◀ Bên trái / trên</button>
            <button className={draft.sign < 0 ? 'on' : ''} onClick={() => upd({ sign: -1 })}>Bên phải / dưới ▶</button>
          </div>
        )}
        <p className="muted small">
          {ref ? `Xem trước ${prev.length} thanh (nét đứt cam) trên mặt bằng.` : 'Chọn 基準線 để xem trước.'}
          {ref && plane && !prev.length && ' Không cắt được 配置面 – đổi phía hoặc 基準間隔.'}
          {ref && plane && prev.length > 0 && (draft.mode ?? 'gap') === 'gap' && prev.length < draft.count && <b className="warn-text"> ⚠ {draft.count - prev.length} thanh nằm ngoài 配置面 (bị bỏ) – kiểm tra Phía đặt.</b>}
        </p>
        <button className="primary" disabled={!prev.length} onClick={ok}>OK – 配置 {prev.length || ''} 本</button>
      </Section>
      <Section title={`母屋 đã đặt (${md.items.length})`}>
        <table className="table compact">
          <thead>
            <tr><th>部材</th><th>配置面</th><th>基準線 / 間隔</th><th>L</th><th /></tr>
          </thead>
          <tbody>
            {md.items.map((it) => {
              const g = moyaGeo(p, it);
              const L = g ? Math.round(g.t1 - g.t0) : 0;
              return (
                <tr key={it.id} className={it.id === sel ? 'sel' : ''} onClick={() => setSel(it.id === sel ? null : it.id)}>
                  <td><b>{it.member}</b></td>
                  <td>{md.planes.find((x) => x.id === it.plane)?.name}</td>
                  <td>{it.refLabel} · {it.off}</td>
                  <td className="num">{g ? L : '⚠'}</td>
                  <td><button className="link" onClick={(e) => { e.stopPropagation(); set((d) => { const m = ensureMoya(d); m.items = m.items.filter((x) => x.id !== it.id); }); }}>Xoá</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      {cur && (
        <Section title={`修正: ${cur.member}`}>
          <p className="muted small">延長量: + kéo dài, − cắt ngắn đầu 母屋 (左側 = đầu đầu đường chuẩn, 右側 = đầu cuối).</p>
          <div className="grid2">
            <Field label="左側 延長量 (mm)"><Num signed value={cur.extL} onChange={(v) => set((d) => { const x = ensureMoya(d).items.find((y) => y.id === cur.id); if (x) x.extL = v; })} /></Field>
            <Field label="右側 延長量 (mm)"><Num signed value={cur.extR} onChange={(v) => set((d) => { const x = ensureMoya(d).items.find((y) => y.id === cur.id); if (x) x.extR = v; })} /></Field>
          </div>
          <table className="table kv prop-table">
            <tbody>
              <tr><td>部材名</td><td><Sel value={cur.member} onChange={(v) => set((d) => { const x = ensureMoya(d).items.find((y) => y.id === cur.id); if (x) x.member = v; })} options={md.members.map((m) => ({ value: m.name, label: m.name }))} /></td></tr>
              <tr><td>部材向き</td><td><Sel value={cur.dir} onChange={(v) => set((d) => { const x = ensureMoya(d).items.find((y) => y.id === cur.id); if (x) x.dir = v; })} options={MOYA_DIRS.map((x) => ({ value: x, label: x }))} /></td></tr>
              <tr><td>配置面合わせ</td><td><Sel value={cur.fit} onChange={(v) => set((d) => { const x = ensureMoya(d).items.find((y) => y.id === cur.id); if (x) x.fit = v; })} options={MOYA_FITS.map((x) => ({ value: x, label: x }))} /></td></tr>
            </tbody>
          </table>
        </Section>
      )}
    </>
  );
}


export default function MoyaTab(props: MoyaTabProps) {
  const { p, set, sub, view3d, setView3d } = props;
  const started = !!p.moya;
  return (
    <>
      <div className="row-gap" style={{ justifyContent: 'flex-end', marginBottom: 6 }}>
        <div className="seg" style={{ margin: 0 }}>
          <button className={!view3d ? 'on' : ''} onClick={() => setView3d(false)}>Mặt bằng</button>
          <button className={view3d ? 'on' : ''} onClick={() => setView3d(true)}>3D</button>
        </div>
      </div>
      {!started ? (
        <Section title="母屋">
          <p>Tạo 母屋マスター mặc định (部材 M1, M2). ピース và 部品 chỉ được tạo khi bạn bấm 作成 hoặc nhập từ mẫu / tab 胴縁.</p>
          <button className="primary" onClick={() => set((d) => void ensureMoya(d))}>母屋マスター を作成</button>
        </Section>
      ) : (
        <>
          {sub === 'master' && <MasterPanel {...props} />}
          {sub === 'plane' && <PlanePanel {...props} />}
          {sub === 'place' && <PlacePanel {...props} />}
          {PC_SUBS[sub] && (
            <PiecePanel p={props.p} set={props.set} members={props.members} kind={PC_SUBS[sub]} which="moya" draft={props.pcDraft} setDraft={props.setPcDraft} sel={props.pcSel} setSel={props.setPcSel}>
            </PiecePanel>
          )}
        </>
      )}
    </>
  );
}
