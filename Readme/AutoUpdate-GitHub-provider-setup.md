# Auto Update với GitHub Public Repo

## Cấu hình đã cập nhật
- File: `package.json`
- `build.publish` đã chuyển sang GitHub provider:
  - owner: `Xuanlapp`
  - repo: `Offorest`
  - private: `false`
  - releaseType: `release`

## Kết quả
- Build `npm run dist` chạy thành công sau khi đổi cấu hình.

## Cách phát hành update
1. Tăng version trong app (ví dụ 0.1.7).
2. Chạy `npm run dist` để tạo bộ cài mới.
3. Tạo GitHub Release mới (tag đúng version, không để draft).
4. Upload các file từ thư mục `release`:
   - `latest.yml`
   - `Offorest V1 Setup <version>.exe`
   - `Offorest V1 Setup <version>.exe.blockmap`
5. User mở app sẽ tự check bản mới và hiện nút cập nhật.

## Lưu ý
- Repo phải public để client tải metadata update trực tiếp.
- Release nên để dạng `release` (không draft) để auto-updater nhìn thấy.
