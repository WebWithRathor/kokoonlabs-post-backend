// All "day" logic (streaks, deadlines, early bonus) runs on IST for every student.
const IST = 'Asia/Kolkata';

// 'YYYY-MM-DD' for a moment, as a calendar day in IST
export const istDay = (d: Date | number = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(d));

// Shift an 'YYYY-MM-DD' day by n days (calendar arithmetic, no time zone)
export const shiftDay = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// Whole days from day a to day b (b - a), both 'YYYY-MM-DD'
export const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
