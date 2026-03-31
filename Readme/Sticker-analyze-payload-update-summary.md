# Sticker Analyze Payload Update

- Endpoint `/vertex/sticker/analyze` đã được chỉnh để chỉ gửi 2 field: `base64` và `prompt`.
- Frontend vẫn hỗ trợ cả `file` và `imageUrl`, nhưng trước khi gọi API sẽ chỉ trích xuất chuỗi `base64` rồi gửi lên backend.
- Đã bỏ phần bọc payload theo format `contents -> parts -> inlineData` cho riêng luồng Sticker Analyze.
- Kết quả trả về vẫn giữ nguyên logic parse `base64` và `mimeType` từ response backend để không làm đổi flow hiển thị ở Sticker page.