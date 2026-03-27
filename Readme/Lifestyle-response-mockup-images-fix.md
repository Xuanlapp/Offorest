# Lifestyle response mockup.images fix

## Mục tiêu
Hiển thị ảnh lifestyle khi backend trả về theo cấu trúc:

```json
{
  "mockup": {
    "images": [
      {
        "mime_type": "image/jpeg",
        "data": "...base64..."
      }
    ]
  }
}
```

## Thay đổi đã thực hiện
- File sửa: `src/services/geminiService.js`
- Mở rộng `extractImageResult(responseData)` để đọc thêm nhánh `mockup.images[0]`.
- Hỗ trợ các key ảnh phổ biến trong item:
  - `base64`
  - `data`
  - `image_data`
  - `inline_data`
- Sửa lỗi hàm lifestyle:
  - Từ gọi sai `extractImageResultm(...)`
  - Thành `extractImageResult(data)`
- Xóa log test tạm trong `generateLifestyleImage`.

## Kết quả
`generateLifestyleImage` giờ trả object chuẩn:
- `base64`
- `mimeType`

Frontend có thể tiếp tục render như cũ bằng:
`data:${mimeType};base64,${base64}`

## Ghi chú
Nếu backend đổi tên trường ảnh khác nữa, chỉ cần bổ sung key trong `extractImageResult` để không phải sửa UI.
