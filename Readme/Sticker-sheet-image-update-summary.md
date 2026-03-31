# Sticker Sheet Image Update

- Đã thêm khả năng update ảnh master từ Sticker page trực tiếp vào Google Sheet.
- Luồng mới tái sử dụng `updateRecordInSheet` trong `googleDriveService` nên không cần tạo API mới.
- Mỗi item sau khi tạo xong ảnh master sẽ có thêm nút `Update Sheet` để đẩy ảnh lên đúng dòng theo `STT` và `gid` của sheet sticker.
- UI có trạng thái `uploading`, `done`, `error` cho từng item để dễ theo dõi kết quả update.