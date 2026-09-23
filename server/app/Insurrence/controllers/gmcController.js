const GmcModel = require("../models/gmcModel");
const { generateInvoicePDF } = require("../../../services/Invoice/pdf-service");

class GmcController {
  async getGmcDetails(req, res) {
    try {
      const userId = req.user?.user_id || 37;

      const gmcDetails = await GmcModel.getByUserId(userId);

      return res.json({
        success: true,
        data: gmcDetails || null,
      });
    } catch (error) {
      console.error("Get GMC Details Error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to fetch GMC details",
      });
    }
  }

  async downloadGmcPdf(req, res) {
    try {
      const userId = req.query.userId || req.user?.user_id || 37;
      const gmcDetails = await GmcModel.getByUserId(userId);

      if (!gmcDetails) {
        return res.status(404).send("No GMC Insurance Card found for this user");
      }

      const isValid = (name) => {
        if (!name) return false;
        const n = name.trim().toLowerCase();
        return n !== "" && n !== "n/a" && n !== "—" && n !== "null" && n !== "undefined";
      };

      const members = [];
      if (isValid(gmcDetails.name)) {
        members.push({ name: gmcDetails.name, clientId: gmcDetails.client_id || "—", dob: gmcDetails.dob || "—" });
      }
      if (isValid(gmcDetails.member_1_name)) {
        members.push({ name: gmcDetails.member_1_name, clientId: gmcDetails.member_1_client_id || "—", dob: gmcDetails.member_1_dob || "—" });
      }
      if (isValid(gmcDetails.member_2_name)) {
        members.push({ name: gmcDetails.member_2_name, clientId: gmcDetails.member_2_client_id || "—", dob: gmcDetails.member_2_dob || "—" });
      }
      if (isValid(gmcDetails.member_3_name)) {
        members.push({ name: gmcDetails.member_3_name, clientId: gmcDetails.member_3_client_id || "—", dob: gmcDetails.member_3_dob || "—" });
      }
      if (isValid(gmcDetails.member_4_name)) {
        members.push({ name: gmcDetails.member_4_name, clientId: gmcDetails.member_4_client_id || "—", dob: gmcDetails.member_4_dob || "—" });
      }
      if (isValid(gmcDetails.member_5_name)) {
        members.push({ name: gmcDetails.member_5_name, clientId: gmcDetails.member_5_client_id || "—", dob: gmcDetails.member_5_dob || "—" });
      }

      const membersHtml = members.map(m => `
        <tr>
          <td style="width: 50%; font-size: 10px; padding: 4px 0; color: #ffffff;">${m.name.toUpperCase()}</td>
          <td style="width: 27%; font-size: 10px; padding: 4px 0; color: #ffffff;">${m.clientId}</td>
          <td style="width: 23%; font-size: 10px; padding: 4px 0; color: #ffffff;">${m.dob}</td>
        </tr>
      `).join("");

      const isGroup = gmcDetails.policy_type === "Group Health Card";

      // HTML Layout matching the exact design
      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 30px;
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: #ffffff;
            color: #334155;
          }
          .page-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 25px;
            color: #0f172a;
            letter-spacing: 0.5px;
          }
          .cards-container {
            display: flex;
            flex-direction: column;
            gap: 25px;
            align-items: center;
          }
          .ecard {
            width: 500px;
            min-height: 280px;
            background: linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #075985 100%);
            border-radius: 14px;
            padding: 14px 18px;
            box-sizing: border-box;
            color: #ffffff;
            position: relative;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 0.8px solid rgba(255, 255, 255, 0.25);
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .care-logo-container {
            display: flex;
            align-items: center;
          }
          .care-logo-box {
            background-color: #fbbf24;
            padding: 2px 7px;
            border-radius: 4px;
            margin-right: 5px;
          }
          .care-logo-text {
            font-size: 16px;
            font-weight: 900;
            color: #0f172a;
            margin: 0;
          }
          .care-logo-sub-box {
            display: flex;
            flex-direction: column;
            line-height: 1;
          }
          .care-logo-sub-text {
            font-size: 9.5px;
            font-weight: 800;
            color: #fbbf24;
          }
          .care-logo-sub-text-min {
            font-size: 7.5px;
            font-weight: 800;
            color: #ffffff;
          }
          .header-right {
            text-align: right;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            line-height: 1.3;
          }
          .policy-info {
            margin-top: 6px;
          }
          .policy-type {
            font-size: 11px;
            font-weight: 800;
          }
          .company-name {
            font-size: 9.5px;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.75);
            margin-top: 1px;
          }
          .members-table {
            width: 100%;
            margin-top: 8px;
            border-collapse: collapse;
          }
          .members-table th {
            border-bottom: 0.5px solid rgba(255, 255, 255, 0.2);
            padding-bottom: 3px;
            font-size: 8px;
            color: rgba(255, 255, 255, 0.55);
            font-weight: 800;
            text-transform: uppercase;
            text-align: left;
          }
          .back-header {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: bold;
          }
          .back-middle-box {
            border: 0.8px solid rgba(255, 255, 255, 0.35);
            border-radius: 8px;
            overflow: hidden;
            margin-top: 8px;
          }
          .back-middle-cols {
            display: flex;
            justify-content: space-around;
            align-items: center;
            padding: 8px 0;
          }
          .back-col {
            text-align: center;
            flex: 1;
          }
          .back-col-label {
            font-size: 8px;
            color: rgba(255, 255, 255, 0.8);
            margin-top: 2px;
          }
          .back-col-val {
            font-size: 9px;
            font-weight: bold;
            margin-top: 1px;
          }
          .back-divider {
            width: 0.8px;
            height: 30px;
            background-color: rgba(255, 255, 255, 0.25);
          }
          .self-help-label {
            font-size: 9px;
            font-weight: 900;
            color: #fbbf24;
          }
          .back-bottom-bar {
            background-color: #ffffff;
            padding: 5px 0;
            text-align: center;
            color: #005b7f;
            font-size: 9px;
            font-weight: 800;
          }
          .back-footer {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            font-size: 7.5px;
            line-height: 1.25;
          }
          .disclaimer-title {
            font-weight: bold;
            margin-bottom: 2px;
            font-size: 8px;
          }
          .irda-box {
            text-align: right;
            align-self: flex-end;
            font-weight: bold;
          }
          .personal-info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            margin-top: 15px;
            gap: 10px;
          }
          .personal-label {
            font-size: 8px;
            color: rgba(255, 255, 255, 0.6);
            font-weight: bold;
            text-transform: uppercase;
          }
          .personal-value {
            font-size: 11px;
            font-weight: 800;
            margin-top: 2px;
          }
          .personal-family-bar {
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 6px 10px;
            margin-top: 20px;
            font-size: 9px;
            font-weight: 800;
          }
        </style>
      </head>
      <body>
        <div class="page-title">Health Insurance E-Card</div>
        <div class="cards-container">
          <!-- FRONT CARD -->
          <div class="ecard">
            <div class="card-header">
              <div class="care-logo-container">
                <div class="care-logo-box">
                  <span class="care-logo-text">care</span>
                </div>
                <div class="care-logo-sub-box">
                  <span class="care-logo-sub-text">HEALTH</span>
                  <span class="care-logo-sub-text-min">INSURANCE</span>
                </div>
              </div>
              <div class="header-right">
                <div>Policy Number : ${gmcDetails.policy_number || "—"}</div>
                <div>Member Id : ${gmcDetails.member_id || "—"}</div>
                <div>Valid Upto : ${gmcDetails.valid_till || "—"}</div>
              </div>
            </div>
            
            ${isGroup ? `
              <!-- GROUP CARD CONTENT -->
              <div class="policy-info">
                <div class="policy-type">Policy Type : ${gmcDetails.policy_type || "Group Health Card"}</div>
                <div class="company-name">${gmcDetails.policy_company_name || gmcDetails.company_name || "—"}</div>
              </div>
              <table class="members-table">
                <thead>
                  <tr>
                    <th style="width: 50%;">Name</th>
                    <th style="width: 27%;">Client Id</th>
                    <th style="width: 23%;">Dob</th>
                  </tr>
                </thead>
                <tbody>
                  ${membersHtml}
                </tbody>
              </table>
            ` : `
              <!-- PERSONAL CARD CONTENT -->
              <div class="policy-info">
                <div class="policy-type">Policy Type : ${gmcDetails.policy_type || "Personal Health Card"}</div>
                <div class="company-name">${gmcDetails.policy_company_name || "Care Health Insurance"}</div>
              </div>
              <div class="personal-info-grid">
                <div>
                  <div class="personal-label">Member Name</div>
                  <div class="personal-value">${gmcDetails.name || "—"}</div>
                </div>
                <div>
                  <div class="personal-label">Employee ID</div>
                  <div class="personal-value">${gmcDetails.employee_id || "—"}</div>
                </div>
                <div>
                  <div class="personal-label">DOB</div>
                  <div class="personal-value">${gmcDetails.dob || "—"}</div>
                </div>
              </div>
              <div class="personal-family-bar">
                Covered Family Members : ${members.length} Members
              </div>
            `}
          </div>

          ${isGroup ? `
            <!-- BACK CARD (Only for Group policies) -->
            <div class="ecard">
              <div class="back-header">
                <span>🌐 www.careinsurance.com</span>
              </div>
              <div class="back-middle-box">
                <div class="back-middle-cols">
                  <div class="back-col">
                    <div class="back-col-label">Care Health</div>
                    <div class="back-col-val">Customer APP</div>
                  </div>
                  <div class="back-divider"></div>
                  <div class="back-col">
                    <div class="back-col-label">WhatsApp</div>
                    <div class="back-col-val">8860402452</div>
                  </div>
                  <div class="back-divider"></div>
                  <div class="back-col">
                    <div class="self-help-label">⚡ SELF HELP</div>
                  </div>
                </div>
                <div class="back-bottom-bar">
                  Submit Your Queries/Request: www.careinsurance.com/contact-us.html
                </div>
              </div>
              <div class="back-footer">
                <div style="width: 75%;">
                  <div class="disclaimer-title">Disclaimer</div>
                  <div>1. This Card is not transferable.</div>
                  <div>2. Use of this Card is governed by the Policy Terms and Conditions.</div>
                  <div>3. To avail cashless facility, this Card needs to be produced along with photo ID proof.</div>
                  <div>4. Valid upto Policy Period End Date or cancellation date, whichever is earlier.</div>
                </div>
                <div class="irda-box" style="width: 25%;">
                  IRDA Registration No. 148
                </div>
              </div>
            </div>
          ` : ""}
        </div>
      </body>
      </html>
      `;

      const pdfBuffer = await generateInvoicePDF(htmlContent);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="care_ecard_${gmcDetails.policy_number}.pdf"`);
      return res.send(pdfBuffer);
    } catch (error) {
      console.error("Download GMC PDF Error:", error);
      return res.status(500).send("Failed to generate GMC PDF: " + error.message);
    }
  }

  async shareGmcPdfBase64(req, res) {
    try {
      const userId = req.query.userId || req.user?.user_id || 37;
      const gmcDetails = await GmcModel.getByUserId(userId);

      if (!gmcDetails) {
        return res.status(404).json({ success: false, message: "No GMC Insurance Card found" });
      }

      const isValid = (name) => {
        if (!name) return false;
        const n = name.trim().toLowerCase();
        return n !== "" && n !== "n/a" && n !== "—" && n !== "null" && n !== "undefined";
      };

      const members = [];
      if (isValid(gmcDetails.name)) {
        members.push({ name: gmcDetails.name, clientId: gmcDetails.client_id || "—", dob: gmcDetails.dob || "—" });
      }
      if (isValid(gmcDetails.member_1_name)) {
        members.push({ name: gmcDetails.member_1_name, clientId: gmcDetails.member_1_client_id || "—", dob: gmcDetails.member_1_dob || "—" });
      }
      if (isValid(gmcDetails.member_2_name)) {
        members.push({ name: gmcDetails.member_2_name, clientId: gmcDetails.member_2_client_id || "—", dob: gmcDetails.member_2_dob || "—" });
      }
      if (isValid(gmcDetails.member_3_name)) {
        members.push({ name: gmcDetails.member_3_name, clientId: gmcDetails.member_3_client_id || "—", dob: gmcDetails.member_3_dob || "—" });
      }
      if (isValid(gmcDetails.member_4_name)) {
        members.push({ name: gmcDetails.member_4_name, clientId: gmcDetails.member_4_client_id || "—", dob: gmcDetails.member_4_dob || "—" });
      }
      if (isValid(gmcDetails.member_5_name)) {
        members.push({ name: gmcDetails.member_5_name, clientId: gmcDetails.member_5_client_id || "—", dob: gmcDetails.member_5_dob || "—" });
      }

      const membersHtml = members.map(m => `
        <tr>
          <td style="width: 50%; font-size: 10px; padding: 4px 0; color: #ffffff;">${m.name.toUpperCase()}</td>
          <td style="width: 27%; font-size: 10px; padding: 4px 0; color: #ffffff;">${m.clientId}</td>
          <td style="width: 23%; font-size: 10px; padding: 4px 0; color: #ffffff;">${m.dob}</td>
        </tr>
      `).join("");

      const isGroup = gmcDetails.policy_type === "Group Health Card";

      const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 30px;
            display: flex;
            flex-direction: column;
            align-items: center;
            background-color: #ffffff;
            color: #334155;
          }
          .page-title {
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 25px;
            color: #0f172a;
            letter-spacing: 0.5px;
          }
          .cards-container {
            display: flex;
            flex-direction: column;
            gap: 25px;
            align-items: center;
          }
          .ecard {
            width: 500px;
            min-height: 280px;
            background: linear-gradient(135deg, #0284c7 0%, #0369a1 50%, #075985 100%);
            border-radius: 14px;
            padding: 14px 18px;
            box-sizing: border-box;
            color: #ffffff;
            position: relative;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 0.8px solid rgba(255, 255, 255, 0.25);
            padding-bottom: 6px;
            margin-bottom: 6px;
          }
          .care-logo-container {
            display: flex;
            align-items: center;
          }
          .care-logo-box {
            background-color: #fbbf24;
            padding: 2px 7px;
            border-radius: 4px;
            margin-right: 5px;
          }
          .care-logo-text {
            font-size: 16px;
            font-weight: 900;
            color: #0f172a;
            margin: 0;
          }
          .care-logo-sub-box {
            display: flex;
            flex-direction: column;
            line-height: 1;
          }
          .care-logo-sub-text {
            font-size: 9.5px;
            font-weight: 800;
            color: #fbbf24;
          }
          .care-logo-sub-text-min {
            font-size: 7.5px;
            font-weight: 800;
            color: #ffffff;
          }
          .header-right {
            text-align: right;
            font-size: 9px;
            font-weight: 700;
            text-transform: uppercase;
            line-height: 1.3;
          }
          .policy-info {
            margin-top: 6px;
          }
          .policy-type {
            font-size: 11px;
            font-weight: 800;
          }
          .company-name {
            font-size: 9.5px;
            font-weight: 700;
            color: rgba(255, 255, 255, 0.75);
            margin-top: 1px;
          }
          .members-table {
            width: 100%;
            margin-top: 8px;
            border-collapse: collapse;
          }
          .members-table th {
            border-bottom: 0.5px solid rgba(255, 255, 255, 0.2);
            padding-bottom: 3px;
            font-size: 8px;
            color: rgba(255, 255, 255, 0.55);
            font-weight: 800;
            text-transform: uppercase;
            text-align: left;
          }
          .back-header {
            display: flex;
            justify-content: center;
            align-items: center;
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: bold;
          }
          .back-middle-box {
            border: 0.8px solid rgba(255, 255, 255, 0.35);
            border-radius: 8px;
            overflow: hidden;
            margin-top: 8px;
          }
          .back-middle-cols {
            display: flex;
            justify-content: space-around;
            align-items: center;
            padding: 8px 0;
          }
          .back-col {
            text-align: center;
            flex: 1;
          }
          .back-col-label {
            font-size: 8px;
            color: rgba(255, 255, 255, 0.8);
            margin-top: 2px;
          }
          .back-col-val {
            font-size: 9px;
            font-weight: bold;
            margin-top: 1px;
          }
          .back-divider {
            width: 0.8px;
            height: 30px;
            background-color: rgba(255, 255, 255, 0.25);
          }
          .self-help-label {
            font-size: 9px;
            font-weight: 900;
            color: #fbbf24;
          }
          .back-bottom-bar {
            background-color: #ffffff;
            padding: 5px 0;
            text-align: center;
            color: #005b7f;
            font-size: 9px;
            font-weight: 800;
          }
          .back-footer {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            font-size: 7.5px;
            line-height: 1.25;
          }
          .disclaimer-title {
            font-weight: bold;
            margin-bottom: 2px;
            font-size: 8px;
          }
          .irda-box {
            text-align: right;
            align-self: flex-end;
            font-weight: bold;
          }
          .personal-info-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            margin-top: 15px;
            gap: 10px;
          }
          .personal-label {
            font-size: 8px;
            color: rgba(255, 255, 255, 0.6);
            font-weight: bold;
            text-transform: uppercase;
          }
          .personal-value {
            font-size: 11px;
            font-weight: 800;
            margin-top: 2px;
          }
          .personal-family-bar {
            background-color: rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            padding: 6px 10px;
            margin-top: 20px;
            font-size: 9px;
            font-weight: 800;
          }
        </style>
      </head>
      <body>
        <div class="page-title">Health Insurance E-Card</div>
        <div class="cards-container">
          <!-- FRONT CARD -->
          <div class="ecard">
            <div class="card-header">
              <div class="care-logo-container">
                <div class="care-logo-box">
                  <span class="care-logo-text">care</span>
                </div>
                <div class="care-logo-sub-box">
                  <span class="care-logo-sub-text">HEALTH</span>
                  <span class="care-logo-sub-text-min">INSURANCE</span>
                </div>
              </div>
              <div class="header-right">
                <div>Policy Number : ${gmcDetails.policy_number || "—"}</div>
                <div>Member Id : ${gmcDetails.member_id || "—"}</div>
                <div>Valid Upto : ${gmcDetails.valid_till || "—"}</div>
              </div>
            </div>
            
            ${isGroup ? `
              <!-- GROUP CARD CONTENT -->
              <div class="policy-info">
                <div class="policy-type">Policy Type : ${gmcDetails.policy_type || "Group Health Card"}</div>
                <div class="company-name">${gmcDetails.policy_company_name || gmcDetails.company_name || "—"}</div>
              </div>
              <table class="members-table">
                <thead>
                  <tr>
                    <th style="width: 50%;">Name</th>
                    <th style="width: 27%;">Client Id</th>
                    <th style="width: 23%;">Dob</th>
                  </tr>
                </thead>
                <tbody>
                  ${membersHtml}
                </tbody>
              </table>
            ` : `
              <!-- PERSONAL CARD CONTENT -->
              <div class="policy-info">
                <div class="policy-type">Policy Type : ${gmcDetails.policy_type || "Personal Health Card"}</div>
                <div class="company-name">${gmcDetails.policy_company_name || "Care Health Insurance"}</div>
              </div>
              <div class="personal-info-grid">
                <div>
                  <div class="personal-label">Member Name</div>
                  <div class="personal-value">${gmcDetails.name || "—"}</div>
                </div>
                <div>
                  <div class="personal-label">Employee ID</div>
                  <div class="personal-value">${gmcDetails.employee_id || "—"}</div>
                </div>
                <div>
                  <div class="personal-label">DOB</div>
                  <div class="personal-value">${gmcDetails.dob || "—"}</div>
                </div>
              </div>
              <div class="personal-family-bar">
                Covered Family Members : ${members.length} Members
              </div>
            `}
          </div>

          ${isGroup ? `
            <!-- BACK CARD (Only for Group policies) -->
            <div class="ecard">
              <div class="back-header">
                <span>🌐 www.careinsurance.com</span>
              </div>
              <div class="back-middle-box">
                <div class="back-middle-cols">
                  <div class="back-col">
                    <div class="back-col-label">Care Health</div>
                    <div class="back-col-val">Customer APP</div>
                  </div>
                  <div class="back-divider"></div>
                  <div class="back-col">
                    <div class="back-col-label">WhatsApp</div>
                    <div class="back-col-val">8860402452</div>
                  </div>
                  <div class="back-divider"></div>
                  <div class="back-col">
                    <div class="self-help-label">⚡ SELF HELP</div>
                  </div>
                </div>
                <div class="back-bottom-bar">
                  Submit Your Queries/Request: www.careinsurance.com/contact-us.html
                </div>
              </div>
              <div class="back-footer">
                <div style="width: 75%;">
                  <div class="disclaimer-title">Disclaimer</div>
                  <div>1. This Card is not transferable.</div>
                  <div>2. Use of this Card is governed by the Policy Terms and Conditions.</div>
                  <div>3. To avail cashless facility, this Card needs to be produced along with photo ID proof.</div>
                  <div>4. Valid upto Policy Period End Date or cancellation date, whichever is earlier.</div>
                </div>
                <div class="irda-box" style="width: 25%;">
                  IRDA Registration No. 148
                </div>
              </div>
            </div>
          ` : ""}
        </div>
      </body>
      </html>
      `;

      const pdfBuffer = await generateInvoicePDF(htmlContent);
      const base64 = pdfBuffer.toString("base64");

      return res.json({
        success: true,
        base64: base64,
        filename: `care_ecard_${gmcDetails.policy_number}.pdf`
      });
    } catch (error) {
      console.error("Share GMC PDF Base64 Error:", error);
      return res.status(500).json({ success: false, message: "Failed to generate base64 PDF: " + error.message });
    }
  }
}

module.exports = new GmcController();
