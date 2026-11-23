// Tab 二次部材 (REAL4 Step20–24): マスター · スリーブ · かさ上げ材 · デッキ · 仮設金物 · スタッド
import { useMemo, useState } from 'react';
import { Field, Num, Section, Sel, TabProps } from '../ui';
import { gridPositions, uid } from '../model';
import {
  BeamInfo, ColInfo, DECK_FIELDS, KASA_FIELDS, SLEEVE_FIELDS, STUD_FIELDS, Sub2Data, TEMP_FIELDS, TempItem,
  beamInfos, colInfos, defaultSub2, deckRect, ensureSub2, lineHits, sub2Of,
} from '../sub2';
import { MasterEditor, MasterTab, Rec } from './MasterEditor';

const MTABS: MasterTab[] = [
  { k: 'sleeves', label: 'スリーブ', fields: SLEEVE_FIELDS, name: '部材名', prefix: 'φ', col: (r) => `${String(r.v.type).replace(/^\d+-/, '')} ${r.v.dia}` },
  { k: 'kasa', label: 'かさ上げ材', fields: KASA_FIELDS, name: '部材名', prefix: 'C' },
  { k: 'decks', label: 'デッキ', fields: DECK_FIELDS, name: '部材名', prefix: 'ﾃﾞｯｷ', col: (r) => `${String(r.v.type).replace(/^\d+-/, '')} ${r.v.size}` },
  { k: 'temps', label: '仮設金物', fields: TEMP_FIELDS, name: '部材名', prefix: 'T', col: (r) => `${String(r.v.type).replace(/^\d+-/, '')} ${String(r.v.style ?? '').replace(/^\d+-/, '')}` },
  { k: 'studs', label: 'スタッド', fields: STUD_FIELDS, name: '部材名', prefix: 'STD', col: (r) => `${r.v.bolt} ${r.v.rows}行×${r.v.cols}列` },
];
type MK = 'sleeves' | 'kasa' | 'decks' | 'temps' | 'studs';

function MasterPanel({ p, set }: TabProps) {
  const s = sub2Of(p), def = defaultSub2();
  const keys: MK[] = ['sleeves', 'kasa', 'decks', 'temps', 'studs'];
  return (
    <MasterEditor
      data={Object.fromEntries(keys.map((k) => [k, s[k]]))}
      tabs={MTABS}
      defaults={Object.fromEntries(keys.map((k) => [k, def[k]]))}
      edit={(fn) => set((d) => { const m = ensureSub2(d); const o: Record<string, Rec[]> = Object.fromEntries(keys.map((k) => [k, m[k]])); fn(o); for (const k of keys) m[k] = o[k]; })}
    />
  );
}

