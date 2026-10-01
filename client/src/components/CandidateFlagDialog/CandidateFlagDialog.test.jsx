import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CandidateFlagDialog from "./CandidateFlagDialog";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function jsonResponse(body, status = 201) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderDialog(overrides = {}) {
  const props = {
    open: true,
    resumeId: "resume-1",
    candidateName: "Julius McClain",
    authedFetch: vi.fn().mockResolvedValue(jsonResponse({ flagCount: 1, flaggedByMe: true })),
    onClose: vi.fn(),
    onFlagged: vi.fn(),
    ...overrides,
  };
  render(<CandidateFlagDialog {...props} />);
  return props;
}

describe("CandidateFlagDialog", () => {
  it("renders through a fixed viewport portal with a scroll-safe shell and sticky actions", () => {
    renderDialog();

    const dialog = screen.getByRole("dialog", { name: "Flag candidate" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.style.position).toBe("fixed");
    const form = dialog.querySelector("form");
    expect(form.style.maxHeight).toContain("100dvh");
    expect(form.style.overflowY).toBe("auto");
    expect(screen.getByRole("button", { name: "Create flag" }).parentElement.style.position).toBe("sticky");
  });

  it("locks background scrolling while open and restores it when closed", () => {
    const { rerender } = render(<CandidateFlagDialog {...renderDialogProps()} />);
    expect(document.body.style.overflow).toBe("hidden");
    rerender(<CandidateFlagDialog {...renderDialogProps()} open={false} />);
    expect(document.body.style.overflow).toBe("");
  });

  it("requires a trimmed 20-character reason", async () => {
    const user = userEvent.setup();
    renderDialog();
    const reason = screen.getByRole("textbox", { name: "Reason for flagging" });
    const submit = screen.getByRole("button", { name: "Create flag" });

    expect(document.activeElement).toBe(reason);
    expect(submit.disabled).toBe(true);
    await user.type(reason, "Too short");
    expect(submit.disabled).toBe(true);
    await user.clear(reason);
    await user.type(reason, "Needs an admin follow-up");
    expect(submit.disabled).toBe(false);
  });

  it("creates a resume-linked flag without submitting a grade", async () => {
    const user = userEvent.setup();
    const props = renderDialog();
    await user.type(screen.getByRole("textbox", { name: "Reason for flagging" }), "Needs an admin follow-up");
    await user.click(screen.getByRole("button", { name: "Create flag" }));

    await waitFor(() => expect(props.onFlagged).toHaveBeenCalledWith({ flagCount: 1, flaggedByMe: true }));
    expect(props.authedFetch).toHaveBeenCalledWith(
      expect.stringContaining("/candidate-flags"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ candidate_id: undefined, resume_id: "resume-1", reason: "Needs an admin follow-up" }),
      })
    );
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and reports API errors", async () => {
    const user = userEvent.setup();
    const props = renderDialog({ authedFetch: vi.fn().mockResolvedValue(jsonResponse({ error: "Already flagged" }, 409)) });
    await user.type(screen.getByRole("textbox", { name: "Reason for flagging" }), "Needs an admin follow-up");
    await user.click(screen.getByRole("button", { name: "Create flag" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Already flagged");
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes with Escape, Cancel, and a backdrop click", async () => {
    const user = userEvent.setup();
    const escapeProps = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(escapeProps.onClose).toHaveBeenCalledTimes(1);
    cleanup();

    const cancelProps = renderDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(cancelProps.onClose).toHaveBeenCalledTimes(1);
    cleanup();

    const backdropProps = renderDialog();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(backdropProps.onClose).toHaveBeenCalledTimes(1);
  });
});

function renderDialogProps() {
  return {
    open: true,
    resumeId: "resume-1",
    authedFetch: vi.fn(),
    onClose: vi.fn(),
  };
}
