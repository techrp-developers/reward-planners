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

// A service flash sale is live only inside its schedule and below the current
// normal price, which can drop after the offer is saved. Unlike ecommerce it
// carries no unit cap: services have no stock to reserve.
const LIVE_SERVICE_FLASH_SQL = `
  SELECT csi.campaign_id, csi.service_id, csi.variant_id, csi.offer_price
  FROM campaign_service_items csi
  JOIN campaigns c ON c.campaign_id = csi.campaign_id
  JOIN service_variants fv ON fv.id = csi.variant_id AND fv.status = 1
  WHERE c.campaign_type = 'flash_sale'
    AND c.module = 'service'
    AND c.status = 'active'
    AND NOW() BETWEEN c.start_at AND c.end_at
    AND csi.offer_price < fv.price`;

const LIVE_SERVICE_PRICE_SQL = `
  SELECT banner.content_id, NULL AS campaign_id, banner.service_id, banner.variant_id, banner.offer_price
  FROM (${LIVE_SERVICE_OFFER_SQL}) banner
  JOIN service_variants bv ON bv.id = banner.variant_id
  WHERE banner.offer_price <= bv.price
  UNION ALL
  SELECT NULL AS content_id, flash.campaign_id, flash.service_id, flash.variant_id, flash.offer_price
  FROM (${LIVE_SERVICE_FLASH_SQL}) flash`;

function toContentId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const positiveIds = (ids) => [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];

// Offers apply wherever the service is shown, not only when the app arrives
// from the banner: the lowest live offer wins, matching ecommerce (flash sale wins ties).

/** Map of variant_id -> { price, contentId, campaignId } for the cheapest live offer. */
async function getBestServiceOffers(variantIds, conn = db) {
  const ids = positiveIds(variantIds);
  const best = new Map();
  if (!ids.length) return best;
  const [rows] = await conn.query(
    `SELECT live.* FROM (${LIVE_SERVICE_PRICE_SQL}) live
     WHERE live.variant_id IN (?) AND live.offer_price > 0
     ORDER BY live.offer_price ASC, live.campaign_id IS NULL ASC, live.content_id ASC`,
    [ids],
  );
  for (const row of rows) {
    if (!best.has(Number(row.variant_id))) {
      best.set(Number(row.variant_id), {
        price: Number(row.offer_price),
        contentId: row.content_id == null ? null : Number(row.content_id),
        campaignId: row.campaign_id == null ? null : Number(row.campaign_id),
      });
    }
  }
  return best;
}

async function getBestServiceOffer(variantId, conn = db) {
  return (await getBestServiceOffers([variantId], conn)).get(Number(variantId)) || null;
}

/**
 * Adds the lowest live offer across each service's variants to listing rows
 * ("from ₹x"): offer_price, regular_price (that variant's normal price), content_id, campaign_id.
 */
async function attachServiceOffers(services, idKey = "id", conn = db) {
  const list = (services || []).filter(Boolean);
  const ids = positiveIds(list.map((service) => service[idKey]));
  if (!ids.length) return services;
  const [rows] = await conn.query(
    `SELECT live.service_id, live.content_id, live.campaign_id, live.offer_price, v.price AS regular_price
     FROM (${LIVE_SERVICE_PRICE_SQL}) live
     JOIN service_variants v ON v.id = live.variant_id
     WHERE live.service_id IN (?) AND live.offer_price > 0
     ORDER BY live.offer_price ASC, live.campaign_id IS NULL ASC, live.content_id ASC`,
    [ids],
  );
  const best = new Map();
  for (const row of rows) {
    if (!best.has(Number(row.service_id))) best.set(Number(row.service_id), row);
  }
  for (const service of list) {
    const offer = best.get(Number(service[idKey]));
    service.offer_price = offer ? Number(offer.offer_price) : null;
    service.regular_price = offer ? Number(offer.regular_price) : null;
    service.content_id = offer && offer.content_id != null ? Number(offer.content_id) : null;
    service.campaign_id = offer && offer.campaign_id != null ? Number(offer.campaign_id) : null;
    service.is_offer = Boolean(offer);
  }
  return services;
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
 * Cheapest live banner offer for a whole bundle: { total, contentId } or null.
 * Per banner, an individual bundle price wins; otherwise the banner's shared
 * discount is applied to the bundle total (a fixed discount comes off once).
 */
async function getBestBundleOffer(bundleId, bundleTotal, conn = db) {
  if (!(Number(bundleTotal) > 0)) return null;
  const [rows] = await conn.execute(
    `SELECT e.content_id, e.discount_type, e.discount_value, o.offer_price
     FROM content_zone_entries e
     LEFT JOIN content_bundle_offers o ON o.content_id = e.content_id AND o.bundle_id = ?
     WHERE e.module = 'service'
       AND e.zone IN ('promotional_banner', 'offers_banner', 'brand_promotional_banner')
       AND e.is_published = 1
       AND (e.start_at IS NULL OR e.start_at <= NOW())
       AND (e.end_at IS NULL OR e.end_at >= NOW())
       AND ((e.target_type = 'service_bundle' AND e.target_id = ?)
         OR EXISTS (SELECT 1 FROM content_zone_entry_images i
                    WHERE i.content_id = e.content_id AND i.is_active = 1
                      AND i.target_type = 'service_bundle' AND i.target_id = ?))`,
    [Number(bundleId), Number(bundleId), Number(bundleId)],
  );
  const total = Number(bundleTotal);
  let best = null;
  for (const row of rows) {
    const value = Number(row.discount_value || 0);
    let offerTotal = null;
    if (row.offer_price != null) offerTotal = Number(row.offer_price);
    else if (value > 0 && row.discount_type === "percentage") offerTotal = Math.max(0.01, roundMoney(total * (1 - value / 100)));
    else if (value > 0 && row.discount_type === "fixed") offerTotal = Math.max(0.01, roundMoney(total - value));
    if (offerTotal === null || !(offerTotal > 0) || offerTotal > total) continue;
    const contentId = Number(row.content_id);
    if (!best || offerTotal < best.total || (offerTotal === best.total && contentId < best.contentId)) {
      best = { total: offerTotal, contentId };
    }
  }
  return best;
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
  getBestServiceOffers,
  getBestServiceOffer,
  attachServiceOffers,
  serviceOfferRewards,
  getBestBundleOffer,
  splitBundleOffer,
};
