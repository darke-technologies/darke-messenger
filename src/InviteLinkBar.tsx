import { IconCopy, IconReload } from "./icons";

export function InviteLinkBar({
  shareLink,
  copied,
  onCopy,
  disabled = false,
  inputId,
  showNote = true,
  copyLabel = "Copy link",
  onRotate,
}: {
  shareLink: string;
  copied: boolean;
  onCopy: () => void;
  disabled?: boolean;
  inputId?: string;
  showNote?: boolean;
  copyLabel?: string;
  onRotate?: () => void;
}) {
  return (
    <>
      <div className={`invite-link-bar${disabled ? " is-disabled" : ""}`}>
        <input
          id={inputId}
          className="invite-link-url"
          readOnly
          value={shareLink}
          spellCheck={false}
          aria-label="Join link"
          disabled={disabled}
          onFocus={(e) => {
            if (!disabled) e.currentTarget.select();
          }}
        />
        <button
          type="button"
          className="term-btn term-btn-emerald invite-link-copy"
          onClick={onCopy}
          disabled={disabled || !shareLink}
        >
          <IconCopy className="invite-link-copy-icon" />
          {copied ? "Copied" : copyLabel}
        </button>
        {onRotate ? (
          <button
            type="button"
            className="invite-link-rotate"
            aria-label="Rotate link"
            title="Rotate link"
            onClick={onRotate}
            disabled={disabled}
          >
            <IconReload className="invite-link-copy-icon" />
          </button>
        ) : null}
      </div>
      {showNote && !disabled ? (
        <p className="invite-link-note">
          <span className="invite-link-info" aria-hidden>
            i
          </span>
          Anyone with this encrypted link can join this chat. Share
          responsibly, revoke anytime.
        </p>
      ) : null}
    </>
  );
}
