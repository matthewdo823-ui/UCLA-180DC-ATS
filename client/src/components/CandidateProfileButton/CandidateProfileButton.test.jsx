import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import CandidateProfileButton from "./CandidateProfileButton";

afterEach(cleanup);

describe("CandidateProfileButton", () => {
  it("opens the linked resume profile without triggering its parent row", () => {
    const onOpen = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <CandidateProfileButton resumeId="resume-1" candidateName="Julius McClain" onOpen={onOpen}>
          Avatar
        </CandidateProfileButton>
      </div>
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Julius McClain profile" }));
    expect(onOpen).toHaveBeenCalledWith("resume-1");
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("is disabled when no resume profile exists", () => {
    const onOpen = vi.fn();
    render(<CandidateProfileButton candidateName="No Resume" onOpen={onOpen}>Avatar</CandidateProfileButton>);
    const button = screen.getByRole("button");
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
