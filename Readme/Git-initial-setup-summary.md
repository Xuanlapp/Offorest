# Git Initial Setup Summary

## Đã thực hiện
- Khởi tạo Git repository local với branch mặc định `main`.
- Cập nhật `.gitignore` để bỏ qua output build:
  - `app-dist`
  - `release`
- Tạo initial commit:
  - Message: `chore: initial project setup`

## Trạng thái hiện tại
- Working tree sạch (không còn thay đổi chưa commit).
- Chưa cấu hình remote (`origin`).

## Bước tiếp theo (GitHub)
1. Tạo repo mới trên GitHub (không tạo README/.gitignore/license).
2. Chạy lệnh trong project:
   - `git remote add origin https://github.com/<username>/<repo>.git`
   - `git push -u origin main`

## Gợi ý
- Nếu dùng private repo, vẫn dùng auto-update được khi host file update ở nơi khác (HTTPS public).
