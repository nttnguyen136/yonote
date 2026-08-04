import type { ReactNode, SVGProps } from 'react';

export type AppIconName =
  | 'arrow-right'
  | 'chevron-left'
  | 'chevron-right'
  | 'cloud'
  | 'download'
  | 'file'
  | 'lock'
  | 'moon'
  | 'offline'
  | 'pin'
  | 'plus'
  | 'search'
  | 'sparkles'
  | 'trash'
  | 'x';

const paths: Record<AppIconName, ReactNode> = {
  'arrow-right': <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 18 6-6-6-6" />,
  cloud: <><path d="M17.5 19H7a5 5 0 1 1 1.7-9.7A6 6 0 0 1 20 12a3.5 3.5 0 0 1-2.5 7Z" /><path d="M12 12v5" /><path d="m9.8 14.2 2.2-2.2 2.2 2.2" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h6" /></>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  moon: <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z" />,
  offline: <><path d="M12 18h.01" /><path d="M8.5 14.5a5 5 0 0 1 7 0" /><path d="M5 11a9 9 0 0 1 2.3-1.7" /><path d="M16.7 9.3A9 9 0 0 1 19 11" /><path d="m3 3 18 18" /></>,
  pin: <path d="m15 4 5 5-4 2-3 6-2-2-5 5 3-7-2-2 6-3 2-4Z" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  sparkles: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z" /><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /><path d="m5 13 .8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8L5 13Z" /></>,
  trash: <><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="m6 7 1 14h10l1-14" /><path d="M9 7V4h6v3" /></>,
  x: <><path d="m6 6 12 12" /><path d="M18 6 6 18" /></>,
};

export function AppIcon({ name, ...props }: { name: AppIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className="app-icon"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