// ---------- tiện ích chọn ----------
const opt = (xs: string[]) => xs.map((x) => ({ value: x, label: x }));
function LevelSel({ p, value, onChange }: { p: TabProps['p']; value: string; onChange: (v: string) => void }) {
  return (
    <div className="chips">
      {p.levels.map((l) => (
        <label key={l.id} className={`chip ${l.id === value ? 'on' : ''}`} onClick={() => onChange(l.id)}>{l.name}</label>
      ))}
    </div>
  );
}
function PickList<T extends { id: string; label: string }>({ items, sel, setSel, extra }: { items: T[]; sel: Set<string>; setSel: (s: Set<string>) => void; extra?: { label: string; f: (x: T) => boolean }[] }) {
  return (
    <>
      <div className="row-gap small" style={{ flexWrap: 'wrap', margin: '4px 0' }}>
        <button onClick={() => setSel(new Set(items.map((x) => x.id)))}>Tất cả</button>
        {extra?.map((e) => <button key={e.label} onClick={() => setSel(new Set(items.filter(e.f).map((x) => x.id)))}>{e.label}</button>)}
        <button onClick={() => setSel(new Set())}>Bỏ chọn</button>
        <span className="muted">{sel.size}/{items.length}</span>
      </div>
      <div className="chips pick-list">
        {items.map((x) => (
          <label key={x.id} className={`chip ${sel.has(x.id) ? 'on' : ''}`} onClick={() => { const n = new Set(sel); if (n.has(x.id)) n.delete(x.id); else n.add(x.id); setSel(n); }}>{x.label}</label>
        ))}
        {!items.length && <span className="muted small">— không có —</span>}
      </div>
    </>
  );
}
const beamDirs = [{ label: 'theo X', f: (b: BeamInfo) => Math.abs(b.u[0]) > 0.9 }, { label: 'theo Y', f: (b: BeamInfo) => Math.abs(b.u[1]) > 0.9 }, { label: '大梁', f: (b: BeamInfo) => !b.sub }];
function Placed({ title, rows, onDel }: { title: string; rows: { id: string; a: string; b: string }[]; onDel: (id: string) => void }) {
  return (
    <Section title={`${title} (${rows.length})`}>
      <table className="table compact moya-list">
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}><td><b>{r.a}</b></td><td>{r.b}</td><td><button className="link" onClick={() => onDel(r.id)}>Xoá</button></td></tr>
          ))}
        </tbody>
      </table>
      {rows.length > 0 && <button className="link" onClick={() => rows.forEach((r) => onDel(r.id))}>Xoá tất cả</button>}
    </Section>
  );
}
const names = (xs: Rec[], f?: (r: Rec) => boolean) => xs.filter((x) => !f || f(x)).map((x) => ({ value: x.name, label: x.name }));
const useInfos = (p: TabProps['p'], members: TabProps['members']) => {
  const bl = useMemo(() => beamInfos(p, members), [p, members]);
  const cl = useMemo(() => colInfos(p, members), [p, members]);
  return { bl, cl, bm: new Map(bl.map((b) => [b.id, b])), cm: new Map(cl.map((c) => [c.id, c])) };
};
const lvAbove = (p: TabProps['p']) => p.levels[1]?.id ?? p.levels[0]?.id ?? '';

// ---------- Step20 スリーブ ----------
function SleevePanel({ p, set, members }: TabProps) {
  const s = sub2Of(p);
  const { bl, bm } = useInfos(p, members);
  const [lv, setLv] = useState(lvAbove(p));
  const [master, setMaster] = useState(s.sleeves[0]?.name ?? '');
  const [base, setBase] = useState('1-(鉄骨上)ﾊﾟﾗﾒｰﾀｰ参照');
  const [ud, setUd] = useState(-200);
  const [lenMode, setLenMode] = useState('梁フランジ幅と同じ');
  const [grid, setGrid] = useState(`gy:${p.gridsY[0]?.id ?? ''}`);
  const [dist, setDist] = useState(2000);
  const hits = lineHits(p, bl, lv, grid, dist);
  const [off, setOff] = useState<Set<string>>(new Set());
  const items = hits.map((h) => ({ id: h.beam.id, label: h.beam.label }));
  const sel = new Set(items.map((x) => x.id).filter((x) => !off.has(x)));
  const ok = () => {
    set((d) => { const g = ensureSub2(d); for (const h of hits) if (sel.has(h.beam.id)) g.sleeveItems.push({ id: uid('sl'), beam: h.beam.id, q: h.q, master, base, ud, lenMode, ecc: '<無>' }); });
    setOff(new Set());
  };
  const gridOpts = [...p.gridsX.map((x) => ({ value: `gx:${x.id}`, label: `${x.name} 通り` })), ...p.gridsY.map((y) => ({ value: `gy:${y.id}`, label: `${y.name} 通り` }))];
  return (
    <>
      <Section title="スリーブ – 配置">
        <LevelSel p={p} value={lv} onChange={setLv} />
        <table className="table kv prop-table">
          <tbody>
            <tr><td>部材名</td><td><Sel value={master} onChange={setMaster} options={names(s.sleeves)} /></td></tr>
            <tr><td>下がり入力基準</td><td><Sel value={base} onChange={setBase} options={opt(['1-(鉄骨上)ﾊﾟﾗﾒｰﾀｰ参照', '2-(梁芯)'])} /></td></tr>
            <tr><td>基準からの上下</td><td><Num signed value={ud} onChange={setUd} /></td></tr>
            <tr><td>S造 ｽﾘｰﾌﾞ管長さ</td><td><Sel value={lenMode} onChange={setLenMode} options={opt(['梁フランジ幅と同じ', '梁ウェブ厚+50'])} /></td></tr>
            <tr><td>偏芯</td><td>&lt;無&gt;</td></tr>
            <tr><td>補強板取り付け方法</td><td>&lt;自動設定&gt;</td></tr>
          </tbody>
        </table>
        <div className="grid2">
          <Field label="補助線: 通り"><Sel value={grid} onChange={setGrid} options={gridOpts} /></Field>
          <Field label="通りからの距離 (mm)"><Num signed value={dist} onChange={setDist} /></Field>
        </div>
        <p className="muted small">Dầm cắt qua 補助線 (bấm để bỏ chọn, vd 小梁 không cần スリーブ):</p>
        <PickList items={items} sel={sel} setSel={(n) => setOff(new Set(items.map((x) => x.id).filter((x) => !n.has(x))))} />
        <button className="primary" disabled={!sel.size || !master} onClick={ok}>OK – 配置 {sel.size} スリーブ</button>
      </Section>
      <Placed title="スリーブ đã đặt" rows={s.sleeveItems.map((x) => ({ id: x.id, a: x.master, b: `${bm.get(x.beam)?.label ?? '?'} · ${x.ud}` }))} onDel={(id) => set((d) => { const g = ensureSub2(d); g.sleeveItems = g.sleeveItems.filter((x) => x.id !== id); })} />
    </>
  );
}

