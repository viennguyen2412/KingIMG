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
