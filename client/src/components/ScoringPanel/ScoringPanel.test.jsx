import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScoringPanel from "./ScoringPanel";

afterEach(cleanup);

const rubric = { label: "Resume", metrics: ["impact"], maxPerCategory: 4 };

function renderPanel(overrides = {}) {
  const props = {
    rubric,
    scores: {},
    onScore: vi.fn(),
    notes: "",
    onNotes: vi.fn(),
    onAction: vi.fn(),
    onFlag: vi.fn(),
    scoringComplete: false,
    ...overrides,
  };
  render(<ScoringPanel {...props} />);
  return props;
}

describe("ScoringPanel flag action", () => {
  it("allows flagging before the rubric is complete", async () => {
    const user = userEvent.setup();
    const props = renderPanel();
    const flag = screen.getByRole("button", { name: /Flag$/ });
    expect(flag.disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Complete/ }).disabled).toBe(true);
    await user.click(flag);
    expect(props.onFlag).toHaveBeenCalledTimes(1);
    expect(props.onAction).not.toHaveBeenCalled();
  });

  it("submits a completed grade as pass, independently of flagging", async () => {
    const user = userEvent.setup();
    const props = renderPanel({ scores: { impact: 4 }, scoringComplete: true });
    await user.click(screen.getByRole("button", { name: /Complete/ }));
    expect(props.onAction).toHaveBeenCalledWith("pass");
  });

  it("disables duplicate flagging after success", () => {
    renderPanel({ flagged: true });
    expect(screen.getByRole("button", { name: /Flagged/ }).disabled).toBe(true);
  });
});
