# King Img — Spec build app Windows desktop

Tài liệu này để đưa cho Codex (hoặc bất kỳ coding agent nào) build ra app Windows thật, dựa trên bản demo HTML/JS đã được duyệt UX (file `king-img-demo.html` đính kèm cùng tài liệu này).

## 1. Tổng quan

- **Tên app:** King Img
- **Mục đích:** Resize/chuẩn hoá ảnh hàng loạt theo các preset kích thước đã lưu sẵn (theo từng nền tảng: Facebook, Instagram, Zalo...), xuất ra định dạng ảnh mong muốn (ưu tiên WebP).
- **Đối tượng dùng:** Cá nhân hoặc chia sẻ ra ngoài cho người khác dùng (không cần tài khoản, không cần internet, không cần cloud sync).
- **Nền tảng:** Windows 10/11 64-bit. Output cuối là **1 file `.exe` chạy thẳng (portable)**, không cần bộ cài đặt.

## 2. Công nghệ & kiến trúc

- **Electron** (Node.js + Chromium) — vì bản demo đã viết bằng HTML/CSS/JS thuần và toàn bộ logic xử lý ảnh (resize, crop, xuất webp) đã chạy đúng qua Canvas API. Electron cho phép tái sử dụng gần như nguyên vẹn phần renderer này, chỉ cần bổ sung phần đọc/ghi file thật xuống đĩa.
- Kiến trúc 3 phần:
  - **Main process** (`main.js`): tạo cửa sổ app, xử lý dialog chọn thư mục lưu ảnh, đọc/ghi file preset.json, ghi file ảnh export ra đĩa.
  - **Preload script** (`preload.js`): expose một API an toàn (`window.kingImg.*`) cho renderer gọi xuống main qua `ipcRenderer.invoke`. Dùng `contextIsolation: true`, **không** bật `nodeIntegration` trong renderer — đây là pattern bảo mật chuẩn của Electron hiện nay.
  - **Renderer** (`index.html` + `app.js` + `style.css`): chính là nội dung của `king-img-demo.html`, tách phần `<style>` và `<script>` ra file riêng cho gọn, giữ nguyên toàn bộ logic UI/resize/crop đã có.

## 3. Cấu trúc thư mục đề xuất

```
king-img/
├── package.json
├── main.js
├── preload.js
├── renderer/
│   ├── index.html
│   ├── style.css
│   └── app.js          (logic từ demo, chỉnh phần lưu preset + export)
├── build/
│   └── icon.ico         (icon app, có thể để tạm icon mặc định)
└── README.md
```

## 4. Tái sử dụng bản demo

`king-img-demo.html` đã có đầy đủ và **chạy đúng**:
- Upload nhiều ảnh (drag & drop + chọn file)
- CRUD preset, 3 kiểu resize: `fixed` (khung cố định + crop), `axis` (cố định 1 chiều theo tỉ lệ), `max` (giới hạn khung tối đa, không crop)
- Mỗi preset lưu kèm format (`webp`/`jpeg`/`png`/`original`) + quality
- Logic crop thủ công (kéo khung, có nút canh giữa lại)
- Hàm xử lý ảnh qua Canvas: `computeCover()`, `computeOutputCanvas()`, `needsCrop()`

**Giữ nguyên toàn bộ các hàm và UI này.** Chỉ thay đổi 2 chỗ:
1. Preset hiện đang chỉ lưu trong biến JS (`presets` array) → cần đọc/ghi xuống file thật khi app khởi động/khi preset thay đổi (xem mục 5).
2. Xuất ảnh hiện đang tạo blob URL cho người dùng bấm "Tải xuống" / zip → cần ghi file thật xuống thư mục do người dùng chọn (xem mục 6.5).

Không cần viết lại CSS hay layout — giữ đúng giao diện tối giản, dark mode đã duyệt.

## 5. Lưu trữ preset xuống máy

- Vị trí file: `app.getPath('userData')` + `\presets.json` (Electron tự map đúng `%APPDATA%\King Img\presets.json` trên Windows).
- Format: JSON array, mỗi object đúng schema preset hiện có trong demo:

```json
{
  "id": "string",
  "name": "string",
  "mode": "fixed | axis | max",
  "width": 1200,
  "height": 630,
  "axis": "width | height",
  "axisValue": 600,
  "maxWidth": 2000,
  "maxHeight": 2000,
  "format": "webp | jpeg | png | original",
  "quality": 80
}
```

