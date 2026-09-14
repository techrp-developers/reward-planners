const db = require("../config/database");

class PollModel {
  async list(companyId) {
    const [rows] = await db.execute(
      `SELECT p.poll_id, p.question, p.allow_multiple, p.status, p.closes_at,
              p.created_at, p.updated_at, eu.name AS created_by_name,
              COUNT(DISTINCT v.user_id) AS participant_count
       FROM company_polls p
       LEFT JOIN company_poll_votes v ON v.poll_id = p.poll_id
       LEFT JOIN eusers eu ON eu.user_id = p.created_by
       WHERE p.company_id = ?
       GROUP BY p.poll_id, eu.name
       ORDER BY p.created_at DESC`,
      [companyId],
    );

    if (!rows.length) return [];
    const ids = rows.map((row) => row.poll_id);
    const placeholders = ids.map(() => "?").join(",");
    const [options] = await db.execute(
      `SELECT o.option_id, o.poll_id, o.option_text, o.display_order,
              COUNT(v.vote_id) AS vote_count
       FROM company_poll_options o
       LEFT JOIN company_poll_votes v ON v.option_id = o.option_id
       WHERE o.poll_id IN (${placeholders})
       GROUP BY o.option_id
       ORDER BY o.poll_id, o.display_order`,
      ids,
    );
    const byPoll = new Map();
    options.forEach((option) => {
      const list = byPoll.get(String(option.poll_id)) || [];
      list.push({ ...option, vote_count: Number(option.vote_count) });
      byPoll.set(String(option.poll_id), list);
    });
    return rows.map((row) => ({
      ...row,
      allow_multiple: Boolean(row.allow_multiple),
      participant_count: Number(row.participant_count),
      options: byPoll.get(String(row.poll_id)) || [],
    }));
  }

  async create({ companyId, question, options, allowMultiple, closesAt, createdBy }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const [result] = await connection.execute(
        `INSERT INTO company_polls
           (company_id, question, allow_multiple, closes_at, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [companyId, question, allowMultiple ? 1 : 0, closesAt || null, createdBy],
      );
      for (let index = 0; index < options.length; index += 1) {
        await connection.execute(
          `INSERT INTO company_poll_options (poll_id, option_text, display_order)
           VALUES (?, ?, ?)`,
          [result.insertId, options[index], index + 1],
        );
      }
      await connection.commit();
      return result.insertId;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async setStatus(pollId, companyId, status) {
    const [result] = await db.execute(
      `UPDATE company_polls SET status = ? WHERE poll_id = ? AND company_id = ?`,
      [status, pollId, companyId],
    );
    return result.affectedRows > 0;
  }

  async remove(pollId, companyId) {
    const [result] = await db.execute(
      `DELETE FROM company_polls WHERE poll_id = ? AND company_id = ?`,
      [pollId, companyId],
    );
    return result.affectedRows > 0;
  }
}

module.exports = new PollModel();
