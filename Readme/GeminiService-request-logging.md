# GeminiService - Request Logging

Ngày cập nhật: 2026-03-13
File chính: `src/services/geminiService.js`

## Mục tiêu
- Mỗi lần gọi API backend phải `console.log` dữ liệu gửi đi để test/debug dễ hơn (Postman đối chiếu).

## Logic đã thêm
- Tại hàm `callBackend(endpoint, payload)`:
  - Tạo sẵn `url` và `headers`
  - Trước khi `fetch`, log ra:
    - `endpoint`
    - `url`
    - `method: POST`
    - `headers`
    - `payload`

## Kết quả
- Tất cả các API dùng `callBackend` (ornament, combosticker analyze, combosticker generate, ...) đều tự động in request data.
- Không cần viết `console.log` riêng lẻ ở từng function gọi API nữa.
