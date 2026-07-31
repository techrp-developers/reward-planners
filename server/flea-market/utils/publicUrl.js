// Matches server/app/ecommerce/v1/models/productModel.js's getPublicUrl —
// same CDN convention, copied locally since that one isn't exported.
const CDN_BASE_URL = "https://cdn.rewardplanners.com";

function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

module.exports = { getPublicUrl };
