/**
 * Normalize Indian mobile numbers to exactly 10 digits (leading digit 6–9).
 * Accepts formats like +91 98765 43210, 09876543210, 919876543210.
 * @param {unknown} input
 * @returns {string | null}  digits only or null if invalid
 */
export function normalizeIndiaMobilePhone(input) {
  if (input == null) return null;
  let digits = String(input).replace(/\D/g, '');
  if (digits.length >= 11 && digits.startsWith('91')) {
    digits = digits.slice(-10);
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return null;
}
