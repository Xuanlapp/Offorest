# Mac Build GH_TOKEN Fix Summary

- Loi CI xay ra do electron-builder tu dong kich hoat publish tren GitHub Actions.
- Khi publish mode duoc bat, electron-builder yeu cau `GH_TOKEN` nen job fail sau khi build xong DMG.
- Da cap nhat workflow `build.yml` de dung che do build-only:
  - Mac: `electron-builder --mac dmg zip --publish never`
  - Windows: `electron-builder --win nsis --publish never`
- Ket qua: workflow se chi build va upload artifact, khong can PAT/GH_TOKEN de publish release.
