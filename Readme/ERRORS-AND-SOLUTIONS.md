# Offorest Desktop — Nhật ký lỗi và giải pháp

Tài liệu này ghi lỗi phát hiện khi code, build, test và vận hành. Không ghi mật khẩu, token, chuỗi kết nối hoặc ảnh/dữ liệu riêng tư. Mỗi lỗi có ID theo khu để tìm lại bằng `rg "WRK-001" Readme/ERRORS-AND-SOLUTIONS.md`.

## Cách cập nhật

- Khu: `WRK` worker/hàng đợi, `PSD` Photoshop/PSD, `IMG` ảnh/thumbnail, `UPD` cài đặt/cập nhật, `DEV` build/kiểm thử.
- Ghi ngày giờ Asia/Saigon, môi trường (source/bản cài), phiên bản nếu biết, triệu chứng, ID job không nhạy cảm và log tối thiểu.
- Phân biệt **đã xác minh** với **giả thuyết**. Trạng thái: đang điều tra / đã sửa source / đã phát hành / đã kiểm thử thực tế / tái phát.
- Ghi giải pháp v1 cùng phép kiểm chứng. Khi có cách tốt hơn, thêm v2 và lý do thay đổi; không xóa lịch sử v1. Tái phát thì cập nhật mục cũ.
- Nếu chỉ đổi trạng thái database hoặc mở lại worker thủ công, không gọi đó là sửa lỗi code.

### Mẫu mục mới

`### [KHU-000] Tên lỗi — trạng thái`

- Phát hiện: YYYY-MM-DD HH:mm; môi trường/phiên bản: ...
- Triệu chứng và cách tái hiện: ...
- Bằng chứng: ...
- File/hàm liên quan và loại lỗi (code/runtime/cấu hình/dữ liệu): ...
- Nguyên nhân xác minh: ...; giả thuyết: ...
- Giải pháp v1 (ngày, file/commit): ...
- Kiểm chứng: ...
- Rủi ro/cần làm tiếp: ...
- Giải pháp v2 (nếu có): ...

## Tra cứu theo phần code

| File / phần code | ID lỗi | Loại và mức xác minh |
| --- | --- | --- |
| `main.js` — `ensureBackgroundLocalMockupWorker`, `readLocalMockupWorkerState`, `app.whenReady` | WRK-001 | Lifecycle/heartbeat worker; hiện tượng xác minh, nguyên nhân tự khởi động chưa xác minh |
| `main.js` — `runLocalMockupWorkerOnce`, `recoverStaleLocalMockupJobs`, `getLocalMockupWorkerStatus` | WRK-002 | Trạng thái job mồ côi; lỗi xử lý trạng thái xác minh, nguyên nhân gián đoạn chưa rõ |
| File BAT/PS1 trên Desktop (ngoài repo) | WRK-003 | Launcher/UAC; lỗi quyền và kiểm tra PID xác minh |
| `main.js` — `replaceDesignLayers`, `renderLocalMockupWithFallbacks` | PSD-001 | Decoder PNG và fallback renderer; có trường hợp xác minh, chưa bảo đảm mọi ảnh |
| `main.js` — `buildPhotoshopRenderJsx`, `renderMockupsWithPhotoshopEngine`, `enqueuePhotoshopRender` | PSD-002 | Điểm điều tra script Photoshop; chưa xác minh lỗi nằm ở dòng nào |
| `main.js` — `processLocalMockupJob` | IMG-001 | Đường dẫn PNG/thumbnail và ghi file; mới sửa source, chưa test job bản cài |
| `eslint.config.js`, `main.js`, `app-dist/` | DEV-001 | Cấu hình lint/source/generated bundle; lỗi kiểm thử đang tồn tại |
| `AGENTS.md`, `.ai/logic-rules.md` (đang thiếu) | DEV-002 | Quy tắc dự án/tài liệu, không phải lỗi runtime |

Khi ghi lỗi mới, thêm file + hàm/cấu hình vào bảng này và liên kết ID tới mục chi tiết bên dưới. Nếu lỗi liên quan nhiều lớp (renderer → preload → main → database), liệt kê đủ các điểm đã kiểm tra; không gán nguyên nhân cho một file chỉ vì nó xuất hiện trong stack trace.
## Worker và hàng đợi

