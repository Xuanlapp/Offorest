# Products Sticker Permission Update Summary

- Da them quyen `STICKER_VIEW` trong `src/config/permission.js`.
- Da sua `sticker` mode trong `src/config/nav.modes.js` de dung quyen `STICKER_VIEW` thay vi `HOLOARCYLIC_VIEW`.
- Da cap nhat `src/services/authService.js` de map product code `Sticker` (normalize thanh `sticker`) vao:
  - permission: `STICKER_VIEW`
  - default path: `/sticker`
- Ket qua: neu login tra ve products co code `Sticker` thi user thay duoc trang Sticker; neu khong co product hop le thi van ve `/no-permission`.
