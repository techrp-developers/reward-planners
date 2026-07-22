const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path, updatedAt) {
  if (!path) return null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
  return `${CDN_BASE_URL}/${path}${version}`;
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
      service_image: getPublicUrl(service.service_image, service.updated_at),
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

    if (!service) return null;

    return {
      ...service,
      service_image: getPublicUrl(service.service_image, service.updated_at),
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
      service_image,
      updated_at
    FROM services
    WHERE category_id = ? AND status = 1
    ORDER BY sort_order ASC
    `,
      [categoryId],
    );

    return rows.map((service) => ({
      ...service,
      service_image: getPublicUrl(service.service_image, service.updated_at),
    }));
  }

  async findBasicById(id) {
    const [rows] = await db.execute(
      `SELECT id, name, description, service_image, updated_at
     FROM services
     WHERE id = ? AND status = 1`,
      [id],
    );

    const service = rows[0];

    if (!service) return null;

    return {
      ...service,
      service_image: getPublicUrl(service.service_image, service.updated_at),
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
          s.updated_at AS service_updated_at,

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
          WHERE status = 1
          GROUP BY service_id
        ) mv
          ON mv.service_id = s.id

        JOIN service_variants sv
          ON sv.service_id = s.id
          AND sv.price = mv.min_price
          AND sv.status = 1

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
              ? getPublicUrl(item.service_image, item.service_updated_at)
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
          sb.updated_at,
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

            image_url: item.image_url
              ? getPublicUrl(item.image_url, item.updated_at)
              : null,

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
      s.updated_at AS service_updated_at,

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
      WHERE status = 1
      GROUP BY service_id
    ) mv
      ON mv.service_id = s.id

    JOIN service_variants sv
      ON sv.service_id = s.id
      AND sv.price = mv.min_price
      AND sv.status = 1

    WHERE srs.service_id = ?
    AND srs.relation_type = 'related'
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
        s.updated_at AS service_updated_at,

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
        WHERE status = 1
        GROUP BY service_id
      ) mv
        ON mv.service_id = s.id

      JOIN service_variants sv
        ON sv.service_id = s.id
        AND sv.price = mv.min_price
        AND sv.status = 1

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
        ? getPublicUrl(item.service_image, item.service_updated_at)
        : null,

      variant_image: item.image_url ? getPublicUrl(item.image_url) : null,
    }));
  }

  // create home section
  async createHomeSection(data) {
    const [result] = await db.execute(
      `
    INSERT INTO service_home_sections
    (
      title,
      section_key,
      section_type,
      layout_type,
      sort_order
    )
    VALUES
    (
      ?, ?, ?, ?, ?
    )
    `,
      [
        data.title,
        data.section_key,
        data.section_type,
        data.layout_type,
        data.sort_order || 0,
      ],
    );

    return result.insertId;
  }

  async updateHomeSection(id, data) {
    await db.execute(
      `
    UPDATE service_home_sections
    SET
      title = ?,
      section_key = ?,
      section_type = ?,
      layout_type = ?,
      sort_order = ?,
      is_active = ?
    WHERE id = ?
    `,
      [
        data.title,
        data.section_key,
        data.section_type,
        data.layout_type,
        data.sort_order,
        data.is_active,
        id,
      ],
    );
  }

  async deleteHomeSection(id) {
    await db.execute(
      `
    DELETE FROM service_home_section_items
    WHERE section_id = ?
    `,
      [id],
    );

    await db.execute(
      `
    DELETE FROM service_home_sections
    WHERE id = ?
    `,
      [id],
    );
  }

  // create section items
  async addSectionItem(sectionId, data) {
    const [result] = await db.execute(
      `
    INSERT INTO service_home_section_items
    (
      section_id,
      service_id,
      banner_id,
      sort_order
    )
    VALUES
    (
      ?, ?, ?, ?
    )
    `,
      [
        sectionId,
        data.service_id || null,
        data.banner_id || null,
        data.sort_order || 0,
      ],
    );

    return result.insertId;
  }

  // Get section items
  async getSectionItems(sectionId) {
    const [rows] = await db.execute(
      `
    SELECT *
    FROM service_home_section_items
    WHERE section_id = ?
    ORDER BY sort_order ASC
    `,
      [sectionId],
    );

    return rows;
  }

  //Delete section item
  async deleteSectionItem(id) {
    await db.execute(
      `
    DELETE FROM service_home_section_items
    WHERE id = ?
    `,
      [id],
    );
  }

  // show home sections to admin
  async getAdminHomeSections() {
    const [rows] = await db.execute(
      `
    SELECT *
    FROM service_home_sections
    ORDER BY sort_order ASC
    `,
    );

    return rows;
  }

  // Related Apis
  async addRelatedService(data) {
    const [existing] = await db.execute(
      `
  SELECT id
  FROM service_related_services
  WHERE service_id = ?
  AND related_service_id = ?
  AND relation_type = ?
  `,
      [
        data.service_id,
        data.related_service_id,
        data.relation_type || "related",
      ],
    );

    if (existing.length) {
      throw new Error("Related service already exists");
    }

    const [result] = await db.execute(
      `
   INSERT INTO service_related_services
    (
      service_id,
      related_service_id,
      relation_type,
      sort_order
    )
    VALUES (?, ?, ?, ?)
    `,
      [
        data.service_id,
        data.related_service_id,
        data.relation_type || "related",
        data.sort_order || 0,
      ],
    );

    return result.insertId;
  }

  async getAdminRelatedServices(serviceId) {
    const [rows] = await db.execute(
      `
    SELECT

      srs.id,
      s.id AS related_service_id,
      s.name,
      s.status,
      s.rating,
      s.total_orders,
      s.service_image,
      srs.relation_type,
      srs.sort_order

    FROM service_related_services srs

    JOIN services s
      ON s.id = srs.related_service_id

    WHERE srs.service_id = ?

    ORDER BY srs.sort_order ASC
    `,
      [serviceId],
    );

    return rows;
  }

  async updateRelatedService(id, data) {
    await db.execute(
      `
    UPDATE service_related_services
    SET
      sort_order = ?,
      relation_type = ?
    WHERE id = ?
    `,
      [data.sort_order, data.relation_type, id],
    );
  }

  async deleteRelatedService(id) {
    await db.execute(
      `
    DELETE FROM service_related_services
    WHERE id = ?
    `,
      [id],
    );
  }

  // Top picks
  async getTopPicks(limit = 10) {
    const [rows] = await db.execute(
      `
    SELECT

      s.id AS service_id,
      s.name,
      s.description,
      s.rating,
      s.total_orders,
      s.show_enquiry,
      s.service_image,
      s.updated_at AS service_updated_at,

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
      WHERE status = 1
      GROUP BY service_id
    ) mv
      ON mv.service_id = s.id

    JOIN service_variants sv
      ON sv.service_id = s.id
      AND sv.price = mv.min_price
      AND sv.status = 1

    WHERE s.status = 1

    ORDER BY
      s.total_orders DESC,
      s.rating DESC

    LIMIT ?
    `,
      [limit],
    );

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
        ? getPublicUrl(item.service_image, item.service_updated_at)
        : null,

      variant_image: item.image_url ? getPublicUrl(item.image_url) : null,
    }));
  }

  // ==================================value added services===============================
  // Value Added Services
  async getValueAddedServices(serviceId) {
    const [rows] = await db.execute(
      `
    SELECT
      s.id AS service_id,
      s.name,
      s.description,
      s.rating,
      s.total_orders,
      s.show_enquiry,
      s.service_image,
      s.updated_at AS service_updated_at,

      sv.id AS variant_id,
      sv.title,
      sv.price,
      sv.original_price,
      sv.image_url,

      srs.sort_order

    FROM service_related_services srs

    JOIN services s
      ON s.id = srs.related_service_id

    JOIN (
      SELECT
        service_id,
        MIN(price) AS min_price
      FROM service_variants
      WHERE status = 1
      GROUP BY service_id
    ) mv
      ON mv.service_id = s.id

    JOIN service_variants sv
      ON sv.service_id = s.id
      AND sv.price = mv.min_price
      AND sv.status = 1

    WHERE srs.service_id = ?
    AND srs.relation_type = 'value_added'
    AND s.status = 1

    ORDER BY srs.sort_order ASC

    LIMIT 10
    `,
      [serviceId],
    );

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
        ? getPublicUrl(item.service_image, item.service_updated_at)
        : null,

      variant_image: item.image_url ? getPublicUrl(item.image_url) : null,
    }));
  }

  // Get search suggestions
  async getSearchSuggestions({ search, limit = 10 }) {
    if (!search || search.length < 2) {
      return [];
    }

    const keyword = `%${search}%`;

    const [rows] = await db.execute(
      `
    SELECT
      id,
      name AS title,
      service_image AS image,
      updated_at,
      'service' AS type
    FROM services
    WHERE status = 1
      AND name LIKE ?
    ORDER BY name ASC
    LIMIT ?
    `,
      [keyword, limit],
    );

    return rows.map(({ updated_at, ...service }) => ({
      ...service,
      image: getPublicUrl(service.image, updated_at),
      navigation: {
        destination: "service_details",
        service_id: service.id,
      },
    }));
  }
}

module.exports = new ServiceModel();
