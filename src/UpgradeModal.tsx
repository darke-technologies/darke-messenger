"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  closeUpgradeModal,
  openPricingPage,
  useUpgradeModalStore,
} from "./useUpgradeModalStore";

export function UpgradeModal() {
  const { isOpen, kind } = useUpgradeModalStore();
  const groups = kind === "groups";
  const team = kind === "team";
  const title = team
    ? "Unlock more TEAM seats"
    : groups
      ? "Enable Team Group Nodes"
      : "Chat capacity reached";
  const note = team
    ? "Free accounts include 2 TEAM seats (you plus one member). Adding a third TEAM member requires DARKE Premium."
    : groups
      ? "Multi-peer P2P encryption and group collaboration require a DARKE Premium license."
      : "You have reached member capacity for this chat under your plan. To add more members upgrade now.";
  const action = team || groups ? "Upgrade to Premium" : "See our pricing";

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeUpgradeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="apps-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeUpgradeModal();
      }}
    >
      <div
        className="apps-modal projects-choice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
      >
        <button
          type="button"
          className="apps-modal-x"
          aria-label="Close"
          onClick={closeUpgradeModal}
        >
          ×
        </button>
        <h3 id="upgrade-modal-title">{title}</h3>
        <p className="muted apps-submit-note">{note}</p>
        <div className="projects-choice-actions">
          <button
            type="button"
            className="term-btn term-btn-emerald"
            onClick={openPricingPage}
          >
            {action}
          </button>
          <button
            type="button"
            className="projects-choice-btn"
            onClick={closeUpgradeModal}
          >
            CLOSE
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
