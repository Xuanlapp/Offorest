# Holoarcylic - Product Filter Tabs (ALL + SẢN PHẨM)

## Mục tiêu
Thêm bộ lọc sản phẩm nằm ngang hàng với tiêu đề **Design Workspace** và hiển thị ở bên phải, gồm:
- `ALL`
- Danh sách tên sản phẩm từ cột `SẢN PHẨM`

Bấm vào tên sản phẩm sẽ chỉ lọc dữ liệu hiển thị trong khu vực workspace của trang Holoarcylic (không ảnh hưởng navigation toàn app).

## File cập nhật
- `src/pages/HoloarcylicPage.jsx`

## Thay đổi chính

### 1) State filter cục bộ
Thêm state:
- `selectedProduct` (mặc định `ALL`)

### 2) Tạo danh sách sản phẩm và dữ liệu đã lọc
- `productNames`: lấy unique từ `data[].sanPham`
- `filteredRowsWithIndex`: lọc theo `selectedProduct`
- Giữ `globalIndex` gốc để không làm hỏng các logic hiện có (`redesignResults`, `lifestyleResults`, upload status, checkbox chọn item)

### 3) Cập nhật phân trang theo dữ liệu đã lọc
- `totalPages` tính theo `filteredRowsWithIndex.length`
- `paginatedData` slice từ `filteredRowsWithIndex`
- `startItemIndex`, `endItemIndex` hiển thị theo tập đã lọc
- Khi đổi filter: tự reset về trang 1

### 4) Cập nhật UI header
Ở bên phải tiêu đề `Design Workspace`:
- Render nút `ALL`
- Render các nút tên sản phẩm từ `productNames`
- Nút active đổi style để nhìn như tab lọc

### 5) Giữ hành vi upload/generate như cũ
Khi render list, map theo `{ row, globalIndex }` để:
- `Create Master`
- `Lifestyle`
- checkbox/select/upload đơn/lô
vẫn dùng đúng index dữ liệu gốc, không bị lệch do filter/pagination.

## Ghi chú
- Khi bấm lấy dữ liệu mới (`Get Data`), filter được reset về `ALL`.
