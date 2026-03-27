# Google Sheets Config Setup

## Tổng quan
Hệ thống sử dụng cấu trúc phân cấp cho Google Sheets:
- **ComboSticker**: Nhập URL trực tiếp trong thanh nav (chỉ hiển thị khi ở trang này)
- **Holoarcylic**: Lấy URL từ sheet config
- **Ornament**: Lấy URL từ sheet config

## Setup cho từng page

### 1. ComboSticker - Thanh Nav
- Vào trang ComboSticker
- Trong thanh nav sẽ xuất hiện input "Sheet URL"
- Nhập URL Google Sheet trực tiếp
- Nhấn nút ✓ để kiểm tra định dạng
- URL được lưu tự động và áp dụng cho tất cả workspace trong ComboSticker

### 2. Holoarcylic & Ornament - Sheet Config

### 1. Tạo Google Sheet Config
1. Tạo sheet mới trên Google Drive
2. Đặt tên sheet đầu tiên là `Config`
3. Thêm dữ liệu theo format:

| Page | SheetURL |
|------|----------|
| holoarcylic | https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit#gid=0 |
| ornament | https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit#gid=0 |

### 2. Cấu hình Access Token
1. Vào thanh nav của app
2. Nhập Google API Access Token vào trường "Access Token"
3. Token này sẽ được lưu và sử dụng cho tất cả các thao tác với Google Sheets

### 3. Chia sẻ Sheet
- Đảm bảo sheet config được chia sẻ công khai (Anyone with link can view)
- Hoặc cung cấp quyền truy cập cho service account tương ứng

### 4. Cập nhật CONFIG_SHEET_ID
Trong file `src/services/sheetConfigService.js`, thay đổi:
```javascript
const CONFIG_SHEET_ID = 'YOUR_ACTUAL_SHEET_ID_HERE';
```

## Cách hoạt động

1. **ComboSticker**: Người dùng nhập URL sheet trực tiếp trong workspace
2. **Holoarcylic/Ornament**: App tự động đọc URL từ sheet config dựa trên tên page
3. **Access Token**: Được sử dụng chung cho tất cả các thao tác Google API

## Lưu ý
- Access Token có thể thay đổi theo thời gian (thường 1 giờ)
- Sheet config có cache 5 phút để tránh gọi API quá nhiều
- Đảm bảo tất cả sheet đều được chia sẻ công khai để có thể export CSV