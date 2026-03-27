# Offorest Desktop App Setup Summary

## Mục tiêu

Chuyển dự án React + Vite hiện tại thành desktop app chạy trên Windows bằng Electron.

## Những gì đã được hoàn thiện

### 1. Chuẩn hóa Electron entry

- `main.js` đã được chuyển sang cú pháp ESM để tương thích với `"type": "module"` trong `package.json`.
- Electron chạy theo 2 chế độ:
  - Dev: mở `http://localhost:5173`
  - Production: mở file `app-dist/index.html`

### 2. Tách web build và desktop release

- Vite build output đã đổi từ `dist` sang `app-dist`
- Electron release output giữ ở `release`

Lý do:
- Trước đó cả Vite và electron-builder cùng dùng `dist`, dẫn đến lỗi khóa file khi Vite dọn thư mục build cũ.

### 3. Sửa package.json để đóng gói được

- Đổi `name` sang chữ thường: `offorest`
- Thêm `main: "main.js"`
- Thêm script `electron:dev`
- Sửa script `start` để Electron đợi Vite server sẵn sàng rồi mới mở
- Sửa `build.files` để lấy đúng `app-dist/**/*`
- Tắt `signAndEditExecutable` cho local packaging để tránh lỗi symlink privilege trên Windows

## Các lệnh cần dùng

### Chạy app ở chế độ dev

```bash
npm start
```

Luồng chạy:
- Vite dev server chạy trước
- Electron chờ cổng `5173`
- Sau đó app desktop mở ra

### Build frontend production

```bash
npm run build
```

Output:
- `app-dist/`

### Đóng gói file cài Windows

```bash
npm run dist
```

Output:
- `release/Offorest Setup 0.1.0.exe`

## Trạng thái xác minh

- `npm run build`: pass
- `npm run dist`: pass

## Lỗi màn hình trắng sau khi cài và cách xử lý

### Nguyên nhân

- Vite đang build asset theo đường dẫn tuyệt đối như `/assets/...`
- Khi Electron mở app bằng `file://`, các đường dẫn tuyệt đối này không còn hợp lệ
- Kết quả là file JS/CSS không tải được, app chỉ hiện màn hình trắng
- Ngoài ra app đang dùng `BrowserRouter`, không phù hợp bằng `HashRouter` khi chạy từ file local trong Electron package

### Cách đã sửa

- Thêm `base: './'` trong `vite.config.js` để asset build ra dạng tương đối như `./assets/...`
- Cho app tự dùng `HashRouter` khi chạy dưới `file://`

### Kết quả sau sửa

- `app-dist/index.html` đã dùng đường dẫn asset tương đối
- `npm run build`: pass
- `npm run dist`: pass
- Bộ cài mới đã được tạo lại tại `release/Offorest Setup 0.1.0.exe`

## Lỗi trắng sau khi đăng nhập

### Nguyên nhân

- Sau khi login thành công, code gọi cả `navigate(targetPath)` lẫn `window.location.replace(targetPath)`
- Trong Electron packaged app, `window.location.replace('/some-path')` không còn là điều hướng SPA như web nữa
- Nó có thể chuyển sang đường dẫn file sai, dẫn đến màn hình trắng ngay sau khi đăng nhập

### Cách đã sửa

- Bỏ `window.location.replace(targetPath)` trong trang login
- Bỏ `window.location.replace('/login')` trong logout
- Giữ điều hướng hoàn toàn bằng React Router để hành vi giống web app SPA

### Kết quả

- App desktop sau login/logout sẽ chuyển trang theo router nội bộ
- Không còn ép reload toàn bộ app như trình duyệt thường

## Tối ưu hiệu năng ComboSticker

### Triệu chứng

- Generate khoảng 2 ảnh là UI bắt đầu lag mạnh
- App khó bấm tiếp, đặc biệt khi ComboSticker giữ nhiều kết quả cùng lúc

### Nguyên nhân chính

