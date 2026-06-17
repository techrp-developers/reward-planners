const db = require("../config/database");

class OfferController {
  async saveOfferPoster(req, res) {
    try {
      const {
        poster_id,
        redirect_type,
        redirect_id,
        redirect_url,
        display_order,
        is_active,
      } = req.body;

      const poster_image = req.file
        ? `/offer-posters/${req.file.filename}`
        : null;

      if (poster_id) {
        await db.execute(
          `UPDATE offer_posters
         SET redirect_type=?, redirect_id=?, redirect_url=?,
             display_order=?, is_active=?,
             poster_image = COALESCE(?, poster_image)
         WHERE poster_id=?`,
          [
            redirect_type,
            redirect_id,
            redirect_url,
            display_order,
            is_active,
            poster_image,
            poster_id,
          ],
        );
      } else {
        await db.execute(
          `INSERT INTO offer_posters
         (poster_image, redirect_type, redirect_id, redirect_url, display_order, is_active)
         VALUES (?,?,?,?,?,?)`,
          [
            poster_image,
            redirect_type,
            redirect_id,
            redirect_url,
            display_order,
            is_active,
          ],
        );
      }

      res.json({ success: true, message: "Offer poster saved" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }

  async getOfferPosters(req, res) {
    const [rows] = await db.execute(`
    SELECT poster_id, poster_image, redirect_type, redirect_id, redirect_url
    FROM offer_posters
    WHERE is_active = 1
    ORDER BY display_order ASC
  `);

    res.json(rows);
  }
}

module.exports = new OfferController();
