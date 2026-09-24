# Logic Rules for Code & Data

## 1. Nguyên tắc cốt lõi

- Code phải đúng trước, hay sau.
- Không xử lý dữ liệu bằng cách đoán.
- Mọi input đều phải được validate.
- Mọi output quan trọng phải có format rõ ràng.
- Logic nghiệp vụ không được viết lẫn trong UI.
- Không hard-code dữ liệu, config, secret.
- Không sửa code ngoài phạm vi task.
- Không viết logic trùng lặp nếu có thể tái sử dụng.
- Không nuốt lỗi im lặng.
- Không tối ưu khi chưa có lý do rõ ràng.

## 2. Quy tắc dữ liệu

### Input

- Luôn kiểm tra kiểu dữ liệu.
- Luôn kiểm tra required field.
- Luôn kiểm tra min/max length.
- Luôn kiểm tra format: email, phone, URL, date, number.
- Luôn sanitize dữ liệu người dùng nhập.
- Không tin dữ liệu từ frontend.
- Không tin dữ liệu từ API bên ngoài.
- Không tin dữ liệu từ database nếu có thể đã cũ hoặc sai.

Ví dụ:

```ts
if (!email || typeof email !== "string") {
  throw new Error("Invalid email");
}Output
Output phải có cấu trúc ổn định.
Không trả secret, token, password, private key.
Error trả ra cho user không được lộ chi tiết hệ thống.
API response nên thống nhất format.

Ví dụ:

{
  "success": true,
  "data": {},
  "message": "OK"
}
3. Quy tắc xử lý logic
Một function chỉ nên làm một việc.
Function có tên rõ hành động.
Điều kiện phức tạp phải tách biến.
Không lồng quá nhiều if.
Ưu tiên early return.
Không viết magic number.
Không để side effect ẩn.

Ví dụ tốt:

const isAdult = user.age >= 18;

if (!isAdult) {
  return denyAccess();
}

return allowAccess();

Ví dụ không tốt:

if (user.age >= 18) {
  return allowAccess();
} else {
  return denyAccess();
}
4. Quy tắc database
Không query trực tiếp lung tung trong UI/controller.
Query nên nằm trong repository/service/model layer.
Luôn dùng parameterized query hoặc ORM an toàn.
Không nối chuỗi SQL từ input người dùng.
Migration phải rõ ràng, có rollback nếu framework hỗ trợ.
Field quan trọng phải có index nếu cần tìm kiếm nhiều.
Không xóa dữ liệu thật nếu chưa có xác nhận.
Nên dùng soft delete cho dữ liệu quan trọng.
Transaction bắt buộc khi xử lý nhiều bước liên quan tiền, đơn hàng, tồn kho, quyền hạn.
5. Quy tắc API
API phải validate request.
API phải kiểm tra authentication.
API phải kiểm tra authorization.
API phải trả status code đúng.
API không được trả stack trace.
API phải xử lý lỗi từ database, service ngoài, network.
API nên có rate limit với endpoint nhạy cảm.
API phải có format response thống nhất.

Ví dụ:

{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input"
  }
}
6. Quy tắc frontend
Component chỉ nên lo hiển thị.
Logic xử lý nên tách ra hook/service/helper.
Không gọi API rải rác nhiều nơi.
Không lặp UI code quá nhiều.
Form phải validate trước khi submit.
Loading, empty state, error state phải có.
Không lưu token nhạy cảm bừa bãi.
State global chỉ dùng khi thật sự cần.
7. Quy tắc backend
Controller chỉ nhận request và trả response.
Service xử lý business logic.
Repository/model xử lý database.
Middleware xử lý auth, logging, rate limit.
Không để controller quá dài.
Không để business logic trong route.
Không để password/token xuất hiện trong log.
8. Quy tắc bảo mật
Không commit .env.
Không hard-code API key.
Không log password, token, cookie.
Luôn hash password bằng thuật toán an toàn.
Luôn kiểm tra quyền người dùng.
Chống SQL injection.
Chống XSS.
Chống CSRF nếu dùng cookie/session.
Kiểm tra file upload: loại file, size, tên file.
Không tin quyền từ frontend gửi lên.
9. Quy tắc test
Logic quan trọng phải có unit test.
API quan trọng phải có integration test.
Bug đã sửa phải có regression test.
Test phải gồm:
case đúng
case sai
edge case
permission case
Không chỉ test happy path.
Test name phải mô tả hành vi.

Ví dụ:

it("should reject login when password is incorrect", async () => {
  // ...
});
10. Quy tắc đặt tên

Tên biến:

user
currentUser
isLoggedIn
hasPermission
orderTotal
createdAt

Tên function:

getUserById()
createOrder()
validateEmail()
calculateTotalPrice()
sendResetPasswordEmail()

Tên boolean:

isActive
hasAccess
canEdit
shouldRetry

Không nên:

data1
temp
abc
handleThing
doStuff
check
11. Quy tắc chia file
File không nên quá dài.
Một file nên có một trách nhiệm chính.
Helper dùng chung đặt trong utils.
API call đặt trong services.
Type/interface đặt trong types.
Logic nghiệp vụ đặt trong services hoặc domain layer.
UI component đặt trong components.
12. Quy tắc xử lý lỗi
Không bỏ qua lỗi.
Không dùng catch rỗng.
Lỗi phải có message rõ ràng cho developer.
Lỗi cho user phải dễ hiểu nhưng không lộ hệ thống.
Lỗi quan trọng phải được log.
Lỗi có thể retry thì cần cơ chế retry hợp lý.

Không tốt:

try {
  await saveUser();
} catch (e) {}

Tốt:

try {
  await saveUser();
} catch (error) {
  logger.error("Failed to save user", { error });
  throw new AppError("SAVE_USER_FAILED", "Could not save user");
}
13. Quy tắc performance
Không query database trong vòng lặp nếu có thể batch.
Không render lại UI không cần thiết.
Không load dữ liệu lớn một lần nếu có thể phân trang.
Không tối ưu sớm khi chưa đo.
Cache chỉ dùng khi dữ liệu phù hợp.
Dữ liệu cache phải có cơ chế hết hạn hoặc invalidate.
14. Quy tắc AI phải tuân thủ khi viết code

AI bắt buộc:

Đọc context dự án trước.
Hiểu task trước khi sửa.
Liệt kê file dự kiến sửa.
Không sửa file ngoài phạm vi.
Không xóa logic cũ nếu chưa có lý do.
Không tự thêm thư viện nếu chưa được phép.
Viết code nhỏ, rõ, dễ review.
Tự kiểm tra lỗi bảo mật.
Tự kiểm tra edge case.
Đề xuất test sau khi sửa.
Tóm tắt thay đổi cuối cùng.
15. Quy tắc theo ngôn ngữ
JavaScript / TypeScript
Ưu tiên TypeScript nếu có.
Không dùng any bừa bãi.
Luôn type cho function input/output quan trọng.
Dùng const mặc định, let khi cần đổi giá trị.
Không dùng var.
Tách type/interface rõ ràng.
PHP / Laravel
Controller mỏng.
Logic đặt trong Service.
Validate bằng Form Request nếu có thể.
Query phức tạp nên đặt trong Repository/Model scope.
Không viết SQL raw nếu không cần.
Dùng migration, seeder, factory đúng chuẩn.
Python
Function nhỏ, rõ.
Dùng type hints cho logic quan trọng.
Không dùng mutable default argument.
Xử lý exception cụ thể.
Tách config ra khỏi code.
Tuân thủ PEP8.
Java
Class có trách nhiệm rõ ràng.
Không để method quá dài.
Dùng interface khi cần abstraction.
Exception phải rõ ràng.
Không lạm dụng static.
Dùng DTO cho request/response nếu cần.
Go
Error phải được kiểm tra.
Function ngắn.
Interface nhỏ.
Không panic trong logic bình thường.
Context dùng cho request, timeout, cancellation.
Struct tag rõ ràng khi dùng JSON/DB.
SQL
Không SELECT * trong production query quan trọng.
Dùng index cho cột tìm kiếm nhiều.
Dùng transaction khi dữ liệu liên quan nhiều bảng.
Không nối chuỗi query từ user input.
Có constraint ở database, không chỉ validate ở code.
16. Quy tắc hoàn thành task

Một task chỉ được xem là xong khi:

Code đúng yêu cầu.
Không phá chức năng cũ.
Có xử lý lỗi.
Có validate dữ liệu.
Có kiểm tra quyền nếu liên quan user.
Có test hoặc hướng dẫn test.
Có tóm tắt file đã sửa.
Có nêu rủi ro còn lại nếu có.