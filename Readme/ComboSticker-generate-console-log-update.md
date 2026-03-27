# ComboSticker generate console log update

## Mục tiêu
Thêm `console.log` khi frontend gửi request tới endpoint `/gemini/combosticker/generate`.

## File thay đổi
- `src/services/geminiService.js`

## Nội dung cập nhật
Trong hàm `generateComboStickerImage`, trước khi gọi:
- `callBackend('/gemini/combosticker/generate', payload)`

đã thêm log:
- `console.log('📤 [geminiService] POST /gemini/combosticker/generate', ... )`

Log hiển thị đầy đủ payload chính, nhưng trường `inlineData.data` được rút gọn thành:
- `[base64 length: ...]`

để tránh spam console bởi chuỗi base64 rất dài.

## Kết quả
- Khi bấm generate combo sticker, console sẽ hiển thị request body đang gửi lên backend.
- File đã check lỗi cú pháp: không có lỗi.
