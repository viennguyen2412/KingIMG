# King Img

King Img là app Windows desktop để resize, chuẩn hoá ảnh hàng loạt theo preset, và chèn text vào ảnh theo mẫu vị trí dựng sẵn. App chạy bằng .NET (WinForms) + Microsoft Edge WebView2, xử lý ảnh ngay trên máy qua Canvas và xuất file thật ra thư mục người dùng chọn.

> Bản cũ dùng Electron đã ngừng dùng, chuyển sang `_archive\king-img-electron-2026-08-05\` (2026-08-05). Lý do đổi: xem `king-img-native-windows-note.md` và `king-img-build-spec-v2.md`.

## Chạy hàng ngày

Bấm `King Img.lnk` ở ngay thư mục gốc — trỏ vào bản Release đã đóng gói sẵn, không cần cài gì thêm.

## Yêu cầu máy

- Windows 10 (2004+) / 11, 64-bit.
- [.NET SDK 8.0+](https://dotnet.microsoft.com/download) để build (không cần nếu chỉ chạy bản đã build sẵn).
- Microsoft Edge WebView2 Runtime — thường có sẵn trên Windows 10/11, app tự phát hiện và nhắc cài nếu thiếu.

## Chạy khi phát triển

```powershell
dotnet build
```

File chạy nằm ở `bin\Debug\net8.0-windows\win-x64\KingImg.exe`.

## Đóng gói bản portable (self-contained, 1 file .exe)

```powershell
dotnet publish -c Release
```

File `.exe` portable nằm trong `bin\Release\net8.0-windows\win-x64\publish\KingImg.exe` — chạy thẳng, không cần cài .NET Runtime trên máy đích (đã đóng gói sẵn theo `SelfContained`/`PublishSingleFile` trong `KingImg.csproj`).

## Dữ liệu lưu trữ

Preset, mẫu chèn text, font tùy chỉnh và dữ liệu WebView2 lưu portable tại `Data\` ở gốc
folder `tools\king-img\`:

- `Data\presets.json` - preset resize.
- `Data\templates.json` - mẫu chèn text.
- `Data\fonts\` + `Data\fonts\registry.json` - font tùy chỉnh người dùng thêm.
- `Data\WebView2\` - dữ liệu WebView2 riêng của app.
- `Data\startup.log` - log khởi động và lỗi nếu app không mở được.

Lần chạy đầu tự copy dữ liệu cũ từ `%APPDATA%\King Img\` sang `Data\` nếu chưa có file tương
ứng. Bản cũ được giữ nguyên. Muốn dùng trên máy khác, mang cả folder `tools\king-img\` sang máy đó.

## Thư mục ảnh batch

Khi chạy batch CSV trong tab **Chèn Text**, King Img luôn tạo một thư mục con mới theo thời điểm
trong `Text/` cạnh thư mục ảnh nguồn, ví dụ `Text/2026-08-12_16-30-00/`. Bản chạy mới không ghi
đè batch cũ.

Để tự động hóa trong quy trình nội bộ, bản Windows cũng nhận `--batch-csv <đường-dẫn>` và tùy chọn
`--text-template-preset <đường-dẫn .kimgtpl>`. Lệnh vẫn dùng đúng engine batch của ứng dụng.

## Metadata ảnh xuất

King Img luôn xuất ảnh mới từ pixel đã xử lý. Ảnh resize, chèn text, batch CSV và ảnh đưa vào
PDF không kế thừa metadata nguồn như EXIF, XMP, IPTC hoặc C2PA/Content Credentials.

## Chuyển preset chèn text sang máy khác

Trong tab **Chèn Text**, dùng **Xuất preset** để tạo một file `.kimgtpl`. File này chứa toàn bộ
mẫu chèn text và các font riêng mà các mẫu đang dùng. Ở máy khác, bấm **Nhập preset** và chọn file
đó; mẫu trùng ID hoặc cùng tên/kích thước sẽ được cập nhật, mẫu khác sẽ được thêm mới. Font hệ thống
không được đóng kèm, nên cần cài font đó ở máy mới nếu muốn chữ hiển thị giống hệt.
