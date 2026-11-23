// Tab 胴縁 (REAL4 Step15–19): 胴縁マスター → 胴縁配置面 → 縦 / 横 / 登り胴縁 · パターン入力 · 開口 · 支持ピース · 複写
import { useState } from 'react';
import { Field, Num, Section, Sel, TabProps, Text } from '../ui';
import { gridPositions, uid } from '../model';
import { MEMBER_FIELDS, PART_FIELDS, PIECE_FIELDS, moyaOf } from '../moya';
import { GIRT_DIRS, GirtDraft, GirtItem, GirtOpen, OPEN_FIELDS, copyPlane, defaultGirt, memSec, ensureGirt, girtTemplates, girtOf, hRefs, newPlaneName, planeGeo, vRefs } from '../girt';
import { OpenPic, PartPic, PiecePic, SectionPic } from '../secPics';
import { MasterEditor, MasterTab, Rec } from './MasterEditor';
import PiecePanel, { PC_SUBS } from './PiecePanel';
import type { PcDraft } from '../pieceSet';

export interface GirtTabProps extends TabProps {
  draft: GirtDraft;
  setDraft: (d: GirtDraft) => void;
  plane: string;
  setPlane: (id: string) => void;
  preview: Omit<GirtItem, 'id'>[];
  previewOpen: Omit<GirtOpen, 'id'> | null;
  view3d: boolean;
  setView3d: (on: boolean) => void;
  sel: string | null;
  setSel: (id: string | null) => void;
  pcDraft: PcDraft;
  setPcDraft: (d: PcDraft) => void;
  pcSel: string | null;
  setPcSel: (id: string | null) => void;
}

const TABS: MasterTab[] = [
  { k: 'members', label: '部材', fields: MEMBER_FIELDS, name: '部材名', prefix: 'D', pic: (r) => <SectionPic v={r.v} /> },
  { win: true, k: 'pieces', label: 'ピース', fields: PIECE_FIELDS, name: 'ピース名', prefix: 'S', pic: (r) => <PiecePic v={r.v} /> },
  { k: 'opens', label: '開口', fields: OPEN_FIELDS, name: '部材名', prefix: 'AW-', col: (r) => `${String(r.v.kind).replace(/^\d+-/, '')} ${r.v.w}×${r.v.h}`, pic: (r) => <OpenPic v={r.v} /> },
  { k: 'parts', label: '部品', fields: PART_FIELDS, name: '部品名', prefix: 'F', pic: (r) => <PartPic v={r.v} /> },
];

function MasterPanel({ p, set }: TabProps) {
  const gd = girtOf(p);
  const def = defaultGirt();
  return (
    <MasterEditor
      data={{ members: gd.members, pieces: gd.pieces, opens: gd.opens, parts: gd.parts }}
      tabs={TABS}
      defaults={{ members: def.members, opens: def.opens, ...girtTemplates() }}
      imports={[{ label: 'tab 母屋', data: { pieces: moyaOf(p).pieces, parts: moyaOf(p).parts } }]}
      edit={(fn) => set((d) => { const m = ensureGirt(d); const o: Record<string, Rec[]> = { members: m.members, pieces: m.pieces, opens: m.opens, parts: m.parts }; fn(o); m.members = o.members; m.pieces = o.pieces; m.opens = o.opens; m.parts = o.parts; })}
    />
  );
}

