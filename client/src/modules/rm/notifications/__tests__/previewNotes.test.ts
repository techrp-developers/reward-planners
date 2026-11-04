import { describe, expect, it } from "vitest";
import { campaignPreviewNotes } from "../notificationUtils";

const input = { title: "Something Special Just Arrived!", message: "Explore our latest collection.", contentType: "image", hasImage: true, destinationLabel: "Product details", category: "announcement" };

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
  it("warns that an empty title is empty", () => {
    expect(campaignPreviewNotes({ ...input, title: "" }).warnings).toEqual(["The title is empty."]);
  });
  it("names a destination the app cannot open yet and its fallback", () => {
    const notes = campaignPreviewNotes({ ...input, destinationLabel: "Events", destinationInApp: false });
    expect(notes.tapDestination).toMatch(/Events \(not in the app yet/);
    expect(notes.warnings[0]).toMatch(/no Events screen yet/);
  });
  it("tells the sender that engagement needs consent and respects quiet hours", () => {
    expect(campaignPreviewNotes({ ...input, category: "engagement" }).warnings.join(" ")).toMatch(/allowed engagement.*quiet hours/);
  });
  it("does not ask for an image on a text notification", () => {
    expect(campaignPreviewNotes({ ...input, contentType: "standard", hasImage: false }).warnings).toEqual([]);
  });
  it("names the record the tap opens, and asks for one when it is missing", () => {
    expect(campaignPreviewNotes({ ...input, destinationName: "Anti Tarnish Bow Chain", needsRecord: true }).tapDestination).toBe("Product details — Anti Tarnish Bow Chain");
    expect(campaignPreviewNotes({ ...input, destinationName: null, needsRecord: true }).warnings).toEqual(["Choose which product details to open."]);
  });
});
