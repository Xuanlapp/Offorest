# Auto Update Full Reset - v0.1.8

## Đã làm lại từ đầu (code + build)
- Sửa import `electron-updater` cho ESM main process:
  - dùng default import rồi destructure `autoUpdater`
- Chuẩn hoá tên file artifact để luôn khớp `latest.yml`:
  - `artifactName: Offorest-V1-Setup-${version}.${ext}`
- Build mới hoàn chỉnh cho version `0.1.8`.

## Bộ file release v0.1.8 cần upload GitHub
- `release/latest.yml`
- `release/Offorest-V1-Setup-0.1.8.exe`
- `release/Offorest-V1-Setup-0.1.8.exe.blockmap`

## Cách test update đúng chuẩn
1. Cài app bản `0.1.7` trên máy test.
2. Tạo GitHub Release mới: tag `v0.1.8` (public, không draft, không pre-release).
3. Upload đúng 3 file ở trên.
4. Mở app `0.1.7` đã cài -> app tự check update và hiện popup cập nhật.

## Lưu ý
- Không test bằng `npm run dev`.
- Không chạy bản `win-unpacked` để kiểm tra auto-update.
- Nếu app đang chạy bản `0.1.8` thì sẽ không có thông báo update (vì đã mới nhất).
