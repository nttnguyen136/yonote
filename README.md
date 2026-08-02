# YONOTE

Ứng dụng ghi chú online dạng single-user, triển khai hoàn toàn trên Cloudflare Workers + D1.

## Tính năng

- Mỗi lần tải lại trang phải nhập Access Key.
- Không có tài khoản hoặc màn hình đăng ký.
- Tạo, sửa, xóa, tìm kiếm và ghim ghi chú.
- Autosave sau 800 ms, hỗ trợ `Ctrl/Cmd + S`.
- Phát hiện conflict khi hai tab cùng sửa một note.
- Markdown + GitHub Flavored Markdown.
- Mermaid render trực tiếp trong browser ở chế độ `securityLevel: strict`.
- PlantUML render qua API serverless, proxy đến Kroki.
- Chặn các directive PlantUML `!include`, `!includeurl`, `!include_many`, `!import`.
- Responsive: sidebar/editor/preview trên desktop; Notes/Edit/Preview theo tab trên mobile.
- Theme System/Light/Dark, ghi nhớ lựa chọn giao diện trên thiết bị.
- Private Offline Mode: note chỉ tồn tại trong RAM, không gọi notes API, không D1 và không gửi PlantUML.
- Progressive Web App: có thể cài trên mobile/desktop và mở giao diện khi không có mạng.
- Export note thành file `.md`.
- Key và session token không được lưu trong Local Storage hoặc Session Storage.

## Chế độ hoạt động

### Cloud mode

- Nhập `ACCESS_KEY`.
- Đọc và ghi notes qua Worker API và D1.
- Mermaid render trong browser; PlantUML gửi đến Worker/Kroki.

### Private Offline Mode

- Bỏ qua Access Key và toàn bộ notes API.
- Không đọc/ghi D1, không `POST`, không queue hoặc background sync.
- Nội dung note chỉ giữ trong memory của tab/app hiện tại.
- Refresh, đóng app, Lock hoặc Exit sẽ xóa toàn bộ note offline.
- Dùng **Export** trước khi thoát để giữ file Markdown.
- Mermaid vẫn hoạt động trong browser. PlantUML chỉ hiển thị source và không gọi renderer.

Theme preference được lưu riêng trong `localStorage`; nội dung note offline không được lưu vào `localStorage`, `sessionStorage` hoặc IndexedDB.

## Cài đặt PWA

Sau lần mở online đầu tiên, service worker cache application shell để YONOTE có thể mở khi mất mạng.

- Chrome/Edge desktop hoặc Android: chọn nút **Install app** trong màn hình mở khóa khi browser hỗ trợ.
- iOS/iPadOS Safari: chọn **Share → Add to Home Screen**.
- API request không bao giờ được service worker cache, replay hoặc đưa vào background queue.

## Kiến trúc

```text
React + Vite static assets + PWA service worker
          │
          ├── Markdown + Mermaid trong browser
          │
          ▼
Cloudflare Worker
          ├── POST /api/unlock
          ├── CRUD /api/notes
          ├── POST /api/plantuml
          └── D1 binding
```

Worker và static assets được deploy thành một đơn vị duy nhất. D1 được Wrangler tự động provision từ binding `DB`; Worker tự tạo schema khi API được gọi lần đầu.

## Yêu cầu

- Node.js 20 trở lên.
- Tài khoản Cloudflare.

## Chạy local

```bash
npm install
cp .dev.vars.example .dev.vars
```

Sửa `.dev.vars`:

```dotenv
ACCESS_KEY=your-local-access-key
TOKEN_SECRET=a-long-random-secret-at-least-32-characters
```

Chạy:

```bash
npm run dev
```

D1 local được Wrangler lưu trong thư mục `.wrangler`.

## Deploy

### 1. Đăng nhập Cloudflare

```bash
npx wrangler login
```

### 2. Tạo file secret production

```bash
cp .env.production.example .env.production
```

Sửa `.env.production`:

```dotenv
ACCESS_KEY=your-production-access-key
TOKEN_SECRET=a-long-random-secret-at-least-32-characters
```

Có thể tạo `TOKEN_SECRET` bằng Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 3. Build và deploy

```bash
npm run deploy
```

Lệnh này sẽ:

1. Build React SPA.
2. Tạo D1 database nếu chưa tồn tại.
3. Upload `ACCESS_KEY` và `TOKEN_SECRET` dưới dạng Worker Secrets.
4. Deploy Worker cùng static assets.
5. Trả về URL dạng `https://yonote.<subdomain>.workers.dev`.

## Đổi Access Key

Sửa `.env.production`, sau đó chạy lại:

```bash
npm run deploy
```

## Database migration tùy chọn

Worker tự tạo schema nên không bắt buộc chạy migration. File `migrations/0001_init.sql` được giữ để quản lý schema thủ công khi cần.

Sau khi D1 đã được provision và `wrangler.jsonc` có `database_id`, có thể chạy:

```bash
npx wrangler d1 migrations apply yonote-db --remote
```

Tên database thực tế có thể khác khi dùng automatic provisioning; kiểm tra bằng:

```bash
npx wrangler d1 list
```

## Lưu ý PlantUML

PlantUML source được gửi từ Worker đến dịch vụ Kroki public để tạo SVG. Không nên đặt thiết kế mật hoặc dữ liệu nội bộ nhạy cảm trong block PlantUML. Mermaid không có giới hạn này vì được render trực tiếp trong browser.

Cú pháp:

````markdown
```plantuml
@startuml
Alice -> Bob: Hello
@enduml
```
````

Mermaid:

````markdown
```mermaid
flowchart LR
  User --> YONOTE
  YONOTE --> D1
```
````

## Giới hạn mặc định

- Tối đa 500 notes được tải vào một phiên.
- Một note tối đa khoảng 1 MB UTF-8.
- PlantUML source tối đa 100 KB.
- Token hợp lệ 12 giờ nhưng chỉ được giữ trong memory; refresh vẫn phải nhập Key lại.

## Kiểm tra Offline Mode

1. Mở YONOTE online ít nhất một lần để cài service worker.
2. Chọn **Open private offline mode**.
3. Trong DevTools Network, lọc `api`: không có request `/api/unlock`, `/api/notes` hoặc `/api/plantuml`.
4. Bật chế độ Offline của browser và reload app đã cài.
5. Mermaid vẫn render; PlantUML hiển thị thông báo không gửi source ra ngoài.
6. Exit/Lock hoặc đóng app: note offline bị xóa.
