const db = require("../../../../config/database");

class InsuranceController {
  // start enquiry
  async startEnquiry(req, res) {
    const { insurance_type } = req.body;
    const userId = req.user?.user_id;

    if (!insurance_type) {
      return res.status(400).json({
        success: false,
        message: "Insurance type is required",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    //  STEP 1: Check existing draft
    const [existing] = await db.execute(
      `SELECT id FROM insurance_enquiries 
     WHERE user_id = ? 
     AND insurance_type = ? 
     AND status = 'draft'
     ORDER BY id DESC LIMIT 1`,
      [userId, insurance_type],
    );

    //  STEP 2: If exists → return same enquiry
    if (existing.length) {
      return res.json({
        success: true,
        enquiry_id: existing[0].id,
        message: "Resuming existing enquiry",
      });
    }

    //  STEP 3: Else create new
    const [result] = await db.execute(
      `INSERT INTO insurance_enquiries (user_id, insurance_type)
     VALUES (?, ?)`,
      [userId, insurance_type],
    );

    res.json({
      success: true,
      enquiry_id: result.insertId,
      message: "New enquiry created",
    });
  }

  // save steps
  async saveStep(req, res) {
    const { enquiry_id, step, section, data } = req.body;

    if (!enquiry_id || !step || !section || !data) {
      return res.status(400).json({
        success: false,
        message: "enquiry_id, step, section and data are required",
      });
    }

    const userId = req.user?.user_id;
    // const userId = 1;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    // 1. Get existing form_data
    const [rows] = await db.execute(
      `SELECT form_data FROM insurance_enquiries WHERE id = ? AND user_id = ?`,
      [enquiry_id, userId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Invalid enquiry",
      });
    }

    let formData = rows[0]?.form_data || {};

    try {
      if (typeof formData === "string") {
        formData = JSON.parse(formData);
      }
    } catch (e) {
      formData = {};
    }

    // 2. Merge new section
    formData[section] = data;

    // 3. invalidate plan if core data changes
    if (section === "members" || section === "health") {
      await db.execute(
        `UPDATE insurance_enquiries 
       SET selected_plan = NULL 
       WHERE id = ? AND user_id = ?`,
        [enquiry_id, userId],
      );
    }

    // 4. Update DB
    await db.execute(
      `UPDATE insurance_enquiries
     SET form_data = ?, step_completed = ?
     WHERE id = ? AND user_id = ?`,
      [JSON.stringify(formData), step, enquiry_id, userId],
    );

    res.json({ success: true });
  }

  // Get Enquiry
  async getEnquiry(req, res) {
    const userId = req.user?.user_id;
    // const userId = 1;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    const [rows] = await db.execute(
      `SELECT * FROM insurance_enquiries WHERE id = ? AND user_id = ?`,
      [req.params.id, userId],
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found",
      });
    }

    res.json({ success: true, data: rows[0] });
  }

  // Final Submission
  async completeEnquiry(req, res) {
    const { enquiry_id } = req.body;

    if (!enquiry_id) {
      return res.status(400).json({
        success: false,
        message: "enquiry_id is required",
      });
    }

    const userId = req.user?.user_id;
    // const userId = 1;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    try {
      const [rows] = await db.execute(
        `SELECT form_data, insurance_type 
       FROM insurance_enquiries 
       WHERE id = ? AND user_id = ?`,
        [enquiry_id, userId],
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false,
          message: "Enquiry not found",
        });
      }

      let formData = rows[0].form_data;
      const type = rows[0].insurance_type;

      try {
        if (typeof formData === "string") {
          formData = JSON.parse(formData);
        }
      } catch (e) {
        return res.status(500).json({
          success: false,
          message: "Invalid form data",
        });
      }

      // Validation
      if (type !== "personal_accident") {
        // health & super topup
        if (!formData.members || !Array.isArray(formData.members)) {
          return res.status(400).json({
            success: false,
            message: "Members missing or invalid",
          });
        }
      } else {
        // personal accident
        if (!formData.basic) {
          return res.status(400).json({
            success: false,
            message: "Personal accident requires basic details",
          });
        }
      }

      if (!formData.basic) {
        return res.status(400).json({
          success: false,
          message: "Basic details missing",
        });
      }

      // Type-based validation
      if (type === "health") {
        const health = formData.health;

        if (!health) {
          return res.status(400).json({
            success: false,
            message: "Health coverage missing",
          });
        }

        if (!health.sum_insured) {
          return res.status(400).json({
            success: false,
            message: "Sum insured missing",
          });
        }
      }

      if (type === "super_topup") {
        const st = formData.super_topup;

        if (!st) {
          return res.status(400).json({
            success: false,
            message: "Super top-up details missing",
          });
        }

        if (!st.sum_insured || !st.deductible) {
          return res.status(400).json({
            success: false,
            message: "Invalid super top-up data",
          });
        }
      }

      if (type === "personal_accident") {
        const pa = formData.personal_accident;

        if (!pa) {
          return res.status(400).json({
            success: false,
            message: "Personal accident details missing",
          });
        }

        if (!pa.sum_insured || !pa.occupation) {
          return res.status(400).json({
            success: false,
            message: "Invalid personal accident data",
          });
        }
      }

      await db.execute(
        `UPDATE insurance_enquiries
     SET status = 'completed'
     WHERE id = ? AND user_id = ?`,
        [enquiry_id, userId],
      );
      res.json({
        success: true,
        message: "Enquiry completed",
      });
    } catch (e) {
      console.error("completeEnquiry error:", e);
      return res.status(500).json({
        success: false,
        message: "Something went wrong",
      });
    }
  }

  // plan selection
  async selectPlan(req, res) {
    const { enquiry_id, plan } = req.body;

    if (!enquiry_id || !plan) {
      return res.status(400).json({
        success: false,
        message: "enquiry_id and plan are required",
      });
    }

    if (!plan.planId || !plan.selectedPremium) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan data",
      });
    }

    const userId = req.user?.user_id;
    // const userId = 1

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    await db.execute(
      `UPDATE insurance_enquiries
     SET selected_plan = ?
     WHERE id = ? AND user_id = ?`,
      [JSON.stringify(plan), enquiry_id, userId],
    );

    res.json({ success: true });
  }
}

module.exports = new InsuranceController();
