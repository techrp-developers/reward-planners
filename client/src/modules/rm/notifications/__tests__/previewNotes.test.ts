import { describe, expect, it } from "vitest";
import { campaignPreviewNotes } from "../notificationUtils";

const input = { title: "Something Special Just Arrived!", message: "Explore our latest collection.", contentType: "image", hasImage: true, destinationLabel: "Product details", category: "engagement" };

describe("campaignPreviewNotes", () => {
  it("has no warnings for a complete campaign and shows its destination", () => {
    expect(campaignPreviewNotes(input)).toEqual({ tapDestination: "Product details", warnings: [] });
  });
  it("falls back to the inbox and says so when no destination is chosen", () => {
    const notes = campaignPreviewNotes({ ...input, destinationLabel: null });
    expect(notes.tapDestination).toBe("Notification inbox");
    expect(notes.warnings.join(" ")).toMatch(/opens the notification inbox/);
  });
  it("warns about a long title, empty message, missing image and quiet marketing", () => {
    const { warnings } = campaignPreviewNotes({ ...input, title: "x".repeat(56), message: " ", hasImage: false, category: "marketing" });
    expect(warnings).toHaveLength(4);
  });
  it("does not ask for an image on a text notification", () => {
    expect(campaignPreviewNotes({ ...input, contentType: "standard", hasImage: false }).warnings).toEqual([]);
  });
});
