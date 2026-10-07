export function TypingBar({ handles }: { handles: string[] }) {
  if (handles.length === 0) return null;
  const labels = handles.map((h) => `@${h.replace(/^@/, "")}`);
  const copy =
    labels.length === 1
      ? `[ ${labels[0]} is typing... ]`
      : `[ ${labels.join(", ")} are typing... ]`;
  return (
    <p className="dm-typing-bar" role="status" aria-live="polite">
      <span>{copy}</span>
      <span className="dm-typing-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </p>
  );
}
