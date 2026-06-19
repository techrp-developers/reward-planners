const db = require("../../../config/database");

const TodoModel = {
  async createTodo(data) {
    const {
      created_by,
      task_date,
      start_time,
      end_time,
      title,
      subtitle,
      reminder_time,
    } = data;

    const [result] = await db.query(
      `
      INSERT INTO todos
      (
        created_by,
        task_date,
        start_time,
        end_time,
        title,
        subtitle,
        reminder_time,
        completed,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'PENDING')
      `,
      [
        created_by,
        task_date,
        start_time,
        end_time,
        title,
        subtitle || "",
        reminder_time || null,
      ]
    );

    return result.insertId;
  },

  async getTodosByUserAndDate(created_by, task_date, filter) {
    let sql = `
      SELECT 
        id,
        created_by,
        task_date,
        start_time,
        end_time,
        title,
        subtitle,
        reminder_time,
        completed,
        status,
        created_at,
        updated_at
      FROM todos
      WHERE created_by = ?
      AND task_date = ?
    `;

    const params = [created_by, task_date];

    if (filter === "PENDING") {
      sql += ` AND completed = 0`;
    }

    if (filter === "COMPLETED") {
      sql += ` AND completed = 1`;
    }

    sql += ` ORDER BY id DESC`;

    const [rows] = await db.query(sql, params);
    return rows;
  },

  async getAllTodosByUser(created_by, filter) {
    let sql = `
      SELECT 
        id,
        created_by,
        task_date,
        start_time,
        end_time,
        title,
        subtitle,
        reminder_time,
        completed,
        status,
        created_at,
        updated_at
      FROM todos
      WHERE created_by = ?
    `;

    const params = [created_by];

    if (filter === "PENDING") {
      sql += ` AND completed = 0`;
    }

    if (filter === "COMPLETED") {
      sql += ` AND completed = 1`;
    }

    sql += ` ORDER BY task_date DESC, id DESC`;

    const [rows] = await db.query(sql, params);
    return rows;
  },

  async updateTodo(id, created_by, data) {
    const fields = [];
    const params = [];

    const allowedFields = [
      "task_date",
      "start_time",
      "end_time",
      "title",
      "subtitle",
      "reminder_time",
    ];

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        fields.push(`${field} = ?`);
        params.push(field === "subtitle" ? data[field] || "" : data[field] || null);
      }
    }

    if (!fields.length) {
      return { affectedRows: 0 };
    }

    params.push(id, created_by);

    const [result] = await db.query(
      `
      UPDATE todos
      SET ${fields.join(", ")}
      WHERE id = ?
      AND created_by = ?
      `,
      params
    );

    return result;
  },

  async markTodoCompleted(id, created_by) {
    const [result] = await db.query(
      `
      UPDATE todos
      SET completed = 1,
          status = 'COMPLETED'
      WHERE id = ?
      AND created_by = ?
      `,
      [id, created_by]
    );

    return result;
  },

  async markMultipleCompleted(ids, created_by) {
    const [result] = await db.query(
      `
      UPDATE todos
      SET completed = 1,
          status = 'COMPLETED'
      WHERE id IN (?)
      AND created_by = ?
      `,
      [ids, created_by]
    );

    return result;
  },

  async updateReminder(id, created_by, reminder_time) {
    const [result] = await db.query(
      `
      UPDATE todos
      SET reminder_time = ?
      WHERE id = ?
      AND created_by = ?
      `,
      [reminder_time, id, created_by]
    );

    return result;
  },

  async deleteTodo(id, created_by) {
    const [result] = await db.query(
      `
      DELETE FROM todos
      WHERE id = ?
      AND created_by = ?
      `,
      [id, created_by]
    );

    return result;
  },

  async deleteMultipleTodos(ids, created_by) {
    const [result] = await db.query(
      `
      DELETE FROM todos
      WHERE id IN (?)
      AND created_by = ?
      `,
      [ids, created_by]
    );

    return result;
  },
};

module.exports = TodoModel;
