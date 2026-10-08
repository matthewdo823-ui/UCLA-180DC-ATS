import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CoffeeChatCandidateCard } from './InterviewManagementPage';

vi.mock('../../components/CandidateAvatar/CandidateAvatar', () => ({
  default: () => <span aria-hidden="true">Avatar</span>,
}));

vi.mock('../../components/CandidateProfileButton/CandidateProfileButton', () => ({
  default: ({ children }) => <span>{children}</span>,
}));

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
});
