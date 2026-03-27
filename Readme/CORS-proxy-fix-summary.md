# CORS + Update Payload Fix

## Vấn đề
- Frontend gọi URL tuyệt đối `http://offorest-wp.lap/...` từ `http://localhost:5173` nên dễ bị CORS chặn.
- Endpoint `google/update` test bằng Postman thành công với form-data key `file`, nhưng frontend trước đó không gửi key này.

## Đã fix
- Thêm Vite proxy cho `/wp-json` trong `vite.config.js`.
- Đổi base URL trong frontend service sang `/wp-json/offorest-api/v1`:
	- `src/services/authService.js`
	- `src/services/geminiService.js`
	- `src/services/googleDriveService.js`
- Trong `updateRecordInSheet`, thêm `formData.append('file', files[0])` để tương thích backend đọc file kiểu Postman.

## Kết quả mong đợi
- Browser không còn gọi cross-origin trực tiếp khi chạy local dev.
- Payload endpoint `google/update` gần với request Postman đang pass 200.

## Bổ sung (Gemini URL)
- Trong `src/services/geminiService.js`, hàm `callBackend` đã ép build URL bằng `new URL()` từ `BACKEND_URL = http://offorest-wp.lap/...` để tránh mọi trường hợp request rơi về `localhost` do URL tương đối.
- Thêm log `🌐 [geminiService] Request URL` để kiểm tra trực tiếp endpoint thật đang được gọi.

## Cập nhật Upload to Drive & Sheet (Holoarcylic)
- Khôi phục và viết lại `src/services/googleDriveService.js`.
- `uploadFilesToBackend(...)` hiện gửi dữ liệu vào `http://offorest-wp.lap/wp-json/offorest-api/v1/google/upload`.
- Khi bấm upload ở `HoloarcylicPage`, payload gửi gồm:
	- Ảnh gốc
	- Ảnh đã generate
	- `sheetId`, `gid`, `accessToken`, `keyword`, `stt`
- Giữ thêm các field file tương thích nhiều backend parser (`file`, `file_0..`, `files[]`, `original_image`, `generated_images[]`).

## Cập nhật để giảm lỗi 500 khi upload ComboSticker
- Tối giản payload upload theo hướng gần Postman hơn trong `uploadFilesToBackend(...)`:
	- Giữ metadata: `keyword`, `sheetId`, `gid`, `accessToken`, `stt` (nếu có)
	- Giữ file key chính: `file` (file đầu tiên) + `file_0`, `file_1`, ...
	- Bỏ các key dư thừa dễ gây lỗi parser backend (`files[]`, `original_image`, `generated_images[]`).
- Trong `ComboStickerPage`, nếu không có file gốc local thì tự tải từ `imageSourceUrl` để luôn có ảnh gốc trong gói upload.
- Thêm log payload summary trước khi gọi endpoint để đối chiếu với Postman.

## Ràng buộc sheet theo từng page
- Thêm validate `sheetId/gid` theo page trong `src/services/googleDriveService.js`.
- Mapping local storage theo page:
	- `combosticker` -> `comboStickerSheetData`
	- `holoarcylic` -> `holoarcylicSheetUrl`
	- `ornament` -> `ornamentSheetUrl`
- Trước khi gọi upload/update, service sẽ check lại sheet đang gửi có đúng sheet của page hiện tại không.
- Các page đã truyền `pageKey` khi gọi service:
	- `ComboStickerPage`: `combosticker`
	- `HoloarcylicPage`: `holoarcylic`
	- `OrnamentPage`: `ornament`

## Hàm update riêng cho Holoarcylic + Ornament
- Thêm hàm dùng chung `updateDesignPageImages(...)` trong `src/services/googleDriveService.js`.
- Hàm này gửi vào endpoint: `http://offorest-wp.lap/wp-json/offorest-api/v1/google/update`.
- Payload chuẩn gồm:
	- Ảnh FINAL CONCEPT REDESIGN (`redesign_image` + `file`)
	- Ảnh lifestyle (`lifestyle_image`)
	- `sheetId`, `gid`, `accessToken`, `stt`
- `HoloarcylicPage` và `OrnamentPage` đều đã chuyển sang dùng hàm chung này khi bấm Upload (single + batch).
- UI hai page đã có nút `Upload Lifestyle` cho từng item và bắt buộc có lifestyle trước khi upload.

## Login / Logout mượt
- `authService.getDefaultPathForUser(user)` ưu tiên `products[0].code` để điều hướng ngay sau login.
- Mapping code -> path:
	- `combosticker` / `combo-sticker` -> `/combosticker`
	- `holoornament` -> `/holoarcylic`
	- `ornament` -> `/ornament`
- Nếu không map được code đầu tiên thì chuyển thẳng `/no-permission`.
- `logout()` dọn user + token trong localStorage.
- `Navbar.handleLogout()` điều hướng tức thì về `/login` bằng replace để không quay lại trang cũ.
- `LoginPage` redirect cứng sau login (`navigate` + `window.location.replace`) để tránh trường hợp UI không chuyển trang do state/router cache.
- Chuẩn hoá `products.code` (hỗ trợ biến thể như `holoarcylic`, `combo_sticker`, `combo-sticker`, viết hoa/thường) trước khi map route.
