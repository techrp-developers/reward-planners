const db = require("../../../../config/database");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path, updatedAt) {
  if (!path) return null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${CDN_BASE_URL}/${path}${version}`;
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
      updated_at,
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
      image_url: getPublicUrl(b.image_url, b.updated_at),

      redirect: {
        type: b.redirect_type,
        id: b.redirect_id,
        url: b.redirect_url,
      },
    }));
  }

  // find banner
  async findById(id) {
    const [[row]] = await db.execute(
      `
    SELECT *
    FROM service_banners
    WHERE id = ?
    `,
      [id],
    );

    return row;
  }

  // update banner
  async update(id, data) {
    await db.execute(
      `
    UPDATE service_banners
    SET
      title = ?,
      subtitle = ?,
      image_url = ?,
      redirect_type = ?,
      redirect_id = ?,
      redirect_url = ?,
      sort_order = ?,
      is_active = ?
    WHERE id = ?
    `,
      [
        data.title,
        data.subtitle,
        data.image_url,
        data.redirect_type,
        data.redirect_id,
        data.redirect_url,
        data.sort_order,
        data.is_active,
        id,
      ],
    );
  }

  // Delete banner
  async delete(id) {
    await db.execute(
      `
    DELETE FROM service_banners
    WHERE id = ?
    `,
      [id],
    );
  }

  // Admin banners
  async getAllBanners() {
    const [rows] = await db.execute(
      `
    SELECT *
    FROM service_banners
    ORDER BY sort_order ASC
    `,
    );

    return rows.map((b) => ({
      ...b,
      image_url: getPublicUrl(b.image_url),
    }));
  }
}

module.exports = new ServiceBannerModel();
