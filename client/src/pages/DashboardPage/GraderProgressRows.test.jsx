import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GraderProgressRows } from './dashboardComponents';
import { mapGraderScoreboard } from './useAdminDashboard';

afterEach(cleanup);

it.each(['board', 'admin'])('shows only an FRQ goal for %s, retaining optional resume counts', role => {
  render(<GraderProgressRows graders={[{ id: 'staff', name: 'Staff', role, resumeReviewCount: 5, frqReviewCount: 7 }]}
    expectedReviews={30} expectedFrqReviews={20} />);
  expect(screen.queryByText('5 / 30')).toBeNull();
  expect(screen.getByText('7 / 20')).toBeTruthy();
});

it('shows only the resume goal for regular members', () => {
  render(<GraderProgressRows graders={[{ id: 'member', name: 'Member', role: 'member', reviewCount: 5 }]}
    expectedReviews={30} expectedFrqReviews={20} />);
  expect(screen.getByText('5 / 30')).toBeTruthy();
  expect(screen.queryByText('Free response reviews')).toBeNull();
});

it('preserves coffee chat progress for board members', () => {
  render(<GraderProgressRows graders={[{ id: 'staff', name: 'Staff', role: 'board', reviewCount: 5 }]}
    expectedReviews={10} mode="coffee_chat" />);
  expect(screen.getByText('5 / 10')).toBeTruthy();
});

it('excludes staff from member workload statistics without losing their review totals', () => {
  const summary = mapGraderScoreboard({ stats: { expectedReviews: 30, totalReviews: 70 }, graders: [
    { id: 'a', role: 'member', reviewCount: 0 },
    { id: 'b', role: 'member', reviewCount: 5 },
    { id: 'c', role: 'member', reviewCount: 30 },
    { id: 'd', role: 'board', reviewCount: 5 },
    { id: 'e', role: 'admin', reviewCount: 30 },
    { id: 'f', role: 'board', reviewCount: 0 },
  ] }, { stats: { expectedReviews: 20, totalReviews: 7 }, graders: [{ id: 'd', reviewCount: 7 }] });
  expect(summary).toMatchObject({ graders: 3, activeGraders: 2, notStarted: 1, behindCount: 1, completeCount: 1,
    totalResumeGrades: 70, totalFrqGrades: 7 });
  expect(summary.behindGraders.map(g => g.id)).toEqual(['b']);
  expect(summary.graderProgress).toHaveLength(6);
});
