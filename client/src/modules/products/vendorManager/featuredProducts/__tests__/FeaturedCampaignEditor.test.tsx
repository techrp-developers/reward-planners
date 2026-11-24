// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { api } from "../../../../../common/api/api";
import FeaturedCampaignEditor from "../FeaturedCampaignEditor";

vi.mock("../../../../../common/api/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock("sweetalert2", () => ({
  default: { fire: vi.fn().mockResolvedValue({ isConfirmed: true }) },
}));

const campaign = {
  campaign_id: 14,
  title: "Featured Week",
  background_type: "gradient",
  background_color: "#4B0082",
  gradient_end_color: "#6A00FF",
  text_color: "#FFFFFF",
  cta_text: "Explore More",
  start_at: null,
  end_at: null,
  display_order: 0,
  status: "draft",
  banner_image: null,
};

const selectedProducts = [
  {
    product_id: 101,
    product_name: "First product",
    brand_name: "Rewards",
    category_name: "Gifts",
    sale_price: 100,
    image_url: null,
  },
  {
    product_id: 202,
    product_name: "Second product",
    brand_name: "Rewards",
    category_name: "Gifts",
    sale_price: 200,
    image_url: null,
  },
];

const mockApiResponses = () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (url.includes("/featured-products/search")) return { data: { data: [] } } as never;
    if (url.endsWith("/featured-products")) return { data: { data: selectedProducts } } as never;
    return { data: { data: campaign } } as never;
  });
};

const renderEditor = () => render(
  <MemoryRouter initialEntries={["/manager/featured-products/14"]}>
    <Routes>
      <Route path="/manager/featured-products/:id" element={<FeaturedCampaignEditor />} />
    </Routes>
  </MemoryRouter>,
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
  mockApiResponses();
});

describe("featured campaign editor", () => {
  it("shows controls only for the selected background mode and preserves other values", async () => {
    const user = userEvent.setup();
    renderEditor();
    await screen.findByDisplayValue("Featured Week");
    const modeGroup = screen.getByRole("group", { name: "Background style" });

    expect(screen.getByLabelText("Ending color hex value")).toHaveProperty("value", "#6A00FF");
    await user.click(screen.getByRole("button", { name: /Solid color/ }));
    expect(modeGroup.querySelector('[aria-pressed="true"]')?.textContent).toContain("Solid color");
    expect(screen.queryByLabelText("Ending color hex value")).toBeNull();
    expect(screen.queryByLabelText("Choose campaign background image")).toBeNull();
    expect(screen.getByLabelText("Background color hex value")).toHaveProperty("value", "#4B0082");

    await user.click(screen.getByRole("button", { name: /Background image/ }));
    expect(screen.getByLabelText("Choose campaign background image")).toBeTruthy();
    expect(screen.queryByLabelText("Background color hex value")).toBeNull();
    expect(screen.queryByLabelText("Ending color hex value")).toBeNull();
    expect(screen.getByLabelText("Heading and button text color hex value")).toHaveProperty("value", "#FFFFFF");

    await user.click(screen.getByRole("button", { name: /Gradient/ }));
    expect(screen.getByLabelText("Ending color hex value")).toHaveProperty("value", "#6A00FF");
  });

  it("rejects unsupported image contents and reports decoded image metadata", async () => {
    renderEditor();
    await screen.findByDisplayValue("Featured Week");
    await userEvent.click(screen.getByRole("button", { name: /Background image/ }));
    const fileInput = screen.getByLabelText("Choose campaign background image") as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: { files: [new File(["not an image"], "invalid.png", { type: "image/png" })] },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Choose a valid JPG, PNG, or WebP image.");

    class MockImage {
      naturalWidth = 1080;
      naturalHeight = 1350;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }

    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = vi.fn(() => "blob:featured-background");
      static revokeObjectURL = vi.fn();
    });
    fireEvent.change(fileInput, {
      target: {
        files: [new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])], "campaign.png", { type: "image/png" })],
      },
    });

    await waitFor(() => expect(screen.getByText(/1080 × 1350 px · 4:5 · 8 B · PNG/)).toBeTruthy());
  });

  it("reorders selected products with the accessible move controls", async () => {
    renderEditor();
    await screen.findByText("2 products selected · Home preview: 2 · Explore More: 2");
    await userEvent.click(screen.getByRole("button", { name: "Move Second product up" }));

    const selectedList = screen.getByRole("list");
    expect(Array.from(selectedList?.querySelectorAll(":scope > li [aria-label^='Display order']") ?? []).map((item) => item.textContent))
      .toEqual(["1", "2"]);
    expect(selectedList?.querySelectorAll(":scope > li")[0].textContent).toContain("Second product");
  });
});