- Khi app khởi động lần đầu (chưa có file `presets.json`): tạo file với 4 preset mặc định giống demo (Facebook Feed, Instagram Story, Zalo OA Cover, Blog Thumbnail).
- Mỗi lần thêm/sửa/xoá preset trong UI → gọi API lưu xuống file ngay (không cần nút "Lưu" riêng).

## 6. Tính năng chi tiết (MVP — phải có đủ)

### 6.1 Thêm ảnh
Giữ nguyên như demo: kéo-thả hoặc chọn file, hỗ trợ nhiều ảnh, hiện thumbnail, xoá ảnh khỏi danh sách.

### 6.2 Quản lý preset
Giữ nguyên UI/logic demo. Khác biệt duy nhất: mọi thay đổi (thêm/sửa/xoá) phải **ghi xuống `presets.json` thật**, không chỉ lưu trong RAM.

### 6.3 Resize/crop logic
Giữ nguyên 100% logic Canvas từ demo (3 kiểu resize, tính cover-crop, tính scale theo tỉ lệ, giới hạn khung).

### 6.4 Crop thủ công
Giữ nguyên UI kéo khung từ demo (pointer events, canh giữa mặc định, nút reset).

### 6.5 Xuất ảnh thật ra đĩa
Đây là phần khác biệt chính so với demo:
- Trước khi xuất, hỏi người dùng chọn **thư mục lưu** (dùng `dialog.showOpenDialog({ properties: ['openDirectory'] })` ở main process qua IPC).
- Renderer tính ảnh ra `canvas` → `canvas.toBlob()` → convert blob thành `ArrayBuffer` → gửi buffer qua `ipcRenderer.invoke('save-file', { folder, fileName, buffer })` → main process dùng `fs.writeFile` ghi file thật.
- Giữ tên file theo quy tắc demo: `tenPreset_tenAnhGoc.ext`.
- Sau khi xuất xong, hiện danh sách file đã lưu + nút "Mở thư mục vừa lưu" (dùng `shell.openPath(folder)`).
- **Không cần** giữ tính năng zip (JSZip) — vì giờ ghi thẳng ra thư mục, không cần gói lại để tải.

## 7. API cần expose qua preload (`window.kingImg`)

```js
window.kingImg = {
  loadPresets: () => Promise<Preset[]>,
  savePresets: (presets) => Promise<void>,
  chooseExportFolder: () => Promise<string|null>,   // trả về path hoặc null nếu hủy
  saveFile: (folderPath, fileName, arrayBuffer) => Promise<{ ok: boolean, path?: string, error?: string }>,
  openFolder: (folderPath) => Promise<void>,
};
```

Tất cả implement trong `preload.js` qua `contextBridge.exposeInMainWorld`, gọi `ipcRenderer.invoke` tương ứng tới các handler trong `main.js` (`ipcMain.handle(...)`).

## 8. Đóng gói thành `.exe` portable

- Dùng **electron-builder**.
- `package.json` cần có:

```json
"build": {
  "appId": "com.kingimg.app",
  "productName": "King Img",
  "win": {
    "target": "portable",
    "icon": "build/icon.ico"
  }
}
```

- Lệnh build: `npm run build` → chạy `electron-builder --win portable` → ra 1 file `King Img.exe` trong thư mục `dist/`, chạy thẳng không cần cài đặt, vẫn đọc/ghi `presets.json` bình thường qua `app.getPath('userData')`.

## 9. Checklist nghiệm thu

- [ ] Mở app lần đầu → tự tạo 4 preset mặc định, hiện đúng trong UI.
- [ ] Thêm/sửa/xoá preset → đóng app, mở lại → preset vẫn còn đúng như đã sửa.
- [ ] Kéo nhiều ảnh vào → chọn nhiều preset → ảnh lệch tỉ lệ hiện đúng bước crop thủ công.
- [ ] Kéo khung crop → xuất ảnh → ảnh ra đúng vùng đã chọn, không bị méo, không bị lệch.
- [ ] Bấm Xuất ảnh → chọn được thư mục → ảnh thật xuất hiện trong thư mục đó, đúng tên, đúng định dạng, đúng kích thước.
- [ ] Đóng gói ra `.exe` → copy sang máy Windows khác (không có Node/Electron cài sẵn) → chạy được bình thường.

## 10. Có thể làm thêm sau (không bắt buộc cho bản đầu tiên)

- Nhớ thư mục xuất lần gần nhất, gợi ý lại lần sau.
- Icon riêng cho app (hiện tại dùng icon mặc định).
- Xuất log nhỏ khi có lỗi ghi file (disk đầy, không có quyền ghi...).
