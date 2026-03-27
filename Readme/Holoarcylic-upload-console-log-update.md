# Holoarcylic Upload Console Log Update

## Muc tieu

- Bo sung `console.log` ro rang hon cho luong upload anh cua trang Holoarcylic.

## Da cap nhat

- Log bat dau upload single image.
- Log payload truoc khi goi API update.
- Log response khi upload thanh cong.
- Log loi chi tiet khi upload that bai.
- Log bat dau batch upload.
- Log thong tin tung item trong batch truoc khi gui.
- Log tong ket batch voi so item thanh cong va that bai.

## Vi tri

- `src/pages/HoloarcylicPage.jsx`

## Noi dung log chinh

- `globalIndex`, `keyword`, `stt`
- `sourceImageLink`
- thong tin file `redesignFile`, `lifestyleFile`
- do dai `base64` cua redesign
- so luong preview lifestyle
- response backend sau khi upload thanh cong