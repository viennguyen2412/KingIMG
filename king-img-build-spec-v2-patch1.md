# King Img — Spec patch #1 (sau v2)

Đây là **patch**, không phải bản viết lại từ đầu — áp dụng lên app đã build xong (tab 01 Resize & Export, tab 02 Chèn Text cơ bản theo spec v2). Đưa file này + `king-img-demo.html` (bản mới nhất, đã có layout UI của các tính năng dưới đây) cho Codex.

## 0. Phạm vi patch này

1. Mở rộng style chữ trong template: đậm/nghiêng/gạch chân độc lập, viền chữ, nền sau chữ (shape + màu + độ mờ, tự co theo khối chữ thật).
2. Tolerance ±2px khi so kích thước ảnh với mẫu (thay cho khớp tuyệt đối).
3. Tính năng "Xuất danh sách mẫu" (file tham chiếu tên mẫu/vị trí).
4. Batch import qua file CSV — xử lý nhiều ảnh từ 1 thư mục, không cần kéo-thả tay từng ảnh.

Không đổi: kiến trúc .NET + WebView2, tab 01, cách lưu `presets.json`/`templates.json` hiện có (chỉ đổi cấu trúc field bên trong slot — xem mục 1).

## 1. Đổi schema slot (`templates.json`)

**Schema cũ (spec v2):**
```json
{ "id":"", "label":"", "x":0,"y":0,"width":0,"height":0,
  "fontSize":0,"color":"#fff","align":"center","styleKey":"clean","backdrop":true }
```

**Schema mới:**
```json
{
  "id":"", "label":"", "x":0,"y":0,"width":0,"height":0,
  "fontSize":0,"color":"#fff","align":"center","styleKey":"clean",
  "bold": false,
  "italic": false,
  "underline": false,
  "outline": { "enabled": false, "color": "#000000", "width": 2 },
  "background": { "enabled": true, "shape": "rect", "color": "#000000", "opacity": 45 }
}
```

- `styleKey` giữ nguyên tạm thời (vẫn dùng 3 preset font cũ — hệ thống font thật theo mục 8.2 của spec v2 làm ở patch khác, không nằm trong patch này).
- `bold`/`italic` độc lập với `styleKey` — áp đè lên font đang chọn (không thay font, chỉ thay weight/oblique).
- `backdrop` (boolean) bị xoá, thay bằng object `background`.
- `background.opacity`: số 0–100 (%).
- `background.shape`: `"rect"` hoặc `"circle"`.

App cần tự thêm field mặc định cho slot tạo mới đúng theo schema trên (xem `addTplSlot()` trong demo để lấy giá trị mặc định).

## 2. UI template editor (tham chiếu `king-img-demo.html` bản mới nhất)

Panel cài đặt 1 vị trí text đổi thành:
- Tên vị trí, Kiểu chữ (giữ nguyên — dropdown 3 preset cũ)
- Size chữ, Màu chữ
- Căn lề
- 3 checkbox: Đậm / Nghiêng / Gạch chân
- Khối "Viền chữ": checkbox bật + (hiện khi bật) màu viền + độ dày viền (px)
- Khối "Nền sau chữ": checkbox bật + (hiện khi bật) Shape (Vuông/Tròn) + màu nền + độ mờ (%)

Layout/copy chữ chính xác — lấy nguyên theo file demo, không cần thiết kế lại.

## 3. Logic vẽ thật khi xuất ảnh (`computeTextCanvas`) — phần CODE MỚI, chưa có trong demo

Demo hiện tại mới chỉ hiện đúng các style này ở khung preview (bước 02, lúc gõ text) bằng CSS — **chưa vẽ thật vào ảnh xuất**. Đây là phần chính cần code trong patch này.

Thứ tự vẽ cho mỗi vị trí (giữ đúng thứ tự, ảnh hưởng lớp đè lên nhau):

