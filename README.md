# Offorest Image Processing App

A React application for image processing with Google Drive and Google Sheets integration.

## Features

- Image processing for various sticker types (Combo, Holoacrylic, etc.)
- Google Drive upload integration
- Google Sheets data management
- WordPress REST API backend integration
- Responsive UI with Tailwind CSS

## Setup

### Prerequisites

- Node.js 16+
- WordPress backend with REST API
- Google API credentials

### Installation

```bash
npm install
npm run dev
```

### Authentication Setup

The app uses the access token from your WordPress login automatically. No additional JWT token setup is required.

#### How Authentication Works

1. **Login**: When you login to the app, an access token is stored
2. **API Calls**: All backend requests automatically include this token as `Authorization: Bearer <token>`
3. **Google APIs**: Enter your Google API access token in the navbar for Drive/Sheets integration

#### Google Sheet URL Format

The app supports Google Sheets URLs with specific sheet tabs:

**Supported Formats:**
- `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit` (default tab)
- `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?gid=TAB_ID` (specific tab)
- `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit?gid=TAB_ID#gid=TAB_ID` (with anchor)

**Example:**
```
https://docs.google.com/spreadsheets/d/1YIDqRTN1RcKecmpc8fbnYdZrBee3CqqjfrlQ_yjOpFQ/edit?gid=999897633#gid=999897633
```

When you paste a URL with `gid` parameter, the app will automatically detect and use the specific sheet tab.

### API Testing

For testing the upload API directly:

1. **Postman Collection**: Import `Offorest_Postman_Collection.json`
2. **Testing Scripts**: Use `test_upload.bat` (Windows) or `test_upload.sh` (Linux/Mac)
3. **API Documentation**: See `API_TESTING_README.md` for detailed instructions
4. **Console Logging**: See `CONSOLE_LOGGING_GUIDE.md` for detailed request/response logging

**Quick Test:**
```batch
test_upload.bat image.jpg "test keyword" "your_jwt_token" "your_google_token" "999897633"
```

**Parameters:**
- `image.jpg`: Path to image file
- `"test keyword"`: Upload description
- `"your_jwt_token"`: WordPress JWT token
- `"your_google_token"`: Google API access token
- `"999897633"`: Google Sheets tab ID (gid) - optional

### Usage

1. **Login** to the app (this provides the WordPress authentication token)
2. **Navigate to desired page** (Combo Sticker, Holoacrylic, etc.)
3. **Configure settings** in navbar:
   - Google Access Token (for Drive/Sheets integration)
   - Sheet URL (for Combo Sticker page)
4. **Upload images** and process
5. **Test connection** before uploading

### API Endpoints

- Backend: `http://offorest-wp.lap/wp-json/offorest-api/v1`
- Upload: `POST /upload`
- Test Connection: `GET /test-connection`

### Troubleshooting

- **401 Error**: Make sure you're logged in - the access token from login is used automatically
- **403 Error**: Verify Google API permissions
- **Network Error**: Check backend URL and CORS settings
- **Login Issues**: Ensure your WordPress backend returns an access token on login
