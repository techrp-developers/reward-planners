const db = require("../../../../config/database");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceBundleModel {
  async getBundleItems(bundleId) {
    const [rows] = await db.execute(
      `
    SELECT 
      bi.id,
      bi.service_id,
      bi.variant_id,
      bi.price as bundle_price,
      bi.is_required,

      s.name AS service_name,
      s.rating,
      (
        SELECT COUNT(*)
        FROM service_feedback sf
        JOIN service_orders so ON so.id = sf.service_order_id
        WHERE so.service_id = s.id
      ) AS review_count,
      sv.variant_name,
      sv.price,
      sv.title,
      sv.image_url

    FROM service_bundle_items bi
    JOIN services s ON s.id = bi.service_id
    JOIN service_variants sv ON sv.id = bi.variant_id

    WHERE bi.bundle_id = ?
    ORDER BY bi.sort_order
    `,
      [bundleId],
    );

    // return rows;

    return rows.map((item) => ({
      ...item,
      rating: Number(item.rating || 0),
      review_count: Number(item.review_count || 0),
      image_url: item.image_url,
    }));
  }

  async getBundleSections(bundleId) {
    const [rows] = await db.execute(
      `
    SELECT section_type, title, content
    FROM service_bundle_sections
    WHERE bundle_id = ?
    ORDER BY sort_order
    `,
      [bundleId],
    );

    return rows.map((r) => ({
      ...r,
      content: r.content ? JSON.parse(r.content) : null,
    }));
  }
}

module.exports = new ServiceBundleModel();
