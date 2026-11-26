import { columnIssue } from '../build';
import React, { useEffect, useMemo, useState } from 'react';
import type { PlateEditReq } from '../PlateEditor';
import { gridPositions, SUB_SLOPE_LABEL } from '../model';
import type { SubSlope } from '../model';
import { WORKPLANE_DIR_LABEL, WORKPLANE_KIND_LABEL, WorkPlaneDir, WorkPlaneKind, WorkPlaneOpt } from '../model';
import type { Vec3 } from '../model';
import type { LineInput, LineTarget, RefLine } from '../lineInput';
import { batchDs } from '../lineInput';
import { nearestLevel as nearestLv } from '../input';
import { memberKey, planeBasis, planeNormal } from '../workplane';
import JointTab, { assignJoint, assignJointByName, assignBaseByName, NameCombo } from './JointTab';
import KiseihinLib from './KiseihinLib';
import ShikuchiPanel from './ShikuchiTab';
import DataPanel from './DataPanel';
import { BRACE_SHAPES, braceGusset } from '../braceGusset';
import { deleteSources, memberSpl } from '../editOps';
import { jointGap } from '../jointGeom';
import { gplPlateInit } from '../jointGeom';
import { diaphragmOverhang } from '../standards';
import { FULL_BRACE, braceCode, braceLabel, braceMaterial, braceNote, braceRow } from '../kiseihin';
import { JIS_SECTIONS, findJis } from '../jis';
import SecCodeInput from '../SecCodeInput';
import JointPreviewWin, { PreviewReq } from '../JointPreview';
import { Dim } from '../JointShape';
import { defaultDiaphragm, Beam, uid, Project, ANCHOR_LABEL, MasterKind, MasterItem, MasterRole, MasterType, MASTER_TYPES, MASTER_TYPE_LABEL, TYPE_KIND, TYPE_ROLE, masterType, lrFreeOf, isRequiredJoint, jointTypeName, beamJointPrefix, nextJointName, ensureMaster, masterConflicts, anchorLocal, JointPos, JointType, JOINT_POS_LABEL, JOINT_TYPE_LABEL, jointPositions, BeamAlign, BEAM_ALIGN_LABEL, BeamDir, BEAM_DIR_LABEL, BeamEnd, BEAM_END_LABEL, beamEnd, JointTarget, BeamPlace, BEAM_PLACE_LABEL, BeamVRef, BEAM_VREF_LABEL, BraceInst, BraceRef, BRACE_REF_LABEL } from '../model';
import { Field, Num, Sel, Section, TabProps, Text } from '../ui';
import { BeamInput, BraceInput, ColumnInput, INPUT_KIND_LABEL, InputKind, KneeInput, Pending, PickState, View2DState, sectionOutline, placeOutline } from '../input';

export interface MainTabProps extends TabProps {
  colIn: ColumnInput;
  setColIn: (c: ColumnInput) => void;
  v2d: View2DState;
  setV2d: (v: View2DState) => void;
  beamIn: BeamInput;
  setBeamIn: (b: BeamInput) => void;
  braceIn: BraceInput;
  setBraceIn: (b: BraceInput) => void;
  pending: Pending | null;
  setPending: (p: Pending | null) => void;
  confirmPending: () => void;
  /** điểm liên kết đang chọn ở tab 継手: `${id}|${pos}` */
  jp: string | null;
  setJp: (k: string | null) => void;
  plateEdit: PlateEditReq | null;
  setPlateEdit: (r: PlateEditReq | null) => void;
  auxEdit: string | null;
  setPlaneDraft?: (b: { o: Vec3; u: Vec3; v: Vec3 } | null) => void;
  planeWin?: boolean;
  setPlaneWin?: (v: boolean) => void;
  checkClash?: () => void;
  lineIn?: LineInput;
  setLineIn?: (li: LineInput) => void;
  refs?: RefLine[];
  lineErr?: string;
  brPick?: { ids: string[]; names: string[]; q1?: Vec3; n1?: string };
  setBrPick?: (v: { ids: string[]; names: string[] }) => void;
  setAuxEdit: (id: string | null) => void;
  kneeIn: KneeInput;
  setKneeIn: (k: KneeInput) => void;
  pk: PickState;
  setPk: (s: PickState) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
}

const gOpts = (p: Project, axis: 'x' | 'y') => (axis === 'x' ? p.gridsX : p.gridsY).map((g) => ({ value: g.id, label: g.name }));
const lOpts = (p: Project) => [...p.levels].sort((a, b) => a.elevation - b.elevation).map((l) => ({ value: l.id, label: `${l.name} (${l.elevation})` }));
/** Master theo loại (本柱/間柱/…); nếu loại phụ chưa có mã nào thì dùng cả nhóm (cột / dầm / giằng) */
const byType = (p: Project, kind: MasterKind, type?: MasterType) => {
  const all = p.master.filter((m) => m.kind === kind);
  const t = type ? all.filter((m) => masterType(m) === type) : all;
  return t.length ? t : all;
};
const masterOpts = (p: Project, kind: MasterKind, type?: MasterType) =>
  byType(p, kind, type).map((m) => ({ value: m.id, label: `${m.name} – ${p.sections.find((s) => s.id === m.sectionId)?.code ?? '?'} / ${m.material}` }));
const SEC_TYPES: Record<MasterKind, string[]> = { column: ['I', 'Box', 'Pipe'], beam: ['I', 'Box', 'C'], brace: ['Rod', 'L', 'Pipe'] };

// ================= MASTER 部材名 =================
/** Hình tiết diện → nhóm bảng (category) trong thư viện JIS */
const SHAPES: { key: string; label: string; type: string; cats: string[] }[] = [
  { key: 'H', label: 'H', type: 'I', cats: ['h-narrow', 'h-mid', 'h-wide'] },
  { key: 'C', label: 'C (リップ)', type: 'C', cats: ['lip-c'] },
  { key: '[', label: '[ (溝形)', type: 'C', cats: ['channel', 'light-ch'] },
  { key: 'ロ', label: 'ロ', type: 'Box', cats: ['box-bcr', 'box-bcp', 'box-stkr'] },
  { key: '○', label: '○', type: 'Pipe', cats: ['pipe', 'pipe-large'] },
  { key: 'L', label: 'L', type: 'L', cats: ['angle', 'angle-u'] },
  { key: '丸鋼', label: '丸鋼', type: 'Rod', cats: ['rod'] },
];
const CAT_SHORT: Record<string, string> = {
  'h-narrow': '細幅', 'h-mid': '中幅', 'h-wide': '広幅',
  channel: '溝形鋼', 'light-ch': '軽溝形鋼',
  'box-bcr': 'BCR (ロール)', 'box-bcp': 'BCP (プレス)', 'box-stkr': 'STKR',
  pipe: '電縫 STK', 'pipe-large': 'UOE / 板巻き',
};
const shapesFor = (k: MasterKind) => SHAPES.filter((s) => SEC_TYPES[k].includes(s.type));
const catsOf = (shape: string) => (SHAPES.find((s) => s.key === shape)?.cats ?? []).map((id) => JIS_SECTIONS.find((c) => c.id === id)!).filter(Boolean);
const shapeOfCat = (catId: string) => SHAPES.find((s) => s.cats.includes(catId))?.key;
/** Từ mã tiết diện suy ra hình + nhóm bảng */
const locate = (code: string) => {
  const f = findJis(code);
  return f ? { shape: shapeOfCat(f.cat.id) ?? 'H', cat: f.cat.id } : null;
};
const firstOf = (shape: string) => {
  const c = catsOf(shape)[0];
  return { shape, cat: c?.id ?? '', code: c?.items[0]?.code ?? '' };
};

