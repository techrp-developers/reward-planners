const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceModel {
  async create(data) {
    const sql = `
      INSERT INTO services
      (category_id, name, description, price, estimated_days, status,service_image)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      data.category_id,
      data.name,
      data.description || null,
      data.price,
      data.estimated_days || null,
      data.status ?? 1,
      data.service_image,
    ];

    const [result] = await db.execute(sql, params);
    return result.insertId;
  }

  async findAll(filters = {}) {
    let sql = `
      SELECT 
        s.*,
        c.name AS category_name
      FROM services s
      JOIN service_categories c ON c.id = s.category_id
      WHERE s.status = 1
    `;

    const params = [];

    // category filter
    if (filters.category_id) {
      sql += ` AND s.category_id = ?`;
      params.push(filters.category_id);
    }

    //  SEARCH FILTER
    if (filters.search) {
      sql += ` AND (
      s.name LIKE ? 
      OR s.description LIKE ?
    )`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    //  Sorting
    sql += ` ORDER BY s.created_at DESC`;

    //  Pagination
    if (filters.limit) {
      sql += ` LIMIT ? OFFSET ?`;
      params.push(filters.limit, filters.offset || 0);
    }

    const [rows] = await db.execute(sql, params);

    return rows.map((service) => ({
      ...service,
      service_image: getPublicUrl(service.service_image),
    }));
  }

  async findById(id) {
    const [rows] = await db.execute(
      `
      SELECT 
        s.*,
        c.name AS category_name
      FROM services s
      JOIN service_categories c ON c.id = s.category_id
      WHERE s.id = ?
      `,
      [id],
    );
    const service = rows[0];

    return {
      ...service,
      service_image: getPublicUrl(service.service_image),
    };
  }

  async update(id, data) {
    const sql = `
      UPDATE services
      SET
        category_id = ?,
        name = ?,
        description = ?,
        price = ?,
        estimated_days = ?,
        status = ?,
        service_image = ?
      WHERE id = ?
    `;

    const params = [
      data.category_id,
      data.name,
      data.description || null,
      data.price,
      data.estimated_days || null,
      data.status ?? 1,
      data.service_image || null,
      id,
    ];

    const [result] = await db.execute(sql, params);
    return result.affectedRows;
  }

  async updateImage(id, imagePath) {
    const [result] = await db.execute(
      `UPDATE services SET service_image = ? WHERE id = ?`,
      [imagePath, id],
    );
    return result.affectedRows;
  }

  async delete(id) {
    // Soft delete
    const [result] = await db.execute(
      `UPDATE services SET status = 0 WHERE id = ?`,
      [id],
    );
    return result.affectedRows;
  }

  // By category Id search
  async findByCategoryId(categoryId) {
    const [rows] = await db.execute(
      `
    SELECT 
      id,
      name,
      description,
      price,
      estimated_days,
      service_image
    FROM services
    WHERE category_id = ? AND status = 1
    ORDER BY sort_order ASC
    `,
      [categoryId],
    );

    return rows.map((service) => ({
      ...service,
      service_image: getPublicUrl(service.service_image),
    }));
  }

  async findBasicById(id) {
    const [rows] = await db.execute(
      `SELECT id, name, description, service_image
     FROM services
     WHERE id = ? AND status = 1`,
      [id],
    );

    const service = rows[0];

    return {
      ...service,
      service_image: getPublicUrl(service.service_image),
    };
  }

  // Get home sections
  async getHomeSections() {
    // =========================================
    // GET ACTIVE SECTIONS
    // =========================================

    const [sections] = await db.execute(
      `
    SELECT
      id,
      title,
      section_key,
      section_type,
      layout_type,
      sort_order

    FROM service_home_sections

    WHERE is_active = 1

    ORDER BY sort_order ASC
    `,
    );

    const finalSections = [];

    // =========================================
    // PROCESS EACH SECTION
    // =========================================

    for (const section of sections) {
      // =====================================
      // SERVICE ITEMS
      // =====================================

      if (section.section_type === "services") {
        const [items] = await db.execute(
          `
        SELECT

          shsi.id AS section_item_id,

          s.id AS service_id,
          s.name,
          s.description,
          s.rating,
          s.total_orders,
          s.show_enquiry,
          s.service_image,

          sv.id AS variant_id,
          sv.price,
          sv.original_price,
          sv.title,
          sv.image_url

        FROM service_home_section_items shsi

        JOIN services s
          ON s.id = shsi.service_id

        JOIN (
          SELECT
            service_id,
            MIN(price) AS min_price
          FROM service_variants
          GROUP BY service_id
        ) mv
          ON mv.service_id = s.id

        JOIN service_variants sv
          ON sv.service_id = s.id
          AND sv.price = mv.min_price

        WHERE shsi.section_id = ?
        AND s.status = 1

        ORDER BY shsi.sort_order ASC
        `,
          [section.id],
        );

        finalSections.push({
          section_id: section.id,

          title: section.title,

          section_key: section.section_key,

          layout_type: section.layout_type,

          section_type: section.section_type,

          items: items.map((item) => ({
            service_id: item.service_id,

            variant_id: item.variant_id,

            name: item.name,

            title: item.title,

            description: item.description,

            enquiry: Boolean(item.show_enquiry),

            rating: Number(item.rating || 0),

            total_orders: Number(item.total_orders || 0),

            price: Number(item.price),

            mrp: Number(item.original_price || 0),

            discount_percent: item.original_price
              ? Math.round(
                  ((item.original_price - item.price) / item.original_price) *
                    100,
                )
              : 0,

            coins: Math.floor(Number(item.price) * 0.1),

            service_image: item.service_image
              ? getPublicUrl(item.service_image)
              : null,

            variant_image: item.image_url ? getPublicUrl(item.image_url) : null,
          })),
        });
      }

      // =====================================
      // BANNER SECTION
      // =====================================

      if (section.section_type === "banners") {
        const [items] = await db.execute(
          `
        SELECT

          shsi.id AS section_item_id,

          sb.id AS banner_id,
          sb.title,
          sb.image_url,
          sb.redirect_type,
          sb.redirect_id,
          sb.redirect_url

        FROM service_home_section_items shsi

        JOIN service_banners sb
          ON sb.id = shsi.banner_id

        WHERE shsi.section_id = ?

        ORDER BY shsi.sort_order ASC
        `,
          [section.id],
        );

        finalSections.push({
          section_id: section.id,

          title: section.title,

          section_key: section.section_key,

          layout_type: section.layout_type,

          section_type: section.section_type,

          items: items.map((item) => ({
            banner_id: item.banner_id,

            title: item.title,

            image_url: item.image_url ? getPublicUrl(item.image_url) : null,

            redirect_type: item.redirect_type,

            redirect_id: item.redirect_id,

            redirect_url: item.redirect_url,
          })),
        });
      }
    }

    return finalSections;
  }

  // Related services
  async getRelatedServices(serviceId) {
    // =========================================
    // STEP 1
    // GET MANUALLY MAPPED RELATED SERVICES
    // =========================================

    let [rows] = await db.execute(
      `
    SELECT

      s.id AS service_id,
      s.name,
      s.description,
      s.rating,
      s.total_orders,
      s.show_enquiry,
      s.service_image,

      sv.id AS variant_id,
      sv.title,
      sv.price,
      sv.original_price,
      sv.image_url

    FROM service_related_services srs

    JOIN services s
      ON s.id = srs.related_service_id

    JOIN (
      SELECT
        service_id,
        MIN(price) AS min_price
      FROM service_variants
      GROUP BY service_id
    ) mv
      ON mv.service_id = s.id

    JOIN service_variants sv
      ON sv.service_id = s.id
      AND sv.price = mv.min_price

    WHERE srs.service_id = ?
    AND s.status = 1

    ORDER BY srs.sort_order ASC

    LIMIT 10
    `,
      [serviceId],
    );

    // =========================================
    // STEP 2
    // FALLBACK TO SAME CATEGORY SERVICES
    // =========================================

    if (!rows.length) {
      const [[service]] = await db.execute(
        `
      SELECT category_id
      FROM services
      WHERE id = ?
      `,
        [serviceId],
      );

      if (!service) {
        return [];
      }

      [rows] = await db.execute(
        `
      SELECT

        s.id AS service_id,
        s.name,
        s.description,
        s.rating,
        s.total_orders,
        s.show_enquiry,
        s.service_image,

        sv.id AS variant_id,
        sv.title,
        sv.price,
        sv.original_price,
        sv.image_url

      FROM services s

      JOIN (
        SELECT
          service_id,
          MIN(price) AS min_price
        FROM service_variants
        GROUP BY service_id
      ) mv
        ON mv.service_id = s.id

      JOIN service_variants sv
        ON sv.service_id = s.id
        AND sv.price = mv.min_price

      WHERE s.category_id = ?
      AND s.id != ?
      AND s.status = 1

      ORDER BY
        s.total_orders DESC,
        s.rating DESC

      LIMIT 10
      `,
        [service.category_id, serviceId],
      );
    }

    // =========================================
    // FINAL RESPONSE
    // =========================================

    return rows.map((item) => ({
      service_id: item.service_id,

      variant_id: item.variant_id,

      name: item.name,

      title: item.title,

      description: item.description,

      enquiry: Boolean(item.show_enquiry),

      rating: Number(item.rating || 0),

      total_orders: Number(item.total_orders || 0),

      price: Number(item.price),

      mrp: Number(item.original_price || 0),

      discount_percent: item.original_price
        ? Math.round(
            ((item.original_price - item.price) / item.original_price) * 100,
          )
        : 0,

      coins: Math.floor(Number(item.price) * 0.1),

      service_image: item.service_image
        ? getPublicUrl(item.service_image)
        : null,

      variant_image: item.image_url ? getPublicUrl(item.image_url) : null,
    }));
  }
}

module.exports = new ServiceModel();
