// Offer columns for an order line. `alias` is the table holding
// flash_sale_campaign_id, promotional_content_id and original_price.
const orderOfferColumns = (alias) => `
      ${alias}.flash_sale_campaign_id,
      ${alias}.promotional_content_id,
      ${alias}.original_price,
      (SELECT oc.title FROM campaigns oc WHERE oc.campaign_id = ${alias}.flash_sale_campaign_id) AS flash_sale_title,
      (SELECT ocz.title FROM content_zone_entries ocz WHERE ocz.content_id = ${alias}.promotional_content_id) AS offer_content_title`;

/** The offer applied to an order line, or null when it sold at the normal price. */
function orderOffer(row, paidPrice, quantity = 1) {
  const campaignId = row.flash_sale_campaign_id || null;
  const contentId = row.promotional_content_id || null;
  if (!campaignId && !contentId) return null;

  // Orders placed before original_price existed have no recorded normal price.
  const originalPrice = row.original_price == null ? null : Number(row.original_price);
  return {
    type: campaignId ? "flash_sale" : "promotional_offer",
    title: campaignId
      ? row.flash_sale_title || "Flash Sale"
      : row.offer_content_title || "Promotional offer",
    campaign_id: campaignId,
    content_id: contentId,
    original_price: originalPrice,
    savings:
      originalPrice === null
        ? 0
        : Math.max(0, originalPrice - Number(paidPrice)) * Number(quantity),
  };
}

module.exports = { orderOfferColumns, orderOffer };
