const db = require("../../../../config/database");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceBannerModel {
  // create banner
  async create(data) {
    const [result] = await db.execute(
      `INSERT INTO service_banners
    (title, subtitle, image_url, redirect_type, redirect_id, redirect_url, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title || null,
        data.subtitle || null,
        data.image_url,
        data.redirect_type || "service",
        data.redirect_id || null,
        data.redirect_url || null,
        data.sort_order || 0,
      ],
    );

    return {
      id: result.insertId,
    };
  }

  async getActiveBanners() {
    const [rows] = await db.execute(
      `
    SELECT 
      id,
      title,
      subtitle,
      image_url,
      redirect_type,
      redirect_id,
      redirect_url

    FROM service_banners
    WHERE is_active = 1
    ORDER BY sort_order ASC, id DESC
    `,
    );

    return rows.map((b) => ({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      image_url: getPublicUrl(b.image_url),

      redirect: {
        type: b.redirect_type,
        id: b.redirect_id,
        url: b.redirect_url,
      },
    }));
  }
}

module.exports = new ServiceBannerModel();
