import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CandidateSignalActions from "./CandidateSignalActions";

afterEach(cleanup);

function jsonResponse(body, status = 201) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("CandidateSignalActions flagging", () => {
  it("opens the shared viewport dialog instead of a row-bound popover", async () => {
    const user = userEvent.setup();
    render(<CandidateSignalActions resumeId="resume-1" authedFetch={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Flag candidate" }));
    const dialog = screen.getByRole("dialog", { name: "Flag candidate" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.style.position).toBe("fixed");
  });

  it("reports a successful flag to its owning candidate row", async () => {
    const user = userEvent.setup();
    const onUpdated = vi.fn();
    const authedFetch = vi.fn().mockResolvedValue(jsonResponse({ flagCount: 2, flaggedByMe: true }));
    render(<CandidateSignalActions candidateId="candidate-1" resumeId="resume-1" authedFetch={authedFetch} onUpdated={onUpdated} />);

    await user.click(screen.getByRole("button", { name: "Flag candidate" }));
    await user.type(screen.getByRole("textbox", { name: "Reason for flagging" }), "Needs an admin follow-up");
    await user.click(screen.getByRole("button", { name: "Create flag" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: "candidate-1",
      resumeId: "resume-1",
      type: "flag",
      flagCount: 2,
      flaggedByMe: true,
    })));
  });
});
