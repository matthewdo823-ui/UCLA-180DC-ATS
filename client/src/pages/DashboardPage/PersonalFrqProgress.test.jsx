import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PersonalFrqProgress from "./PersonalFrqProgress";

const mocks = vi.hoisted(() => ({ role: "admin" }));
vi.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
vi.mock("./useGraderDashboard", () => ({ default: () => ({
  data: { personalFrq: { count: 12, expectedReviews: 20 }, context: {} },
  loading: false,
}) }));
afterEach(cleanup);

it.each(["admin", "board"])("shows personal FRQ progress to %s", (role) => {
  mocks.role = role;
  render(<MemoryRouter><PersonalFrqProgress /></MemoryRouter>);
  expect(screen.getByRole("region", { name: "Your free-response progress" })).toBeTruthy();
});

it("does not show FRQ progress to members", () => {
  mocks.role = "member";
  render(<MemoryRouter><PersonalFrqProgress /></MemoryRouter>);
  expect(screen.queryByRole("region", { name: "Your free-response progress" })).toBeNull();
});
