# Cấu trúc request gửi lên `/gemini/combosticker/generate`

Ngày cập nhật: 2026-03-13  
Nguồn mapping: `src/services/geminiService.js`

## 1) Endpoint
- Method: `POST`
- URL: `http://offorest-wp.lap/wp-json/offorest-api/v1/gemini/combosticker/generate`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <access_token>`

## 2) Body JSON (schema)
```json
{
  "user_id": 1,
  "object_name": "Koala",
  "keyword": "cute animal sticker",
  "theme": "cute",
  "style": "cartoon",
  "color_palette": ["#E0F2F7", "#FEEBE8", "#E8F7E0"],
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "inlineData": {
            "mimeType": "image/png",
            "data": "<base64_image_without_data_url_prefix>"
          }
        },
        {
          "text": "<fullPrompt>"
        }
      ]
    }
  ],
  "generationConfig": {
    "responseModalities": ["IMAGE", "TEXT"],
    "imageConfig": {
      "aspectRatio": "1:1",
      "image_size": "2K"
    }
  }
}
```

## 3) Cách build `text` (`fullPrompt`)
Trong code, `text` được ghép theo thứ tự:
1. `prompt`
2. `Object: ${objectName}`
3. `Theme: ${theme}` (nếu có)
4. `Style: ${style}` (nếu có)
5. `Color palette: ${colorPalette.join(', ')}` (nếu có)
6. `Keyword/context: ${keyword}` (nếu có)

Ví dụ `text`:
```text
You are a professional sticker designer...
Object: Koala
Theme: cute
Style: cartoon
Color palette: #E0F2F7, #FEEBE8, #E8F7E0
Keyword/context: baby animal, pastel, clean outline
```

## 4) Mapping từ kết quả analyze -> generate
Nếu API analyze trả:
```json
{
  "theme": "cute",
  "style": "cartoon",
  "colorPalette": ["#E0F2F7", "#FEEBE8"],
  "objects": [
    { "label": "Koala", "box_2d": [26,73,137,192], "confidence": 1 }
  ]
}
```
Thì khi generate:
- `object_name` = `objects[i].label`
- `theme` = `theme`
- `style` = `style`
- `color_palette` = `colorPalette`

## 5) Response mong đợi (frontend đang parse)
Frontend chấp nhận các dạng sau:
- `data.base64`
- hoặc `data.images[0].base64`
- hoặc `data.images[0].data`
- hoặc `data.images[0].image_data`

Kết quả cuối dùng để hiển thị ảnh:
```json
{
  "base64": "...",
  "mimeType": "image/png"
}
```
