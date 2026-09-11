# King Img - ghi chú chốt hướng Native Windows app

> ✅ **Cập nhật 2026-08-05: đã triển khai xong.** Đi theo đúng hướng .NET (WinForms) + WebView2
> mô tả bên dưới. Đã build, publish, test chạy thật, và đã archive nhánh Electron
> (`_archive\king-img-electron-2026-08-05\`). Xem `AGENTS.md` cùng thư mục để biết trạng thái
> hiện tại và cách build. Phần dưới đây giữ nguyên làm ghi chú lịch sử quyết định.

## Quyết định

Chốt hướng tiếp theo: build lại King Img theo hướng Native Windows app.

Hiện tại chưa triển khai và chưa build. Ghi chú này chỉ để lưu lại định hướng trước khi làm.

## Lý do chọn hướng native

- App King Img có nghiệp vụ đơn giản: chọn ảnh, quản lý preset, crop/resize, xuất file.
- Bản Electron portable chạy được nhưng dung lượng lớn và mở lần đầu hơi chậm vì phải đóng kèm Chromium + Node.
- Bản HTML rất nhẹ nhưng trải nghiệm lưu file, lưu preset, phân phối cho người dùng phổ thông không chắc chắn bằng app desktop thật.
- Native Windows app sẽ phù hợp hơn nếu ưu tiên:
  - dung lượng nhỏ hơn Electron,
  - mở nhanh hơn,
  - cảm giác như phần mềm Windows thật,
  - đọc/ghi file và preset ổn định,
  - dễ chia sẻ thành file `.exe` hoặc bộ cài nhẹ.

## Hướng kỹ thuật đề xuất

Ưu tiên cân nhắc .NET Windows native:

- UI: WinUI 3 hoặc WPF.
- Xử lý ảnh: thư viện .NET phù hợp như ImageSharp, SkiaSharp, hoặc Windows imaging API.
- Lưu preset: file JSON trong `%APPDATA%\King Img\presets.json`.
- Xuất ảnh: ghi trực tiếp ra thư mục người dùng chọn.
- Đóng gói: tạo `.exe` hoặc installer Windows gọn hơn Electron.

## Tính năng cần giữ từ bản demo

- Thêm nhiều ảnh bằng chọn file hoặc kéo thả.
- CRUD preset.
- 3 kiểu resize:
  - fixed: khung cố định, crop nếu cần,
  - axis: cố định một chiều, chiều còn lại theo tỉ lệ,
  - max: giới hạn khung tối đa, không phóng to ảnh nhỏ.
- Crop thủ công cho preset fixed khi ảnh lệch tỉ lệ.
- Xuất nhiều ảnh theo nhiều preset.
- Format đầu ra: WebP, JPEG, PNG, hoặc giữ định dạng gốc nếu phù hợp.

## Lưu ý khi triển khai sau

- Không cần giữ Electron làm nền tảng chính nếu đã chốt native.
- Có thể dùng bản HTML demo hiện tại như tài liệu UX/logic tham chiếu.
- Cần kiểm tra kỹ hỗ trợ WebP của thư viện ảnh được chọn.
- Nên làm bản prototype nhỏ trước: chọn ảnh, resize theo một preset, xuất WebP, rồi mới chuyển toàn bộ UI.
