export function TypingBar({ handles }: { handles: string[] }) {
  if (handles.length === 0) return null;
  const who = handles.map((h) => h.replace(/^@/, "")).join(", ");
  return (
    <div
      className="dm-typing-bar is-dots"
      role="status"
      aria-live="polite"
      aria-label={`${who} typing`}
    >
      <span className="dm-typing-bubble">
        <span className="dm-typing-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </span>
    </div>
  );
}
