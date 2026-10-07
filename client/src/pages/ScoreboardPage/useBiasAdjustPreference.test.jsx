import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { useBiasAdjustPreference } from "./useBiasAdjustPreference";

function Scoreboard() {
  const [enabled, setEnabled] = useBiasAdjustPreference();
  return <>
    <button aria-pressed={enabled} onClick={() => setEnabled(value => !value)}>Bias adjust</button>
    <Link to="/candidate">Open candidate</Link>
  </>;
}

function App() {
  return <MemoryRouter><Routes>
    <Route path="/" element={<Scoreboard />} />
    <Route path="/candidate" element={<Link to="/">Back to scoreboard</Link>} />
  </Routes></MemoryRouter>;
}

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("keeps bias adjustment enabled after viewing a candidate and returning", () => {
  render(<App />);
  const toggle = screen.getByRole("button", { name: "Bias adjust" });
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(toggle);
  fireEvent.click(screen.getByText("Open candidate"));
  fireEvent.click(screen.getByText("Back to scoreboard"));
  expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
});

it("remembers both enabled and explicitly disabled preferences across remounts", () => {
  const first = render(<App />);
  fireEvent.click(screen.getByRole("button"));
  first.unmount();
  const second = render(<App />);
  expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button"));
  second.unmount();
  render(<App />);
  expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
});

it("still lets users toggle when browser storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Blocked"); });
  render(<App />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");
});
