// ============================================================
// TOUR CONTENT — the ONLY file you should need to edit for text
// ============================================================
// Each key is a page name. Each page has an ordered array of steps.
// `target` must match a `data-tour="..."` attribute you've added to
// the element in that page's JSX — nothing else needs to change when
// you edit text here. If the same data-tour value appears more than
// once in the DOM (e.g. a desktop nav + a mobile bottom nav), Joyride
// automatically targets whichever copy is actually visible.

export interface TourStepContent {
  /** CSS selector — must match a data-tour attribute in the page JSX. */
  target: string;
  /** Short bold heading shown above the body text. */
  title?: string;
  /** Body text shown to the user (Amharic). */
  content: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
}

export const tourContent: Record<string, TourStepContent[]> = {
  // Lives in AppShell.tsx — the persistent navbar wrapping every page.
  // Runs once, before any page-specific tour (see waitForPage in TourGuide).
  // Home and the profile photo are intentionally NOT included.
  appshell: [
    {
      target: '[data-tour="tour-teams"]',
      title: "የኔ ቡድኖች",
      content: "ይህንን በመጫን የፈጠሯቸውን ወይም የተቀላቀሏቸውን ቡድኖች እዚህ ማግኘት ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-pitches"]',
      title: "ሜዳዎች",
      content: "ይህንን በመጫን የሚፈልጓቸውን ሁሉንም ሜዳዎች እዚህ ማግኘት እና መያዝ ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-discover"]',
      title: "ያስሱ",
      content: "ይህንን በመጫን ሌሎች ቡድኖች የፈጠሯቸውን ቡድኖች ወይም ጨዋታዎች በመፈለግ መሳተፍ ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-chat"]',
      title: "ውይይት",
      content: "ይህንን በመጫን ከቡድንዎ ጋር መጻጻፍ ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-notifications"]',
      title: "ማሳወቂያዎች",
      content: "ይህንን በመጫን አዳዲስ መረጃዎችን ማግኘት ይችላሉ።",
      placement: "bottom",
    },
  ],

  home: [
    {
      target: '[data-tour="tour-pitchbook"]',
      title: "ሜዳ ይያዙ",
      content: "ይህንን በመጫን የስፖርት ሜዳዎችን መያዝ ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-findmatch"]',
      title: "ጨዋታ ያግኙ",
      content: "ይህንን በመጫን ጨዋታዎችን ማግኘት እና መሳተፍ ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-createteam"]',
      title: "ቡድን ይፍጠሩ",
      content: "ይህንን በመጫን የራስዎን ቡድን መፍጠር ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-upcoming-matches"]',
      title: "የሚመጡ ጨዋታዎች",
      content: "የእርሶን በቅርቡ የሚደረጉ ጨዋታዎችን በዚህ ማየት ይችላሉ።",
      placement: "top",
    },
  ],
  app: [
    {
      target: '[data-tour="tour-nearby"]',
      title: "አቅራቢያ",
      content: "ይህንን በመጫን በአቅራቢያዎት ያሉ ሜዳዎችን ማግኘት ይችላሉ።",
      placement: "bottom",
    },
  ],

    discover: [
    {
      target: '[data-tour="tour-findteam"]',
      title: "ቡድን ያግኙ",
      content: "ክፍት የሆኑ ቡድኖችን ማግኘት እና የቡድኑ አባል መሆን ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-findmatch-mode"]',
      title: "ጨዋታ ያግኙ",
      content: "ይህንን በመጫን ክፍት የሆኑ በቡድኖች የተከፈቱ ጨዋታዎችን ፈልገው መሳተፍ ይችላሉ።",
      placement: "bottom",
    },
  ],


    teamDashboard: [
    {
      target: '[data-tour="tour-team-overview"]',
      title: "አጠቃላይ እይታ",
      content: "ስለ ቡድኑ ዝርዝር መረጃ እዚህ ማየት ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-team-roster"]',
      title: "አባላትን ያስተዳድሩ",
      content: "የቡድኑን አባላትን እዚህ ማግኘት ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-team-matches"]',
      title: "ጨዋታዎች",
      content: "ይህ ቡድን ያሉትን ጨዋታዎች እዚህ ማየት ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-team-bookings"]',
      title: "ቦታ ማስያዣዎች",
      content: "ይህ ቡድን የያዛቸውን ሜዳዎች በሙሉ እዚህ ማየት ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-add-player"]',
      title: "ተጫዋች ይጨምሩ",
      content: "ይህንን በመጫን ለሌሎች ተጫዋቾች ወደ ቡድንዎ ማስገባት ይችላሉ።",
      placement: "bottom",
    },
    {
      target: '[data-tour="tour-active-members"]',
      title: "አባላት",
      content: "የቡድኑን አባላት በሙሉ እዚህ ያገኛሉ",
      placement: "top",
    },
    {
      target: '[data-tour="tour-invitations"]',
      title: "ግብዣዎች",
      content: "የተላኩ ግብዣዎች እዚህ ይታያሉ፤ መሰረዝ፣ ማጥፋት ወይም ማስተካከል ይችላሉ።",
      placement: "top",
    },
    {
      target: '[data-tour="tour-join-requests"]',
      title: "የመቀላቀል ጥያቄዎች",
      content: "አባል ያልሆኑ ተጫዋቾች የላኩትን የመቀላቀል ጥያቄ እዚህ ማየት ይችላሉ።",
      placement: "top",
    },
  ],
  // Add the other pages the same way, e.g.:
  // discover: [
  //   { target: '[data-tour="tour-filter"]', title: "...", content: "..." },
  // ],
  // team: [ ... ],
  // owner: [ ... ],
  // pitchDetail: [ ... ],
};
