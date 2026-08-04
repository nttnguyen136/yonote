# AGENTS.md — YONOTE

## Tổng quan dự án

YONOTE là ứng dụng ghi chú Markdown single-user, ưu tiên quyền riêng tư, được triển khai dưới dạng Cloudflare Worker kết hợp React SPA và Cloudflare D1.

Ứng dụng có hai workspace tách biệt:

1. **Cloud Mode**
   - Mở bằng `ACCESS_KEY`.
   - Notes được lưu trong Cloudflare D1.
   - Hỗ trợ tạo public read-only link.
   - Session token chỉ tồn tại trong memory của trang.

2. **Private Offline Mode**
   - Không yêu cầu Access Key.
   - Không gọi Notes API hoặc truy cập D1.
   - Notes và diagram source chỉ tồn tại trong RAM.
   - Dữ liệu mất khi refresh, đóng hoặc thoát ứng dụng.
   - Live Diagram chỉ khả dụng trong chế độ này.

Không được làm mờ ranh giới giữa hai workspace.

## Công nghệ chính

- React 19
- TypeScript
- Vite
- Cloudflare Workers
- Cloudflare D1
- Wrangler
- CodeMirror 6
- React Markdown
- Mermaid
- `@plantuml/core`
- Progressive Web App và service worker

## Cấu trúc quan trọng

```text
src/
├── App.tsx
├── components/
│   ├── DiagramViewport.tsx
│   ├── LiveUmlWorkspace.tsx
│   ├── MarkdownEditor/
│   ├── MarkdownPreview.tsx
│   ├── MermaidBlock.tsx
│   ├── PlantUmlBlock.tsx
│   ├── ShareButton.tsx
│   ├── SharedNotePage.tsx
│   └── ThemeSelect.tsx
├── lib/
│   ├── api.ts
│   ├── diagramDefaults.ts
│   ├── theme.ts
│   └── types.ts
├── styles.css
└── resizable-layout.css

worker/
└── index.ts

migrations/
public/
scripts/
```

## Nguyên tắc thay đổi

- Giữ nguyên hành vi hiện có trừ khi có yêu cầu rõ ràng hoặc phát hiện bug thực sự.
- Ưu tiên thay đổi nhỏ, có phạm vi rõ ràng và dễ review.
- Không thực hiện refactor kiến trúc lớn nếu không mang lại lợi ích cụ thể.
- Không thêm dependency khi chức năng có thể được triển khai hợp lý bằng Web API hoặc thư viện hiện có.
- Tách component hoặc hook khi một file bắt đầu đảm nhiệm một vùng trách nhiệm độc lập.
- Không đưa secrets, token, Access Key hoặc dữ liệu production vào repository.
- Khi thay đổi tính năng hoặc cách vận hành, cập nhật README tương ứng.

## Quy tắc dữ liệu và riêng tư

### Cloud Mode

- Mọi request notes phải dùng API trong `src/lib/api.ts`.
- Không lưu `ACCESS_KEY` hoặc session token vào:
  - `localStorage`
  - `sessionStorage`
  - IndexedDB
  - cookie phía client
- Refresh trang phải yêu cầu nhập Access Key lại.
- Phải giữ cơ chế version/conflict detection khi cập nhật note.
- Trước khi tạo public share, phải bảo đảm thay đổi đang chờ đã được lưu.

### Private Offline Mode

- Tuyệt đối không gọi:
  - `/api/unlock`
  - `/api/notes`
  - `/api/shares`
  - D1 hoặc API đồng bộ khác
- Không persist note hoặc diagram source.
- Không thêm background sync, request queue hoặc cơ chế khôi phục dữ liệu ngầm.
- Chỉ theme và tùy chọn layout được phép lưu trên thiết bị.
- Luôn nhắc người dùng export nội dung trước khi thoát.

## Diagram

- Mermaid và PlantUML phải render hoàn toàn trong trình duyệt.
- Không gửi diagram source đến Worker, Kroki, PlantUML Server hoặc dịch vụ bên ngoài.
- Mermaid phải tiếp tục sử dụng cấu hình bảo mật phù hợp, bao gồm `securityLevel: strict`.
- PlantUML phải chặn include/import tới file hoặc URL bên ngoài.
- Standard-library include chỉ được phép khi tài nguyên đã có trong bundle.
- Live Diagram chỉ thuộc Private Offline Mode.

### Diagram viewport

