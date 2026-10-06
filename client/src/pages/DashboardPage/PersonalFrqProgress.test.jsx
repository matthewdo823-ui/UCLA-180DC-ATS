import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import PersonalFrqProgress from "./PersonalFrqProgress";
import GraderDashboard from "./GraderDashboard";

const mocks = vi.hoisted(() => ({ role: "admin" }));
vi.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: { role: mocks.role } }) }));
vi.mock("../../hooks/useActiveCycle", () => ({ useActiveCycle: () => ({ gradingPath: "/resume-screener" }) }));
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

function Destination() {
  const location = useLocation();
  return <output data-testid="destination">{JSON.stringify({ path: location.pathname, state: location.state })}</output>;
}

it.each(["admin", "board"])("routes %s directly to their FRQ history, even with no active round", (role) => {
  mocks.role = role;
  render(<MemoryRouter><PersonalFrqProgress /><Destination /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "View my FRQ reviews" }));
  expect(JSON.parse(screen.getByTestId("destination").textContent)).toEqual({
    path: "/resume-screener", state: { gradingMode: "frq", openPastQueue: true },
  });
});

it.each(["admin", "board", "member"])("shows only the appropriate screening goal for %s", (role) => {
  mocks.role = role;
  render(<MemoryRouter><GraderDashboard /></MemoryRouter>);
  expect(Boolean(screen.queryByText("Your resume-review goal"))).toBe(role === "member");
  expect(Boolean(screen.queryByRole("region", { name: "Your free-response progress" }))).toBe(role !== "member");
});

it("does not show FRQ progress to members", () => {
  mocks.role = "member";
  render(<MemoryRouter><PersonalFrqProgress /></MemoryRouter>);
  expect(screen.queryByRole("region", { name: "Your free-response progress" })).toBeNull();
});
