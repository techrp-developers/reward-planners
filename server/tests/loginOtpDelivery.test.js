const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

for (const method of ['activateAccount', 'resendActivationOTP']) {
  for (const channel of ['phone', 'email']) {
    for (const accepted of [true, false]) {
      test(`${method}: ${channel} provider acceptance=${accepted}`, async () => {
        let attempted = false;
        const context = {
          module: { exports: {} }, process: { env: { NODE_ENV: 'production' } },
          console: { error() {} },
          require(name) {
            if (name.endsWith('/authModel')) return {
              findEmployeeByEmail: async () => ({ id: 1, phone: '9876543210' }),
              findEmployeeByPhone: async () => ({ id: 1, phone: '9876543210' }),
              findByCompanyUserId: async () => null,
              deleteOTPByEmail: async () => {}, storeActivationOTP: async () => {},
            };
            if (name.endsWith('/sendOtp')) return { sendOtpMail: async () => {
              await Promise.resolve(); attempted = true;
              if (!accepted) throw new Error('Mail unavailable');
            } };
            if (name.endsWith('/waEnqueueService')) return { enqueueWhatsApp: async args => {
              assert.equal(args.sendImmediately, true);
              await Promise.resolve(); attempted = true;
              return { ok: accepted };
            } };
            if (name === 'crypto') return require('node:crypto');
            return {};
          },
        };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/common/controller/authController.js'), 'utf8'), context);
        const res = { code: 200, status(code) { this.code = code; return this; }, json(body) {
          assert.equal(attempted, true); this.body = body; return this;
        } };
        await context.module.exports[method]({ body: channel === 'email' ? { email: 'user@example.com' } : { phone: '9876543210' } }, res);
        assert.equal(res.code, accepted ? 200 : 503);
        assert.equal(res.body.success, accepted);
        if (!accepted) assert.equal(res.body.code, 'OTP_DELIVERY_FAILED');
      });
    }
  }
}

test('immediate WhatsApp rejection never queues a delayed OTP', async () => {
  const queries = [];
  const context = { module: { exports: {} }, console: { error() {} }, require(name) {
    if (name.endsWith('/database')) return { query: async sql => {
      queries.push(sql);
      return sql.includes('wa_rules') ? [[{ template_key: 'onbord_verify' }]] : [[{ interakt_name: 'onbord_verify', body_values_count: 1 }]];
    } };
    if (name === './phone') return { normalizeIndianMobile: () => '+919876543210' };
    if (name === './interaktService') return { sendTemplateMessage: async () => { throw Object.assign(new Error('Subscription restricted'), { response: { status: 403 } }); } };
    throw new Error(name);
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../services/whatsapp/waEnqueueService.js'), 'utf8'), context);
  const result = await context.module.exports.enqueueWhatsApp({ eventName: 'onbord_verify', ctx: { phone: '9876543210', otp: '123456' }, sendImmediately: true });
  assert.equal(result.ok, false);
  assert.equal(queries.length, 2);
  assert.equal(queries.some(sql => sql.includes('INSERT')), false);
});
