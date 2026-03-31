# Mac Run Setup Summary

- Script `dist:mac` đã được chỉnh để tự tắt auto code-sign discovery bằng `CSC_IDENTITY_AUTO_DISCOVERY=false`.
- Điều này giúp build bản Mac unsigned dễ hơn trên máy Mac hoặc GitHub Actions macOS runner.
- Bản Mac hiện có thể chạy trên macOS sau khi build, nhưng lần mở đầu có thể cần `Right click > Open` vì chưa ký Apple Developer.
- Nếu muốn chạy mượt như app production không cảnh báo Gatekeeper, bước tiếp theo là cấu hình signing + notarization.