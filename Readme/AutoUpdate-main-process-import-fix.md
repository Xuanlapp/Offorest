# Auto Update Main Process Import Fix

## Vấn đề
App crash khi mở với lỗi:
- `Named export 'autoUpdater' not found` từ `electron-updater`

Nguyên nhân:
- `electron-updater` là CommonJS module, nhưng `main.js` đang import theo kiểu named ESM.

## Cách sửa
- File: `main.js`
- Đổi import từ:
  - `import { autoUpdater } from 'electron-updater';`
- Sang:
  - `import electronUpdaterPkg from 'electron-updater';`
  - `const { autoUpdater } = electronUpdaterPkg;`

## Kết quả
- Build `npm run dist` thành công sau khi sửa.
- Bản cài mới không còn crash do lỗi import updater ở main process.
