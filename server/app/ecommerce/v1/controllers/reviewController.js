const ReviewModel = require("../models/reviewModel");
const db = require("../../../../config/database");
const fs = require("fs");
const path=require("path");

class ReviewController {
  // checking if user can review product, then submit review
  async getReviewableOrder(req, res) {
    try {
      const userId = req.user?.user_id;
      const { variant_id } = req.params;

      const [rows] = await db.execute(
        `
      SELECT o.order_id
      FROM eorders o
      JOIN eorder_items oi ON oi.order_id = o.order_id
      LEFT JOIN product_reviews pr
        ON pr.order_id = o.order_id
        AND pr.variant_id = oi.variant_id
        AND pr.user_id = ?
      WHERE oi.variant_id = ?
      AND o.user_id = ?
      AND o.status = 'delivered'
      AND pr.review_id IS NULL
      LIMIT 1
      `,
        [userId, variant_id, userId],
      );

      res.json({
        can_review: rows.length > 0,
        order_id: rows[0]?.order_id || null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to check review eligibility" });
    }
  }

  // submit review
  async submitReview(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const userId = req.user?.user_id;

      if (!userId) {
        await conn.rollback();
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      const {
        product_id,
        variant_id,
        order_id,
        rating,
        value_for_money,
        good_quality,
        smooth_experience,
        review_text,
      } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        await conn.rollback();
        return res.status(400).json({ message: "Invalid rating" });
      }

      // Verify purchase
      const [orderCheck] = await conn.execute(
        `
      SELECT 1
      FROM eorders o
      JOIN eorder_items oi ON oi.order_id = o.order_id
      WHERE o.order_id = ?
      AND o.user_id = ?
      AND o.status = 'delivered'
      AND oi.variant_id = ?
      LIMIT 1
      `,
        [order_id, userId, variant_id],
      );

      if (orderCheck.length === 0) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Product not eligible for review",
        });
      }

      // Create review
      const reviewId = await ReviewModel.createReview(
        {
          user_id: userId,
          product_id,
          variant_id,
          order_id,
          rating,
          value_for_money,
          good_quality,
          smooth_experience,
          review_text,
        },
        conn,
      );

      // Update product rating
      await conn.execute(
        `
      UPDATE eproducts
      SET 
        avg_rating = ((avg_rating * rating_count + ?) / (rating_count + 1)),
        rating_count = rating_count + 1
      WHERE product_id = ?
      `,
        [rating, product_id],
      );

      // HANDLE MEDIA
      if (req.files && req.files.length > 0) {
        const reviewDir = path.join(
          __dirname,
          `../../../../uploads/reviews/user_${userId}/review_${reviewId}`,
        );

        if (!fs.existsSync(reviewDir)) {
          fs.mkdirSync(reviewDir, { recursive: true });
        }

        const mediaList = [];

        for (let i = 0; i < req.files.length; i++) {
          const file = req.files[i];

          const ext = path.extname(file.originalname);

          const finalFileName = `${Date.now()}_${i}${ext}`;

          const finalPath = path.join(reviewDir, finalFileName);

          fs.renameSync(file.path, finalPath);

          mediaList.push({
            media_url: `/reviews/user_${userId}/review_${reviewId}/${finalFileName}`,
            media_type: file.mimetype.startsWith("video") ? "video" : "image",
          });
        }

        await ReviewModel.addReviewMedia(reviewId, mediaList, conn);
      }

      await conn.commit();