/** id: đang liên kết với 継手 ở tab 継手 (tên / kiểu luôn lấy theo tab 継手) */
type JointForm = Record<JointPos, { name: string; type: JointType; id?: string }>;
interface MasterForm {
  editId: string;
  kind: MasterKind;
  role?: MasterRole;
  name: string;
  note: string;
  shape: string;
  cat: string;
  code: string;
  material: string;
  base: string;
  joints: JointForm;
  /** 左 / 右 chọn riêng (mặc định false: chọn 1 bên thì bên kia theo) */
  lrFree: boolean;
  /** 本柱: 出寸法 ダイアフラム nhập tay ('' = theo パラメーター) */
  diaE: string;
}
const LAST_KEY = 'steel3t.master.last';
type LastInput = { kind: MasterKind; per: Partial<Record<MasterKind, { shape: string; code: string; material: string }>> };
const loadLast = (): LastInput | null => {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const saveLast = (f: MasterForm) => {
  try {
    const l = loadLast() ?? { kind: f.kind, per: {} };
    l.kind = f.kind;
    l.per[f.kind] = { shape: f.shape, code: f.code, material: f.material };
    localStorage.setItem(LAST_KEY, JSON.stringify(l));
  } catch {
    /* bỏ qua */
  }
};
/** Đặt 継手 cho 1 vị trí; 左 = 右 (mặc định): chọn 1 bên thì bên kia tự chọn theo */
const withPair = (js: JointForm, pos: JointPos, v: JointForm[JointPos], free: boolean): JointForm => {
  const other: JointPos | undefined = pos === 'left' ? 'right' : pos === 'right' ? 'left' : undefined;
  const out = { ...js, [pos]: v };
  if (other && !free) out[other] = { ...v };
  return out;
};

const emptyJoints = (): JointForm => ({
  top: { name: '', type: 'GPL' },
  bottom: { name: '', type: 'GPL' },
  left: { name: '', type: 'GPL' },
  right: { name: '', type: 'GPL' },
  mid: { name: '', type: 'SPL' },
});
function blankForm(p: Project, kind?: MasterKind, role?: MasterRole): MasterForm {
  const last = loadLast();
  const k = kind ?? last?.kind ?? 'column';
  const per = last?.per[k];
  const loc = per?.code ? locate(per.code) : null;
  const sel = loc && shapesFor(k).some((s) => s.key === loc.shape) ? { ...loc, code: per!.code } : firstOf(shapesFor(k)[0].key);
  const cat = JIS_SECTIONS.find((c) => c.id === sel.cat);
  const m0 = per?.material ?? p.params.member[k].material;
  const material = !cat || cat.materials.includes(m0) ? m0 : cat.material;
  const joints = emptyJoints();
  if (k === 'column') joints.mid.type = 'EP'; // 本柱: mối nối giữa mặc định là エレクションピース (khi gõ tay tên)
  return { editId: '', kind: k, role: kind ? role : undefined, name: '', note: '', ...sel, material, base: '', joints, lrFree: false, diaE: '' };
}
function formFromMaster(p: Project, m: MasterItem): MasterForm {
  const sec = p.sections.find((s) => s.id === m.sectionId);
  const joints = emptyJoints();
  if (m.kind === 'column') joints.mid.type = 'EP';
  for (const [pos, id] of Object.entries(m.joints ?? {}) as [JointPos, string][]) {
    const j = p.joints.find((x) => x.id === id);
    if (j) joints[pos] = { name: j.name, type: j.type, id: j.id };
  }
  return {
    editId: m.id,
    kind: m.kind,
    role: m.role,
    name: m.name,
    note: m.note ?? '',
    ...(sec && locate(sec.code) ? locate(sec.code)! : { shape: shapesFor(m.kind)[0].key, cat: '' }),
    code: sec?.code ?? '',
    material: m.material,
    base: p.bases.find((b) => b.memberIds.includes(m.id))?.name ?? '',
    joints,
    lrFree: lrFreeOf(m),
    diaE: m.diaE !== undefined ? String(m.diaE) : '',
  };
}

function MRow({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div className="mrow">
      <div className="mrow-label">
        <span className="mrow-n">{n}</span>
        {label}
      </div>
      <div className="mrow-body">{children}</div>
    </div>
  );
}

function MasterPanel(props: TabProps) {
  const [tab, setTab] = useState<'member' | 'joint' | 'kise'>('member');
  return (
    <>
      <div className="form-tabs master-tabs">
        <button className={tab === 'member' ? 'on' : ''} onClick={() => setTab('member')}>
          部材名
        </button>
        <button className={tab === 'joint' ? 'on' : ''} onClick={() => setTab('joint')}>
          継手
        </button>
        <button className={tab === 'kise' ? 'on' : ''} onClick={() => setTab('kise')}>
          既製品・基準
        </button>
      </div>
      {tab === 'member' ? <MemberMaster {...props} /> : tab === 'joint' ? <JointTab {...props} /> : <KiseihinLib />}
    </>
  );
}

function MemberMaster({ p, set }: TabProps) {
  const [f, setF] = useState<MasterForm>(() => blankForm(p));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pv, setPv] = useState<PreviewReq | null>(null);
  const conflicts = masterConflicts(p.master);
  const usage = (id: string) => p.columns.filter((c) => c.memberId === id).length + p.beams.filter((b) => b.memberId === id).length + (p.bracing.memberId === id ? 1 : 0);
  const existing = p.master.find((m) => m.name === f.name.trim() && m.id !== f.editId);
  // cột: 継手 中 không khai báo ở master – chỉ xuất hiện khi 切断 / 結合 cây (chọn 継手 ở lệnh cắt / gộp)
  const positions = jointPositions(f.kind, f.role).filter((q) => !(f.kind === 'column' && q === 'mid'));
  const up = (patch: Partial<MasterForm>) => setF((o) => ({ ...o, ...patch }));
  const setKind = (t: MasterType) => {
    const k = TYPE_KIND[t];
    try {
      const l = loadLast() ?? { kind: k, per: {} };
      localStorage.setItem(LAST_KEY, JSON.stringify({ ...l, kind: k }));
    } catch {
      /* bỏ qua */
    }
    const b = blankForm(p, k, TYPE_ROLE[t]);
    setF((o) => ({ ...b, name: o.editId ? '' : o.name, note: o.editId ? '' : o.note }));
  };
  const allowed = p.params.member.allowedMaterials;
  const fitMat = (catId: string, curMat: string) => {
    const c = JIS_SECTIONS.find((x) => x.id === catId);
    return !c || c.materials.includes(curMat) ? curMat : c.material;
  };
  const setCat = (catId: string) => {
    const c = JIS_SECTIONS.find((x) => x.id === catId);
    if (!c) return;
    setF((o) => ({ ...o, cat: catId, code: c.items[0]?.code ?? '', material: fitMat(catId, o.material) }));
  };
  const setShape = (key: string) => {
    const fo = firstOf(key);
    setF((o) => ({ ...o, ...fo, material: fitMat(fo.cat, o.material) }));
  };
  const catMats = JIS_SECTIONS.find((x) => x.id === f.cat)?.materials ?? allowed;
  const matOptions = [
    ...(catMats.includes(f.material) ? [] : [{ value: f.material, label: `⚠ ${f.material} (không hợp quy cách)` }]),
    ...catMats.map((m) => ({ value: m, label: m })),
  ];
  const cur = findJis(f.code);
  const pr = cur?.item.props;
  const brc = cur?.item.spec.type === 'Rod' ? braceRow(cur.item.spec.h) : undefined;
  const save = () =>
    set((d) => {
      const name = f.name.trim();
      // tiết diện theo JIS
      const jf = findJis(f.code);
      if (!jf) return setMsg({ ok: false, text: 'Hãy chọn kích thước theo JIS.' });
      let sec = d.sections.find((s) => s.code === f.code);
      if (!sec) {
        sec = { id: uid('sc'), code: f.code, ...jf.item.spec, material: f.material, kgm: jf.item.kg };
        d.sections.push(sec);
      }
      let id = f.editId;
      if (id) {
        const m = d.master.find((x) => x.id === id);
        if (!m) return;
        if (d.master.some((x) => x.id !== id && x.name === name)) return setMsg({ ok: false, text: `Mã "${name}" đã tồn tại.` });
        Object.assign(m, { name, kind: f.kind, role: f.role, sectionId: sec.id, material: f.material, note: f.note || undefined });
      } else {
        const r = ensureMaster(d, name, f.kind, sec.id, f.material);
        if (r.error || !r.id) return setMsg({ ok: false, text: r.error ?? 'Lỗi' });
        id = r.id;
        const m = d.master.find((x) => x.id === id);
        if (m && f.note) m.note = f.note;
        if (m && r.added && f.role) m.role = f.role;
      }
      if (f.kind === 'column') assignBaseByName(d, f.base, id);
      const m = d.master.find((x) => x.id === id)!;
      m.diaE = f.kind === 'column' && f.role !== 'post' && f.diaE.trim() !== '' && Number.isFinite(+f.diaE) ? +f.diaE : undefined;
      m.joints = {};
      if (positions.includes('left')) m.lrFree = f.lrFree || undefined;
      for (const pos of positions) {
        const lk = f.joints[pos].id && d.joints.find((j) => j.id === f.joints[pos].id);
        if (lk) {
          // liên kết với 継手 ở tab 継手: chỉ gán, không ghi đè tên / kiểu
          assignJoint(d, lk.id, id, pos);
          continue;
        }
        // gõ tay tên 継手: có rồi thì gán, chưa có thì tạo mới theo kiểu đã chọn
        if (f.joints[pos].name.trim()) {
          const e = assignJointByName(d, f.joints[pos].name, id, pos, f.joints[pos].type);
          if (e) return setMsg({ ok: false, text: e });
          continue;
        }
        // để trống: vị trí bắt buộc (大梁 中 · 小梁 左右) tự tạo 継手 mới theo quy tắc tên; vị trí khác = không dùng
        if (isRequiredJoint(f.kind, f.role, pos)) {
          const pair = pos === 'right' && !f.lrFree && m.joints?.left;
          if (pair) { assignJoint(d, pair, id, pos); continue; }
          const e = assignJointByName(d, nextJointName(d, beamJointPrefix(f.role, pos)), id, pos, pos === 'mid' ? 'SPL' : 'GPL');
          if (e) return setMsg({ ok: false, text: e });
        }
      }
      setMsg({ ok: true, text: f.editId ? `Đã cập nhật ${name}.` : `Đã thêm ${name} vào master.` });
      saveLast(f);
      setF((o) => ({ ...blankForm(p, o.kind, o.role), shape: o.shape, cat: o.cat, code: o.code, material: o.material }));
      // quy trình khép kín: quay lại bước nhập 部材名 cho cây tiếp theo
      setTimeout(() => {
        const el = document.getElementById('mm-name') as HTMLInputElement | null;
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el?.focus();
      }, 50);
    });

  const fType = masterType(f);
  const kindBtns = MASTER_TYPES.map((t) => (
    <button key={t} className={fType === t ? 'on' : ''} onClick={() => setKind(t)}>
      {MASTER_TYPE_LABEL[t]}
    </button>
  ));
  const jointSummary = (m: MasterItem) =>
    jointPositions(m.kind, m.role)
      .filter((q) => !(m.kind === 'column' && q === 'mid'))
      .map((pos) => {
        const j = p.joints.find((x) => x.id === m.joints?.[pos]);
        return j ? `${JOINT_POS_LABEL[pos]}${j.name}` : null;
      })
      .filter(Boolean)
      .join(' ') || '–';

  return (
    <>
      <Section title={f.editId ? `Sửa 部材名 ${p.master.find((m) => m.id === f.editId)?.name ?? ''}` : 'Khai báo 部材名 (tên cấu kiện)'}>
        <MRow n={1} label="Loại cấu kiện">
          <div className="seg">{kindBtns}</div>
        </MRow>
        <MRow n={2} label="部材名 · Ghi chú">
          <div className="mrow-pair">
            <input type="text" id="mm-name" placeholder="vd G1" value={f.name} onChange={(e) => up({ name: e.target.value })} />
            <input type="text" placeholder="Ghi chú" value={f.note} onChange={(e) => up({ note: e.target.value })} />
          </div>
        </MRow>
        {f.kind === 'brace' && (
          <div className="kbox">
            <span className="small">📦 Chọn nhanh フルブレース (フルサト · JIS A 5540): </span>
            <select
              value={brc && f.code === braceCode(brc.d) ? String(brc.d) : ''}
              onChange={(e) => {
                const r = braceRow(+e.target.value);
                if (!r) return;
                const fo = firstOf('丸鋼');
                setF((o) => ({ ...o, ...fo, code: braceCode(r.d), material: braceMaterial(r.d), name: o.name || `FB-M${r.d}`, note: o.note && !o.note.startsWith('フルブレース') ? o.note : braceNote(r) }));
              }}
            >
              <option value="">— chọn quy cách —</option>
              {FULL_BRACE.map((r) => (
                <option key={r.d} value={r.d}>
                  {braceLabel(r)}
                </option>
              ))}
            </select>
            <div className="muted small">Tự điền hình 丸鋼, kích thước, vật liệu (SNR400B, M10: SS400) và ghi chú. Bảng đầy đủ ở tab 既製品 › フルブレース.</div>
          </div>
        )}
        <MRow n={3} label="Tiết diện">
          <div className="seg">
            {shapesFor(f.kind).map((s) => (
              <button key={s.key} className={f.shape === s.key ? 'on' : ''} onClick={() => setShape(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </MRow>
        <MRow n={4} label="Quy cách · Kích thước">
          {catsOf(f.shape).length > 1 && (
            <div className="seg seg-sm">
              {catsOf(f.shape).map((c) => (
                <button key={c.id} className={f.cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)} title={c.standard}>
                  {CAT_SHORT[c.id] ?? c.name}
                </button>
              ))}
            </div>
          )}
          <SecCodeInput
            value={f.code}
            codes={[...catsOf(f.shape).filter((c) => c.id === f.cat), ...catsOf(f.shape).filter((c) => c.id !== f.cat)].flatMap((c) => c.items).map((it) => it.code)}
            onChange={(code) => {
              const c = catsOf(f.shape).find((x) => x.items.some((it) => it.code === code));
              setF((o) => ({ ...o, code, ...(c && c.id !== o.cat ? { cat: c.id, material: fitMat(c.id, o.material) } : {}) }));
            }}
          />
          <div className="muted small sec-props">
            {cur && <span>{cur.cat.standard} · </span>}
            {pr ? (
              <>
                A {pr.A} cm² · W {cur!.item.kg} kg/m · I {pr.I.toLocaleString()}
                {pr.Iy ? ` / ${pr.Iy.toLocaleString()}` : ''} cm⁴ · Z {pr.Z.toLocaleString()}
                {pr.Zy ? ` / ${pr.Zy.toLocaleString()}` : ''} cm³ · i {pr.i}
                {pr.iy ? ` / ${pr.iy}` : ''} cm{pr.Zp ? ` · Zp ${pr.Zp.toLocaleString()} cm³` : ''}
                {pr.r ? ` · R ${pr.r}` : ''}
              </>
            ) : (
              cur && <>W {cur.item.kg} kg/m</>
            )}
          </div>
        </MRow>
        <MRow n={5} label="Vật liệu">
          <Sel value={f.material} onChange={(v) => up({ material: v })} options={matOptions} />
          {!allowed.includes(f.material) && <div className="muted small">⚠ {f.material} chưa được cho phép trong パラメーター (符号管理 › 規格 JIS › Vật liệu).</div>}
          {f.kind === 'column' && cur?.item.spec.type === 'Box' && (
            <div className="small sec-props">
              通しダイアフラム: t = max(t cánh dầm, t cột) + 2 size, m1 · m2 ≥ 3 · khe 2 diaphragm ≥ max(150, 10t) · 出寸法 ở dòng 7
            </div>
          )}
          {brc && (
            <div className="small sec-props">
              フルブレース JIS A 5540 M{brc.d}: 短期 {brc.Pa} kN · 長期 {brc.PaL} kN · 羽子板 PL-{brc.t}×{brc.b} · {brc.bolt} · L ≥ {brc.Lmin2.toLocaleString()} (フルサト P144)
            </div>
          )}
        </MRow>
        {f.kind === 'column' && (
          <MRow n={6} label="ベース">
            <NameCombo value={f.base} placeholder="BP1" options={p.bases.map((b) => b.name)} onCommit={(v) => up({ base: v.trim() })} />
          </MRow>
        )}
        {f.kind === 'column' && f.role !== 'post' && (() => {
          const dp = { ...defaultDiaphragm(), ...(p.params.member.diaphragm ?? {}) };
          const tc = cur?.item.spec.tw ?? 12;
          const eP = dp.overhang > 0 ? dp.overhang : diaphragmOverhang(tc);
          const man = f.diaE !== '';
          const e = man ? +f.diaE || 0 : eP;
          return (
            <MRow n={7} label="出寸法 ダイアフラム">
              <div className="seg">
                <button className={!man ? 'on' : ''} onClick={() => up({ diaE: '' })}>Theo パラメーター ({eP})</button>
                <button className={man ? 'on' : ''} onClick={() => up({ diaE: String(f.diaE || eP) })}>Nhập tay</button>
              </div>
              {man && <input type="text" inputMode="decimal" value={f.diaE} onChange={(ev) => up({ diaE: ev.target.value.replace(/[^\d.]/g, '') })} style={{ width: 90 }} />}
              <svg viewBox="0 0 160 70" width={160} height={70} className="dia-e-fig">
                <rect x={70} y={22} width={70} height={46} fill="#c7dbfb" stroke="#1e293b" strokeWidth={1} />
                <rect x={70 - Math.min(40, e * 0.8)} y={14} width={70 + 2 * Math.min(40, e * 0.8)} height={8} fill="#cbd5e1" stroke="#1e293b" strokeWidth={1} />
                <rect x={0} y={20} width={70 - Math.min(40, e * 0.8)} height={40} fill="#fde5bd" stroke="#1e293b" strokeWidth={1} />
                <line x1={70 - Math.min(40, e * 0.8)} y1={8} x2={70} y2={8} stroke="#dc2626" strokeWidth={1} />
                <text x={70 - Math.min(40, e * 0.8) / 2} y={6} fontSize={9} textAnchor="middle" fill="#dc2626">e = {e}</text>
              </svg>
              <div className="muted small">Khoảng từ mặt ngoài cột tới mép ダイアフラム (cánh 大梁 dừng ở đây). Mặc định theo パラメーター › ダイアフラム.</div>
            </MRow>
          );
        })()}
        {positions.length > 0 && (
          <MRow n={f.kind === 'column' ? (f.role !== 'post' ? 8 : 7) : 6} label="継手">
            <div className="joint-pos">
              {positions.includes('left') && (
                <label className="lr-same small" title="Bật: chọn 継手 cho 1 bên thì bên kia tự chọn theo. Tắt: chọn riêng từng bên.">
                  <input
                    type="checkbox"
                    checked={!f.lrFree}
                    onChange={(e) => {
                      const same = e.target.checked;
                      setF((o) => ({ ...o, lrFree: !same, joints: same ? { ...o.joints, right: { ...o.joints.left } } : o.joints }));
                    }}
                  />{' '}
                  左 = 右 (chọn 1 bên, bên kia tự theo)
                </label>
              )}
              {positions.map((pos) => (
                <div key={pos} className="joint-pos-row">
                  <b title={f.kind === 'beam' ? (pos === 'mid' ? 'Mối nối ブラケット (継手距離 ở dầm)' : 'Mối nối ガセット ở đầu dầm') : undefined}>
                    {JOINT_POS_LABEL[pos]}
                    {f.kind === 'beam' && <span className="small muted">{pos === 'mid' ? ' ブラケット' : ' ガセット'}</span>}
                  </b>
                  {(() => {
                    // 継手 đang liên kết: tên / kiểu luôn theo tab 継手 (đổi ở tab 継手 thì dòng này tự cập nhật)
                    const lk = f.joints[pos].id ? p.joints.find((j) => j.id === f.joints[pos].id) : undefined;
                    const opts = p.joints.filter((j) => j.target === f.kind);
                    const sug = f.kind === 'beam' ? nextJointName(p, beamJointPrefix(f.role, pos)) : '';
                    const cur = lk ? lk.name : f.joints[pos].name;
                    const req = isRequiredJoint(f.kind, f.role, pos);
                    const typeOpts = (Object.keys(JOINT_TYPE_LABEL) as JointType[]).filter((t) => (t === 'EP' ? f.kind === 'column' : true));
                    const show = (name: string, type?: JointType) =>
                      name.trim() && setPv({ name, type, target: f.kind as JointTarget, secCode: f.code, where: `${f.name || f.code} ${JOINT_POS_LABEL[pos]}` });
                    return (
                      <>
                        {/* 1 ô duy nhất: chọn 継手 ở tab 継手 (danh sách gợi ý) hoặc gõ tay tên mới; trống = không dùng / tự tạo */}
                        <NameCombo
                          className="jname-in"
                          value={cur}
                          placeholder={req ? `— Tự tạo ${sug || '継手'} —` : '— Không dùng —'}
                          options={[
                            ...opts.map((j) => ({ value: j.name, label: `🔗 ${jointTypeName(j.type)} · ${j.webBolts.rows * j.webBolts.cols}-M${j.bolt.dia}` })),
                            ...(sug && !opts.some((j) => j.name === sug) ? [{ value: sug, label: 'tên mới theo quy tắc' }] : []),
                          ]}
                          onCommit={(v) => {
                            const ex = p.joints.find((j) => j.name === v.trim() && j.target === f.kind);
                            setF((o) => ({ ...o, joints: withPair(o.joints, pos, { name: ex ? ex.name : v.trim(), type: ex ? ex.type : o.joints[pos].type, id: ex?.id }, o.lrFree) }));
                            if (v.trim()) show(v.trim(), ex?.type ?? f.joints[pos].type);
                          }}
                        />
                        {lk ? (
                          <span className="jlink" title="Đang liên kết với 継手 ở tab 継手">🔗 {jointTypeName(lk.type)}</span>
                        ) : (
                          cur.trim() && (
                            <Sel
                              value={f.joints[pos].type}
                              onChange={(v: JointType) => setF((o) => ({ ...o, joints: withPair(o.joints, pos, { ...o.joints[pos], type: v }, o.lrFree) }))}
                              options={typeOpts.map((t) => ({ value: t, label: `${jointTypeName(t)} (mới)` }))}
                            />
                          )
                        )}
                        {cur.trim() && (
                          <button className="icon jpv-btn" title="Xem hình minh họa 継手 (cửa sổ tự do, thu phóng được)" onClick={() => show(cur, lk?.type ?? f.joints[pos].type)}>
                            👁
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </MRow>
        )}
        {pv && <JointPreviewWin p={p} req={pv} onClose={() => setPv(null)} />}
        {existing && <div className="alert error">⚠ Mã "{existing.name}" đã có trong master. Không cho phép trùng mã.</div>}
        {msg && <div className={msg.ok ? 'alert ok' : 'alert error'}>{msg.text}</div>}
        <div className="row-gap">
          <button className="primary" data-enter-submit disabled={!f.name.trim() || !!existing || !f.code} onClick={save}>
            {f.editId ? '✓ Cập nhật' : '+ Thêm vào master'}
          </button>
          {f.editId && <button onClick={() => setF(blankForm(p, f.kind, f.role))}>Huỷ sửa</button>}
        </div>
      </Section>
      {conflicts.length > 0 && <div className="alert error">⚠ Các mã đang bị trùng: {conflicts.join(', ')}. Hãy đổi tên hoặc xoá bớt.</div>}
      {MASTER_TYPES.map((type) => {
        const kind = TYPE_KIND[type];
        const list = p.master.filter((m) => masterType(m) === type);
        if (!list.length && type !== 'column' && type !== 'beam' && type !== 'brace') return null;
        return (
          <Section key={type} title={`${MASTER_TYPE_LABEL[type]} (${list.length})`}>
            <table className="table">
              <thead>
                <tr>
                  <th>部材名</th>
                  <th>Tiết diện</th>
                  <th>Vật liệu</th>
                  {kind === 'column' && <th>ベース</th>}
                  {(kind !== 'brace' || type === 'knee') && <th>継手</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((m) => {
                  const i = p.master.findIndex((x) => x.id === m.id);
                  const n = usage(m.id);
                  const sec = p.sections.find((s) => s.id === m.sectionId);
                  return (
                    <tr key={m.id} className={(conflicts.includes(m.name) ? 'warn ' : '') + (f.editId === m.id ? 'sel' : '')} title={m.note}>
                      <td>
                        <b>{m.name}</b>
                        {m.note && <div className="muted small">{m.note}</div>}
                      </td>
                      <td className="small">
                        {sec && !findJis(sec.code) && '⚠ '}
                        {sec?.code ?? '?'}
                      </td>
                      <td className="small">{m.material}</td>
                      {kind === 'column' && <td className="small">{p.bases.find((b) => b.memberIds.includes(m.id))?.name ?? '–'}</td>}
                      {(kind !== 'brace' || m.role === 'knee') && <td className="small">{jointSummary(m)}</td>}
                      <td className="nowrap">
                        <button className="icon" title="Sửa" onClick={() => setF(formFromMaster(p, m))}>
                          ✎
                        </button>
                        <button className="danger icon" disabled={n > 0} title={n > 0 ? 'Đang được sử dụng' : 'Xoá'} onClick={() => set((d) => void d.master.splice(i, 1))}>
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Section>
        );
      })}
    </>
  );
}

// ================= NHẬP CỘT THEO TRÌNH TỰ =================
export function AnchorPicker({ value, onPick, section }: { value: number | null; onPick: (i: number) => void; section?: { b: number; h: number; outline: [number, number][] } }) {
  const b = section?.b ?? 200, h = section?.h ?? 400;
  const pad = Math.max(b, h) * 0.25;
  return (
    <div className="anchor-picker">
      <svg viewBox={`${-b / 2 - pad} ${-h / 2 - pad} ${b + 2 * pad} ${h + 2 * pad}`} width={150} height={150}>
        {section && <polygon points={section.outline.map(([x, y]) => `${x},${-y}`).join(' ')} fill="#bfdbfe" stroke="#1d4ed8" strokeWidth={Math.max(b, h) / 150} />}
        <rect x={-b / 2} y={-h / 2} width={b} height={h} fill="none" stroke="#94a3b8" strokeDasharray={`${b / 30}`} strokeWidth={Math.max(b, h) / 250} />
        {ANCHOR_LABEL.map((_, i) => {
          const [ax, ay] = anchorLocal(i, b, h);
          return <circle key={i} cx={ax} cy={-ay} r={Math.max(b, h) / 16} className={'anchor-dot' + (value === i ? ' on' : '')} onClick={() => onPick(i)} />;
        })}
      </svg>
      <div className="anchor-grid">
        {ANCHOR_LABEL.map((l, i) => (
          <button key={i} className={value === i ? 'on' : ''} onClick={() => onPick(i)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function PlacementPreview({ ci, outline, b, h }: { ci: ColumnInput; outline: [number, number][]; b: number; h: number }) {
  const [ax, ay] = anchorLocal(ci.anchor ?? 4, b, h);
  const r = (ci.rotation * Math.PI) / 180;
  const cx = -(Math.cos(r) * ax - Math.sin(r) * ay) + ci.dx;
  const cy = -(Math.sin(r) * ax + Math.cos(r) * ay) + ci.dy;
  const pts = placeOutline(outline, cx, cy, ci.rotation);
  const ext = Math.max(b, h) * 1.3 + Math.max(Math.abs(ci.dx), Math.abs(ci.dy));
  const sw = ext / 120;
  const [px, py] = [cx + Math.cos(r) * ax - Math.sin(r) * ay, cy + Math.sin(r) * ax + Math.cos(r) * ay];
  return (
    <svg className="preview" viewBox={`${-ext} ${-ext} ${2 * ext} ${2 * ext}`} width={230} height={230}>
      <line x1={-ext} x2={ext} y1={0} y2={0} stroke="#dc2626" strokeWidth={sw} strokeDasharray={`${sw * 8} ${sw * 3}`} />
      <line y1={-ext} y2={ext} x1={0} x2={0} stroke="#dc2626" strokeWidth={sw} strokeDasharray={`${sw * 8} ${sw * 3}`} />
      <polygon points={pts.map(([x, y]) => `${x},${-y}`).join(' ')} fill="#93c5fd" stroke="#1d4ed8" strokeWidth={sw} />
      <circle cx={px} cy={-py} r={sw * 4} fill="#f59e0b" />
      {/* kích thước dịch X / Y và góc xoay (làm nổi khi nhập) */}
      <Dim x1={0} x2={ci.dx || 0.001} y1={-ext * 0.82} y2={-ext * 0.82} s={sw * 9} k="col-dx" label={`dx ${ci.dx}`} />
      <Dim x1={-ext * 0.82} x2={-ext * 0.82} y1={-(ci.dy || 0.001)} y2={0} s={sw * 9} k="col-dy" label={`dy ${ci.dy}`} />
      <g className="dim" data-dk="col-rot">
        <path d={`M${px + ext * 0.35} ${-py} A${ext * 0.35} ${ext * 0.35} 0 0 0 ${px + ext * 0.35 * Math.cos(r)} ${-py - ext * 0.35 * Math.sin(r)}`} fill="none" stroke="#2563eb" strokeWidth={sw} />
        <text x={px + ext * 0.4} y={-py - sw * 3} fontSize={sw * 9} fill="#1d4ed8">{ci.rotation}°</text>
      </g>
      <text x={-ext + sw * 3} y={-ext + sw * 12} fontSize={sw * 10} fill="#64748b">
        giao trục
      </text>
    </svg>
  );
}

/** 修正 hàng loạt: các cây quét chọn – ô để trống / “giữ nguyên” thì không đổi */
function MultiFix({ p, set, sel, label, onDone, onClear }: { p: Project; set: TabProps['set']; sel: string[]; label: (s: string) => string; onDone: (n: number) => void; onClear: () => void }) {
  const cols = p.columns.filter((c) => sel.includes(c.id));
  const bms = p.beams.filter((b) => sel.includes(b.id));
  const brs = (p.braces ?? []).filter((b) => sel.includes(b.id));
  const [f, setF] = useState<Record<string, string>>({});
  const up = (k: string, v: string) => setF((o) => ({ ...o, [k]: v }));
  const lvOpts = [{ value: '', label: '— giữ nguyên —' }, ...[...p.levels].sort((a, b) => a.elevation - b.elevation).map((l) => ({ value: l.id, label: `${l.name} (${l.elevation})` }))];
  const mOpts = (kind: string, role?: string) => [{ value: '', label: '— giữ nguyên —' }, ...p.master.filter((m) => m.kind === kind && (role === undefined || (m.role ?? '') === role || (role === '' && !m.role))).map((m) => ({ value: m.id, label: `${m.name} – ${p.sections.find((s) => s.id === m.sectionId)?.code ?? '?'}` }))];
  const num = (k: string) => (f[k] ?? '').trim() === '' || isNaN(+f[k]) ? undefined : +f[k];
  const counts = Object.entries(sel.map(label).reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {})).map(([k, n]) => `${k} ×${n}`).join(', ');
  const apply = () => {
    set((d) => {
      for (const c of d.columns.filter((x) => sel.includes(x.id))) {
        if (f.cMember) c.memberId = f.cMember;
        if (f.cBase) c.base = f.cBase;
        if (f.cTop) c.top = f.cTop;
        if (num('cRot') !== undefined) c.rotation = num('cRot')!;
        if (num('cDzb') !== undefined) c.dzb = num('cDzb') || undefined;
        if (num('cDzt') !== undefined) c.dzt = num('cDzt') || undefined;
      }
      for (const b of d.beams.filter((x) => sel.includes(x.id))) {
        if (f.bMember) b.memberId = f.bMember;
        if (f.bLevel) b.level = f.bLevel;
        if (num('bDz') !== undefined) b.dz = num('bDz') || undefined;
        if (f.bVref) b.vref = f.bVref as Beam['vref'];
      }
      for (const b of (d.braces ?? []).filter((x) => sel.includes(x.id))) if (f.rMember) b.memberId = f.rMember;
    });
    onDone(sel.length);
    setF({});
  };
  const txt = (k: string, ph = 'giữ nguyên') => <input type="text" inputMode="decimal" placeholder={ph} value={f[k] ?? ''} onChange={(e) => up(k, e.target.value)} />;
  return (
    <div className="multi-fix">
      <div className="alert info small">
        修正 hàng loạt: <b>{sel.length}</b> 部材 ({counts}). Ô để trống / “giữ nguyên” thì không đổi.{' '}
        <button className="link" onClick={onClear}>Bỏ chọn</button>
      </div>
      {cols.length > 0 && (
        <div className="mfix-group">
          <b>柱 ({cols.length})</b>
          <div className="grid2">
            <Field label="部材名"><Sel value={f.cMember ?? ''} onChange={(v) => up('cMember', v)} options={mOpts('column')} /></Field>
            <Field label="Xoay (°)">{txt('cRot')}</Field>
            <Field label="Chân cột"><Sel value={f.cBase ?? ''} onChange={(v) => up('cBase', v)} options={lvOpts} /></Field>
            <Field label="Đỉnh cột"><Sel value={f.cTop ?? ''} onChange={(v) => up('cTop', v)} options={lvOpts} /></Field>
            <Field label="Cao độ chân ± tầng (mm)">{txt('cDzb')}</Field>
            <Field label="Cao độ đỉnh ± tầng (mm)">{txt('cDzt')}</Field>
          </div>
        </div>
      )}
      {bms.length > 0 && (
        <div className="mfix-group">
          <b>梁 ({bms.length})</b>
          <div className="grid2">
            <Field label="部材名"><Sel value={f.bMember ?? ''} onChange={(v) => up('bMember', v)} options={mOpts('beam')} /></Field>
            <Field label="Tầng"><Sel value={f.bLevel ?? ''} onChange={(v) => up('bLevel', v)} options={lvOpts} /></Field>
            <Field label="Cao độ ± tầng (mm)">{txt('bDz')}</Field>
            <Field label="上下基準"><Sel value={f.bVref ?? ''} onChange={(v) => up('bVref', v)} options={[{ value: '', label: '— giữ nguyên —' }, { value: 'top', label: 'Mặt trên' }, { value: 'center', label: 'Tâm' }, { value: 'bottom', label: 'Mặt dưới' }]} /></Field>
          </div>
        </div>
      )}
      {brs.length > 0 && (
        <div className="mfix-group">
          <b>ブレース ({brs.length})</b>
          <Field label="部材名"><Sel value={f.rMember ?? ''} onChange={(v) => up('rMember', v)} options={mOpts('brace')} /></Field>
        </div>
      )}
      <button className="primary" data-enter-submit disabled={!Object.values(f).some((v) => v.trim() !== '')} onClick={apply}>✓ Áp dụng cho {sel.length} 部材</button>
    </div>
  );
}

// ================= NHẬP CỘT · DẦM (theo dòng, thao tác trực tiếp trên 3D) =================
/** Đặt cột tại giao trục (hoặc dời cột đang sửa tới đó) */
export function placeColumnAt(d: Project, ci: ColumnInput, x: string, y: string, editId?: string | null) {
  const m = d.master.find((mm) => mm.name === ci.memberName.trim() && mm.kind === 'column');
  if (!m) return;
  // tầng chân / đỉnh không hợp lệ (rỗng, của công trình khác) → tầng thấp nhất / tầng kế trên
  const lvs = [...d.levels].sort((a, b) => a.elevation - b.elevation);
  const base = lvs.some((l) => l.id === ci.base) ? ci.base : lvs[0]?.id ?? '';
  const top = lvs.some((l) => l.id === ci.top) && ci.top !== base ? ci.top : lvs[lvs.findIndex((l) => l.id === base) + 1]?.id ?? base;
  const data = { x, y, base, top, memberId: m.id, anchor: ci.anchor ?? 4, rotation: ci.rotation, dx: ci.dx, dy: ci.dy, dzb: ci.dzb || undefined, dzt: ci.dzt || undefined, jLo: ci.jLo || undefined, jHi: ci.jHi || undefined, gap: ci.gap || undefined, baseId: ci.baseId || undefined, slopeId: ci.slopeId || undefined };
  if (editId) {
    const c = d.columns.find((cc) => cc.id === editId);
    if (c) {
      for (const k of ['dzb', 'dzt', 'jLo', 'jHi', 'gap', 'baseId', 'slopeId'] as const) delete c[k];
      Object.assign(c, data);
    }
    return;
  }
  d.columns = d.columns.filter((c) => !(c.x === x && c.y === y && c.base === base));
  d.columns.push({ id: uid('col'), ...data });
}

/** Thêm dầm mới hoặc cập nhật dầm đang sửa. Trả về lỗi nếu có. */
export function saveBeam(d: Project, bi: BeamInput, editId?: string | null): string | undefined {
  const free = !!(bi.p1 && bi.p2);
  if (free ? Math.hypot(bi.p1![0] - bi.p2![0], bi.p1![1] - bi.p2![1]) < 100 : bi.x1 === bi.x2 && bi.y1 === bi.y2) return 'Điểm đầu và điểm cuối trùng nhau.';
  if (!d.master.some((m) => m.id === bi.memberId && m.kind === 'beam')) return 'Chưa chọn 部材名 dầm.';
  const data: Omit<Beam, 'id'> = {
    level: bi.level, x1: bi.x1, y1: bi.y1, x2: bi.x2, y2: bi.y2, memberId: bi.memberId,
    dz: bi.dz || undefined, off: bi.off || undefined, align: bi.align === 'grid' ? undefined : bi.align,
    place: bi.place === 'center' ? undefined : bi.place, vref: bi.vref === 'top' ? undefined : bi.vref,
    up1: bi.up1 || undefined, up2: bi.up2 || undefined, j1: bi.end1 === 'rigid' ? bi.j1 || undefined : undefined, j2: bi.end2 === 'rigid' ? bi.j2 || undefined : undefined, gap: bi.end1 === 'rigid' || bi.end2 === 'rigid' ? bi.gap : undefined,
    end1: bi.end1, end2: bi.end2, jRef: bi.jRef === 'face' ? 'face' : undefined, role: bi.role,
    slopeId: bi.slopeId || undefined, dir: bi.dir || undefined,
    sl: bi.role === 'sub' && bi.sl && bi.sl !== 'sup' ? bi.sl : undefined, sdz: bi.role === 'sub' ? bi.sdz || undefined : undefined,
    p1: free ? bi.p1! : undefined, p2: free ? bi.p2! : undefined, ref1: free ? bi.ref1 || undefined : undefined, ref2: free ? bi.ref2 || undefined : undefined,
  };
  if (editId) {
    const b = d.beams.find((bb) => bb.id === editId);
    if (b) {
      for (const k of ['dz', 'off', 'align', 'place', 'vref', 'up1', 'up2', 'j1', 'j2', 'gap', 'p1', 'p2', 'ref1', 'ref2', 'slopeId', 'dir', 'end1', 'end2', 'jRef', 'role', 'sl', 'sdz'] as const) delete b[k];
      Object.assign(b, data);
    }
    return;
  }
  // dầm theo giao trục đi qua cột ở trục giữa → chia thành từng nhịp giữa các cột (tránh 1 dầm xuyên cột)
  const segs: [string, string, string, string][] = [[data.x1, data.y1, data.x2, data.y2]];
  if (!free && (data.x1 === data.x2) !== (data.y1 === data.y2)) {
    const alongX = data.y1 === data.y2;
    const lines = alongX ? d.gridsX : d.gridsY;
    const pos = gridPositions(lines);
    const order = [...lines].sort((a, b) => pos.get(a.id)! - pos.get(b.id)!).map((g) => g.id);
    const i1 = order.indexOf(alongX ? data.x1 : data.y1), i2 = order.indexOf(alongX ? data.x2 : data.y2);
    const z = d.levels.find((l) => l.id === data.level)?.elevation ?? 0;
    const el = (id: string) => d.levels.find((l) => l.id === id)?.elevation ?? 0;
    const fix = alongX ? data.y1 : data.x1;
    const pp = gridPositions(alongX ? d.gridsY : d.gridsX);
    const fp = pp.get(fix) ?? 0;
    // điểm đỡ ở trục giữa: cột đi qua cao độ dầm, hoặc dầm vuông góc cùng tầng chạy qua giao trục
    const hasCol = (g: string) => d.columns.some((c) => (alongX ? c.x === g && c.y === fix : c.y === g && c.x === fix) && el(c.base) < z - 1 && el(c.top) > z - 1)
      || d.beams.some((b) => !b.p1 && b.level === data.level && (alongX ? b.x1 === g && b.x2 === g : b.y1 === g && b.y2 === g)
        && (() => { const a = pp.get(alongX ? b.y1 : b.x1) ?? 0, c = pp.get(alongX ? b.y2 : b.x2) ?? 0; return Math.min(a, c) < fp - 1 && Math.max(a, c) > fp + 1; })());
    if (i1 >= 0 && i2 >= 0 && Math.abs(i2 - i1) > 1) {
      const st = i2 > i1 ? 1 : -1;
      const cuts = [order[i1]];
      for (let k = i1 + st; k !== i2; k += st) if (hasCol(order[k])) cuts.push(order[k]);
      cuts.push(order[i2]);
      if (cuts.length > 2) segs.splice(0, 1, ...cuts.slice(1).map((g, k): [string, string, string, string] => alongX ? [cuts[k], fix, g, fix] : [fix, cuts[k], fix, g]));
    }
  }
  for (const [x1, y1, x2, y2] of segs) {
    // bỏ qua dầm trùng (cùng tầng, cùng 2 đầu)
    const same = d.beams.some((b) => !b.p1 && b.level === data.level && (b.dz ?? 0) === (data.dz ?? 0) && ((b.x1 === x1 && b.y1 === y1 && b.x2 === x2 && b.y2 === y2) || (b.x1 === x2 && b.y1 === y2 && b.x2 === x1 && b.y2 === y1)));
    if (!same) d.beams.push({ id: uid('bm'), ...data, x1, y1, x2, y2 });
  }
}

/** 間柱 / 小梁 nhập theo đường chuẩn: lưu các vị trí đã tính */
export function saveLineTargets(d: Project, what: 'post' | 'sbeam', targets: LineTarget[], ci: ColumnInput, bi: BeamInput, ref1?: string, ref2?: string): string | undefined {
  const el = (id: string) => d.levels.find((l) => l.id === id)?.elevation ?? 0;
  if (what === 'post') {
    const m = d.master.find((mm) => mm.name === ci.memberName.trim() && mm.kind === 'column');
    if (!m) return 'Chưa chọn 部材名 間柱.';
    for (const t of targets)
      d.columns.push({ id: uid('col'), x: '', y: '', pt: [Math.round(t.p1[0]), Math.round(t.p1[1])], base: nearestLv(d, t.p1[2]), top: nearestLv(d, t.p2[2]), memberId: m.id, anchor: 4, rotation: ci.rotation, dx: 0, dy: 0, role: 'post', zb: Math.round(t.p1[2]), zt: Math.round(t.p2[2]) });
    return;
  }
  const top = d.params.member.beamTopOffset;
  for (const t of targets) {
    const level = nearestLv(d, t.p1[2]);
    const err = saveBeam(d, { ...bi, p1: [Math.round(t.p1[0]), Math.round(t.p1[1])], p2: [Math.round(t.p2[0]), Math.round(t.p2[1])], level, dz: Math.round(t.p1[2] - el(level) - top), up1: 0, up2: Math.round(t.p2[2] - t.p1[2]), vref: 'top', off: 0, place: 'center', align: 'grid', role: 'sub', slopeId: '', ref1: t.r1 ?? ref1 ?? '', ref2: t.r2 ?? ref2 ?? '' }, null);
    if (err) return err;
  }
}

/** 間柱: cột đặt tự do tại điểm pt trên dầm (chân ở tầng base) */
export function savePost(d: Project, ci: ColumnInput, pt: [number, number], base: string, editId?: string | null) {
  const m = d.master.find((mm) => mm.name === ci.memberName.trim() && mm.kind === 'column');
  if (!m) return;
  const el = (id: string) => d.levels.find((l) => l.id === id)?.elevation ?? 0;
  const top = el(ci.top) > el(base) ? ci.top : [...d.levels].sort((a, b) => a.elevation - b.elevation).find((l) => l.elevation > el(base))?.id ?? ci.top;
  const data = { x: '', y: '', pt, base, top, memberId: m.id, anchor: 4, rotation: ci.rotation, dx: 0, dy: 0, role: 'post' as const, slopeId: ci.slopeId || undefined };
  const c = editId ? d.columns.find((x) => x.id === editId && x.role === 'post') : undefined;
  if (c) Object.assign(c, data);
  else d.columns.push({ id: uid('col'), ...data });
}

/** Thêm / cập nhật ブレース既製品. Trả về lỗi nếu có. */
export function saveBrace(d: Project, bi: BraceInput, editId?: string | null): string | undefined {
  if (!d.master.some((m) => m.id === bi.memberId && m.kind === 'brace')) return 'Chưa chọn 部材名 giằng.';
  if (bi.plane === 'plan' && (bi.x1 === bi.x2 || bi.y1 === bi.y2)) return 'Giằng ngang: 2 giao trục phải là 2 góc chéo của khoang.';
  if (bi.plane === 'wall' && bi.x1 !== bi.x2 && bi.y1 !== bi.y2) return 'Giằng đứng: 2 giao trục phải cùng một đường trục.';
  if (bi.plane === 'wall' && bi.x1 === bi.x2 && bi.y1 === bi.y2) return 'Hai giao trục trùng nhau.';
  if (bi.plane === 'wall' && bi.level === bi.top) return 'Giằng đứng: tầng dưới và tầng trên phải khác nhau.';
  const data: Omit<BraceInst, 'id'> = { ...bi };
  if (editId) {
    const b = (d.braces ?? []).find((x) => x.id === editId);
    if (b) Object.assign(b, data);
    return;
  }
  d.braces = [...(d.braces ?? []), { id: uid('br'), ...data }];
}

/** Cột (本柱) tại giao trục ở cao độ tầng */
function columnAtNode(p: Project, x: string, y: string, levelId: string) {
  const z = p.levels.find((l) => l.id === levelId)?.elevation ?? 0;
  const el = (id: string) => p.levels.find((l) => l.id === id)?.elevation ?? 0;
  return p.columns.find((c) => c.x === x && c.y === y && z >= Math.min(el(c.base), el(c.top)) - 1 && z <= Math.max(el(c.base), el(c.top)) + 1);
}

/** Bảng nhân bản hàng loạt (hiện khi đã chọn đủ điểm đầu, điểm cuối và đường giới hạn / đường chuẩn) – kéo tiêu đề để di chuyển, kéo góc / nút ± để thu phóng */
function BatchDialog({ li, setLi, refs, what, pending, warn, onOk }: { li: LineInput; setLi: (l: LineInput) => void; refs: RefLine[]; what: string; pending: number; warn?: string; onOk?: () => void }) {
  const bt = batchDs(li, refs);
  const div = li.mode === 'div';
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const r1 = (v?: number) => (v === undefined ? '–' : String(Math.round(v * 10) / 10));
  const close = () => setLi(div ? { ...li, ref2: '' } : { ...li, ref: '' });
  const refLabel = (k?: string) => refs.find((r) => r.key === k)?.label ?? '';
  const isMem = (k?: string) => !!k?.startsWith('mem:');
  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - box.left, dy = e.clientY - box.top;
    const mv = (ev: PointerEvent) => setPos({ x: Math.max(0, Math.min(window.innerWidth - 80, ev.clientX - dx)), y: Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dy)) });
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="batch-dlg" role="dialog" style={{ ...(pos ? { left: pos.x, top: pos.y, bottom: 'auto', transform: 'none' } : {}), fontSize: `${zoom}em` }}>
      <div className="batch-head" onPointerDown={drag} title="Kéo để di chuyển">
        <b>⠿ Nhân bản {what}</b>
        <span className="row-gap">
          <button className="icon" title="Thu nhỏ" onClick={() => setZoom((z) => Math.max(0.7, Math.round((z - 0.1) * 10) / 10))}>−</button>
          <button className="icon" title="Phóng to" onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}>+</button>
          <button className="icon" title="Đóng (chọn lại đường)" onClick={close}>✕</button>
        </span>
      </div>
      <div className="small muted">
        {div ? (
          <>Giữa <b>{refLabel(li.ref)}</b> và <b>{refLabel(li.ref2)}</b> · khoảng cách D = <b>{r1(bt.D === undefined ? undefined : Math.abs(bt.D))}</b> mm (đo {isMem(li.ref) || isMem(li.ref2) ? 'từ tim 部材 / đường' : 'giữa 2 đường'})</>
        ) : (
          <>Từ <b>{refLabel(li.ref)}</b> · khoảng cách tính từ {isMem(li.ref) ? 'tim (芯) 部材' : 'đường'}</>
        )}
      </div>
      <div className="mrow">
        <span>Số lượng {what}</span>
        <Num value={li.n ?? 1} min={1} onChange={(v) => setLi({ ...li, n: Math.max(1, Math.round(v)) })} />
      </div>
      {div ? (
        <div className="small">N cây cách đều giữa 2 đường, khoảng cách giữa các cây = D / (N+1) = <b>{r1(bt.pitch === undefined ? undefined : Math.abs(bt.pitch))}</b> mm</div>
      ) : (
        <>
          <div className="mrow">
            <span>Khoảng cách giữa các cây (mm)</span>
            <Num value={li.sp ?? 0} min={1} onChange={(v) => setLi({ ...li, sp: v })} />
          </div>
          <label className="check"><input type="checkbox" checked={!!li.flip} onChange={(e) => setLi({ ...li, flip: e.target.checked })} /> Đảo phía (mặc định về phía 部材 đỡ)</label>
        </>
      )}
      {bt.err ? <div className="alert small">{bt.err}</div> : <div className="small muted">Vị trí tính từ {div ? 'đường giới hạn 1' : 'đường chuẩn'}: {bt.ds.map((d) => r1(Math.abs(d))).join(', ')} mm</div>}
      {!bt.err && warn && <div className="alert small">{warn} (vị trí này nằm ngoài 部材 đỡ nên bỏ qua)</div>}
      <div className="row-gap" style={{ marginTop: 6 }}>
        <button className="primary" disabled={!pending} onClick={onOk}>✓ Xác nhận {pending ? `(${pending} cây)` : ''}</button>
        <button onClick={close}>✕ Huỷ</button>
      </div>
    </div>
  );
}

function InputPanel({ checkClash, lineIn, setLineIn, refs = [], lineErr, brPick, setBrPick, p, set, colIn: ci, setColIn, beamIn: bi, setBeamIn, braceIn: ri, setBraceIn, pending, setPending, confirmPending, kneeIn, setKneeIn, pk, setPk, selected, setSelected, members }: MainTabProps) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const gName = (axis: 'x' | 'y', id: string) => (axis === 'x' ? p.gridsX : p.gridsY).find((g) => g.id === id)?.name ?? '?';
  const lvName = (id: string) => p.levels.find((l) => l.id === id)?.name ?? '?';
  const mName = (id: string) => p.master.find((m) => m.id === id)?.name ?? '?';
  const colMaster = byType(p, 'column', pk.kind === 'post' ? 'post' : 'column');
  const cm = colMaster.find((m) => m.name === ci.memberName.trim());
  const sec = p.sections.find((s) => s.id === cm?.sectionId);
  const outline = sec ? sectionOutline(sec) : [];
  const isCol = pk.kind === 'column' || pk.kind === 'post';
  const isBeam = pk.kind === 'beam' || pk.kind === 'sbeam';
  const editCol = isCol && pk.editId ? p.columns.find((c) => c.id === pk.editId) : undefined;
  const editBeam = isBeam && pk.editId ? p.beams.find((b) => b.id === pk.editId) : undefined;
  const braces = p.braces ?? [];
  const editBrace = pk.kind === 'brace' && pk.editId ? braces.find((b) => b.id === pk.editId) : undefined;

  const loadColumn = (id: string) => {
    const c = p.columns.find((x) => x.id === id);
    if (!c) return;
    const m = p.master.find((x) => x.id === c.memberId);
    setColIn({ ...ci, step: 3, memberName: m?.name ?? '', sectionId: m?.sectionId ?? ci.sectionId, material: m?.material ?? ci.material, anchor: c.anchor, rotation: c.rotation, dx: c.dx, dy: c.dy, base: c.base, top: c.top, dzb: c.dzb ?? 0, dzt: c.dzt ?? 0, xs: [c.x], ys: [c.y], jLo: c.jLo ?? 0, jHi: c.jHi ?? 0, gap: c.gap ?? 0, baseId: c.baseId ?? '', slopeId: c.slopeId ?? '' });
    setPk({ ...pk, kind: c.role === 'post' ? 'post' : 'column', editId: id, start: null });
    setMsg(null);
  };
  /** Mô tả 部材 đã chọn ở đầu dầm */
  const refName = (id?: string) => {
    if (!id) return '';
    const c = p.columns.find((x) => x.id === id);
    if (c) return `Cột ${gName('x', c.x)}-${gName('y', c.y)}`;
    const b = p.beams.find((x) => x.id === id);
    if (b) return `Dầm ${mName(b.memberId)}`;
    return '?';
  };
  const beamWhere = (b: Beam) =>
    b.p1 && b.p2 ? `${refName(b.ref1)} → ${refName(b.ref2)}` : `${gName('x', b.x1)}${gName('y', b.y1)} → ${gName('x', b.x2)}${gName('y', b.y2)}`;
  const loadBeam = (id: string) => {
    const b = p.beams.find((x) => x.id === id);
    if (!b) return;
    setBeamIn({ memberId: b.memberId, level: b.level, dz: b.dz ?? 0, x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2, off: b.off ?? 0, align: b.align ?? 'grid', place: b.place ?? 'center', vref: b.vref ?? 'top', up1: b.up1 ?? 0, up2: b.up2 ?? 0, j1: b.j1 ?? 0, j2: b.j2 ?? 0, gap: b.gap ?? 10, p1: b.p1 ?? null, p2: b.p2 ?? null, ref1: b.ref1 ?? '', ref2: b.ref2 ?? '', slopeId: b.slopeId ?? '', dir: b.dir ?? '', end1: beamEnd(b, 1), end2: beamEnd(b, 2), jRef: b.jRef ?? 'center', role: b.role, sl: b.sl ?? 'sup', sdz: b.sdz ?? 0 });
    setPk({ ...pk, kind: b.role === 'sub' ? 'sbeam' : 'beam', editId: id, start: null });
    setMsg(null);
  };
  const loadBrace = (id: string) => {
    const b = braces.find((x) => x.id === id);
    if (!b) return;
    const { id: _id, ...rest } = b;
    void _id;
    setBraceIn(rest);
    setPk({ ...pk, kind: 'brace', editId: id, start: null });
    setMsg(null);
  };
  // Bấm vào cấu kiện trên 3D → mở chế độ sửa
  useEffect(() => {
    if (!selected) return;
    const src = members.find((m) => m.id === selected)?.source;
    if (!src || src === pk.editId || pk.del || pk.cut || pk.merge) return;
    if (p.columns.some((c) => c.id === src)) loadColumn(src);
    else if (p.beams.some((b) => b.id === src)) loadBeam(src);
    else if (braces.some((b) => b.id === src)) loadBrace(src);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  // 削除: các cấu kiện đã chọn trên 3D (bấm / quét chọn)
  const delSel = pk.del ? pk.delSel ?? [] : [];
  const srcLabel = (src: string) => {
    const c = p.columns.find((x) => x.id === src);
    if (c) return `${c.role === 'post' ? '間柱' : '本柱'} ${mName(c.memberId)}`;
    const bm = p.beams.find((x) => x.id === src);
    if (bm) return `${bm.role === 'sub' ? '小梁' : '大梁'} ${mName(bm.memberId)}`;
    if (braces.some((x) => x.id === src)) return 'ブレース';
    if ((p.knees ?? []).some((x) => x.id === src)) return '方杖';
    return '?';
  };
  const doDelete = () => {
    const ids = delSel;
    if (!ids.length) return;
    set((d) => void deleteSources(d, ids));
    setPk({ ...pk, delSel: [] });
    setSelected(null);
    setMsg({ ok: true, text: `Đã xoá ${ids.length} 部材. (Hoàn tác: nút ↶)` });
  };
  // Delete / Enter khi đang chọn cấu kiện ở chế độ 削除
  useEffect(() => {
    if (!pk.del) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (delSel.length && (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Enter')) { e.preventDefault(); doDelete(); }
      if (e.key === 'Escape') setPk({ ...pk, delSel: [] });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const preview = pk.preview !== false;
  const pendBtns = (
    <>
      <button className="primary" onClick={() => { confirmPending(); setMsg({ ok: true, text: 'Đã xác nhận.' }); }}>
        ✓ Xác nhận (Enter)
      </button>
      <button onClick={() => setPending(null)}>✕ Huỷ (Esc)</button>
    </>
  );
  const stopEdit = () => {
    setPk({ ...pk, editId: null, start: null });
    setSelected(null);
    setMsg(null);
  };

  const positions = ci.xs.length * ci.ys.length;
  const chip = (axis: 'x' | 'y', id: string, name: string) => {
    const key = axis === 'x' ? 'xs' : 'ys';
    const on = ci[key].includes(id);
    const pick = (v: boolean) => setColIn({ ...ci, [key]: editCol ? [id] : v ? [...ci[key], id] : ci[key].filter((x) => x !== id) });
    return (
      <label key={id} className={'chip' + (on ? ' on' : '')}>
        <input type="checkbox" checked={on} onChange={(e) => pick(e.target.checked)} />
        {name}
      </label>
    );
  };
  const colUpd = (patch: Partial<ColumnInput>) => setColIn({ ...ci, ...patch, step: 3 });
  const beamUpd = (patch: Partial<BeamInput>) => setBeamIn({ ...bi, ...patch });
  const braceUpd = (patch: Partial<BraceInput>) => setBraceIn({ ...ri, ...patch });
  /** 軸ブレース: tầng trên phải cao hơn tầng dưới → nếu không, lấy tầng kế trên (tầng dưới là tầng cao nhất → lùi 1 tầng) */
  const braceSpan = (lo: string, hi: string): Partial<BraceInput> => {
    const s = [...p.levels].sort((a, b) => a.elevation - b.elevation);
    const i = s.findIndex((l) => l.id === lo), j = s.findIndex((l) => l.id === hi);
    if (i < 0 || j > i) return { level: lo, top: hi };
    if (i + 1 < s.length) return { level: lo, top: s[i + 1].id };
    return i > 0 ? { level: s[i - 1].id, top: lo } : { level: lo, top: hi };
  };
  const rOpts = masterOpts(p, 'brace', 'brace');
  const kOpts = masterOpts(p, 'brace', 'knee');
  // giữ 部材名 đang chọn thuộc đúng loại (本柱/間柱, 大梁/小梁, 方杖)
  useEffect(() => {
    if (pk.kind === 'knee' && kOpts.length && !kOpts.some((o) => o.value === kneeIn.memberId)) setKneeIn({ ...kneeIn, memberId: kOpts[0].value });
    if ((pk.kind === 'column' || pk.kind === 'post') && colMaster.length && !cm) setColIn({ ...ci, memberName: colMaster[0].name });
    if ((pk.kind === 'beam' || pk.kind === 'sbeam') && bOpts.length && !bOpts.some((o) => o.value === bi.memberId)) setBeamIn({ ...bi, memberId: bOpts[0].value });
  });
  const rSec = p.sections.find((s) => s.id === p.master.find((m) => m.id === ri.memberId)?.sectionId);
  const bOpts = masterOpts(p, 'beam', pk.kind === 'sbeam' ? 'sbeam' : 'beam');
  const lvElev = (id: string) => p.levels.find((l) => l.id === id)?.elevation ?? 0;
  const freeBeam = !!(bi.p1 && bi.p2);
  const hon1 = freeBeam ? p.columns.find((c) => c.id === bi.ref1) : columnAtNode(p, bi.x1, bi.y1, bi.level);
  const hon2 = freeBeam ? p.columns.find((c) => c.id === bi.ref2) : columnAtNode(p, bi.x2, bi.y2, bi.level);
  const isOobari = !!(hon1 || hon2);

  // 2 tab cố định của màn hình làm việc: nhập 部材 / vị trí cột · dầm đã nhập
  return (
    <>
      <>
      <Section title="Nhập trực tiếp">
        <div className="row-gap">
          <div className="seg">
            {(Object.keys(INPUT_KIND_LABEL) as InputKind[]).map((k) => (
              <button
                key={k}
                className={pk.kind === k && !pk.fix && !pk.del && !pk.cut && !pk.merge ? 'on' : ''}
                onClick={() => {
                  setPk({ ...pk, kind: k, editId: null, start: null, first: null, fix: false, del: false, cut: false, merge: false, data: false, on: pk.fix || pk.del || pk.cut || pk.merge || pk.data ? true : pk.on });
                  if (pk.fix || pk.del || pk.cut || pk.merge) setSelected(null);
                  if (k === 'sbeam') setBeamIn({ ...bi, role: 'sub', end1: 'pin', end2: 'pin', align: 'grid' });
                  if (k === 'beam') setBeamIn({ ...bi, role: undefined });
                }}
              >
                {INPUT_KIND_LABEL[k]}
              </button>
            ))}
            <button
              className={'fix-btn' + (pk.fix ? ' on' : '')}
              title="修正: bấm vào cột / dầm / 部材 đã nhập trên 3D để sửa lại"
              onClick={() => {
                const on = !pk.fix;
                setPk({ ...pk, fix: on, del: false, cut: false, merge: false, on: !on, editId: on ? pk.editId : null, start: null, first: null });
                setPending(null);
                if (!on) setSelected(null);
              }}
            >
              ✎ 修正
            </button>
            <button
              className={'fix-btn del-btn' + (pk.del ? ' on' : '')}
              title="削除: bấm vào cột / dầm / 部材 đã nhập trên 3D để xoá (Delete hoặc Enter để xác nhận)"
              onClick={() => {
                const on = !pk.del;
                setPk({ ...pk, del: on, delSel: [], fix: false, cut: false, merge: false, data: false, on: !on, editId: null, start: null, first: null });
                setPending(null);
                setSelected(null);
              }}
            >
              🗑 削除
            </button>
            <button
              className={'fix-btn' + (pk.cut ? ' on' : '')}
              title="切断: bấm cột / dầm cần cắt, rồi bấm đường chuẩn (đường trục, đường tầng, 補助線 hoặc 部材)"
              onClick={() => {
                const on = !pk.cut;
                setPk({ ...pk, cut: on, cutSrc: null, opMsg: null, del: false, fix: false, merge: false, data: false, on: !on, editId: null, start: null, first: null });
                setPending(null);
                setSelected(null);
              }}
            >
              ✂ 切断
            </button>
            <button
              className={'fix-btn' + (pk.merge ? ' on' : '')}
              title="結合: bấm 2 cây thẳng hàng (2 dầm hoặc 2 cột) để gộp thành 1, nối bằng SPL hoặc hàn"
              onClick={() => {
                const on = !pk.merge;
                setPk({ ...pk, merge: on, mergeSrc: null, opMsg: null, del: false, fix: false, cut: false, data: false, on: !on, editId: null, start: null, first: null });
                setPending(null);
                setSelected(null);
              }}
            >
              ⧉ 結合
            </button>
            <button
              className={'fix-btn' + (pk.data ? ' on' : '')}
              title="データ: nối đầu cột / dầm tới điểm khác hoặc tới đường chuẩn; bảng toạ độ điểm đầu / cuối"
              onClick={() => {
                const on = !pk.data;
                setPk({ ...pk, data: on, dataSrc: null, dataLine: null, opMsg: null, del: false, fix: false, cut: false, merge: false, on: !on, editId: null, start: null, first: null });
                setPending(null);
                setSelected(null);
              }}
            >
              ⇔ データ
            </button>
            <button className="fix-btn" onClick={() => checkClash?.()} title="Kiểm tra va chạm giữa mọi cột, dầm, kèo, giằng">
              ⚠ 干渉チェック
            </button>
          </div>
          <label className="check">
            <input type="checkbox" checked={pk.on} onChange={(e) => setPk({ ...pk, on: e.target.checked, start: null, fix: e.target.checked ? false : pk.fix })} /> 🖱 Bấm trên 3D
          </label>
          <label className="check">
            <input type="checkbox" checked={pk.preview !== false} onChange={(e) => { setPk({ ...pk, preview: e.target.checked }); if (!e.target.checked) setPending(null); }} /> 👁 Xem trước rồi xác nhận
          </label>
        </div>
        {pk.fix && (pk.fixSel?.length ?? 0) > 1 && <MultiFix p={p} set={set} sel={pk.fixSel!} label={srcLabel} onDone={(n) => { setMsg({ ok: true, text: `Đã sửa ${n} 部材. (Hoàn tác: nút ↶)` }); }} onClear={() => setPk({ ...pk, fixSel: [] })} />}
        {pk.fix && !pk.editId && (pk.fixSel?.length ?? 0) <= 1 && <div className="alert info small">修正: bấm 1 cây để sửa, hoặc kéo khung trên 3D để quét chọn nhiều cây và sửa cùng lúc (Shift: thêm / bớt).</div>}
        {pk.del && (delSel.length ? (
          <div className="alert error del-bar">
            Xoá {delSel.length} 部材: {Object.entries(delSel.map(srcLabel).reduce<Record<string, number>>((a, k) => ((a[k] = (a[k] ?? 0) + 1), a), {})).map(([k, n]) => (n > 1 ? `${k} ×${n}` : k)).join(', ')}?
            <button className="danger" autoFocus onClick={doDelete}>🗑 Xoá ({delSel.length})</button>
            <button onClick={() => setPk({ ...pk, delSel: [] })}>Bỏ chọn</button>
          </div>
        ) : <div className="alert info small">削除: bấm từng cây, hoặc kéo khung trên 3D để quét chọn nhiều cây (kéo trái → phải: chỉ chọn cây nằm trọn trong khung; phải → trái: chọn cả cây chạm khung; giữ Shift để chọn thêm). Alt + kéo để xoay.</div>)}
        {pk.cut && (
          <div className="alert info small">
            ✂ 切断: {pk.cutSrc ? <>đang cắt <b>{srcLabel(pk.cutSrc)}</b> – bấm đường chuẩn trên 3D: đường trục, đường / nhãn tầng, 補助線 hoặc 部材.</> : 'bấm cột hoặc dầm cần cắt trên 3D.'}
            <div className="edit-bar" style={{ marginTop: 6 }}>
              <span>継手 chỗ cắt</span>
              <Sel
                value={pk.cutJoint ?? (pk.cutSpl === false ? 'none' : '')}
                onChange={(v) => setPk({ ...pk, cutJoint: v, cutSpl: v !== 'none' })}
                options={[
                  { value: '', label: 'Tự động (theo 継手 của cây)' },
                  { value: 'none', label: 'Cắt rời – không 継手' },
                  ...p.joints.filter((q) => q.type === 'SPL' || q.type === 'EP').map((q) => ({ value: q.id, label: `${q.name} · ${jointTypeName(q.type)}` })),
                ]}
              />
              <label className="check">
                Khoảng hở 2 cây (mm){' '}
                <input
                  type="text"
                  inputMode="decimal"
                  style={{ width: 70 }}
                  placeholder="theo SPL"
                  value={pk.cutGap ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setPk({ ...pk, cutGap: v === '' || isNaN(+v) ? null : +v });
                  }}
                />
              </label>
              {pk.cutSrc && (() => {
                const j = pk.cutJoint === 'none' || pk.cutSpl === false ? undefined : (pk.cutJoint ? p.joints.find((q) => q.id === pk.cutJoint) : undefined) ?? memberSpl(p, pk.cutSrc);
                return <span className="muted">{j ? `継手: ${j.name} (${jointTypeName(j.type)}) · すきま ${jointGap(j)}` : 'Không có 継手 → cắt rời'}</span>;
              })()}
            </div>
            <div className="muted" style={{ marginTop: 4 }}>Sau khi cắt, điểm đầu / cuối của 2 cây xem và sửa bằng lệnh ⇔ データ.</div>
          </div>
        )}
        {pk.merge && (
          <div className="alert info small">
            ⧉ 結合: 2 cây giữ nguyên, nối tại 2 đầu gần nhau. Mối nối vẽ và ghi theo 継手 đã chọn (SPL, エレクションピース…).
            <div className="edit-bar mrow" style={{ marginTop: 6 }}>
              <span>継手</span>
              <Sel
                value={pk.mergeJoint ?? ''}
                onChange={(v) => setPk({ ...pk, mergeJoint: v })}
                options={[
                  { value: '', label: 'Tự động (theo 継手 giữa của cây)' },
                  { value: 'weld', label: 'Hàn (溶接) – không 継手' },
                  ...p.joints.filter((q) => q.type === 'SPL' || q.type === 'EP').map((q) => ({ value: q.id, label: `${q.name} · ${jointTypeName(q.type)}` })),
                ]}
              />
            </div>
            <div className="edit-bar" style={{ marginTop: 6 }}>
              <label className="check">
                <input type="checkbox" checked={pk.mergePlate !== false} onChange={(e) => setPk({ ...pk, mergePlate: e.target.checked })} /> Mối hàn: thêm 合掌プレート (sửa kích thước, vị trí ở tab 継手)
              </label>
            </div>
            <div style={{ marginTop: 4 }}>{pk.mergeSrc ? <>Cây 1: <b>{srcLabel(pk.mergeSrc)}</b> – bấm cây thứ 2.</> : 'Bấm cây thứ 1 rồi cây thứ 2.'}</div>
          </div>
        )}
        {pk.data && (
          <div className="alert info small">
            <div className="edit-bar">
              <button className={(pk.dataHow ?? 'pt') === 'pt' ? 'on' : ''} onClick={() => setPk({ ...pk, dataHow: 'pt', dataSrc: null, dataLine: null, opMsg: null })}>① Điểm → điểm</button>
              <button className={pk.dataHow === 'line' ? 'on' : ''} onClick={() => setPk({ ...pk, dataHow: 'line', dataSrc: null, dataLine: null, opMsg: null })}>② Đường chuẩn → 部材</button>
            </div>
            <div style={{ marginTop: 4 }}>
              {(pk.dataHow ?? 'pt') === 'pt'
                ? pk.dataSrc
                  ? <>Đang sửa điểm {pk.dataSrc.k === 0 ? 'đầu' : 'cuối'} của <b>{srcLabel(pk.dataSrc.src)}</b> – bấm 部材 / đường trục / tầng / 補助線 muốn nối tới.</>
                  : 'Bấm gần đầu cần sửa của cột / dầm trên 3D, rồi bấm điểm muốn nối tới.'
                : pk.dataLine
                  ? <>Đường chuẩn: <b>{pk.dataLine.label}</b> – bấm 部材 cần nối (đầu gần đường chuẩn kéo dài / cắt ngắn tới đó).</>
                  : 'Bấm đường chuẩn (đường trục, đường / nhãn tầng, 補助線), rồi bấm 部材 cần nối.'}
            </div>
          </div>
        )}
        {(pk.cut || pk.merge || pk.data) && pk.opMsg && <div className={'alert small ' + (pk.opMsg.ok ? 'ok' : 'error')}>{pk.opMsg.text}</div>}
        {pk.data && <DataPanel p={p} set={set} members={members} selected={selected} setSelected={setSelected} />}
        <p className="muted small">
          {pk.kind === 'column'
            ? 'Chấm xanh lá ở cao độ chân cột: bấm để đặt 本柱 theo các dòng bên dưới.'
            : pk.kind === 'sbeam'
              ? '小梁: bấm 2 部材 / 補助線 đỡ 2 đầu, chọn đường chuẩn và khoảng cách (mục Vị trí theo đường chuẩn).'
              : isBeam
              ? `Bấm 2 部材 bất kỳ (cột hoặc dầm, mọi cao độ): 部材 1 tô đỏ, bấm 部材 2 là thêm ${INPUT_KIND_LABEL[pk.kind]}. Sửa: dùng ✎ ở danh sách hoặc tắt ô bấm để chọn trên 3D.`
              : pk.kind === 'post'
                ? '間柱: bấm 部材 / 補助線 dưới rồi trên, chọn đường chuẩn và khoảng cách (mục Vị trí theo đường chuẩn).'
                : pk.kind === 'knee'
                  ? '方杖: bấm cột trước, rồi bấm dầm mà 方杖 đỡ.'
                  : 'ブレース: bấm 2 部材 giao nhau (point 1) rồi 2 部材 theo phương chéo (point 2).'}{' '}
          Bấm vào cấu kiện đã có để sửa.
        </p>
        {pending && (
          <div className="alert preview-alert">
            <b>Xem trước:</b> {pending.kind === 'line' ? `${pending.targets.length} ${pending.what === 'post' ? '間柱' : '小梁'} (khoảng cách ${pending.targets.map((t) => t.d).join(', ')})` : pending.kind === 'column' ? `${pending.nodes.length} cột ${ci.memberName}${pending.editId ? ' (sửa)' : ''}` : pending.kind === 'beams' ? `${pending.items.length} 大梁 ${p.master.find((m) => m.id === bi.memberId)?.name ?? ''} nối các cột đã quét chọn` : `dầm ${p.master.find((m) => m.id === bi.memberId)?.name ?? ''}${pending.editId ? ' (sửa)' : ''}`} – màu xanh trên 3D. Chỉnh các dòng bên dưới rồi bấm ✓ Xác nhận cạnh nút Xem trước.
          </div>
        )}
      </Section>

      {(pk.kind === 'post' || pk.kind === 'sbeam') && lineIn && setLineIn && !pk.editId && (
        <Section title={`Vị trí ${INPUT_KIND_LABEL[pk.kind]} theo đường chuẩn`}>
          <div className="seg seg-sm" style={{ marginBottom: 6 }}>
            {([['ds', 'Theo khoảng cách'], ['div', '⇹ Hàng loạt · 2 đường giới hạn'], ['arr', '⇶ Hàng loạt · 1 đường chuẩn']] as const).map(([k, l]) => (
              <button key={k} className={(lineIn.mode ?? 'ds') === k ? 'on' : ''} onClick={() => setLineIn({ ...lineIn, mode: k, ref: '', ref2: '' })}>
                {l}
              </button>
            ))}
          </div>
          <div className="in-rows">
            <MRow n={1} label={pk.kind === 'post' ? 'Điểm đầu (chân)' : 'Điểm đầu'}>
              <div className="row-gap">
                <span className={lineIn.s1 ? 'pill on' : 'muted small'}>{lineIn.s1 ? `${lineIn.s1.kind === 'aux' ? '補助線' : '部材'} ${lineIn.s1.label}` : 'Bấm 部材 / 補助線 trên 3D'}</span>
                {lineIn.s1 && <button className="icon" title="Chọn lại" onClick={() => setLineIn({ ...lineIn, s1: null, s2: null, multi: undefined })}>✕</button>}
              </div>
            </MRow>
            <MRow n={2} label={pk.kind === 'post' ? 'Điểm cuối (đỉnh)' : 'Điểm cuối'}>
              <div className="row-gap">
                <span className={lineIn.s2 ? 'pill on' : 'muted small'}>{lineIn.s2 ? `${lineIn.s2.kind === 'aux' ? '補助線' : '部材'} ${lineIn.s2.label}` : 'Bấm 部材 / 補助線 thứ 2'}</span>
                {lineIn.s2 && <button className="icon" title="Chọn lại" onClick={() => setLineIn({ ...lineIn, s2: null, multi: undefined })}>✕</button>}
              </div>
            </MRow>
            {(lineIn.multi?.length ?? 0) > 2 && <div className="alert info small">Đã quét chọn {lineIn.multi!.length} 大梁 song song ({lineIn.multi!.map((x) => x.label).join(', ')}) → 小梁 tạo giữa {lineIn.multi!.length - 1} cặp kề nhau.</div>}
            <MRow n={3} label={lineIn.mode === 'div' ? 'Đường giới hạn 1' : 'Đường chuẩn'}>
              <Sel value={lineIn.ref} onChange={(v) => setLineIn({ ...lineIn, ref: v })} options={[{ value: '', label: '— chọn trục / tầng / 補助線 (hoặc bấm 部材 xung quanh) —' }, ...refs.map((r) => ({ value: r.key, label: r.label }))]} />
            </MRow>
            {lineIn.mode === 'div' && (
              <MRow n={4} label="Đường giới hạn 2">
                <Sel value={lineIn.ref2 ?? ''} onChange={(v) => setLineIn({ ...lineIn, ref2: v })} options={[{ value: '', label: '— bấm đường thứ 2 trên 3D hoặc chọn ở đây —' }, ...refs.filter((r) => r.key !== lineIn.ref).map((r) => ({ value: r.key, label: r.label }))]} />
              </MRow>
            )}
            {(lineIn.mode ?? 'ds') === 'ds' && <MRow n={4} label="Khoảng cách (mm)">
              <div className="row-gap">
                <Text value={lineIn.ds} onChange={(v) => setLineIn({ ...lineIn, ds: v })} />
                <label className="check" title="Cộng dồn: 3*1500 → 1500, 3000, 4500">
                  <input type="checkbox" checked={lineIn.cum} onChange={(e) => setLineIn({ ...lineIn, cum: e.target.checked })} /> cộng dồn
                </label>
              </div>
            </MRow>}
          </div>
          {lineIn.s1 && lineIn.s2 && lineIn.ref && (lineIn.mode === 'arr' || (lineIn.mode === 'div' && lineIn.ref2)) && (
            <BatchDialog li={lineIn} setLi={setLineIn} refs={refs} what={pk.kind === 'post' ? '間柱' : '小梁'} pending={pending?.kind === 'line' ? pending.targets.length : 0} warn={lineErr} onOk={confirmPending} />
          )}
          <p className="muted small">
            Khoảng cách đo trên mặt bằng, vuông góc với đường chuẩn (dương về phía +X / +Y); với đường tầng: đo theo phương đứng từ cao độ tầng (dương lên trên, = mặt trên 小梁). Nhập nhiều giá trị cách nhau dấu cách, vd <code>1500 3000</code> hoặc <code>3*1500</code>. Khi đủ dữ liệu, hình xem trước xanh hiện trên 3D, bấm ✓ Xác nhận (Enter).{' '}
            {pk.kind === 'post' ? '間柱 đứng từ mặt trên 部材 dưới tới mặt dưới 部材 trên.' : '小梁 nối mặt trên 2 部材 đỡ.'} Có thể bấm 補助線 trên 3D để làm đường chuẩn.
          </p>
          {lineErr && (lineIn.s1 || lineIn.ref) && <div className="alert">{lineErr}</div>}
          {pending?.kind === 'line' && <div className="row-gap">{pendBtns}</div>}
        </Section>
      )}
      {pk.kind === 'brace' && brPick && (
        <Section title="ブレース: point theo giao điểm 2 部材">
          <p className="muted small">
            Chọn loại ở dòng bên dưới: <b>水平ブレース</b> (mặt bằng) hoặc <b>軸ブレース</b> (mặt đứng). Trên 3D bấm 2 部材 giao nhau → point 1, rồi bấm 2 部材 khác theo phương chéo → point 2. Khoảng cách 2 point chỉnh bằng 間隔値 (lùi dọc trục giằng) và 端部上下値 bên dưới.
          </p>
          <div className="row-gap">
            <span className={brPick.q1 ? 'pill on' : 'muted small'}>Point 1: {brPick.q1 ? brPick.n1 : brPick.ids.length && !brPick.q1 ? `${brPick.names[0]} × …` : 'chưa chọn'}</span>
            <span className="muted small">Point 2: {brPick.q1 ? (brPick.ids.length ? `${brPick.names[0]} × …` : 'bấm 2 部材') : '—'}</span>
            {(brPick.q1 || brPick.ids.length > 0) && <button className="icon" title="Chọn lại" onClick={() => setBrPick?.({ ids: [], names: [] })}>✕</button>}
          </div>
        </Section>
      )}
      {isCol && (
        <Section title={editCol ? `Sửa ${INPUT_KIND_LABEL[pk.kind]} ${editCol.pt ? editCol.pt.join(', ') : `${gName('x', editCol.x)}-${gName('y', editCol.y)}`} (${mName(editCol.memberId)})` : `Nhập ${INPUT_KIND_LABEL[pk.kind]}`}>
          <div className="in-rows">
            {(() => {
              // cột đã nhập nhưng không dựng được → báo lý do
              const built = new Set(members.filter((m) => m.kind === 'column').map((m) => m.source));
              const bad = p.columns.filter((c) => !built.has(c.id));
              const noMaster = !!ci.memberName && !colMaster.some((m) => m.name === ci.memberName.trim());
              if (!bad.length && !noMaster) return null;
              return (
                <div className="alert error small">
                  {noMaster && <div>⚠ 部材名 “{ci.memberName}” không có trong master cột → chọn lại ở dòng ① rồi mới xác nhận.</div>}
                  {bad.length > 0 && (
                    <div>
                      ⚠ {bad.length} cột đã nhập nhưng không dựng được:{' '}
                      {bad.slice(0, 6).map((c) => `${c.pt ? 'pt' : `${gName('x', c.x)}-${gName('y', c.y)}`} (${columnIssue(p, c) ?? 'dữ liệu toạ độ lỗi'})`).join(' · ')}
                      {bad.length > 6 ? ' …' : ''}
                    </div>
                  )}
                </div>
              );
            })()}
            <MRow n={1} label="部材名">
              <Sel value={ci.memberName} onChange={(v) => { const m = colMaster.find((x) => x.name === v); colUpd({ memberName: v, sectionId: m?.sectionId ?? ci.sectionId, material: m?.material ?? ci.material }); }} options={[...(cm ? [] : [{ value: ci.memberName, label: ci.memberName ? `⚠ ${ci.memberName}` : '— chọn —' }]), ...colMaster.map((m) => ({ value: m.name, label: `${m.name} – ${p.sections.find((s) => s.id === m.sectionId)?.code ?? '?'} / ${m.material}` }))]} />
              {!colMaster.length && <div className="muted small">Chưa có 部材名 cột: khai báo ở Master trước.</div>}
            </MRow>
            <MRow n={2} label="Điểm chuẩn">
              <AnchorPicker value={ci.anchor} onPick={(i) => colUpd({ anchor: i })} section={sec ? { b: sec.b, h: sec.h, outline } : undefined} />
            </MRow>
            <MRow n={3} label="Xoay · Dịch">
              <div className="row-gap">
                <div style={{ flex: 1 }}>
                  <div className="row-gap" style={{ marginBottom: 4 }}>
                    <span data-dim="col-rot"><Num value={ci.rotation} step={15} onChange={(v) => colUpd({ rotation: v })} /></span>
                    {[0, 90, 180, 270].map((a) => (
                      <button key={a} className={ci.rotation === a ? 'on' : ''} onClick={() => colUpd({ rotation: a })}>
                        {a}°
                      </button>
                    ))}
                  </div>
                  <div className="grid2">
                    <Field label="Dịch X (mm)" dim="col-dx">
                      <Num value={ci.dx} step={10} onChange={(v) => colUpd({ dx: v })} />
                    </Field>
                    <Field label="Dịch Y (mm)" dim="col-dy">
                      <Num value={ci.dy} step={10} onChange={(v) => colUpd({ dy: v })} />
                    </Field>
                  </div>
                </div>
                {sec && <PlacementPreview ci={ci} outline={outline} b={sec.b} h={sec.h} />}
              </div>
            </MRow>
{pk.kind !== 'post' && (
            <MRow n={4} label="Chân · Đỉnh cột">
              <div className="mrow-pair">
                <Sel value={ci.base} onChange={(v) => colUpd({ base: v })} options={lOpts(p)} />
                <Sel value={ci.top} onChange={(v) => colUpd({ top: v })} options={lOpts(p)} />
              </div>
              <div className="grid2" style={{ marginTop: 6 }}>
                <Field label="Cao độ chân ± tầng (mm)">
                  <Num signed value={ci.dzb ?? 0} step={50} onChange={(v) => colUpd({ dzb: v })} />
                </Field>
                <Field label="Cao độ đỉnh ± tầng (mm)">
                  <Num signed value={ci.dzt ?? 0} step={50} onChange={(v) => colUpd({ dzt: v })} />
                </Field>
              </div>
            </MRow>
)}
            {pk.kind === 'post' ? (
              <MRow n={5} label="Vị trí">
                {editCol?.pt ? (
                  <div className="mrow-pair">
                    <Num value={editCol.pt[0]} step={50} onChange={(v) => set((d) => void (d.columns.find((c) => c.id === editCol.id)!.pt = [v, editCol.pt![1]]))} />
                    <Num value={editCol.pt[1]} step={50} onChange={(v) => set((d) => void (d.columns.find((c) => c.id === editCol.id)!.pt = [editCol.pt![0], v]))} />
                  </div>
                ) : (
                  <div className="muted small">Đặt theo mục "Vị trí 間柱 theo đường chuẩn" ở trên.</div>
                )}
              </MRow>
            ) : (
            <MRow n={5} label={editCol ? 'Vị trí' : 'Vị trí (chọn nhiều)'}>
              <div className="field-label">Trục X</div>
              <div className="chips">{p.gridsX.map((g) => chip('x', g.id, g.name))}</div>
              <div className="field-label" style={{ marginTop: 4 }}>
                Trục Y
              </div>
              <div className="chips">{p.gridsY.map((g) => chip('y', g.id, g.name))}</div>
            </MRow>
            )}
            <MRow n={6} label="継手 · アンカーベース">
              <div className="grid3">
                <Field label="下継手距離 (từ chân)">
                  <Num value={ci.jLo} step={100} onChange={(v) => colUpd({ jLo: Math.max(0, v) })} />
                </Field>
                <Field label="上継手距離 (từ đỉnh)">
                  <Num value={ci.jHi} step={100} onChange={(v) => colUpd({ jHi: Math.max(0, v) })} />
                </Field>
                <Field label="すきま">
                  <Num value={ci.gap} step={5} onChange={(v) => colUpd({ gap: Math.max(0, v) })} />
                </Field>
              </div>
              <Field label="アンカーベース">
                <Sel value={ci.baseId} onChange={(v) => colUpd({ baseId: v })} options={[{ value: '', label: `Theo 部材名${p.bases.find((b) => cm && b.memberIds.includes(cm.id)) ? ` (${p.bases.find((b) => cm && b.memberIds.includes(cm.id))!.name})` : ''}` }, ...p.bases.map((b) => ({ value: b.id, label: `${b.name} – ${b.kind} PL-${b.t}×${b.b}×${b.d}` }))]} />
              </Field>
              <div className="muted small">Mm, 0 = không nối. Cột được chia thành đoạn tại 継手 (vd 下継手距離 1000 = nối cách chân 1 m). アンカーベース chỉ gắn ở đoạn chân.</div>
            </MRow>
            <MRow n={7} label="勾配 (柱合わせ)">
              <div className="muted small">Tự động theo tab 勾配 › 勾配設定: cột có đỉnh ở tầng có mặt 勾配 được cắt theo 柱合わせ (水下ダイア / 水上ダイア / 柱芯).</div>
            </MRow>
          </div>
          {msg && <div className={msg.ok ? 'alert ok' : 'alert error'}>{msg.text}</div>}
          <div className="row-gap" style={{ marginTop: 6 }}>
            {editCol ? (
              <>
                <button
                  className="primary"
                  disabled={!cm || !ci.xs[0] || !ci.ys[0]}
                  onClick={() => {
                    if (preview) return setPending({ kind: 'column', nodes: [[ci.xs[0], ci.ys[0]]], editId: editCol.id });
                    set((d) => placeColumnAt(d, ci, ci.xs[0], ci.ys[0], editCol.id));
                    setMsg({ ok: true, text: 'Đã cập nhật cột.' });
                  }}
                >
                  {preview ? '👁 Xem trước' : '✓ Cập nhật'}
                </button>
                {preview && !pending && (
                  <button className="primary" disabled={!cm || !ci.xs[0] || !ci.ys[0]} title="Lưu ngay, không cần xem trước" onClick={() => { set((d) => placeColumnAt(d, ci, ci.xs[0], ci.ys[0], editCol.id)); setMsg({ ok: true, text: 'Đã cập nhật cột.' }); }}>
                    ✓ Xác nhận
                  </button>
                )}
                {pending && pendBtns}
                <button className="danger" onClick={() => { set((d) => void (d.columns = d.columns.filter((c) => c.id !== editCol.id))); stopEdit(); }}>
                  ✕ Xoá cột
                </button>
                <button onClick={stopEdit}>Xong</button>
              </>
            ) : (
              <>
              <button
                className="primary"
                disabled={!cm || !positions}
                onClick={() => {
                  if (preview) return setPending({ kind: 'column', nodes: ci.xs.flatMap((x) => ci.ys.map((y) => [x, y] as [string, string])), editId: null });
                  set((d) => {
                    for (const x of ci.xs) for (const y of ci.ys) placeColumnAt(d, ci, x, y);
                  });
                  setMsg({ ok: true, text: `Đã đặt ${positions} cột ${ci.memberName}.` });
                }}
              >
                {preview ? '👁 Xem trước' : '+ Đặt cột'} ({positions} vị trí)
              </button>
              {preview && !pending && (
                <button className="primary" disabled={!cm || !positions} title="Đặt cột ngay, không cần xem trước" onClick={() => { set((d) => { for (const x of ci.xs) for (const y of ci.ys) placeColumnAt(d, ci, x, y); }); setMsg({ ok: true, text: `Đã đặt ${positions} cột ${ci.memberName}.` }); }}>
                  ✓ Xác nhận
                </button>
              )}
              {pending && pendBtns}
              </>
            )}
          </div>
        </Section>
      )}

      {pk.kind === 'knee' && (
        <Section title="Nhập 方杖">
          <div className="in-rows">
            <MRow n={1} label="部材名">
              <Sel value={kneeIn.memberId} onChange={(v) => setKneeIn({ ...kneeIn, memberId: v })} options={kOpts} />
            </MRow>
            <MRow n={2} label="Cách nhập">
              <div className="seg">
                <button className={kneeIn.mode !== 'ang' ? 'on' : ''} onClick={() => setKneeIn({ ...kneeIn, mode: 'dist' })}>Khoảng cách 2 đầu</button>
                <button className={kneeIn.mode === 'ang' ? 'on' : ''} onClick={() => setKneeIn({ ...kneeIn, mode: 'ang', ang: kneeIn.ang ?? 45, len: kneeIn.len ?? 1000 })}>Góc + chiều dài</button>
              </div>
            </MRow>
            {kneeIn.mode === 'ang' ? (
            <MRow n={3} label="Góc · chiều dài">
              <div className="grid2">
                <Field label="Góc so với dầm (°)">
                  <Num value={kneeIn.ang ?? 45} step={5} onChange={(v) => setKneeIn({ ...kneeIn, ang: Math.max(5, Math.min(85, v)) })} />
                </Field>
                <Field label="Chiều dài 方杖 (mm)">
                  <Num value={kneeIn.len ?? 1000} step={50} onChange={(v) => setKneeIn({ ...kneeIn, len: Math.max(100, v) })} />
                </Field>
              </div>
              <div className="muted small">→ dọc cột {Math.round((kneeIn.len ?? 1000) * Math.sin(((kneeIn.ang ?? 45) * Math.PI) / 180))} mm · dọc dầm {Math.round((kneeIn.len ?? 1000) * Math.cos(((kneeIn.ang ?? 45) * Math.PI) / 180))} mm</div>
            </MRow>
            ) : (
            <MRow n={3} label="Vị trí 2 đầu">
              <div className="grid2">
                <Field label="Dọc cột: dưới mặt dưới dầm (mm)">
                  <Num value={kneeIn.dc} step={50} onChange={(v) => setKneeIn({ ...kneeIn, dc: Math.max(0, v) })} />
                </Field>
                <Field label="Dọc dầm: từ mặt cột (mm)">
                  <Num value={kneeIn.db} step={50} onChange={(v) => setKneeIn({ ...kneeIn, db: Math.max(0, v) })} />
                </Field>
              </div>
            </MRow>
            )}
          </div>
          <p className="muted small">Bấm cột rồi bấm dầm trên 3D để thêm 方杖.</p>
        </Section>
      )}

      {isBeam && (
        <Section title={editBeam ? `Sửa ${INPUT_KIND_LABEL[pk.kind]} ${beamWhere(editBeam)} (${mName(editBeam.memberId)})` : `Nhập ${INPUT_KIND_LABEL[pk.kind]}`}>
          <div className="in-rows">
            <MRow n={1} label="部材名">
              <Sel value={bi.memberId} onChange={(v) => beamUpd({ memberId: v })} options={[...(bOpts.some((o) => o.value === bi.memberId) ? [] : [{ value: bi.memberId, label: '— chọn —' }]), ...bOpts]} />
            </MRow>
            {pk.kind === 'sbeam' ? (
            <MRow n={2} label="小梁 勾配">
              <div className="sl-pics">
                {(Object.keys(SUB_SLOPE_LABEL) as SubSlope[]).map((k) => (
                  <button key={k} className={'sl-pic' + ((bi.sl ?? 'sup') === k ? ' on' : '')} onClick={() => beamUpd({ sl: k })}>
                    <SubSlopeIcon k={k} />
                    <span>{SUB_SLOPE_LABEL[k]}</span>
                  </button>
                ))}
              </div>
              <div className="mrow-pair" style={{ marginTop: 4 }}>
                <span className="small muted" style={{ alignSelf: 'center' }}>Lệch mặt trên (mm)</span>
                <Num value={bi.sdz ?? 0} step={10} onChange={(v) => beamUpd({ sdz: v })} />
              </div>
              {bi.sl === 'face' && (
                <div className="mrow-pair" style={{ marginTop: 4 }}>
                  <span className="small muted" style={{ alignSelf: 'center' }}>Mặt 勾配 của tầng</span>
                  <Sel value={bi.level} onChange={(v) => beamUpd({ level: v })} options={lOpts(p)} />
                </div>
              )}
              <div className="muted small">
                {(bi.sl ?? 'sup') === 'sup'
                  ? 'Mặt trên 小梁 nối đúng line mặt trên của 2 部材 đỡ tại 2 đầu → 小梁 tự dốc theo 大梁 (mái dốc RSL).'
                  : bi.sl === 'face'
                    ? 'Mặt trên 小梁 nằm trên mặt 勾配 (勾配設定) của tầng.'
                    : '小梁 nằm ngang, mặt trên bằng mặt trên 部材 đỡ thấp hơn.'}
                {bi.sdz ? ` Hạ / nâng thêm ${bi.sdz} mm.` : ''}
              </div>
            </MRow>
            ) : (
            <MRow n={2} label="Cao độ dầm">
              <div className="mrow-pair">
                <Sel value={bi.level} onChange={(v) => beamUpd({ level: v })} options={lOpts(p)} />
                <Num value={bi.dz} step={10} onChange={(v) => beamUpd({ dz: v })} />
              </div>
              <div className="seg seg-sm" style={{ marginTop: 4 }}>
                <span className="small muted" style={{ alignSelf: 'center', marginRight: 4 }}>上下基準</span>
                {(Object.keys(BEAM_VREF_LABEL) as BeamVRef[]).map((a) => (
                  <button key={a} className={bi.vref === a ? 'on' : ''} onClick={() => beamUpd({ vref: a })}>
                    {BEAM_VREF_LABEL[a]}
                  </button>
                ))}
              </div>
              <div className="muted small">
                {bi.vref === 'top' ? 'Mặt trên' : bi.vref === 'center' ? 'Tâm' : 'Mặt dưới'} dầm = {lvName(bi.level)} {bi.dz >= 0 ? '+' : '−'} {Math.abs(bi.dz)} = {(lvElev(bi.level) + bi.dz + p.params.member.beamTopOffset).toLocaleString()} mm
                {p.params.member.beamTopOffset ? ` (đã gồm offset tiêu chuẩn ${p.params.member.beamTopOffset})` : ''}
              </div>
            </MRow>
            )}
            <MRow n={3} label="Vị trí dầm">
              <div className="seg seg-sm" style={{ marginBottom: 4 }}>
                <button className={freeBeam ? 'on' : ''} onClick={() => !freeBeam && beamUpd({ p1: [0, 0], p2: [1000, 0], ref1: '', ref2: '' })}>
                  Theo 2 部材
                </button>
                <button className={!freeBeam ? 'on' : ''} onClick={() => beamUpd({ p1: null, p2: null, ref1: '', ref2: '' })}>
                  Theo giao trục
                </button>
              </div>
              {freeBeam ? (
                <table className="table small lr-table">
                  <thead>
                    <tr>
                      <th />
                      <th>部材</th>
                      <th>X (mm)</th>
                      <th>Y (mm)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {([1, 2] as const).map((k) => {
                      const pt = (k === 1 ? bi.p1 : bi.p2)!;
                      const setPt = (i: 0 | 1, v: number) => {
                        const n: [number, number] = [...pt];
                        n[i] = v;
                        beamUpd(k === 1 ? { p1: n } : { p2: n });
                      };
                      return (
                        <tr key={k}>
                          <td>{k === 1 ? '左側' : '右側'}</td>
                          <td className="small">{refName(k === 1 ? bi.ref1 : bi.ref2) || '–'}</td>
                          <td>
                            <Num value={pt[0]} step={50} onChange={(v) => setPt(0, v)} />
                          </td>
                          <td>
                            <Num value={pt[1]} step={50} onChange={(v) => setPt(1, v)} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
              <div className="beam-pos">
                <span className="small">Từ</span>
                <Sel value={bi.x1} onChange={(v) => beamUpd({ x1: v })} options={gOpts(p, 'x')} />
                <Sel value={bi.y1} onChange={(v) => beamUpd({ y1: v })} options={gOpts(p, 'y')} />
                <span className="small">đến</span>
                <Sel value={bi.x2} onChange={(v) => beamUpd({ x2: v })} options={gOpts(p, 'x')} />
                <Sel value={bi.y2} onChange={(v) => beamUpd({ y2: v })} options={gOpts(p, 'y')} />
              </div>
              )}
              <div className="muted small">
                Trên 3D: bấm 2 部材 bất kỳ (cột hoặc dầm, ở mọi cao độ). Cột → tâm cột; dầm → điểm bấm trên trục dầm; cột + dầm hoặc 2 dầm song song → dầm mới vuông góc. Tầng = tầng gần nhất với chỗ bấm, cao độ tính theo dòng 2.
              </div>
            </MRow>
            <MRow n={4} label="配置基準 · Độ lệch">
              <div className="seg seg-sm" style={{ marginBottom: 4 }}>
                {(Object.keys(BEAM_PLACE_LABEL) as BeamPlace[]).map((a) => (
                  <button key={a} className={bi.place === a ? 'on' : ''} onClick={() => beamUpd({ place: a })}>
                    {BEAM_PLACE_LABEL[a]}
                  </button>
                ))}
              </div>
              <div className="row-gap">
                <Num value={bi.off} step={25} onChange={(v) => beamUpd({ off: v })} />
                <span className="muted small">mm, ngang so với trục (+ = bên trái khi nhìn từ đầu → cuối)</span>
              </div>
            </MRow>
            <MRow n={5} label="So với 本柱 (大梁)">
              <div className="seg seg-sm">
                {(Object.keys(BEAM_ALIGN_LABEL) as BeamAlign[]).map((a) => (
                  <button key={a} className={bi.align === a ? 'on' : ''} disabled={!isOobari && a !== 'grid'} onClick={() => beamUpd({ align: a })}>
                    {BEAM_ALIGN_LABEL[a]}
                  </button>
                ))}
              </div>
              <div className="muted small">
                {isOobari
                  ? `大梁: đầu dầm có 本柱 ${[hon1, hon2].filter(Boolean).map((c) => mName(c!.memberId)).join(', ')}. 外面/内面合わせ: mặt dầm thẳng mặt ngoài / trong cột (ngoài = phía xa tâm nhà). Độ lệch ở dòng 4 cộng thêm.`
                  : 'Không có 本柱 ở đầu dầm (小梁): dầm theo trục + độ lệch.'}
              </div>
            </MRow>
            <MRow n={6} label="左側 · 右側">
              <table className="table small lr-table">
                <thead>
                  <tr>
                    <th />
                    <th>左側 (đầu)</th>
                    <th>右側 (cuối)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Liên kết</td>
                    {([1, 2] as const).map((k) => {
                      const v = k === 1 ? bi.end1 : bi.end2;
                      return (
                        <td key={k}>
                          <Sel value={v} onChange={(x) => beamUpd(k === 1 ? { end1: x as BeamEnd } : { end2: x as BeamEnd })} options={(Object.keys(BEAM_END_LABEL) as BeamEnd[]).map((e) => ({ value: e, label: BEAM_END_LABEL[e] }))} />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>継手距離</td>
                    {([1, 2] as const).map((k) => {
                      const rigid = (k === 1 ? bi.end1 : bi.end2) === 'rigid';
                      const v = k === 1 ? bi.j1 : bi.j2;
                      return (
                        <td key={k}>
                          {rigid ? <Num value={v} step={50} onChange={(x) => beamUpd(k === 1 ? { j1: Math.max(0, x) } : { j2: Math.max(0, x) })} /> : <span className="muted small">– (GPL)</span>}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>継手</td>
                    {([1, 2] as const).map((k) => {
                      const rigid = (k === 1 ? bi.end1 : bi.end2) === 'rigid';
                      const pos: JointPos = rigid ? 'mid' : k === 1 ? 'left' : 'right';
                      const own = editBeam?.joints?.[pos];
                      const jid = own !== undefined ? own : p.master.find((m) => m.id === bi.memberId)?.joints?.[pos];
                      const jn = p.joints.find((j) => j.id === jid)?.name;
                      return (
                        <td key={k} className="small">
                          {JOINT_POS_LABEL[pos]} {rigid ? 'ブラケット' : 'GPL'}: <b>{jn ?? <span className="muted">chưa gán</span>}</b>
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td>上下</td>
                    <td>
                      <Num value={bi.up1} step={10} onChange={(v) => beamUpd({ up1: v })} />
                    </td>
                    <td>
                      <Num value={bi.up2} step={10} onChange={(v) => beamUpd({ up2: v })} />
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="row-gap" style={{ marginTop: 4 }}>
                <span className="small">継手距離 tính từ</span>
                <div className="seg seg-sm">
                  {(['center', 'face'] as const).map((r) => (
                    <button key={r} className={bi.jRef === r ? 'on' : ''} onClick={() => beamUpd({ jRef: r })}>
                      {r === 'center' ? 'Tâm cột (柱芯)' : 'Mép cột (柱面)'}
                    </button>
                  ))}
                </div>
                <span className="small">すきま</span>
                <Num value={bi.gap} step={5} onChange={(v) => beamUpd({ gap: Math.max(0, v) })} />
              </div>
              <div className="muted small">
                剛接合: dầm có ブラケット hàn vào cột, 継手距離 = khoảng cách từ {bi.jRef === 'face' ? 'mép cột' : 'tâm cột'} tới mép ngoài ブラケット (vd 1200), mối nối là 継手 中. ピン接合: đầu dầm nối GPL, mối nối là 継手 左 / 右. 上下 khác nhau ở 2 đầu → dầm dốc. Đổi 継手 riêng từng dầm ở tab 本体 › 継手.
              </div>
            </MRow>
            <MRow n={7} label="勾配">
              <div className="muted small">Tự động theo tab 勾配 › 勾配設定: dầm nằm trong mặt 勾配 của tầng nghiêng theo 柱合わせ位置.</div>
            </MRow>
            <MRow n={8} label="Hướng lắp">
              <div className="seg seg-sm">
                <button className={bi.dir === '' ? 'on' : ''} onClick={() => beamUpd({ dir: '' })}>
                  Theo パラメーター ({(p.params.member.beamDir ?? 'asc') === 'asc' ? 'tăng dần' : 'giảm dần'})
                </button>
                {(Object.keys(BEAM_DIR_LABEL) as BeamDir[]).map((k) => (
                  <button key={k} className={bi.dir === k ? 'on' : ''} onClick={() => beamUpd({ dir: k })}>
                    {BEAM_DIR_LABEL[k]}
                  </button>
                ))}
              </div>
              <div className="muted small">Hướng lắp quyết định đầu nào là 左側 (đầu) và 右側 (cuối): mặc định theo chiều tăng của trục X, Y, quản lý ở パラメーター.</div>
            </MRow>
          </div>
          {msg && <div className={msg.ok ? 'alert ok' : 'alert error'}>{msg.text}</div>}
          <div className="row-gap" style={{ marginTop: 6 }}>
            <button
              className="primary"
              onClick={() => {
                let err: string | undefined;
                if (preview) {
                  err = saveBeam(structuredClone(p), bi, editBeam?.id);
                  if (err) return setMsg({ ok: false, text: err });
                  return setPending({ kind: 'beam', editId: editBeam?.id ?? null });
                }
                set((d) => void (err = saveBeam(d, bi, editBeam?.id)));
                setMsg(err ? { ok: false, text: err } : { ok: true, text: editBeam ? 'Đã cập nhật dầm.' : 'Đã thêm dầm.' });
              }}
            >
              {preview ? '👁 Xem trước' : editBeam ? '✓ Cập nhật' : '+ Thêm dầm'}
            </button>
            {preview && !pending && (
              <button className="primary" title="Lưu ngay, không cần xem trước" onClick={() => { let err: string | undefined; set((d) => void (err = saveBeam(d, bi, editBeam?.id))); setMsg(err ? { ok: false, text: err } : { ok: true, text: editBeam ? 'Đã cập nhật dầm.' : 'Đã thêm dầm.' }); }}>
                ✓ Xác nhận
              </button>
            )}
            {pending && pendBtns}
            {editBeam && (
              <>
                <button className="danger" onClick={() => { set((d) => void (d.beams = d.beams.filter((b) => b.id !== editBeam.id))); stopEdit(); }}>
                  ✕ Xoá dầm
                </button>
                <button onClick={stopEdit}>Xong</button>
              </>
            )}
          </div>
        </Section>
      )}

      {pk.kind === 'brace' && (
        <Section title={editBrace ? `Sửa giằng ${gName('x', editBrace.x1)}${gName('y', editBrace.y1)} – ${gName('x', editBrace.x2)}${gName('y', editBrace.y2)} (${mName(editBrace.memberId)})` : 'ブレース既製品入力'}>
          <div className="in-rows">
            <MRow n={1} label="部材名">
              <Sel value={ri.memberId} onChange={(v) => braceUpd({ memberId: v })} options={[...(rOpts.some((o) => o.value === ri.memberId) ? [] : [{ value: ri.memberId, label: '— chọn —' }]), ...rOpts]} />
              {rSec && <div className="muted small">{rSec.code}{rSec.type === 'Rod' ? ' · フルブレース (ターンバックル JIS A5540)' : ''}</div>}
            </MRow>
            <MRow n={2} label="Mặt phẳng · X入力">
              <div className="row-gap">
                <div className="seg seg-sm">
                  {(['plan', 'wall'] as const).map((k) => (
                    <button key={k} className={ri.plane === k ? 'on' : ''} onClick={() => braceUpd({ plane: k, ...(k !== 'plan' ? braceSpan(ri.level, ri.top) : {}) })}>
                      {k === 'plan' ? '水平ブレース (mặt bằng)' : '軸ブレース (mặt đứng)'}
                    </button>
                  ))}
                </div>
                <label className="check">
                  <input type="checkbox" checked={ri.x} onChange={(e) => braceUpd({ x: e.target.checked })} /> X入力 する
                </label>
              </div>
            </MRow>
            <MRow n={3} label={ri.plane === 'plan' ? 'Tầng đặt' : 'Tầng dưới · trên'}>
              {ri.plane === 'plan' ? (
                <Sel value={ri.level} onChange={(v) => braceUpd({ level: v, top: v })} options={lOpts(p)} />
              ) : (
                <div className="mrow-pair">
                  <Sel value={ri.level} onChange={(v) => braceUpd(braceSpan(v, ri.top))} options={lOpts(p)} />
                  <Sel value={ri.top} onChange={(v) => braceUpd({ top: v })} options={lOpts(p)} />
                </div>
              )}
            </MRow>
            <MRow n={4} label="Khoang (2 giao trục)">
              <div className="beam-pos">
                <span className="small">Từ</span>
                <Sel value={ri.x1} onChange={(v) => braceUpd({ x1: v })} options={gOpts(p, 'x')} />
                <Sel value={ri.y1} onChange={(v) => braceUpd({ y1: v })} options={gOpts(p, 'y')} />
                <span className="small">đến</span>
                <Sel value={ri.x2} onChange={(v) => braceUpd({ x2: v })} options={gOpts(p, 'x')} />
                <Sel value={ri.y2} onChange={(v) => braceUpd({ y2: v })} options={gOpts(p, 'y')} />
              </div>
              <div className="muted small">{ri.plane === 'plan' ? 'Hai góc chéo của khoang.' : 'Hai giao trục trên cùng một đường trục (giằng từ chân giao trục 1 lên đỉnh giao trục 2).'} Hoặc bấm trên 3D.</div>
            </MRow>
            <MRow n={5} label="間隔基準">
              <div className="seg seg-sm">
                {(Object.keys(BRACE_REF_LABEL) as BraceRef[]).map((a) => (
                  <button key={a} className={ri.ref === a ? 'on' : ''} onClick={() => braceUpd({ ref: a })}>
                    {BRACE_REF_LABEL[a]}
                  </button>
                ))}
              </div>
              <table className="table small lr-table" style={{ marginTop: 4 }}>
                <thead>
                  <tr>
                    <th />
                    <th>Đầu 1</th>
                    <th>Đầu 2</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>間隔値</td>
                    <td>
                      <Num value={ri.gap1} step={10} onChange={(v) => braceUpd({ gap1: Math.max(0, v) })} />
                    </td>
                    <td>
                      <Num value={ri.gap2} step={10} onChange={(v) => braceUpd({ gap2: Math.max(0, v) })} />
                    </td>
                  </tr>
                  <tr>
                    <td>端部上下値</td>
                    <td>
                      <Num value={ri.dz1} step={10} onChange={(v) => braceUpd({ dz1: v })} />
                    </td>
                    <td>
                      <Num value={ri.dz2} step={10} onChange={(v) => braceUpd({ dz2: v })} />
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="muted small">
                間隔値: lùi đầu giằng theo trục giằng (mm){ri.ref === 'face' ? ', tính từ mặt cột (相手側鋼材面)' : ', tính từ giao điểm trục'}. 端部上下値: cao độ đầu giằng so với {ri.plane === 'plan' ? 'cao độ tầng (âm = thấp hơn mặt trên dầm)' : 'chân / đỉnh'}.
              </div>
            </MRow>
          </div>
          {msg && <div className={msg.ok ? 'alert ok' : 'alert error'}>{msg.text}</div>}
          <div className="row-gap" style={{ marginTop: 6 }}>
            <button
              className="primary"
              onClick={() => {
                let err: string | undefined;
                set((d) => void (err = saveBrace(d, ri, editBrace?.id)));
                setMsg(err ? { ok: false, text: err } : { ok: true, text: editBrace ? 'Đã cập nhật giằng.' : `Đã thêm giằng${ri.x ? ' chữ X' : ''}.` });
              }}
            >
              {editBrace ? '✓ Cập nhật' : '+ Thêm giằng'}
            </button>
            {editBrace && (
              <>
                <button className="danger" onClick={() => { set((d) => void (d.braces = (d.braces ?? []).filter((b) => b.id !== editBrace.id))); stopEdit(); }}>
                  ✕ Xoá giằng
                </button>
                <button onClick={stopEdit}>Xong</button>
              </>
            )}
          </div>
        </Section>
      )}

      </>
    </>
  );
}


// ================= 継手: BẤM POINT TRÊN 3D ĐỂ SỬA =================
function JointAssignPanel({ p, set, jp, setJp, plateEdit, setPlateEdit, members }: MainTabProps) {
  // Mọi thay đổi ở đây là bản nháp: chỉ ghi vào công trình khi bấm ✓ Xác nhận
  const [ops, setOps] = useState<((d: Project) => void)[]>([]);
  useEffect(() => setOps([]), [jp]);
  const q = useMemo(() => {
    if (!ops.length) return p;
    const d = structuredClone(p) as Project;
    ops.forEach((o) => o(d));
    return d;
  }, [p, ops]);
  const edit = (fn: (d: Project) => void) => setOps((o) => [...o, fn]);
  const confirm = () => {
    const list = ops;
    set((d) => list.forEach((o) => o(d)));
    setOps([]);
  };

  const gName = (axis: 'x' | 'y', id: string) => (axis === 'x' ? q.gridsX : q.gridsY).find((g) => g.id === id)?.name ?? '?';
  const jName = (id?: string) => q.joints.find((j) => j.id === id)?.name;
  const [src, pos] = (jp ?? '|').split('|') as [string, JointPos];
  const beam = q.beams.find((b) => b.id === src);
  const col = q.columns.find((c) => c.id === src);
  const brace = (q.braces ?? []).find((b) => b.id === src);
  const knee = (q.knees ?? []).find((k) => k.id === src);
  const gus = brace ?? knee;
  const it = beam ?? col ?? gus;
  const target: JointTarget = beam ? 'beam' : col ? 'column' : 'brace';
  const m = it ? q.master.find((x) => x.id === it.memberId) : undefined;
  type Own = { id: string; joints?: Partial<Record<JointPos, string>>; shapes?: Partial<Record<JointPos, string>> };
  const arrOf = (d: Project): Own[] => (beam ? d.beams : col ? d.columns : brace ? d.braces ?? [] : d.knees ?? []) as Own[];
  const setOwn = (ps: JointPos, v: string | undefined) =>
    edit((d) => {
      const x = arrOf(d).find((y) => y.id === src);
      if (!x) return;
      const jj = { ...(x.joints ?? {}) };
      if (v === undefined) delete jj[ps];
      else jj[ps] = v;
      if (Object.keys(jj).length) x.joints = jj;
      else delete x.joints;
    });
  const colName = (id: string) => {
    const c = q.columns.find((x) => x.id === id);
    return c ? `${q.master.find((mm) => mm.id === c.memberId)?.name ?? ''}` : '?';
  };
  const where = beam
    ? beam.p1 && beam.p2
      ? 'theo 2 部材'
      : `${gName('x', beam.x1)}${gName('y', beam.y1)} → ${gName('x', beam.x2)}${gName('y', beam.y2)}`
    : col
      ? col.pt
        ? `間柱 (${col.pt.join(', ')})`
        : `${gName('x', col.x)}-${gName('y', col.y)}`
      : brace
        ? `${gName('x', brace.x1)}${gName('y', brace.y1)} – ${gName('x', brace.x2)}${gName('y', brace.y2)}`
        : knee
          ? `cột ${colName(knee.col)} → dầm ${q.master.find((mm) => mm.id === q.beams.find((b) => b.id === knee.beam)?.memberId)?.name ?? '?'}`
          : '';
  const k = pos === 'left' ? 1 : pos === 'right' ? 2 : 0;
  const end = beam && k ? beamEnd(beam, k as 1 | 2) : undefined;
  const own = it?.joints?.[pos];
  const jointSel = (
    <Sel
      value={own === undefined ? '*' : own}
      onChange={(v) => setOwn(pos, v === '*' ? undefined : v)}
      options={[
        { value: '*', label: `Theo 部材名 (${jName(m?.joints?.[pos]) ?? '–'})` },
        { value: '', label: 'Không có' },
        ...q.joints.filter((j) => j.target === target).map((j) => ({ value: j.id, label: `${j.name} – ${j.target === 'brace' ? (j.sheet ? `ブレースシート ${j.sheet}` : 'GPL') : JOINT_TYPE_LABEL[j.type]}` })),
      ]}
    />
  );
  const curJoint = q.joints.find((j) => j.id === (own !== undefined ? own : m?.joints?.[pos]));
  // tấm GPL tự vẽ RIÊNG của point này (chỉ đổi đúng vị trí này, tên 継手 giữ nguyên)
  const ownKey = (it as { shapes?: Partial<Record<JointPos, string>> } | undefined)?.shapes?.[pos];
  const pPlate = ownKey ? (q.plates ?? []).find((x) => x.id === ownKey) : undefined;
  // tấm cũ gắn theo 継手 (bản trước) vẫn hiển thị nếu có
  const jPlate = curJoint ? (q.plates ?? []).find((x) => x.id === curJoint.shape) : undefined;
  const jointDefShape = curJoint?.shape ?? (curJoint?.sheet ? 'sheet' : 'fig2');
  const shapeOwn = gus?.shapes?.[pos];
  const shapeNow = gus ? shapeOwn ?? jointDefShape : '';
  const shapeName = (key: string) => (pPlate && key === pPlate.id ? `PL riêng (${pPlate.name})` : jPlate && key === jPlate.id ? `PL (${jPlate.name})` : BRACE_SHAPES.find((b) => b.key === key)?.label ?? key);
  const setShape = (v: string | undefined) =>
    edit((d) => {
      const b = arrOf(d).find((x) => x.id === src);
      if (!b) return;
      const sh = { ...(b.shapes ?? {}) };
      if (v === undefined) delete sh[pos];
      else sh[pos] = v;
      b.shapes = Object.keys(sh).length ? sh : undefined;
      if (ownKey && v !== ownKey) d.plates = (d.plates ?? []).filter((x) => x.id !== ownKey);
    });
  const canPlate = !!curJoint && pos !== 'mid' && (!!gus || curJoint.type === 'GPL');
  // Mở trình vẽ 2D cho tấm GPL tại point này
  const openPlate = () => {
    if (!curJoint) return;
    const owner = `${src}|${pos}`;
    const extra = (d: Project, id: string) => {
      const b = arrOf(d).find((x) => x.id === src);
      if (!b) return;
      b.shapes = { ...(b.shapes ?? {}), [pos]: id };
    };
    if (pPlate) return setPlateEdit({ plate: structuredClone(pPlate), jointId: curJoint.id, jointName: curJoint.name, extra });
    const ms = members.filter((x) => x.source === src).sort((a, b) => (a.piece ?? 0) - (b.piece ?? 0));
    const mem = pos === 'right' || pos === 'top' ? ms[ms.length - 1] : ms[0];
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const gg = mem ? (gus ? braceGusset(q, mem, pos, curJoint) : gplPlateInit(mem.section, curJoint)) : undefined;
    const ents: import('../model').PlateEnt[] = gg
      ? [
          { id: uid('pe'), layer: 'outline', kind: 'line', closed: true, pts: gg.pts.map(([x, y]) => [r1(x), r1(y)] as [number, number]) },
          ...gg.holes.map((h) => ({ id: uid('pe'), layer: 'hole' as const, kind: 'circle' as const, pts: [[r1(h.c[0]), r1(h.c[1])] as [number, number]], r: h.r })),
        ]
      : [{ id: uid('pe'), layer: 'outline', kind: 'line', closed: true, pts: [[-10, -150], [120, -150], [120, 150], [-10, 150]] }];
    const label = `${m?.name ?? ''}${JOINT_POS_LABEL[pos]}`;
    setPlateEdit({ plate: { id: uid('pl'), jointId: curJoint.id, owner, name: `${curJoint.name}·${label}`, t: gg?.t ?? curJoint.webT, ents }, jointId: curJoint.id, jointName: curJoint.name, extra });
  };
  const dropPlate = () =>
    edit((d) => {
      const b = arrOf(d).find((x) => x.id === src);
      if (b?.shapes) {
        const sh = { ...b.shapes };
        delete sh[pos];
        b.shapes = Object.keys(sh).length ? sh : undefined;
      }
      d.plates = (d.plates ?? []).filter((x) => x.id !== ownKey);
    });
  const kindLabel = beam ? (beam.role === 'sub' ? '小梁' : '大梁') : col ? (col.role === 'post' ? '間柱' : '本柱') : knee ? '方杖' : 'ブレース';

  // point của liên kết 結合 / 切断: mối nối theo 継手 gán cho liên kết
  const lk = jp?.startsWith('link|') ? (p.links ?? []).find((l) => l.id === jp.slice(5)) : undefined;
  if (lk) {
    const nm = (id: string) => { const b = p.beams.find((x) => x.id === id), c = p.columns.find((x) => x.id === id); const it2 = b ?? c; return `${p.master.find((x) => x.id === it2?.memberId)?.name ?? id}`; };
    const lj = p.joints.find((j) => j.id === lk.jointId);
    const upd = (fn: (l: NonNullable<Project['links']>[number]) => void) => set((d) => { const l = d.links?.find((x) => x.id === lk.id); if (l) fn(l); });
    return (
      <Section title={`接続 · ${nm(lk.a)} + ${nm(lk.b)}`} actions={<button className="icon" onClick={() => setJp(null)}>✕</button>}>
        <p className="muted small">Mối nối của 2 cây đã gộp (⧉ 結合 / ✂ 切断). 3D vẽ theo đúng 継手 đã gán: {lk.type === 'weld' ? 'hàn' : lj ? `${lj.name} · ${jointTypeName(lj.type)}` : 'chưa chọn 継手'}.</p>
        <div className="mrow">
          <span>継手</span>
          <Sel
            value={lk.type === 'weld' ? 'weld' : lk.jointId ?? ''}
            onChange={(v) => upd((l) => { if (v === 'weld') { l.type = 'weld'; delete l.jointId; } else { l.type = 'spl'; l.jointId = v; delete l.plate; } })}
            options={[
              ...(lk.type === 'spl' && !lj ? [{ value: lk.jointId ?? '', label: '— Chọn 継手 —' }] : []),
              { value: 'weld', label: 'Hàn (溶接) – không 継手' },
              ...p.joints.filter((j) => j.type === 'SPL' || j.type === 'EP').map((j) => ({ value: j.id, label: `${j.name} · ${jointTypeName(j.type)}` })),
            ]}
          />
        </div>
        <p className="muted small">Kích thước 継手 sửa ở Master › 継手; 合掌プレート của mối hàn sửa ở bảng 接続 bên dưới tab 継手.</p>
      </Section>
    );
  }

  return (
    <>
      <Section title="継手 – bấm point trên 3D">
        <p className="muted small">
          Mỗi chấm là một điểm liên kết của cây: <span style={{ color: '#16a34a' }}>●</span> đã có 継手, <span style={{ color: '#f59e0b' }}>●</span> chưa gán, <span style={{ color: '#7c3aed' }}>●</span> đầu 剛接合 (ブラケット hàn). Bấm vào chấm để sửa mối nối tại điểm đó; sửa xong bấm <b>✓ Xác nhận</b>.
        </p>
        {!it && <div className="alert">Chưa chọn point nào.</div>}
      </Section>
      {it && (
        <Section title={`${kindLabel} ${m?.name ?? ''} · ${where} · ${JOINT_POS_LABEL[pos]}`} actions={<button className="icon" onClick={() => setJp(null)}>✕</button>}>
          {knee && <div className="muted small" style={{ marginBottom: 6 }}>方杖: 左 = đầu cột, 右 = đầu dầm.</div>}
          {beam && k > 0 && (
            <Field label="Liên kết đầu dầm">
              <div className="seg seg-sm">
                {(Object.keys(BEAM_END_LABEL) as BeamEnd[]).map((e) => (
                  <button key={e} className={end === e ? 'on' : ''} onClick={() => edit((d) => { const x = d.beams.find((y) => y.id === src)!; if (k === 1) x.end1 = e; else x.end2 = e; })}>
                    {BEAM_END_LABEL[e]}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {beam && end === 'rigid' && (
            <>
              <Field label={`継手距離 (từ ${beam.jRef === 'face' ? 'mép' : 'tâm'} cột tới mép ngoài ブラケット)`}>
                <Num value={(k === 1 ? beam.j1 : beam.j2) ?? 0} step={50} onChange={(v) => edit((d) => { const x = d.beams.find((y) => y.id === src)!; if (k === 1) x.j1 = v || undefined; else x.j2 = v || undefined; })} />
              </Field>
              <div className="muted small">Đầu 剛接合: ブラケット hàn vào cột, mối nối bulông nằm ở point 中 (chỗ tách ブラケット). Bấm point 中 để chọn 継手.</div>
            </>
          )}
          {!(beam && end === 'rigid') && <Field label={`継手 tại ${JOINT_POS_LABEL[pos]}`}>{jointSel}</Field>}
          {gus && curJoint && (
            <Field label={pos === 'mid' ? 'Hình dạng クロスプレート' : 'Hình dạng GPL (図1 · 図2 · 図3)'}>
              <div className="jp-shapes">
                {pPlate && (
                  <button className="on" title="Tấm tự vẽ riêng của point này">
                    ✏ PL riêng
                  </button>
                )}
                <button className={shapeOwn === undefined ? 'on' : ''} title={`Theo 継手 ${curJoint.name}: ${shapeName(jointDefShape)}`} onClick={() => setShape(undefined)}>
                  Theo 継手
                  <span className="small muted">{shapeName(jointDefShape)}</span>
                </button>
                {BRACE_SHAPES.map((b) => (
                  <button key={b.key} className={shapeOwn === b.key ? 'on' : ''} title={b.desc} onClick={() => setShape(b.key)} disabled={b.key === 'sheet' && !curJoint.sheet}>
                    <ShapeIcon k={b.key} />
                    {b.label}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {canPlate && curJoint && (
            <Field label={`Hình dạng tấm GPL tại point này (継手 ${curJoint.name})`}>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <button className="primary" onClick={openPlate}>
                  ✏ {pPlate ? 'Sửa hình dạng tấm GPL (2D)' : 'Vẽ lại hình dạng tấm GPL (2D)'}
                </button>
                {pPlate && (
                  <button className="danger" onClick={dropPlate}>
                    Về hình chuẩn
                  </button>
                )}
              </div>
              <div className="muted small">
                Chỉ đổi tấm GPL ở đúng point này; các chỗ khác dùng {curJoint.name} giữ nguyên. Tên 継手 không đổi. Layer 外形 = biên ngoài, 穴 = lỗ, 補助 = đường phụ.
              </div>
            </Field>
          )}
          {!canPlate && curJoint && pos !== 'mid' && <div className="muted small">継手 {curJoint.name} là {JOINT_TYPE_LABEL[curJoint.type]} – sửa hình dạng tấm 2D chỉ áp cho 継手 GPL.</div>}
          {curJoint && (
            <div className="muted small">
              継手 đang dùng: <b>{curJoint.name}</b> ({own !== undefined ? 'riêng cây này' : 'theo 部材名'}) · {curJoint.bolt.grade} M{curJoint.bolt.dia}
              {curJoint.sheet ? ` · ブレースシート ${curJoint.sheet}` : ''}
              {pPlate ? ` · tấm: ${pPlate.name}` : gus && pos !== 'mid' ? ` · hình dạng: ${shapeName(shapeNow)}` : ''}. Sửa thông số chi tiết ở Master › 継手.
            </div>
          )}
          {ops.length > 0 && (
            <div className="jp-confirm">
              <span className="grow">● {ops.length} thay đổi chưa xác nhận (3D cập nhật sau khi xác nhận)</span>
              <button onClick={() => setOps([])}>Huỷ</button>
              <button className="primary" onClick={confirm}>
                ✓ Xác nhận
              </button>
            </div>
          )}
        </Section>
      )}
    </>
  );
}

/** Hình minh hoạ 小梁 勾配: 2 大梁 đỡ (mặt cắt) + 小梁 */
function SubSlopeIcon({ k }: { k: SubSlope }) {
  const I = (x: number, y: number) => <path d={`M${x - 7} ${y}h14M${x} ${y}v16M${x - 7} ${y + 16}h14`} stroke="#1e3a8a" strokeWidth={2.2} fill="none" />;
  const ya = 12, yb = 30;
  const t = k === 'flat' ? [yb, yb] : k === 'face' ? [ya + 2, yb + 2] : [ya, yb];
  return (
    <svg width={96} height={56} viewBox="0 0 96 56">
      {k === 'face' && <line x1={2} y1={ya - 2} x2={94} y2={yb + 5} stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1.2} />}
      {I(14, ya)}
      {I(82, yb)}
      <path d={`M21 ${t[0]} L75 ${t[1]} L75 ${t[1] + 8} L21 ${t[0] + 8} Z`} fill="#fde5bd" stroke="#b45309" strokeWidth={1.2} />
      {k === 'sup' && <><circle cx={14} cy={ya} r={2.5} fill="#16a34a" /><circle cx={82} cy={yb} r={2.5} fill="#16a34a" /></>}
      {k === 'flat' && <line x1={14} y1={ya} x2={14} y2={yb} stroke="#16a34a" strokeDasharray="2 2" />}
    </svg>
  );
}

/** Biểu tượng nhỏ hình dạng GPL */
function ShapeIcon({ k }: { k: string }) {
  const pts: Record<string, string> = { fig1: '4,4 30,4 30,26 4,26', fig2: '2,2 30,11 30,19 2,28', fig3: '2,26 30,26 30,4 12,14', sheet: '2,4 12,4 30,10 30,20 12,26 2,26' };
  return (
    <svg width={34} height={30} viewBox="0 0 34 30">
      <line x1={0} y1={15} x2={34} y2={15} stroke="#2563eb" strokeDasharray="3 2" />
      <polygon points={pts[k] ?? ''} fill="#fecaca" stroke="#b91c1c" />
    </svg>
  );
}


// thanh Khung nhìn cố định dưới đáy hình vẽ Mặt bằng / Trục
export function View2DBar({ p, v2d, setV2d }: { p: Project; v2d: View2DState; setV2d: (v: View2DState) => void }) {
  const gridList = v2d.view === 'ey' ? p.gridsY : p.gridsX;
  return (
      <div className="view2d-bar">
        <b className="vb-title">Khung nhìn</b>
        <div className="seg">
          {(
            [
              ['plan', 'Mặt bằng'],
              ['ex', 'Đứng trục số (X)'],
              ['ey', 'Đứng trục chữ (Y)'],
              ['wp', `作業平面 (${(p.planes ?? []).length})`],
            ] as const
          ).map(([k, l]) => (
            <button key={k} className={v2d.view === k ? 'on' : ''} onClick={() => setV2d({ ...v2d, view: k, gridId: k === 'wp' ? v2d.gridId : (k === 'ey' ? p.gridsY : p.gridsX)[0]?.id ?? '', planeId: v2d.planeId ?? p.planes?.[0]?.id })}>
              {l}
            </button>
          ))}
        </div>
        {v2d.view === 'wp' ? (
          <Field label="作業平面">
            {(p.planes ?? []).length ? (
              <div className="chips">
                {(p.planes ?? []).map((w) => (
                  <button key={w.id} className={'chip' + ((v2d.planeId ?? p.planes![0].id) === w.id ? ' on' : '')} onClick={() => setV2d({ ...v2d, planeId: w.id })}>
                    {w.name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="muted small">Chưa có mặt phẳng. Tạo ở tab Nhập cột · dầm › 📐 作業平面.</span>
            )}
          </Field>
        ) : v2d.view === 'plan' ? (
          <Field label="Tầng">
            <Sel value={v2d.levelId} onChange={(v) => setV2d({ ...v2d, levelId: v })} options={lOpts(p)} />
          </Field>
        ) : (
          <Field label="Trục">
            <div className="chips">
              {gridList.map((g) => (
                <button key={g.id} className={'chip' + (v2d.gridId === g.id ? ' on' : '')} onClick={() => setV2d({ ...v2d, gridId: g.id })}>
                  {g.name}
                </button>
              ))}
            </div>
          </Field>
        )}
      </div>
  );
}

// ================= KHUNG NHÌN MẶT BẰNG / TRỤC (bảng điều khiển) =================
function View2DPanel({ v2d, setV2d }: MainTabProps) {
  return (
    <>
      <div className="row-gap" style={{ margin: '-4px 0 10px' }}>
        <button className={v2d.mode === 'delete' ? 'on danger' : ''} onClick={() => setV2d({ ...v2d, mode: v2d.mode === 'delete' ? 'column' : 'delete' })} title="Bấm vào cấu kiện trên bản vẽ để xoá (Ctrl+Z hoàn tác)">
          🗑 {v2d.mode === 'delete' ? 'Đang xoá – bấm để thôi' : 'Xoá bằng cách bấm'}
        </button>
        <span className="muted small">Nhập 部材 ở bảng dưới (giống tab Nhập cột · dầm), bấm trực tiếp trên bản vẽ.</span>
      </div>
    </>
  );
}

export default function MainTab(props: MainTabProps) {
  switch (props.sub) {
    case 'master':
      return <MasterPanel {...props} />;
    case 'colin':
      return (
        <>
          <div className="row-gap" style={{ marginBottom: 10 }}>
            <button className={props.planeWin ? 'on' : 'primary'} onClick={() => props.setPlaneWin?.(!props.planeWin)} title="Mở cửa sổ riêng (kéo di chuyển, kéo góc để đổi kích thước)">
              📐 作業平面 · 補助線 ({(props.p.planes ?? []).length}) {props.planeWin ? '– đang mở' : '– mở cửa sổ'}
            </button>
          </div>
          <InputPanel {...props} />
        </>
      );
    case 'joint':
      return <JointAssignPanel {...props} />;
    case 'shikuchi':
      return <ShikuchiPanel {...props} />;
    case 'view2d':
      return (
        <>
          <View2DPanel {...props} />
          <InputPanel {...props} />
        </>
      );
    default:
      return <MasterPanel {...props} />;
  }
}


// ================= 作業平面 · 補助線 (tab nhập cột · dầm) =================
export function WorkPlanePanel({ p, set, members, selected, auxEdit, setAuxEdit, setPlaneDraft }: Pick<MainTabProps, 'p' | 'set' | 'members' | 'selected' | 'auxEdit' | 'setAuxEdit' | 'setPlaneDraft'>) {
  const planes = p.planes ?? [];
  const [kind, setKind] = useState<WorkPlaneKind>('level');
  const [ref, setRef] = useState('');
  const [offset, setOffset] = useState(0);
  const [dir, setDir] = useState<WorkPlaneDir>('axis');
  const [at, setAt] = useState<number | null>(null);
  const [pivot, setPivot] = useState('');
  const [rot, setRot] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [msg, setMsg] = useState('');
  const opts =
    kind === 'level'
      ? [...p.levels].sort((a, b) => a.elevation - b.elevation).map((l) => ({ value: l.id, label: `▽ ${l.name} (${l.elevation})` }))
      : kind === 'gridX'
        ? p.gridsX.map((g) => ({ value: g.id, label: `通り ${g.name}` }))
        : kind === 'gridY'
          ? p.gridsY.map((g) => ({ value: g.id, label: `通り ${g.name}` }))
          : [];
  const pivOpts = (kind === 'gridX' ? p.gridsY : kind === 'gridY' ? p.gridsX : []).map((g) => ({ value: g.id, label: `giao trục ${g.name}` }));
  const pivNow = pivOpts.some((o) => o.value === pivot) ? pivot : pivOpts[0]?.value ?? '';
  const selM = members.find((m) => m.id === selected);
  const mLen = selM ? Math.round(Math.hypot(selM.b[0] - selM.a[0], selM.b[1] - selM.a[1], selM.b[2] - selM.a[2])) : 0;
  const needAt = kind === 'member' && dir !== 'axis' && dir !== 'flat';
  const refNow = kind === 'member' ? selM?.id ?? '' : opts.some((o) => o.value === ref) ? ref : opts[0]?.value ?? '';
  const refName = () => (kind === 'member' ? `${selM?.mark ?? selM?.name ?? ''}` : opts.find((o) => o.value === refNow)?.label.replace(/^[▽通り ]+/, '') ?? '');
  const n360 = (x: number) => Math.round((((x % 360) + 540) % 360) - 180);
  const opt: WorkPlaneOpt = {
    ...(kind === 'member' ? { dir, ...(needAt ? { at: at ?? Math.round(mLen / 2) } : {}) } : {}),
    ...(pivNow && (kind === 'gridX' || kind === 'gridY') ? { pivot: pivNow } : {}),
    ...(rot ? { rot } : {}),
    ...(tilt ? { tilt } : {}),
  };
  const basis = planeBasis(p, members, kind, refNow, offset, opt);
  const bKey = JSON.stringify(basis);
  // xem trước mặt phẳng (màu xanh lá) trong 3D
  useEffect(() => {
    setPlaneDraft?.(basis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bKey]);
  useEffect(() => () => setPlaneDraft?.(null), [setPlaneDraft]);
  const nz = basis ? Math.abs(planeNormal(basis)[2]) : 0;
  /** ⊥: mặt đứng → xoay 90° trên mặt bằng; mặt nằm / nghiêng → dựng đứng (nghiêng 90°) */
  const perp = () => (nz > 0.7 ? setTilt((t) => n360(t + 90)) : setRot((r) => n360(r + 90)));
  const create = () => {
    if (!basis) return setMsg(kind === 'member' ? 'Bấm chọn một cấu kiện trên 3D trước.' : 'Chưa chọn tầng / trục.');
    const id = uid('wp');
    const extra = [rot ? `↻${rot}°` : '', tilt ? `∠${tilt}°` : '', offset ? `${offset > 0 ? '+' : ''}${offset}` : ''].filter(Boolean).join(' ');
    const tag = kind === 'level' ? '▽' : kind === 'member' ? { axis: '', X: '⊥X ', Y: '⊥Y ', flat: '斜 ', perp: '断面 ' }[dir] : '通り';
    const name = `WP${planes.length + 1} ${tag}${refName()}${extra ? ' ' + extra : ''}`;
    set((d) => void (d.planes = [...(d.planes ?? []), { id, name, kind, ref: refNow, offset, ...basis, ents: [], opt: kind === 'member' && selM ? { ...opt, mkey: memberKey(selM) } : opt }]));
    setMsg('');
    setAuxEdit(id);
  };
  return (
    <Section title={`作業平面 · 補助線 (${planes.length})`}>
      <p className="muted small">Tạo mặt phẳng làm việc trước (xem trước màu xanh lá trong 3D, có giao tuyến với các trục và tầng), rồi vẽ 補助線 2D trên mặt phẳng đó (lệnh giống AutoCAD).</p>
      <Field label="Mặt phẳng">
        <Sel value={kind} onChange={(v) => setKind(v as WorkPlaneKind)} options={(Object.keys(WORKPLANE_KIND_LABEL) as WorkPlaneKind[]).map((k) => ({ value: k, label: WORKPLANE_KIND_LABEL[k] }))} />
      </Field>
      {kind !== 'member' ? (
        <>
          <Field label={kind === 'level' ? 'Tầng' : 'Trục'}>
            <Sel value={refNow} onChange={setRef} options={opts} />
          </Field>
          {pivOpts.length > 0 && (
            <Field label="Tâm xoay">
              <Sel value={pivNow} onChange={setPivot} options={pivOpts} />
            </Field>
          )}
        </>
      ) : (
        <>
          <div className={selM ? 'muted small' : 'alert'}>{selM ? `Cấu kiện đang chọn: ${selM.mark ?? selM.name} (L = ${mLen})` : 'Bấm chọn một cấu kiện trên 3D (cột / dầm / kèo / giằng).'}</div>
          <Field label="Cách đặt">
            <Sel value={dir} onChange={(v) => setDir(v as WorkPlaneDir)} options={(Object.keys(WORKPLANE_DIR_LABEL) as WorkPlaneDir[]).map((k) => ({ value: k, label: WORKPLANE_DIR_LABEL[k] }))} />
          </Field>
          {needAt && (
            <Field label="Vị trí từ đầu I (mm)">
              <Num value={at ?? Math.round(mLen / 2)} step={100} onChange={setAt} />
            </Field>
          )}
        </>
      )}
      <Field label="Xoay quanh trục đứng Z (°)">
        <Num value={rot} step={15} onChange={(v) => setRot(n360(v))} />
      </Field>
      <Field label="Nghiêng quanh trục ngang u (°)">
        <Num value={tilt} step={15} onChange={(v) => setTilt(n360(v))} />
      </Field>
      <div className="row" style={{ gap: 6, margin: '2px 0 6px' }}>
        <button onClick={perp} title="Mặt đứng: xoay 90° trên mặt bằng · mặt nằm: dựng đứng 90°">
          ⊥ Vuông góc
        </button>
        <button onClick={() => setRot((r) => n360(r - 15))}>↺ 15°</button>
        <button onClick={() => setRot((r) => n360(r + 15))}>↻ 15°</button>
        <button
          onClick={() => {
            setRot(0);
            setTilt(0);
          }}
        >
          Về 0
        </button>
      </div>
      <Field label="Dời theo pháp tuyến (mm)">
        <Num value={offset} step={50} onChange={setOffset} />
      </Field>
      <div className="row" style={{ gap: 6, margin: '6px 0' }}>
        <button className="primary" onClick={create}>
          + Tạo 作業平面 rồi vẽ 2D
        </button>
      </div>
      {msg && <div className="alert">{msg}</div>}
      {planes.length > 0 && (
        <div className="row-gap" style={{ margin: '4px 0' }}>
          <button onClick={() => set((d) => void (d.planes ?? []).forEach((x) => (x.hidden = true)))}>🙈 Ẩn tất cả mặt phẳng</button>
          <button onClick={() => set((d) => void (d.planes ?? []).forEach((x) => (x.hidden = undefined)))}>👁 Hiện tất cả</button>
        </div>
      )}
      {planes.length > 0 && (
        <table className="table small">
          <tbody>
            {planes.map((pl) => (
              <tr key={pl.id} className={auxEdit === pl.id ? 'sel' : ''}>
                <td>
                  <input type="checkbox" checked={!pl.hidden} title="Hiện trong 3D" onChange={(e) => set((d) => void (d.planes!.find((x) => x.id === pl.id)!.hidden = !e.target.checked || undefined))} />
                </td>
                <td>
                  <b>{pl.name}</b>
                  <div className="muted">{pl.kind === 'member' && pl.opt?.dir ? WORKPLANE_DIR_LABEL[pl.opt.dir] : WORKPLANE_KIND_LABEL[pl.kind]} · {pl.ents.length} 補助線</div>
                </td>
                <td className="nowrap">
                  <button className={auxEdit === pl.id ? 'on' : ''} title="Vẽ / sửa 補助線 2D" onClick={() => setAuxEdit(auxEdit === pl.id ? null : pl.id)}>
                    ✏ 2D
                  </button>
                  <button
                    className="danger icon"
                    title="Xoá mặt phẳng"
                    onClick={() => {
                      set((d) => void (d.planes = (d.planes ?? []).filter((x) => x.id !== pl.id)));
                      if (auxEdit === pl.id) setAuxEdit(null);
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}
