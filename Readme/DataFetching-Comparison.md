# Data Fetching Mechanism Comparison

## Overview
Three pages implement different approaches to fetch and manage data from Google Sheets. This document compares their implementations and identifies gaps.

---

## 1. ComboStickerPage.jsx

### Data Fetching Mechanism
**Source:** Manual input via Navbar (localStorage)
- SheetData stored in localStorage as `comboStickerSheetData`
- Sheet URL passed from Navbar component
- No automatic config lookup

### Sheet URL Input
✅ **Has manual sheet URL input field**
- Located in Navbar (parent component)
- User enters sheet URL manually
- Parsed into `sheetId` and `gid`
- Stored in localStorage: `{ sheetId, gid }`

### Data Flow
1. **Sheet URL Setup:** User inputs in Navbar → stored in localStorage
2. **Access Token:** Also stored in localStorage (`googleDriveAccessToken`)
3. **Upload Process:** 
   - Uses `uploadFilesToBackend()` function
   - Uploads files to backend (not directly to Google Sheets)
   - Requires backend endpoint configuration

### Code Reference
```javascript
const [globalSheetData, setGlobalSheetData] = useState(() => {
  const data = localStorage.getItem('comboStickerSheetData');
  return data ? JSON.parse(data) : null;
});
```

### Key Limitation
❌ **No direct Google Sheets data fetch**
- Only uses sheet ID for upload destination
- Does not parse/read sheet data
- Relies on backend to handle sheet operations

---

## 2. HoloarcylicPage.jsx

### Data Fetching Mechanism
**Source:** Automatic config lookup + CSV export
- Calls `getSheetUrlForPage('holoarcylic')` from sheetConfigService
- Fetches config from a master Google Sheets
- Exports sheet as CSV and parses it

### Sheet URL Input
❌ **NO manual sheet URL input field**
- Shows static message: "Sheet URL sẽ được tải tự động từ config"
- URL loaded automatically from sheetConfigService
- No UI to change/override sheet URL

### Data Flow
1. **Config Sheet Lookup:**
   ```javascript
   const sheetUrl = await getSheetUrlForPage('holoarcylic');
   ```
   - Reads from CONFIG_SHEET_ID (hardcoded in sheetConfigService.js)
   - Config sheet format: `| Page | SheetURL |`

2. **CSV Fetch:**
   ```javascript
   const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
   const csvData = await fetch(csvUrl).then(r => r.text());
   ```

3. **Data Parse:**
   - Custom CSV parser with quote handling
   - Filters rows where TRẠNG THÁI (Status) is empty
   - Extracts: `keyword`, `imageLink`

### Key Features
✅ Normalized header matching (handles Vietnamese & English)
✅ CSV parsing with proper quote/comma handling
✅ Data filtering by status field
✅ Pagination support (10 items/page)

### Code Example
```javascript
const filteredRows = rows
  .filter((row) => {
    const statusValue = getValueByAliases(row, ['TRẠNG THÁI', 'Status']);
    return !statusValue;  // Only empty status
  })
  .map((row) => ({
    keyword: getValueByAliases(row, ['KEYWORD', 'Keyword']),
    imageLink: getValueByAliases(row, ['LINK ẢNH', 'LINK ANH', ...]),
  }));
```

---

## 3. OrnamentPage.jsx

### Data Fetching Mechanism
**Source:** Identical to HoloarcylicPage
- Calls `getSheetUrlForPage('ornament')`
- Same CSV fetch and parse logic
- Only difference: prompt used is `PROMPTS.ornament` instead of `PROMPTS.holographicOrnament`

### Sheet URL Input
❌ **NO manual sheet URL input field**
- Same static message as HoloarcylicPage
- URL auto-loaded from config

### Data Flow
**Identical to HoloarcylicPage:**
- Same config lookup
- Same CSV export method
- Same header normalization
- Same status filtering

---

## Comparison Matrix

| Feature | ComboStickerPage | HoloarcylicPage | OrnamentPage |
|---------|------------------|-----------------|--------------|
| **Sheet URL Input** | ✅ Manual (Navbar) | ❌ Auto-config | ❌ Auto-config |
| **Data Source** | localStorage | Config Sheet | Config Sheet |
| **Data Fetch Method** | Backend upload | CSV export | CSV export |
| **CSV Parsing** | ❌ No | ✅ Yes | ✅ Yes |
| **Status Filtering** | ❌ No | ✅ Yes | ✅ Yes |
| **Pagination** | ❌ No | ✅ Yes (10/page) | ✅ Yes (10/page) |
| **Header Normalization** | ❌ No | ✅ Yes | ✅ Yes |
| **Upload to Backend** | ✅ Yes | ❌ No | ❌ No |
| **AI Redesign** | ✅ Yes | ✅ Yes | ✅ Yes |

---

## sheetConfigService.js

### Configuration Source
- **CONFIG_SHEET_ID:** `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`
- **CONFIG_SHEET_NAME:** `Config`
- **Requires:** Google Drive Access Token (Bearer token)

### Config Sheet Format
```
| Page      | SheetURL |
|-----------|----------|
| holoarcylic | https://docs.google.com/spreadsheets/d/[ID]#gid=0 |
| ornament  | https://docs.google.com/spreadsheets/d/[ID]#gid=0 |
```

### Functions
```javascript
getSheetConfig()          // Fetch all config
getSheetUrlForPage(pageName)  // Get URL for specific page
clearConfigCache()        // Clear 5-min cache
```

### Cache
- 5-minute TTL
- Caches to prevent excessive API calls
- Requires valid access token from localStorage

---

## What's MISSING

### 1. ComboStickerPage Gaps
- ❌ No CSV data parsing (unlike others)
- ❌ No automatic sheet config lookup
- ❌ No status filtering
- ❌ No pagination in data prep
- ℹ️ **Intent:** Only prepares upload destination, actual data handling is manual/ad-hoc

### 2. HoloarcylicPage & OrnamentPage Gaps
- ❌ **NO SHEET URL INPUT FIELD** - Can't override config at runtime
- ❌ No upload to backend (only display/redesign)
- ❌ No manual data entry fallback if config fails
- ℹ️ **Issue:** If config sheet is down, pages become unusable

### 3. Architectural Gaps
- ❌ No unified data fetching abstraction
- ❌ sheetConfigService only reads (no write back)
- ❌ No error recovery/fallback strategy
- ❌ No permission checking before access
- ❌ Access token required but not validated upfront

---

## Recommendations

1. **Add Sheet URL Input to HoloarcylicPage & OrnamentPage**
   - Allow override of auto-loaded URL
   - Fallback field if config lookup fails

2. **Standardize Data Fetching**
   - Consider extracting CSV parsing to sheetConfigService
   - Create reusable hooks for sheet data

3. **Error Handling**
   - Add fallback sheet URL input
   - Validate access token before API calls
   - Better error messages for no config found

4. **ComboStickerPage**
   - Consider using sheetConfigService for consistency
   - Or document why it differs from others
