# Design Update Multiple Lifestyle Upload Summary

## Nguyen nhan

- Truoc do code o `HoloarcylicPage` va `SuncatcherPage` chi lay lifestyle image dau tien (`[0]`) de upload.

## Da cap nhat

- Doi tu `getLifestyleFile(...)` sang `getLifestyleFiles(...)` de convert tat ca lifestyle preview images thanh mang `File`.
- Truyen mang nay vao service bang tham so `lifestyleImageFiles`.
- Trong `updateDesignPageImages(...)`, payload `files[]` duoc append theo thu tu:
  1. redesign image
  2. lifestyle image 1
  3. lifestyle image 2
  4. ...

## Pham vi file

- `src/pages/HoloarcylicPage.jsx`
- `src/pages/SuncatcherPage.jsx`
- `src/services/googleDriveService.js`

## Log cap nhat

- Log hien tai se show danh sach `lifestyleFiles` thay vi 1 file don.
- Trong service log co `fileCount` va `filesOrder` de de theo doi request.