import type { ReactNode } from "react";

/** White stroke icons for the left rail (24×24 viewBox). */
type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconWeb({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
    </Svg>
  );
}

export function IconBuilding({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 21V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V21" />
      <path d="M3 21h18" />
      <path d="M9 8h.01M12 8h.01M15 8h.01M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
    </Svg>
  );
}

export function IconHome({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h11V10.5" />
    </Svg>
  );
}

export function IconGroupMesh({ className }: IconProps) {
  return (
    <Svg className={className}>
      <line x1="12" y1="6.2" x2="6.2" y2="17.2" />
      <line x1="12" y1="6.2" x2="17.8" y2="17.2" />
      <line x1="6.2" y1="17.2" x2="17.8" y2="17.2" />
      <circle cx="12" cy="6.2" r="2.15" fill="currentColor" stroke="none" />
      <circle cx="6.2" cy="17.2" r="2.15" fill="currentColor" stroke="none" />
      <circle cx="17.8" cy="17.2" r="2.15" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconFeed({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 6h14" />
      <path d="M5 12h14" />
      <path d="M5 18h9" />
      <circle cx="19" cy="18" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconApps({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function IconBookmarks({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z" />
    </Svg>
  );
}

export function IconBookmarkFilled({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

export function IconPasswords({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="14" r="3.5" />
      <path d="M11 12.5h9v3h-2.5v2H15v-2H11" />
    </Svg>
  );
}

export function IconGames({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 10h12a4 4 0 0 1 4 4v2a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-2a4 4 0 0 1 4-4z" />
      <path d="M8 14v4M6 16h4" />
      <circle cx="16.2" cy="13.8" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="18.4" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconMovies({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="6" width="17" height="13" rx="2" />
      <path d="M7 6V4.8M12 6V4.8M17 6V4.8" />
      <path d="M3.5 11h17" />
      <path d="M8 14h3M13 16h3" />
    </Svg>
  );
}

export function IconBooks({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 5.5h6.5A2.5 2.5 0 0 1 14 8v11.5H7.5A2.5 2.5 0 0 0 5 22V5.5z" />
      <path d="M14 8h5a2 2 0 0 1 2 2v9.5h-7V8z" />
      <path d="M14 19.5H5" />
    </Svg>
  );
}

export function IconStar({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
    </Svg>
  );
}

export function IconStarFilled({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z" />
    </svg>
  );
}

export function IconLock({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function IconShield({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 3 5 6.2v5.4c0 4.2 2.8 7.8 7 8.9 4.2-1.1 7-4.7 7-8.9V6.2z" />
    </Svg>
  );
}

export function IconFolder({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 7.5h6l2 2.5h10v9.5H3z" />
      <path d="M3 7.5V6.2A1.7 1.7 0 0 1 4.7 4.5H9l1.6 2" />
    </Svg>
  );
}

export function IconPause({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="7" y="5" width="3.5" height="14" rx="0.6" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="0.6" />
    </Svg>
  );
}

export function IconPlay({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 5.5v14l12-7z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconBeeper({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="5" y="7" width="14" height="12" rx="2" />
      <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" />
      <path d="M8 16h8" />
    </Svg>
  );
}

export function IconPeople({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="8" cy="8" r="2.5" />
      <path d="M3.5 19c.35-3.1 2.15-5 4.5-5s4.15 1.9 4.5 5" />
      <circle cx="16.2" cy="8.4" r="2.3" />
      <path d="M12.4 19c.3-2.7 1.85-4.4 3.8-4.4 2 0 3.5 1.7 3.8 4.4" />
    </Svg>
  );
}

export function IconProfile({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  );
}

export function IconHeart({ className, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19.5 12.6 12 20l-7.5-7.4a4.5 4.5 0 1 1 7.5-5.2 4.5 4.5 0 1 1 7.5 5.2z" />
    </svg>
  );
}

export function IconThumbsUp({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7 10v11H4.2A1.2 1.2 0 0 1 3 19.8v-8.6A1.2 1.2 0 0 1 4.2 10H7z" />
      <path d="M7 10l3.2-6.1A2.3 2.3 0 0 1 12.3 3 2.2 2.2 0 0 1 14.5 5.2V9h4.2a2 2 0 0 1 2 2.4l-1.3 6.4A2.2 2.2 0 0 1 17.3 21H7" />
    </Svg>
  );
}

export function IconBell({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </Svg>
  );
}

export function IconTrophy({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
      <path d="M7 8H5a3 3 0 0 0 3 3" />
      <path d="M17 8h2a3 3 0 0 1-3 3" />
    </Svg>
  );
}

export function IconBookOpen({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 4h7a3 3 0 0 1 3 3v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-7a3 3 0 0 0-3 3v13a3 3 0 0 1 3-3h7z" />
    </Svg>
  );
}

export function IconHelp({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2.5M12 19.5V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.5M19.5 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
    </Svg>
  );
}

export function IconChevronDown({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function IconChevronLeft({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function IconChevronRight({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function IconPlus({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconCompose({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3H6a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3v-6" />
      <path d="M20.7 3.3a1.8 1.8 0 0 1 0 2.55l-9.2 9.2-3.5 1 1-3.5 9.2-9.2a1.8 1.8 0 0 1 2.5-.05z" />
    </svg>
  );
}

export function IconSearch({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="6.25" />
      <path d="M20 20l-3.6-3.6" />
    </Svg>
  );
}

export function IconPanelLeft({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </Svg>
  );
}

export function IconArrowUp({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 19V6" />
      <path d="m6.5 11.5 5.5-5.5 5.5 5.5" />
    </Svg>
  );
}

export function IconDownload({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 4v11" />
      <path d="m7.5 11.5 4.5 4.5 4.5-4.5" />
      <path d="M5 19h14" />
    </Svg>
  );
}

export function IconAbort({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </Svg>
  );
}

export function IconBack({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M15 6l-6 6 6 6" />
    </Svg>
  );
}

export function IconForward({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}

export function IconReload({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 12a9 9 0 1 1-2.6-6.2" />
      <path d="M21 4v5h-5" />
    </Svg>
  );
}

export function IconCopy({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M5 15V5h10" />
    </Svg>
  );
}

export function IconEye({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="2.75" />
    </Svg>
  );
}

function FeedGlyph({ className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Speech bubble in the same outline-cut style as X.com’s comment action. */
export function IconComment({ className }: IconProps) {
  return (
    <FeedGlyph className={className}>
      <path
        fillRule="evenodd"
        d="M5.5 3.5A4 4 0 001.5 7.5v5A4 4 0 005.5 16.5H8v3.15a.75.75 0 001.22.58l4.16-3.73H18.5a4 4 0 004-4v-5a4 4 0 00-4-4H5.5zM3.25 7.5A2.25 2.25 0 015.5 5.25h13A2.25 2.25 0 0120.75 7.5v5A2.25 2.25 0 0118.5 14.75h-5.35a.75.75 0 00-.5.19l-2.9 2.6v-2.04a.75.75 0 00-.75-.75H5.5A2.25 2.25 0 013.25 12.5v-5z"
      />
    </FeedGlyph>
  );
}

/** Outline eyeball matched to the same weight as the comment glyph. */
export function IconViews({ className }: IconProps) {
  return (
    <FeedGlyph className={className}>
      <path
        fillRule="evenodd"
        d="M12 5.25c-4.86 0-8.95 2.98-10.72 7.09a.75.75 0 000 .66C3.05 17.01 7.14 20 12 20s8.95-2.99 10.72-7a.75.75 0 000-.66C20.95 8.23 16.86 5.25 12 5.25zM3.1 12.58C4.66 9.2 8.05 7 12 7s7.34 2.2 8.9 5.58C19.34 16.05 15.95 18.25 12 18.25S4.66 16.05 3.1 12.58zM12 9.25a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM10.25 12.75a1.75 1.75 0 113.5 0 1.75 1.75 0 01-3.5 0z"
      />
    </FeedGlyph>
  );
}

export function IconDate({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M3 10h18" />
    </Svg>
  );
}

export function IconLocation({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.25" />
    </Svg>
  );
}

export function IconLink({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L10.7 5.23" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13.3 18.77" />
    </Svg>
  );
}

export function IconPaperclip({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </Svg>
  );
}

export function IconPin({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 7 17h10a2 2 0 0 0 1.89-3.55l-1.78-.9A2 2 0 0 1 15 10.76V6a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </Svg>
  );
}

/** Lucide Send (paper plane). */
export function IconSend({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </Svg>
  );
}

/** Lucide Mail paths. */
export function IconMail({ className }: IconProps) {
  return (
    <Svg className={className}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </Svg>
  );
}

export function IconMessenger({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 18.5V8.2A3.2 3.2 0 0 1 8.2 5h7.6A3.2 3.2 0 0 1 19 8.2v5.1A3.2 3.2 0 0 1 15.8 16.5H9.2L5 20v-1.5z" />
    </Svg>
  );
}

/** Signal: dotted outer chat bubble, solid inner bubble. */
export function IconSignal({ className }: IconProps) {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path
        d="M19.6 11.15c0 3.72-3.28 6.45-7.55 6.45-1.12 0-2.18-.18-3.12-.52L5.4 19.2l1.12-2.85C4.82 15.1 3.7 13.25 3.7 11.15 3.7 7.43 6.98 4.5 12.05 4.5s7.55 2.93 7.55 6.65z"
        strokeWidth="1.65"
        strokeDasharray="1.85 2.35"
      />
      <path
        d="M16.85 11.35c0 2.48-2.28 4.28-5.15 4.28-.82 0-1.58-.14-2.24-.4L7.2 16.55l.78-1.95c-1.12-.85-1.83-2.12-1.83-3.25 0-2.48 2.28-4.5 5.35-4.5s5.35 2.02 5.35 4.5z"
        strokeWidth="1.75"
      />
    </svg>
  );
}

export function IconEyeOff({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a16.6 16.6 0 0 1-3.1 4.1" />
      <path d="M6.7 6.7C4 8.6 2 12 2 12s3.5 7 10 7c1.5 0 2.9-.3 4.1-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </Svg>
  );
}

export function IconCamera({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4.5 8.5h2.2l1.3-2h8l1.3 2h2.2A1.5 1.5 0 0 1 21 10v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V10a1.5 1.5 0 0 1 1.5-1.5z" />
      <circle cx="12" cy="14.2" r="3.1" />
    </Svg>
  );
}

export function IconPhone({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M7.2 3.8h3.1l1.2 3-1.8 1.2a12 12 0 0 0 6.3 6.3l1.2-1.8 3 1.2v3.1c0 .7-.6 1.4-1.3 1.4C10.4 18.2 5.8 13.6 5.8 5.1c0-.7.7-1.3 1.4-1.3z" />
    </Svg>
  );
}

export function IconMoreHorizontal({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="5.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.35" fill="currentColor" stroke="none" />
    </Svg>
  );
}
