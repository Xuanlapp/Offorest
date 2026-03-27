# Console Logging Guide - Offorest Image Upload

## What Gets Logged

When you upload images or test connection, detailed logs will appear in browser console (F12 → Console tab).

## 🔐 Authentication Logging

### When Getting Auth Headers:
```
🔐 [Auth] Getting WordPress authentication headers...
✅ [Auth] Using login token for authentication
🔑 [Auth] Token preview: eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ...
```

### Fallback Scenarios:
```
⚠️ [Auth] No user data in localStorage
🔄 [Auth] Trying nonce fallback...
✅ [Auth] Using nonce for authentication: abc123def456
🍪 [Auth] Using cookie authentication (no explicit headers)
```

## 🚀 Upload Request Logging

### Upload Start:
```
🚀 [GoogleDriveService] ===== UPLOAD REQUEST DETAILS =====
📁 Files to upload: [
  {
    index: 0,
    name: "image1.jpg",
    size: 245760,
    type: "image/jpeg",
    lastModified: "2024-01-15T10:30:00.000Z"
  }
]
🔑 Keyword: combo sticker test
📊 Sheet ID: 1YIDqRTN1RcKecmpc8fbnYdZrBee3CqqjfrlQ_yjOpFQ
� Tab ID (gid): 999897633
�🔐 Access Token (first 20 chars): ya29.a0AfH6SMB...
```

### FormData Contents:
```
📋 FormData entries:
  file_0: File(image1.jpg, 245760 bytes, image/jpeg)
  keyword: combo sticker test
  sheetId: 1YIDqRTN1RcKecmpc8fbnYdZrBee3CqqjfrlQ_yjOpFQ
  gid: 999897633
  accessToken: ya29.a0AfH6SMB...
```

### Request Details:
```
🔒 Authentication headers: {Authorization: "Bearer eyJ0eXAiOiJKV1Qi..."}
🌐 Request URL: http://offorest-wp.lap/wp-json/offorest-api/v1/google/upload
📤 Sending POST request to backend...
```

## 📥 Response Logging

### Successful Response:
```
📥 Response received:
  Status: 200 OK
  Headers: {content-type: "application/json", ...}
  Raw response: {"success":true,"message":"Files uploaded successfully","data":{"drive_links":[...],"sheet_updated":true}}
  Parsed JSON response: {success: true, message: "Files uploaded successfully", data: {...}}
✅ Upload successful!
```

### Error Response:
```
📥 Response received:
  Status: 401 Unauthorized
  Headers: {content-type: "application/json", ...}
  Raw response: {"code":"rest_forbidden","message":"Sorry, you are not allowed to do that."}
  Parsed JSON response: {code: "rest_forbidden", message: "Sorry, you are not allowed to do that."}
❌ Upload failed with status: 401
💥 Upload error: Upload failed: 401 Unauthorized - {"code":"rest_forbidden","message":"Sorry, you are not allowed to do that."}
```

## 🔍 Connection Test Logging

### Test Start:
```
🔍 [GoogleDriveService] ===== TESTING BACKEND CONNECTION =====
🔒 Auth headers for test: {Authorization: "Bearer eyJ0eXAiOiJKV1Qi..."}
🌐 Test URL: http://offorest-wp.lap/wp-json/offorest-api/v1/
📤 Sending GET request for connection test...
```

### Test Response:
```
📥 Test response received:
  Status: 200 OK
  Headers: {content-type: "application/json", ...}
  Raw response: {"success":true,"message":"API is working"}
  Parsed JSON response: {success: true, message: "API is working"}
✅ Backend connection successful!
==================================================
```

## 📊 Data Structure Reference

### File Object:
```javascript
{
  index: 0,                    // FormData key index
  name: "image1.jpg",         // Original filename
  size: 245760,               // File size in bytes
  type: "image/jpeg",         // MIME type
  lastModified: "2024-01-15T10:30:00.000Z"  // Last modified date
}
```

### FormData Entries:
- `file_0`, `file_1`, etc.: File objects
- `keyword`: String (upload description)
- `sheetId`: String (Google Sheets ID)
- `gid`: String (optional) (Google Sheets tab ID)
- `accessToken`: String (Google API token)

### Response Format (Success):
```json
{
  "success": true,
  "message": "Files uploaded successfully",
  "data": {
    "drive_links": ["https://drive.google.com/file/d/123"],
    "sheet_updated": true,
    "sheet_id": "1YIDqRTN1RcKecmpc8fbnYdZrBee3CqqjfrlQ_yjOpFQ",
    "gid": "999897633",
    "row_count": 5
  }
}
```

### Response Format (Error):
```json
{
  "code": "rest_forbidden",
  "message": "Sorry, you are not allowed to do that.",
  "data": {"status": 401}
}
```

## 🐛 Debugging Tips

1. **Check Console**: Open F12 → Console tab to see all logs
2. **Filter Logs**: Use filter `GoogleDriveService` or `Auth` to focus on relevant logs
3. **Network Tab**: Check actual HTTP requests in Network tab
4. **Token Issues**: Look for "Auth" logs to see which authentication method is used
5. **File Issues**: Check "FormData entries" to verify files are attached correctly

## 📝 Log Levels

- `🚀` Upload operations
- `🔐` Authentication
- `📁` File information
- `📋` Form data
- `🌐` URLs and requests
- `📥` Responses
- `✅` Success
- `❌` Errors
- `⚠️` Warnings
- `🔍` Connection tests