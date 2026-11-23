// Nhập tay 支持ピース / 接続ピース / コーナーピース cho 母屋 và 胴縁
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Num, Section, Sel } from '../ui';
import type { Member, Project } from '../model';
import { uid } from '../model';
import type { Updater } from '../ui';
import { ensureMoya, moyaOf } from '../moya';
import type { MoyaMember, MoyaPart, MoyaPiece } from '../moya';
import { ensureGirt, girtOf } from '../girt';
import { HlCtx, PcPic } from '../secPics';
import { PC_FIELD, PC_LABEL, PC_TYPE, pcResultOf, autoTargets, autoPlan } from '../pieceSet';
import type { PcDraft, PcItem, PcKind } from '../pieceSet';

export const PC_SUBS: Record<string, PcKind> = { support: 'support', connect: 'connect', corner: 'corner' };
const NONE = new Set(['', '<なし>', '<無>']);

interface Props {
  p: Project;
  set: Updater;
  members: Member[];
  kind: PcKind;
  which: 'moya' | 'girt';
  draft: PcDraft;
  setDraft: (d: PcDraft) => void;
  sel: string | null;
  setSel: (id: string | null) => void;
  children?: ReactNode;
}

type Data = { support?: { on: boolean }; pcs?: PcItem[]; items: { id: string; member: string }[]; members: MoyaMember[]; pieces: MoyaPiece[]; parts: MoyaPart[] };

export function draftItem(d: PcDraft, kind: PcKind): PcItem | null {
  if (!d.buzai || !d.targets.length || (d.method === 2 && !d.aux)) return null;
  return { id: 'pc-draft', kind, buzai: d.buzai, buzaiLabel: d.buzaiLabel, targets: d.targets, aux: d.method === 2 ? d.aux : undefined, piece: d.piece, align: d.align, side: d.side, leg: d.leg, off: d.off };
}

