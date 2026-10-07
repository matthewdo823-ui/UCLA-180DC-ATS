import { css } from '../../theme/colors';
import { ProgressBar } from './dashboardComponents';

export default function CoverageProgress({ coverage }) {
  if (!coverage) return <div style={{ fontSize: 12, color: css.textGray }}>Coverage unavailable</div>;
  return <div style={{ margin: '7px 0 13px', display: 'grid', gap: 16, minWidth: 230, textAlign: 'left' }}>
    {[['Resume', coverage.resume], ['Free response', coverage.frq]].map(([label, progress]) => (
      <div key={label}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 12 }}>
          <span style={{ color: css.textGray }}>{label}</span>
          <strong style={{ color: css.greenDark }}>{progress.completed}/{progress.total} · {progress.percent}%</strong>
        </div>
        <div role="progressbar" aria-label={`${label} coverage`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.max(0, Math.min(100, progress.percent || 0))}
          aria-valuetext={`${progress.completed} of ${progress.total} reviews, ${progress.percent}%`}
          style={{ marginTop: 8 }}>
          <ProgressBar pct={progress.percent} />
        </div>
      </div>
    ))}
  </div>;
}
