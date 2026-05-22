const db = require("../../../../config/database");

class ReviewModel {
  async createReview(data, conn = null) {
    const connection = conn || db;

    const query = `
      INSERT INTO product_reviews
      (user_id, product_id, variant_id, order_id,
       rating, value_for_money, good_quality, smooth_experience,
       review_text)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      data.user_id,
      data.product_id,
      data.variant_id,
      data.order_id,
      data.rating,
      data.value_for_money || null,
      data.good_quality || null,
      data.smooth_experience || null,
      data.review_text || null,
    ];

    const [result] = await connection.execute(query, values);
    return result.insertId;
  }

  async addReviewMedia(reviewId, mediaList, conn = null) {
    const connection = conn || db;

    const query = `
      INSERT INTO product_review_media
      (review_id, media_url, media_type, sort_order)
      VALUES ?
    `;

    const values = mediaList.map((item, index) => [
      reviewId,
      item.media_url,
      item.media_type,
      index + 1,
    ]);

    await connection.query(query, [values]);
  }

  async getProductReviews(
    productId,
    userId = null,
    sort = "latest",
    rating = null,
    limit = 5,
    offset = 0,
  ) {
    let orderBy = "pr.created_at DESC";

    if (sort === "helpful") {
      orderBy = "pr.helpful_count DESC";
    }

    if (sort === "rating_high") {
      orderBy = "pr.rating DESC";
    }

    if (sort === "rating_low") {
      orderBy = "pr.rating ASC";
    }

    let ratingFilter = "";
    const params = [userId, productId];

    if (rating) {
      ratingFilter = "AND pr.rating = ?";
      params.push(rating);
    }

    params.push(limit);
    params.push(offset);

    const query = `
    SELECT 
      pr.*,
      c.name AS user_name,
      CASE 
        WHEN rv.user_id IS NULL THEN 0
        ELSE 1
      END AS user_marked_helpful
    FROM product_reviews pr
    JOIN customer c ON pr.user_id = c.user_id
    LEFT JOIN review_helpful_votes rv
      ON rv.review_id = pr.review_id
      AND rv.user_id = ?
    WHERE pr.product_id = ?
    AND pr.status = 'approved'
    ${ratingFilter}
    ORDER BY ${orderBy}
    LIMIT ?
    OFFSET ?
  `;

    const [rows] = await db.execute(query, params);
    return rows;
  }

  async getReviewMedia(reviewIds) {
    if (!reviewIds.length) return [];

    const query = `
      SELECT * FROM product_review_media
      WHERE review_id IN (?)
      ORDER BY sort_order ASC
    `;

    const [rows] = await db.query(query, [reviewIds]);
    return rows;
  }
}

module.exports = new ReviewModel();