// ---------- Step21 かさ上げ材 ----------
function KasaPanel({ p, set, members }: TabProps) {
  const s = sub2Of(p);
  const { bl, bm } = useInfos(p, members);
  const [lv, setLv] = useState(lvAbove(p));
  const [master, setMaster] = useState(s.kasa[0]?.name ?? '');
  const [ud, setUd] = useState(0);
  const [side, setSide] = useState('3-下側');
  const [dir, setDir] = useState('2-横下');
  const [ext, setExt] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const items = bl.filter((b) => b.level === lv);
  const ok = () => {
    set((d) => {
      const g = ensureSub2(d);
      g.kasaItems = g.kasaItems.filter((x) => !sel.has(x.beam));
      for (const id of sel) g.kasaItems.push({ id: uid('ks'), beam: id, master, ud, side, dir, extL: ext, extR: ext });
    });
    setSel(new Set());
  };
  return (
    <>
      <Section title="かさ上げ材 – 配置">
        <LevelSel p={p} value={lv} onChange={(v) => { setLv(v); setSel(new Set()); }} />
        <table className="table kv prop-table">
          <tbody>
            <tr><td>基準指定</td><td>接続データ</td></tr>
            <tr><td>部材名</td><td><Sel value={master} onChange={setMaster} options={names(s.kasa)} /></td></tr>
            <tr><td>タイプ</td><td>1-かさ上げ材</td></tr>
            <tr><td>上下</td><td><Num signed value={ud} onChange={setUd} /></td></tr>
            <tr><td>配置基準(側面)</td><td><Sel value={side} onChange={setSide} options={opt(['1-部材芯', '2-上側', '3-下側'])} /></td></tr>
            <tr><td>接続鋼材部位</td><td>1-上フランジ</td></tr>
            <tr><td>部材向き</td><td><Sel value={dir} onChange={setDir} options={opt(['1-横上', '2-横下'])} /></td></tr>
            <tr><td>接続情報 左/右 すきま</td><td>自動 (マスター: 柱 / ｽﾌﾟﾗｲｽ)</td></tr>
            <tr><td>接続情報 左/右 延長量</td><td><Num signed value={ext} onChange={setExt} /></td></tr>
          </tbody>
        </table>
        <p className="muted small">Chọn dầm (かさ上げ材 tự tránh ｽﾌﾟﾗｲｽ theo マスター):</p>
        <PickList items={items} sel={sel} setSel={setSel} extra={beamDirs} />
        <button className="primary" disabled={!sel.size || !master} onClick={ok}>OK – 配置 {sel.size} 本</button>
      </Section>
      <Placed title="かさ上げ材 đã đặt" rows={s.kasaItems.map((x) => ({ id: x.id, a: x.master, b: bm.get(x.beam)?.label ?? '?' }))} onDel={(id) => set((d) => { const g = ensureSub2(d); g.kasaItems = g.kasaItems.filter((x) => x.id !== id); })} />
    </>
  );
}

