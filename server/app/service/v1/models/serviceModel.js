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
    const [rows] = await db.execute(`
    SELECT 
      s.id,
      s.name,
      s.service_image,
      s.description,
      s.show_enquiry,
      s.price,
      s.is_featured,
      s.is_popular,
      s.is_recommended,
      s.value_addition,
      sv.id AS variant_id,
      sv.price,
      sv.image_url

    FROM services s
    LEFT JOIN service_variants sv ON sv.service_id = s.id
    WHERE s.status = 1
  `);

    // group into sections
    const sections = {
      quick_services: [],
      popular: [],
      recommended: [],
      value_added: [],
    };

    rows.forEach((item) => {
      const service = {
        service_id: item.id,
        variant_id: item.variant_id,
        name: item.name,
        description: item.description,
        enquiry: item.show_enquiry,
        price: Number(item.price),
        service_image: item.service_image ? getPublicUrl(item.service_image) : null,
        variant_image: item.image_url ? getPublicUrl(item.image_url) : null,
      };

      if (item.is_featured) {
        sections.quick_services.push(service);
      }

      if (item.is_popular) {
        sections.popular.push(service);
      }

      if (item.is_recommended) {
        sections.recommended.push(service);
      }

      if (item.value_addition) {
        sections.value_added.push(service);
      }
    });

    return sections;
  }

  // Related services
  async getRelatedServices(serviceId) {
    // 1 Get category of current service
    const [[service]] = await db.execute(
      `SELECT category_id FROM services WHERE id = ?`,
      [serviceId],
    );

    if (!service) return [];

    const categoryId = service.category_id;

    // 2 Fetch related services
    const [rows] = await db.execute(
      `
      SELECT 
        s.id,
        s.name,
        s.show_enquiry,
        s.total_orders,
        s.service_image,

        sv.id AS variant_id,
        sv.price,
        sv.original_price AS mrp,
        sv.title,
        sv.image_url

      FROM services s

      JOIN (
        SELECT service_id, MIN(price) AS min_price
        FROM service_variants
        GROUP BY service_id
      ) vmin ON vmin.service_id = s.id

      JOIN service_variants sv 
        ON sv.service_id = s.id 
        AND sv.price = vmin.min_price

      WHERE 
        s.category_id = ?
        AND s.id != ?
        AND s.status = 1

      ORDER BY s.total_orders DESC, sv.price ASC
      LIMIT 10
  `,
      [categoryId, serviceId],
    );

    if (rows.length < 5) {
      const [fallback] = await db.execute(
        `
      SELECT 
        s.id,
        s.name,
        s.show_enquiry,
        s.service_image,
        sv.id AS variant_id,
        sv.price,
        sv.original_price AS mrp,
        sv.title,
        sv.image_url

      FROM services s
      JOIN service_variants sv ON sv.service_id = s.id

      WHERE s.status = 1 AND s.id != ?
      ORDER BY s.total_orders DESC
      LIMIT ?
    `,
        [serviceId, 10 - rows.length],
      );

      rows.push(...fallback);
    }

    return rows.map((r) => ({
      service_id: r.id,
      variant_id: r.variant_id,
      name: r.name,
      enquiry: r.show_enquiry,
      title: r.title,
      price: Number(r.price),
      mrp: Number(r.mrp),
      service_image: r.service_image ? getPublicUrl(r.service_image) : null,
      variant_image: r.image_url ? getPublicUrl(r.image_url) : null,

      // extra UI helpers
      discount_percent: r.mrp
        ? Math.round(((r.mrp - r.price) / r.mrp) * 100)
        : 0,

      coins: Math.floor(Number(r.price) * 0.1), 
    }));
  }
}

module.exports = new ServiceModel();
