# Prompt cho Codex — Build King Img

> Cách dùng: đặt file này cùng folder với `king-img-build-spec-v2.md` và `king-img-demo.html`, rồi dán nguyên văn phần dưới làm prompt đầu cho Codex.

---

Trong folder làm việc có các file sau, đọc kỹ theo đúng thứ tự trước khi code bất kỳ dòng nào:

1. **`king-img-build-spec-v2.md`** — spec chính thức, follow đúng theo file này.
2. **`king-img-build-spec.md`** — bản v1 cũ (dùng Electron), **đã bị thay thế, không follow theo bản này**, chỉ giữ lại để đối chiếu lịch sử nếu cần.
3. **`king-img-demo.html`** — bản demo chạy được trong browser, chứa logic Canvas (resize/crop/export) và UI 2 tab đã được duyệt, dùng làm nguồn để port sang renderer của app thật.

**Lưu ý quan trọng về file demo:** demo chỉ mới có tab Chèn Text ở mức cơ bản (đặt vị trí, lưu mẫu, gõ text lúc dùng, export). Các tính năng mới ở spec mục 8.1 — **live preview text ngay lúc tạo mẫu, thước đo + guide line, di chuyển khung bằng phím mũi tên, hệ thống font 3 nguồn + đậm/nghiêng độc lập** — **chưa có trong demo**, chỉ được mô tả bằng chữ trong spec. Phải code mới các phần này theo đúng mô tả trong spec, không tìm trong demo vì không có sẵn.

## Mục tiêu cuối

Build ra 1 file `.exe` Windows chạy độc lập (portable), đúng toàn bộ spec v2 — đặc biệt mục 2 (kiến trúc .NET + WebView2), mục 6 (API), mục 8 (tab Chèn Text), mục 9 (đóng gói).

## Chia 5 giai đoạn để làm — không gộp 1 lần, không chia nhỏ hơn nữa

Lý do chia theo cách này: app có 2 phần khá tách biệt — phần UI/logic JS thuần (test được ngay bằng browser thường, không cần chờ app native build xong) và phần cầu nối native .NET (chỉ test được khi đã có app thật). Tách theo ranh giới đó để mỗi giai đoạn có 1 checkpoint rõ, lỗi ở đâu biết ngay ở đó.

### Giai đoạn 1 — Scaffold app native + port renderer (chưa cần lưu file thật)
- Tạo project .NET (WinForms hoặc WPF) + control WebView2, set virtual host mapping theo mục 2.
- Tách `king-img-demo.html` thành `renderer/index.html` + `style.css` + `app.js`, giữ nguyên logic, không sửa hành vi.
- **Checkpoint:** mở app native lên phải chạy y hệt bản demo trong chat (vẫn lưu RAM, chưa có file thật).

### Giai đoạn 2 — Tính năng mới cho tab Chèn Text (thuần JS, test bằng browser thường, không cần chờ app native)
- Live preview text thật trong khung lúc tạo mẫu (mục 8.1.a).
- Thước đo + guide line khi kéo/chọn khung (mục 8.1.b).
- Di chuyển khung bằng phím mũi tên, giữ Shift = nhảy 10px (mục 8.1.c).
- Dựng UI chọn font: 3 nhóm (bundle / máy / riêng) + 2 checkbox Đậm/Nghiêng — tạm dùng danh sách font giả (hard-code vài tên) để dựng UI, phần đọc font thật làm ở giai đoạn 4.
- **Checkpoint:** mở `renderer/index.html` bằng browser thường, không cần app native, vẫn thấy đủ các tính năng trên hoạt động đúng.

### Giai đoạn 3 — Cầu nối native cho lưu trữ & xuất file (làm chung cho cả 2 tab)
- Implement `KingImgApi` theo mục 6: `LoadPresets/SavePresets/LoadTemplates/SaveTemplates/ChooseExportFolder/SaveFile/OpenFolder`.
- Wire cả tab 1 và tab 2 dùng API thật thay cho RAM/blob, đúng đường dẫn `%AppData%\King Img\` ở mục 5.
- **Checkpoint:** đóng app mở lại, preset & mẫu đã tạo còn nguyên; xuất ảnh ra đúng thư mục đã chọn, file thật nằm trên đĩa.

### Giai đoạn 4 — Font thật (native + nối vào UI đã dựng ở giai đoạn 2)
- Thêm `ListSystemFonts / AddCustomFont / ListCustomFonts` vào `KingImgApi`.
- Bundle font mặc định theo mục 8.2 (Be Vietnam Pro đủ 4 style: Regular/Bold/Italic/BoldItalic), load qua virtual host mapping.
- Nối danh sách font giả ở giai đoạn 2 sang dữ liệu thật; bỏ field `styleKey` cũ, đổi sang `fontFamily` + `bold` + `italic` đúng schema mục 5.
- **Checkpoint:** thêm 1 font `.ttf` từ máy → hiện ngay trong danh sách, đóng mở app lại vẫn còn; tick Đậm/Nghiêng ra đúng trong preview và đúng trong ảnh xuất ra.

### Giai đoạn 5 — Đóng gói & nghiệm thu
- `dotnet publish` self-contained single-file theo mục 9.
- Thêm check WebView2 Runtime lúc khởi động, hiện thông báo + link tải nếu máy chưa có.
- Chạy hết checklist mục 10 trong spec, note rõ item nào fail và vì sao.

## Lưu ý khi làm

- Sau mỗi giai đoạn: dừng lại, tự kiểm tra đúng checkpoint của giai đoạn đó, tóm tắt ngắn gọn đã làm gì rồi mới sang giai đoạn tiếp theo — không cần hỏi xin phép tiếp tục, nhưng phải ghi rõ để dễ review lại.
- Không tự thêm tính năng ngoài spec. Nếu thấy chỗ nào spec mô tả chưa đủ rõ để code, ghi chú lại chỗ đó thay vì tự đoán rồi làm liều.
- Giữ đúng tên file/field đã quy định trong spec (`presets.json`, `templates.json`, tên các hàm trong `window.kingImg`...) để sau này đối chiếu lại với spec cho dễ.

Bắt đầu từ Giai đoạn 1.
