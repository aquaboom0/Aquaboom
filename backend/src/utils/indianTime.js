/** Calendar bounds in IST (India) for grouping "today". */

export function startOfIndianCalendarDay(referenceDate = new Date()) {
  const ymd = referenceDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  return new Date(`${ymd}T00:00:00+05:30`);
}

/** Exclusive upper bound for same IST calendar day slice ( midnight next IST day ). */
export function exclusiveEndIndianCalendarDay(referenceDate = new Date()) {
  return new Date(startOfIndianCalendarDay(referenceDate).getTime() + 24 * 60 * 60 * 1000);
}

/** IST midnight for the calendar date that is `daysBeforeToday` days before today's IST date (0 = today). */
export function indianCalendarStartMinusDays(daysBeforeToday = 0, referenceDate = new Date()) {
  const startToday = startOfIndianCalendarDay(referenceDate);
  return new Date(startToday.getTime() - daysBeforeToday * 24 * 60 * 60 * 1000);
}
