import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminReviewOverridesSection from "./AdminReviewOverridesSection";

vi.mock("../../components/ReviewOverride/ReviewOverrideSection", () => ({
  default: ({ resumeId, reviews, embedded, onOverrideSaved }) => (
    <button type="button" data-testid="override-controls" onClick={() => onOverrideSaved?.()}>{resumeId}:{reviews.length}:{String(embedded)}</button>
  ),
}));

afterEach(cleanup);

const scoring = {
  reviews: [{ id: "review-1" }],
  metrics: ["leadership"],
  maxPerCategory: 4,
};

describe("AdminReviewOverridesSection", () => {
  it("exposes review overrides to admins with existing reviews", () => {
    render(<AdminReviewOverridesSection isAdmin resumeId="resume-1" scoring={scoring} />);
    expect(screen.getByText("Admin review overrides")).toBeTruthy();
    expect(screen.getByTestId("override-controls").textContent).toBe("resume-1:1:true");
  });

  it("stays hidden from non-admins and candidates without reviews", () => {
    const { rerender } = render(<AdminReviewOverridesSection isAdmin={false} resumeId="resume-1" scoring={scoring} />);
    expect(screen.queryByTestId("override-controls")).toBeNull();
    rerender(<AdminReviewOverridesSection isAdmin resumeId="resume-1" scoring={{ reviews: [] }} />);
    expect(screen.queryByTestId("override-controls")).toBeNull();
  });

  it("propagates a completed override so profile and scoreboard caches can refresh", () => {
    const onOverrideSaved = vi.fn();
    render(<AdminReviewOverridesSection isAdmin resumeId="resume-1" scoring={scoring} onOverrideSaved={onOverrideSaved} />);
    screen.getByTestId("override-controls").click();
    expect(onOverrideSaved).toHaveBeenCalledTimes(1);
  });
});
