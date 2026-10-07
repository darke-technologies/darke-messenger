/** Lucide-style eye; no emoji, no lucide-react package. */
function EyeIcon() {
  return (
    <svg
      className="dm-only-you-icon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function SystemSeedPrivacyBadge() {
  return (
    <div className="dm-only-you" role="note">
      <EyeIcon />
      <span>Only visible to you</span>
    </div>
  );
}
