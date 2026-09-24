# AI Review Checklist

## Requirement Fit
- [ ] Yeu cau chuc nang da duoc dap ung day du.
- [ ] Khong bo sot acceptance criteria.

## Scope Control
- [ ] Chi sua file nam trong pham vi task.
- [ ] Khong co thay doi ngoai y muon (format/churn khong can thiet).

## Security
- [ ] Khong them/lo secret, token, credential.
- [ ] Auth header va permission check van duoc giu dung.
- [ ] Error message khong de lo thong tin nhay cam.

## Validation and Error Handling
- [ ] Input duoc validate o diem vao.
- [ ] API error handling bao gom non-OK response va parse fallback.
- [ ] Desktop-only feature co guard khi bridge khong ton tai.

## Logging and Observability
- [ ] Log quan trong duoc giu lai cho upload/auth/gemini flows.
- [ ] Khong log full token; chi log da mask neu can.

## Testing
- [ ] Da chay `npm run lint` hoac ghi ro neu chua chay duoc.
- [ ] Da test tay flow bi anh huong (route/page/service).
- [ ] Neu la bugfix: co regression scenario ro rang.

## Documentation
- [ ] Da cap nhat docs lien quan neu thay doi hanh vi.
- [ ] Mieu ta cach test va rui ro con lai trong summary.

## Compatibility and Breaking Changes
- [ ] Khong pha vo contract giua renderer <-> preload <-> main.
- [ ] Khong doi payload/API shape ma khong xu ly call sites.
- [ ] Neu co breaking change, da ghi ro tac dong va migration.
