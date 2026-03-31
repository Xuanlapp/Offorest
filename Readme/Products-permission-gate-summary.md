# Products Permission Gate Summary

- Đã đổi auth gate sang ưu tiên tuyệt đối theo `products` trả về từ API login.
- Nếu login không trả về product hợp lệ nào, app sẽ đưa user tới `no-permission` thay vì fallback theo `role`.
- `getCurrentUser()` giờ build permission trực tiếp từ `products` để Navbar, route guard và default path cùng dùng chung một nguồn quyền.
- Đã sửa `Sticker` mode dùng đúng permission `STICKER_VIEW` thay vì `HOLOARCYLIC_VIEW`.