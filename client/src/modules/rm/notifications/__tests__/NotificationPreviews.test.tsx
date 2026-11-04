import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NotificationPreviews } from "../components";

const IMAGE = "https://cdn.rewardplanners.com/public/notifications/x.jpg";
afterEach(cleanup);

describe("NotificationPreviews", () => {
  it("offers iOS compact, iOS expanded, Android expanded and the in-app inbox card", async () => {
    render(<NotificationPreviews title="Just Landed!" message="Explore fresh arrivals." imageUrl={IMAGE} />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["iOS compact", "iOS expanded", "Android expanded", "In-app inbox"]);
    expect(screen.getByText(/small thumbnail here/)).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "In-app inbox" }));
    const card = screen.getByTestId("inbox-card-preview");
    expect(card.querySelector("img")?.getAttribute("src")).toBe(IMAGE);
    expect(card.textContent).toContain("Just Landed!");
  });

  it("leaves no empty image area on a text-only inbox card", async () => {
    render(<NotificationPreviews title="Your Order Is Confirmed!" message="Track your order." imageUrl={null} />);
    await userEvent.click(screen.getByRole("tab", { name: "In-app inbox" }));
    expect(screen.getByTestId("inbox-card-preview").querySelector("img")).toBeNull();
    await userEvent.click(screen.getByRole("tab", { name: "iOS expanded" }));
    expect(document.querySelector("img")).toBeNull();
  });
});
