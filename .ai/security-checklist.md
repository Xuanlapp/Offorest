# Security Checklist

## Secret and Env
- [ ] Khong hard-code secret moi trong code/docs.
- [ ] Khong commit token that (WordPress token, Google token).
- [ ] Bien moi co the cau hinh qua env khi phu hop.

## Authentication
- [ ] Request can auth co gan `Authorization: Bearer` khi co token.
- [ ] Xu ly token het han/401-403 dung theo flow logout hien tai.
- [ ] Khong vo tinh xoa hoac bypass auth guard.

## Authorization
- [ ] Route/page check permission thong qua map hien co.
- [ ] Khong mo quyen truy cap ngoai y muon.

## Input Validation
- [ ] Validate input tai service/page boundary.
- [ ] Kiem tra null/empty/format truoc khi goi API hoac bridge.
- [ ] Kiem soat URL/file inputs truoc khi xu ly.

## Injection Risks
- [ ] SQL injection: backend concern, frontend khong tao payload nguy hiem khong can thiet.
- [ ] Command injection: khong truyen input user truc tiep vao shell process.

## XSS
- [ ] Khong render HTML dong khong sanitize.
- [ ] Khong dung `dangerouslySetInnerHTML` neu khong bat buoc.

## CSRF
- [ ] Neu su dung nonce/cookie flow, giu fallback logic an toan.
- [ ] Khong bo qua co che auth header/nonce hien co.

## File Upload
- [ ] Validate file list va metadata co ban (type/size when needed).
- [ ] Khong log full noi dung file hoac token di kem.
- [ ] Bao loi ro rang khi upload fail.

## Rate Limit and Retry
- [ ] Retry chi cho status retryable (429/5xx) theo logic hien co.
- [ ] Tranh flood request song song khong can thiet.

## Error Messages
- [ ] Error user-facing ro rang nhung khong lo internals nhay cam.
- [ ] Console error chi tiet vua du cho debug.

## Sensitive Logging
- [ ] Mask token truoc khi log.
- [ ] Khong ghi secret vao renderer log file.
