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

## Vận hành khi public (nếu sau này đổi ý)

Hiện tại: giữ repo private, phát hành thủ công (tự tải `installer/Output/*.exe` và gửi/host chỗ
khác). Tính năng tự kiểm tra bản mới trong app (`CheckForUpdateAsync` gọi GitHub Releases API)
đang **không hoạt động** vì gọi API ẩn danh vào repo private luôn trả 404 — không lỗi, chỉ im
lặng không tìm thấy gì. Nếu sau này public repo, tính năng này sẽ tự chạy đúng không cần sửa gì
thêm. Nếu muốn tính năng này chạy mà vẫn giữ repo private, cần hướng khác (vd. host 1 file JSON
version nhỏ ở nơi public riêng để app check, tách khỏi GitHub API).
