// Thư viện 既製品 (フルサト) + tiêu chuẩn ngành kết cấu thép Nhật
import { useState } from 'react';
import { Section } from '../ui';
import { ANCHOR_ABM, ANCHOR_ABR, BASE_METHODS, BRACE_MATERIALS, FREE_BASE, FULL_BRACE, FURUSATO_SECTIONS, ND_CORE, PIECES, SPLICE_INFO, STUDS, SUPPLIER, TORSHEAR, freeBaseCode } from '../kiseihin';
import { JP_STANDARDS } from '../standards';
import { QA_CATS, QA_LIST, QA_SOURCE } from '../qa';

type View = 'cat' | 'std' | 'qa' | 'anchor' | 'base' | 'brace' | 'bolt' | 'other';
const VIEWS: [View, string][] = [
  ['cat', 'Danh mục フルサト'],
  ['anchor', 'アンカーボルト'],
  ['base', '柱脚'],
  ['brace', 'フルブレース'],
  ['bolt', 'トルシア'],
  ['other', 'SPL · ピース · NDコア'],
  ['std', 'Tiêu chuẩn · 幅厚比'],
  ['qa', '📘 Q&A 日建連'],
];

export default function KiseihinLib() {
  const [v, setV] = useState<View>(() => {
    try {
      return (localStorage.getItem('steel3t.kiseihin.view') as View) || 'cat';
    } catch {
      return 'cat';
    }
  });
  const go = (x: View) => {
    setV(x);
    try {
      localStorage.setItem('steel3t.kiseihin.view', x);
    } catch {
      /* bỏ qua */
    }
  };
  const [abm, setAbm] = useState(false);
  const [col, setCol] = useState(0);
  const [qaCat, setQaCat] = useState('');
  const [qaQ, setQaQ] = useState('');
  const qaRows = QA_LIST.filter((x) => (!qaCat || x.cat === qaCat) && (!qaQ || (x.q + x.a + (x.app ?? '') + x.ref).toLowerCase().includes(qaQ.toLowerCase())));
  return (
    <Section title={v === 'qa' ? '鉄骨工事 Q&A (日建連)' : v === 'std' ? 'Tiêu chuẩn thép kết cấu Nhật' : `既製品 – ${SUPPLIER.name}`}>
      <div className="seg seg-wrap kise-seg">
        {VIEWS.map(([k, l]) => (
          <button key={k} className={v === k ? 'on' : ''} onClick={() => go(k)}>
            {l}
          </button>
        ))}
      </div>
      {v !== 'qa' && v !== 'std' && <p className="muted small">
        Nguồn: {SUPPLIER.name} {SUPPLIER.catalog}. Số trang (P) theo catalogue. Dữ liệu tra cứu, khi đặt hàng cần đối chiếu catalogue mới nhất.
      </p>}

      {v === 'qa' && (
        <>
          <p className="muted small">Tóm tắt tiếng Việt {QA_LIST.length} câu chọn lọc từ {QA_SOURCE}. Cột "Trong app" cho biết quy tắc đã được áp dụng ở đâu.</p>
          <input type="search" placeholder="Tìm: ボルト, めっき, ダイアフラム, 余長…" value={qaQ} onChange={(e) => setQaQ(e.target.value)} style={{ width: '100%', marginBottom: 6 }} />
          <div className="seg seg-sm seg-wrap">
            <button className={!qaCat ? 'on' : ''} onClick={() => setQaCat('')}>
              Tất cả
            </button>
            {QA_CATS.map((c) => (
              <button key={c} className={qaCat === c ? 'on' : ''} onClick={() => setQaCat(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="qa-list">
            {qaRows.map((x) => (
              <details key={x.ref + x.q} className="qa-item">
                <summary>
                  <span className="qa-ref">{x.ref}</span> {x.q}
                  {x.app && <span className="chip on qa-app">app</span>}
                </summary>
                <p>{x.a}</p>
                {x.app && <p className="small muted">Trong app: {x.app}</p>}
              </details>
            ))}
            {!qaRows.length && <p className="muted small">Không có mục phù hợp.</p>}
          </div>
        </>
      )}

      {v === 'cat' && (
        <table className="table small">
          <thead>
            <tr>
              <th>No</th>
              <th>Nhóm hàng</th>
              <th>P</th>
              <th>Nội dung</th>
              <th>Dùng trong app</th>
            </tr>
          </thead>
          <tbody>
            {FURUSATO_SECTIONS.map((s) => (
              <tr key={s.no}>
                <td>{s.no}</td>
                <td className="nowrap">{s.name}</td>
                <td className="num">{s.page || '–'}</td>
                <td>{s.vi}</td>
                <td>{s.inApp ? <span className="chip on">{s.inApp}</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {v === 'anchor' && (
        <>
          <div className="seg seg-sm">
            <button className={!abm ? 'on' : ''} onClick={() => setAbm(false)}>
              ABR 転造 (M16–M48)
            </button>
            <button className={abm ? 'on' : ''} onClick={() => setAbm(true)}>
              ABM 切削 (M24–M80)
            </button>
          </div>
          <p className="muted small">
            JIS B 1220:2015 · {abm ? 'ABM400/490/520SUS' : 'ABR400 (SNR400B) / ABR490 (SNR490B) / ABR520SUS (SUS304A)'} · bộ gồm 1 thanh 2 đầu ren, 4 đai ốc, 1 long đen. Phần không ren ℓs ≥ 15d. P{abm ? 42 : 40}.
          </p>
          <div className="jlib-table">
            <table className="table small">
              <thead>
                <tr>
                  <th>d</th>
                  <th>pitch</th>
                  <th>ℓt chuẩn</th>
                  <th>b ren</th>
                  <th>A thân mm²</th>
                  <th>Ae ren mm²</th>
                  <th>Ty 400 kN</th>
                  <th>Ty 490 kN</th>
                  {!abm && <th>Đai ốc m × S</th>}
                  {!abm && <th>Long đen D</th>}
                </tr>
              </thead>
              <tbody>
                {(abm ? ANCHOR_ABM : ANCHOR_ABR).map((r) => (
                  <tr key={r.d}>
                    <td>M{r.d}</td>
                    <td className="num">{r.p}</td>
                    <td className="num">{r.Lt.toLocaleString()}</td>
                    <td className="num">{r.b}</td>
                    <td className="num">{r.As.toLocaleString()}</td>
                    <td className="num">{r.Ae.toLocaleString()}</td>
                    <td className="num">{r.Ty400 || '–'}</td>
                    <td className="num">{r.Ty490}</td>
                    {!abm && <td className="num">{r.nutH} × {r.nutS}</td>}
                    {!abm && <td className="num">{r.washD}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {v === 'base' && (
        <>
          <h4>フリーベース工法 (露出型弾性固定柱脚) · P70–71</h4>
          <p className="muted small">Cột ống vuông □150–□350, bulông neo ABR490 (SNR490B), bản đế SN490B, có 親子フィラー. Ký hiệu {'{số}'}-M{'{d}'}F. Chọn nhanh ở ベース (tab 継手).</p>
          <div className="seg seg-sm">
            {[0, 150, 175, 200, 250, 300, 350].map((c) => (
              <button key={c} className={col === c ? 'on' : ''} onClick={() => setCol(c)}>
                {c ? `□${c}` : 'Tất cả'}
              </button>
            ))}
          </div>
          <div className="jlib-table">
            <table className="table small">
              <thead>
                <tr>
                  <th>Cột</th>
                  <th>製品記号</th>
                  <th>Số bulông</th>
                  <th>M</th>
                  <th>Độ cứng xoay kN·m/rad</th>
                </tr>
              </thead>
              <tbody>
                {FREE_BASE.filter((r) => !col || r.col === col).map((r) => (
                  <tr key={`${r.col}-${r.n}-${r.d}`}>
                    <td>□{r.col}</td>
                    <td>{freeBaseCode(r)}</td>
                    <td className="num">{r.n}</td>
                    <td className="num">M{r.d}</td>
                    <td className="num">{r.k.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h4>Các công nghệ chân cột lộ khác · P72</h4>
          <table className="table small">
            <thead>
              <tr>
                <th>Công nghệ</th>
                <th>Kiểu</th>
                <th>Cột</th>
                <th>Số bulông</th>
                <th>Phạm vi</th>
              </tr>
            </thead>
            <tbody>
              {BASE_METHODS.map((b, i) => (
                <tr key={i}>
                  <td className="nowrap">{b.name}</td>
                  <td>{b.type}</td>
                  <td>{b.col}</td>
                  <td>{b.anchors}</td>
                  <td className="nowrap">{b.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>頭付きスタッド (JIS B 1198) · P73–74</h4>
          <table className="table small">
            <thead>
              <tr>
                <th>d</th>
                <th>Đầu D × T</th>
                <th>Chiều dài sau hàn L</th>
              </tr>
            </thead>
            <tbody>
              {STUDS.map((s) => (
                <tr key={s.d}>
                  <td>φ{s.d}</td>
                  <td className="num">
                    {s.head} × {s.T}
                  </td>
                  <td>{s.lengths.join(' · ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {v === 'brace' && (
        <>
          <p className="muted small">
            JIS A 5540 建築用ターンバックル (bắt buộc cho nhà theo 建築基準法 37条, 平12建告1446号). Đầu nối thiết kế 保有耐力接合. Ký hiệu: M{'{d}'} × chiều dài L3. M24 trở lên dùng 羽子板 2 lỗ. P144–148.
          </p>
          <div className="jlib-table">
            <table className="table small">
              <thead>
                <tr>
                  <th>d</th>
                  <th>羽子板 t × b × a</th>
                  <th>e1 / e2 / P</th>
                  <th>Lỗ</th>
                  <th>Bulông</th>
                  <th>Hàn W</th>
                  <th>TB胴 L</th>
                  <th>Ab mm²</th>
                  <th>短期 kN</th>
                  <th>長期 kN</th>
                  <th>保有 kN</th>
                  <th>L min</th>
                </tr>
              </thead>
              <tbody>
                {FULL_BRACE.map((r) => (
                  <tr key={r.d}>
                    <td>M{r.d}</td>
                    <td className="num nowrap">
                      {r.t} × {r.b} × {r.a}
                    </td>
                    <td className="num nowrap">
                      {r.e1} / {r.e2}
                      {r.P ? ` / ${r.P}` : ''}
                    </td>
                    <td className="num">φ{r.R}</td>
                    <td>{r.bolt}</td>
                    <td className="num">{r.W}</td>
                    <td className="num">{r.TB}</td>
                    <td className="num">{r.Ab}</td>
                    <td className="num">{r.Pa}</td>
                    <td className="num">{r.PaL}</td>
                    <td className="num">{r.Pu}</td>
                    <td className="num" title="Giao nhau không chạm khung / có chạm khung">
                      {r.Lmin.toLocaleString()} / {r.Lmin2.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <table className="table small">
            <thead>
              <tr>
                <th>Bộ phận</th>
                <th>M10</th>
                <th>M12–M33</th>
              </tr>
            </thead>
            <tbody>
              {BRACE_MATERIALS.map((m) => (
                <tr key={m.part}>
                  <td>{m.part}</td>
                  <td>{m.m10}</td>
                  <td>{m.main}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">Bulông lắp 羽子板: F10T / 10.9 / S10T. Mạ kẽm nhúng nóng thì dùng F8T tương đương. Ngắn hơn L min thì đặt タイバー (ngoài JIS).</p>
        </>
      )}

      {v === 'bolt' && (
        <>
          <p className="muted small">構造用トルシア形高力ボルト S10T (大臣認定) · chiều dài sản xuất bước 5 mm · P332–336. 首下長さ = 締付け長さ + độ dài thêm, chọn chiều dài gần nhất (vd 82→80, 83→85). App tự tính ở mỗi 継手.</p>
          <table className="table small">
            <thead>
              <tr>
                <th>d</th>
                <th>Chiều dài có sẵn</th>
                <th>Cộng thêm</th>
                <th>Lực trục 5 mẫu (kN)</th>
                <th>1次締め N·m</th>
              </tr>
            </thead>
            <tbody>
              {TORSHEAR.map((t) => (
                <tr key={t.d}>
                  <td>M{t.d}</td>
                  <td>
                    {t.min}–{t.max}
                  </td>
                  <td className="num">{t.add}</td>
                  <td className="num">
                    {t.axial[0]}–{t.axial[1]}
                  </td>
                  <td className="num">~{t.tq1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {v === 'other' && (
        <>
          <h4>スプライスプレート · P{SPLICE_INFO.page}</h4>
          <p className="small">
            Hình dạng: {SPLICE_INFO.shapes.join(' · ')}. Vật liệu: {SPLICE_INFO.materials.join(', ')}. Đặt hàng theo 継手番号 + H形鋼サイズ (bảng P129) – lấy từ tab 継手.
          </p>
          <h4>ピース類 (SPH-C)</h4>
          <table className="table small">
            <tbody>
              {PIECES.map((x) => (
                <tr key={x.name}>
                  <td>{x.name}</td>
                  <td>{x.vi}</td>
                  <td className="num">P{x.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>NDコア (日鉄建材) – nút cột-dầm không diaphragm</h4>
          <p className="muted small">Vật liệu TMCP325B (F 325). Dầm SS400 / SM / SN, ống cột BCR295 / STKR400. Đầu cột hàn bản gia cường (≥ 400N級) đường hàn góc toàn chu vi.</p>
          <table className="table small">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Cột</th>
                <th>Vật liệu cột</th>
                <th>Bản đầu cột t</th>
                <th>Kích thước bản</th>
                <th>Hàn góc ≥</th>
              </tr>
            </thead>
            <tbody>
              {ND_CORE.map((n) => (
                <tr key={n.code}>
                  <td>{n.code}</td>
                  <td>{n.col}</td>
                  <td>{n.colMat}</td>
                  <td>{n.plateT}</td>
                  <td>{n.plate}</td>
                  <td className="num">{n.weld}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {v === 'std' && (
        <>
          <table className="table small">
            <thead>
              <tr>
                <th>Tiêu chuẩn</th>
                <th>Nội dung</th>
                <th>Ý nghĩa trong app</th>
              </tr>
            </thead>
            <tbody>
              {JP_STANDARDS.map((s) => (
                <tr key={s.code}>
                  <td className="nowrap">{s.code}</td>
                  <td>{s.title}</td>
                  <td>{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h4>幅厚比 · 部材種別 (昭55建告1791号) – giới hạn × √(235/F)</h4>
          <table className="table small">
            <thead>
              <tr>
                <th>Cấu kiện</th>
                <th>Phần</th>
                <th>FA</th>
                <th>FB</th>
                <th>FC</th>
              </tr>
            </thead>
            <tbody>
              <tr><td rowSpan={2}>H 柱</td><td>Cánh b/tf</td><td>9.5</td><td>12</td><td>15.5</td></tr>
              <tr><td>Bụng d/tw</td><td>43</td><td>45</td><td>48</td></tr>
              <tr><td rowSpan={2}>H 梁</td><td>Cánh b/tf</td><td>9</td><td>11</td><td>15.5</td></tr>
              <tr><td>Bụng d/tw</td><td>60</td><td>65</td><td>71</td></tr>
              <tr><td>角形鋼管</td><td>B/t</td><td>33</td><td>37</td><td>48</td></tr>
              <tr><td>円形鋼管</td><td>D/t (× 235/F)</td><td>50</td><td>70</td><td>100</td></tr>
            </tbody>
          </table>
          <p className="muted small">Vượt FC → FD. Hạng của cấu kiện lấy hạng kém nhất của cánh và bụng. b = B/2, d = H − 2tf. Hệ số Ds (ルート3) tăng dần từ FA đến FD.</p>
        </>
      )}
    </Section>
  );
}