// ---------- Step22 デッキ ----------
function DeckPanel({ p, set, members }: TabProps) {
  const s = sub2Of(p);
  const { bl } = useInfos(p, members);
  const [lv, setLv] = useState(lvAbove(p));
  const pls = s.decks.filter((x) => String(x.v.type).includes('プレート'));
  const [master, setMaster] = useState(pls[0]?.name ?? '');
  const [dir, setDir] = useState<'x' | 'y'>('x');
  const [x1, setX1] = useState(p.gridsX[0]?.id ?? ''), [x2, setX2] = useState(p.gridsX[p.gridsX.length - 1]?.id ?? '');
  const [y1, setY1] = useState(p.gridsY[0]?.id ?? ''), [y2, setY2] = useState(p.gridsY[1]?.id ?? '');
  const [autoIn, setAutoIn] = useState(true);
  const xo = p.gridsX.map((x) => ({ value: x.id, label: x.name })), yo = p.gridsY.map((y) => ({ value: y.id, label: y.name }));
  const gN = (id: string) => [...p.gridsX, ...p.gridsY].find((g) => g.id === id)?.name ?? '?';
  const addArea = () => set((d) => void ensureSub2(d).deckAreas.push({ id: uid('dk'), level: lv, x1, x2, y1, y2, dir, master, inset: [0, 0, 0, 0], autoIn }));
  // デッキ受け
  const [area, setArea] = useState('');
  const [target, setTarget] = useState('継手部・仕口部');
  const [range, setRange] = useState('内側のみ');
  const [split, setSplit] = useState(s.decks.find((x) => String(x.v.type).includes('継手'))?.name ?? '');
  const [shik, setShik] = useState(s.decks.find((x) => String(x.v.type).includes('仕口'))?.name ?? '');
  const [skipKasa, setSkipKasa] = useState(true);
  const areaId = s.deckAreas.some((a) => a.id === area) ? area : s.deckAreas[0]?.id ?? '';
  const lvName = (id: string) => p.levels.find((l) => l.id === id)?.name ?? '?';
  const upd = (id: string, fn: (a: Sub2Data['deckAreas'][number]) => void) => set((d) => { const a = ensureSub2(d).deckAreas.find((x) => x.id === id); if (a) fn(a); });
  return (
    <>
      <Section title="① デッキプレート – 配置">
        <LevelSel p={p} value={lv} onChange={setLv} />
        <table className="table kv prop-table">
          <tbody>
            <tr><td>部材名</td><td><Sel value={master} onChange={setMaster} options={names(pls)} /></td></tr>
            <tr><td>敷き込み方向</td><td><Sel value={dir} onChange={(v) => setDir(v as 'x' | 'y')} options={[{ value: 'x', label: '1-横 (theo X)' }, { value: 'y', label: '2-縦 (theo Y)' }]} /></td></tr>
            <tr><td>範囲 X</td><td><div className="mrow-pair"><Sel value={x1} onChange={setX1} options={xo} /><Sel value={x2} onChange={setX2} options={xo} /></div></td></tr>
            <tr><td>範囲 Y</td><td><div className="mrow-pair"><Sel value={y1} onChange={setY1} options={yo} /><Sel value={y2} onChange={setY2} options={yo} /></div></td></tr>
          </tbody>
        </table>
        <label className="check"><input type="checkbox" checked={autoIn} onChange={(e) => setAutoIn(e.target.checked)} /> 範囲 = 梁外面より内側 (tự lùi vào mép trong dầm biên)</label>
        <button className="primary" disabled={!master} onClick={addArea}>OK – デッキプレート</button>
      </Section>
      <Section title={`デッキプレート範囲 (${s.deckAreas.length}) – 範囲修正`}>
        <table className="table compact moya-list">
          <thead><tr><th>範囲</th><th>左 / 右 / 下 / 上 (mm)</th><th /></tr></thead>
          <tbody>
            {s.deckAreas.map((a) => {
              const R = deckRect(p, a, bl);
              return (
                <tr key={a.id} className={a.id === areaId ? 'sel' : ''} onClick={() => setArea(a.id)}>
                  <td><b>{lvName(a.level)}</b> {gN(a.x1)}–{gN(a.x2)} / {gN(a.y1)}–{gN(a.y2)}<div className="muted small">{R ? `${Math.round(R.x1 - R.x0)}×${Math.round(R.y1 - R.y0)}` : '⚠'}</div></td>
                  <td>
                    <div className="inset4">
                      {[0, 1, 2, 3].map((i) => <Num key={i} signed value={a.inset[i]} onChange={(v) => upd(a.id, (x) => { x.inset[i] = v; })} />)}
                    </div>
                    <label className="check small"><input type="checkbox" checked={a.autoIn} onChange={(e) => upd(a.id, (x) => { x.autoIn = e.target.checked; })} /> 梁内面</label>
                  </td>
                  <td><button className="link" onClick={(e) => { e.stopPropagation(); set((d) => { const g = ensureSub2(d); g.deckAreas = g.deckAreas.filter((x) => x.id !== a.id); g.deckRecv = g.deckRecv.filter((x) => x.area !== a.id); }); }}>Xoá</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>
      <Section title="② デッキ受け – 配置">
        <table className="table kv prop-table">
          <tbody>
            <tr><td>デッキ範囲</td><td><Sel value={areaId} onChange={setArea} options={s.deckAreas.map((a) => ({ value: a.id, label: `${lvName(a.level)} ${gN(a.x1)}–${gN(a.x2)} / ${gN(a.y1)}–${gN(a.y2)}` }))} /></td></tr>
            <tr><td>配置対象</td><td><Sel value={target} onChange={setTarget} options={opt(['継手部・仕口部', '継手部', '仕口部'])} /></td></tr>
            <tr><td>配置範囲</td><td><Sel value={range} onChange={setRange} options={opt(['内側のみ', '内側・外側'])} /></td></tr>
            <tr><td>部材名（継手側）</td><td><Sel value={split} onChange={setSplit} options={names(s.decks, (x) => String(x.v.type).includes('継手'))} /></td></tr>
            <tr><td>部材名（仕口側）</td><td><Sel value={shik} onChange={setShik} options={names(s.decks, (x) => String(x.v.type).includes('仕口'))} /></td></tr>
          </tbody>
        </table>
        <label className="check"><input type="checkbox" checked={skipKasa} onChange={(e) => setSkipKasa(e.target.checked)} /> Bỏ デッキ受け tại 継手 của dầm có かさ上げ材</label>
        <button className="primary" disabled={!areaId} onClick={() => set((d) => { const g = ensureSub2(d); g.deckRecv = g.deckRecv.filter((x) => x.area !== areaId); g.deckRecv.push({ id: uid('dr'), area: areaId, target, range, split, shik, skipKasa }); })}>OK – デッキ受け</button>
      </Section>
      <Placed title="デッキ受け đã đặt" rows={s.deckRecv.map((x) => ({ id: x.id, a: `${x.split} / ${x.shik}`, b: `${x.target} · ${x.range}` }))} onDel={(id) => set((d) => { const g = ensureSub2(d); g.deckRecv = g.deckRecv.filter((x) => x.id !== id); })} />
    </>
  );
}

// ---------- Step23 仮設金物 ----------
const TMODES: { k: TempItem['kind']; label: string; type: string }[] = [
  { k: 'net', label: 'ネットフック', type: 'ネット' },
  { k: 'bhang', label: '梁吊ピース', type: '吊ピース' },
  { k: 'chang', label: '柱吊ピース', type: '吊ピース' },
  { k: 'hole', label: '吊穴', type: '吊穴' },
  { k: 'stop', label: '梁下がり止め', type: '下がり' },
  { k: 'rope', label: '親綱ピース', type: '親綱' },
];
const FACES = [{ value: '+x', label: '右 (X+)' }, { value: '-x', label: '左 (X−)' }, { value: '+y', label: '上 (Y+)' }, { value: '-y', label: '下 (Y−)' }];
function TempPanel({ p, set, members }: TabProps) {
  const s = sub2Of(p);
  const { bl, cl, bm, cm } = useInfos(p, members);
  const [mode, setMode] = useState<TempItem['kind']>('net');
  const M = TMODES.find((x) => x.k === mode)!;
  const ms = s.temps.filter((x) => String(x.v.type).includes(M.type));
  const [mSel, setMaster] = useState('');
  const master = ms.some((x) => x.name === mSel) ? mSel : ms[0]?.name ?? '';
  const [lv, setLv] = useState(p.levels[p.levels.length - 1]?.id ?? '');
  const [optv, setOpt] = useState('2-水平');
  const [style, setStyle] = useState('3-左右');
  const [target, setTarget] = useState('大梁');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [c1, setC1] = useState<[string, string]>([p.gridsX[0]?.id ?? '', p.gridsY[0]?.id ?? '']);
  const [c2, setC2] = useState<[string, string]>([p.gridsX[p.gridsX.length - 1]?.id ?? '', p.gridsY[p.gridsY.length - 1]?.id ?? '']);
  const [ropeLv, setRopeLv] = useState(p.levels[0]?.id ?? '');
  const [ropeH, setRopeH] = useState(1100);
  const [face, setFace] = useState('-y');
  const xo = p.gridsX.map((x) => ({ value: x.id, label: x.name })), yo = p.gridsY.map((y) => ({ value: y.id, label: y.name }));
  const lvZ = p.levels.find((l) => l.id === lv)?.elevation ?? 0;
  const beamsLv = bl.filter((b) => b.level === lv && (mode !== 'bhang' || target === 'すべて' || (target === '大梁' ? !b.sub : b.sub)));
  const colsTop = cl.filter((c) => Math.abs(c.z1 - lvZ) < 400);
  const colsAt = cl.filter((c) => c.z0 < lvZ && c.z1 > lvZ - 200);
  // 梁下がり止め: cặp cột × dầm tại tầng
  const pairs = useMemo(() => {
    const out: { id: string; label: string; c: ColInfo; b: BeamInfo }[] = [];
    for (const c of colsAt) for (const b of bl) {
      if (b.level !== lv) continue;
      const e0 = Math.hypot(b.o[0] - c.c[0], b.o[1] - c.c[1]), e1 = Math.hypot(b.o[0] + b.u[0] * b.L - c.c[0], b.o[1] + b.u[1] * b.L - c.c[1]);
      if (Math.min(e0, e1) < Math.max(c.sec.b, c.sec.h)) out.push({ id: `${c.id}|${b.id}`, label: `${c.label} → ${b.name} ${Math.abs(b.u[0]) > 0.9 ? 'X' : 'Y'}方向`, c, b });
    }
    return out;
  }, [colsAt, bl, lv]); // eslint-disable-line react-hooks/exhaustive-deps
  const list: { id: string; label: string }[] = mode === 'bhang' || mode === 'hole' ? beamsLv : mode === 'chang' ? colsTop : mode === 'stop' ? pairs : mode === 'rope' ? cl : [];
  const ok = () => {
    set((d) => {
      const g = ensureSub2(d);
      for (const id of mode === 'net' ? ['net'] : sel) {
        const it: TempItem = { id: uid('tp'), kind: mode, master, ref: id, opt: '' };
        if (mode === 'net') { it.ref = netRef(); it.opt = lv; }
        if (mode === 'bhang') it.opt = optv;
        if (mode === 'chang') it.opt = style;
        if (mode === 'stop') { const [c, b] = id.split('|'); it.ref = c; it.ref2 = b; }
        if (mode === 'rope') { it.opt = ropeLv; it.h = ropeH; it.ref2 = face; }
        g.tempItems.push(it);
      }
    });
    setSel(new Set());
  };
  const netRef = () => {
    const GX = gridPositions(p.gridsX), GY = gridPositions(p.gridsY);
    const gx = (id: string) => GX.get(id) ?? 0, gy = (id: string) => GY.get(id) ?? 0;
    return [gx(c1[0]), gy(c1[1]), gx(c2[0]), gy(c2[1])].join(',');
  };
  const kindLabel = (k: TempItem['kind']) => TMODES.find((x) => x.k === k)?.label ?? k;
  const where = (it: TempItem) => (it.kind === 'net' ? p.levels.find((l) => l.id === it.opt)?.name ?? '' : it.kind === 'bhang' || it.kind === 'hole' ? bm.get(it.ref)?.label ?? '?' : `${cm.get(it.ref)?.label ?? '?'}${it.ref2 && it.kind === 'stop' ? ' → ' + (bm.get(it.ref2)?.name ?? '') : it.kind === 'rope' ? ` ${it.ref2} +${it.h}` : ''}`);
  return (
    <>
      <div className="seg">
        {TMODES.map((m) => <button key={m.k} className={mode === m.k ? 'on' : ''} onClick={() => { setMode(m.k); setSel(new Set()); }}>{m.label}</button>)}
      </div>
      <Section title={`${M.label} – 配置`}>
        {mode !== 'rope' && <LevelSel p={p} value={lv} onChange={(v) => { setLv(v); setSel(new Set()); }} />}
        <table className="table kv prop-table">
          <tbody>
            <tr><td>部材名</td><td><Sel value={master} onChange={setMaster} options={names(ms)} /></td></tr>
            {mode === 'bhang' && <tr><td>配置対象</td><td><Sel value={target} onChange={setTarget} options={opt(['大梁', '小梁', 'すべて'])} /></td></tr>}
            {mode === 'bhang' && <tr><td>ピース向き</td><td><Sel value={optv} onChange={setOpt} options={opt(['1-垂直', '2-水平'])} /></td></tr>}
            {mode === 'chang' && <tr><td>配置スタイル</td><td><Sel value={style} onChange={setStyle} options={opt(['1-片側', '2-前後', '3-左右'])} /></td></tr>}
            {mode === 'net' && <tr><td>対角 ①</td><td><div className="mrow-pair"><Sel value={c1[0]} onChange={(v) => setC1([v, c1[1]])} options={xo} /><Sel value={c1[1]} onChange={(v) => setC1([c1[0], v])} options={yo} /></div></td></tr>}
            {mode === 'net' && <tr><td>対角 ②</td><td><div className="mrow-pair"><Sel value={c2[0]} onChange={(v) => setC2([v, c2[1]])} options={xo} /><Sel value={c2[1]} onChange={(v) => setC2([c2[0], v])} options={yo} /></div></td></tr>}
            {mode === 'rope' && <tr><td>基準 階</td><td><Sel value={ropeLv} onChange={setRopeLv} options={p.levels.map((l) => ({ value: l.id, label: l.name }))} /></td></tr>}
            {mode === 'rope' && <tr><td>階からの高さ</td><td><Num value={ropeH} onChange={setRopeH} /></td></tr>}
            {mode === 'rope' && <tr><td>取付面</td><td><Sel value={face} onChange={setFace} options={FACES} /></td></tr>}
          </tbody>
        </table>
        {mode === 'net' && <p className="muted small">ネットフック đặt ở mặt ngoài các dầm biên của vùng ①–②, bước theo 配置ピッチ của マスター.</p>}
        {mode === 'hole' && <p className="muted small">吊穴 chỉ đặt trên dầm H / BH (2 lỗ / dầm, cách đầu 端部距離).</p>}
        {mode !== 'net' && <PickList items={list} sel={sel} setSel={setSel} extra={mode === 'bhang' || mode === 'hole' ? (beamDirs as never) : undefined} />}
        <button className="primary" disabled={!master || (mode !== 'net' && !sel.size)} onClick={ok}>OK – 配置</button>
      </Section>
      <Placed title="仮設金物 đã đặt" rows={s.tempItems.map((x) => ({ id: x.id, a: `${kindLabel(x.kind)}: ${x.master}`, b: where(x) }))} onDel={(id) => set((d) => { const g = ensureSub2(d); g.tempItems = g.tempItems.filter((x) => x.id !== id); })} />
    </>
  );
}
// ---------- Step24 スタッド ----------
function StudPanel({ p, set, members }: TabProps) {
  const s = sub2Of(p);
  const { cl, cm } = useInfos(p, members);
  const [master, setMaster] = useState(s.studs[0]?.name ?? '');
  const [first, setFirst] = useState('マスター参照');
  const [weld, setWeld] = useState('1-工場溶接');
  const [del, setDel] = useState<[boolean, boolean, boolean, boolean]>([false, false, false, true]);
  const [upTo, setUpTo] = useState(p.levels[1]?.id ?? '');
  const [grid, setGrid] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const zMax = p.levels.find((l) => l.id === upTo)?.elevation;
  const items = cl.filter((c) => (!grid || p.columns.find((x) => x.id === c.id)?.[grid.startsWith('gx:') ? 'x' : 'y'] === grid.slice(3)) && (zMax == null || c.z0 < zMax));
  const ok = () => {
    set((d) => { const g = ensureSub2(d); g.studItems = g.studItems.filter((x) => !sel.has(x.col)); for (const id of sel) g.studItems.push({ id: uid('sd'), col: id, master, first, weld, del, zMax }); });
    setSel(new Set());
  };
  return (
    <>
      <Section title="スタッド – 配置">
        <table className="table kv prop-table">
          <tbody>
            <tr><td>部材名</td><td><Sel value={master} onChange={setMaster} options={names(s.studs)} /></td></tr>
            <tr><td>第一間隔</td><td><Sel value={first} onChange={setFirst} options={opt(['マスター参照', '50', '100', '150'])} /></td></tr>
            <tr><td>溶接場所</td><td><Sel value={weld} onChange={setWeld} options={opt(['1-工場溶接', '2-現場溶接'])} /></td></tr>
            {[0, 1, 2, 3].map((i) => (
              <tr key={i}><td>面番号削除 {i + 1} <span className="muted small">{['(Y−)', '(X+)', '(Y+)', '(X−)'][i]}</span></td><td><Sel value={del[i] ? '2-する' : '1-しない'} onChange={(v) => { const n = [...del] as typeof del; n[i] = v.startsWith('2'); setDel(n); }} options={opt(['1-しない', '2-する'])} /></td></tr>
            ))}
            <tr><td>範囲 (đến tầng)</td><td><Sel value={upTo} onChange={setUpTo} options={p.levels.map((l) => ({ value: l.id, label: `${l.name} から下` }))} /></td></tr>
            <tr><td>通り</td><td><Sel value={grid} onChange={setGrid} options={[{ value: '', label: 'Tất cả' }, ...p.gridsX.map((x) => ({ value: `gx:${x.id}`, label: `${x.name} 通り` })), ...p.gridsY.map((y) => ({ value: `gy:${y.id}`, label: `${y.name} 通り` }))]} /></td></tr>
          </tbody>
        </table>
        <PickList items={items} sel={sel} setSel={setSel} />
        <button className="primary" disabled={!sel.size || !master} onClick={ok}>OK – スタッド {sel.size} 柱</button>
      </Section>
      <Placed title="スタッド đã đặt" rows={s.studItems.map((x) => ({ id: x.id, a: x.master, b: `${cm.get(x.col)?.label ?? '?'} · 削除 ${x.del.map((v, i) => (v ? i + 1 : '')).join('') || '–'}` }))} onDel={(id) => set((d) => { const g = ensureSub2(d); g.studItems = g.studItems.filter((x) => x.id !== id); })} />
    </>
  );
}

export const SUB2_SUBS = ['master', 'sleeve', 'kasa', 'deck', 'temp', 'stud'];
export default function Sub2Tab(props: TabProps) {
  const { p, set, sub, members } = props;
  const cnt = members.filter((m) => m.kind === 'misc');
  return (
    <>
      {!p.sub2 ? (
        <Section title="二次部材">
          <p>Tạo 二次部材マスター mặc định (スリーブ φ200/φ250 · かさ上げ材 C100 · ﾃﾞｯｷS/C/PL · ネットフック, 吊ピース, 吊穴, 下がり止め, 親綱ピース · スタッド STD1) để bắt đầu.</p>
          <button className="primary" onClick={() => set((d) => void ensureSub2(d))}>二次部材マスター を作成</button>
        </Section>
      ) : (
        <>
          {sub === 'master' && <MasterPanel {...props} />}
          {sub === 'sleeve' && <SleevePanel {...props} />}
          {sub === 'kasa' && <KasaPanel {...props} />}
          {sub === 'deck' && <DeckPanel {...props} />}
          {sub === 'temp' && <TempPanel {...props} />}
          {sub === 'stud' && <StudPanel {...props} />}
          <p className="muted small">二次部材: {cnt.length} chi tiết · {cnt.reduce((a, m) => a + m.weight, 0).toFixed(1)} kg</p>
        </>
      )}
    </>
  );
}
