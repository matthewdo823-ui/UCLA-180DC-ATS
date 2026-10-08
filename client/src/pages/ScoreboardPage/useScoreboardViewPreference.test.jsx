import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useScoreboardViewPreference } from "./useScoreboardViewPreference";

function Controls({ scope = "active" }) {
  const [filters, setFilters, sortBy, setSortBy] = useScoreboardViewPreference(scope);
  return <>
    <output data-testid="state">{JSON.stringify({ filters, sortBy })}</output>
    <button onClick={() => setFilters((current) => ({
      ...current,
      major: "Computer Science",
      year: "Junior",
      reviews: "2+",
      scoreBand: "top",
      signals: "flagged",
      decision: "advance",
    }))}>Set filters</button>
    <button onClick={() => setSortBy("name_asc")}>Set sort</button>
  </>;
}

function state() {
  return JSON.parse(screen.getByTestId("state").textContent);
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("restores scoreboard filters and sorting after the page remounts", () => {
  const first = render(<Controls />);
  fireEvent.click(screen.getByText("Set filters"));
  fireEvent.click(screen.getByText("Set sort"));
  first.unmount();

  render(<Controls />);

  expect(state()).toEqual({
    filters: {
      major: "Computer Science",
      year: "Junior",
      reviews: "2+",
      scoreBand: "top",
      signals: "flagged",
      decision: "all",
    },
    sortBy: "name_asc",
  });
});

it("keeps preferences isolated by cycle", () => {
  const first = render(<Controls scope="cycle-one" />);
  fireEvent.click(screen.getByText("Set filters"));
  fireEvent.click(screen.getByText("Set sort"));
  first.unmount();

  render(<Controls scope="cycle-two" />);

  expect(state().filters.major).toBe("all");
  expect(state().sortBy).toBe("performance_desc");
});

it("falls back safely when stored values are invalid", () => {
  localStorage.setItem("ats:scoreboard:view:active", JSON.stringify({
    filters: { reviews: "many", scoreBand: "best", signals: "maybe" },
    sortBy: "random",
  }));

  render(<Controls />);

  expect(state().filters).toEqual({
    major: "all",
    year: "all",
    reviews: "all",
    scoreBand: "all",
    decision: "all",
    signals: "all",
  });
  expect(state().sortBy).toBe("performance_desc");
});

it("still lets filters work when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  render(<Controls />);

  fireEvent.click(screen.getByText("Set filters"));
  fireEvent.click(screen.getByText("Set sort"));

  expect(state().filters.major).toBe("Computer Science");
  expect(state().sortBy).toBe("name_asc");
});
