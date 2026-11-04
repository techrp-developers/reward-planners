import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { makeMeta } from "./fixtures";
import type { Destination } from "../notificationTypes";

const api = vi.hoisted(() => ({ catalogOptions: vi.fn(), catalogProducts: vi.fn(), previewMedia: vi.fn(), media: vi.fn() }));
vi.mock("../notificationApi", () => ({ notificationApi: api }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import MediaDestinationSection from "../tabs/MediaDestinationSection";

const dest = (key: string, label: string, entity: Destination["entity"] | "offer_campaign" | null, mobileRoute: Destination["mobileRoute"] = "verified"): Destination =>
  ({ key, module: "ecommerce", label, screen: "x", entity, mobileRoute, campaignAllowed: true }) as Destination;
const meta = makeMeta({ destinations: [
  dest("product", "Product details", "product"),
  dest("promotion", "Promotion (offer campaign)", "offer_campaign"),
  dest("product_category", "Product category", "category"),
  { ...dest("events", "Events", null, "not_in_app"), module: "common" },
] });

function renderSection(value: Partial<{ destination_type: string; destination_id: string }>, onName = vi.fn()) {
  render(<MediaDestinationSection meta={meta} editable module="ecommerce" assets={{}} onAssets={vi.fn()} onChange={vi.fn()} approvedLanguages={["en"]} hasHindi={false} hasMarathi={false}
    onDestinationName={onName}
    value={{ content_type: "standard", destination_type: "", destination_id: "", catalog_product_ids: [], media: {}, ...value }} />);
  return onName;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("destination picker", () => {
  it("offers only destinations the app can open", () => {
    renderSection({});
    const options = screen.getAllByRole("option").map((option) => option.textContent);
    expect(options).toContain("Promotion (offer campaign)");
    expect(options).not.toContain("Events");
  });

  it("previews the chosen product with image, name and price, and reports its name", async () => {
    api.catalogProducts.mockResolvedValue([{ product_id: 1125, product_name: "Anti Tarnish Bow Chain", image_url: "https://cdn.rewardplanners.com/p.jpg", price_from: 299, available: true }]);
    const onName = renderSection({ destination_type: "product", destination_id: "1125" });
    const card = await screen.findByTestId("selected-product");
    expect(card.textContent).toContain("Anti Tarnish Bow Chain");
    expect(card.textContent).toContain("₹299");
    expect(card.querySelector("img")?.getAttribute("src")).toBe("https://cdn.rewardplanners.com/p.jpg");
    await waitFor(() => expect(onName).toHaveBeenLastCalledWith("Anti Tarnish Bow Chain"));
    expect(api.catalogProducts).toHaveBeenCalledWith({ ids: "1125" });
  });

  it("lists live promotions with their banner, and says so when none are live", async () => {
    api.catalogOptions.mockResolvedValueOnce([{ campaign_id: 16, title: "Flash Deals", banner_image: "https://cdn.rewardplanners.com/b.jpg", product_count: 2 }]);
    const onName = renderSection({ destination_type: "promotion", destination_id: "16" });
    expect(api.catalogOptions).toHaveBeenCalledWith("promotions");
    expect(await screen.findByRole("option", { name: "Flash Deals · 2 products" })).toBeTruthy();
    expect(document.querySelector('img[src="https://cdn.rewardplanners.com/b.jpg"]')).toBeTruthy();
    await waitFor(() => expect(onName).toHaveBeenLastCalledWith("Flash Deals"));
    cleanup();

    api.catalogOptions.mockResolvedValueOnce([]);
    renderSection({ destination_type: "promotion", destination_id: "" });
    expect(await screen.findByText(/No offer campaign is live/)).toBeTruthy();
  });

  it("flags a saved record that is no longer available", async () => {
    api.catalogOptions.mockResolvedValueOnce([{ category_id: 3, category_name: "Beauty" }]);
    renderSection({ destination_type: "product_category", destination_id: "99" });
    expect(await screen.findByText(/no longer available/)).toBeTruthy();
  });
});
