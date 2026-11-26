const POSTER_SCREENS = ['ProductModule', 'ServicesModule', 'PaymentsModule', 'DineOutModule'];

function validatePosterScreen(screen, campaignType) {
  if (!screen) return null;
  if (!POSTER_SCREENS.includes(screen) || !['poster', 'dashboard_poster'].includes(campaignType)) {
    const error = new Error('Choose a valid poster redirect_screen');
    error.statusCode = 400;
    throw error;
  }
  return screen;
}

module.exports = { POSTER_SCREENS, validatePosterScreen };
