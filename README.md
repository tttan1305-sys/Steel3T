# Steel 3T – Phần mềm thiết kế / vẽ kết cấu thép

Ứng dụng web (React + TypeScript + Three.js) để dựng mô hình nhà thép tiền chế theo hệ lưới trục và cao độ tầng, xem 3D, xuất bản vẽ 2D và list đặt hàng.

## Cài lên điện thoại / máy tính như một app
Mở **https://tttan1305-sys.github.io/steel3t/** rồi:
- iPhone (Safari): nút Chia sẻ → *Thêm vào MH chính*.
- Android (Chrome): ⋮ → *Cài đặt ứng dụng* / *Thêm vào màn hình chính*.
- Máy tính (Chrome / Edge): biểu tượng cài đặt ở thanh địa chỉ.

App chạy được khi mất mạng; dữ liệu công trình lưu trong máy.
Thư mục `docs/` là bản đã đóng gói (GitHub Pages). Cập nhật: `npm run build:single` rồi chép `dist-single/*` vào `docs/`.

## Chạy thử
- Không cần cài: mở `docs/index.html` bằng Chrome/Edge.
- Phát triển: `npm install` rồi `npm run dev` (mở http://localhost:5173).
- Đóng gói 1 file: `npm run build:single` → `dist-single/index.html`.

## Cấu trúc tab
Tab 0 là パラメーター (tiêu chuẩn, quyền cao nhất). Các tab còn lại là Tab 1.

| Tab | Tab phụ |
|---|---|
| ⚙ パラメーター (Tab 0) | 溶接 (tiêu chuẩn hàn), Cột/dầm/giằng (vật liệu cho phép, vật liệu mặc định, tiền tố 部材名, offset dầm, cấp bulông), 母屋・胴縁 (tiết diện, bước tối đa), Thư viện / áp dụng (lưu, nạp, ★ mặc định cho công trình mới, xuất/nhập file) |
| キープラン | Trục X, Trục Y, Cao độ tầng |
| 本体 | Master (部材名, form có tab 基本 / 継手 / ベース), Nhập cột (4 bước), Mặt bằng / Trục, Danh sách cột, Dầm, 継手 (dầm, cột: GPL / 二面せん断 / SPL; ベース chân cột), Tạo nhanh |
| 勾配 | Độ dốc mái, Độ nghiêng công trình |
| 母屋 | Hình dạng mái, Kèo, Xà gồ mái |
| 胴縁 | Xà gồ tường, Mặt tường, Cửa & lỗ mở (sắp có) |
| 二次部材 | Giằng mái, Giằng cột, Liên kết & bulông (sắp có), Diềm, máng xối (sắp có) |
| 符号管理 | Tiết diện, 規格 JIS (H形鋼, 角形鋼管, リップ溝形鋼, 山形鋼, 鋼管, 丸鋼ブレース; vật liệu JIS), Mã cấu kiện, Vật liệu |
| 工区 | 工区 (khu theo dải trục X), グループ, 分類 |
| 塗装 | Chỉ thị 塗装 / メッキ, Tổng hợp (KL, diện tích) |
| 作図 | Mặt bằng kết cấu, Mặt bằng mái, Mặt cắt khung, Mặt đứng tường (lọc theo 工区/グループ/分類) |
| 出荷リスト | Danh sách, 集計 工区 × グループ; xuất Excel .xlsx |
| List đặt hàng | Theo cấu kiện, Theo tiết diện (CSV) |

## Kiến trúc mã nguồn
- `src/model.ts` – kiểu dữ liệu dự án (trục, tầng, tiết diện, cột, dầm, cấu hình mái/tường/giằng), dự án mẫu, tính diện tích & kg/m.
- `src/build.ts` – “bộ dựng”: từ dữ liệu tham số sinh ra danh sách cấu kiện có toạ độ thực, tự đánh mã (cùng loại + tiết diện + chiều dài = cùng mã), tổng hợp BOM.
- `src/Viewer3D.tsx` – khung nhìn 3D (Three.js): tiết diện thật được đùn theo chiều dài, lưới trục có tên, chọn cấu kiện bằng click, ẩn/hiện theo loại.
- `src/Drawing2D.tsx` – bản vẽ 2D dạng SVG: trục, bóng trục, đường kích thước, cao độ, mã cấu kiện.
- `src/tabs/*` – giao diện từng tab.
- Dữ liệu dự án là 1 file JSON (Lưu / Mở), tự lưu trong trình duyệt, có Hoàn tác / Làm lại (Ctrl+Z / Ctrl+Y).

Hệ toạ độ: X dọc nhà (trục số), Y ngang nhà (trục chữ), Z hướng lên. Đơn vị mm.

## Thao tác 3D / 2D
- Nút “🧊 Trang 3D” trên thanh trên cùng: trang chỉ xem 3D, bật/tắt lớp theo loại, 工区, グループ, 分類, 部材名. Esc để đóng.
- 3D: chuột trái xoay, chuột giữa/phải dời, lăn chuột phóng to tại con trỏ.
- Bản vẽ 2D: lăn chuột phóng to tại con trỏ, chuột giữa dời.
