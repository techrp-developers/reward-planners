const db = require("../../../../config/database");
const fs = require("fs");
const path = require("path");

// helper function
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class ServiceVariantModel {
  // create a variant
  async create(data) {
    const [result] = await db.execute(
      `INSERT INTO service_variants
      (service_id, variant_name, title, short_description, price, image_url)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.service_id,
        data.variant_name,
        data.title,
        data.short_description,
        data.price,
        data.image_url,
      ],
    );

    return result.insertId;
  }

  async updateImage(id, imagePath) {
    const [result] = await db.execute(
      `UPDATE service_variants SET image_url = ? WHERE id = ?`,
      [imagePath, id],
    );
    return result.affectedRows;
  }

  //   find by service
  async findByServiceId(serviceId) {
    const [rows] = await db.execute(
      `SELECT id, variant_name,title, short_description, price, image_url
       FROM service_variants
       WHERE service_id = ? AND status = 1`,
      [serviceId],
    );

    return rows.map((variant) => ({
      ...variant,
      image_url: getPublicUrl(variant.image_url),
    }));
  }

  //   delete a service
  async delete(id) {
    await db.execute(`UPDATE service_variants SET status = 0 WHERE id = ?`, [
      id,
    ]);
  }

  // create a variant section
  async addVariantSection(data) {
    const [result] = await db.execute(
      `INSERT INTO service_variant_sections
      (variant_id, section_type, title, content, sort_order)
      VALUES (?, ?, ?, ?, ?)`,
      [
        data.variant_id,
        data.section_type,
        data.title || null,
        JSON.stringify(data.content),
        data.sort_order || 0,
      ],
    );
    return result.insertId;
  }

  // Find variant Section
  async getVariantSection(variantId) {
    const [rows] = await db.execute(
      `SELECT section_type, title, content
       FROM service_variant_sections
       WHERE variant_id = ?
       ORDER BY sort_order`,
      [variantId],
    );

    return rows.map((r) => ({
      section_type: r.section_type,
      title: r.title,
      content: JSON.parse(r.content),
    }));
  }

  // delete a variant section
  async deleteVariantSection(id) {
    await db.execute(`DELETE FROM service_variant_sections WHERE id = ?`, [id]);
  }

  // get variant with sections
  async getVariantsWithSections(serviceId) {
    const [variants] = await db.execute(
      `SELECT id, variant_name, title, short_description, price
     FROM service_variants
     WHERE service_id = ? AND status = 1`,
      [serviceId],
    );

    for (let v of variants) {
      const [sections] = await db.execute(
        `SELECT section_type, title, content
       FROM service_variant_sections
       WHERE variant_id = ?
       ORDER BY sort_order`,
        [v.id],
      );

      v.sections = sections.map((s) => ({
        ...s,
        content: JSON.parse(s.content || "{}"),
      }));
    }

    return variants;
  }

  // Get variants by service Id
  async getVariantsByService(serviceId) {
    const [rows] = await db.execute(
      `SELECT 
        id,
        variant_name,
        title,
        short_description,
        price,
        original_price,
        image_url
       FROM service_variants
       WHERE service_id = ? AND status = 1
       ORDER BY id`,
      [serviceId],
    );

    return rows.map((variant) => ({
      ...variant,
      image_url: getPublicUrl(variant.image_url),
    }));
  }

  // Get sections by variant Id
  async getSectionsByVariant(variantId) {
    const [rows] = await db.execute(
      `SELECT section_type, title, content
     FROM service_variant_sections
     WHERE variant_id = ?
     ORDER BY sort_order`,
      [variantId],
    );

    return rows.map((r) => ({
      ...r,
      content: JSON.parse(r.content || "{}"),
    }));
  }

  // find variant by Id
  async findById(id) {
    const [rows] = await db.execute(
      `SELECT * FROM service_variants WHERE id = ?`,
      [id],
    );

    const variant = rows[0];

    return {
      ...variant,
      image_url: getPublicUrl(variant.image_url),
    };
  }

  // update by id
  async update(id, data) {
    const [result] = await db.execute(
      `UPDATE service_variants 
     SET service_id = ?, 
         variant_name = ?, 
         title = ?, 
         short_description = ?, 
         price = ?, 
         status = ?,
         image_url = ?
     WHERE id = ?`,
      [
        data.service_id,
        data.variant_name,
        data.title,
        data.short_description,
        data.price,
        data.status,
        data.image_url,
        id,
      ],
    );

    return result.affectedRows;
  }
}

module.exports = new ServiceVariantModel();
