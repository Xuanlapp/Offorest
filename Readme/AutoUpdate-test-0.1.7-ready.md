# Auto Update Test Ready - v0.1.7

## Đã thực hiện
- Build dist thành công cho version `0.1.7`.
- Kiểm tra `release/latest.yml` đã trỏ tới file:
  - `Offorest-V1-Setup-0.1.7.exe`
- Tạo thêm bản file tên chuẩn (dùng dấu `-`) để khớp với `latest.yml`.

## File cần upload lên GitHub Release (v0.1.7)
- `release/latest.yml`
- `release/Offorest-V1-Setup-0.1.7.exe`
- `release/Offorest-V1-Setup-0.1.7.exe.blockmap`

## Cách test nhanh
1. Máy test đang cài app bản `0.1.6`.
2. Tạo GitHub Release mới cho `v0.1.7` (public, không draft).
3. Upload 3 file bên trên.
4. Mở app `0.1.6`, app sẽ check update và hiện popup cập nhật.
