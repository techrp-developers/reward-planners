const db = require("../../../config/database");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class authModel {
  async findClient(clientId, clientSecret) {
    const [rows] = await db.execute(
      `SELECT
         id,
         client_name,
         client_id
       FROM api_clients
       WHERE client_id = ?
       AND client_secret = ?
       AND status = 1`,
      [clientId, clientSecret],
    );

    return rows[0];
  }
}

module.exports = new authModel();