### [WRK-001] Worker không tự chạy sau cập nhật — khôi phục thủ công, chưa sửa tự động

- Phát hiện: 2026-10-07; bản cài Offorest v0.1.28. Giao diện mở nhưng không có tiến trình `--local-mockup-worker`; heartbeat còn PID cũ.
- Đã xác minh: mở worker bản cài thủ công tạo PID mới và heartbeat cập nhật. Chưa xác minh tại sao app không tự mở lại sau update.
- Giải pháp v1: khởi động đúng `Offorest.exe --local-mockup-worker`, đối chiếu PID/heartbeat. Cần kiểm thử lại khi cập nhật lần sau và sửa lifecycle nếu tái phát.

### [WRK-002] Processing tồn tại dù worker không giữ slot — đã chuyển đúng ba job sang lỗi

- Phát hiện: 2026-10-06; asset 7666, 7667, 4342 (job 3282, 3281, 3280). Database `processing` nhưng `activeWorkers: 0`, không có output.
- Đã xác minh: trạng thái job không được đóng sau khi xử lý gián đoạn; nguyên nhân gián đoạn cụ thể chưa xác minh.
- Giải pháp v1: chỉ ba job này được cập nhật có điều kiện từ `processing` sang `failed`, có lý do và `completed_at`. Đã truy vấn lại thấy ba job `failed`.
- Cần làm tiếp: cơ chế heartbeat/ownership an toàn cho nhiều máy để phát hiện job mồ côi; không reset hàng loạt job còn đang render.

- Bổ sung 2026-10-13: worker PID `25276` còn sống nhưng heartbeat dừng từ `08:03:28Z`, `activeWorkers: 0`, không còn job `waiting`/`processing`; nguyên nhân vận hành được xác minh là tiến trình worker treo sau khi hoàn tất job `6573`. Đã dừng đúng PID có tham số `--local-mockup-worker` và khởi động lại worker PID `30028`; heartbeat mới cập nhật bình thường. Không thay đổi dữ liệu job.

- Tái phát 2026-10-14: worker PID `37340` còn sống nhưng heartbeat dừng tại `03:00:50Z` (khoảng 7 giờ tại thời điểm kiểm tra), trong khi 5 job glass (`7340`, `7342`, `7343`, `7344`, `7345`) vẫn `processing`, `executed_by: local`; không có tiến trình Photoshop đang chạy. Nguyên nhân code chưa xác minh. Không tự reset hay restart ở lần kiểm tra này để không làm mất trạng thái đầu ra; cần xác nhận trước khi dừng worker và xử lý các job mồ côi.

- Xử lý theo yêu cầu 2026-10-14: xác minh 10 job cũ `processing` local (`7340`, `7342`-`7350`) có claim cũ. Đã dùng transaction cập nhật có điều kiện đúng 10 job về `waiting`, xóa `claimed_at`/`executed_by`/lỗi cũ và giữ `attempts`. Worker PID `37340` tự nhận lại: `7340` đã `completed` với `attempts: 2`; `7342`-`7345` đang `processing`, `executed_by: local`; `7346`-`7350` còn `waiting` để nhận tiếp. Hai job mới `7381`, `7382` không bị thay đổi.

- Tái kiểm tra 2026-10-14: worker bản cài PID `39436` có heartbeat mới và Photoshop PID `34948` còn phản hồi, nhưng job `7415`/`7416` giữ `processing` nhiều giờ không có `output_urls`; thư mục tạm Photoshop gần nhất chỉ có `design-input.png` và `render-mockups.jsx`, không có PNG/marker hoàn tất. Worker source bổ sung đã claim lại hai job nhưng cũng không tiến triển, đồng thời không thể dừng worker bản cài do Windows trả `Access is denied`. Nguyên nhân gần nhất đã xác minh là Photoshop/JSX bị kẹt trước bước export; chưa xác minh được hộp thoại cụ thể. Cần đóng/khởi động lại Photoshop bằng quyền phù hợp rồi chạy lại hai job.

