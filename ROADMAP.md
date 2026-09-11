# Roadmap

Ghi chú các hướng đã bàn nhưng chưa làm — không phải cam kết thời gian, chỉ để không quên.

## Ký code (code signing)

Bỏ qua ở bản 1.1.0 vì chưa cần thiết (repo private, tự phát hành thủ công). Cân nhắc lại nếu:
- Chuyển sang phát hành công khai (xem mục "Vận hành khi public" bên dưới), hoặc
- Người dùng phàn nàn nhiều về cảnh báo SmartScreen "Unknown publisher" lúc cài.

Việc cần làm khi tới lúc: mua chứng chỉ OV/EV code signing, ký `KingImgSetup-*.exe` (và có thể cả
`KingImg.exe`) trước khi phát hành.

## Rà lại UI 2 cột sâu hơn

Bản 1.1.0 đã đổi layout 3 tab sang 2 cột — đã build/rebuild và test qua Browser pane (version,
About modal, update banner) cùng vài lượt chạy app thật để xác nhận layout không vỡ, tab chuyển
đúng, batch CSV toggle đúng. **Chưa test** các thao tác kéo-thả thật trong layout mới:

- Kéo-thả ảnh vào dropzone (tab 1, 2, 3)
- Kéo crop-box (tab 1)
- Kéo-resize vị trí chèn text trong template editor (tab 2)
- Kéo đổi thứ tự trang PDF (tab 3)

Các thao tác này giữ nguyên code JS cũ (chỉ đổi khung bọc HTML/CSS), nhiều khả năng vẫn chạy tốt,
nhưng cần anh Viên tự tay thử qua để chắc chắn thay vì tự động hoá bằng công cụ điều khiển màn
hình.

## Tính năng mới

Chưa có ý tưởng cụ thể — ghi vào đây khi anh Viên chốt.

## Kênh phát hành & kiểm tra bản mới

Trạng thái hiện tại (từ v1.1.1): repo `KingIMG` đang **public** trên GitHub, tính năng tự kiểm
tra bản mới (`CheckForUpdateAsync` trong `KingImgApi.cs`) gọi thẳng GitHub Releases API — đang
hoạt động bình thường, banner trỏ thẳng file cài đặt (không qua trang Release).

**Đã quyết định (2026-09-11), chưa triển khai:** chuyển sang tự host bản cài + file version,
để source code có thể về lại private mà vẫn giữ được tính năng tự báo bản mới, không phụ thuộc
GitHub phải public cả repo mới dùng được.

Hướng đã chốt — tự host trên **hosting Hostinger sẵn có của anh Viên** (gói Premium Web Hosting
đang dùng — đủ dung lượng/tính năng cho việc này, không cần nâng cấp gói), qua **1 subdomain
riêng, tách khỏi website brand hiện tại** (chưa đặt tên cụ thể — anh Viên sẽ tách tên miền,
nghiên cứu tiếp trước khi triển khai). Cơ chế dự kiến:

- Upload `version.json` (dạng `{"version":"x.x.x","url":"https://<subdomain>/KingImgSetup-x.x.x.exe"}`)
  cùng file cài đặt `.exe` lên hosting qua File Manager/FTP.
- Sửa `CheckForUpdateAsync()` trong `KingImgApi.cs` để đọc `version.json` này thay vì gọi GitHub
  Releases API.
- Sau khi hoạt động ổn định, có thể chuyển `KingIMG` về lại private (không bắt buộc, tuỳ anh
  Viên quyết ở thời điểm đó).

Các phương án khác đã cân nhắc trong buổi bàn, không chọn (nhưng vẫn khả thi nếu hướng self-host
gặp vướng mắc):
- **Repo "vỏ" public riêng trên GitHub** (`KingIMG-releases`, chỉ chứa Release, không chứa
  source) — miễn phí, ít việc nhất, nhưng vẫn phụ thuộc hạ tầng GitHub.
- **Thư viện auto-update chuyên dụng** (Velopack, NetSparkle, ClickOnce) — mạnh hơn (tự tải, tự
  cài, tự khởi động lại) nhưng tốn công tích hợp hơn nhiều, chưa cần ở quy mô hiện tại.

Khi bắt tay triển khai, đọc lại `_system/conventions/publish-software.md` mục 5–6 để không lặp
lại các cân nhắc đã ghi (fail êm khi không có mạng/chưa có version.json, link tải thẳng file
không qua trang web trung gian, v.v.) — và cập nhật lại mục 5–6 của file đó nếu cách làm thực tế
khác với những gì đang ghi (hiện ghi theo hướng GitHub Releases).
