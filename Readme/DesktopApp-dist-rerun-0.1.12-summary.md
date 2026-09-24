# Desktop Dist Rerun 0.1.12

## Muc tieu

- Chay lai lenh dist cho version hien tai `0.1.12`.

## Ket qua chay lenh

- `npm run dist` that bai do file lock:
  - Khong xoa duoc `release/win-unpacked/resources/app.asar` vi dang bi process khac su dung.
- Da build thanh cong khi doi thu muc output tam:
  - Lenh: `npm run build; npx electron-builder --config.directories.output=release-rebuild`

## Artifact moi tao

- `release-rebuild/Offorest Setup 0.1.12.exe`
- `release-rebuild/Offorest Setup 0.1.12.exe.blockmap`
- `release-rebuild/latest.yml`

## Ghi chu

- Version khong doi, van la `0.1.12`.
- Neu can output dung thu muc `release`, can giai phong lock tren `release/win-unpacked/resources/app.asar` truoc khi chay lai `npm run dist`.