1. **Tính bounding box thật của khối chữ** trước — dùng đúng kết quả `wrapText()` đã có (số dòng, độ rộng từng dòng theo `ctx.measureText`), không dùng `slot.width/height` (đó chỉ là khung lúc đặt vị trí, không phải kích thước chữ thật). Lấy `maxLineWidth = max(width từng dòng)`, `blockH = số dòng × lineHeight`.
2. **Nền sau chữ** (nếu `background.enabled`):
   - `rect`: vẽ `fillRect` quanh bounding box ở bước 1 + padding (giữ đúng logic cũ, chỉ đổi màu/opacity theo `background.color`/`background.opacity` thay vì màu đen 45% cố định).
   - `circle`: vẽ 1 hình tròn thật (bán kính 2 chiều bằng nhau, dùng `ctx.arc`), tâm tại đúng tâm bounding box, bán kính = `max(maxLineWidth, blockH)/2 + padding`. Lưu ý đã thống nhất: chữ dài sẽ ra vòng tròn to hơn cần thiết theo chiều cao, đó là hành vi đúng, không cần "thu nhỏ chữ để tròn cho đẹp".
3. **Viền chữ** (nếu `outline.enabled`): `ctx.strokeText()` từng dòng, `ctx.lineWidth = outline.width`, `ctx.strokeStyle = outline.color` — vẽ **trước** khi fill chữ (để phần fill nằm gọn bên trong viền).
4. **Chữ chính**: `ctx.fillText()` từng dòng như cũ, `ctx.font` build từ `fontSize` + `styleDef.family` + weight (`bold ? 700 : styleDef.weight`) + style (`italic ? 'italic' : 'normal'`).
5. **Gạch chân** (nếu `underline`): vẽ 1 đường `ctx.lineTo` ngay dưới mỗi dòng, độ dài đúng bằng `measureText` của dòng đó (không phải `slot.width`), vị trí x theo đúng `align` của dòng đó, màu = màu chữ, độ dày ≈ `fontSize/14`.

## 4. Tolerance ±2px khi so size ảnh với mẫu

Đổi mọi chỗ đang so `imgWidth !== tpl.canvasW` (khớp tuyệt đối) sang:
```js
mismatch = Math.abs(imgWidth - tpl.canvasW) > 2 || Math.abs(imgHeight - tpl.canvasH) > 2
```
Áp dụng ở **3 nơi**: badge cảnh báo trên thumbnail (luồng tay), banner cảnh báo trong active editor (luồng tay), và bước validate batch (mục 6.3 dưới đây).

## 5. "Xuất danh sách mẫu"

1 nút trong bước 01 (tab Chèn Text) — xuất file `.txt` liệt kê: tên mẫu, kích thước yêu cầu (`canvasW×canvasH`), tên từng vị trí text của mẫu đó. Mục đích: làm nguồn tra cứu khi viết file batch CSV (mục 6), tránh gõ sai tên mẫu/tên vị trí. Định dạng giữ đơn giản dạng text (xem demo). Nếu sau này muốn AI tự sinh file CSV, có thể đề xuất xuất thêm bản `.json` cùng nội dung — không bắt buộc trong patch này.

## 6. Batch import qua file CSV

### 6.1 Định dạng file (long-format — 1 dòng = 1 ảnh + 1 vị trí, không phải 1 ảnh = 1 dòng)

```
ten_anh, ten_mau, ten_vi_tri, noi_dung
bia_ch1.jpg, Ảnh bìa, Tiêu đề chính, "Chương 1: Khởi đầu"
bia_ch1.jpg, Ảnh bìa, Tiêu đề phụ, "Nhện Đỏ"
con_ch1_01.jpg, Ảnh con, Số trang, "1"
```
Lý do dùng long-format: 1 lần batch có thể trộn nhiều mẫu khác nhau (số vị trí khác nhau), wide-format (mỗi vị trí 1 cột cố định) sẽ vỡ khi đổi mẫu giữa các dòng.

### 6.2 API native cần thêm vào `KingImgApi` (bổ sung thêm vào bảng API ở mục 6 của spec v2)

