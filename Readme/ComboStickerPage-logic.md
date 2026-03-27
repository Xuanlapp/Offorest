# ComboStickerPage - Logic triển khai

Ngày cập nhật: 2026-03-13
File chính: `src/pages/ComboStickerPage.jsx`

## 1) Upload & giữ ảnh trong vùng upload
- Hỗ trợ 2 nguồn ảnh:
  - Upload file local (`input type=file`)
  - Kéo-thả URL ảnh trực tiếp (Etsy/Amazon)
- Khi có ảnh:
  - `previewUrl` luôn giữ ảnh hiện trong dropzone
  - reset kết quả cũ (`generatedResults`), trạng thái phân tích (`analysisResult`), tiến trình (`runProgress`)

## 2) Run Analysis & Split
- Nút `Run Analysis & Split` gọi `analyzeComboImage(...)` với:
  - ảnh nguồn (file hoặc URL)
  - `targetOutput`
  - prompt `PROMPTS.combostickerAnalyze`
- Kết quả phân tích trả về: `theme`, `style`, `colorPalette`, `objects`
- Hỗ trợ 2 kiểu `objects` từ API:
  - Mảng string: `["Koala", "Rabbit", ...]`
  - Mảng object: `[{ label, box_2d, confidence }, ...]`
- Khi `objects` là object, hệ thống tự lấy `label` để làm tên object cho bước generate.
- Nếu số object ít hơn `targetOutput`, hàm `normalizeObjectsToTarget` tự thêm biến thể `(Variation n)` cho đủ số lượng.

## 3) Sinh ảnh theo số lượng Target Output
- Vòng lặp qua danh sách object đã chuẩn hóa
- Mỗi object gọi `generateComboStickerImage(...)` với:
  - objectName + keyword + theme/style/palette
  - prompt `PROMPTS.combostickerGenerate`
- Cập nhật tiến trình theo từng ảnh (`runProgress`) và thông báo đang chạy (`runMessage`).

## 4) Xử lý transparent PNG (xóa nền trắng)
- Sau khi AI trả ảnh base64, chạy `removeWhiteBackground(...)` bằng Canvas:
  - quét pixel gần trắng
  - set alpha = 0
- Lưu ảnh kết quả vào `transparentDataUrl` để hiển thị và tải xuống.

## 5) Results Grid + thao tác ảnh
- Card sticker hỗ trợ hover actions:
  - `Generate Similar`
  - `Download`
- `Download All` tải lần lượt toàn bộ ảnh đã sinh.
- Có thẻ `Add Image (+)` để sinh thêm 1 ảnh mới dựa trên object ngẫu nhiên từ phân tích ban đầu.

## 6) Image Editor modal
- Mở khi click vào card ảnh
- Có slider filter realtime:
  - Brightness, Contrast, Saturation, Hue, Sepia
- Có ô nhập yêu cầu redesign:
  - gửi lại ảnh hiện tại + text thay đổi để AI vẽ lại
- Có nút `Generate Similar` và `Download` (download theo filter hiện tại bằng Canvas).

## 7) Các state chính
- Nguồn ảnh: `imageFile`, `previewUrl`, `imageSourceUrl`
- Cấu hình chạy: `targetOutput`, `keyword`, `statusNote`
- Tiến trình: `isRunning`, `runProgress`, `runMessage`
- Kết quả: `analysisResult`, `generatedResults`
- Editor: `editingItem`

## 8) Lưu ý tích hợp backend
- Dữ liệu AI đi qua service `src/services/geminiService.js`
- Frontend không gửi Gemini API key trực tiếp
- Dùng flow phân tích/sinh ảnh qua backend endpoint hiện có.
