import { useCallback, useEffect, useState } from "react";
import { ACTIONS, EVENTS, STATUS, type EventData } from "react-joyride";

const PREFIX = "medaplus_tour_";
const DONE_EVENT = "medaplus:tour-done";

function stepKey(page: string) {
  return `${PREFIX}${page}_step`;
}

function doneKey(page: string) {
  return `${PREFIX}${page}_done`;
}

function readStep(page: string): number {
  const raw = localStorage.getItem(stepKey(page));
  return raw ? Number(raw) || 0 : 0;
}

function readDone(page: string): boolean {
  return localStorage.getItem(doneKey(page)) === "1";
}

/**
 * Per-page onboarding tour state, persisted in localStorage so it
 * survives reloads, tab closes, and logins (it's device-tied, not
 * session-tied — clearing it requires clearing browser storage).
 *
 * - A page whose tour is marked "done" never runs again.
 * - A page left mid-tour resumes from the exact step the user was on,
 *   instead of restarting from zero.
 * - Pass `waitForPage` to hold this tour off until another page's tour
 *   (e.g. the persistent navbar's) has finished — so two forceful
 *   tours never run on screen at the same time.
 */
export function useTourManager(page: string, stepCount: number, waitForPage?: string) {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const tryStart = useCallback(() => {
    if (stepCount === 0 || readDone(page)) {
      setRun(false);
      return;
    }
    if (waitForPage && !readDone(waitForPage)) {
      setRun(false);
      return;
    }
    setStepIndex(Math.min(readStep(page), stepCount - 1));
    setRun(true);
  }, [page, stepCount, waitForPage]);

  useEffect(() => {
    tryStart();
    if (!waitForPage) return;
    function onTourDone(e: Event) {
      const detail = (e as CustomEvent<{ page: string }>).detail;
      if (detail?.page === waitForPage) tryStart();
    }
    window.addEventListener(DONE_EVENT, onTourDone);
    return () => window.removeEventListener(DONE_EVENT, onTourDone);
  }, [tryStart, waitForPage]);

  // v3's onEvent receives (data, controls) — we only need data here.
  const handleCallback = useCallback(
    (data: EventData) => {
      const { index, status, action, type } = data;

      if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
        const next = action === ACTIONS.PREV ? index - 1 : index + 1;
        localStorage.setItem(stepKey(page), String(Math.max(next, 0)));
        setStepIndex(next);
      }

      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        localStorage.setItem(doneKey(page), "1");
        localStorage.removeItem(stepKey(page));
        setRun(false);
        window.dispatchEvent(new CustomEvent(DONE_EVENT, { detail: { page } }));
      }
    },
    [page]
  );

  return { run, stepIndex, handleCallback };
}
