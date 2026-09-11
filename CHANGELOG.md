# Changelog

## 1.0.0 — 2026-09-11

Bản đầu tiên, dùng nội bộ. Resize & xuất ảnh theo preset, chèn text theo mẫu vị trí dựng sẵn
(kèm batch CSV), ghép ảnh thành PDF.

## 1.1.0 — 2026-09-11

- Giao diện gói gọn trong 1 màn hình: bố cục 2 cột (thao tác trái / xem trước & xuất phải) +
  thanh xuất dính đáy, áp cho cả 3 tab.
- Hiển thị phiên bản trong app, panel "Về King Img" (link GitHub, changelog).
- Tự động kiểm tra bản mới qua GitHub Releases khi khởi động, báo bằng banner không chặn.
- Hộp thoại lỗi thân thiện hơn khi app gặp sự cố, kèm đường dẫn log.
- Metadata publisher (Company/Product/Copyright) cho file .exe.
- Installer Inno Setup, cài per-user, không cần quyền admin.

## 1.1.1 — 2026-09-11

- Sửa lỗi 3 nút ở "01 — Quản lý mẫu chèn text" (Xuất preset/Nhập preset/Xuất danh sách mẫu)
  dính sát nhau khi xuống dòng ở cột trái hẹp — thêm `flex-wrap` + khoảng cách dòng.

## 1.1.2 — 2026-09-11

- Banner báo bản mới: bấm "Tải bản mới" giờ tải thẳng file cài đặt, không còn mở qua trang
  Release trên GitHub nữa.

## 1.1.3 — 2026-09-11

- Khối "Nhập batch từ file CSV" ở tab Chèn Text không còn kéo dài trang khi đã nạp CSV: khối
  batch giờ trải rộng hết 2 cột (dưới phần mẫu và phần thêm ảnh), bảng CSV + khung chỉnh nội
  dung nằm bên trái, preview trang nằm bên phải, cả khung cao vừa cửa sổ và mỗi phần tự cuộn
  riêng.
- Bảng CSV hết phải cuộn ngang; tên ảnh/vị trí giữ trên 1 dòng, nội dung rút gọn còn 2 dòng.
- Nút "Chạy batch" và thông báo trạng thái chuyển lên đầu khối batch, ngay cạnh ô chọn file.
