import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PipelineBreakdown } from './dashboardComponents';
afterEach(cleanup);
it('uses required review coverage even when all applicants have one review', () => {
  render(<PipelineBreakdown isInterview={false} pipeline={{
    applicants: 368, resumeReviewed: 368, frqReviewed: 368,
    coverage: {
      resume: { completed: 604, total: 736, percent: 82, remaining: 132 },
      frq: { completed: 534, total: 736, percent: 73, remaining: 202 },
    },
  }} />);
  expect(screen.getByText('604 / 736 (82%) · 132 left')).toBeTruthy();
  expect(screen.getByText('534 / 736 (73%) · 202 left')).toBeTruthy();
  expect(screen.queryByText(/368 \/ 368/)).toBeNull();
});
