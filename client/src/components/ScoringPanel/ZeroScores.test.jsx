import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MetricRow from './MetricRow';
import FrqScoringPanel from '../FrqScoringPanel/FrqScoringPanel';

afterEach(cleanup);

it('selects resume zero as a score, not an empty value', () => {
  const onScore = vi.fn();
  const { rerender } = render(<MetricRow metric="experience" value={null} onScore={onScore} />);
  fireEvent.click(screen.getByRole('button', { name: '0', exact: true }));
  expect(onScore).toHaveBeenCalledWith('experience', 0);
  rerender(<MetricRow metric="experience" value={0} onScore={onScore} />);
  expect(screen.getByRole('button', { name: '0', exact: true }).getAttribute('aria-pressed')).toBe('true');
});

it('selects and completes an FRQ zero with the required notes', () => {
  const onScore = vi.fn();
  const onComplete = vi.fn();
  const props = { notes: 'No relevant answer provided.', onNotes: vi.fn(), onScore, onComplete };
  const { rerender } = render(<FrqScoringPanel {...props} score={null} />);
  fireEvent.click(screen.getByRole('button', { name: '0', exact: true }));
  expect(onScore).toHaveBeenCalledWith(0);
  rerender(<FrqScoringPanel {...props} score={0} />);
  const complete = screen.getByRole('button', { name: /Complete/ });
  expect(complete.disabled).toBe(false);
  fireEvent.click(complete);
  expect(onComplete).toHaveBeenCalledOnce();
});
