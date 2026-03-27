# Suncatcher rename summary

## Mục tiêu
Đổi toàn bộ naming frontend từ `ornament` sang `suncatcher` mà không làm gãy backend hiện tại.

## Đã đổi
- Route chính: `/ornament` -> `/suncatcher`
- Mode app: `ornament` -> `suncatcher`
- Page file: `OrnamentPage.jsx` -> `SuncatcherPage.jsx`
- Component: `OrnamentPage` -> `SuncatcherPage`
- Navbar state + event:
  - `ornamentSheetUrl` -> `suncatcherSheetUrl`
  - `ornamentGetData` -> `suncatcherGetData`
- Prompt key:
  - `PROMPTS.ornament` -> `PROMPTS.suncatcher`
- Upload/page keys:
  - `pageKey: 'ornament'` -> `pageKey: 'suncatcher'`
- Tên file export redesign:
  - `ornament-redesign-*` -> `suncatcher-redesign-*`

## File đã cập nhật
- `src/App.jsx`
- `src/config/nav.modes.js`
- `src/components/Navbar.jsx`
- `src/pages/SuncatcherPage.jsx`
- `src/services/authService.js`
- `src/services/googleDriveService.js`
- `src/services/sheetConfigService.js`
- `src/prompt/Prompts.ts`

## Tương thích ngược đang giữ lại
- Redirect route cũ:
  - `/ornament` tự chuyển sang `/suncatcher`
- LocalStorage cũ vẫn đọc được:
  - `ornamentSheetUrl`
- Sheet config cũ vẫn fallback được:
  - nếu chưa có `suncatcher` thì vẫn đọc `ornament`
- Product code cũ vẫn map được:
  - `ornament`
- Backend AI endpoint vẫn giữ nguyên:
  - `/gemini/ornament`

## Lý do giữ endpoint backend
Repo này chỉ đổi frontend naming. Nếu đổi luôn `/gemini/ornament` thành `/gemini/suncatcher` mà backend chưa support, app sẽ lỗi request.

## Kết quả verify
- `npm run dist` build thành công sau khi rename.