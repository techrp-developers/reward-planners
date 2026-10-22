const db = require("../../../../config/database");
const { calculateServiceRewards } = require("./serviceRewards");

// A service banner offer is live only while its CMS entry is published and
// inside its schedule; the view resolves which variants it prices.
const LIVE_SERVICE_OFFER_SQL = `
  SELECT cso.content_id, cso.service_id, cso.variant_id, cso.offer_price
  FROM content_effective_service_offers cso
  JOIN content_zone_entries cze ON cze.content_id = cso.content_id
  WHERE cze.module = 'service'
    AND cze.zone IN ('promotional_banner', 'offers_banner', 'brand_promotional_banner')
    AND cze.is_published = 1
    AND (cze.start_at IS NULL OR cze.start_at <= NOW())
    AND (cze.end_at IS NULL OR cze.end_at >= NOW())`;

function toContentId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Map of variant_id -> live offer price for one service on one banner. */
async function getLiveServiceOfferPrices(contentId, serviceId, conn = db) {
  const id = toContentId(contentId);
  if (!id) return new Map();
  const [rows] = await conn.execute(
    `${LIVE_SERVICE_OFFER_SQL} AND cso.content_id = ? AND cso.service_id = ?`,
    [id, Number(serviceId)],
  );
  return new Map(rows.map((row) => [Number(row.variant_id), Number(row.offer_price)]));
}

/** Live offer price for one variant, or null when the banner does not price it. */
async function getLiveServiceOfferPrice(contentId, variantId, conn = db) {
  const id = toContentId(contentId);
  if (!id) return null;
  const [[row]] = await conn.execute(
    `${LIVE_SERVICE_OFFER_SQL} AND cso.content_id = ? AND cso.variant_id = ?`,
    [id, Number(variantId)],
  );
  return row ? Number(row.offer_price) : null;
}

// Offer prices bypass the variant price. Coins are still earned on the offer
// price, but redemption is disabled, matching ecommerce banner offers.
function serviceOfferRewards(price, variant, isOffer) {
  return calculateServiceRewards(
    price,
    isOffer ? { ...variant, can_redeem_reward: 0 } : variant,
  );
}

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

/**
 * Live offer total for a whole bundle on a banner, or null. An individual
 * bundle price wins; otherwise the banner's shared discount is applied to the
 * bundle total (a fixed discount comes off once per bundle).
 */
async function getLiveBundleOfferTotal(contentId, bundleId, bundleTotal, conn = db) {
  const id = toContentId(contentId);
  if (!id || !(Number(bundleTotal) > 0)) return null;
  const [[row]] = await conn.execute(
    `SELECT e.discount_type, e.discount_value, o.offer_price
     FROM content_zone_entries e
     LEFT JOIN content_bundle_offers o ON o.content_id = e.content_id AND o.bundle_id = ?
     WHERE e.content_id = ?
       AND e.module = 'service'
       AND e.zone IN ('promotional_banner', 'offers_banner', 'brand_promotional_banner')
       AND e.is_published = 1
       AND (e.start_at IS NULL OR e.start_at <= NOW())
       AND (e.end_at IS NULL OR e.end_at >= NOW())
       AND ((e.target_type = 'service_bundle' AND e.target_id = ?)
         OR EXISTS (SELECT 1 FROM content_zone_entry_images i
                    WHERE i.content_id = e.content_id AND i.is_active = 1
                      AND i.target_type = 'service_bundle' AND i.target_id = ?))`,
    [Number(bundleId), id, Number(bundleId), Number(bundleId)],
  );
  if (!row) return null;
  if (row.offer_price != null) return Number(row.offer_price);
  const total = Number(bundleTotal);
  const value = Number(row.discount_value || 0);
  if (!(value > 0)) return null;
  if (row.discount_type === "percentage") return Math.max(0.01, roundMoney(total * (1 - value / 100)));
  if (row.discount_type === "fixed") return Math.max(0.01, roundMoney(total - value));
  return null;
}

/**
 * Split a bundle offer total across its items in proportion to their bundle
 * prices. Rounding goes to the last item so the parts sum to the total.
 */
function splitBundleOffer(prices, offerTotal) {
  const base = prices.reduce((sum, price) => sum + Number(price || 0), 0);
  let allocated = 0;
  return prices.map((price, index) => {
    if (index === prices.length - 1) return roundMoney(offerTotal - allocated);
    const share = base > 0 ? Number(price || 0) / base : 1 / prices.length;
    const part = roundMoney(offerTotal * share);
    allocated = roundMoney(allocated + part);
    return part;
  });
}

module.exports = {
  LIVE_SERVICE_OFFER_SQL,
  toContentId,
  getLiveServiceOfferPrices,
  getLiveServiceOfferPrice,
  serviceOfferRewards,
  getLiveBundleOfferTotal,
  splitBundleOffer,
};
