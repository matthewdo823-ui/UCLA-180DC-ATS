import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import CoverageProgress from './CoverageProgress';
import { GradingGoalsPanel } from '../CycleManagementPage/CycleManagementPage';

afterEach(cleanup);

it('shows applicants times per-applicant goals separately from completed coverage', () => {
  const progress = { applicants: 394, perApplicant: 2, total: 788, completed: 353, percent: 45, fullyReviewedApplicants: 80 };
  render(<CoverageProgress coverage={{ resume: progress, frq: { ...progress, completed: 279, percent: 35 } }} />);
  expect(screen.getAllByText('394 applicants × 2 reviews = 788 required')).toHaveLength(2);
  expect(screen.getByText('353/788 · 45%')).toBeTruthy();
  expect(screen.getByText('279/788 · 35%')).toBeTruthy();
});

it('saves independent per-applicant and per-grader goals without pile-removal controls', async () => {
  const save = vi.fn().mockResolvedValue({ ok: true });
  render(<GradingGoalsPanel cycle={{ id: 'demo' }} authedFetch={save} onSaved={vi.fn()} />);
  const inputs = screen.getAllByRole('spinbutton');
  expect(inputs).toHaveLength(4);
  fireEvent.change(inputs[2], { target: { value: '3' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save goals' }));
  expect(JSON.parse(save.mock.calls[0][1].body)).toEqual({
    resumeGraderGoal: 30, frqGraderGoal: 30, resumeReviewsPerApplicant: 3, frqReviewsPerApplicant: 2,
  });
  expect(await screen.findByText('Grading goals saved.')).toBeTruthy();
  expect(screen.queryByText('Resume reviews before removal')).toBeNull();
});
