const db = require("../../../../config/database");

const OFFER_ZONES = "'promotional_banner', 'offers_banner', 'brand_promotional_banner'";

/**
 * Active offer candidates per variant, cheapest first (flash sale wins ties).
 * Flash-sale candidates carry the quantity still available at that price.
 */
async function getOfferCandidates(variantIds, { conn = db, forUpdate = false } = {}) {
  const ids = [...new Set(variantIds.map(Number).filter((id) => id > 0))];
  const candidates = new Map();
  if (!ids.length) return candidates;
  const lock = forUpdate ? " FOR UPDATE" : "";

  const [flash] = await conn.query(
    `SELECT ci.variant_id, ci.campaign_id, ci.offer_price,
            ci.max_qty - COALESCE(ci.sold_qty, 0) AS remaining_qty
     FROM campaign_items ci
     JOIN campaigns c ON c.campaign_id = ci.campaign_id
     WHERE ci.variant_id IN (?)
       AND c.campaign_type = 'flash_sale'
       AND c.status = 'active'
       AND NOW() BETWEEN c.start_at AND c.end_at
       AND ci.offer_price > 0
       AND ci.max_qty > COALESCE(ci.sold_qty, 0)${lock}`,
    [ids],
  );
  const [content] = await conn.query(
    `SELECT o.variant_id, o.content_id, o.offer_price
     FROM content_effective_product_offers o
     JOIN content_zone_entries cze ON cze.content_id = o.content_id
     WHERE o.variant_id IN (?)
       AND o.offer_price > 0
       AND cze.module = 'product'
       AND cze.zone IN (${OFFER_ZONES})
       AND cze.is_published = 1
       AND (cze.start_at IS NULL OR cze.start_at <= NOW())
       AND (cze.end_at IS NULL OR cze.end_at >= NOW())`,
    [ids],
  );

  const add = (variantId, offer) => {
    const key = Number(variantId);
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(offer);
  };
  for (const row of flash) {
    add(row.variant_id, {
      price: Number(row.offer_price),
      campaignId: Number(row.campaign_id),
      contentId: null,
      remainingQty: Number(row.remaining_qty),
    });
  }
  for (const row of content) {
    add(row.variant_id, {
      price: Number(row.offer_price),
      campaignId: null,
      contentId: Number(row.content_id),
      remainingQty: null,
    });
  }
  for (const list of candidates.values()) {
    list.sort(
      (a, b) =>
        a.price - b.price ||
        Number(b.campaignId !== null) - Number(a.campaignId !== null) ||
        (a.campaignId ?? a.contentId) - (b.campaignId ?? b.contentId),
    );
  }
  return candidates;
}

/** Cheapest offer that can cover the quantity, or null for the normal price. */
function pickOffer(candidates, quantity = 1) {
  return (
    (candidates || []).find(
      (offer) => offer.remainingQty === null || offer.remainingQty >= quantity,
    ) || null
  );
}

/**
 * Overwrites each row's sale_price with its best active offer and marks it, so existing
 * formatters show the offer price and discount. Rows keep original_sale_price.
 */
async function applyActiveOffers(rows, { variantKey = "variant_id", conn = db } = {}) {
  const list = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
  const candidates = await getOfferCandidates(
    list.map((row) => row[variantKey]),
    { conn },
  );
  for (const row of list) {
    const offer = pickOffer(candidates.get(Number(row[variantKey])));
    row.original_sale_price = Number(row.sale_price) || 0;
    row.is_offer_price = Boolean(offer);
    row.offer_price = offer ? offer.price : null;
    row.campaign_id = offer ? offer.campaignId : null;
    row.content_id = offer ? offer.contentId : null;
    if (offer) row.sale_price = offer.price;
  }
  return rows;
}

/**
 * Prices cart/checkout lines: sets sale_price, flash_sale_campaign_id and
 * promotional_content_id from the best offer covering each line's quantity.
 */
async function priceLines(lines, { conn = db, forUpdate = false } = {}) {
  const candidates = await getOfferCandidates(
    lines.map((line) => line.variant_id),
    { conn, forUpdate },
  );
  for (const line of lines) {
    const offer = pickOffer(
      candidates.get(Number(line.variant_id)),
      Number(line.quantity) || 1,
    );
    line.base_sale_price = Number(line.base_sale_price ?? line.sale_price) || 0;
    line.sale_price = offer ? offer.price : line.base_sale_price;
    line.offer_price = offer ? offer.price : null;
    line.flash_sale_campaign_id = offer ? offer.campaignId : null;
    line.promotional_content_id = offer ? offer.contentId : null;
  }
  return lines;
}

/** Flash-sale units still available at the best offer price, or null when not limited. */
async function getFlashSaleLimit(variantId, { conn = db, forUpdate = false } = {}) {
  const candidates = await getOfferCandidates([variantId], { conn, forUpdate });
  const best = pickOffer(candidates.get(Number(variantId)));
  return best && best.remainingQty !== null ? best.remainingQty : null;
}

module.exports = {
  getOfferCandidates,
  pickOffer,
  applyActiveOffers,
  priceLines,
  getFlashSaleLimit,
};
