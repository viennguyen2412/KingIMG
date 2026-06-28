# King Img — Spec build app Windows desktop (v2)

Bản này thay cho `king-img-build-spec.md` (v1). Đưa file này + 2 file demo (`king-img-demo.html` cho UI/logic) cho Codex để build.

## 0. Thay đổi so với v1

- **Đổi công nghệ:** Electron → **.NET (C#) + Microsoft WebView2**. Lý do: Electron luôn đóng gói sẵn Chromium + Node.js nên app nặng ~100–150MB dù chỉ làm việc đơn giản. WebView2 là thành phần Chromium của Microsoft đã cài sẵn và tự cập nhật trên Windows 10/11 (như Visual C++ Redistributable), nên app không cần đóng gói trình duyệt riêng — kết quả chỉ còn vài MB, mà code HTML/CSS/JS gần như giữ nguyên 100%.
- **Thêm Tab 02 — Chèn Text:** đặc tả đầy đủ ở mục 8 (chưa có trong v1).
- **Thêm hệ thống font:** bundle sẵn + đọc font hệ thống + cho thêm font riêng (.ttf/.otf).

## 1. Tổng quan

- **Tên app:** King Img
- **Mục đích:** (1) Resize/chuẩn hoá ảnh hàng loạt theo preset kích thước; (2) Chèn text vào ảnh theo mẫu vị trí dựng sẵn (dùng cho ảnh bìa, ảnh con... của 1 series nội dung).
- **Đối tượng dùng:** Cá nhân hoặc chia sẻ ra ngoài. Không cần tài khoản, không cần internet để chạy (trừ lúc cài đặt lần đầu nếu máy chưa có WebView2 Runtime — xem mục 9).
- **Nền tảng:** Windows 10 (2004+) / 11, 64-bit. Output: **1 file `.exe` chạy thẳng (portable)**.

## 2. Công nghệ & kiến trúc

- **Host app:** .NET 8 (C#), WinForms hoặc WPF — chỉ cần 1 cửa sổ chứa 1 control `Microsoft.Web.WebView2.WinForms.WebView2` (NuGet package `Microsoft.Web.WebView2`), chạy full màn hình control đó, không cần UI native nào khác.
- **Renderer:** chính là `king-img-demo.html` (cả 2 tab) tách thành `index.html` + `style.css` + `app.js`, load vào WebView2 qua **virtual host mapping** (không dùng `file://` trực tiếp để tránh hạn chế CORS khi load font/ảnh):

```csharp
webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
    "kingimg.app", "renderer", CoreWebView2HostResourceAccessKind.Allow);
webView.Source = new Uri("https://kingimg.app/index.html");
```

- **Giao tiếp JS ↔ .NET:** dùng **Host Object** (không dùng IPC kiểu Electron). Trong C#:

```csharp
webView.CoreWebView2.AddHostObjectToScript("kingimgApi", new KingImgApi());
```

Trong JS, viết 1 lớp bọc mỏng để giữ nguyên cách gọi giống các API đã mô tả ở v1 (renderer code không cần đổi nhiều):

```js
window.kingImg = {
  loadPresets: () => window.chrome.webview.hostObjects.kingimgApi.LoadPresets(),
  savePresets: (json) => window.chrome.webview.hostObjects.kingimgApi.SavePresets(json),
  loadTemplates: () => window.chrome.webview.hostObjects.kingimgApi.LoadTemplates(),
  saveTemplates: (json) => window.chrome.webview.hostObjects.kingimgApi.SaveTemplates(json),
  chooseExportFolder: () => window.chrome.webview.hostObjects.kingimgApi.ChooseExportFolder(),
  saveFile: (folder, fileName, base64) => window.chrome.webview.hostObjects.kingimgApi.SaveFile(folder, fileName, base64),
  openFolder: (folder) => window.chrome.webview.hostObjects.kingimgApi.OpenFolder(folder),
  listSystemFonts: () => window.chrome.webview.hostObjects.kingimgApi.ListSystemFonts(),
  addCustomFont: (fileName, base64) => window.chrome.webview.hostObjects.kingimgApi.AddCustomFont(fileName, base64),
  listCustomFonts: () => window.chrome.webview.hostObjects.kingimgApi.ListCustomFonts(),
};
```

Gọi 1 method trên host object từ JS trả về `Promise` sẵn — không cần dựng cơ chế callback/IPC riêng.

- **Class API phía C#** (`KingImgApi.cs`), tối thiểu các method:

```csharp
[ComVisible(true)]
public class KingImgApi
{
    public string LoadPresets();                          // đọc presets.json, trả JSON string
    public void SavePresets(string json);
    public string LoadTemplates();                         // đọc templates.json
    public void SaveTemplates(string json);
    public string ChooseExportFolder();                    // mở dialog chọn thư mục, trả path hoặc ""
    public bool SaveFile(string folder, string fileName, string base64Data);
    public void OpenFolder(string path);                   // mở Explorer tại thư mục
    public string ListSystemFonts();                       // trả JSON array tên font đã cài trên máy
    public string AddCustomFont(string fileName, string base64Data); // copy font vào thư mục riêng, trả tên font đã đăng ký
    public string ListCustomFonts();                        // trả JSON array {name, fileName} font đã thêm
}
```

- Ảnh xuất ra (canvas → blob) convert sang base64 trong JS trước khi gửi qua `SaveFile` (host object marshal qua COM nên truyền string là an toàn nhất, không truyền ArrayBuffer trực tiếp được).

## 3. Cấu trúc thư mục đề xuất

```
king-img/
├── KingImg.csproj
├── KingImgApi.cs
├── MainForm.cs
├── renderer/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── fonts-bundled/
│   ├── BeVietnamPro-Regular.ttf
│   ├── BeVietnamPro-Bold.ttf
│   ├── BeVietnamPro-Italic.ttf
│   └── BeVietnamPro-BoldItalic.ttf
└── README.md
```

## 4. Tái sử dụng demo có sẵn

`king-img-demo.html` đã có UI + logic hoạt động đúng cho cả 2 tab (Resize & Export, Chèn Text — bản hiện tại). Khi tách ra `renderer/`, **giữ nguyên gần như toàn bộ**:
- Toàn bộ logic Canvas (`computeOutputCanvas`, `computeCover`, `computeTextCanvas`, `wrapText`...)
- Toàn bộ UI/state quản lý preset & template, kéo-thả ảnh, kéo crop, kéo slot text...

Chỉ thêm/đổi các phần native thật (không có trong bản demo chạy trong chat):
1. Lưu preset/template xuống `presets.json` / `templates.json` thật (qua `window.kingImg.savePresets/saveTemplates`) thay vì chỉ giữ trong RAM.
2. Xuất ảnh ghi file thật ra thư mục do người dùng chọn (qua `window.kingImg.saveFile`) thay vì tạo blob URL / zip tải về.
3. Font: thêm phần đọc danh sách font hệ thống + font riêng đã thêm (mục 8.2), thay 3 "kiểu chữ" cố định hiện tại bằng danh sách font thật + 2 toggle đậm/nghiêng độc lập.
4. Thêm thước đo + di chuyển bằng phím mũi tên trong khung tạo mẫu (mục 8.1) — đây là phần JS thuần, không liên quan native.

## 5. Lưu trữ dữ liệu trên máy

Tất cả lưu dưới `app.getPath` kiểu .NET tương đương: `Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData) + "\King Img\"` (≈ `%AppData%\King Img\`):

```
%AppData%\King Img\
├── presets.json
├── templates.json
└── fonts\
    ├── registry.json         // [{name, fileName}]
    └── (các file .ttf/.otf người dùng đã thêm)
```

- `templates.json`: array các object đúng schema đang dùng trong demo — `{id, name, canvasW, canvasH, format, quality, slots:[{id,label,x,y,width,height,fontSize,color,align,fontFamily,bold,italic,backdrop}]}`. **Đổi so với demo hiện tại:** field `styleKey` (3 kiểu cố định) đổi thành `fontFamily` (tên font thật) + `bold` (boolean) + `italic` (boolean) — xem mục 8.2.
- Lần đầu mở app: nếu chưa có `templates.json` → tạo rỗng (không seed mẫu mặc định, vì mẫu phụ thuộc nội dung của từng người dùng).
- Nếu chưa có `presets.json` → seed 4 preset mặc định giống demo (Facebook Feed, Instagram Story, Zalo OA Cover, Blog Thumbnail).

## 6. API cầu nối JS ↔ .NET (tóm tắt nhanh)

| JS gọi | .NET xử lý |
|---|---|
| `loadPresets()` / `savePresets()` | đọc/ghi `presets.json` |
| `loadTemplates()` / `saveTemplates()` | đọc/ghi `templates.json` |
| `chooseExportFolder()` | `FolderBrowserDialog` |
| `saveFile(folder, fileName, base64)` | decode base64 → `File.WriteAllBytes` |
| `openFolder(path)` | `Process.Start("explorer.exe", path)` |
| `listSystemFonts()` | `InstalledFontCollection().Families` |
| `addCustomFont(fileName, base64)` | decode → lưu vào `fonts\`, cập nhật `registry.json` |
| `listCustomFonts()` | đọc `fonts\registry.json` |

## 7. Tính năng — Tab 01: Resize & Export (đã chốt, giữ nguyên)

Giữ đúng toàn bộ như bản demo hiện tại: thêm ảnh, preset (3 kiểu resize: khung cố định+crop / cố định 1 chiều theo tỉ lệ / giới hạn khung), crop thủ công, xuất theo preset đã chọn. Không có thay đổi nào ở tab này — chỉ đổi phần lưu preset & xuất file thật như mục 4.

## 8. Tính năng — Tab 02: Chèn Text (đặc tả đầy đủ)

### 8.1 Quản lý mẫu (Template editor)

So với bản demo hiện tại, bổ sung 3 điểm:

**a) Live text preview thật khi tạo mẫu**
Hiện tại khung vị trí chỉ hiện label (vd "Vị trí 1"). Đổi thành: mỗi khung là 1 vùng có thể **gõ text thật trực tiếp** ngay lúc đặt vị trí (giống cách tab "Thêm ảnh & chèn text" đang preview), áp đúng font/size/màu/đậm/nghiêng/nền mờ đang chọn cho vị trí đó. Text gõ thử ở đây **không lưu vào mẫu** (chỉ để xem trước), khi lưu mẫu chỉ lưu vị trí + style như cũ.

**b) Thước đo (ruler)**
Thêm dải thước ngang phía trên và dải thước dọc bên trái khung canvas trong template editor, đơn vị px theo đúng `canvasW`/`canvasH` của mẫu, có vạch chia mỗi 50px/100px (tuỳ tỉ lệ zoom hiển thị). Khi đang kéo hoặc đang chọn 1 khung text, hiện thêm 2 đường dẫn hướng (guide line) màu nhạt chạy từ thước tới đúng vị trí x/y của khung đang chọn, để canh các khung khác nhau thẳng hàng với nhau.

**c) Di chuyển bằng phím mũi tên**
Khi 1 khung text đang được chọn (đã click chọn): phím ↑↓←→ di chuyển khung 1px/lần; giữ Shift + mũi tên di chuyển 10px/lần. Áp dụng cho cả x/y, có clamp trong biên canvas giống logic kéo chuột hiện tại.

### 8.2 Hệ thống font

Đổi `styleKey` (3 lựa chọn cố định) thành hệ thống font thật, 3 nguồn — người dùng chọn nguồn nào cũng ra cùng 1 giá trị `fontFamily` (tên font) lưu vào slot, cộng 2 checkbox độc lập **Đậm** / **Nghiêng**:

1. **Font bundle sẵn trong app** (0MB thêm khi dùng, vì đã đóng gói cùng app): mặc định 1 font tiếng Việt tốt — **Be Vietnam Pro** (đủ Regular/Bold/Italic/BoldItalic, ~vài trăm KB/file, tổng dưới 2MB). Load bằng `@font-face` trỏ tới `fonts-bundled/` (qua virtual host mapping, không cần internet).
2. **Font có sẵn trên máy Windows**: gọi `window.kingImg.listSystemFonts()` lúc mở dropdown chọn font, hiện danh sách tên font đã cài (Segoe UI, Calibri, Cambria...). Không tốn thêm dung lượng app. Cảnh báo nhỏ trong UI: "Font máy — chỉ hiển thị đúng trên máy có cài font này."
3. **Font riêng do người dùng thêm**: nút "+ Thêm font từ máy" → chọn file `.ttf`/`.otf` → gọi `window.kingImg.addCustomFont()` → host copy vào `%AppData%\King Img\fonts\` → JS load bằng `FontFace` API trỏ qua virtual host mapping tới thư mục đó, thêm vào `document.fonts`. Font này xuất hiện trong danh sách chọn ở các lần mở app sau (đọc từ `listCustomFonts()` lúc khởi động).

Bold/Italic: dùng đúng style/weight thật của font đó nếu có (browser tự chọn weight 700 khi tick Đậm, `font-style:italic` khi tick Nghiêng); nếu font không có bản đậm/nghiêng riêng, trình duyệt sẽ tự giả nghiêng/đậm (oblique/synthetic bold) — chấp nhận được cho bản đầu.

### 8.3 Thêm ảnh & chèn text (giữ nguyên thiết kế đã chốt)

- Thả nhiều ảnh, mỗi ảnh tự nhớ mẫu + nội dung text riêng (không ảnh hưởng ảnh khác).
- Ảnh mới tự nhận mẫu gần nhất vừa dùng.
- Cảnh báo (badge đỏ) nếu kích thước ảnh khác kích thước cố định của mẫu đang gán.
- Cho tinh chỉnh nhanh size/màu chữ riêng cho từng ảnh (không đổi mẫu gốc).

### 8.4 Xuất ảnh thật ra đĩa

Giống tab 1: hỏi thư mục lưu (`chooseExportFolder`), ghi từng file qua `saveFile`, tên file `tenMau_tenAnhGoc.ext`, sau khi xong có nút "Mở thư mục vừa lưu" (`openFolder`).

## 9. Đóng gói .NET + WebView2 thành `.exe` portable

- Publish self-contained, single file:

```
dotnet publish -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true
```

- Kết quả: 1 file `.exe` (~vài chục MB do .NET runtime tự mang theo ở mode self-contained — nếu muốn nhẹ hơn nữa có thể đổi sang framework-dependent nếu máy đích chắc chắn có .NET 8 Runtime, nhưng self-contained an toàn hơn để chia sẻ ra ngoài).
- WebView2 Runtime: hầu hết máy Windows 10/11 năm 2026 đã có sẵn (đi kèm Edge). App nên tự kiểm tra lúc khởi động (`CoreWebView2Environment.GetAvailableBrowserVersionString()`); nếu null, hiện thông báo + link tải WebView2 Runtime Evergreen Bootstrapper (rất nhẹ, vài MB, cài 1 lần dùng chung cho mọi app khác cũng dùng WebView2).

## 10. Checklist nghiệm thu

- [ ] Mở app lần đầu → tab 1 có 4 preset mặc định, tab 2 trống (chưa có mẫu).
- [ ] Tạo mẫu mới: thả ảnh tham khảo → thêm vị trí → gõ text thử thấy đúng font/size/màu ngay trong lúc tạo (live preview).
- [ ] Thước đo hiện đúng đơn vị px, kéo khung thấy guide line canh được giữa các khung.
- [ ] Chọn khung, bấm phím mũi tên → di chuyển đúng 1px; giữ Shift → 10px.
- [ ] Đổi font: thấy đủ 3 nguồn (bundle / máy / riêng); thêm 1 font `.ttf` từ máy → hiện ngay trong danh sách, đóng mở app lại vẫn còn.
- [ ] Tick Đậm/Nghiêng hiển thị đúng trong preview và đúng trong ảnh xuất ra.
- [ ] Đóng app, mở lại → preset & mẫu đã tạo vẫn còn nguyên.
- [ ] Thả nhiều ảnh, gán nhiều mẫu khác nhau, xuất 1 lần → đúng số file, đúng nội dung từng ảnh.
- [ ] Ảnh sai size so với mẫu → có badge cảnh báo, không chặn nhưng có nhắc rõ.
- [ ] Copy `.exe` sang máy Windows khác (không có sẵn project) → chạy được, WebView2 tự nhận máy đã có Edge runtime.

## 11. Có thể làm thêm sau (không bắt buộc bản đầu)

- Nhớ thư mục xuất gần nhất.
- Cảnh báo rõ hơn khi font hệ thống không tồn tại trên máy khác (lưu kèm "font dự phòng").
- Log lỗi khi ghi file thất bại (disk đầy, không có quyền...).
