import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CoffeeChatCandidateCard } from './InterviewManagementPage';

vi.mock('../../components/CandidateAvatar/CandidateAvatar', () => ({
  default: () => <span aria-hidden="true">Avatar</span>,
}));

vi.mock('../../components/CandidateProfileButton/CandidateProfileButton', () => ({
  default: ({ children }) => <span>{children}</span>,
}));

afterEach(cleanup);

function AutoSaveCard({ onSave }) {
  const [draft, setDraft] = useState({ rating: '', notes: '' });
  return (
    <CoffeeChatCandidateCard
      candidate={{ id: 'candidate-1', resumeId: 'resume-1', name: 'Alex Applicant' }}
      draft={draft}
      busy={false}
      onDraftChange={setDraft}
      onSave={onSave}
      onOpenProfile={() => {}}
      showSave={false}
      autoSave
    />
  );
}

describe('CoffeeChatCandidateCard', () => {
  it('shows only save state—not the aggregate ratings counter', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    render(<AutoSaveCard onSave={onSave} />);

    expect(screen.queryByText(/ratings? submitted/i)).toBeNull();
    expect(screen.queryByText(/saves automatically/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      candidate_id: 'candidate-1',
      rating: 'yes',
      notes: '',
    }));
    expect(await screen.findByText('Saved')).toBeTruthy();
  });

  it('queues a newer note behind an in-flight rating save', async () => {
    let finishFirstSave;
    const onSave = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirstSave = resolve; }))
      .mockResolvedValueOnce({});
    render(<AutoSaveCard onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const notes = screen.getByPlaceholderText('Coffee Chat notes…');
    fireEvent.change(notes, { target: { value: 'Latest conversation note' } });
    fireEvent.blur(notes);

    expect(onSave).toHaveBeenCalledTimes(1);
    finishFirstSave({});

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({
      candidate_id: 'candidate-1',
      rating: 'yes',
      notes: 'Latest conversation note',
    });
    expect(await screen.findByText('Saved')).toBeTruthy();
  });
});
