// 📚 Thư viện mối nối mẫu: xem hình dáng, tra số liệu, tạo nhanh 継手 vào công trình
import { useState } from 'react';
import { JointType, Project } from '../model';
import { TabProps } from '../ui';
import JointShape from '../JointShape';
import { JointPicture } from '../JointPreview';
import { AnyRow, LIB_COMMON, LIB_FAMILIES, LIB_HB, LIB_PITCH, LibFamily, isEp, isSpl, jointFromTemplate, libName, libRef, libRows, rowMatches } from '../jointLib';

export interface LibPick {
  name: string;
  type: JointType;
}

/** Đảm bảo có 継手 tạo từ mẫu trong công trình, trả về tên */
export function ensureLibJoint(p: Project, set: TabProps['set'], f: LibFamily, r: AnyRow): LibPick {
  const ref = libRef(f, r.sec);
  const ex = p.joints.find((j) => j.ref === ref);
  if (ex) return { name: ex.name, type: ex.type };
  const j = jointFromTemplate(f, r, p.params.member.boltGrade);
  let name = j.name, k = 2;
  while (p.joints.some((x) => x.name === name)) name = `${j.name}-${k++}`;
  j.name = name;
  set((d) => void d.joints.push(j));
  return { name, type: j.type };
}

export default function JointLibrary({
  p,
  set,
  families,
  matchSec,
  onPick,
  pickLabel = '+ Dùng',
}: {
  p: Project;
  set: TabProps['set'];
  families?: LibFamily[];
  matchSec?: string;
  onPick?: (x: LibPick, f: LibFamily) => void;
  pickLabel?: string;
}) {
  const fams = families ? families.map((id) => LIB_FAMILIES.find((f) => f.id === id)!) : LIB_FAMILIES;
  const [fam, setFam] = useState<LibFamily>(fams[0].id);
  const [only, setOnly] = useState(!!matchSec);
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState('');
  const famInfo = LIB_FAMILIES.find((f) => f.id === fam)!;
  const all = libRows(fam);
  const rows = only && matchSec ? all.filter((r) => rowMatches(r, matchSec)) : all;
  const cur = fam === 'HB' ? LIB_HB[Math.min(sel, LIB_HB.length - 1)] : rows[Math.min(sel, rows.length - 1)];
  const use = (r: AnyRow) => {
    const x = ensureLibJoint(p, set, fam, r);
    setMsg(`Đã có 継手 ${x.name} (${famInfo.name}) trong công trình.`);
    onPick?.(x, fam);
  };
  const existing = (r: AnyRow) => p.joints.find((j) => j.ref === libRef(fam, r.sec))?.name;
  return (
    <div className="jlib">
      <div className="seg seg-wrap">
        {fams.map((f) => (
          <button
            key={f.id}
            className={fam === f.id ? 'on' : ''}
            onClick={() => {
              setFam(f.id);
              setSel(0);
            }}
          >
            {f.name}
          </button>
        ))}
      </div>
      {matchSec && fam !== 'HB' && (
        <label className="check small">
          <input
            type="checkbox"
            checked={only}
            onChange={(e) => {
              setOnly(e.target.checked);
              setSel(0);
            }}
          />{' '}
          Chỉ hiện mẫu khớp tiết diện {matchSec}
        </label>
      )}
      {cur ? (fam === 'HB' ? <JointShape family={fam} row={cur as Parameters<typeof JointShape>[0]['row']} /> : <JointPicture p={p} j={jointFromTemplate(fam, cur as AnyRow, p.params.member.boltGrade)} secCode={isEp(cur as AnyRow) ? (only && matchSec ? matchSec : (cur as AnyRow as { code: string }).code) : (cur as AnyRow).sec} />) : <div className="alert info">Không có mẫu {famInfo.name} cho {matchSec}. Bỏ tick “chỉ hiện mẫu khớp” để xem tất cả.</div>}
      {msg && <div className="alert ok">{msg}</div>}
      <div className="jlib-table">
        {fam === 'HB' ? (
          <table className="table">
            <thead>
              <tr>
                <th>ねじ</th>
                <th className="num">d1</th>
                <th className="num">Ss</th>
                <th className="num">R</th>
                <th className="num">e1</th>
                <th className="num">e2</th>
                <th className="num">t</th>
                <th className="num">L</th>
                <th className="num">e3</th>
                <th className="num">溶接</th>
                <th>取付ボルト</th>
              </tr>
            </thead>
            <tbody>
              {LIB_HB.map((r, i) => (
                <tr key={r.d} className={i === sel ? 'sel' : ''} onClick={() => setSel(i)}>
                  <td>
                    <b>M{r.d}</b>
                  </td>
                  <td className="num">{r.d1}</td>
                  <td className="num">{r.Ss}</td>
                  <td className="num">{r.R}</td>
                  <td className="num">{r.e1}</td>
                  <td className="num">{r.e2}</td>
                  <td className="num">{r.t}</td>
                  <td className="num">{r.L}</td>
                  <td className="num">{r.e3}</td>
                  <td className="num">{r.lb}</td>
                  <td>{r.bolt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="table">
            <thead>
              {fam.startsWith('EP') ? (
                <tr>
                  <th>Cột</th>
                  <th>M</th>
                  <th title="số mặt × số ピース mỗi mặt">ピース</th>
                  <th title="dày × nhô × cao">PL t×w×h</th>
                  <th title="添板 dày × rộng × dài, 2 tấm">添板</th>
                  <th title="bulông mỗi bên · ピッチ · へりあき">Bulông</th>
                  <th />
                </tr>
              ) : fam === 'GJ' || fam === 'CJ' ? (
                <tr>
                  <th>部材</th>
                  <th>M</th>
                  <th title="フランジ ボルト nF×mF, g1/g2">F bulông</th>
                  <th>外添板</th>
                  <th>内添板</th>
                  <th title="ウェブ ボルト mW×nW, pc">W bulông</th>
                  <th>添板</th>
                  <th />
                </tr>
              ) : (
                <tr>
                  <th>部材</th>
                  <th>M</th>
                  <th className="num">本数</th>
                  <th className="num">GPL</th>
                  {fam === 'BJ2' && <th className="num">WPL</th>}
                  <th />
                </tr>
              )}
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const ex = existing(r);
                return (
                  <tr key={r.sec} className={i === sel ? 'sel' : ''} onClick={() => setSel(i)}>
                    <td className="nowrap">
                      <b>{r.sec}</b>
                    </td>
                    <td>M{r.dia}</td>
                    {isEp(r) ? (
                      <>
                        <td className="small nowrap">{r.ep.faces}面×{r.ep.n}{r.ep.kpOn ? ' +KP' : ''}{r.ep.sdN ? ' +下止' : ''}</td>
                        <td className="small nowrap">{r.ep.t}×{r.ep.w}×{r.ep.h}</td>
                        <td className="small nowrap">{r.ep.spT}×{r.ep.spW}×{r.ep.spL}</td>
                        <td className="small nowrap">{r.ep.nb}本 · p{r.ep.pitch} · e{r.ep.edge}</td>
                      </>
                    ) : isSpl(r) ? (
                      <>
                        <td className="small nowrap">
                          {r.nF}×{r.mF} · {r.g1}
                          {r.g2 ? `/${r.g2}` : ''}
                        </td>
                        <td className="small nowrap">
                          {r.fT}×{r.fL}
                        </td>
                        <td className="small nowrap">{r.iT ? `${r.iT}×${r.iW}` : '–'}</td>
                        <td className="small nowrap">
                          {r.mW}×{r.nW} · {r.star ? '*' : ''}
                          {r.pc}
                        </td>
                        <td className="small nowrap">
                          {r.wT}×{r.wW}×{r.wL}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="num">{r.n}</td>
                        <td className="num">{r.gpl}</td>
                        {fam === 'BJ2' && <td className="num">{r.wpl}</td>}
                      </>
                    )}
                    <td className="nowrap">
                      <button
                        className={ex && !onPick ? '' : 'primary'}
                        title={ex ? `Đã có ${ex}` : `Tạo 継手 ${libName(fam, r.sec)}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          use(r);
                        }}
                      >
                        {ex && !onPick ? `✓ ${ex}` : pickLabel}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {!onPick && (
        <details className="jlib-ref">
          <summary>基準: ボルトピッチ・縁端距離 / 継手共通事項</summary>
          <table className="table">
            <thead>
              <tr>
                <th>呼び径</th>
                <th className="num">孔径</th>
                <th className="num">p</th>
                <th>g (ウェブ)</th>
                <th className="num">はしあき</th>
                <th className="num">へりあき min</th>
              </tr>
            </thead>
            <tbody>
              {LIB_PITCH.map((x) => (
                <tr key={x.dia}>
                  <td>M{x.dia}</td>
                  <td className="num">{x.hole}</td>
                  <td className="num">{x.p}</td>
                  <td>{x.g2}</td>
                  <td className="num">{x.e1}</td>
                  <td className="num">{x.e2min}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="table">
            <thead>
              <tr>
                <th className="num">B</th>
                <th>Bulông</th>
                <th className="num">g1</th>
                <th className="num">g2</th>
                <th className="num">外側</th>
                <th className="num">内側</th>
                <th>Bố trí</th>
              </tr>
            </thead>
            <tbody>
              {LIB_COMMON.map((x) => (
                <tr key={x.B}>
                  <td className="num">{x.B}</td>
                  <td>{x.bolts}</td>
                  <td className="num">{x.g1}</td>
                  <td className="num">{x.g2 || '–'}</td>
                  <td className="num">{x.outW}</td>
                  <td className="num">{x.inW || '–'}</td>
                  <td>{x.arr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/** Hộp chọn nhanh mối nối từ thư viện */
export function JointLibPicker(props: Parameters<typeof JointLibrary>[0] & { onClose: () => void; title: string }) {
  return (
    <div className="modal-back" onClick={props.onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>📚 {props.title}</b>
          <button className="icon" onClick={props.onClose}>
            ✕
          </button>
        </div>
        <JointLibrary {...props} pickLabel="Chọn" />
      </div>
    </div>
  );
}
