# Image Preview Editor Modal Summary

## Muc tieu

- Cho phep bam vao anh goc hoac anh da tao de mo preview lon.
- Cho phep chinh sua truc tiep tren anh dang preview truoc khi dung tiep cho luong AI hoac upload.

## Da trien khai

- Tao component dung chung `ImagePreviewEditorModal` trong `src/components`.
- Ho tro cac chinh sua nhanh: brightness, contrast, saturation, hue, sepia, zoom, rotation.
- Ho tro `Luu vao o hien tai` de ghi nguoc lai anh da sua vao state cua tung trang.
- Ho tro tai xuong ban anh da sua tu modal.

## Trang da ap dung

- `ComboStickerPage` (anh source, anh generated van dung editor rieng san co)
- `HoloarcylicPage`
- `SuncatcherPage`

## Hanh vi moi

- Bam vao anh source de mo lon va sua. Sau khi luu, ket qua redesign va lifestyle cu se duoc reset de tranh lech du lieu voi nguon moi.
- Bam vao anh redesign de mo lon va sua. Sau khi luu, lifestyle cu se duoc reset.
- Bam vao tung anh lifestyle de mo lon va sua ngay tren modal.

## Cap nhat them

- Sua luong upload lifestyle de lay file tu anh preview hien tai thay vi bien `lifestyleImages` khong ton tai.
- Chap nhan ca `data:image/...` la nguon anh hop le sau khi nguoi dung chinh sua va luu lai.