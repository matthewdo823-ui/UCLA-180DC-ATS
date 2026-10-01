import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GraderModal } from "./GraderScoreboardPage";

afterEach(cleanup);

const grader = {
  id: 7,
  name: "Jordan Reviewer",
  email: "jordan@example.com",
  role: "member",
  reviewCount: 6,
  expectedReviews: 30,
  progressScore: 20,
  averageNormalizedScore: 75,
  reviews: Array.from({ length: 6 }, (_, index) => ({
    id: `review-${index + 1}`,
    resumeId: `resume-${index + 1}`,
    resumeName: `Candidate ${index + 1}`,
    normalizedScore: 70 + index,
    submittedAt: "2026-09-30T18:00:00.000Z",
  })),
};

describe("GraderModal", () => {
  it("shows the complete review history and opens an individual candidate review", async () => {
    const user = userEvent.setup();
    const onReviewOpen = vi.fn();
    render(<GraderModal grader={grader} onClose={vi.fn()} onReviewOpen={onReviewOpen} />);

    expect(screen.getByText("RESUME REVIEWS (6)")).toBeTruthy();
    expect(screen.getByText("Candidate 6")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Open Candidate 6 review" }));
    expect(onReviewOpen).toHaveBeenCalledWith(expect.objectContaining({ resumeId: "resume-6" }));
  });

  it("closes with Escape", () => {
    const onClose = vi.fn();
    render(<GraderModal grader={grader} onClose={onClose} onReviewOpen={vi.fn()} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes when the backdrop is selected", () => {
    const onClose = vi.fn();
    render(<GraderModal grader={grader} onClose={onClose} onReviewOpen={vi.fn()} />);
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not offer profile navigation for an unlinked review", () => {
    render(
      <GraderModal
        grader={{ ...grader, reviews: [{ ...grader.reviews[0], resumeId: null, resumeName: "Unlinked candidate" }] }}
        onClose={vi.fn()}
        onReviewOpen={vi.fn()}
      />
    );
    expect(screen.queryByRole("button", { name: "Open Unlinked candidate review" })).toBeNull();
    expect(screen.getByText("Unlinked candidate")).toBeTruthy();
  });
});
