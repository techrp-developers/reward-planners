const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

for (const cleanupFails of [false, true]) {
  test(`BBPS recovery failure ${cleanupFails ? 'destroys unusable connection' : 'rolls back before release'}`, async () => {
    const events = [];
    let rollbackCount = 0;
    let run;
    const conn = {
      async beginTransaction() { events.push('begin'); },
      async rollback() {
        events.push('rollback');
        if (++rollbackCount === 2 && cleanupFails) throw new Error('connection lost');
      },
      async commit() { assert.fail('failed recovery must not commit'); },
      release() { events.push('release'); },
      destroy() { events.push('destroy'); },
    };
    const deps = {
      '../rewards/transactionRewardService': {},
      '../mailBuilder/transactionSuccess': {},
      'node-cron': { schedule(_schedule, callback) { run = callback; } },
      '../../app/bbps/v1/models/transactionModel': {
        async getRetryable() { return [{ id: 102 }]; },
        async getByIdForUpdate() { return { id: 102, bbps_status: 'FAILED_RETRY', retry_count: 0, max_retry: 5 }; },
        async incrementRetry() { throw new Error('recovery write timeout'); },
      },
      '../../app/bbps/v1/models/refundModel': {},
      '../../app/bbps/v1/services/paymentProcessor': {
        async processTransaction() { throw new Error('provider failure'); },
      },
      '../../config/database': { async getConnection() { return conn; } },
      '../../services/cronMonitor': {},
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../services/Bbps/retryCron'), 'utf8'), {
      require(name) { assert.ok(name in deps, name); return deps[name]; },
      console: { log() {}, error() {} },
    });
    await assert.rejects(run(), /recovery write timeout/);
    assert.deepEqual(events, ['begin', 'rollback', 'begin', 'rollback', cleanupFails ? 'destroy' : 'release']);
  });
}
