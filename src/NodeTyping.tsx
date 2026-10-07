export function NodeTyping() {
  return (
    <p className="dm-typing-bar is-node-greeting" role="status" aria-live="polite">
      <span>DARKE Node is typing...</span>
      <span className="dm-typing-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </p>
  );
}
