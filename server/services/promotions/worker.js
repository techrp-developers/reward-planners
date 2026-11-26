const db = require('../../config/database');
const { sendMail } = require('../mailService');
const { assertMailConfigured } = require('../../config/mailTransport');
const { render } = require('./content');
let running = false;
async function tick() {
  if (running) return;
  running = true;
  let connection;
  let locked = false;
  try {
    assertMailConfigured();
    connection = await db.getConnection();
    const [[lock]] = await connection.query("SELECT GET_LOCK('rm_promotion_sender',0) AS acquired");
    locked = Number(lock.acquired) === 1;
    if (!locked) return;
    // SMTP cannot guarantee exactly-once delivery. Never automatically resend an interrupted send.
    await connection.query("UPDATE rm_promotion_recipients SET status='unknown', error='Delivery interrupted; verify mailbox before resending' WHERE status='sending'");
    const [campaigns] = await connection.execute("SELECT * FROM rm_promotions WHERE status IN ('scheduled','sending') AND scheduled_at<=? ORDER BY scheduled_at LIMIT 5", [Date.now()]);
    for (const campaign of campaigns) {
      const [claim] = await connection.execute("UPDATE rm_promotions SET status='sending' WHERE id=? AND status IN ('scheduled','sending')", [campaign.id]);
      if (!claim.affectedRows) continue;
      const content = typeof campaign.content === 'string' ? JSON.parse(campaign.content) : campaign.content;
      const [rows] = await connection.execute("SELECT id,email FROM rm_promotion_recipients WHERE promotion_id=? AND status='pending' ORDER BY id LIMIT 50", [campaign.id]);
      for (const row of rows) {
        await connection.execute("UPDATE rm_promotion_recipients SET status='sending' WHERE id=?", [row.id]);
        try {
          await sendMail({ to: row.email, replyTo: campaign.reply_to, subject: content.subject, html: render(content), text: `${content.message}\n\n${(content.images || []).join('\n')}\n${content.mediaUrl || ''}` });
        } catch (error) {
          await connection.execute("UPDATE rm_promotion_recipients SET status='failed',error=? WHERE id=?", [String(error.code || 'SMTP_ERROR').slice(0, 255), row.id]);
          continue;
        }
        await connection.execute("UPDATE rm_promotion_recipients SET status='sent' WHERE id=?", [row.id]);
      }
      await connection.execute(`UPDATE rm_promotions SET status=CASE WHEN EXISTS (SELECT 1 FROM rm_promotion_recipients WHERE promotion_id=? AND status IN ('failed','unknown')) THEN 'completed_with_errors' ELSE 'sent' END WHERE id=? AND NOT EXISTS (SELECT 1 FROM rm_promotion_recipients WHERE promotion_id=? AND status='pending')`, [campaign.id, campaign.id, campaign.id]);
    }
  } catch (error) {
    if (error.message !== 'MAIL_CONFIG_MISSING') console.error('Promotion worker:', error.code || error.message);
  } finally {
    if (connection) {
      if (locked) await connection.query("SELECT RELEASE_LOCK('rm_promotion_sender')").catch(() => {});
      connection.release();
    }
    running = false;
  }
}
require('node-cron').schedule('* * * * *', tick);
module.exports = { tick };