`DiagramViewport.tsx` chịu trách nhiệm cho:

- Zoom từ 25% đến 400%.
- Pan bằng chuột, touch và touchpad.
- Pinch hoặc `Ctrl/Cmd + wheel` để zoom.
- Điều khiển bằng bàn phím.
- Reset viewport.
- Khả năng truy cập bằng ARIA và focus keyboard.

Không đưa logic zoom/pan trực tiếp trở lại `LiveUmlWorkspace.tsx`.

## UI và accessibility

- Giữ thiết kế responsive trên desktop, tablet và mobile.
- Không làm mất điều hướng Notes/Edit/Preview trên màn hình nhỏ.
- Mọi control chỉ có biểu tượng phải có `aria-label` và `title` phù hợp.
- Tương tác quan trọng phải dùng được bằng bàn phím.
- Pointer interaction cần hoạt động cho cả mouse và touch.
- Tôn trọng `prefers-reduced-motion`.
- Sử dụng design tokens/CSS variables hiện có thay vì hard-code màu sắc.
- Kiểm tra giao diện với tất cả theme khi thay đổi màu, border hoặc surface.
- Không để toolbar hoặc action buttons tràn khỏi màn hình nhỏ.

## React và TypeScript

- Giữ TypeScript strict và tránh `any`.
- Dùng type-only import khi import chỉ phục vụ type.
- Derived data nên được tính từ state thay vì lưu thành state trùng lặp.
- Chỉ dùng `useMemo` hoặc `useCallback` khi có lợi ích thực tế.
- Cleanup timer, event listener, object URL và async side effect.
- Không cập nhật state của workspace cũ sau khi người dùng Lock hoặc Exit.
- Lazy-load các module lớn hoặc workspace không cần thiết cho lần render đầu.
- Không làm Mermaid hoặc PlantUML trở thành dependency eager của application shell.

## Worker và API

Các endpoint chính:

```text
POST   /api/unlock
GET    /api/notes
POST   /api/notes
PATCH  /api/notes/:id
DELETE /api/notes/:id

GET    /api/notes/:id/share
POST   /api/notes/:id/share
DELETE /api/notes/:id/share

GET    /api/shares/:shareId
```

Khi sửa Worker:

- Validate method, payload và kích thước dữ liệu.
- Giữ response phù hợp với types trong frontend.
- Không trả thông tin secret hoặc chi tiết lỗi nhạy cảm.
- Public share phải tiếp tục trả `Cache-Control: no-store`.
- Không làm giảm entropy của share ID.
- Thay đổi schema phải được triển khai bằng migration mới.
- Không sửa migration đã được áp dụng; tạo migration tiếp theo.

## PWA và service worker

- Application shell có thể được cache.
- API response và API request không được cache hoặc replay.
- Không thêm background sync cho notes.
- Khi đổi danh sách assets hoặc chiến lược cache, cập nhật cache version.
- Xác minh ứng dụng vẫn khởi động offline sau lần mở online đầu tiên.
- Diagram engine cần tiếp tục hoạt động mà không gọi dịch vụ render ngoài.

## Lệnh kiểm tra

Trước khi hoàn tất thay đổi code, chạy:

```bash
npm run typecheck
npm run build
```

Nếu thay đổi UI hoặc interaction:

- Kiểm tra trực tiếp trên trình duyệt.
- Kiểm tra desktop và mobile.
- Kiểm tra ít nhất Light và Dark/System theme.
- Xác nhận không có lỗi console.
- Kiểm tra keyboard interaction.
- Với Live Diagram, kiểm tra cả PlantUML và Mermaid.

Nếu thay đổi Private Offline Mode:

1. Mở workspace offline.
2. Tạo hoặc sửa note/diagram.
3. Xác nhận không có request Notes API.
4. Bật chế độ offline của trình duyệt.
5. Xác nhận diagram vẫn render.
6. Refresh hoặc Exit và xác nhận dữ liệu bị xóa.

## Hoàn tất công việc

Khi báo cáo kết quả, nêu rõ:

- Những file đã thay đổi.
- Hành vi được thêm hoặc sửa.
- Các bước kiểm tra đã chạy.
- Cảnh báo còn tồn tại.
- Có thay đổi hành vi, dữ liệu, API hoặc migration hay không.

Không commit, push, tạo PR, merge hoặc deploy nếu người dùng chưa cấp quyền rõ ràng cho từng hành động tương ứng.