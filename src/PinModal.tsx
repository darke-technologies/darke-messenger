import { useState } from "react";
import type { PinDuration } from "./dmSessions";

const OPTIONS: { id: PinDuration; label: string }[] = [
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "forever", label: "Forever" },
];

export function PinModal({
  onClose,
  onPin,
}: {
  onClose: () => void;
  onPin: (duration: PinDuration) => void;
}) {
  const [duration, setDuration] = useState<PinDuration>("7d");

  return (
    <div className="fwd-scrim" role="presentation" onClick={onClose}>
      <section
        className="pin-modal"
        role="dialog"
        aria-labelledby="pin-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pin-modal-head">
          <h2 id="pin-title">Pin message for...</h2>
          <button
            type="button"
            className="fwd-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="pin-modal-opts" role="radiogroup" aria-labelledby="pin-title">
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={duration === opt.id}
              className="pin-opt"
              onClick={() => setDuration(opt.id)}
            >
              <span className={`pin-radio${duration === opt.id ? " is-on" : ""}`} />
              {opt.label}
            </button>
          ))}
        </div>
        <footer className="pin-modal-foot">
          <button type="button" className="pin-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="pin-confirm"
            onClick={() => onPin(duration)}
          >
            Pin
          </button>
        </footer>
      </section>
    </div>
  );
}
