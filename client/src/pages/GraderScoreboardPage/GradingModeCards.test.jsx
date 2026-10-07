import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import GradingModeCards from './GradingModeCards';
afterEach(cleanup);
it('shows both submitted totals and switches scoreboard with a prominent button', () => {
  const onChange = vi.fn();
  render(<GradingModeCards modes={[{ id: 'resume', label: 'Resume grading' }, { id: 'frq', label: 'FRQ grading' }]} activeMode="resume" totals={{ resume: 123, frq: 45 }} onChange={onChange} />);
  expect(screen.getByText('123')).toBeTruthy();
  expect(screen.getByText('45')).toBeTruthy();
  const frq = screen.getByRole('button', { name: /FRQ grading/ });
  expect(frq.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(frq);
  expect(onChange).toHaveBeenCalledWith('frq');
});