      res.status(201).json({
        success: true,
        message: "Review submitted successfully",
      });
    } catch (err) {
      await conn.rollback();

      if (req.files) {
        req.files.forEach((file) => {
          try {
            fs.unlinkSync(file.path);
          } catch {}
        });
      }

      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({
          success: false,
          message: "You already reviewed this product",
        });
      }

      console.error(err);

      res.status(500).json({
        success: false,
        message: "Failed to submit review",
      });
    } finally {
      conn.release();
    }
  }

  //  fetch reviews
  async getProductReviews(req, res) {
    try {
      const { product_id } = req.params;
      const { sort, rating } = req.query;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 5;
      const offset = (page - 1) * limit;

      const userId = req.user?.user_id || null;

      // 1 Product rating summary
      const [summary] = await db.execute(
        `
      SELECT avg_rating, rating_count
      FROM eproducts
      WHERE product_id = ?
      `,
        [product_id],
      );

      if (summary.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const totalRatings = summary[0].rating_count || 0;

      // 2 Rating breakdown
      const [distribution] = await db.execute(
        `
      SELECT rating, COUNT(*) AS count
      FROM product_reviews
      WHERE product_id = ?
      AND status = 'approved'
      GROUP BY rating
      `,
        [product_id],
      );

      const ratingBreakdown = {
        5: { count: 0, percent: 0 },
        4: { count: 0, percent: 0 },
        3: { count: 0, percent: 0 },
        2: { count: 0, percent: 0 },
        1: { count: 0, percent: 0 },
      };

      distribution.forEach((r) => {
        const percent =
          totalRatings > 0 ? Math.round((r.count / totalRatings) * 100) : 0;

        ratingBreakdown[r.rating] = {
          count: r.count,
          percent: percent,
        };
      });

      // 2.5 Media
      const [mediaGallery] = await db.execute(
        `
          SELECT prm.media_url, prm.media_type
          FROM product_review_media prm
          JOIN product_reviews pr 
          ON pr.review_id = prm.review_id
          WHERE pr.product_id = ?
          AND pr.status = 'approved'
          ORDER BY prm.created_at DESC
          LIMIT 20
          `,
        [product_id],
      );

      // 3 Reviews
      const reviews = await ReviewModel.getProductReviews(
        product_id,
        userId,
        sort,
        rating,
        limit,
        offset,
      );

      //  4 Get review media
      const reviewIds = reviews.map((r) => r.review_id);
      let media = [];

      if (reviewIds.length > 0) {
        media = await ReviewModel.getReviewMedia(reviewIds);
      }

      const groupedMedia = {};

      media.forEach((m) => {
        if (!groupedMedia[m.review_id]) {
          groupedMedia[m.review_id] = [];
        }
        groupedMedia[m.review_id].push(m);
      });

      const finalReviews = reviews.map((r) => ({
        ...r,
        media: groupedMedia[r.review_id] || [],
      }));

      res.json({
        success: true,
        rating_summary: {
          avg_rating: summary[0].avg_rating,
          rating_count: totalRatings,
          breakdown: ratingBreakdown,
        },
        media_gallery: mediaGallery,
        pagination: {
          page,
          limit,
          total_reviews: totalRatings,
        },
        reviews: finalReviews,
      });
      // `${avg_rating} out of 5 • ${rating_count} ratings`
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  }

  // mark review helpful
  async markReviewHelpful(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const userId = req.user?.user_id;
      const reviewId = parseInt(req.params.reviewId);

      if (!userId) {
        await conn.rollback();
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!reviewId) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid review id",
        });
      }

      // 1 Ensure review exists
      const [review] = await conn.execute(
        `
      SELECT review_id
      FROM product_reviews
      WHERE review_id = ?
      AND status = 'approved'
      LIMIT 1
      `,
        [reviewId],
      );

      if (review.length === 0) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: "Review not found",
        });
      }

      // 2 Insert helpful vote
      await conn.execute(
        `
      INSERT INTO review_helpful_votes (review_id, user_id)
      VALUES (?, ?)
      `,
        [reviewId, userId],
      );

      // 3 Update helpful counter
      await conn.execute(
        `
      UPDATE product_reviews
      SET helpful_count = helpful_count + 1
      WHERE review_id = ?
      `,
        [reviewId],
      );

      await conn.commit();

      res.json({
        success: true,
        message: "Marked as helpful",
      });
    } catch (err) {
      await conn.rollback();

      // Prevent duplicate vote
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({
          success: false,
          message: "You already marked this review helpful",
        });
      }

      console.error(err);
      res.status(500).json({
        message: "Failed to mark review helpful",
      });
    } finally {
      conn.release();
    }
  }

  // remove helpful vote
  async removeHelpfulVote(req, res) {
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const userId = req.user?.user_id;
      const reviewId = parseInt(req.params.reviewId);

      if (!userId) {
        await conn.rollback();
        return res.status(401).json({
          success: false,
          message: "Unauthorized user",
        });
      }

      if (!reviewId) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Invalid review id",
        });
      }

      // 1 Check if vote exists
      const [vote] = await conn.execute(
        `
      SELECT id
      FROM review_helpful_votes
      WHERE review_id = ? AND user_id = ?
      LIMIT 1
      `,
        [reviewId, userId],
      );

      if (vote.length === 0) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          message: "Helpful vote not found",
        });
      }

      // 2 Delete vote
      await conn.execute(
        `
      DELETE FROM review_helpful_votes
      WHERE review_id = ? AND user_id = ?
      `,
        [reviewId, userId],
      );

      // 3 Decrease helpful count
      await conn.execute(
        `
      UPDATE product_reviews
      SET helpful_count = GREATEST(helpful_count - 1, 0)
      WHERE review_id = ?
      `,
        [reviewId],
      );

      await conn.commit();

      res.json({
        success: true,
        message: "Helpful vote removed",
      });
    } catch (err) {
      await conn.rollback();
      console.error(err);

      res.status(500).json({
        message: "Failed to remove helpful vote",
      });
    } finally {
      conn.release();
    }
  }
}
module.exports = new ReviewController();
