const db = require("../../../../config/database");
const CampaignModel = require("../../../../models/campaignModel");
const CDN_BASE_URL = "https://cdn.rewardplanners.com";
function getPublicUrl(path) {
  if (!path) return null;
  return `${CDN_BASE_URL}/${path}`;
}

class CampaignController {
  // ========================================user==========================================
  async getHomeCampaigns(req, res) {
    try {
      const data = await CampaignModel.getHomeCampaigns();

      return res.json({
        success: true,
        data,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getUserCampaigns(req, res) {
    try {
      const campaigns = await CampaignModel.getUserCampaigns(req.query);

      return res.json({
        success: true,
        count: campaigns.length,
        data: campaigns,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getUserCampaignById(req, res) {
    try {
      const campaign = await CampaignModel.getUserCampaignById(req.params.id);

      return res.json({
        success: true,
        data: campaign,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }

  async getCampaignProducts(req, res) {
    try {
      const products = await CampaignModel.getCampaignProducts(req.params.id);

      const data = products.map((product) => {
        const { image_url, ...rest } = product;

        return {
          ...rest,
          image: image_url ? `${CDN_BASE_URL}/${image_url}` : null,
        };
      });

      return res.json({
        success: true,
        count: products.length,
        data,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.message,
      });
    }
  }
}

module.exports = new CampaignController();