- Giải pháp v3 (2026-10-14, `main.js`): thêm MySQL named lock `offorest_photoshop_render_v1` trước khi gọi Photoshop và chỉ nhả khi render hoàn tất/lỗi. Lock áp dụng xuyên mọi process worker cùng database, vì vậy một Photoshop chỉ nhận một JSX tại một thời điểm; các job còn lại chờ lock thay vì cùng mở Smart Object. Đã dừng worker bản cài PID `37340` bằng quyền nâng cao, khởi động lại Photoshop và worker source có patch. Job `7415` hoàn tất với 6 PNG (`attempts: 3`); `7416` được claim lại và đang chờ/render tuần tự dưới lock. Cần phát hành bản app mới để worker bản cài cũng có lock này.

### [WRK-003] BAT báo không thấy worker hoặc không dừng được worker elevated — đã sửa launcher Desktop

- Phát hiện: 2026-10-08. Worker đã log `Background worker started` nhưng BAT báo không thấy PID; PowerShell thường không đọc được CommandLine hoặc dừng worker quyền Administrator.
- Giải pháp v1: dùng PID và heartbeat mới để xác nhận thay vì chỉ dựa vào CommandLine.
- Giải pháp v2: BAT xin quyền UAC, chuyển thao tác sang PowerShell chạy ẩn, log kết quả vào AppData. Cần thử double-click và xác nhận heartbeat sau mỗi thay đổi launcher; việc cửa sổ đóng nhanh không tự chứng minh worker chạy.

### [WRK-004] Ceramic bị worker/bản app cũ render bằng ag-psd — đang khắc phục

- Phát hiện: 2026-10-16; job ceramic `9035` hoàn tất trong khoảng ba giây, không có dấu hiệu Photoshop mở Smart Object.
- Nguyên nhân xác minh: bản cài `Offorest.exe` cũ và worker source khởi động trước khi có quy tắc ceramic cùng chạy, nên job được claim bởi tiến trình còn nạp renderer ag-psd. Không phải do định nghĩa ceramic trong source mới bị thiếu.
- Giải pháp v1: dừng đúng các tiến trình bản cài cũ, chỉ khởi động lại worker source mới; đưa các claim local dở dang về `waiting` có điều kiện để nhận lại. `main.js` cũng ghi `renderer` vào worker state khi job xong, để kiểm chứng không cần suy luận theo thời gian chạy.
- Kiểm chứng: chạy lại job ceramic sau khi worker mới khởi động và kiểm tra `lastResult.renderer = "photoshop"`; nếu Photoshop không render được thì job phải fail/retry, tuyệt đối không fallback ceramic về ag-psd.
- Rủi ro: một PSD có thể render nhanh nếu Photoshop đã mở sẵn; vì vậy trạng thái renderer là bằng chứng chính thay vì chỉ nhìn thời gian.
- Tái kiểm tra 2026-10-16: job `9035` (ceramic, asset `11886`) từng bị giữ `processing` cùng hai job glass cũ (`9059`, `9060`) bởi worker bản cài. Đã dừng worker trùng, đưa claim local cũ về `waiting`, khởi động lại worker source duy nhất. Job `9035` hoàn tất với 6 output; `lastResult.renderer = "photoshop"`. Nguyên nhân vận hành được xác minh là worker cũ/trùng, không phải ceramic gọi ag-psd trong source hiện tại.

### [WRK-005] Job waiting bị bỏ qua khi asset đã approved — đã sửa source

- Phát hiện: 2026-10-16; job `9155`, glass, asset `13727` giữ `waiting` trong khi worker rảnh.
- Nguyên nhân xác minh: truy vấn claim trong `main.js` yêu cầu `a.is_approved = 0`; asset này có `is_approved = 1`, nên job không bao giờ được claim dù có redesign hợp lệ.
- Giải pháp: bỏ điều kiện trạng thái duyệt khỏi claim; mọi job `waiting` hợp lệ có redesign sẽ được nhận. Trạng thái duyệt vẫn được giữ trong dữ liệu, không bị thay đổi.
- Kiểm chứng cần làm: restart worker source, xác nhận job `9155` chuyển `processing` rồi `completed` hoặc báo lỗi renderer rõ ràng.

### [WRK-006] MySQL deadlock làm job bị lỗi hoặc worker đứng — đã sửa source

