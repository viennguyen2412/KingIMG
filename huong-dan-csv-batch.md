# Hướng dẫn viết CSV batch cho King Img

## Sơ lược app

King Img là app Windows dùng để resize ảnh và chèn text hàng loạt lên ảnh theo mẫu đã lưu. Mỗi mẫu có tên, kích thước canvas, định dạng xuất và các vị trí text đã đặt sẵn. Batch CSV dùng cho tab Chèn Text: app đọc ảnh trong một thư mục nguồn, lấy nội dung từ CSV, đặt text vào đúng vị trí của đúng mẫu, rồi xuất ảnh mới ra thư mục đã chọn.

## Định dạng CSV

File CSV bắt buộc có 4 cột, viết đúng tên:

```csv
ten_anh,ten_mau,ten_vi_tri,noi_dung
```

Ý nghĩa:

- `ten_anh`: tên file ảnh nguồn trong thư mục ảnh, ví dụ `bia_ch1.jpg`.
- `ten_mau`: tên mẫu đã lưu trong app, phải khớp chính xác.
- `ten_vi_tri`: tên vị trí text trong mẫu, phải khớp chính xác.
- `noi_dung`: text sẽ chèn vào vị trí đó.

## Ảnh xuất

Mỗi lần chạy batch, King Img tự tạo một thư mục con mới theo thời điểm trong `Text/` cạnh thư mục
nguồn. Không dùng lại thư mục của batch trước.

## Chạy batch và lưu đè CSV

- `Chạy batch`: chỉ xuất ảnh, không thay đổi file CSV gốc.
- `Chạy batch + lưu đè CSV`: app hỏi xác nhận, chạy batch trước, rồi chỉ ghi đè CSV khi toàn bộ ảnh đã xuất thành công.
- Trước khi ghi, app tạo bản backup cạnh file gốc với đuôi `.csv.bak`.
- CSV sau khi ghi giữ 4 cột chuẩn `ten_anh`, `ten_mau`, `ten_vi_tri`, `noi_dung` và được ghi bằng UTF-8.
- Nếu kiểm tra ảnh, template hoặc xuất ảnh có lỗi, app không ghi đè CSV.

## Cách viết đúng

- Dùng long-format: 1 dòng = 1 ảnh + 1 vị trí text.
- Nếu một ảnh có nhiều vị trí text, lặp lại cùng `ten_anh` trên nhiều dòng.
- Một ảnh chỉ được gán với một `ten_mau` trong cùng file CSV.
- `ten_mau` và `ten_vi_tri` nên lấy từ file xuất bằng nút Xuất danh sách mẫu để tránh sai tên.
- Ảnh nguồn phải tồn tại trong thư mục đã chọn khi chạy batch.
- Kích thước ảnh nguồn phải khớp kích thước mẫu, sai lệch tối đa khoảng 2px.
- Nếu `noi_dung` có dấu phẩy, xuống dòng hoặc dấu nháy kép, bọc bằng dấu `"..."`; dấu `"` bên trong text viết thành `""`.
- Nên lưu file CSV bằng UTF-8 để không lỗi tiếng Việt.

## Ví dụ

```csv
ten_anh,ten_mau,ten_vi_tri,noi_dung
bia_ch1.jpg,Ảnh bìa,Tiêu đề chính,"Chương 1: Khởi đầu"
bia_ch1.jpg,Ảnh bìa,Tiêu đề phụ,"Nhện Đỏ"
con_ch1_01.jpg,Ảnh con,Số trang,"1"
```

## Prompt ngắn cho AI viết CSV

Hãy tạo file CSV UTF-8 cho King Img. CSV bắt buộc có header `ten_anh,ten_mau,ten_vi_tri,noi_dung`. Mỗi dòng là một ảnh và một vị trí text. Nếu một ảnh có nhiều vị trí, lặp lại tên ảnh trên nhiều dòng. Chỉ dùng đúng tên mẫu và tên vị trí trong danh sách mẫu đã cung cấp. Không tự đổi tên file ảnh, tên mẫu, tên vị trí. Bọc nội dung bằng dấu nháy kép khi có dấu phẩy, xuống dòng hoặc ký tự đặc biệt.
