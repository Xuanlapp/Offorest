# Offorest API Testing Guide

## Postman Collection Setup

1. **Import Collection**: Import `Offorest_Postman_Collection.json` into Postman
2. **Set Variables**: Update the collection variables with your actual tokens

### Required Variables:

- `wp_token`: Your WordPress JWT token (from login)
- `google_token`: Your Google API access token
- `sheet_id`: Google Sheets ID (1YIDqRTN1RcKecmpc8fbnYdZrBee3CqqjfrlQ_yjOpFQ)

## API Endpoints

### 1. Upload Images to Google Drive & Sheets

**Endpoint:** `POST /google/upload`

**Authentication:** Bearer token (WordPress JWT)

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file_0`, `file_1`, etc.: Image files (multiple files supported)
- `keyword`: String (description/keyword for the upload batch)
- `sheetId`: String (Google Sheets ID)
- `accessToken`: String (Google API access token)
- `gid`: String (optional) (Google Sheets tab ID)

**Example Request:**
```bash
curl -X POST "http://offorest-wp.lap/wp-json/offorest-api/v1/google/upload" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file_0=@image1.jpg" \
  -F "file_1=@image2.png" \
  -F "keyword=combo sticker test" \
  -F "sheetId=1YIDqRTN1RcKecmpc8fbnYdZrBee3CqqjfrlQ_yjOpFQ" \
  -F "gid=999897633" \
  -F "accessToken=YOUR_GOOGLE_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Files uploaded successfully",
  "data": {
    "drive_links": ["https://drive.google.com/file/d/..."],
    "sheet_updated": true,
    "row_count": 5
  }
}
```

### 2. Test Backend Connection

**Endpoint:** `GET /test-connection`

**Authentication:** Bearer token (WordPress JWT)

**Example Request:**
```bash
curl -X GET "http://offorest-wp.lap/wp-json/offorest-api/v1/test-connection" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Getting Tokens

### WordPress JWT Token

1. Login to your WordPress admin
2. Open browser developer tools (F12)
3. Go to Network tab
4. Login to the React app
5. Find the login API call and copy the JWT token from response

### Google Access Token

1. Go to [Google API Console](https://console.cloud.google.com/)
2. Create/select a project
3. Enable Google Drive API and Google Sheets API
4. Create OAuth 2.0 credentials
5. Use OAuth playground or your app to get access token

## Testing Steps

1. **Test Connection First:**
   - Use the "Test Backend Connection" request
   - Should return success if authentication works

2. **Upload Images:**
   - Use the "Upload Images" request
   - Attach image files in the form data
   - Check Google Drive for uploaded files
   - Check Google Sheets for updated data

## Troubleshooting

- **401 Unauthorized**: Check JWT token is valid
- **403 Forbidden**: Check Google API permissions
- **400 Bad Request**: Check form data format
- **Network Error**: Check backend URL and CORS

## File Format Support

- **Images**: JPG, PNG, GIF, WebP
- **Max Size**: Check backend configuration
- **Multiple Files**: Use `file_0`, `file_1`, etc. for multiple uploads