- Phát hiện: 2026-10-17; job `9300` báo `Deadlock found when trying to get lock; try restarting transaction`, giao diện còn job waiting dù worker vẫn hoạt động.
- Nguyên nhân xác minh: nhiều tiến trình/luồng cùng cập nhật bảng job và asset; thao tác claim hoặc ghi kết quả có thể bị MySQL deadlock.
- Giải pháp: thêm nhận diện deadlock (`ER_LOCK_DEADLOCK`/1213) và retry tăng dần tối đa 4 lần cho claim, cập nhật asset, hoàn tất và đánh lỗi job. Không retry các lỗi khác.
- Kiểm chứng: build source, restart worker và theo dõi job mới; deadlock tạm thời phải tự retry thay vì đánh lỗi ngay.

### [PSD-004] Photoshop render chạy không có cửa sổ — đã sửa source

- Phát hiện: 2026-10-17; `Photoshop.exe -r render-mockups.jsx` còn sống nhưng không có `MainWindowHandle`, nên người vận hành không thấy Photoshop.
- Nguyên nhân xác minh: worker spawn Photoshop với `windowsHide: true`.
- Giải pháp: đổi worker sang khởi động Photoshop visible (`windowsHide: false`). Cơ chế trả focus vẫn giữ nguyên; Photoshop không bị thu nhỏ hoặc ẩn.
- Kiểm chứng cần làm: restart worker, nhận một job Photoshop và xác nhận cửa sổ Photoshop hiện trong lúc export.

### [PSD-005] Output MOCKUP bị đảo thứ tự — đã sửa source

- Phát hiện: 2026-10-17; một số PSD xuất ảnh có thứ tự `MOCKUP *` không ổn định.
- Nguyên nhân xác minh: output trước đây lấy trực tiếp tên group Photoshop rồi phụ thuộc việc đọc lại tên file; tên layer có thể trùng, có khoảng trắng hoặc không phản ánh thứ tự group sau khi sắp xếp.
- Giải pháp: sau khi sort group theo số, JSX luôn ghi output theo vị trí cố định `MOCKUP 1.png`, `MOCKUP 2.png`...; worker sort lại theo số trong tên trước khi ghi `output_urls` và `mockup1..mockup11`.
- Kiểm chứng cần làm: chạy một PSD có ít nhất 3 group và đối chiếu ảnh `MOCKUP 1/2/3` với group tương ứng.
- Bổ sung kiểm soát chính xác: JSX xuất theo đúng số trong tên group, kiểm tra group phải liên tục từ `MOCKUP 1`; worker cũng từ chối bộ file thiếu/trùng số thay vì tự gán sang vị trí khác.

## Photoshop và PSD

### [PSD-001] Invalid SVG image với ảnh PNG — đã xử lý một phần

- Phát hiện: 2026-09. `@napi-rs/canvas` đôi khi báo `Invalid SVG image` khi đọc PNG; không có nghĩa ảnh nguồn là SVG.
- Giải pháp v1: chuẩn hóa PNG qua `pngjs` khi gặp đúng lỗi decoder; renderer có retry, glass ưu tiên Photoshop. Một số job decal/glass đã hoàn tất sau fallback, chưa có bằng chứng bảo đảm mọi PSD/PNG đều chạy được.
- Nếu tái phát: ghi asset/job ID, renderer, loại file và log rút gọn, rồi bổ sung nguyên nhân xác minh.

### [PSD-002] Photoshop báo Edit Contents/Object expected — đang điều tra

- Triệu chứng: Photoshop script lỗi `Edit Contents is not currently available` hoặc `Object expected`; có trường hợp chạy lại thành công.
- Nguyên nhân chưa xác minh. Cần kiểm tra PSD, layer đang active, thời điểm script và trạng thái Photoshop trước khi kết luận. Không tự động quy lỗi cho ảnh đầu vào.

### [PSD-003] Photoshop không đủ chỗ dock Smart Object trên monitor — đang điều tra

