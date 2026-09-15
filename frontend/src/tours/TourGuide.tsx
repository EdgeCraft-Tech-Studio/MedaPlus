import { useEffect, useState } from "react";
import { Joyride, type Step, type TooltipRenderProps } from "react-joyride";
import { tourContent } from "./tourContent";
import { useTourManager } from "./useTourManager";

/** How long to keep looking for targets before giving up on them. */
const RESOLVE_TIMEOUT_MS = 2500;
const RESOLVE_INTERVAL_MS = 120;

interface TourGuideProps {
  /** Page key — must match a key in tourContent.ts. */
  page: keyof typeof tourContent;
  /**
   * Optional: another page key whose tour must finish first.
   * Use this on page-specific tours so they don't overlap with the
   * persistent AppShell navbar tour (e.g. waitForPage="appshell").
   */
  waitForPage?: keyof typeof tourContent;
  /**
   * Optional: hold the tour until the page says it's ready (data loaded,
   * role known, tabs rendered). Defaults to true.
   */
  ready?: boolean;
}

/**
 * Custom tooltip: identical layout/colors to the default, except the
 * skip control is a small, quiet text link in the top-right corner
 * instead of a full button in the footer — present, but easy to miss
 * if the user is reading the tip rather than looking to escape it.
 */
function CustomTooltip({
  backProps,
  index,
  primaryProps,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      style={{
        position: "relative",
        background: "#fbfbf8",
        borderRadius: 14,
        padding: "16px 18px 14px",
        maxWidth: 320,
        fontFamily: "Inter, -apple-system, sans-serif",
        boxShadow: "0 12px 32px rgba(14, 23, 18, 0.28)",
      }}
    >
      <button
        {...skipProps}
        style={{
          position: "absolute",
          top: 10,
          right: 12,
          background: "none",
          border: "none",
          padding: 2,
          fontSize: 10.5,
          fontWeight: 500,
          color: "#b7c2bb",
          cursor: "pointer",
        }}
      >
        skip
      </button>

      {step.title && (
        <h4 style={{ margin: "0 34px 8px 0", fontSize: 15, fontWeight: 800, color: "#0e1712" }}>
          {step.title}
        </h4>
      )}
      <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "#0e1712" }}>{step.content}</div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        {index > 0 && (
          <button
            {...backProps}
            style={{
              background: "none",
              border: "none",
              color: "#6b7a72",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
              padding: "8px 10px",
            }}
          >
            {backProps.title}
          </button>
        )}
        <button
          {...primaryProps}
          style={{
            background: "#16513f",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 12.5,
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          {primaryProps.title}
        </button>
      </div>
    </div>
  );
}

/**
 * Pick the element to highlight for a selector.
 *
 * Prefers an instance with real layout (handles the desktop-nav vs
 * mobile-bottom-nav duplicate), but falls back to any matching element
 * that isn't explicitly hidden. offsetParent alone is too strict — it
 * returns null for elements inside a position:fixed ancestor, which
 * would silently drop perfectly visible steps.
 */
function resolveTarget(selector: string): HTMLElement | null {
  const matches = Array.from(document.querySelectorAll<HTMLElement>(selector));
  if (matches.length === 0) return null;

  const laidOut = matches.find((el) => el.getClientRects().length > 0);
  if (laidOut) return laidOut;

  const notHidden = matches.find((el) => {
    const cs = window.getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden";
  });
  return notHidden ?? null;
}

/**
 * Drop this once per page (or once in a persistent layout like
 * AppShell), anywhere in the JSX tree — it renders nothing itself,
 * Joyride portals its own UI. All step text comes from tourContent.ts;
 * nothing here needs to change when you edit copy.
 *
 * Role-aware by construction: steps whose target never appears are
 * dropped, so a page that hides tabs or buttons for some roles simply
 * gets a shorter tour — no missing-target breakage, and no per-role
 * step lists to keep in sync.
 *
 * Forceful mode: overlay-click and Esc do nothing, and clicking the
 * highlighted element itself does nothing — the only ways to move are
 * Next/Back, or the small "skip" text in the tooltip's corner.
 */
export default function TourGuide({ page, waitForPage, ready = true }: TourGuideProps) {
  const content = tourContent[page] ?? [];
  const [steps, setSteps] = useState<Step[]>([]);

  // Targets don't all exist on the first painted frame: tab panels,
  // async data, and child components can land several frames later.
  // Poll briefly, start as soon as every target is found, and after the
  // timeout run with whatever did appear (that's the role-gated case).
  useEffect(() => {
    if (!ready) {
      setSteps([]);
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    function build(found: typeof content): Step[] {
      return found.map<Step>((s) => ({
        // Re-query at display time too: the visible instance can change
        // (desktop nav vs mobile bottom nav) if the viewport resizes.
        target: () => resolveTarget(s.target),
        title: s.title,
        content: s.content,
        placement: s.placement ?? "auto",
      }));
    }

    function attempt() {
      if (cancelled) return;
      const found = content.filter((s) => resolveTarget(s.target) !== null);

      if (found.length === content.length || Date.now() - startedAt >= RESOLVE_TIMEOUT_MS) {
        if (found.length < content.length) {
          const missing = content
            .filter((s) => resolveTarget(s.target) === null)
            .map((s) => s.target);
          console.warn(
            `[TourGuide] page "${String(page)}": skipping ${missing.length} step(s) with no target in the DOM:`,
            missing
          );
        }
        setSteps(build(found));
        return;
      }
      setTimeout(attempt, RESOLVE_INTERVAL_MS);
    }

    attempt();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, ready]);

  const { run, stepIndex, handleCallback } = useTourManager(page, steps.length, waitForPage);

  if (steps.length === 0) return null;

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      onEvent={handleCallback}
      tooltipComponent={CustomTooltip}
      options={{
        dismissKeyAction: false, // Esc does nothing
        overlayClickAction: false, // clicking the overlay does nothing
        blockTargetInteraction: true, // clicking the highlighted element does nothing
        buttons: ["back", "primary", "skip"], // skip exists (see CustomTooltip), just quiet
        skipBeacon: true, // open the tooltip immediately, no pulsing dot first
        overlayColor: "rgba(14, 23, 18, 0.55)",
        zIndex: 10000,
      }}
      locale={{ back: "ተመለስ", next: "ቀጣይ", last: "ጨርስ" }}
    />
  );
}
