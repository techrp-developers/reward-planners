const ManagerModel = require("../models/managerModel");
const db = require("../config/database");
const ExcelJS = require("exceljs");

class ManagerController {
  // ========== BASIC STATS FOR CARDS ==========
  async getDashboardStats(req, res) {
    try {
      const data = await ManagerModel.fetchStats();
      res.json({ success: true, data });
    } catch (err) {
      console.error("STATS ERROR:", err);
      res.status(500).json({ success: false, message: "Failed to load stats" });
    }
  }

  // ========== CHARTS DATA ==========
  async getDashboardCharts(req, res) {
    try {
      const data = await ManagerModel.fetchCharts();
      res.json({ success: true, data });
    } catch (err) {
      console.error("CHARTS ERROR:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to load chart data" });
    }
  }

  // all Vendor List
  async vendorList(req, res) {
    const role = req.user?.role;

    try {
      if (role != "vendor_manager" && role != "admin") {
        return res
          .status(400)
          .json({ success: false, message: "Unauthorized user" });
      }

      const [vendorRows] = await db.query(
        `
        SELECT 
          v.*,
          u.email,
          u.phone,
          u.name,
          u.role
        FROM vendors v
        JOIN eusers u ON v.user_id = u.user_id
        WHERE v.status != 'pending'
          `,
        [role],
      );

      if (vendorRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Vendor not found",
        });
      }

      return res.json({
        data: vendorRows,
        success: true,
        message: "vendor fetched successfully",
      });
    } catch (error) {
      console.error("Error fetching vendor List:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to fetch Vendor Details" });
    }
  }

  // Download vendor report
  async getVendorReport(req, res) {
    try {
      const { status, fromDate, toDate } = req.query;

      const data = await ManagerModel.getVendorReport({
        status,
        fromDate,
        toDate,
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Vendor Report");

      worksheet.columns = [
        { header: "Vendor ID", key: "vendor_id", width: 18 },
        { header: "Company Name", key: "company_name", width: 25 },
        { header: "Owner Name", key: "full_name", width: 25 },
        { header: "Email", key: "email", width: 30 },
        { header: "Phone", key: "phone", width: 20 },
        { header: "GSTIN", key: "gstin", width: 20 },
        { header: "PAN", key: "pan_number", width: 20 },
        { header: "Status", key: "status", width: 15 },
        { header: "Created At", key: "created_at", width: 20 },
      ];

      data.forEach((v) => {
        worksheet.addRow({
          ...v,
          vendor_id: `VND-${v.vendor_id}`,
        });
      });

      worksheet.getRow(1).font = { bold: true };

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );

      res.setHeader(
        "Content-Disposition",
        "attachment; filename=vendor_report.xlsx",
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Vendor report error:", err);
      res.status(500).json({
        success: false,
        message: err.message,
      });
    }
  }

  // Approve vendor Product
  async approveProduct(req, res) {
    try {
      const { productId } = req.params;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [productRows] = await db.query(
        `SELECT * FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (productRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const product = productRows[0];

      if (productRows.length > 0) {
        await db.query(
          `UPDATE eproducts
         SET status = 'approved',rejection_reason=''
         WHERE product_id = ?`,
          [product.product_id],
        );
      }

      return res.json({
        success: true,
        message: "Product approved successfully",
      });
    } catch (error) {
      console.error("Approve product error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to approve products" });
    }
  }

  // reject vendor Product
  async rejectProduct(req, res) {
    try {
      const { productId } = req.params;
      const { reason } = req.body;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [productRows] = await db.query(
        `SELECT * FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (productRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const product = productRows[0];

      if (productRows.length > 0) {
        await db.query(
          `UPDATE eproducts
         SET status = 'rejected',rejection_reason = ?
         WHERE product_id = ?`,
          [reason, product.product_id],
        );
      }

      return res.json({
        success: true,
        message: "Product rejected successfully",
      });
    } catch (error) {
      console.error("Reject product error:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to reject product" });
    }
  }

  // Resubmission needed for vendor Product
  async resubmissionRequest(req, res) {
    try {
      const { productId } = req.params;
      const { reason } = req.body;

      if (!productId) {
        return res
          .status(400)
          .json({ success: false, message: "Product ID is required" });
      }

      const [productRows] = await db.query(
        `SELECT * FROM eproducts WHERE product_id = ?`,
        [productId],
      );

      if (productRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      const product = productRows[0];

      if (productRows.length > 0) {
        await db.query(
          `UPDATE eproducts
         SET status = 'resubmission',rejection_reason = ?
         WHERE product_id = ?`,
          [reason, product.product_id],
        );
      }

      return res.json({
        success: true,
        message: "Resubmission requested successfully",
      });
    } catch (error) {
      console.error("Product Resubmission error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send resubmission reject",
      });
    }
  }

  // get all documents
  async getAllDocuments(req, res) {
    try {
      const [rows] = await db.query(`SELECT * from documents`);

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      res.status(200).json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Get all Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching Documents",
        error: error.message,
      });
    }
  }

  // create a Document
  async createDocument(req, res) {
    try {
      const { name } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Document name is required",
        });
      }

      const [result] = await db.query(
        `INSERT INTO documents (document_name, status, created_at)
         VALUES (?, 1, NOW())`,
        [name],
      );

      res.status(201).json({
        success: true,
        message: "Document created successfully",
      });
    } catch (error) {
      console.error("Document creation error:", error);
      res.status(500).json({
        success: false,
        message: "Error creating Document",
        error: error.message,
      });
    }
  }

  // document By Id
  async getDocumentById(req, res) {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const [rows] = await db.query(
        `SELECT * FROM documents WHERE document_id = ?`,
        [id],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      res.status(200).json({
        success: true,
        data: rows[0],
      });
    } catch (error) {
      console.error("Get Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching document",
      });
    }
  }

  // update Doc
  async updateDocument(req, res) {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const { name } = req.body;

      if (!name || name.trim() === "") {
        return res.status(400).json({
          success: false,
          message: "Document name is required",
        });
      }

      // if (status === undefined) {
      //   return res.status(400).json({
      //     success: false,
      //     message: "Status is required",
      //   });
      // }
      const [result] = await db.query(
        `UPDATE documents 
         SET document_name = ?
         WHERE document_id = ?`,
        [name, id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      const [rows] = await db.execute(
        `SELECT * FROM documents WHERE document_id = ?`,
        [id],
      );

      res.status(200).json({
        success: true,
        message: "Document updated successfully",
        data: rows[0],
      });
    } catch (error) {
      console.error("Update Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error updating Document",
      });
    }
  }

  // delete Document
  async deleteDocument(req, res) {
    try {
      const id = Number(req.params.id);

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid document ID",
        });
      }

      const [result] = await db.execute(
        `DELETE FROM documents WHERE document_id = ?`,
        [id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }
      res.status(200).json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      console.error("Delete Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting Document",
      });
    }
  }

  // create category Document
  async createCategoryDocument(req, res) {
    try {
      const { category_id, document_id } = req.body;

      if (!category_id || !document_id) {
        return res.status(400).json({
          success: false,
          message: "Invalid category ID or Document ID",
        });
      }

      if (isNaN(category_id) || isNaN(document_id)) {
        return res.status(400).json({
          success: false,
          message: "Category ID and Document ID must be numbers",
        });
      }

      const [result] = await db.query(
        `INSERT INTO category_document (category_id, document_id, created_at)
       VALUES (?, ?, NOW())`,
        [category_id, document_id],
      );

      if (result.affectedRows > 0) {
        return res.status(201).json({
          success: true,
          message: "Document linked successfully",
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Failed to link document",
        });
      }
    } catch (error) {
      console.error("Document link error:", error);
      res.status(500).json({
        success: false,
        message: "Document link error",
      });
    }
  }

  // get all category document
  async getAllCategoryDocs(req, res) {
    try {
      const [rows] = await db.query(
        `SELECT cd.*, c.category_name ,d.document_name
         FROM category_document cd
         LEFT JOIN categories c ON cd.category_id = c.category_id
         LEFT JOIN documents d on cd.document_id = d.document_id`,
      );

      res.status(200).json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("Get all Category Documents error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching Category Documents",
        error: error.message,
      });
    }
  }

  // get category doc by Id
  async getCategoryDocById(req, res) {
    try {
      const id = req.params.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid category-document ID",
        });
      }

      const [row] = await db.query(
        `SELECT cd.*, c.category_name ,d.document_name
         FROM category_document cd
         LEFT JOIN categories c ON cd.category_id = c.category_id
         LEFT JOIN documents d on cd.document_id = d.document_id
         WHERE cd.id = ?`,
        [id],
      );

      res.status(200).json({
        success: true,
        data: row[0],
      });
    } catch (error) {
      console.error("Get category doc error:", error);
      res.status(500).json({
        success: false,
        message: "Error fetching category document",
        error: error.message,
      });
    }
  }

  // Delete category Document
  async deleteCategoryDocument(req, res) {
    try {
      const id = req.params.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: "Invalid category-document ID",
        });
      }

      const [result] = await db.query(
        `DELETE FROM category_document WHERE id = ?`,
        [id],
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "Document not found",
        });
      }

      res.status(200).json({
        success: true,
        message: "Document deleted successfully",
      });
    } catch (error) {
      console.error("Delete Document error:", error);
      res.status(500).json({
        success: false,
        message: "Error deleting Document",
        error: error.message,
      });
    }
  }

  // delete vendor
  /* ============================================================
          DELETE VENDOR 
    ============================================================ */
  async deactivateVendor(req, res) {
    const { vendorId } = req.params;

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      // 1. Check if vendor exists
      const [vendor] = await connection.query(
        `SELECT vendor_id, status FROM vendors WHERE vendor_id = ?`,
        [vendorId],
      );

      if (vendor.length === 0) {
        await connection.rollback();
        return res.status(404).json({ message: "Vendor not found" });
      }

      // 2. Optional: prevent duplicate deactivation
      if (vendor[0].status === "deleted") {
        await connection.rollback();
        return res.status(400).json({ message: "Vendor already inactive" });
      }

      // 3. Deactivate vendor
      await connection.query(
        `UPDATE vendors 
         SET status = 'deleted', updated_at = NOW()
         WHERE vendor_id = ?`,
        [vendorId],
      );

      // 4. Soft delete products
      await connection.query(
        `UPDATE eproducts
         SET 
           is_deleted = 1,
           is_visible = 0,
           is_searchable = 0
         WHERE vendor_id = ?`,
        [vendorId],
      );

      // 5. Disable variants
      await connection.query(
        `UPDATE product_variants pv
         JOIN eproducts p ON pv.product_id = p.product_id
         SET pv.is_visible = 0
         WHERE p.vendor_id = ?`,
        [vendorId],
      );

      await connection.commit();

      return res.status(200).json({
        message: "Vendor deactivated successfully",
      });
    } catch (error) {
      await connection.rollback();
      console.error("Deactivate Vendor Error:", error);
      return res.status(500).json({
        message: "Something went wrong",
        error: error.message,
      });
    } finally {
      connection.release();
    }
  }
}

module.exports = new ManagerController();