- Phát hiện: 2026-10-13; Photoshop hiển thị `Could not open "Rectangle 3.psb" because there isn't enough room to dock it on this monitor` trong lúc worker source chạy; job gần nhất ghi lỗi `Object expected`.
- Triệu chứng và cách tái hiện: Photoshop đang mở workspace nhiều panel/monitor hoặc cửa sổ PSB bị buộc dock; thao tác mở Smart Object bằng `placedLayerEditContents` không hoàn tất.
- Bằng chứng: hộp thoại trong ảnh và log worker; tiến trình Photoshop vẫn còn sống. Đây là lỗi workspace/UI, chưa có bằng chứng file `Rectangle 3.psb` bị hỏng.
- Điểm code liên quan: `main.js` — `buildPhotoshopRenderJsx`, hàm JSX `replaceSmartObjectContent`, lệnh `placedLayerEditContents`; đây là điểm kích hoạt, chưa phải nguyên nhân đã kết luận.
- Giải pháp tạm thời: nhấn OK, đưa Photoshop về workspace mặc định, tắt bớt panel/đổi monitor chính, đóng các tab PSB đang nổi rồi chạy lại job. Không mở nhiều script Photoshop đồng thời trên cùng một phiên.
- Giải pháp v1 (2026-10-13, `main.js`): worker không ẩn hoặc minimize Photoshop. Trong lúc chờ marker hoàn tất, worker chỉ kiểm tra foreground theo chu kỳ; nếu Photoshop kịp giành foreground thì trả focus về cửa sổ trước đó. Photoshop vẫn hiển thị để người dùng thao tác. Đây là cơ chế best-effort, không chặn render nếu Windows từ chối thao tác cửa sổ.
- Kiểm chứng source: `node --check main.js` đạt; chưa có kiểm thử job glass thực tế trong phiên này.
- Rủi ro còn lại: hộp thoại modal hoặc lỗi dock Smart Object vẫn có thể cần người dùng xử lý; cơ chế focus không thay đổi cách Photoshop mở Smart Object và không làm Photoshop chạy song song.
- Kiểm chứng cần làm: mở cùng PSD thủ công, vào Window > Workspace > Reset, chạy một job glass đơn; ghi lại job ID và xem có tạo đủ PNG hay không. Nếu vẫn tái phát, cần thay script bằng cách mở Smart Object không phụ thuộc dock UI hoặc chạy Photoshop với workspace sạch.
- Trạng thái: đã sửa source; chưa phát hành bản cài.
## Ảnh đầu ra và thumbnail

### [IMG-001] Tạo thumbnail từ PNG đã export — đã sửa source, chưa test worker bản cài

- Phát hiện: 2026-10-12; yêu cầu ghi đè cùng tên khi chạy lại asset.
- Quy ước source hiện tại: PNG gốc `D:\BACKUP\generated\<slug>\mockups\<asset-id>\thumbnails\MOCKUP N.png`; thumbnail nhỏ `D:\BACKUP\thumbnails\generated\<slug>\mockups\<asset-id>\thumbnails\MOCKUP N.png`.
- Giải pháp v1: thumbnail PNG cạnh dài tối đa 480 px từ buffer đã render, `writeFile` ghi đè cùng tên. `output_urls` trỏ đến PNG gốc; lỗi thumbnail chỉ cảnh báo, không đánh lỗi job PNG.
- Kiểm chứng: resize một ảnh mockup thật 1254×1254 xuống 480×480 và kiểm tra cú pháp main.js. Chưa xác minh 6 cặp ảnh asset 1132 trên worker bản cài; v0.1.28 chưa chứa sửa đổi này.
- Rủi ro: nếu lần chạy sau ít ảnh hơn, file cũ có thể còn; chưa có yêu cầu xóa file nên không tự xóa.

## Cài đặt, build và kiểm thử

### [DEV-001] Lint toàn repo đang lỗi — chưa sửa

- Phát hiện: 2026-10-05/12. `npm run lint` lỗi nhiều chỗ có sẵn, gồm bundle sinh ra ở `app-dist` và globals Node trong `main.js`.
- Giải pháp tạm: báo rõ lint fail, kiểm tra cú pháp, build và test luồng mục tiêu riêng. Cần xử lý cấu hình lint/generated bundle trong task riêng, không coi build thành công là lint đạt.

### [DEV-002] Thiếu `.ai/logic-rules.md` — khoảng trống tài liệu

