# Sticker Outer Background Removal

- Đã đổi luồng tách nền của Sticker page sang `REMOVAL_MODES.PIXEL_THRESHOLD`.
- Chế độ này chỉ xóa nền ngoài bằng flood-fill từ mép ảnh, không dùng AI cutout để cắt vào chủ thể.
- Kết quả phù hợp hơn với sticker có viền trắng/outline, giúp giữ nguyên nhân vật và chỉ bỏ nền bao quanh.