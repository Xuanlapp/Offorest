# Prompt Library

## 1) Prompt Them Feature
```text
Ban la Senior Engineer cho du an Offorest (Electron + React + Vite).
Hay them tinh nang sau:

Muc tieu:
[dien]

Boi canh page/module:
[vi du: RedesignPage + geminiService]

Pham vi file duoc sua:
- [liet ke]

Rang buoc:
- Khong doi architecture hien tai
- Khong sua file ngoai pham vi
- Giu nguyen auth/permission/IPC contract neu khong can doi

Yeu cau output:
- Code thay doi
- Tom tat file da sua
- Cach test bang npm run lint + npm run start + test tay flow lien quan
```

## 2) Prompt Sua Bug
```text
Sua bug trong Offorest voi thong tin:
- Mo ta loi: [dien]
- Cach tai hien: [dien]
- Ket qua hien tai: [dien]
- Ket qua ky vong: [dien]

Pham vi sua cho phep:
- [file1]
- [file2]

Bat buoc:
- Them regression check scenario
- Khong doi hanh vi khong lien quan
- Bao cao root cause ngan gon
```

## 3) Prompt Refactor
```text
Refactor module sau trong Offorest de de bao tri hon:
- Module: [dien]
- Muc tieu refactor: [dien]

Rang buoc:
- Khong doi public behavior
- Khong doi API/IPC contract
- Giu style va naming theo project

Sau khi lam xong:
- Liet ke truoc/sau
- Risk review
- Cach verify
```

## 4) Prompt Viet Test
```text
Phan tich module sau va de xuat test cases uu tien cao:
- Module: [dien]

Can bao gom:
- success
- fail
- edge case
- auth/permission
- regression

Neu repo chua co test framework, tra ve:
- test plan co the chay tay
- goi y test harness phu hop voi Vite/React de team bat sau
```

## 5) Prompt Review Code
```text
Review thay doi sau theo mindset production:
- Tap trung bug, security risk, regression, missing test
- Sap xep findings theo muc do nghiem trong
- Moi finding can co file + ly do + huong sua

Pham vi:
[dien commit/files]
```

## 6) Prompt Toi Uu Performance
```text
Toi uu performance cho flow sau trong Offorest:
- Flow: [dien]
- Trieu chung: [cham, lag, memory, high CPU]

Yeu cau:
- Do va chi ra bottleneck
- De xuat toi uu it xam lan
- Khong pha vo quality output (image/mockup/gemini)
```

## 7) Prompt Kiem Tra Security
```text
Audit security cho module sau:
- Module/flow: [dien]

Checklist bat buoc:
- token handling
- input validation
- authz/authn
- logging thong tin nhay cam
- upload attack surface

Tra ve:
- findings theo severity
- action items uu tien
```

## 8) Prompt Giai Thich Codebase
```text
Giai thich nhanh codebase Offorest cho thanh vien moi:
- Kien truc tong quan
- Luong auth + permission
- Luong upload + Google Sheet/Drive
- Luong Gemini backend va Gemini desktop bridge
- Cach run/build/release
```

## 9) Prompt Chuan Bi Deploy
```text
Chuan bi release cho Offorest version [x.y.z].

Yeu cau:
- Kiem tra scripts build/dist
- Kiem tra updater config
- Kiem tra tai lieu deploy
- Kiem tra risk va rollback

Tra ve checklist pass/fail ro rang.
```
