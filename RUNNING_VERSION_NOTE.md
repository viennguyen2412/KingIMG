# King Img - bản cần chạy

- **Dùng hàng ngày: bấm `King Img.lnk` ngay tại thư mục gốc này.** Trỏ vào bản Release đã publish
  (`bin\Release\net8.0-windows\win-x64\publish\KingImg.exe` — self-contained, 1 file, không cần
  cài .NET Runtime riêng).
- Bản chính thức hiện tại là **.NET + WebView2** (`KingImg.csproj`, `Program.cs`, `MainForm.cs`, `KingImgApi.cs`).
- Chạy dev (khi đang sửa code): build bằng `dotnet build`, mở `bin\Debug\net8.0-windows\win-x64\KingImg.exe`.
- Đóng gói lại sau khi sửa code: `dotnet publish -c Release` — ghi đè đúng file mà `King Img.lnk` đang trỏ tới, không cần tạo lại shortcut.
- Bản Electron cũ (`dist\win-unpacked\King Img.exe` trước đây) **đã ngừng dùng** — renderer (`renderer\app.js`) đã đổi sang gọi API của WebView2/.NET, chạy trên Electron sẽ lỗi (thiếu hàm `loadTemplates`, `listSystemFonts`... trong `preload.js` cũ). Toàn bộ code + build Electron đã chuyển vào `_archive\king-img-electron-2026-08-05\` (2026-08-05).