export default function PiecePanel({ p, set, members, kind, which, draft, setDraft, sel, setSel, children }: Props) {
  const data: Data = which === 'moya' ? moyaOf(p) : girtOf(p);
  const tName = which === 'moya' ? '母屋' : '胴縁';
  const bzName = which === 'moya' ? '大梁 / 小梁' : '柱 / 間柱 / 梁 / 縦胴縁';
  const edit = (fn: (x: Data) => void) => set((d) => fn(which === 'moya' ? ensureMoya(d) : ensureGirt(d)));
  const pcs = (data.pcs ?? []).filter((x) => x.kind === kind);
  const cur = pcs.find((x) => x.id === sel) ?? null;
  const [fk, setFk] = useState('');
  const upd = (patch: Partial<PcDraft>) => setDraft({ ...draft, ...patch });
  const options = data.pieces.filter((x) => String(x.v.type ?? '').startsWith(PC_TYPE[kind]));
  const memOf = (tid: string) => { const it = data.items.find((x) => x.id === tid); return data.members.find((m) => m.name === it?.member); };
  const tLabel = (tid: string) => {
    const it = data.items.find((x) => x.id === tid) as ({ member: string; refLabel?: string; off?: number; a?: [number, number] } | undefined);
    if (!it) return '?';
    if (which === 'moya') return `${it.member} · ${it.refLabel ?? ''} ${it.off ? (it.off > 0 ? '+' : '') + it.off : ''}`;
    const b2 = (it as { b?: [number, number] }).b;
    const vert = !!(it.a && b2 && Math.abs(b2[0] - it.a[0]) < 1);
    return `${vert ? '縦' : '横'} ${it.member} @${Math.round(vert ? it.a?.[0] ?? 0 : it.a?.[1] ?? 0)}`;
  };
  // giá trị đang hiển thị (đang sửa 1 bản ghi hoặc draft)
  const v = cur ?? draft;
  const setV = (patch: Partial<PcItem>) => {
    if (cur) edit((x) => { const r = (x.pcs ?? []).find((y) => y.id === cur.id); if (r) Object.assign(r, patch); });
    else upd(patch as Partial<PcDraft>);
  };
  const ready = !cur && !!draft.buzai && draft.targets.length > 0 && (draft.method === 1 || !!draft.aux);
  const prevItem = ready ? draftItem(draft, kind) : null;
  const prev = useMemo(() => (prevItem ? pcResultOf(p, members, which, [prevItem]) : null), [p, members, which, JSON.stringify(prevItem)]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = () => {
    const it = draftItem(draft, kind);
    if (!it) return;
    edit((x) => { x.pcs = [...(x.pcs ?? []), { ...it, id: uid('pc') }]; });
    setDraft({ ...draft, buzai: '', buzaiLabel: '', targets: [], aux: undefined });
  };
  // hình: cây đầu tiên + ピース đang chọn
  const t0 = (cur?.targets ?? draft.targets)[0];
  const mem0 = (t0 && memOf(t0)) || data.members[0];
  const pcName = v.piece === 'マスター参照' ? String(mem0?.v[PC_FIELD[kind]] ?? '') : v.piece;
  const pc = data.pieces.find((x) => x.name === pcName);
  const fName = pc ? String(kind === 'connect' ? pc.v.lipFillerL ?? pc.v.lipFiller ?? '' : pc.v.lipFiller ?? '') : '';
  const filler = pc && String(pc.v.lipStyle ?? '').includes('あり') && !NONE.has(fName) ? data.parts.find((x) => x.name === fName) : undefined;
  const row = (k: string, label: ReactNode, el: ReactNode) => (
    <tr key={k} className={fk === k ? 'row-focus' : ''} onPointerDown={() => setFk(k)} onFocusCapture={() => setFk(k)}>
      <td>{label}</td>
      <td>{el}</td>
    </tr>
  );
  const seg = <T extends string | number>(val: T, opts: [T, string][], on: (x: T) => void) => (
    <div className="seg" style={{ margin: 0 }}>
      {opts.map(([x, l]) => <button key={String(x)} className={val === x ? 'on' : ''} onClick={() => on(x)}>{l}</button>)}
    </div>
  );
  const warn = cur ? pcResultOf(p, members, which, [cur]).warn : prev?.warn ?? [];
  const unitCount = (it: PcItem) => members.filter((m) => m.part === 'piece' && m.source === it.id).length;
  // ── lệnh 修正 hàng loạt ──
  const picked = draft.picked ?? [];
  const pickedSet = new Set(picked);
  const [bp, setBp] = useState<Pick<PcItem, 'piece' | 'align' | 'side' | 'leg' | 'off'>>({ piece: 'マスター参照', align: '中', side: '背', leg: '外', off: 0 });
  const [bpOn, setBpOn] = useState<Record<string, boolean>>({});
  const applyBatch = (del: boolean) => {
    const patch: Partial<PcItem> = {};
    for (const k of ['piece', 'align', 'side', 'leg', 'off'] as const) if (bpOn[k]) (patch as Record<string, unknown>)[k] = bp[k];
    edit((x) => {
      const out: PcItem[] = [];
      for (const it of x.pcs ?? []) {
        const hit = it.kind === kind ? it.targets.filter((t) => pickedSet.has(`${it.id}|${t}`)) : [];
        if (!hit.length) { out.push(it); continue; }
        const rest = it.targets.filter((t) => !hit.includes(t));
        if (del) { if (rest.length) out.push({ ...it, targets: rest }); continue; }
        if (!rest.length) { out.push({ ...it, ...patch }); continue; }
        out.push({ ...it, targets: rest });
        out.push({ ...it, ...patch, id: uid('pc'), targets: hit });
      }
      x.pcs = out;
    });
    upd({ picked: [] });
  };
  const allKeys = pcs.flatMap((it) => it.targets.map((t) => `${it.id}|${t}`));
  // ── lệnh tự đặt ──
  const [aPiece, setAPiece] = useState('マスター参照');
  const autoPrev = draft.autoPrev;
  const autoBase = { piece: aPiece, align: draft.align, side: draft.side, leg: draft.leg, off: draft.off };
  const autoWarn = useMemo(() => (autoPrev?.length ? pcResultOf(p, members, which, autoPrev).warn : []), [p, members, which, autoPrev]);
  const autoCnt = autoPrev?.reduce((n, x) => n + x.targets.length, 0) ?? 0;
  const pieceOpts = [{ value: 'マスター参照', label: `マスター参照 (${String(mem0?.v[PC_FIELD[kind]] ?? 'なし').replace('<なし>', 'なし')})` }, ...options.map((x) => ({ value: x.name, label: `${x.name} – ${String(x.v.mat ?? '').replace(/^\d+-/, '')} ${String(x.v.size ?? '')}` }))];
  const batchRow = (k: 'piece' | 'align' | 'side' | 'leg' | 'off', label: string, el: ReactNode) => row(k, (
    <label className="check" style={{ margin: 0 }}><input type="checkbox" title="Áp dụng mục này" checked={!!bpOn[k]} onChange={(e) => setBpOn({ ...bpOn, [k]: e.target.checked })} /> {label}</label>
  ), <div style={{ opacity: bpOn[k] ? 1 : 0.45 }} onPointerDown={() => !bpOn[k] && setBpOn({ ...bpOn, [k]: true })}>{el}</div>);
  if (draft.edit) {
    return (
      <>
        <Section title={`修正 ${PC_LABEL[kind]} – quét chọn hàng loạt`} actions={<button onClick={() => upd({ edit: false, picked: [] })}>Xong</button>}>
          <div className="pc-steps">
            <div className={picked.length ? 'done' : 'on'}>Đã chọn <b>{picked.length}</b> ピース – bấm từng tấm hoặc kéo khung trên mặt bằng / 3D (Shift: thêm vào).</div>
          </div>
          <div className="row-gap">
            <button onClick={() => upd({ picked: allKeys })}>Chọn tất cả ({allKeys.length})</button>
            <button disabled={!picked.length} onClick={() => upd({ picked: [] })}>Bỏ chọn</button>
          </div>
          <div className="master-edit">
            <div className="master-pic">
              <HlCtx.Provider value={fk}>
                <PcPic mem={mem0?.v} pc={data.pieces.find((x) => x.name === (bp.piece === 'マスター参照' ? String(mem0?.v[PC_FIELD[kind]] ?? '') : bp.piece))?.v} align={bp.align} side={bp.side} leg={bp.leg} kind={PC_LABEL[kind]} />
              </HlCtx.Provider>
            </div>
            <table className="table kv prop-table">
              <thead><tr><th>項目名 (☑ = đổi)</th><th>設定値</th></tr></thead>
              <tbody>
                {batchRow('piece', 'ピース', <Sel value={bp.piece} onChange={(x) => setBp({ ...bp, piece: x })} options={pieceOpts} />)}
                {batchRow('align', '合わせ位置', seg(bp.align, [['上', '上'], ['中', '中'], ['下', '下']], (x) => setBp({ ...bp, align: x })))}
                {batchRow('side', '取付方向', seg(bp.side, [['背', '背 (bụng)'], ['腹', '腹 (リップ)']], (x) => setBp({ ...bp, side: x })))}
                {batchRow('leg', 'L 向き', seg(bp.leg, [['外', '外'], ['内', '内']], (x) => setBp({ ...bp, leg: x })))}
                {batchRow('off', `ずれ (mm)`, <Num signed value={bp.off} onChange={(x) => setBp({ ...bp, off: x })} />)}
              </tbody>
            </table>
          </div>
          <div className="row-gap">
            <button className="primary" disabled={!picked.length || !Object.values(bpOn).some(Boolean)} onClick={() => applyBatch(false)}>✓ Áp dụng cho {picked.length} ピース</button>
            <button disabled={!picked.length} onClick={() => applyBatch(true)}>Xoá {picked.length} ピース</button>
          </div>
        </Section>
      </>
    );
  }
  return (
    <>
      <Section title={cur ? `修正: ${PC_LABEL[kind]}` : `${PC_LABEL[kind]} – 入力`} actions={cur ? <button onClick={() => setSel(null)}>Xong</button> : <button onClick={() => { setSel(null); upd({ edit: true, picked: [], autoPrev: undefined }); }}>✎ 修正 (quét chọn)</button>}>
        <div className="master-edit">
          <div className="master-pic">
            <HlCtx.Provider value={fk}>
              <PcPic mem={mem0?.v} pc={pc?.v} filler={filler?.v} align={v.align} side={v.side} leg={v.leg} kind={PC_LABEL[kind]} />
            </HlCtx.Provider>
          </div>
          <table className="table kv prop-table">
            <thead><tr><th>項目名</th><th>設定値</th></tr></thead>
            <tbody>
              {!cur && row('method', '入力方法', seg(draft.method, [[1, `1-部材 → ${tName}`], [2, `2-部材 → ${tName} → 補助線`]], (m) => upd({ method: m, aux: undefined })))}
              {row('piece', 'ピース', (
                <>
                  <Sel value={v.piece} onChange={(x) => setV({ piece: x })} options={pieceOpts} />
                  {!options.length && <div className="small jis-own">Chưa có ピース loại {PC_LABEL[kind]} – tạo ở {tName}マスター › ピース.</div>}
                </>
              ))}
              {row('align', '合わせ位置', seg(v.align, [['上', '上'], ['中', '中'], ['下', '下']], (x) => setV({ align: x })))}
              {row('side', '取付方向', seg(v.side, [['背', '背 (bụng)'], ['腹', '腹 (リップ)']], (x) => setV({ side: x })))}
              {row('leg', 'L 向き', seg(v.leg, [['外', '外'], ['内', '内']], (x) => setV({ leg: x })))}
              {row('off', `ずれ (dọc ${tName}, mm)`, <Num signed value={v.off} onChange={(x) => setV({ off: x })} />)}
            </tbody>
          </table>
        </div>
        {!cur && (
          <div className="pc-steps">
            <div className="row-gap" style={{ flexWrap: 'nowrap' }}>
              <b className="small">Tự chọn {tName} đi qua 親部材</b>
              <div className="seg" style={{ margin: 0 }}>
                {[true, false].map((on) => <button key={String(on)} className={!!draft.auto === on ? 'on' : ''} onClick={() => {
                const t = on && draft.buzai ? autoTargets(p, members, which, { id: 'x', kind, buzai: draft.buzai, buzaiLabel: draft.buzaiLabel, piece: draft.piece, align: draft.align, side: draft.side, leg: draft.leg, off: draft.off }) : draft.targets;
                upd({ auto: on, targets: t });
              }}>{on ? 'ON' : 'OFF'}</button>)}
              </div>
              <span className="muted small">ON: chọn 親部材 → lấy hết {tName} cắt qua nó; vẫn bấm để bỏ / thêm cây</span>
            </div>
            <div className={!draft.buzai ? 'on' : 'done'} onPointerDown={() => setFk('buzai')}>① 親部材: {draft.buzai ? <b>{draft.buzaiLabel}</b> : <span>bấm {bzName} trên hình</span>} {draft.buzai && <button className="link" onClick={() => upd({ buzai: '', buzaiLabel: '' })}>×</button>}</div>
            <div className={draft.buzai && !draft.targets.length ? 'on' : draft.targets.length ? 'done' : ''} onPointerDown={() => setFk('targets')}>
              ② {tName} ({draft.targets.length}): {draft.targets.length ? draft.targets.map((t) => <span key={t} className="chip on">{tLabel(t)} <button className="link" onClick={() => upd({ targets: draft.targets.filter((x) => x !== t) })}>×</button></span>) : <span>bấm các {tName} cần liên kết (chọn được nhiều cây)</span>}
            </div>
            {draft.method === 2 && <div className={draft.targets.length && !draft.aux ? 'on' : draft.aux ? 'done' : ''} onPointerDown={() => setFk('method')}>③ 補助線: {draft.aux ? <b>{draft.aux.label}</b> : <span>bấm 補助線 / đường trục xác định vị trí tấm</span>} {draft.aux && <button className="link" onClick={() => upd({ aux: undefined })}>×</button>}</div>}
          </div>
        )}
        {warn.length > 0 && <div className="alert">{[...new Set(warn)].slice(0, 4).map((w) => <div key={w}>{w}</div>)}</div>}
        {!cur && (
          <div className="row-gap">
            <button className="primary" disabled={!ready || !prev?.members.length} onClick={create}>✓ 作成 {prev?.members.length ? `(${prev.members.filter((m) => !m.section.id.startsWith('part:')).length} ピース)` : ''}</button>
            <button onClick={() => setDraft({ ...draft, buzai: '', buzaiLabel: '', targets: [], aux: undefined })}>クリア</button>
          </div>
        )}
        {cur && (
          <div className="row-gap">
            <span className="muted small">親部材 {cur.buzaiLabel} · {cur.targets.length} {tName}{cur.aux ? ` · 補助線 ${cur.aux.label}` : ''}</span>
            <button className="link" onClick={() => { edit((x) => { x.pcs = (x.pcs ?? []).filter((y) => y.id !== cur.id); }); setSel(null); }}>Xoá</button>
          </div>
        )}
      </Section>
      <Section title={`${PC_LABEL[kind]} đã nhập (${pcs.length})`}>
        <table className="table compact">
          <thead><tr><th>ピース</th><th>親部材</th><th>{tName}</th><th>合わせ</th><th>方向</th><th>Số</th><th /></tr></thead>
          <tbody>
            {pcs.map((it) => (
              <tr key={it.id} className={it.id === sel ? 'sel' : ''} onClick={() => setSel(it.id === sel ? null : it.id)}>
                <td><b>{it.piece}</b></td>
                <td>{it.buzaiLabel}{it.aux ? ` / ${it.aux.label}` : ''}</td>
                <td className="num">{it.targets.length}</td>
                <td>{it.align}</td>
                <td>{it.side}</td>
                <td className="num">{unitCount(it)}</td>
                <td><button className="link" onClick={(e) => { e.stopPropagation(); edit((x) => { x.pcs = (x.pcs ?? []).filter((y) => y.id !== it.id); }); if (sel === it.id) setSel(null); }}>Xoá</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title={`Tự đặt ${PC_LABEL[kind]} (toàn bộ)`}>
        <p className="muted small">Đặt {PC_LABEL[kind]} tại mọi giao {tName} × {bzName} chưa có ピース. 合わせ / 方向 / L 向き / ずれ lấy theo bảng 入力 ở trên.</p>
        <table className="table kv prop-table">
          <tbody>
            <tr><td>① ピース (mối nối)</td><td><Sel value={aPiece} onChange={(x) => { setAPiece(x); if (autoPrev) upd({ autoPrev: undefined }); }} options={pieceOpts} /></td></tr>
            <tr><td>② Xem trước</td><td>
              <button onClick={() => { setSel(null); upd({ autoPrev: autoPlan(p, members, which, kind, autoBase), buzai: '', buzaiLabel: '', targets: [] }); }}>👁 Xem trước</button>
              {autoPrev && <span className="small"> {autoCnt ? <>sẽ đặt <b>{autoCnt}</b> ピース ở {autoPrev.length} 親部材 (màu cam trên hình)</> : 'không có vị trí mới'}</span>}
            </td></tr>
            <tr><td>③ Xác nhận</td><td className="row-gap">
              <button className="primary" disabled={!autoCnt} onClick={() => { const add = autoPrev ?? []; edit((x) => { x.pcs = [...(x.pcs ?? []), ...add.map((it) => ({ ...it, id: uid('pc') }))]; }); upd({ autoPrev: undefined }); }}>✓ Xác nhận nhập {autoCnt || ''}</button>
              <button disabled={!autoPrev} onClick={() => upd({ autoPrev: undefined })}>Huỷ</button>
            </td></tr>
          </tbody>
        </table>
        {autoWarn.length > 0 && <div className="alert">{[...new Set(autoWarn)].slice(0, 4).map((w) => <div key={w}>{w}</div>)}</div>}
        {data.support?.on && kind === 'support' && <div className="alert">Cách tự đặt cũ đang bật (ピース theo マスター). <button className="link" onClick={() => edit((x) => { if (x.support) x.support.on = false; })}>Tắt cách cũ</button></div>}
      </Section>
      {children}
    </>
  );
}
