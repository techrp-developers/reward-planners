const db = require("../config/database");

class DocumentController {
  async updateDocumentStatus(req, res) {
    try {
      const { documentId } = req.params;
      const { status, notes } = req.body;

      if (!["approved", "rejected", "pending"].includes(status)) {
        return res.status(400).json({ success: false, message: "Invalid status" });
      }

      const [result] = await db.execute(
        `UPDATE vendor_documents 
         SET verification_status = ?, verification_notes = ?
         WHERE document_id = ?`,
        [status, notes || null, documentId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Document not found" });
      }

      res.json({
        success: true,
        message: "Document updated successfully"
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({
        success: false,
        message: "Failed to update document",
        error: err.message
      });
    }
  }
}

module.exports = new DocumentController();