function PlanePanel({ p, set, plane, setPlane, members }: GirtTabProps) {
  const gd = girtOf(p);
  const [mode, setMode] = useState<'grid' | 'pts'>('grid');
  const [ref, setRef] = useState(`gy:${p.gridsY[0]?.id ?? ''}`);
  const [p1, setP1] = useState<[string, string]>([p.gridsX[0]?.id ?? '', p.gridsY[0]?.id ?? '']);
  const [p2, setP2] = useState<[string, string]>([p.gridsX[1]?.id ?? '', p.gridsY[0]?.id ?? '']);
  const [offset, setOffset] = useState(0);
  const [arrow, setArrow] = useState<1 | -1>(1);
  const [autoOff, setAutoOff] = useState(true);
  /** mặt ngoài cột trên 通り: オフセット = −(½ cột + ½ 胴縁) → 胴縁 không đâm xuyên cột */
  const outerOff = (r: string) => {
    const x = r.startsWith('gx:') ? p.gridsX : r.startsWith('gy:') ? p.gridsY : null;
    if (!x) return 0;
    const pos = gridPositions(x).get(r.slice(3)) ?? 0;
    const k = r.startsWith('gx:') ? 0 : 1;
    const cs = members.filter((m) => m.kind === 'column' && !m.part && Math.abs(m.a[k] - pos) < 600);
    if (!cs.length) return 0;
    const ch = Math.max(...cs.map((m) => Math.max(m.section.h, m.section.b) / 2 + Math.abs(m.a[k] - pos)));
    const gdm = gd.members.find((m) => m.name !== 'KP') ?? gd.members[0];
    const gh = (gdm && memSec(gd, gdm.name)?.h) || 100;
    return -Math.round(ch + gh / 2);
  };
  const gName = (k: string) => [...p.gridsX, ...p.gridsY].find((x) => k.endsWith(x.id))?.name ?? '?';
  const gridOpts = [...p.gridsX.map((x) => ({ value: `gx:${x.id}`, label: `${x.name} 通り` })), ...p.gridsY.map((y) => ({ value: `gy:${y.id}`, label: `${y.name} 通り` }))];
  const xo = p.gridsX.map((x) => ({ value: x.id, label: x.name })), yo = p.gridsY.map((y) => ({ value: y.id, label: y.name }));
  const add = () => {
    const id = uid('gpl');
    set((d) => {
      const g = ensureGirt(d);
      const base = mode === 'grid' ? gName(ref) : '*' + (g.planes.filter((x) => x.ref === 'pts').length + 1);
      g.planes.push({ id, name: newPlaneName(d, base), ref: mode === 'grid' ? ref : 'pts', p1: mode === 'pts' ? p1 : undefined, p2: mode === 'pts' ? p2 : undefined, offset: autoOff && mode === 'grid' ? outerOff(ref) : offset, arrow });
    });
    setPlane(id);
  };
  // 矢印 hiển thị dễ hiểu: theo trục X → trái/phải; theo trục Y → lên/xuống (mặt bằng)
  const arrowLabel = (r: string, a: number) => (r.startsWith('gx:') ? (a > 0 ? '← 左' : '右 →') : r.startsWith('gy:') ? (a > 0 ? '↑ 上' : '下 ↓') : a > 0 ? '◀ trái' : 'phải ▶');
  return (
    <>
      <Section title="胴縁配置面 – 作成">
        <div className="seg">
          <button className={mode === 'grid' ? 'on' : ''} onClick={() => setMode('grid')}>通り</button>
          <button className={mode === 'pts' ? 'on' : ''} onClick={() => setMode('pts')}>キープラン交点</button>
        </div>
        {mode === 'grid' ? (
          <Field label="通り"><Sel value={ref} onChange={setRef} options={gridOpts} /></Field>
        ) : (
          <div className="grid2">
            <Field label="① 交点"><div className="mrow-pair"><Sel value={p1[0]} onChange={(v) => setP1([v, p1[1]])} options={xo} /><Sel value={p1[1]} onChange={(v) => setP1([p1[0], v])} options={yo} /></div></Field>
            <Field label="② 交点"><div className="mrow-pair"><Sel value={p2[0]} onChange={(v) => setP2([v, p2[1]])} options={xo} /><Sel value={p2[1]} onChange={(v) => setP2([p2[0], v])} options={yo} /></div></Field>
          </div>
        )}
        <div className="grid2">
          <Field label="オフセット (mm)">
            {autoOff && mode === 'grid' ? <span className="muted">{outerOff(ref)} (tự động: mặt ngoài cột)</span> : <Num signed value={offset} onChange={setOffset} />}
            {mode === 'grid' && <label className="check small"><input type="checkbox" checked={autoOff} onChange={(e) => setAutoOff(e.target.checked)} /> Tự động theo mặt ngoài cột</label>}
          </Field>
          <Field label="ラバー矢印 (hướng nhìn / phía đặt 胴縁)">
            <div className="seg" style={{ margin: 0 }}>
              <button className={arrow > 0 ? 'on' : ''} onClick={() => setArrow(1)}>{arrowLabel(mode === 'grid' ? ref : 'pts', 1)}</button>
              <button className={arrow < 0 ? 'on' : ''} onClick={() => setArrow(-1)}>{arrowLabel(mode === 'grid' ? ref : 'pts', -1)}</button>
            </div>
          </Field>
        </div>
        <button className="primary" onClick={add}>+ 配置面</button>
        <p className="muted small">オフセット dời mặt theo chiều 矢印. 矢印 = hướng nhìn khi đặt 胴縁 (phía trong nhà).</p>
      </Section>
      <Section title={`胴縁配置面 (${gd.planes.length})`}>
        <table className="table compact moya-list">
          <thead><tr><th>名称</th><th>通り / 交点</th><th>オフセット</th><th>矢印</th><th /></tr></thead>
          <tbody>
            {gd.planes.map((pl) => (
              <tr key={pl.id} className={pl.id === plane ? 'sel' : ''} onClick={() => setPlane(pl.id)}>
                <td><Text value={pl.name} onChange={(v) => set((d) => { const x = ensureGirt(d).planes.find((y) => y.id === pl.id); if (x) x.name = v; })} /></td>
                <td>{pl.ref === 'pts' ? `${gName(pl.p1![0])}${gName(pl.p1![1])}・${gName(pl.p2![0])}${gName(pl.p2![1])}` : gName(pl.ref)}{planeGeo(p, pl) ? '' : ' ⚠'}</td>
                <td><Num signed value={pl.offset} onChange={(v) => set((d) => { const x = ensureGirt(d).planes.find((y) => y.id === pl.id); if (x) x.offset = v; })} /></td>
                <td><button onClick={(e) => { e.stopPropagation(); set((d) => { const x = ensureGirt(d).planes.find((y) => y.id === pl.id); if (x) x.arrow = x.arrow > 0 ? -1 : 1; }); }}>{arrowLabel(pl.ref, pl.arrow)}</button></td>
                <td><button className="link" onClick={(e) => { e.stopPropagation(); set((d) => { const g = ensureGirt(d); g.planes = g.planes.filter((x) => x.id !== pl.id); g.items = g.items.filter((x) => x.plane !== pl.id); g.openings = g.openings.filter((x) => x.plane !== pl.id); }); }}>Xoá</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

const MODES: { k: GirtDraft['mode']; label: string }[] = [
  { k: 'v', label: '縦胴縁' },
  { k: 'h', label: '横 / 登り胴縁' },
  { k: 'pat', label: 'パターン入力' },
  { k: 'open', label: '開口' },
  { k: 'copy', label: '複写' },
];

function InputPanel(props: GirtTabProps) {
  const { p, set, members, draft: d, setDraft, plane, setPlane, preview, previewOpen, sel, setSel } = props;
  const gd = girtOf(p);
  const pl = gd.planes.find((x) => x.id === plane);
  const g = pl ? planeGeo(p, pl) : null;
  const upd = (patch: Partial<GirtDraft>) => setDraft({ ...d, ...patch });
  if (!gd.planes.length) return <Section title="胴縁 入力"><div className="alert">Hãy tạo 胴縁配置面 trước (tab phụ 配置面).</div></Section>;
  const V = g ? vRefs(p, g) : [], H = g ? hRefs(p, g, members) : [];
  const vOpts = [{ value: '', label: '— bấm đường đứng —' }, ...V.map((v) => ({ value: v.key, label: v.label }))];
  const hOpts = [{ value: '', label: '— bấm đường ngang —' }, ...H.map((h) => ({ value: h.key, label: h.label }))];
  const memOpts = gd.members.map((m) => ({ value: m.name, label: `${m.name} – ${String(m.v.size)}` }));
  const pcOpts = [{ value: 'マスター参照', label: 'マスター参照' }, { value: '<無>', label: '<無>' }, ...gd.pieces.filter((x) => String(x.v.type).includes('コーナー')).map((x) => ({ value: x.name, label: x.name }))];
  const ptOpts = [{ value: 'マスター参照', label: 'マスター参照' }, { value: '<無>', label: '<無>' }, ...gd.parts.map((x) => ({ value: x.name, label: x.name }))];
  const ok = () => {
    if (d.mode === 'open') {
      if (!previewOpen) return;
      set((dd) => void ensureGirt(dd).openings.push({ ...previewOpen, id: uid('go') }));
      return;
    }
    if (d.mode === 'copy') {
      if (!d.copyTo || d.copyTo === plane) return;
      set((dd) => { copyPlane(p, dd, plane, d.copyTo, d.copyMirror, d.copyNoOpen); });
      setPlane(d.copyTo);
      return;
    }
    set((dd) => { const gg = ensureGirt(dd); for (const it of preview) gg.items.push({ ...it, id: uid('gt') }); });
    // giữ đường chuẩn, bỏ vị trí vừa dùng
    if (d.mode === 'v') upd({ vRef: d.vRef });
  };
  const items = gd.items.filter((x) => x.plane === plane);
  const opens = gd.openings.filter((x) => x.plane === plane);
  const cur = items.find((x) => x.id === sel);
  const curO = opens.find((x) => x.id === sel);
  const RefSel = ({ label, k, opts }: { label: string; k: keyof GirtDraft; opts: { value: string; label: string }[] }) => (
    <Field label={label}><Sel value={String(d[k])} onChange={(v) => upd({ [k]: v } as Partial<GirtDraft>)} options={opts} /></Field>
  );
  return (
    <>
      <Section title="① 胴縁配置面">
        <div className="chips">
          {gd.planes.map((x) => (
            <label key={x.id} className={`chip ${x.id === plane ? 'on' : ''}`} onClick={() => setPlane(x.id)}>{x.name}</label>
          ))}
        </div>
      </Section>
      <div className="seg">
        {MODES.map((m) => (
          <button key={m.k} className={d.mode === m.k ? 'on' : ''} onClick={() => upd({ mode: m.k, ...(m.k === 'h' && d.member === 'KP' ? { member: gd.members.find((x) => x.name !== 'KP')?.name ?? d.member } : {}) })}>{m.label}</button>
        ))}
      </div>
      {(d.mode === 'v' || d.mode === 'h' || d.mode === 'pat') && (
        <Section title="② 胴縁 – 入力">
          <table className="table kv prop-table">
            <tbody>
              <tr><td>部材名</td><td><Sel value={d.member} onChange={(v) => upd({ member: v })} options={memOpts} /></td></tr>
              <tr><td>部材向き</td><td><Sel value={d.dir} onChange={(v) => upd({ dir: v })} options={GIRT_DIRS.map((x) => ({ value: x, label: x }))} /></td></tr>
              <tr><td>{d.mode === 'v' ? '下側' : '左側'} コーナーピース名</td><td><Sel value={d.cornerA} onChange={(v) => upd({ cornerA: v })} options={pcOpts} /></td></tr>
              <tr><td>{d.mode === 'v' ? '下側' : '左側'} 端部材部品</td><td><Sel value={d.endA} onChange={(v) => upd({ endA: v })} options={ptOpts} /></td></tr>
              <tr><td>{d.mode === 'v' ? '下側' : '左側'} 延長量</td><td><Num signed value={d.extA} onChange={(v) => upd({ extA: v })} /></td></tr>
              <tr><td>{d.mode === 'v' ? '上側' : '右側'} コーナーピース名</td><td><Sel value={d.cornerB} onChange={(v) => upd({ cornerB: v })} options={pcOpts} /></td></tr>
              <tr><td>{d.mode === 'v' ? '上側' : '右側'} 端部材部品</td><td><Sel value={d.endB} onChange={(v) => upd({ endB: v })} options={ptOpts} /></td></tr>
              <tr><td>{d.mode === 'v' ? '上側' : '右側'} 延長量</td><td><Num signed value={d.extB} onChange={(v) => upd({ extB: v })} /></td></tr>
              <tr><td>奥行き数値</td><td><Num signed value={d.depth} onChange={(v) => upd({ depth: v })} /></td></tr>
            </tbody>
          </table>
        </Section>
      )}
      {d.mode === 'v' && (
        <Section title="③ 縦胴縁: 2 đường ngang + vị trí">
          <div className="grid2">
            <RefSel label="① đường dưới (GL / 胴縁…)" k="lo" opts={hOpts} />
            <RefSel label="② đường trên (RSL / 梁天…)" k="hi" opts={hOpts} />
          </div>
          <div className="grid2">
            <RefSel label="基準 (通り / 配置面)" k="vRef" opts={vOpts} />
            <Field label="基準からの距離 (mm, + phải)"><Num signed value={d.vOff} onChange={(v) => upd({ vOff: v })} /></Field>
          </div>
          <Field label="Hoặc nhiều vị trí (mm): vd 600 2400 · 3*1500 (cộng dồn)"><Text value={d.vList ?? ''} onChange={(v) => upd({ vList: v })} /></Field>
        </Section>
      )}
      {(d.mode === 'h' || d.mode === 'pat') && (
        <Section title={d.mode === 'h' ? '③ 横胴縁: 2 đường đứng + 基準' : '③ パターン入力: khung 4 đường'}>
          <div className="grid2">
            <RefSel label="① trái (縦胴縁 / 通り)" k="left" opts={vOpts} />
            <RefSel label="② phải" k="right" opts={vOpts} />
          </div>
          {d.mode === 'h' ? (
            <>
              <RefSel label="基準 (階高 / 梁天 = 登り胴縁 / 胴縁)" k="hBase" opts={hOpts} />
              <div className="grid3">
                <Field label="基準間隔"><Num value={d.hGap} onChange={(v) => upd({ hGap: v })} /></Field>
                <Field label="本数"><Num value={d.hCount} min={1} onChange={(v) => upd({ hCount: Math.max(1, Math.round(v)) })} /></Field>
                <Field label="間隔"><Num value={d.hPitch} onChange={(v) => upd({ hPitch: v })} /></Field>
              </div>
              <Field label="Hoặc danh sách khoảng cách từ 基準 (mm): vd 1000 3000 · 4*1500 (cộng dồn)"><Text value={d.hList ?? ''} onChange={(v) => upd({ hList: v })} /></Field>
              <div className="seg">
                <button className={d.hSide > 0 ? 'on' : ''} onClick={() => upd({ hSide: 1 })}>↑ trên 基準</button>
                <button className={d.hSide < 0 ? 'on' : ''} onClick={() => upd({ hSide: -1 })}>↓ dưới 基準</button>
              </div>
            </>
          ) : (
            <>
              <div className="grid2">
                <RefSel label="③ dưới (横胴縁 / 階高)" k="lo" opts={hOpts} />
                <RefSel label="④ trên" k="hi" opts={hOpts} />
              </div>
              <div className="seg">
                <button className={d.patDir === 'h' ? 'on' : ''} onClick={() => upd({ patDir: 'h' })}>横胴縁 (từ dưới lên)</button>
                <button className={d.patDir === 'v' ? 'on' : ''} onClick={() => upd({ patDir: 'v' })}>縦胴縁 (từ trái sang)</button>
              </div>
              <Field label="間隔 (mm, cộng dồn): vd 1500 1500 1200 · 3*1500 · =4 (chia đều)">
                <div className="row-gap small" style={{ marginBottom: 4 }}>
                  {['=2', '=3', '=4', '=5', '4*1500'].map((x) => <button key={x} type="button" onClick={() => upd({ patList: x })}>{x}</button>)}
                </div>
                <Text value={d.patList} onChange={(v) => upd({ patList: v })} />
              </Field>
            </>
          )}
          <label className="check"><input type="checkbox" checked={d.cut} onChange={(e) => upd({ cut: e.target.checked })} /> 干渉: 入力側切断 (cắt 横胴縁 tại 縦胴縁 giao nhau)</label>
        </Section>
      )}
      {d.mode === 'open' && (
        <Section title="② 開口 – 入力">
          <table className="table kv prop-table">
            <tbody>
              <tr><td>開口名</td><td><Sel value={d.open} onChange={(v) => upd({ open: v })} options={gd.opens.map((o) => ({ value: o.name, label: `${o.name} ${o.v.w}×${o.v.h}` }))} /></td></tr>
              <tr><td>配置基準</td><td>1-左下</td></tr>
              <tr><td>上部材・下部材</td><td><div className="seg" style={{ margin: 0 }}><button className={d.oTop ? 'on' : ''} onClick={() => upd({ oTop: !d.oTop })}>上 {d.oTop ? '有' : '無'}</button><button className={d.oBot ? 'on' : ''} onClick={() => upd({ oBot: !d.oBot })}>下 {d.oBot ? '有' : '無'}</button></div></td></tr>
              <tr><td>左部材・右部材</td><td><div className="seg" style={{ margin: 0 }}><button className={d.oLeft ? 'on' : ''} onClick={() => upd({ oLeft: !d.oLeft })}>左 {d.oLeft ? '有' : '無'}</button><button className={d.oRight ? 'on' : ''} onClick={() => upd({ oRight: !d.oRight })}>右 {d.oRight ? '有' : '無'}</button></div></td></tr>
              <tr><td>ずれ量X</td><td><Num signed value={d.dx} onChange={(v) => upd({ dx: v })} /></td></tr>
              <tr><td>ずれ量Y</td><td><Num signed value={d.dy} onChange={(v) => upd({ dy: v })} /></td></tr>
            </tbody>
          </table>
          <div className="grid2">
            <RefSel label="基準点: đường đứng (通り)" k="oS" opts={vOpts} />
            <RefSel label="基準点: đường ngang (階高)" k="oZ" opts={hOpts} />
          </div>
          <p className="muted small">胴縁 đi qua 開口 tự bị cắt; 上/下 (左/右) 部材 lấy theo 開口マスター.</p>
        </Section>
      )}
      {d.mode === 'copy' && (
        <Section title="② 配置面一括複写">
          <Field label="複写先"><Sel value={d.copyTo} onChange={(v) => upd({ copyTo: v })} options={[{ value: '', label: '— chọn —' }, ...gd.planes.filter((x) => x.id !== plane).map((x) => ({ value: x.id, label: x.name }))]} /></Field>
          <label className="check"><input type="checkbox" checked={d.copyMirror} onChange={(e) => upd({ copyMirror: e.target.checked })} /> 反転複写 (theo vị trí thực, mặt đối diện)</label>
          <label className="check"><input type="checkbox" checked={d.copyNoOpen} onChange={(e) => upd({ copyNoOpen: e.target.checked })} /> 開口データを削除して複写する</label>
          <p className="muted small">Chép toàn bộ {items.length} 胴縁 + {opens.length} 開口 của {pl?.name}.</p>
        </Section>
      )}
      <button className="primary" disabled={d.mode === 'open' ? !previewOpen : d.mode === 'copy' ? !d.copyTo : !preview.length} onClick={ok}>
        OK – {d.mode === 'copy' ? '複写' : d.mode === 'open' ? '開口 配置' : `配置 ${preview.length || ''} 本`}
      </button>
      {cur && (
        <Section title={`修正: ${cur.member}`}>
          <div className="grid2">
            <Field label="延長量 A (trái / dưới)"><Num signed value={cur.extA} onChange={(v) => set((dd) => { const x = ensureGirt(dd).items.find((y) => y.id === cur.id); if (x) x.extA = v; })} /></Field>
            <Field label="延長量 B (phải / trên)"><Num signed value={cur.extB} onChange={(v) => set((dd) => { const x = ensureGirt(dd).items.find((y) => y.id === cur.id); if (x) x.extB = v; })} /></Field>
            <Field label="コーナーピース A"><Sel value={cur.cornerA} onChange={(v) => set((dd) => { const x = ensureGirt(dd).items.find((y) => y.id === cur.id); if (x) x.cornerA = v; })} options={pcOpts} /></Field>
            <Field label="コーナーピース B"><Sel value={cur.cornerB} onChange={(v) => set((dd) => { const x = ensureGirt(dd).items.find((y) => y.id === cur.id); if (x) x.cornerB = v; })} options={pcOpts} /></Field>
          </div>
          <button className="link" onClick={() => { set((dd) => { const gg = ensureGirt(dd); gg.items = gg.items.filter((x) => x.id !== cur.id); }); setSel(null); }}>Xoá 胴縁 này</button>
        </Section>
      )}
      {curO && (
        <Section title={`開口: ${curO.name}`}>
          <button className="link" onClick={() => { set((dd) => { const gg = ensureGirt(dd); gg.openings = gg.openings.filter((x) => x.id !== curO.id); }); setSel(null); }}>Xoá 開口 này</button>
        </Section>
      )}
      <Section title={`${pl?.name ?? ''}: ${items.length} 胴縁 · ${opens.length} 開口`}>
        <table className="table compact moya-list">
          <thead><tr><th>部材</th><th>種類</th><th>位置</th><th /></tr></thead>
          <tbody>
            {items.map((it) => {
              const vert = Math.abs(it.b[0] - it.a[0]) < 1;
              return (
                <tr key={it.id} className={it.id === sel ? 'sel' : ''} onClick={() => setSel(it.id === sel ? null : it.id)}>
                  <td><b>{it.member}</b></td>
                  <td>{vert ? '縦' : Math.abs(it.b[1] - it.a[1]) > 1 ? '登り' : '横'}</td>
                  <td>{vert ? `s=${Math.round(it.a[0])}` : `z=${Math.round(it.a[1])}`}</td>
                  <td><button className="link" onClick={(e) => { e.stopPropagation(); set((dd) => { const gg = ensureGirt(dd); gg.items = gg.items.filter((x) => x.id !== it.id); }); }}>Xoá</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
    </>
  );
}


export default function GirtTab(props: GirtTabProps) {
  const { p, set, sub, view3d, setView3d } = props;
  return (
    <>
      <div className="row-gap" style={{ justifyContent: 'flex-end', marginBottom: 6 }}>
        <div className="seg" style={{ margin: 0 }}>
          <button className={!view3d ? 'on' : ''} onClick={() => setView3d(false)}>胴縁割付図</button>
          <button className={view3d ? 'on' : ''} onClick={() => setView3d(true)}>3D</button>
        </div>
      </div>
      {!p.girt ? (
        <Section title="胴縁">
          <p>Tạo 胴縁マスター mặc định (部材 D1, D2, D3, KP · 開口 AW-1…SS-1). ピース và 部品 chỉ được tạo khi bạn bấm 作成 hoặc nhập từ mẫu / tab 母屋.</p>
          <button className="primary" onClick={() => set((d) => void ensureGirt(d))}>胴縁マスター を作成</button>
        </Section>
      ) : (
        <>
          {sub === 'master' && <MasterPanel {...props} />}
          {sub === 'plane' && <PlanePanel {...props} />}
          {sub === 'input' && <InputPanel {...props} />}
          {PC_SUBS[sub] && (
            <PiecePanel p={props.p} set={props.set} members={props.members} kind={PC_SUBS[sub]} which="girt" draft={props.pcDraft} setDraft={props.setPcDraft} sel={props.pcSel} setSel={props.setPcSel}>
            </PiecePanel>
          )}
        </>
      )}
    </>
  );
}
