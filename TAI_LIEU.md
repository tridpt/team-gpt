# TeamGPT — Tài liệu đầy đủ (đọc từ số 0)

> Tài liệu này viết cho **mọi đối tượng**: từ người chưa biết lập trình, tới
> lập trình viên muốn hiểu sâu để bảo trì hoặc đi phỏng vấn. Các khái niệm nền
> tảng (API, cookie, session, streaming...) đều được giải thích lại từ đầu bằng
> ngôn ngữ đời thường kèm ví dụ. Bạn có thể đọc tuần tự, hoặc nhảy tới phần cần.

## Mục lục

1. [Giải thích siêu ngắn (cho người bận)](#1-giải-thích-siêu-ngắn-cho-người-bận)
2. [Những khái niệm nền tảng (nếu bạn chưa rành)](#2-những-khái-niệm-nền-tảng-nếu-bạn-chưa-rành)
3. [Dự án này giải quyết vấn đề gì?](#3-dự-án-này-giải-quyết-vấn-đề-gì)
4. [Bức tranh tổng thể (kiến trúc)](#4-bức-tranh-tổng-thể-kiến-trúc)
5. [Cài đặt & chạy thử — từng bước](#5-cài-đặt--chạy-thử--từng-bước)
6. [Đi một vòng: chuyện gì xảy ra khi bạn gửi 1 tin nhắn](#6-đi-một-vòng-chuyện-gì-xảy-ra-khi-bạn-gửi-1-tin-nhắn)
7. [Các tính năng, giải thích kỹ](#7-các-tính-năng-giải-thích-kỹ)
8. [Đọc code theo từng file](#8-đọc-code-theo-từng-file)
9. [Tham chiếu API (mọi endpoint)](#9-tham-chiếu-api-mọi-endpoint)
10. [Dữ liệu được lưu ở đâu, hình dạng ra sao](#10-dữ-liệu-được-lưu-ở-đâu-hình-dạng-ra-sao)
11. [Cấu hình (mọi biến môi trường)](#11-cấu-hình-mọi-biến-môi-trường)
12. [Bảo mật](#12-bảo-mật)
13. [Kiểm thử (testing)](#13-kiểm-thử-testing)
14. [Sự cố thường gặp (troubleshooting)](#14-sự-cố-thường-gặp-troubleshooting)
15. [Hạn chế & hướng phát triển](#15-hạn-chế--hướng-phát-triển)
16. [Bảng thuật ngữ](#16-bảng-thuật-ngữ)
17. [Câu hỏi tự luyện (ôn phỏng vấn)](#17-câu-hỏi-tự-luyện-ôn-phỏng-vấn)

---

## 1. Giải thích siêu ngắn (cho người bận)

**TeamGPT là một trang web chat AI riêng cho công ty/nhóm của bạn** — giống
ChatGPT, nhưng bạn tự cài trên máy chủ của mình.

- Mỗi thành viên có **tài khoản riêng** (email + mật khẩu).
- Ai cũng chat được với AI, và **lịch sử chat được lưu lại** theo từng người.
- Người quản trị (admin) có trang riêng để **thêm/xóa người dùng** và **đặt hạn
  mức** cho mỗi người (ví dụ: tối đa 200 câu hỏi/ngày, hoặc tối đa 1 đô/ngày).
- TeamGPT **không tự nói chuyện với OpenAI/Google/Anthropic**. Nó nói chuyện với
  một dịch vụ khác tên **llm-gateway** — nơi thật sự giữ "chìa khóa" (API key)
  để gọi AI. TeamGPT chỉ lo phần "con người": ai là ai, ai dùng bao nhiêu.

Hình dung đơn giản:

```
Bạn gõ câu hỏi trên web  →  TeamGPT (kiểm tra bạn là ai, còn hạn mức không)
                          →  llm-gateway (giữ chìa khóa, gọi AI thật)
                          →  AI trả lời  →  chữ hiện dần trên màn hình
```

Nếu bạn chỉ cần biết đến đây là đủ để "hiểu dự án làm gì". Phần sau đào sâu hơn.

---

## 2. Những khái niệm nền tảng (nếu bạn chưa rành)

Nếu bạn đã là lập trình viên, có thể bỏ qua mục này. Nếu chưa, đọc để các phần
sau dễ hiểu hơn.

**LLM (Large Language Model — mô hình ngôn ngữ lớn)**
Là "bộ não AI" biết đọc và viết văn bản, ví dụ GPT-4o, Gemini, Claude. Bạn đưa
nó một đoạn chữ (câu hỏi), nó trả về một đoạn chữ (câu trả lời). ChatGPT chính
là một giao diện chat đặt lên trên một LLM.

**API (Application Programming Interface)**
Là "cửa" để một phần mềm gọi một phần mềm khác. Thay vì con người bấm nút,
chương trình gửi một *yêu cầu* (request) và nhận về một *phản hồi* (response).
Ví dụ: "gửi câu hỏi này tới model gpt-4o-mini" là một lời gọi API.

**Server / Client**
- **Server** (máy chủ): chương trình chạy nền, chờ nhận yêu cầu và trả lời. Ở
  đây, TeamGPT là server (chạy bằng Node.js).
- **Client** (máy khách): bên gửi yêu cầu. Ở đây, **trình duyệt** của bạn là
  client.

**HTTP & endpoint**
HTTP là "ngôn ngữ" client và server dùng để nói chuyện qua mạng. Một *endpoint*
là một địa chỉ cụ thể trên server làm một việc cụ thể, ví dụ `POST /api/auth/login`
nghĩa là "gửi (POST) thông tin đăng nhập tới địa chỉ /api/auth/login".
- `GET` = lấy dữ liệu (đọc).
- `POST` = tạo/gửi dữ liệu mới.
- `PATCH` = sửa một phần.
- `DELETE` = xóa.

**JSON**
Là định dạng văn bản để trao đổi dữ liệu, dễ đọc cho cả người lẫn máy. Ví dụ:
```json
{ "email": "an@congty.com", "role": "member" }
```

**Cookie & Session (đăng nhập)**
- HTTP vốn "không nhớ gì" — mỗi yêu cầu là độc lập. Vậy làm sao server biết
  "bạn vừa đăng nhập rồi"? Câu trả lời: **session + cookie**.
- Khi bạn đăng nhập thành công, server tạo một **session** (một bản ghi "người
  này đã đăng nhập") và cấp cho bạn một **mã phiên** ngẫu nhiên khó đoán.
- Mã đó được lưu trong **cookie** — một mẩu dữ liệu nhỏ trình duyệt tự động gửi
  kèm mọi yêu cầu sau đó. Nhờ vậy server nhận ra bạn ở các lần gọi tiếp theo.
- Cookie ở đây là **httpOnly**: JavaScript trên trang không đọc được nó, giảm
  nguy cơ bị đánh cắp (chống tấn công XSS).

**Băm mật khẩu (password hashing)**
Server **không bao giờ lưu mật khẩu dạng chữ thật**. Nó lưu một "dấu vân tay"
một chiều của mật khẩu (gọi là *hash*). Từ hash không thể suy ngược ra mật khẩu.
Khi bạn đăng nhập, server băm mật khẩu bạn vừa nhập rồi so với hash đã lưu.
TeamGPT dùng thuật toán **scrypt** cho việc này.

**Streaming & SSE**
Khi ChatGPT trả lời, chữ hiện ra **từ từ** chứ không đợi xong cả bài. Đó là
*streaming*. TeamGPT dùng kỹ thuật **SSE (Server-Sent Events)**: server giữ kết
nối mở và đẩy từng mẩu chữ về trình duyệt ngay khi có.

**"Token" trong ngữ cảnh AI**
AI tính tiền theo **token** — đại khái là các mẩu nhỏ của từ (khoảng ~4 ký tự
tiếng Anh là 1 token). Câu hỏi dài + câu trả lời dài = nhiều token = tốn tiền
hơn. Vì thế mới có chuyện "đo token" và "đặt hạn mức chi phí".

**Node.js & Express**
- **Node.js**: nền tảng để chạy JavaScript ở phía server (không phải trong trình
  duyệt).
- **Express**: một thư viện giúp viết server web bằng Node dễ hơn (định nghĩa các
  endpoint, xử lý request...). Đây là thư viện phụ thuộc *duy nhất* của TeamGPT.

---

## 3. Dự án này giải quyết vấn đề gì?

**Bối cảnh.** Công ty muốn cả team dùng AI (như ChatGPT) trong công việc. Nhưng
dùng ChatGPT bản thương mại thì:
- Mỗi người một tài khoản, khó quản lý chi phí tập trung.
- Dữ liệu chat nằm trên máy chủ bên thứ ba.
- Khó đặt "hạn mức" riêng cho từng người.

**Giải pháp self-hosted.** Công ty tự dựng một hệ gồm 2 lớp:

1. **llm-gateway** (dự án anh em, thư mục `../llm-gateway`): giữ API key thật của
   các nhà cung cấp AI, lo phần "gọi model sao cho rẻ và ổn định" — cache, thử
   lại khi lỗi, chuyển provider dự phòng, đếm chi phí tổng.
2. **TeamGPT** (dự án này): đặt **lên trên** gateway, lo phần "con người" —
   ai được dùng, dùng bao nhiêu, lịch sử chat của họ, và giao diện web.

**Vì sao phải tách 2 lớp?**
- Gateway chỉ hiểu khái niệm "API key", **không hiểu "con người"**. Nó không biết
  ai đang chat, không lưu hội thoại, không có màn hình đăng nhập.
- Nếu nhét mọi thứ vào một chỗ, code sẽ rối và khó bảo trì.
- Tách ra: cả team dùng **chung một** chìa khóa gateway (dễ kiểm soát chi phí ở
  một nơi), nhưng vẫn **quy trách nhiệm tới từng người** ở lớp TeamGPT.

**TeamGPT thêm gì mà gateway không có?**

| Việc | Gateway | TeamGPT |
| --- | --- | --- |
| Gọi model AI (cache, fallback) | ✅ | ❌ (nhờ gateway làm) |
| Giữ API key nhà cung cấp | ✅ | ❌ (cố ý không giữ) |
| Tài khoản người dùng, đăng nhập | ❌ | ✅ |
| Lịch sử hội thoại theo người | ❌ | ✅ |
| Hạn mức (budget) theo **người** | ❌ (theo key) | ✅ |
| Giao diện chat + trang quản trị | (dashboard đơn giản) | ✅ (đầy đủ) |

---

## 4. Bức tranh tổng thể (kiến trúc)

```
┌──────────────┐   HTTP/SSE    ┌─────────────────────────┐   HTTP    ┌─────────────┐   ┌──────────┐
│  Trình duyệt │ ────────────▶ │        TeamGPT          │ ────────▶ │ llm-gateway │──▶│ OpenAI   │
│ (index.html, │ ◀──────────── │  (Node.js + Express)    │ ◀──────── │             │   │ Gemini   │
│  app.js)     │   chữ hiện    │                         │           │ (giữ key)   │   │ Anthropic│
└──────────────┘   dần dần     │  • auth (đăng nhập)     │           └─────────────┘   └──────────┘
                               │  • users (tài khoản)    │
                               │  • conversations (chat) │
                               │  • usage/budget (hạn mức)│
                               │  • lưu file JSON         │
                               └─────────────────────────┘
```

**Các vai trò trong TeamGPT:**

- **Routes** (`src/routes/`) = "người tiếp tân": nhận request HTTP, kiểm tra hợp
  lệ, gọi service phù hợp, trả kết quả.
- **Services** (`src/services/`) = "phòng ban chuyên môn": mỗi file lo một nghiệp
  vụ (người dùng, phiên, hội thoại, usage, chi phí, gọi gateway, mật khẩu).
- **Store** (`src/store/jsonStore.js`) = "kho lưu trữ": đọc/ghi file JSON an toàn.
- **Middleware** (`src/middleware/auth.js`) = "bảo vệ ở cửa": chặn trước mọi
  request cần đăng nhập, gắn thông tin user vào request.
- **Public** (`public/`) = phần chạy trong trình duyệt: HTML (khung), CSS (giao
  diện), JS (logic phía client).

**Nguyên tắc thiết kế xuyên suốt:** *tách bạch trách nhiệm* (mỗi file làm một
việc rõ ràng) và *tối giản phụ thuộc* (chỉ dùng Express + các thứ có sẵn trong
Node, không cần database).

---

## 5. Cài đặt & chạy thử — từng bước

### Bước 0: Cần gì trước?

- **Node.js phiên bản 20 trở lên**. Kiểm tra bằng lệnh: `node --version`.
  (Nếu chưa có, tải ở nodejs.org.)
- Một **llm-gateway đang chạy** (dự án `../llm-gateway`). Nếu chưa có, bạn vẫn
  bật TeamGPT lên xem giao diện được, nhưng khi chat sẽ báo lỗi "không gọi được
  gateway".

### Bước 1: Cài thư viện

Mở terminal, vào thư mục dự án và chạy:

```bash
npm install
```

Lệnh này tải các gói phụ thuộc (chủ yếu là Express) vào thư mục `node_modules/`.

### Bước 2: Tạo file cấu hình `.env`

Sao chép file mẫu rồi sửa:

```bash
cp .env.example .env
```

Mở `.env` và chỉnh ít nhất các dòng sau:

```bash
GATEWAY_URL=http://localhost:8080     # địa chỉ llm-gateway của bạn
GATEWAY_API_KEY=demo-key-123          # chìa khóa để TeamGPT gọi gateway
ADMIN_EMAIL=admin@congty.com          # tài khoản admin đầu tiên
ADMIN_PASSWORD=matkhau-that-manh      # ĐỔI mật khẩu này!
```

> **Quan trọng:** `ADMIN_EMAIL` và `ADMIN_PASSWORD` chỉ được dùng để tạo admin
> **lần đầu tiên** (khi hệ thống chưa có ai). Đổi mật khẩu mạnh **trước** khi
> chạy lần đầu.

### Bước 3: Chạy

```bash
npm start
```

Bạn sẽ thấy dòng chữ tương tự:

```
  Seed admin created: admin@congty.com
  TeamGPT      →  http://localhost:4000
  Gateway URL  →  http://localhost:8080
  Models       →  gpt-4o-mini, gemini-2.0-flash, mock-gpt
```

Mở trình duyệt vào **http://localhost:4000**, đăng nhập bằng email/mật khẩu admin
ở trên. Xong! Bạn đang ở màn hình chat.

### Chế độ phát triển (tự khởi động lại khi sửa code)

```bash
npm run dev
```

Dùng cờ `--watch` của Node: mỗi lần bạn lưu file `.js`, server tự chạy lại.

### Chạy test

```bash
npm test
```

(Chi tiết ở [mục 13](#13-kiểm-thử-testing).)

---

## 6. Đi một vòng: chuyện gì xảy ra khi bạn gửi 1 tin nhắn

Đây là phần "linh hồn" của dự án. Ta theo dõi một câu hỏi từ lúc bạn gõ Enter
tới lúc chữ hiện trên màn hình.

### Ở trình duyệt (`public/app.js`)

1. Bạn gõ câu hỏi vào ô nhập và nhấn Enter (hoặc nút Send).
2. Nếu chưa có hội thoại nào đang mở, app **tự tạo một hội thoại mới**.
3. App hiển thị ngay tin của bạn, và một bong bóng trống cho câu trả lời.
4. App gửi request `POST /api/conversations/:id/messages` với nội dung câu hỏi,
   rồi **đọc phản hồi dạng luồng (stream)**.

### Ở server (`src/routes/chat.js`)

5. **Bảo vệ ở cửa** (`requireAuth`): đọc cookie phiên → xác định bạn là ai. Nếu
   không hợp lệ → trả lỗi 401 (chưa đăng nhập).
6. **Kiểm tra hợp lệ**: nội dung có rỗng không? Hội thoại này có phải của bạn
   không? (Không được xem/chat vào hội thoại của người khác.)
7. **Kiểm tra hạn mức** (`usage.checkBudget`): hôm nay bạn đã dùng quá số câu hỏi
   hoặc quá chi phí cho phép chưa? Nếu quá → trả lỗi **429** kèm lý do, dừng ở
   đây.
8. **Lưu tin của bạn** vào hội thoại (`conversations.addMessage`). Nếu đây là câu
   đầu tiên, tiêu đề hội thoại được đặt tự động từ nội dung câu hỏi.
9. **Lấy ngữ cảnh**: gom **20 tin gần nhất** của hội thoại để gửi lên AI (để AI
   "nhớ" mạch trò chuyện). Không gửi hết toàn bộ lịch sử — để tiết kiệm token.
10. **Mở luồng SSE** về trình duyệt (đặt header `text/event-stream`).
11. **Gọi gateway** (`gateway.chatStream`): gửi ngữ cảnh + model lên llm-gateway,
    yêu cầu trả về dạng stream.
12. Mỗi khi gateway trả về một mẩu chữ (delta), server **đẩy ngay** xuống trình
    duyệt: `data: {"type":"delta","text":"..."}`.
13. Nếu bạn **đóng tab giữa chừng**, server phát hiện (`req.on('close')`) và
    **hủy** request tới gateway (`AbortController`) — không phí token cho câu trả
    lời không ai đọc.

### Kết thúc luồng (vẫn ở `chat.js`)

14. Khi AI trả lời xong, server **lưu câu trả lời** vào hội thoại.
15. Server **ước lượng token** đã dùng (vì stream không trả con số chính xác) và
    quy ra **chi phí USD** theo bảng giá (`cost.js`), rồi **ghi vào usage**
    (`usage.record`) để tính hạn mức cho lần sau.
16. Server gửi frame cuối: `data: {"type":"done","costUsd":...}` rồi `data: [DONE]`.

### Trình duyệt nhận và hiển thị

17. `app.js` đọc từng frame, nối các mẩu `delta` lại và cập nhật bong bóng chat
    → bạn thấy chữ **hiện dần**.
18. Khi nhận `done`, app cập nhật thanh hạn mức ở góc và làm mới danh sách hội
    thoại (để cập nhật tiêu đề mới).

Sơ đồ gọn:

```
app.js ──POST──▶ chat.js
                   │  requireAuth (bạn là ai?)
                   │  checkBudget (còn hạn mức?)
                   │  addMessage  (lưu câu hỏi)
                   │  contextMessages (lấy 20 tin gần nhất)
                   ├──stream──▶ gateway.js ──▶ llm-gateway ──▶ AI
                   │◀─ delta ── delta ── delta ...
   delta ◀────────┤  (đẩy về trình duyệt ngay)
                   │  addMessage (lưu câu trả lời)
                   │  record     (ghi usage/chi phí)
   done  ◀─────────┘
```

---

## 7. Các tính năng, giải thích kỹ

### 7.1. Đăng nhập & phiên (session)

**Làm gì:** Cho phép người dùng đăng nhập bằng email + mật khẩu, và "nhớ" họ ở
các request sau.

**Hoạt động ra sao:**
- Khi đăng nhập đúng, server tạo một **session** (bản ghi `{ userId, expiresAt }`)
  và một **mã phiên** ngẫu nhiên 256-bit (`crypto.randomBytes(32)`).
- Mã phiên được đặt vào cookie tên `tg_session`, thuộc tính **httpOnly** (JS
  không đọc được), **SameSite=Lax** (giảm nguy cơ tấn công CSRF), có hạn dùng.
- Các request sau, trình duyệt tự gửi kèm cookie → server tra session → biết bạn
  là ai.
- Session hết hạn được **dọn lười**: chỉ dọn khi có ai đó truy cập hoặc khi tạo
  session mới (không cần chạy job nền).

**Vì sao dùng session server-side thay vì JWT?**
JWT là "vé thông hành" tự chứa thông tin, server không lưu gì. Nhược điểm: khó
**thu hồi** trước khi hết hạn. Với session server-side, khi admin **vô hiệu hóa
hoặc xóa** một user, ta xóa hết session của họ → họ bị đăng xuất **ngay lập tức**.

### 7.2. Mật khẩu an toàn (`password.js`)

- Không lưu mật khẩu thật. Lưu chuỗi dạng `scrypt$N$salt$hash`.
- **scrypt** là thuật toán băm cố tình *chậm và tốn bộ nhớ* → kẻ tấn công có lấy
  được file cũng rất khó dò mật khẩu bằng cách thử hàng loạt.
- Mỗi mật khẩu có **salt** (chuỗi ngẫu nhiên) riêng → hai người đặt mật khẩu
  giống nhau vẫn ra hash khác nhau, chống tấn công "rainbow table".
- Khi so sánh dùng `crypto.timingSafeEqual` — **so sánh thời gian hằng số** để
  không rò rỉ manh mối qua thời gian phản hồi.

### 7.3. Vai trò: admin vs member

- **member**: chat, quản lý hội thoại của chính mình.
- **admin**: mọi quyền của member + trang quản trị (thêm/sửa/xóa user, đặt hạn
  mức, xem usage, xem metrics gateway).
- Middleware `requireAdmin` chặn người không phải admin khỏi các endpoint `/api/admin/*`.

**Hai "chốt an toàn":**
- Không cho hạ quyền/vô hiệu hóa **admin hoạt động cuối cùng** (tránh lỡ tay
  khóa mình ra khỏi hệ thống — *lockout*).
- Admin **không được tự xóa** tài khoản của chính mình.

### 7.4. Hội thoại & lịch sử (`conversations.js`)

- Mỗi hội thoại thuộc về đúng một user; người khác không truy cập được (kiểm tra
  `c.userId === userId` ở mọi thao tác).
- **Tiêu đề tự động**: câu hỏi đầu tiên của user được rút gọn (≤60 ký tự) làm
  tiêu đề. Câu sau không ghi đè tiêu đề nữa.
- **Cắt ngữ cảnh** (`contextMessages`): chỉ gửi **20 tin gần nhất** lên AI. Vì
  sao? Để giới hạn token (giảm chi phí + tránh vượt "cửa sổ ngữ cảnh" của model).
  Tin gần đây mang nhiều thông tin liên quan nhất. Đây là chiến lược *sliding
  window*.

### 7.5. Hạn mức theo người (budget) — `usage.js` + `cost.js`

**Mục tiêu:** mỗi người có trần **số request/ngày** và **chi phí USD/ngày**.

**Cách tính usage theo "bucket ngày UTC":**
- Usage được gom theo chuỗi ngày `YYYY-MM-DD` (giờ UTC).
- Sang ngày mới → khóa bucket đổi → tự động đếm lại từ 0. **Không cần cron job**
  để reset.
- Giữ thêm: lịch sử **30 ngày** (cho biểu đồ/dashboard) và **tổng tích lũy**.

**Chặn thế nào:** trước mỗi tin nhắn, `checkBudget` so usage hôm nay với hạn mức.
Vượt → HTTP **429** kèm lý do. `null` nghĩa là **không giới hạn**.

**"Soft cap":** request đang chạy vẫn được hoàn tất dù làm vượt ngưỡng; chỉ
request **kế tiếp** bị chặn. Đơn giản, không cần "đặt trước" token.

**Vì sao TeamGPT phải tự ước lượng chi phí dù gateway đã tính?**
Vì luồng chat là **streaming**, và SSE của gateway **không kèm số token**. Để
chặn hạn mức theo thời gian thực, TeamGPT tự ước lượng: đếm ký tự chia ~4 ra
token (`estimateTokens`), rồi nhân bảng giá theo model (`computeCost`). Đây là
**con số gần đúng** phục vụ công bằng nội bộ; gateway vẫn là nguồn sự thật cho
chi phí provider thật.

**Hạn mức riêng từng người:** admin có thể đặt override cho mỗi user; nếu để
trống thì dùng mặc định (`DEFAULT_DAILY_REQUESTS`, `DEFAULT_DAILY_COST_USD`).
Hàm `effectiveBudget` lo việc "override → mặc định".

### 7.6. Streaming trả lời (SSE)

**SSE (Server-Sent Events)** là kỹ thuật để server đẩy dữ liệu về client qua một
kết nối HTTP mở sẵn, một chiều. Mỗi "frame" có dạng `data: <nội dung>\n\n`.

TeamGPT phát các frame:
```
data: {"type":"delta","text":"Xin"}
data: {"type":"delta","text":" chào"}
data: {"type":"done","conversationId":"...","usage":{...},"costUsd":0.0001}
data: [DONE]
```

**Vì sao phải tự gom buffer rồi tách theo `\n\n`?** Vì dữ liệu về theo *khối byte
tùy ý*, không trùng ranh giới frame. Một frame có thể bị cắt đôi giữa 2 khối,
hoặc một khối chứa nhiều frame. Cả server (`gateway.js`) lẫn client (`app.js`)
đều gom vào một chuỗi đệm rồi cắt theo dấu phân cách `\n\n`.

**Xử lý lỗi tùy thời điểm:**
- Lỗi *trước khi* gửi header → trả JSON lỗi kèm mã status bình thường.
- Lỗi *sau khi* đã bắt đầu stream → chỉ còn cách gửi frame `{"type":"error"}` rồi
  đóng, vì mã status đã trót gửi đi rồi (không sửa lại được).

### 7.7. Trang quản trị (`admin.html` + `admin.js`)

- Bảng liệt kê mọi user kèm: vai trò, usage hôm nay, tổng tích lũy, hạn mức,
  trạng thái (active/disabled).
- Nút tạo user mới, sửa (đổi tên/vai trò/mật khẩu/hạn mức/disable), xóa.
- Các ô thống kê tổng hợp lấy từ gateway (`/api/admin/gateway-metrics` — proxy
  sang `/admin/metrics` của gateway).

### 7.8. Kho lưu trữ JSON (`jsonStore.js`)

- Mỗi nghiệp vụ có **một file JSON** dưới thư mục `DATA_DIR`.
- **Ghi atomic:** ghi ra file tạm `.tmp` rồi **đổi tên** (`rename`) đè lên file
  thật. Thao tác rename ở mức hệ điều hành là "tất cả hoặc không gì" → crash giữa
  chừng cũng **không làm hỏng** file dữ liệu.
- Dữ liệu được nạp vào bộ nhớ (cache) khi khởi động; mọi thay đổi ghi lại xuống
  đĩa. Nhờ vậy không cần database.

---

## 8. Đọc code theo từng file

Phần này giúp bạn "mở từng file ra và biết nó làm gì".

### `src/index.js` — điểm khởi động

Ráp ứng dụng Express: gắn các route (`/api/auth`, `/api/...`, `/api/admin`), phục
vụ file tĩnh trong `public/`, và có endpoint `/health` để kiểm tra server sống.
Khi chạy trực tiếp (không phải khi import để test), nó tạo seed admin rồi lắng
nghe trên `PORT`.

> Mẹo: hàm `createApp()` được **export** riêng để test có thể tạo app mà không tự
> khởi động server — rất tiện cho test tích hợp.

### `src/config.js` — cấu hình

Tự đọc file `.env` (không dùng thư viện ngoài): mỗi dòng `KEY=value`, bỏ qua dòng
trống và dòng `#` chú thích, chỉ đặt biến nếu chưa có sẵn (biến môi trường thật
luôn thắng). Sau đó xuất ra object `config` gọn gàng, ép kiểu số/chuỗi/danh sách
và xử lý "không giới hạn = null".

### `src/store/jsonStore.js` — kho JSON

Lớp `JsonStore`: `_load()` nạp file (hỏng thì trả mặc định thay vì crash),
`flush()` ghi atomic, `update(fn)` cho phép sửa dữ liệu qua callback rồi tự ghi.

### `src/services/password.js` — mật khẩu

`hashPassword` (băm scrypt + salt) và `verifyPassword` (so sánh thời gian hằng
số). Không phụ thuộc thư viện ngoài.

### `src/services/users.js` — người dùng

Tạo/tìm/sửa/xóa user, xác thực đăng nhập, tính hạn mức hiệu lực
(`effectiveBudget`), và tạo **seed admin** lần đầu (`ensureSeedAdmin`). Hàm
`publicUser` luôn **loại bỏ `passwordHash`** trước khi trả ra ngoài — chi tiết
nhỏ nhưng quan trọng để không lỡ lộ hash.

### `src/services/sessions.js` — phiên đăng nhập

Tạo/tra/hủy session, dọn session hết hạn (`prune`), và `destroyUserSessions` để
đá văng toàn bộ phiên của một user (khi bị disable/xóa/đổi mật khẩu).

### `src/services/conversations.js` — hội thoại

Tạo hội thoại, thêm tin nhắn (kèm tự đặt tiêu đề), liệt kê theo user, lấy ngữ
cảnh 20 tin gần nhất, đổi tên, xóa. Mọi hàm đều kiểm tra quyền sở hữu.

### `src/services/usage.js` — usage & hạn mức

Ghi usage theo bucket ngày UTC + lịch sử 30 ngày + tổng tích lũy; `checkBudget`
quyết định cho phép hay chặn; các hàm đọc usage cho dashboard.

### `src/services/cost.js` — ước lượng token & chi phí

Bảng giá `PRICING` (USD trên 1 triệu token) theo model, `estimateTokens` (~4
ký tự/token), `computeCost`. Model lạ thì khớp theo tiền tố, không khớp thì dùng
giá mặc định.

### `src/services/gateway.js` — client gọi gateway

`chat` (không stream) và `chatStream` (stream, gọi callback `onDelta` cho mỗi
mẩu chữ). Bọc lỗi mạng thành `GatewayError` với mã status rõ ràng. Tự phân tích
luồng SSE trả về từ gateway.

### `src/middleware/auth.js` — bảo vệ ở cửa

`parseCookies` (đọc header cookie), `loadUser` (cookie → session → user, loại bỏ
user bị disable), `requireAuth` và `requireAdmin` để chặn route.

### `src/routes/*.js` — các endpoint

- `auth.js`: login/logout/me + đặt cookie phiên.
- `conversations.js`: CRUD hội thoại (tất cả yêu cầu đăng nhập).
- `chat.js`: gửi tin + stream trả lời (phần được giải thích ở [mục 6](#6-đi-một-vòng-chuyện-gì-xảy-ra-khi-bạn-gửi-1-tin-nhắn)).
- `admin.js`: quản lý user + proxy metrics gateway.

### `public/` — phía trình duyệt

- `index.html`: khung 2 màn hình — đăng nhập và app chat.
- `app.js`: toàn bộ logic client — đăng nhập, danh sách hội thoại, gửi tin, đọc
  stream, vẽ thanh hạn mức.
- `admin.html` + `admin.js`: dashboard quản trị.
- `style.css`: giao diện dùng chung (tối giản, tông tối).

---

## 9. Tham chiếu API (mọi endpoint)

Xác thực bằng cookie `tg_session` (được đặt khi đăng nhập). Thân request/response
đều là JSON, trừ endpoint chat trả về **luồng SSE**.

### Công khai

| Method | Path | Mô tả |
| --- | --- | --- |
| `GET` | `/health` | Kiểm tra server sống: `{ status, uptimeSeconds }`. |

### Xác thực — `/api/auth`

| Method | Path | Thân gửi | Trả về |
| --- | --- | --- | --- |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ user }` + đặt cookie phiên. `401` nếu sai. `429` nếu bị khóa do sai nhiều lần. |
| `POST` | `/api/auth/logout` | — | `{ ok: true }` + xóa cookie. |
| `POST` | `/api/auth/change-password` | `{ currentPassword, newPassword }` | `{ ok: true }` — tự đổi mật khẩu; hủy phiên ở thiết bị khác. |
| `GET` | `/api/auth/me` | — | `{ user, budget, config }`. `401` nếu chưa đăng nhập. |

### Hội thoại — `/api` (cần đăng nhập)

| Method | Path | Thân gửi | Trả về |
| --- | --- | --- | --- |
| `GET` | `/api/conversations` | — | `{ conversations, usage, limits }` |
| `POST` | `/api/conversations` | `{ model, title }` | Hội thoại vừa tạo (`201`). Model lạ → về mặc định. |
| `GET` | `/api/conversations/:id` | — | Hội thoại đầy đủ (kèm messages). `404` nếu không phải của bạn. |
| `PATCH` | `/api/conversations/:id` | `{ title }` | Hội thoại đã đổi tên. |
| `DELETE` | `/api/conversations/:id` | — | `{ ok: true }` |
| `POST` | `/api/conversations/:id/messages` | `{ content }` | **Luồng SSE** (xem dưới). `429` nếu vượt hạn mức. |

**Luồng SSE của endpoint gửi tin:**
```
data: {"type":"delta","text":"..."}                                   (lặp lại)
data: {"type":"done","conversationId":"...","usage":{...},"costUsd":0.0}
data: [DONE]
```
Nếu lỗi sau khi stream đã bắt đầu: `data: {"type":"error","error":"..."}`.

### Quản trị — `/api/admin` (cần vai trò admin)

| Method | Path | Thân gửi | Trả về |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | — | `{ users, defaultBudget }` (kèm limits + usage mỗi user) |
| `POST` | `/api/admin/users` | `{ email, name, password, role, budget }` | User vừa tạo (`201`). `400` nếu dữ liệu sai. |
| `GET` | `/api/admin/users/:id` | — | `{ user, limits, usage }` |
| `PATCH` | `/api/admin/users/:id` | `{ name?, role?, password?, disabled?, budget? }` | User đã cập nhật. |
| `DELETE` | `/api/admin/users/:id` | — | `{ ok: true }` + xóa hội thoại/usage/phiên của họ. |
| `GET` | `/api/admin/gateway-metrics` | — | Metrics tổng hợp lấy từ gateway. |

**Các chốt chặn:** không hạ quyền/vô hiệu hóa admin cuối cùng (`400`); admin
không tự xóa mình (`400`).

**Ví dụ dùng bằng `curl`:**
```bash
# Đăng nhập, lưu cookie vào file
curl -c cookies.txt -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@congty.com","password":"matkhau-that-manh"}'

# Tạo hội thoại (dùng lại cookie)
curl -b cookies.txt -X POST http://localhost:4000/api/conversations \
  -H "Content-Type: application/json" -d '{"model":"mock-gpt"}'
```

---

## 10. Dữ liệu được lưu ở đâu, hình dạng ra sao

Tất cả nằm dưới thư mục `DATA_DIR` (mặc định `./data`), mỗi nghiệp vụ một file.

**`users.json`**
```json
{
  "users": [
    {
      "id": "uuid",
      "email": "an@congty.com",
      "name": "An",
      "role": "member",
      "passwordHash": "scrypt$16384$<salt>$<hash>",
      "budget": { "dailyRequests": 200, "dailyCostUsd": 1.0 },
      "disabled": false,
      "createdAt": "2026-07-02T00:00:00.000Z"
    }
  ]
}
```

**`sessions.json`**
```json
{ "sessions": { "<token>": { "userId": "uuid", "expiresAt": 1750000000000 } } }
```

**`conversations.json`**
```json
{
  "conversations": {
    "<id>": {
      "id": "uuid", "userId": "uuid", "title": "Câu hỏi đầu tiên...",
      "model": "gpt-4o-mini",
      "messages": [{ "role": "user", "content": "...", "ts": "..." }],
      "createdAt": "...", "updatedAt": "..."
    }
  }
}
```

**`usage.json`**
```json
{
  "users": {
    "<userId>": {
      "today": { "date": "2026-07-02", "requests": 3, "inputTokens": 120, "outputTokens": 80, "costUsd": 0.0007 },
      "history": [ { "date": "2026-07-01", "requests": 10, "...": "..." } ],
      "totals": { "requests": 42, "inputTokens": 5000, "outputTokens": 3000, "costUsd": 0.05 }
    }
  }
}
```

> **Sao lưu:** copy nguyên thư mục `DATA_DIR` là sao lưu toàn bộ TeamGPT.
> **Thư mục này bị `.gitignore` loại khỏi git** (không đưa dữ liệu người dùng lên
> kho mã nguồn).

---

## 11. Cấu hình (mọi biến môi trường)

Đặt trong file `.env` (hoặc biến môi trường thật — biến thật luôn được ưu tiên).

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `4000` | Cổng HTTP server lắng nghe. |
| `DATA_DIR` | `./data` | Thư mục chứa các file JSON dữ liệu. |
| `SESSION_TTL_HOURS` | `168` | Phiên đăng nhập sống bao lâu (giờ). 168 = 7 ngày. |
| `COOKIE_SECURE` | `false` | Chỉ gửi cookie phiên qua HTTPS (bật ở production). |
| `LOGIN_MAX_ATTEMPTS` | `5` | Số lần đăng nhập sai (theo IP+email) trước khi bị khóa tạm. |
| `LOGIN_WINDOW_MINUTES` | `15` | Cửa sổ thời gian đếm số lần sai (phút). |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Bị khóa bao lâu sau khi chạm giới hạn (phút). |
| `GATEWAY_URL` | `http://localhost:8080` | Địa chỉ llm-gateway. |
| `GATEWAY_API_KEY` | — | Chìa khóa TeamGPT dùng để gọi gateway. |
| `DEFAULT_MODEL` | `gpt-4o-mini` | Model chọn sẵn trong giao diện. |
| `AVAILABLE_MODELS` | `gpt-4o-mini,mock-gpt` | Danh sách model người dùng được chọn (phân tách bằng dấu phẩy). |
| `ADMIN_EMAIL` | `admin@example.com` | Email admin khởi tạo (chỉ dùng lần đầu). |
| `ADMIN_PASSWORD` | `change-me-now` | Mật khẩu admin khởi tạo (chỉ dùng lần đầu). |
| `DEFAULT_DAILY_REQUESTS` | — | Trần số request/ngày mặc định (để trống = không giới hạn). |
| `DEFAULT_DAILY_COST_USD` | — | Trần chi phí USD/ngày mặc định (để trống = không giới hạn). |

**Lưu ý về "model":** tên model bạn liệt kê ở `AVAILABLE_MODELS` phải là tên mà
**gateway hiểu được**. `mock-gpt` là model giả (trả lời mẫu, chi phí $0) rất tiện
để thử nghiệm khi chưa cắm provider thật.

---

## 12. Bảo mật

- **Đổi `ADMIN_PASSWORD`** thành giá trị mạnh **trước lần chạy đầu**. Seed admin
  chỉ được tạo khi hệ thống chưa có user nào.
- Mật khẩu băm bằng **scrypt + salt**; so sánh thời gian hằng số.
- Mã phiên là token ngẫu nhiên 256-bit, gửi qua cookie **httpOnly + SameSite=Lax**.
- **Chạy sau HTTPS** khi lên production — nếu không, cookie phiên đi qua mạng
  dạng không mã hóa và có thể bị nghe lén. Đặt `COOKIE_SECURE=true` để cookie có
  cờ `Secure`. (Bản thân TeamGPT chạy HTTP; hãy đặt một reverse proxy như
  Nginx/Caddy phía trước để bọc TLS.)
- **Chống dò mật khẩu (brute-force):** endpoint đăng nhập bị giới hạn theo
  IP+email — sai quá `LOGIN_MAX_ATTEMPTS` lần thì khóa key đó trong
  `LOGIN_LOCKOUT_MINUTES` phút (trả HTTP 429 kèm `Retry-After`).
- **Tự đổi mật khẩu:** member đổi mật khẩu qua `POST /api/auth/change-password`;
  thao tác này hủy mọi phiên ở thiết bị khác (chỉ giữ phiên hiện tại).
- `GATEWAY_API_KEY` là bí mật — giữ file `.env` **ngoài git** (đã có sẵn trong
  `.gitignore`).
- Vô hiệu hóa / xóa user → **hủy toàn bộ phiên** của họ ngay lập tức.
- Người dùng chỉ truy cập được hội thoại **của chính mình** (kiểm tra quyền sở
  hữu ở mọi thao tác).

> **Cảnh báo triển khai:** TeamGPT hiện phục vụ HTTP thuần, không tự bọc TLS và
> không có chống CSRF token riêng (chỉ dựa vào SameSite=Lax). Với mạng nội bộ
> team nhỏ là chấp nhận được; nếu mở ra Internet công cộng, hãy đặt sau reverse
> proxy có HTTPS và cân nhắc bổ sung các lớp bảo vệ.

---

## 13. Kiểm thử (testing)

Chạy toàn bộ test:

```bash
npm test
```

**Công cụ:** dùng **test runner có sẵn của Node** (`node --test`), không cần cài
framework test bên ngoài.

**Cách ly dữ liệu:** file `test/setup.js` được **nạp trước** mỗi file test (qua
cờ `--import`). Nó trỏ `DATA_DIR` vào một **thư mục tạm riêng cho từng tiến
trình** và đặt cấu hình cố định. Nhờ vậy test **không bao giờ đụng vào `data/`
thật** và **không cần gateway đang chạy**.

**Các bộ test:**
- `password.test.js` — băm/verify, salt ngẫu nhiên, từ chối định dạng sai.
- `cost.test.js` — ước lượng token, bảng giá, khớp tiền tố model, giá mặc định.
- `usage.test.js` — ghi usage, chặn theo request/chi phí, "không giới hạn".
- `users.test.js` — validate email/mật khẩu, chống trùng email, đăng nhập, user
  bị disable, đổi mật khẩu, hạn mức override.
- `conversations.test.js` — quyền sở hữu, tự đặt tiêu đề, cắt ngữ cảnh 20 tin.
- `app.test.js` — **test tích hợp**: khởi động app Express thật trên cổng ngẫu
  nhiên rồi gọi qua HTTP (đăng nhập, CRUD hội thoại, quản trị user, các chốt an
  toàn admin).

**Vì sao test được luồng chat mà không cần gateway thật?** Các test tập trung
vào phần logic nội bộ (auth, budget, hội thoại). Phần gọi gateway được tách riêng
trong `gateway.js`, nên không cần mạng để kiểm thử các nghiệp vụ còn lại.

---

## 14. Sự cố thường gặp (troubleshooting)

**Mở web lên nhưng trắng trang / không đăng nhập được.**
Kiểm tra server có đang chạy không (`npm start`) và console có báo lỗi không. Mở
DevTools của trình duyệt (tab Console/Network) xem request `/api/auth/me` trả gì.

**Đăng nhập báo "Invalid email or password".**
- Nhớ rằng `ADMIN_EMAIL`/`ADMIN_PASSWORD` chỉ tạo admin **lần đầu** (khi chưa có
  user nào). Nếu bạn đổi mật khẩu trong `.env` **sau khi** đã chạy lần đầu, nó
  **không** đổi mật khẩu admin cũ.
- Cách xử lý khi quên: dừng server, xóa (hoặc sao lưu rồi xóa) file
  `data/users.json` để hệ thống tạo lại seed admin từ `.env`. **Lưu ý: cách này
  xóa toàn bộ user hiện có** — chỉ dùng khi đang thử nghiệm.

**Chat báo "Cannot reach gateway".**
llm-gateway chưa chạy hoặc `GATEWAY_URL` sai. Kiểm tra gateway sống chưa và địa
chỉ có đúng không.

**Chat báo "Gateway returned 401".**
`GATEWAY_API_KEY` trong `.env` không khớp với key mà gateway chấp nhận.

**Bị 429 khi chat.**
Bạn (hoặc user đó) đã chạm hạn mức trong ngày. Admin có thể tăng hạn mức trong
trang quản trị, hoặc chờ sang ngày mới (reset lúc nửa đêm UTC).

**Sửa `.env` mà không thấy thay đổi.**
Cần **khởi động lại** server (hoặc dùng `npm run dev` để tự nạp lại).

---

## 15. Hạn chế & hướng phát triển

**Hạn chế hiện tại (cố ý, để giữ đơn giản):**
- Lưu bằng file JSON → hợp team nhỏ, **không chịu tải cao** và **không chạy nhiều
  instance** cùng lúc (các instance sẽ ghi đè lẫn nhau).
- Chi phí là **ước lượng** (không phải số thật từ provider).
- Câu trả lời hiển thị dạng văn bản thuần (chưa render Markdown/code block đẹp).

**Hướng phát triển tiếp:**
- Chuyển sang **DB thật** (SQLite/Postgres) để chịu tải và chạy nhiều instance.
- Lấy **usage thật** từ gateway thay vì ước lượng token.
- Render **Markdown** cho câu trả lời; hỗ trợ đính kèm file/hình.
- **Nhóm/phòng ban** và hạn mức theo nhóm.
- Cho phép đổi model **giữa chừng** hội thoại.
- Đóng gói **Docker + docker-compose** (kèm cả gateway) để triển khai một phát.

---

## 16. Bảng thuật ngữ

| Thuật ngữ | Giải thích ngắn gọn |
| --- | --- |
| **LLM** | Mô hình ngôn ngữ lớn — "bộ não AI" đọc/viết văn bản (GPT-4o, Gemini, Claude...). |
| **Gateway** | Dịch vụ trung gian giữ API key và lo việc gọi model (dự án `llm-gateway`). |
| **Provider** | Nhà cung cấp LLM: OpenAI, Google (Gemini), Anthropic (Claude). |
| **API** | "Cửa" để phần mềm gọi phần mềm khác qua request/response. |
| **Endpoint** | Một địa chỉ cụ thể trên server làm một việc cụ thể (vd `/api/auth/login`). |
| **HTTP** | Giao thức để client và server nói chuyện qua mạng. |
| **JSON** | Định dạng văn bản để trao đổi dữ liệu, dễ đọc cho người và máy. |
| **Client / Server** | Bên gửi yêu cầu (trình duyệt) / bên nhận và trả lời (TeamGPT). |
| **Session (phiên)** | Bản ghi phía server cho biết "người này đã đăng nhập". |
| **Cookie** | Mẩu dữ liệu nhỏ trình duyệt tự gửi kèm mỗi request; ở đây chứa mã phiên. |
| **httpOnly** | Cookie mà JavaScript trang không đọc được → chống đánh cắp qua XSS. |
| **SameSite=Lax** | Thuộc tính cookie giúp giảm nguy cơ tấn công CSRF. |
| **Hash (băm)** | "Dấu vân tay" một chiều của dữ liệu; không suy ngược ra bản gốc. |
| **scrypt** | Thuật toán băm mật khẩu, cố tình chậm để chống dò tìm hàng loạt. |
| **Salt** | Chuỗi ngẫu nhiên trộn vào mật khẩu trước khi băm; chống rainbow table. |
| **Token (AI)** | Đơn vị chia nhỏ văn bản để tính tiền (~4 ký tự tiếng Anh ≈ 1 token). |
| **Streaming** | Trả kết quả từ từ thay vì đợi xong toàn bộ. |
| **SSE** | Server-Sent Events — kỹ thuật server đẩy dữ liệu về client qua HTTP mở sẵn. |
| **Budget / Quota** | Hạn mức sử dụng (số request và/hoặc chi phí) trong một khoảng thời gian. |
| **UTC** | Múi giờ chuẩn quốc tế; usage reset theo nửa đêm UTC. |
| **Middleware** | Đoạn xử lý chạy "ở giữa", trước khi request tới handler chính (vd kiểm tra đăng nhập). |
| **Node.js** | Nền tảng chạy JavaScript phía server. |
| **Express** | Thư viện viết server web bằng Node; phụ thuộc duy nhất của TeamGPT. |
| **Atomic write** | Ghi file kiểu "tất cả hoặc không gì" (ghi tạm rồi đổi tên) để không hỏng dữ liệu. |
| **Seed admin** | Tài khoản admin được tạo tự động ở lần chạy đầu tiên. |

---

## 17. Câu hỏi tự luyện (ôn phỏng vấn)

1. TeamGPT làm gì, và nó khác gateway ở điểm nào? Vì sao tách 2 lớp?
2. Vì sao TeamGPT **không giữ** API key của provider?
3. Session server-side khác JWT thế nào? Ưu điểm khi disable/xóa user?
4. Cookie httpOnly + SameSite=Lax giúp chống loại tấn công nào?
5. scrypt + salt + so sánh thời gian hằng số giải quyết những rủi ro gì?
6. Usage reset theo ngày UTC mà **không cần cron job** — cơ chế bucket ra sao?
7. Vì sao TeamGPT phải **tự ước lượng** chi phí dù gateway đã tính?
8. "Soft cap" nghĩa là gì, vì sao chấp nhận được?
9. Vì sao chỉ gửi **20 tin gần nhất** làm ngữ cảnh?
10. SSE là gì? Vì sao phải tự gom buffer và tách theo `\n\n` ở cả 2 phía?
11. Lỗi xảy ra **trước** và **sau** khi bắt đầu stream được xử lý khác nhau ra sao? Vì sao?
12. `AbortController` giải quyết vấn đề gì khi người dùng đóng tab giữa chừng?
13. Hai chốt an toàn với admin (last-admin, không tự xóa) phòng tình huống nào?
14. Ghi file JSON atomic (temp + rename) chống được sự cố gì?
15. Hạn chế của kho JSON là gì, khi nào phải chuyển sang database?
16. Budget theo **người** (TeamGPT) khác budget theo **key** (gateway) thế nào?
17. Vì sao seed admin chỉ tạo khi **chưa có** user nào? Điều này gây bối rối gì khi đổi mật khẩu trong `.env` về sau?
18. Làm sao test được các nghiệp vụ mà không cần gateway thật đang chạy?
19. Vì sao tách `createApp()` ra khỏi phần khởi động server?
20. `effectiveBudget` xử lý "override → mặc định" như thế nào, và `null` mang ý nghĩa gì?

---

> **Tài liệu liên quan:** `README.md` (hướng dẫn dùng nhanh + tham chiếu API, tiếng
> Anh) và tài liệu của [llm-gateway](../llm-gateway/TAI_LIEU.md) (lớp bên dưới).
