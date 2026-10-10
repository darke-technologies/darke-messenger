import { useSyncExternalStore } from "react";

type UpgradeKind = "capacity" | "groups" | "team" | "rooms";

type UpgradeModalState = {
  isOpen: boolean;
  kind: UpgradeKind;
};

const listeners = new Set<() => void>();

let snapshot: UpgradeModalState = {
  isOpen: false,
  kind: "capacity",
};

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot(): UpgradeModalState {
  return { isOpen: false, kind: "capacity" };
}

export const OPEN_PRICING_EVENT = "darke-open-pricing";

export function openUpgradeModal(kind: UpgradeKind = "capacity") {
  snapshot = { isOpen: true, kind };
  emit();
}

export function closeUpgradeModal() {
  if (!snapshot.isOpen) return;
  snapshot = { isOpen: false, kind: snapshot.kind };
  emit();
}

export function openProUpgradeModal() {
  openUpgradeModal("capacity");
}

export function openGroupUpgradeModal() {
  openUpgradeModal("groups");
}

export function openPricingPage() {
  closeUpgradeModal();
  if (typeof window === "undefined") return;
  window.history.pushState(null, "", "/pricing");
  window.dispatchEvent(new Event(OPEN_PRICING_EVENT));
}

export function useUpgradeModalStore() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return {
    ...state,
    openUpgradeModal,
    closeUpgradeModal,
  };
}
