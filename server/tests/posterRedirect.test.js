const { test } = require('node:test');
const assert = require('node:assert/strict');
const { POSTER_SCREENS, validatePosterScreen } = require('../utils/posterRedirect');
const { campaignNavigation } = require('../utils/contentNavigation');

test('all four module destinations work without a catalogue target', () => {
  for (const screen of POSTER_SCREENS) {
    for (const type of ['poster', 'dashboard_poster']) {
      assert.equal(validatePosterScreen(screen, type), screen);
    }
    assert.deepEqual(campaignNavigation({ campaign_id: 7, redirect_screen: screen }), {
      destination: screen, campaignId: 7,
    });
  }
});

test('invalid screens and non-poster campaigns are rejected', () => {
  for (const [screen, type] of [['UnknownModule', 'poster'], ['ProductModule', 'flash_sale']]) {
    assert.throws(() => validatePosterScreen(screen, type), { statusCode: 400 });
  }
  assert.equal(validatePosterScreen('', 'poster'), null);
  assert.equal(validatePosterScreen(undefined, 'flash_sale'), null);
});
