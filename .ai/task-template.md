# AI Task Template

## 1) Muc tieu
- Mo ta ket qua cuoi cung can dat duoc (business + technical).

## 2) Boi canh
- Trang/chuc nang lien quan (Sticker, Redesign, Mockup, Admin, ...).
- Hanh vi hien tai va van de can giai quyet.

## 3) File lien quan
- Bat buoc liet ke file duoc phep sua.
- Neu can doc them file tham chieu, liet ke rieng.

## 4) Yeu cau bat buoc
- Giu nguyen architecture hien tai (Electron + React + service layer).
- Tuan thu `.ai/coding-rules.md`.
- Xu ly input validation + error handling ro rang.
- Khong lam mat auth/permission flow hien co.

## 5) Khong duoc lam
- Khong sua file ngoai pham vi.
- Khong them thu vien moi neu khong duoc yeu cau.
- Khong doi ten IPC/API public ma khong cap nhat dong bo.
- Khong dua secret/token that vao code/docs.

## 6) Ket qua mong muon
- Mo ta output mong doi (UI, API payload/response, logs, side effects).
- Neu co acceptance criteria, liet ke dang checklist.

## 7) Cach kiem tra
- Lint: `npm run lint`
- Chay app desktop dev: `npm run start`
- Kiem tra flow lien quan trong page cu the.
- Neu lien quan upload/API: test them bang Postman hoac script `test_upload.bat` / `test_upload.sh`.

## 8) Mau giao viec
```text
Muc tieu:
[dien]

Boi canh:
[dien]

File duoc sua:
- src/pages/...
- src/services/...

Yeu cau bat buoc:
- ...

Khong duoc lam:
- ...

Ket qua mong muon:
- ...

Cach kiem tra:
- npm run lint
- npm run start
- ...
```
