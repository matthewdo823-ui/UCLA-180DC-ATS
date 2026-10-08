import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import ApplicationRoundsSection from './ApplicationRoundsSection';

describe('ApplicationRoundsSection Coffee Chat history', () => {
  it('keeps individual evaluations while omitting the aggregate points/coverage sentence', () => {
    render(
      <ApplicationRoundsSection
        scoring={{
          numReviews: 0,
          numFrqReviews: 0,
          coffeeChatScore: 1,
          coffeeChatExpectedEvaluationCount: 2,
          coffeeChatEvaluations: [{
            id: 'evaluation-1',
            rating: 'yes',
            weightedScore: 1,
            reviewerName: 'A Reviewer',
            notes: 'Thoughtful response.',
            submittedAt: '2026-10-08T12:00:00.000Z',
          }],
          roundGrades: [],
        }}
        roundDecision={null}
      />
    );

    expect(screen.getByText(/Coffee Chats/)).toBeTruthy();
    expect(screen.getByText('A Reviewer')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();
    expect(screen.getByText('Thoughtful response.')).toBeTruthy();
    expect(screen.queryByText(/points from/i)).toBeNull();
    expect(screen.queryByText(/1\s*\/\s*2\s+rating/i)).toBeNull();
    expect(screen.queryByText(/ratings? submitted/i)).toBeNull();
  });
});
