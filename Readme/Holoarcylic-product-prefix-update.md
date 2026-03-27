# Holoarcylic - Thêm Product Prefix vào Prompt

## Mục đích
Khi gửi prompt redesign cho Holoarcylic page, thêm một câu prefix chứa thông tin về loại sản phẩm để AI hiểu rõ hơn về các đặc tính vật liệu và hình dạng cần giữ nguyên.

## Thay đổi

### 1. HoloarcylicPage.jsx - filteredRows
**Thêm field `sanPham`** vào data structure khi parse CSV:
```javascript
.map((row) => ({
  stt: getValueByAliases(row, ['STT', 'Stt']),
  keyword: getValueByAliases(row, ['KEYWORD', 'Keyword']),
  imageLink: getValueByAliases(row, ['LINK ẢNH', 'LINK ANH', 'Link ảnh', 'Image link', 'Link image']),
  sanPham: getValueByAliases(row, ['SẢN PHẨM']),  // ← NEW
}))
```

### 2. HoloarcylicPage.jsx - handleCreateMaster
**Tạo prompt động** bằng cách thêm prefix chứa product_name:
```javascript
const productName = data[globalIndex]?.sanPham || 'product'
const productPrefix = `The product is a ${productName}. Automatically detect and preserve its correct material, physical properties, and real-world appearance based on this product type.\n\n`
const fullPrompt = productPrefix + PROMPTS.holographicOrnament
```

## Luồng hoạt động
1. User click "Create Master"
2. Hệ thống lấy `sanPham` từ data row tương ứng
3. Thêm prefix: "The product is a [product_name]. Automatically detect..."
4. Ghép với prompt template gốc từ `PROMPTS.holographicOrnament`
5. Gửi full prompt đến Gemini API

## Ví dụ
Nếu product_name = "phone case":
```
The product is a phone case. Automatically detect and preserve its correct material, physical properties, and real-world appearance based on this product type.

[+ nội dung PROMPTS.holographicOrnament]
```
