# AGENTS.md — King Img

> Tầng đơn vị. Quy tắc chung ở `..\AGENTS.md` (đọc trước nếu chưa đọc). File này chỉ ghi phần
> riêng của King Img.

Chức năng: app Windows desktop resize/chuẩn hoá ảnh hàng loạt theo preset + chèn text vào ảnh
theo mẫu vị trí dựng sẵn.

---

## Kiến trúc hiện tại: .NET 8 (WinForms) + WebView2

**Không phải Electron.** Bản Electron đã ngừng dùng, archive tại
`_archive\king-img-electron-2026-08-05\` (xem `_system\CHANGELOG.md` cùng ngày để biết lý do
đổi và quá trình quyết định).

⚠️ **Đừng khôi phục nhánh Electron nếu anh Viên không yêu cầu rõ.** `renderer/app.js` đã đổi
sang gọi API chỉ tồn tại ở `KingImgApi.cs` (`loadTemplates`, `listSystemFonts`, `addCustomFont`,
`chooseSourceFolder`...) — chạy lại bằng Electron sẽ lỗi ngay lúc khởi động vì `preload.js` cũ
(đã archive) chỉ có 5/13 hàm renderer cần.

---

## Build & chạy

| Việc | Lệnh | Kết quả |
|---|---|---|
| Dev, sửa code xong test nhanh | `dotnet build` | `bin\Debug\net8.0-windows\win-x64\KingImg.exe` |
| Bản chính thức, dùng hàng ngày | `dotnet publish -c Release` | `bin\Release\net8.0-windows\win-x64\publish\KingImg.exe` (self-contained, 1 file, ~157MB) |

Shortcut **`King Img.lnk`** ở gốc thư mục trỏ thẳng vào file publish ở trên — đây là cách anh
Viên dùng hàng ngày. Sau khi `dotnet publish -c Release` lại, **không cần tạo lại shortcut**,
đường dẫn output không đổi.

**Yêu cầu máy:** .NET SDK 8.0+ để build (chỉ cần lúc build, không cần lúc chạy bản publish).
Microsoft Edge WebView2 Runtime để chạy (thường có sẵn Win10 2004+/11, app tự phát hiện và nhắc
cài nếu thiếu — xem `Program.cs`).

---

## Icon & tài sản — đừng động vào `build\`

`build\icon.ico` được `KingImg.csproj` tham chiếu trực tiếp qua `<ApplicationIcon>`. **Không**
gitignore, xoá, hay di chuyển thư mục `build\` — thiếu file này build vẫn chạy được nhưng exe ra
sẽ mất icon, và có thể lỗi nếu path không khớp.

---

## Dữ liệu người dùng

King Img chạy portable. Dữ liệu nằm trong `Data\` ở gốc folder có
`KingImg.portable.json`:

- `Data\presets.json` - preset resize.
- `Data\templates.json` - mẫu chèn text.
- `Data\fonts\` + `registry.json` - font tùy chỉnh.
- `Data\WebView2\` - dữ liệu WebView2 riêng của app.
- `Data\startup.log` - log khởi động và lỗi WebView2.

Lần chạy đầu sẽ copy các file dữ liệu cũ từ `%APPDATA%\King Img\` sang `Data\` nếu file đích
chưa có. Bản cũ không bị xóa. Khi mang sang máy khác, copy cả folder `tools\king-img\`.

---

## Tài liệu khác trong thư mục này

| File | Nội dung |
|---|---|
| `README.md` | Hướng dẫn build/chạy/đóng gói chi tiết |
| `RUNNING_VERSION_NOTE.md` | Bản nào là bản cần chạy — đọc đầu tiên nếu không chắc |
| `king-img-native-windows-note.md` | Ghi chú quyết định chuyển sang native — **đã triển khai xong**, xem dòng trạng thái đầu file |
| `king-img-build-spec-v2.md` + `-v2-patch1.md` | Lịch sử spec: v2 chốt Electron→.NET, patch1 thêm tab Chèn Text/font/batch CSV |
| `king-img-build-spec.md` | Spec v1 (Electron) — chỉ để tham khảo lịch sử, không áp dụng |
| `king-img-demo-v2.html` / `king-img-demo-v2-patch1.html` | Demo HTML tĩnh dùng làm tài liệu tham chiếu lúc build — **không phải** file app đang chạy (app dùng `renderer\index.html` + `renderer\app.js`) |
| `huong-dan-csv-batch.md` | Hướng dẫn viết CSV cho tính năng batch CSV ở tab Chèn Text (định dạng cột, ví dụ, prompt mẫu cho AI viết CSV) |

---

## Vị trí trong workspace

Theo `_system\REGISTRY.md`, tool hiện nằm tại `tools\king-img\`. Khi mang sang máy khác,
copy nguyên folder này để giữ cả source, bản publish và `Data\`.
