import { useSyncExternalStore } from "react";

// In-memory only. Not saved anywhere, so it resets on refresh.
let playerModeActive = false;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return playerModeActive;
}

export function setPlayerModeActive(value: boolean) {
  if (value === playerModeActive) return;
  playerModeActive = value;
  listeners.forEach((l) => l());
}

export function usePlayerMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}