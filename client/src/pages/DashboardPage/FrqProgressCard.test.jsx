import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FrqProgressCard from "./FrqProgressCard";

afterEach(cleanup);

it("updates remaining work when the cycle goal changes, keeping completed reviews", () => {
  const { rerender } = render(<FrqProgressCard progress={{ count: 12, expectedReviews: 30 }} gradingOpen />);
  expect(screen.getByText("18 more to reach your cycle goal")).toBeTruthy();
  rerender(<FrqProgressCard progress={{ count: 12, expectedReviews: 10 }} gradingOpen />);
  expect(screen.getByText("Goal complete — thank you!")).toBeTruthy();
  expect(screen.getByText("12")).toBeTruthy();
});

it("offers past reviews when grading is closed, without offering new grades", () => {
  const history = vi.fn();
  render(<FrqProgressCard progress={{ count: 12, expectedReviews: 30 }} gradingOpen={false} onHistory={history} />);
  expect(screen.queryByRole("button", { name: "Grade free responses" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "View my FRQ reviews" }));
  expect(history).toHaveBeenCalledOnce();
});
