# Sticker Create Master Background Removal

- Đã nối lại bước tách nền trong luồng `CREATE MASTER` của Sticker page.
- Sau khi `analyzeStickerImage` trả ảnh về, frontend sẽ gọi `removeBackgroundSmart` từ `backgroundRemovalService`.
- Ảnh hiển thị và ảnh dùng để `Update Sheet` giờ là phiên bản đã tách nền.
- Nếu tách nền thất bại, item sẽ báo lỗi ngay tại bước tạo master.