# Design Update Files Array Summary

## Muc tieu

- Doi cau truc upload update image cho `Holoarcylic` va `Suncatcher` sang dang append lap lai cung key `files[]`.

## Da cap nhat

- Sua ham `updateDesignPageImages(...)` trong `src/services/googleDriveService.js`.
- Hai file upload trong luong update gom:
  - redesign image
  - lifestyle image
- Ca hai deu duoc gui bang:

```js
formData.append('files[]', redesignImageFile)
formData.append('files[]', lifestyleImageFile)
```

## Pham vi anh huong

- `HoloarcylicPage`
- `SuncatcherPage`

## Log moi

- Them `fileFieldKey: 'files[]'`
- Them `fileCount`
- Van giu log thong tin file redesign va lifestyle