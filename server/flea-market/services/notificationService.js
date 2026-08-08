// Stub — swap for a real SMS/email provider (Interakt, SES, etc.) without touching callers.
class NotificationService {
  async sendSms(phone, message) {
    console.log(`[flea-market] STUB SMS to ${phone}: ${message}`);
  }

  async sendEmail(email, subject, message) {
    console.log(`[flea-market] STUB EMAIL to ${email} [${subject}]: ${message}`);
  }
}

module.exports = new NotificationService();
