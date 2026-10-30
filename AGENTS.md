# AGENTS.md — YONOTE

## Tổng quan dự án

YONOTE là ứng dụng ghi chú Markdown single-user, ưu tiên quyền riêng tư, triển khai trên Cloudflare Workers + React 19 SPA + Cloudflare D1.

Ứng dụng có hai workspace tách biệt hoàn toàn (xem định nghĩa thuật ngữ tại [`GLOSSARY.md`](GLOSSARY.md)):

1. **Cloud Mode (`online`)**: Mở bằng `ACCESS_KEY`, lưu trữ trên Cloudflare D1, hỗ trợ public read-only share. Session token chỉ nằm trong bộ nhớ trang (refresh phải nhập lại key).
2. **Private Offline Mode (`offline`)**: Không cần key, không gọi API/D1. Notes, trạng thái đọc (`isViewOnly`), và mã nguồn Live Diagram được lưu trong `localStorage` của trình duyệt (`src/lib/offlineStorage.ts`). Nhấn F5 tự động mở lại Offline Mode; bấm `Exit` quay về `UnlockScreen` nhưng vẫn giữ nguyên dữ liệu local.

## Bản đồ điều hướng (Navigation Pointers)

- **Từ điển thuật ngữ domain**: [`GLOSSARY.md`](GLOSSARY.md)
- **Quy chuẩn code, kiến trúc module, bảo mật & UI/UX**: [`CODING_STANDARDS.md`](CODING_STANDARDS.md) — đọc khi thiết kế, viết code hoặc chạy `/code-review`.
- **Tài liệu tính năng, cấu hình local & deploy**: [`README.md`](README.md) — cập nhật khi thay đổi tính năng hoặc cách vận hành.
- **Tài liệu External API v1**: [`docs/external-api.md`](docs/external-api.md) và [`openapi.yaml`](openapi.yaml) — đọc trước khi sửa `src/lib/api.ts` hoặc `worker/index.ts`.
- **Cấu trúc thư mục chính**:
  - `src/App.tsx`: Điều phối workspace và layout cấp cao.
  - `src/components/`: UI components (`LiveUmlWorkspace.tsx`, `DiagramViewport.tsx`, `MarkdownEditor/`, `MarkdownPreview.tsx`, `MermaidBlock.tsx`, `PlantUmlBlock.tsx`, `ShareButton.tsx`, `SharedNotePage.tsx`).
  - `src/lib/`: Domain logic (`api.ts`, `autoSave.ts`, `markdownImport.ts`, `offlineStorage.ts`, `diagramDefaults.ts`, `theme.ts`, `types.ts`). Unit test chỉ chạy trên Node (`node --test src/**/*.test.ts` — hiện có `autoSave.test.ts`, `markdownImport.test.ts`, `offlineStorage.test.ts`; không có test component `.tsx`).
  - `src/styles.css` & `src/resizable-layout.css`: Stylesheet chính (có mục lục dòng ở đầu `src/styles.css`) và desktop flex/resizer layout.
  - `worker/index.ts` & `migrations/`: Cloudflare Worker API handlers và D1 migrations.

## Lệnh kiểm tra bắt buộc

Trước khi hoàn tất thay đổi code, luôn chạy:

```bash
npm run typecheck
npm test
npm run build
```

- Khi sửa UI/interaction: kiểm tra desktop & mobile, Light & Dark theme, keyboard navigation, console errors, và cả PlantUML + Mermaid nếu đụng tới Live Diagram.
- Khi sửa Private Offline Mode: xác nhận không phát sinh request `/api/*`, vẫn render được diagram khi bật chế độ offline, và giữ nguyên dữ liệu sau khi F5 hoặc `Exit` rồi mở lại.

## Hoàn tất công việc

Khi báo cáo kết quả, nêu rõ:

- Những file đã thay đổi.
- Hành vi được thêm hoặc sửa.
- Các bước kiểm tra đã chạy và cảnh báo còn tồn tại (nếu có).
- Có thay đổi hành vi, dữ liệu, API hoặc migration hay không.

Không commit, push, tạo PR, merge hoặc deploy nếu người dùng chưa cấp quyền rõ ràng cho từng hành động tương ứng.

## Agent skills

- **Issue tracker**: GitHub Issues (`nttnguyen136/yonote`) qua `gh` CLI — xem [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).
- **Triage labels**: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix` — xem [`docs/agents/triage-labels.md`](docs/agents/triage-labels.md).
- **Domain docs**: [`GLOSSARY.md`](GLOSSARY.md) ở thư mục gốc (và `docs/adr/` nếu tồn tại) — xem [`docs/agents/domain.md`](docs/agents/domain.md).
