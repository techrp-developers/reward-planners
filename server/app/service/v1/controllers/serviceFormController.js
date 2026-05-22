const ServiceFormModel = require("../models/serviceFormModel");

class ServiceFormController {
  // Get the Enquiry Form Fields
  async getEnquiryForm(req, res) {
    const { serviceId } = req.params;
    const form = await ServiceFormModel.findFormByServiceId(serviceId);

    res.json({
      success: true,
      data: form,
    });
  }
}

module.exports = new ServiceFormController();