- Mỗi ảnh generated được giữ dưới dạng base64 lớn trong React state
- Sau mỗi lần generate còn chạy xóa nền ngay trên luồng giao diện
- ComboSticker đang yêu cầu ảnh đầu ra `2K`, khiến cả RAM lẫn CPU tăng nhanh

### Cách đã sửa

- Đổi kết quả generated sang lưu dưới dạng `Blob/File + object URL` thay vì giữ base64 lớn trong state
- Dọn `object URL` cũ khi đổi source hoặc chạy lại pipeline để tránh leak bộ nhớ
- Chuyển xóa nền ComboSticker sang mode nhẹ `PIXEL_THRESHOLD`, phù hợp hơn với case sticker nền trắng
- Giảm kích thước ảnh generate của ComboSticker từ `2K` xuống `1K`
- Sửa luồng `Generate Similar` và `Redesign` để dùng state theo từng workspace thay vì state rời

### Kết quả kỳ vọng

- UI giữ phản hồi tốt hơn khi generate nhiều sticker liên tiếp
- Giảm tình trạng đơ app do giữ nhiều base64 lớn trong bộ nhớ
- Giảm tải CPU/RAM trong lúc generate ComboSticker

## Lưu ý còn lại

- Electron hiện đang dùng icon mặc định vì chưa cấu hình icon `.ico`
- Nếu muốn app nhìn chuyên nghiệp hơn khi phát hành, cần thêm icon Windows thật rồi cấu hình lại trong `package.json`

## Quy ước version

- Version hiện tại đã nâng lên `0.1.1`
- Mỗi lần phát hành bản update tiếp theo, tăng patch version tuần tự: `0.1.2`, `0.1.3`, ...
- Có thể dùng lệnh sau để tăng patch tự động rồi build installer:

```bash
npm run release:patch
```

## Cập nhật prompt + tách nền theo yêu cầu

### Prompt tạo ảnh ComboSticker

- Prompt `combostickerGenerate` đã được siết chặt để bắt buộc output đúng 1 sticker duy nhất
- Thêm ràng buộc: không sticker sheet, không collage, không nhiều biến thể trong cùng 1 ảnh

### Tách nền

- Thuật toán `pixel_threshold` đã đổi sang flood-fill từ viền ảnh
- Chỉ những vùng trắng nối thông với mép ảnh mới bị xóa (xem như nền ngoài)
- Vùng trắng nằm bên trong sticker sẽ được giữ lại, không bị “đục lỗ”

## Cập nhật theo case combo bị dính nhiều sticker

### Phân tích (Analyze)

- Prompt phân tích đã ép rõ: mỗi `object` phải là 1 sticker riêng lẻ
- Cấm trả về cụm dạng set/bundle/sheet/collection
- Request phân tích gửi kèm ràng buộc số lượng theo `target_output`

### Tạo ảnh (Generate)

- Prompt tạo đã ép cứng chỉ tạo đúng 1 sticker cho đúng object đang chọn
- Nếu ảnh nguồn là sheet/combo, bắt buộc bỏ qua các sticker còn lại

### Hậu xử lý tách nền

- Sau khi xóa nền trắng vùng ngoài, hệ thống giữ lại component chủ thể lớn nhất
- Các mảnh sticker rời xung quanh chủ thể sẽ bị loại bỏ
- Chi tiết trắng bên trong chủ thể vẫn được giữ (không khoét trong)

### Cải tiến thêm cho nền đen / nền màu

- Thuật toán tách nền ngoài đã nâng cấp từ "chỉ nhận nền trắng" sang "adaptive edge flood-fill"
- Hệ thống tự lấy cụm màu nền từ viền ảnh (cả nền đen, xanh, gradient nhẹ)
- Chỉ xóa các pixel nền nối với mép ảnh, nên vẫn giữ nguyên chi tiết bên trong chủ thể

### Điều chỉnh flow object

- Bỏ cơ chế tự thêm `Variation` giả khi thiếu object
- Chỉ generate theo danh sách object tách được thực tế từ ảnh combo
