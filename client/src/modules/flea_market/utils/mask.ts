/* ================= MASKING HELPERS ================= */
// Shared by the OTP verification step and the invoice view so a customer's
// full phone/email never needs to be displayed on-screen at the billing
// counter.

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const visible = user.slice(0, 1);
  return `${visible}${"•".repeat(Math.max(user.length - 1, 1))}@${domain}`;
}