- Phát hiện: 2026-10-12. `AGENTS.md` yêu cầu đọc file này trước khi sửa code nhưng file không tồn tại. Các file context/coding/architecture còn tồn tại.
- Giải pháp tạm: báo thiếu và làm theo những quy tắc hiện có; cần bổ sung file logic-rules được dự án phê duyệt, không tự suy đoán nội dung.

### [WRK-003] Job local bị kẹt và job server dùng đường dẫn Linux — đã xác minh

- Phát hiện: 2026-10-14; các job `7417`, `7422`, `7423`, `7426`, `7428` ở trạng thái `processing` hoặc bị fallback server.
- Nguyên nhân xác minh: worker cũ giữ trạng thái `processing` quá lâu; job `7417` bị server xử lý với đường dẫn `/www/wwwroot/...` không tồn tại trên máy local. Hai job còn lại được đưa về `waiting` để worker local đã vá nhận lại.
- Kết quả: `7422`, `7423`, `7426`, `7428` hoàn tất bởi `local`, mỗi job có 6 output. `7417` vẫn `failed` do file nguồn không tồn tại tại `D:\DATA_BACKUP\generated\glass\bounds\3\12013\20261014191623-8a8c9a7a.png`.
- Giải pháp vận hành: chỉ reset có điều kiện job `processing` local bị kẹt; không reset job đang có marker/output mới. Kiểm tra file nguồn local trước khi retry để tránh vòng lặp lỗi.
- Rủi ro còn lại: cần đồng bộ lại file nguồn của `7417` hoặc tạo lại asset trước khi chạy lại; không tự đánh dấu completed khi thiếu ảnh đầu vào.
- Bổ sung UI (2026-10-15): nút `Reload job đứng im` trong trang Mockup chỉ đưa job `processing` có `executed_by = local` và `claimed_at` quá 15 phút về `waiting`, sau đó đánh thức worker nền. Có hộp xác nhận; job đang render trong thời gian bình thường và job server không bị thay đổi.
- Sự cố vận hành (2026-10-15): cấu hình `OFFOREST_LOCAL_MOCKUP_CONCURRENCY=5` khiến worker claim năm job cùng lúc dù Photoshop chỉ render tuần tự qua một khóa MySQL; UI hiển thị tất cả là `Đang làm`, và worker cũ có thể để job không cập nhật DB. Đã đặt worker local về `concurrency=1`, reset có điều kiện nhóm local đang kẹt và khởi động lại worker. Các job `7658`, `7659`, `7665` đều hoàn tất, mỗi job có 6 output.
- Fix watchdog (2026-10-15): local worker giữ heartbeat `claimed_at` mỗi 20 giây trong lúc render; recovery chỉ thu hồi job `processing` của local không có heartbeat quá 15 phút. Khi ghi kết quả cũng kiểm tra job vẫn thuộc local worker, tránh ghi nhầm sau khi bị thu hồi.
- Nguyên nhân gốc xác minh (2026-10-15): nhiều tiến trình worker từ bản `Offorest.exe` cài đặt cũ và source Electron cùng claim job. Đã dừng worker trùng, reset các claim local dở dang và chỉ để một worker nguồn chạy. Code bổ sung MySQL claim lock cùng điều kiện không claim khi đã có local job `processing`; vì vậy dù nhiều app/process được mở thì chỉ một job local được claim để Photoshop render, phần còn lại giữ `waiting` và tự được nhận sau đó.
- Điều chỉnh throughput (2026-10-15): worker tách slot theo renderer. Job `glass` và `ceramic` chạy Photoshop tối đa một job; các product khác dùng ag-psd tối đa mười job cùng lúc. Tổng cộng có tối đa 11 slot, nên một job Photoshop không chặn mười job ag-psd. Fallback `Invalid SVG` vẫn đi qua Photoshop global lock để không chạy script Photoshop đồng thời.
- Nút reload cưỡng bức (2026-10-15): `Reload job đứng im` giờ đưa ngay mọi job `processing` của local về `waiting`, không chờ 15 phút. Job cũ bị thu hồi không thể ghi trạng thái hoàn tất nhờ điều kiện `status = processing AND executed_by = local`; worker mới sẽ nhận lại job từ đầu.
