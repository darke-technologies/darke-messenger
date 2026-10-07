import { useEffect } from "react";
import { createPortal } from "react-dom";
import { openPricingPage } from "./useUpgradeModalStore";
import type { TeamMovePreview } from "./teamService";

export function TeamMoveSeatModal({
  preview,
  onClose,
}: {
  preview: TeamMovePreview;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  const kind = preview.isGroup ? "group" : "chat";
  const planSeats = Number.isFinite(preview.planSeats)
    ? String(preview.planSeats)
    : "∞";
  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="apps-modal projects-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-move-seat-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="apps-modal-x"
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
        <h3 id="team-move-seat-title">Seat Capacity Reached</h3>
        <p className="muted apps-submit-note">
          Moving this {kind} into {preview.teamName} will add{" "}
          {preview.newMemberCount} new member
          {preview.newMemberCount === 1 ? "" : "s"}, bringing your team total to{" "}
          {preview.projectedSeats} seats. Your current plan includes {planSeats}{" "}
          seats.
        </p>
        <div className="projects-choice-actions">
          <button
            type="button"
            className="term-btn term-btn-emerald"
            onClick={() => {
              onClose();
              openPricingPage();
            }}
          >
            Upgrade / Add Seats
          </button>
          <button type="button" className="projects-choice-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
