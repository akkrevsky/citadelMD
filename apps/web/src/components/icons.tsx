// Small 16x16 action icons shared by document header buttons.
// All use currentColor so theme variables drive the color.

export function IconSave() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M3 1.5A1.5 1.5 0 0 0 1.5 3v10A1.5 1.5 0 0 0 3 14.5h10a1.5 1.5 0 0 0 1.5-1.5V5.06a1.5 1.5 0 0 0-.44-1.06l-2.06-2.06A1.5 1.5 0 0 0 10.94 1.5H3Zm.75 1h6.75v3h-7v-3Zm8.5 0.56 1.94 1.94h-1.94V2.56ZM11 6v2.25h-1.5V6H11ZM2.25 13V6h7.25v7h-7.25Zm8.75 0V8.25H5.25V13h5.75Z" />
    </svg>
  )
}

export function IconCommit() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M7.25 3.75V6.5H3.25v1.5h4v2.75h1.5V8h4V6.5h-4V3.75h-1.5Zm6.5 5.5v1.5h-1.5v-1.5h1.5Z" />
    </svg>
  )
}

export function IconDiscard() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M5.28 3.72a.75.75 0 0 0-1.06 1.06L5.94 6.5H3a6.5 6.5 0 1 0 6.5 6.5v-1.5a5 5 0 1 1-5-5h3.22l-1.72 1.72a.75.75 0 1 0 1.06 1.06l3-3a.75.75 0 0 0 0-1.06l-3-3Z" />
    </svg>
  )
}

export function IconShare() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9.5 2.5a2.5 2.5 0 1 1 .54 4.93L7.2 8.79a2.5 2.5 0 1 1-1.06-1.06L9 6.32a2.52 2.52 0 0 1 0-1.86L6.14 3.1a2.5 2.5 0 1 1 1.06-1.06l2.85 1.36A2.5 2.5 0 0 1 9.5 2.5Z" />
    </svg>
  )
}

export function IconHistory() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm0 1.5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm-.75 2.5a.75.75 0 0 1 1.5 0v2.69l1.78 1.03a.75.75 0 1 1-.75 1.3l-2-1.16A.75.75 0 0 1 7.25 8V5.5Z" />
    </svg>
  )
}

export function IconDashboard() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h3A1.5 1.5 0 0 1 8 2.5v3A1.5 1.5 0 0 1 6.5 7h-3A1.5 1.5 0 0 1 2 5.5v-3Zm7.5 0A1.5 1.5 0 0 1 11 1h1.5A1.5 1.5 0 0 1 14 2.5v1A1.5 1.5 0 0 1 12.5 5H11a1.5 1.5 0 0 1-1.5-1.5v-1ZM2 10.5A1.5 1.5 0 0 1 3.5 9h1A1.5 1.5 0 0 1 6 10.5v3A1.5 1.5 0 0 1 4.5 15h-1A1.5 1.5 0 0 1 2 13.5v-3Zm7.5 1A1.5 1.5 0 0 1 11 10h1.5A1.5 1.5 0 0 1 14 11.5v1a1.5 1.5 0 0 1-1.5 1.5H11a1.5 1.5 0 0 1-1.5-1.5v-1Z" />
    </svg>
  )
}

// Tree icons (OpenViking style): stroke-based, 16x16, currentColor.

export function IconChevronRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M6 4l4 4-4 4" />
    </svg>
  )
}

export function IconFolder({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2h2.06c.43 0 .85.19 1.13.51l.84.98c.28.33.7.51 1.13.51h3.84A1.5 1.5 0 0 1 14 5.5v6A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-8Z" />
    </svg>
  )
}

export function IconFile({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M10 1.5H4A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8a1.5 1.5 0 0 0 1.5-1.5V4.75L10 1.5Z" />
      <path d="M10 1.5v3.25H13.5" />
      <path d="M6.5 6.5h5M6.5 9h5M6.5 11.5h3" />
    </svg>
  )
}
