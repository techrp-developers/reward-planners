-- A session can now exist before OTP verification (picked from customer search,
-- not yet OTP-proven — see sessionModel.createUnverified / otpService.selectCustomer).
-- NULL means "not yet OTP-verified"; checkoutService gates reward-point redemption on this.
ALTER TABLE flea_market_sessions
  MODIFY COLUMN otp_verified_at TIMESTAMP NULL DEFAULT NULL;
