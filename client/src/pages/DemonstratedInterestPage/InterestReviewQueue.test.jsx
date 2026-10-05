import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InterestReviewQueue } from "./DemonstratedInterestPanels";

afterEach(cleanup);

const queuePayload = {
  entries: [
    {
      id: "attendance-1",
      status: "unmatched",
      submittedName: "Julius McClain",
      submittedEmail: "julius@example.com",
      submittedUniversityId: "123456789",
      eventName: "Info Night",
      submittedAt: "2026-09-30T18:00:00.000Z",
    },
    {
      id: "attendance-2",
      status: "late",
      submittedName: "Taylor Smith",
      submittedEmail: "taylor@example.com",
      submittedUniversityId: "987654321",
      eventName: "Coffee Chat",
      submittedAt: "2026-09-30T19:00:00.000Z",
      matchedCandidate: { id: "candidate-2", name: "Taylor Smith", email: "taylor@example.com" },
    },
  ],
  candidates: [
    { id: "candidate-1", name: "Julius McClain", email: "julius@example.com" },
    { id: "candidate-2", name: "Taylor Smith", email: "taylor@example.com" },
  ],
};

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderQueue(authedFetch = vi.fn().mockResolvedValue(jsonResponse(queuePayload))) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onChanged = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={queryClient}>
      <InterestReviewQueue cycleId="cycle-1" authedFetch={authedFetch} onChanged={onChanged} />
    </QueryClientProvider>
  );
  return { authedFetch, onChanged };
}

describe("InterestReviewQueue", () => {
  it("renders compact identity rows and hides matching controls until opened", async () => {
    renderQueue();

    expect(await screen.findByText("1 unmatched candidate · 1 late submission")).toBeTruthy();
    expect(screen.getByText("Julius McClain")).toBeTruthy();
    expect(screen.getByText("julius@example.com")).toBeTruthy();
    expect(screen.getByText("UID 123456789")).toBeTruthy();
    expect(screen.getByText("Info Night")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: /Julius/ })).toBeNull();
  });

  it("opens one row and resolves the selected candidate", async () => {
    const user = userEvent.setup();
    const authedFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(queuePayload))
      .mockResolvedValueOnce(jsonResponse({ entry: { id: "attendance-1" } }));
    const { onChanged } = renderQueue(authedFetch);

    const row = await screen.findByRole("button", { name: /Julius McClain/ });
    await user.click(row);
    const candidateSelect = screen.getByRole("combobox", { name: /Julius McClain/ });
    await user.selectOptions(candidateSelect, "candidate-1");
    await user.click(screen.getByRole("button", { name: "Match" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(authedFetch).toHaveBeenLastCalledWith(
      expect.stringContaining("/interest-attendance/attendance-1"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "match", candidateId: "candidate-1" }),
      })
    );
  });

  it("keeps only one row expanded at a time", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(await screen.findByRole("button", { name: /Julius McClain/ }));
    expect(screen.getByRole("combobox", { name: /Julius McClain/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Taylor Smith/ }));
    expect(screen.queryByRole("combobox", { name: /Julius McClain/ })).toBeNull();
    expect(screen.getByRole("combobox", { name: /Taylor Smith/ })).toBeTruthy();
  });

  it("approves an already matched late submission without rematching it", async () => {
    const user = userEvent.setup();
    const authedFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(queuePayload))
      .mockResolvedValueOnce(jsonResponse({ entry: { id: "attendance-2" } }));
    const { onChanged } = renderQueue(authedFetch);

    await user.click(await screen.findByRole("button", { name: /Taylor Smith/ }));
    await user.click(screen.getByRole("button", { name: "Approve late" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(JSON.parse(authedFetch.mock.calls[1][1].body)).toEqual({ action: "approve" });
  });

  it("dismisses a queue entry from its expanded controls", async () => {
    const user = userEvent.setup();
    const authedFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse(queuePayload))
      .mockResolvedValueOnce(jsonResponse({ entry: { id: "attendance-1" } }));
    renderQueue(authedFetch);

    await user.click(await screen.findByRole("button", { name: /Julius McClain/ }));
    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    await waitFor(() => expect(authedFetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(authedFetch.mock.calls[1][1].body)).toEqual({ action: "dismiss" });
  });
});
