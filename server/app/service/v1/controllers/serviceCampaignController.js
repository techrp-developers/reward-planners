const CampaignModel = require("../../../../models/campaignModel");
const { getPublicUrl } = require("../../../../utils/publicUrl");
const { attachServiceOffers, getBestServiceOffers } = require("../utils/serviceOffers");
const { resolveModuleContent } = require("../../../common/controller/cmsController");

// Prices shown here are the same live offers service cart and checkout charge.
async function attachCampaignPrices(rows) {
  const variantRows = rows.filter((row) => row.variant_id);
  const offers = await getBestServiceOffers(variantRows.map((row) => row.variant_id));
  for (const row of variantRows) {
    const offer = offers.get(Number(row.variant_id));
    row.offer_price = offer ? offer.price : null;
    row.regular_price = Number(row.price);
    row.content_id = offer ? offer.contentId : null;
    row.campaign_id = offer ? offer.campaignId : null;
    row.is_offer = Boolean(offer);
  }
  await attachServiceOffers(rows.filter((row) => !row.variant_id), "service_id");
  return rows;
}

const publicService = (row) => {
  const regularPrice = Number(row.regular_price ?? row.price) || 0;
  const salePrice = row.offer_price ?? regularPrice;
  return {
    service_id: Number(row.service_id),
    variant_id: row.variant_id == null ? null : Number(row.variant_id),
    name: row.name,
    variant_name: row.variant_name,
    title: row.title,
    category: row.category_name,
    image: getPublicUrl(row.service_image, row.updated_at),
    rating: Number(row.rating || 0).toFixed(1),
    reviews: Number(row.rating_count || 0),
    estimated_days: row.estimated_days,
    original_price: regularPrice,
    offer_price: row.offer_price ?? null,
    sale_price: salePrice,
    price: `₹${salePrice.toFixed(2)}`,
    originalPrice: `₹${regularPrice.toFixed(2)}`,
    discount: `${regularPrice > 0 ? Math.max(0, Math.round(((regularPrice - salePrice) / regularPrice) * 100)) : 0}%`,
    is_offer: Boolean(row.is_offer),
    campaign_id: row.campaign_id ?? null,
    content_id: row.content_id ?? null,
  };
};

class ServiceCampaignController {
  async getHomeCampaigns(req, res) {
    try {
      const [data, content] = await Promise.all([
        CampaignModel.getHomeCampaigns("service"),
        resolveModuleContent("service"),
      ]);

      return res.json({
        success: true,
        data: { ...data, content },
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
      const campaigns = await CampaignModel.getUserCampaigns({ ...req.query, module: "service" });

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
      const campaign = await CampaignModel.getUserCampaignById(req.params.id, "service");

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

  async getCampaignServices(req, res) {
    try {
      const rows = await CampaignModel.getCampaignServices(req.params.id, req.query);
      const data = (await attachCampaignPrices(rows)).map(publicService);

      return res.json({
        success: true,
        count: data.length,
        show_section: data.length > 0,
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

module.exports = new ServiceCampaignController();