| JS gọi | .NET xử lý |
|---|---|
| `chooseSourceFolder()` | `FolderBrowserDialog`, trả path thư mục chứa ảnh nguồn |
| `listImagesInFolder(folderPath)` | trả JSON array tên file ảnh (jpg/png/webp) trong thư mục đó |
| `readImageFile(folderPath, fileName)` | đọc file, trả base64 để JS decode thành `Image`/canvas |

Lý do cần thêm 3 API này: batch mode phải tự đọc ảnh từ thư mục theo tên ghi trong CSV, không thể bắt người dùng kéo-thả tay từng ảnh như luồng thủ công — mất hết ý nghĩa "tự động hoá".

### 6.3 Luồng xử lý

1. Người dùng chọn file CSV (input file thường, chỉ đọc nội dung text, không cần qua native).
2. Người dùng chọn thư mục chứa ảnh nguồn (`chooseSourceFolder`).
3. App đọc CSV, gộp các dòng theo `ten_anh` → mỗi ảnh có 1 danh sách `(ten_vi_tri, noi_dung)`.
4. **Validate toàn bộ trước khi chạy** (không chạy rồi báo lỗi từng dòng):
   - `ten_mau` có khớp đúng 1 mẫu đã lưu không.
   - `ten_vi_tri` có khớp đúng tên 1 vị trí của mẫu đó không.
   - `ten_anh` có tồn tại trong thư mục đã chọn không (so với kết quả `listImagesInFolder`).
   - Đọc thật kích thước ảnh (`readImageFile` rồi decode) — khớp size mẫu trong dung sai ±2px (mục 4) không.
   - Hiện **toàn bộ** lỗi tìm được trong 1 danh sách duy nhất, không dừng ở lỗi đầu tiên.
5. Nếu không còn lỗi (hoặc người dùng chủ động chọn "Vẫn chạy, bỏ qua các dòng lỗi") → chọn thư mục xuất (`chooseExportFolder`, đã có sẵn) → với mỗi ảnh: `readImageFile` → decode → dựng canvas đúng theo `computeTextCanvas` (mục 3) với nội dung text từ CSV → `saveFile` (đã có sẵn).
6. Xuất xong → hiện danh sách kết quả + nút mở thư mục (`openFolder`, đã có sẵn).

### 6.4 Không làm trong patch này

- Không tự resize ảnh sai size trong batch (đã chốt: người dùng resize tay qua tab 01 trước khi batch).
- Không hỗ trợ chạy qua command-line argument (`--batch file.csv`) — chỉ qua nút trong UI ở patch này. Có thể làm thêm sau nếu cần hẹn giờ/Task Scheduler.

## 7. Checklist nghiệm thu riêng cho patch này

- [ ] Tạo 1 vị trí text mới → đủ 3 checkbox Đậm/Nghiêng/Gạch chân, khối Viền chữ, khối Nền sau chữ đúng như demo.
- [ ] Bật Viền chữ, chọn màu/độ dày → ảnh xuất ra có viền đúng màu/độ dày đó, chữ vẫn đọc được rõ.
- [ ] Bật Gạch chân → đường gạch nằm đúng dưới mỗi dòng, đúng độ rộng từng dòng (dòng ngắn dòng dài khác nhau vẫn đúng).
- [ ] Nền sau chữ chọn Tròn, gõ chữ ngắn (1-2 từ) → ra hình tròn ôm khít quanh chữ, chữ nằm chính giữa, không lệch trên/dưới.
- [ ] Nền sau chữ chọn Tròn, gõ đoạn dài nhiều dòng → vòng tròn to ra theo đúng bề ngang, chữ vẫn nằm giữa, không bị cắt.
- [ ] Ảnh lệch 1-2px so với mẫu → không còn báo cảnh báo (cả luồng tay và batch).
- [ ] Bấm "Xuất danh sách mẫu" → ra đúng file liệt kê tên mẫu + size + tên vị trí.
- [ ] Chạy batch với CSV có 1 dòng `ten_mau` sai tên → báo lỗi rõ dòng nào, không chạy mù.
- [ ] Chạy batch với CSV hợp lệ, trộn 2 mẫu khác nhau → ra đúng số file, đúng nội dung, đúng định dạng theo từng mẫu.
