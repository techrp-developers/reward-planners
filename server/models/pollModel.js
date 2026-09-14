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

  async getEmployeeCompany(userId, conn = db) {
    const [[employee]] = await conn.execute(
      `SELECT cu.company_id
       FROM customer c
       INNER JOIN company_users cu ON cu.id = c.company_user_id AND cu.status = 1
       INNER JOIN companies co ON co.company_id = cu.company_id AND co.status = 1
       WHERE c.user_id = ? AND c.status = 1 AND c.is_verified = 1
       LIMIT 1`,
      [userId],
    );
    return employee?.company_id || null;
  }

  async listForEmployee(userId) {
    const companyId = await this.getEmployeeCompany(userId);
    if (!companyId) return null;
    const [rows] = await db.execute(
      `SELECT p.poll_id, p.question, p.allow_multiple, p.closes_at, p.created_at,
              COUNT(DISTINCT v.user_id) AS participant_count
       FROM company_polls p
       LEFT JOIN company_poll_votes v ON v.poll_id = p.poll_id
       WHERE p.company_id = ? AND p.status = 'published'
         AND (p.closes_at IS NULL OR p.closes_at > UTC_TIMESTAMP())
       GROUP BY p.poll_id ORDER BY p.created_at DESC`,
      [companyId],
    );
    if (!rows.length) return [];
    const ids = rows.map((row) => row.poll_id);
    const placeholders = ids.map(() => "?").join(",");
    const [options] = await db.execute(
      `SELECT o.option_id, o.poll_id, o.option_text, o.display_order,
              COUNT(v.vote_id) AS vote_count,
              MAX(CASE WHEN v.user_id = ? THEN 1 ELSE 0 END) AS selected
       FROM company_poll_options o
       LEFT JOIN company_poll_votes v ON v.option_id = o.option_id
       WHERE o.poll_id IN (${placeholders})
       GROUP BY o.option_id ORDER BY o.poll_id, o.display_order`,
      [userId, ...ids],
    );
    const byPoll = new Map();
    options.forEach((option) => {
      const list = byPoll.get(String(option.poll_id)) || [];
      list.push({ option_id: option.option_id, option_text: option.option_text,
        display_order: option.display_order, vote_count: Number(option.vote_count),
        selected: Boolean(option.selected) });
      byPoll.set(String(option.poll_id), list);
    });
    return rows.map((row) => {
      const pollOptions = byPoll.get(String(row.poll_id)) || [];
      return { ...row, allow_multiple: Boolean(row.allow_multiple),
        participant_count: Number(row.participant_count),
        has_voted: pollOptions.some((option) => option.selected),
        selected_option_ids: pollOptions.filter((option) => option.selected).map((option) => option.option_id),
        options: pollOptions };
    });
  }

  async vote({ pollId, userId, optionIds }) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const companyId = await this.getEmployeeCompany(userId, connection);
      if (!companyId) { await connection.rollback(); return { error: "COMPANY_REQUIRED" }; }
      const [[poll]] = await connection.execute(
        `SELECT poll_id, allow_multiple FROM company_polls
         WHERE poll_id = ? AND company_id = ? AND status = 'published'
           AND (closes_at IS NULL OR closes_at > UTC_TIMESTAMP()) FOR UPDATE`,
        [pollId, companyId],
      );
      if (!poll) { await connection.rollback(); return { error: "POLL_UNAVAILABLE" }; }
      if (!poll.allow_multiple && optionIds.length !== 1) { await connection.rollback(); return { error: "SINGLE_ANSWER" }; }
      const placeholders = optionIds.map(() => "?").join(",");
      const [validOptions] = await connection.execute(
        `SELECT option_id FROM company_poll_options WHERE poll_id = ? AND option_id IN (${placeholders})`,
        [pollId, ...optionIds],
      );
      if (validOptions.length !== optionIds.length) { await connection.rollback(); return { error: "INVALID_OPTIONS" }; }
      await connection.execute(`DELETE FROM company_poll_votes WHERE poll_id = ? AND user_id = ?`, [pollId, userId]);
      for (const optionId of optionIds) {
        await connection.execute(`INSERT INTO company_poll_votes (poll_id, option_id, user_id) VALUES (?, ?, ?)`, [pollId, optionId, userId]);
      }
      await connection.commit();
      return { success: true };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }
}

module.exports = new PollModel();
