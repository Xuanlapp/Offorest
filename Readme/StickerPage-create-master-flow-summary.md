# StickerPage - Create Master Flow Summary

## Mục tiêu
- Tạo trang Sticker lấy dữ liệu tương tự Holoarcylic.
- Không dùng filter.
- Hiển thị đúng các cột: STT, KEYWORD, LINK ẢNH, REDESIGN, Status.
- Chỉ dùng action `✨ Create Master`.
- Khi bấm `Create Master`: chỉ gửi `prompt + base64` lên backend.
- Backend trả về ảnh base64, sau đó frontend tự tách nền bằng code.

## File đã cập nhật
- `src/pages/StickerPage.jsx`
- `src/services/geminiService.js`
- `src/prompt/Prompts.ts`
- `src/components/Navbar.jsx`

## Chi tiết triển khai

### 1) StickerPage mới
- Lắng nghe event `stickerGetData` từ Navbar.
- Get Data đọc URL từ `localStorage.stickerSheetUrl`; nếu chưa có thì fallback `getSheetUrlForPage('sticker')`.
- Đọc CSV từ Google Sheet và map các cột:
  - STT
  - KEYWORD
  - LINK ẢNH
  - REDESIGN
  - Status
- Không áp dụng filter sản phẩm/trạng thái.

### 2) Nút `✨ Create Master`
- Mỗi dòng có nút `Create Master`.
- Request gọi service mới `createStickerMaster({...})`.
- Payload gửi backend theo format Gemini `contents.parts` gồm:
  - `inlineData` (mimeType + base64)
  - `text` (prompt)
- Không gửi lifestyle / không chạy flow khác.

### 3) Tách nền ở frontend
- Sau khi backend trả base64, frontend gọi `removeBackgroundSmart(base64, mimeType)`.
- Kết quả sau tách nền hiển thị preview PNG và có thể tải xuống.

### 4) Cập nhật Navbar cho Sticker
- Thêm state `stickerSheetUrl`.
- Hiển thị input `Sheet URL` ở route `/sticker`.
- Nút `Get Data` ở route Sticker sẽ dispatch event `stickerGetData`.
- Đồng thời chuẩn hóa route Suncatcher để dispatch `suncatcherGetData`.

## Kiểm tra
- Đã chạy `npm run build` thành công sau khi cập nhật.
- Đã quét lỗi file chính, không còn lỗi lint/compile liên quan thay đổi mới.

## Ghi chú
- Hiện flow Sticker tập trung đúng yêu cầu: `Create Master` và xử lý ảnh trả về base64 + tách nền phía client.
- Chưa đẩy upload/update sheet trong flow này để giữ đúng phạm vi yêu cầu hiện tại.
