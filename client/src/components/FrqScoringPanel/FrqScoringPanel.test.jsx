import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FrqScoringPanel from "./FrqScoringPanel";

afterEach(cleanup);

function renderPanel(overrides = {}) {
  const props = {
    score: null,
    onScore: vi.fn(),
    notes: "",
    onNotes: vi.fn(),
    onComplete: vi.fn(),
    onFlag: vi.fn(),
    scoringComplete: false,
    ...overrides,
  };
  render(<FrqScoringPanel {...props} />);
  return props;
}

describe("FrqScoringPanel flag action", () => {
  it("opens flagging independently from FRQ completion", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    expect(screen.getByRole("button", { name: /Complete/ }).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: /Flag$/ }));
    expect(props.onFlag).toHaveBeenCalledTimes(1);
    expect(props.onComplete).not.toHaveBeenCalled();
  });

  it("disables the flag action once this grader has flagged the candidate", () => {
    renderPanel({ flagged: true });
    expect(screen.getByRole("button", { name: /Flagged/ }).disabled).toBe(true);
  });
});
