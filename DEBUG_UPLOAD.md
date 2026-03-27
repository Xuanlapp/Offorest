# Debug Upload Issues

## 🔍 Các bước debug khi gặp lỗi "Upload failed"

### 1. **Test Connection trước**
- Nhấn nút **"Test Connection"** (màu xanh) trước khi upload
- Nếu fail → Kiểm tra backend có chạy không

### 2. **Kiểm tra Console Logs**
Mở Developer Tools (F12) → Console tab:

```
[GoogleDriveService] Uploading files to backend: {...}
[GoogleDriveService] Response status: 404/500/...
[GoogleDriveService] Response headers: {...}
[GoogleDriveService] Response data: {...}
```

### 3. **Các lỗi thường gặp**

#### ❌ **HTTP 404: Not Found**
- Backend endpoint `/upload` không tồn tại
- Kiểm tra: `http://offorest-wp.lap/wp-json/offorest-api/v1/upload`

#### ❌ **HTTP 500: Internal Server Error**
- Backend code lỗi
- Kiểm tra logs server-side

#### ❌ **Network Error / CORS**
- Firewall chặn request
- Backend không có CORS headers
- Kiểm tra: `fetch('http://offorest-wp.lap/wp-json/offorest-api/v1/')`

#### ❌ **"Upload failed"**
- Backend trả về `{success: false}`
- Kiểm tra response data trong console

### 4. **Kiểm tra Data gửi đi**

```javascript
// Trong console, data được gửi:
{
  fileCount: 25,           // Số files
  fileNames: [...],        // Tên files
  keyword: "christmas",    // Keyword
  sheetId: "...",          // Sheet ID
  accessTokenLength: 100   // Độ dài token
}
```

### 5. **Backend Requirements**

Endpoint cần nhận:
- **Method**: POST
- **Content-Type**: multipart/form-data
- **Fields**:
  - `file_0`, `file_1`, ... (File objects)
  - `keyword` (string)
  - `sheetId` (string)
  - `accessToken` (string)

Response format:
```json
{
  "success": true,
  "message": "Upload successful",
  "data": {...}
}
```

### 6. **Quick Fixes**

1. **Restart backend server**
2. **Check network connectivity**
3. **Verify API endpoint URL**
4. **Check Google API credentials**
5. **Test with smaller file count**

### 7. **Nếu vẫn lỗi**

- Share console logs
- Check backend logs
- Verify Google Sheet permissions
- Test with different browser