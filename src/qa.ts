// Tóm tắt 鉄骨工事Q&A – 日本建設業連合会 鉄骨専門部会 (A. 工場製作編 / B. 工事現場施工編, bản 2026)
// Mỗi mục: câu hỏi gốc (JP) + tóm tắt tiếng Việt + chỗ áp dụng trong app (nếu có).
export interface QA {
  ref: string; // A = 工場製作, B = 工事現場
  cat: string;
  q: string;
  a: string;
  app?: string;
}

export const QA_SOURCE = '日建連 鉄骨専門部会「鉄骨工事Q&A」A. 工場製作編 · B. 工事現場施工編 (2026)';

export const QA_LIST: QA[] = [
  // ── 材料
  { ref: 'A-1-1', cat: '材料', q: '各鋼材記号の数字が意味するものは？', a: 'Thép JIS (SS400, SN490…): số = giới hạn bền kéo tối thiểu. Thép cốt (SD345) và phần lớn thép 大臣認定 (BCP325, SA440, TMCP355…): số = giới hạn chảy / 0.2% 耐力 tối thiểu. Không so độ bền chỉ bằng con số.', app: 'Bảng vật liệu ghi F và fu riêng' },
  { ref: 'A-1-2', cat: '材料', q: '広幅平鋼とは何ですか。', a: 'Thép dẹt cán cả 4 mặt (平鋼) rộng > 180 mm gọi là 広幅平鋼, dùng cho SPL và cánh H tổ hợp. Tấm cắt từ thép tấm không gọi là 平鋼. Tấm dày ≥ 6 là 厚板, 3–6 là 中板, < 3 là 薄板.' },
  { ref: 'A-1-6', cat: '材料', q: 'BCP325Tの「T」の意味と、BCP325との違いは何か？', a: 'T = Tough: đảm bảo Charpy 70 J (0℃) ở cả góc và phần phẳng (BCP325 chỉ 27 J ở phần phẳng). Kéo giống nhau. Đổi BCP325T → BCP325 phải hỏi kết cấu vì hệ số thiết kế khác.' },
  { ref: 'A-1-7', cat: '材料', q: '超高力ボルト（SHTB）と一般の高力ボルトの違いは？', a: 'SHTB ~1400 N/mm² (≈1.5 lần S10T), chống phá hủy trễ bằng vật liệu và ren cải tiến. Siết như トルシア nhưng lực lớn: 1次締め M20 ~300 N·m (S10T ~150). Chỉ dùng trong nhà.' },
  { ref: 'A-1-15', cat: '材料', q: 'アンカーボルトの転造ねじと切削ねじの違いは？ / ABR・ABM とは？', a: 'ABR (ren cán, SNR400B/490B, M16–M48) và ABM (ren tiện, đến M100) là bộ bulông neo JIS B 1220 cho chân cột lộ, ra đời sau động đất Kobe. Ren cán: Ae ≈ 90–93% thân nhưng hóa bền nên coi bền như thân.', app: 'ベース: chọn ABR/ABM, tra ℓt, Ty' },
  { ref: 'A-1-17', cat: '材料', q: '電炉材の使用制限の理由は？', a: 'JIS không cấm thép lò điện. Có thể có nhiều Sn, Cr, Cu hơn. Phải đọc 構造特記; muốn dùng thì thống nhất trước vị trí và nhà sản xuất với giám sát.' },
  // ── 加工
  { ref: 'A-2-6', cat: '加工', q: '鋼材面へポンチは打ってよいか？', a: 'Không đóng dấu chấm ở mặt ngoài chỗ uốn, và mọi chỗ trên thép ≥ 490 N/mm² hoặc cấu kiện tính mỏi (mầm nứt). Được nếu sau đó hàn ngấu hoàn toàn đè lên.' },
  { ref: 'A-2-8', cat: '加工', q: 'スカラップ工法とノンスカラップ工法の構造性能の違いは？', a: 'ノンスカラップ cho biến dạng dẻo tích lũy và tăng bền tốt hơn. 複合円形スカラップ vẫn đạt nếu quản lý vật liệu hàn và điều kiện hàn tốt.' },
  { ref: 'A-2-9', cat: '加工', q: '鋼板の曲げ半径の規定は、JASS6と告示のどちらを優先するのか？', a: 'Ưu tiên 告示 (平12建告2464, là luật). Theo JASS6 thì cần chứng minh chất lượng sau gia công.' },
  { ref: 'A-2-11', cat: '加工', q: '高力ボルト摩擦接合でボルト孔をルーズ（拡大孔）にしたいが？', a: '令68条: lỗ HTB chỉ được lớn hơn d tối đa 2 mm (d < 27) hoặc 3 mm (d ≥ 27). Lỗ mở rộng không được phép (trừ 大臣認定). 接合部設計指針 cho phép với hệ số giảm, chỉ ở bản mẹ.', app: 'BOLT_STD: M16→18, M20→22, M22→24, M24→26' },
  { ref: 'A-2-13', cat: '加工', q: '発せい促進剤やりん酸塩処理を採用する場合は？', a: 'JASS6 2018 công nhận là tiêu chuẩn (trước cần thử trượt). Không dùng loại vừa tẩy vảy vừa tạo gỉ; quản lý bề mặt, pha loãng, thời gian chờ.' },
  { ref: 'A-2', cat: '加工', q: '何故、サンドブラスト処理の場合、赤さびが必要なのか？', a: 'Cần hệ số trượt μ ≥ 0.45. ショット/グリットブラスト đạt nhám ≥ 50 μmRz là dùng được ngay. サンドブラスト có thể không đạt nên phải để gỉ đỏ.' },
  { ref: 'A-2', cat: '加工', q: '冷間成形角形鋼管の通しダイアフラムの出寸法は？', a: 'e = 25 mm khi tc < 28, e = 30 mm khi tc ≥ 28 (冷間成形角形鋼管マニュアル 2018). Ra dài hơn dễ cong vênh (かさ折れ), nhất là top plate, gây lệch với cánh dầm.', app: 'Master: cột ロ hiện e' },
  { ref: 'A-2-21', cat: '加工', q: '高力ボルト孔のレーザ孔あけ加工の孔径は？', a: 'JASS6: sai số lỗ kể cả phần cháy ±0.5 mm; luật không cho vượt +2/+3 mm. Cần kiểm soát phần cháy chảy.' },
  { ref: 'A-2-23', cat: '加工', q: '高力ボルト接合部の摩擦面以外の面の処理は必要？', a: 'Chỉ mặt tiếp xúc giữa các bản truyền lực là mặt ma sát (μ 0.45). Mặt ngoài SPL không cần xử lý như mặt ma sát.' },
  { ref: 'A-2-24', cat: '加工', q: '小梁端部の下フランジの切断は可能ですか。', a: 'Dầm phụ liên kết khớp: lực cắt qua bụng nên cắt cánh dưới đầu dầm thường không sao. Cắt 1 bên thì mặt cắt thành mặt ma sát, phải phẳng với bụng; cắt 2 bên dễ gia công hơn. Phải hỏi thiết kế trước.' },
  // ── 溶接
  { ref: 'A-3-2', cat: '溶接', q: '組立て溶接と仮付け溶接の違いは？', a: 'Nay gọi là 組立て溶接 để tránh hiểu là hàn tạm cẩu thả. Phải đủ chiều dài, cạnh hàn, không khuyết tật.' },
  { ref: 'A-3', cat: '溶接', q: '何故、鋼製エンドタブが必要なのか？ 長さは？', a: 'Đầu/cuối đường hàn dễ khuyết tật (rỗ, nứt crater) nên đưa ra ngoài bản mẹ bằng エンドタブ thép. Dài khoảng ≥ 30 mm cho hàn tay / bán tự động. Phần エンドタブ không kiểm tra ngoại quan.' },
  { ref: 'A-3-7', cat: '溶接', q: '鋼製エンドタブの切断は必要な処置か？', a: 'JASS6 để 特記. Nên cắt khi cùng lúc: đầu dầm tạo khớp dẻo, dầm 490N hàn dây YGW11, cột ống vuông 幅厚比 ≥ 25.' },
  { ref: 'A-3-12', cat: '溶接', q: '通しダイアフラム板厚と内ダイアフラム板厚の決定基準は何故違うか？', a: '告示1464: mối hàn cánh dầm phải nằm trong chiều dày 通しダイアフラム → thường lấy t cánh dầm + 2 size. 内ダイアフラム cho phép lệch → + 1 size.', app: 'Master: cột ロ ghi quy tắc' },
  { ref: 'A-3-16', cat: '溶接', q: '柱脚の柱材とベースプレートの溶接の使い分けは？', a: 'Chỉ chịu cắt → hàn góc. Chịu kéo → hàn ngấu hoàn toàn (hàn góc chịu kéo chỉ được ứng suất như cắt, 令98条). Thành dày có thể dùng ngấu một phần.' },
  { ref: 'A-3-17', cat: '溶接', q: '予熱の目的は何か？', a: 'Chống nứt nguội (do hydro, ứng suất, vùng cứng): làm nguội chậm, thoát hydro, giảm độ cứng HAZ.' },
  // ── 検査
  { ref: 'A-4-2', cat: '検査', q: '管理許容差と限界許容差の違いは？', a: 'JASS6 付則6. 管理許容差: mục tiêu 95% sản phẩm đạt; vượt không phải sửa nhưng nhiều thì phải cải tiến. 限界許容差: vượt là không đạt, phải sửa/loại (≈0.3%).' },
  { ref: 'A-4-7', cat: '検査', q: '２枚のダイアフラムの間隔が狭い場合、探傷可能な間隔は？', a: 'Khoảng trong giữa 2 diaphragm cần ≥ 150 mm và ≥ 10t để chế tạo và siêu âm. L/t < 6 thì đầu dò 70° có vùng mù, phải dùng 65° hoặc 45°.', app: 'Master: cột ロ ghi khe ≥ max(150, 10t)' },
  { ref: 'A-4-9', cat: '検査', q: 'ペンキの上やめっきの上からでも超音波探傷検査はできますか？', a: 'Kiểm tra UT nên làm trước sơn / mạ.' },
  // ── 塗装・めっき
  { ref: 'A-7', cat: '塗装・めっき', q: '溶融亜鉛めっきが可能な部材の大きさは？', a: 'Bể lớn ~10 m dài × 1.5 m rộng × 2.0 m sâu, trừ ~0.4 m xỉ ở đáy. Nhúng 1 lần là nguyên tắc; dài hơn thì chia đoạn (hỏi thiết kế về mối nối thêm).', app: '塗装: cảnh báo cấu kiện mạ > 9.5 m' },
  { ref: 'A-7-5', cat: '塗装・めっき', q: 'めっき構造物のめっき抜き孔はどのような形状が良いか？', a: 'Sườn, bản mã hàn 2 mặt nên dùng dạng スカラップ để kẽm thoát. Bản mỏng hàn vào bản dày dễ nứt mạ → tăng chiều dày bản mỏng.' },
  { ref: 'A-7-6', cat: '塗装・めっき', q: '構造用鋼管を溶融亜鉛めっきする場合、ダイアフラムの孔は？', a: 'Tiết diện kín: lỗ ở 通しダイアフラム ≥ 25% diện tích (JIS H 8641 giải thích) hoặc ≥ 1/3 (技術指針). Thiếu thì bàn 4 bên, có thể phải tăng chiều dày.' },
  { ref: 'A-7-7', cat: '塗装・めっき', q: '冷間成形角形鋼管を溶融亜鉛めっきする場合の注意点は？', a: 'Có nguy cơ nứt mặt trong góc ống (vật liệu, bán kính uốn). Chọn ống chuyên dùng cho mạ, hỏi nhà sản xuất.' },
  { ref: 'A-7', cat: '塗装・めっき', q: '溶融亜鉛めっきした鋼材を溶接できるか？', a: 'Về nguyên tắc không. Bắt buộc thì mài sạch kẽm, dùng vật liệu hàn cho thép mạ, xử lý khói ZnO, sau đó sơn kẽm bù.' },
  { ref: 'A-7-28', cat: '塗装・めっき', q: '溶融亜鉛めっきの記号が変わったのはなぜですか？', a: 'JIS H 8641:2021 đổi từ khối lượng bám sang chiều dày màng: HDZ35→HDZT49, HDZ40→HDZT56, HDZ45→HDZT63, HDZ50→HDZT70, HDZ55→HDZT77 (µm). Bulông mạ (大臣認定) vẫn dùng ký hiệu cũ.', app: '塗装: tự đổi HDZ55 → HDZT77' },
  { ref: 'A-8', cat: '設計', q: '阪神淡路大震災で認定工法の露出柱脚の被害が少なかったのは？', a: 'Chân cột lộ truyền thống tính khớp nên ít bulông neo, thực tế có ngàm nên bulông bị kéo đứt/tuột. 認定工法 tính nửa ngàm theo độ cứng xoay, thiết kế bulông neo chịu mômen.', app: 'ベース: フリーベース có độ cứng xoay K' },
  // ── 工事現場: 建方
  { ref: 'B-1-3', cat: '建方', q: '建方用アンカーボルトに必要なコンクリート材齢は？', a: 'Không có quy định tuổi; nếu bulông neo chịu lực khi dựng thì kiểm tra cường độ bê tông thực tế (phá hoại hình nón, cắt) và vữa chân cột.' },
  { ref: 'B-1-4', cat: '建方', q: '小梁の上フランジに吊込み用の孔をあけたいが？', a: 'Không có quy định; làm gần đầu dầm phụ (mômen nhỏ), kiểm tra và xin giám sát. Dầm chính không được khoét lỗ treo.' },
  { ref: 'B-1-6', cat: '建方', q: '大スパン梁にキャンバーが必要となるスパンは？', a: 'Khoảng 20 m là mốc. Độ võng = tự trọng ở trạng thái gần khớp (khi dựng) + tải thêm sau khi nối cứng. Hỏi thiết kế.' },
  { ref: 'B-1-7', cat: '建方', q: 'アンカーボルトのダブルナットの締付け方法は？', a: 'Đai ốc dưới: siết tay rồi 1次締め (M16–22 ~70 N·m, M24–27 ~100, M30–42 ~200, M48–72 ~300), đánh dấu, siết thêm 10–30° (JASS6: 30°). Đai ốc trên chỉ chống tuột, siết sát là đủ, có thể dùng đai ốc mỏng (ghi rõ).', app: 'ベース' },
  { ref: 'B-2-1', cat: '建方', q: '建築用ターンバックルの締付け方法は？', a: 'Siết tay đều toàn bộ, rồi dùng xà beng/cờ lê tạo ứng suất ~50 N/mm² đồng đều (M16–M24: 26,000–89,000 N·mm). Kiểm tra lại nếu lực thay đổi lớn.', app: 'フルブレース' },
  // ── 工事現場: 高力ボルト
  { ref: 'B-2-3', cat: '高力ボルト', q: 'フィラープレートの材質は母材と同等が必要か？', a: 'JASS6: 400N級 là đủ dù bản mẹ là gì. Hai mặt phải xử lý như mặt ma sát.' },
  { ref: 'B-2-4', cat: '高力ボルト', q: 'トルシア形と高力六角ボルトが１枚のSPL内で混在してよいか？', a: 'Không. Kiểm tra トルシア dựa vào góc xoay trung bình của cả nhóm (±30°), nên nếu phải dùng bulông lục giác thì cả nhóm trên 1 SPL đều là lục giác.' },
  { ref: 'B-2-7', cat: '高力ボルト', q: '高力ボルトを仮ボルト代わりに使用してはいけないか？', a: 'Không nên (hỏng ren, sai lực). Bulông tạm ~1/3 nhóm và ≥ 2 cây, bố trí đều cánh và bụng; nên dùng loại khác để dễ nhận biết.' },
  { ref: 'B-2-8', cat: '高力ボルト', q: '高力ボルトの余長の許容範囲が１山～６山である根拠は？', a: '首下長さ = 締付け長さ + độ dài thêm (トルシア M20: 30), làm tròn 2捨3入/7捨8入 về bước 5 mm (M27, M30 bước 10) → 余長 ~1–6 bước ren. Đai ốc cao = d.', app: '継手: tự tính 首下長さ và 余長 (山)' },
  { ref: 'B-2-9', cat: '高力ボルト', q: '高力ボルトの保管期間は？', a: 'Không có quy định; nhà sản xuất thường nói ~1 năm trong kho tốt (hệ số mômen thay đổi theo thời gian).' },
  { ref: 'B-2-10', cat: '高力ボルト', q: '座金・ナットを裏使用した場合の問題は？', a: 'Đai ốc: dấu cấp ra ngoài; long đen: mặt vát ra phía đai ốc. Dùng ngược làm sai hệ số mômen → sai lực trục.' },
  { ref: 'B-2-12', cat: '高力ボルト', q: 'トルシア形高力ボルト締付け後のナット回転角の許容範囲は？', a: 'Kiểm tra 100% bằng mắt: 余長, đứt đuôi, vạch dấu. Góc xoay trong ±30° so với trung bình nhóm. Không cần kiểm mômen lại.' },
  { ref: 'B-2-14', cat: '高力ボルト', q: '高力ボルト挿入後、降雨時の処置は？', a: 'Ướt thì không siết (hệ số mômen đổi). Siết xong nhóm đang làm; nhóm đã 1次締め thì che mưa, chờ khô rồi 本締め.' },
  { ref: 'B-2-15', cat: '高力ボルト', q: '何故トルシア形高力ボルトはJIS規格化されないのか？ 座金は？', a: 'Cầu (μ 0.40) và nhà (μ 0.45) khác nhau nên dùng 大臣認定 theo từng hãng (S10T). Đầu tròn không cần long đen (mặt tựa lớn) → 首下 ngắn hơn bulông JIS lục giác ~5 mm.', app: '継手: F10T cộng thêm 5 mm' },
  { ref: 'B-2-19', cat: '高力ボルト', q: '極厚Ｈ形鋼の柱の高力ボルト接合における留意点は？', a: 'Sai số chiều dày dễ gây hở (肌すき). SPL ≤ 16 mm thì lệch 1 mm vẫn ổn; SPL dày (> 28 mm) phải xử lý フィラー riêng.' },
  { ref: 'B-3-1', cat: '高力ボルト', q: '寒冷地で冬季低温下で高力ボルトを本締めする場合は？', a: 'Dải dùng 0–60℃. Dưới 0℃ thường ngừng 本締め (hoặc thử lực trước). Kiểm tra băng đóng trong SPL.' },
  // ── 工事現場: 溶接・デッキ・スタッド・耐火
  { ref: 'B-3-17', cat: '現場溶接', q: '開先の防せい塗装の範囲は？', a: 'Khoảng 50 mm từ mép vát (cả mặt đặt thép lót), dày 5–7 µm; dày quá gây rỗ khí.' },
  { ref: 'B-3-8', cat: '現場溶接', q: '折板屋根のタイトフレーム溶接長さの規定は？', a: 'Theo tải gió (tham khảo 日本金属屋根協会). Sơn chống gỉ dưới mối hàn cần kiểm tra cường độ.' },
  { ref: 'B-4-10', cat: 'デッキ・スタッド', q: 'デッキプレートのアークスポット溶接が梁に及ぼす影響は？', a: 'Nung nóng/làm nguội nhanh, tránh ở vùng khớp dẻo đầu dầm chính. Que hàn φ3.2 (E4316…), thợ có chứng chỉ.' },
  { ref: 'B-4-11', cat: 'デッキ・スタッド', q: 'スタッド溶接後にスタッドを曲げることは？', a: 'Không được (trừ thử uốn đập); cần thì hỏi giám sát. Kiểm JIS bằng dấu đầu stud, nhãn hộp và chứng chỉ.' },
  { ref: 'B-5-3', cat: '耐火被覆', q: '耐火被覆が不要な部材は？', a: 'Thường không cần: giằng ngang, 方杖, 火打ち, dầm chịu gió, giằng đứng (trừ dạng K) chỉ chịu lực ngang… Xác nhận với thiết kế.' },
  { ref: 'B-5-4', cat: '耐火被覆', q: '耐火被覆する鉄骨に下塗りは必要か？', a: 'Tùy môi trường: cần ở vùng biên dễ gỉ chảy bẩn; trong nhà điều hòa RH < 70% có thể không cần.' },
];

export const QA_CATS = [...new Set(QA_LIST.map((x) => x.cat))];
