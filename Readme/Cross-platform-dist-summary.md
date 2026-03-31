# Cross-platform Dist Summary

- Đã tách script build riêng cho từng nền tảng: `dist:win` và `dist:mac`.
- Windows runner giờ chỉ build target Windows (`nsis`), còn macOS runner chỉ build target macOS (`dmg` và `zip`).
- macOS được thêm `zip` bên cạnh `dmg` để phục vụ artifact/autoupdate tốt hơn.
- GitHub Actions giờ upload cả file cài đặt và metadata cần thiết trong `release/` cho từng nền tảng.
- Lưu ý: máy Windows không thể build app macOS native tại local; mac build cần chạy trên máy Mac hoặc GitHub Actions `macos-latest`.