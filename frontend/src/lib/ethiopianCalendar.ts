// Self-contained Gregorian <-> Ethiopian calendar conversion + Amharic
// labels. Pure date-math (proleptic Julian Day Number), no dependency.

export type EthiopianDate = { year: number; month: number; day: number };


const ETHIOPIAN_EPOCH_JDN = 1724221;

function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

export function gregorianToEthiopian(date: Date): EthiopianDate {
  const jdn = gregorianToJDN(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const n0 = jdn - ETHIOPIAN_EPOCH_JDN; // 0-indexed day count since Eth. epoch

  const c = Math.floor(n0 / 1461); // completed 4-year cycles
  const li = n0 - 1461 * c;        // 0..1460 position within the cycle

  let yearOffset: number;
  let dayOfYear: number;
  if (li < 365) {
    yearOffset = 0; dayOfYear = li;
  } else if (li < 730) {
    yearOffset = 1; dayOfYear = li - 365;
  } else if (li < 1096) {
    yearOffset = 2; dayOfYear = li - 730; // the leap year of the cycle (366 days)
  } else {
    yearOffset = 3; dayOfYear = li - 1096;
  }

  const year = 4 * c + yearOffset + 1;
  const month = Math.floor(dayOfYear / 30) + 1;
  const day = (dayOfYear % 30) + 1;

  return { year, month, day };
}

export function ethiopianToGregorian(year: number, month: number, day: number): Date {
  const c = Math.floor((year - 1) / 4);
  const yearOffset = (year - 1) - 4 * c; // 0,1,2,3 — position of this year within its cycle
  const yearStartLi = [0, 365, 730, 1096][yearOffset];

  const dayOfYear = 30 * (month - 1) + (day - 1);
  const li = yearStartLi + dayOfYear;
  const n0 = 1461 * c + li;

  const jdn = n0 + ETHIOPIAN_EPOCH_JDN;
  const g = jdnToGregorian(jdn);
  return new Date(g.year, g.month - 1, g.day);
}

export function isEthiopianLeapYear(ethYear: number): boolean {
  return (ethYear) % 4 === 0;
}

export function daysInEthiopianMonth(ethYear: number, ethMonth: number): number {
  if (ethMonth === 13) return isEthiopianLeapYear(ethYear) ? 6 : 5;
  return 30;
}

export const ETHIOPIAN_MONTH_NAMES = [
  "መስከረም", "ጥቅምት", "ኅዳር", "ታኅሳስ", "ጥር", "የካቲት",
  "መጋቢት", "ሚያዝያ", "ግንቦት", "ሰኔ", "ሐምሌ", "ነሐሴ", "ጳጉሜ",
];

// Index-aligned with JS Date.getDay() (0 = Sunday ... 6 = Saturday)
export const AMHARIC_WEEKDAYS = ["እሁድ", "ሰኞ", "ማክሰኞ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];
export const AMHARIC_WEEKDAYS_SHORT = ["እሁድ", "ሰኞ", "ማክሰ", "ረቡዕ", "ሐሙስ", "ዓርብ", "ቅዳሜ"];

export function amharicWeekday(date: Date, short = false): string {
  return (short ? AMHARIC_WEEKDAYS_SHORT : AMHARIC_WEEKDAYS)[date.getDay()];
}

export function formatEthiopianDateShort(ethDate: EthiopianDate): string {
  return `${ethDate.day} ${ETHIOPIAN_MONTH_NAMES[ethDate.month - 1].slice(0, 4)}`;
}

export function formatEthiopianDateFull(ethDate: EthiopianDate): string {
  return `${ethDate.day} ${ETHIOPIAN_MONTH_NAMES[ethDate.month - 1]} ${ethDate.year}`;
}

/** Everyday (non-liturgical) four-part split of the day, in Gregorian
 * 24h hour-of-day terms. */
export function ethiopianDayPart(hour24: number): string {
  if (hour24 >= 6 && hour24 < 12) return "ጠዋት";   // morning
  if (hour24 >= 12 && hour24 < 18) return "ከሰዓት";  // afternoon
  if (hour24 >= 18 && hour24 < 21) return "ምሽት";   // evening
  return "ማታ";                                     // night
}

/** Ethiopian clock hour is offset 6h from the standard clock
 * (Ethiopian "1:00" ≈ 7:00 standard time). */
export function toEthiopianClockHour(hour24: number): number {
  const h = (((hour24 - 6) % 12) + 12) % 12;
  return h === 0 ? 12 : h;
}

export function formatEthiopianHourRange(startHour: number, endHour24: number): string {
  const endHourForPart = endHour24 === 24 ? 0 : endHour24;
  const start = `${toEthiopianClockHour(startHour)}:00 ${ethiopianDayPart(startHour)}`;
  const end = `${toEthiopianClockHour(endHourForPart)}:00 ${ethiopianDayPart(endHourForPart)}`;
  return `${start} – ${end}`;
}

export function formatEthiopianHourLabel(hour24: number): string {
  const h = hour24 === 24 ? 0 : hour24;
  return `${toEthiopianClockHour(h)}:00 ${ethiopianDayPart(h)}`;
}

export function currentEthiopianDate(): EthiopianDate {
  return gregorianToEthiopian(new Date());
}