import { css } from '../../theme/colors';

export default function CoverageProgress({ coverage }) {
  if (!coverage) return <div style={{ fontSize: 12, color: css.textGray }}>Coverage unavailable</div>;
  return <div style={{ margin: '7px 0 13px', display: 'grid', gap: 10, minWidth: 190, textAlign: 'left' }}>
    {coverage.fullyReviewedApplicants != null && <strong style={{ fontSize: 12, color: css.greenDark }}>{coverage.fullyReviewedApplicants}/{coverage.resume.applicants} applicants complete in both</strong>}
    {[['Resume', coverage.resume], ['Free response', coverage.frq]].map(([label, progress]) => (
      <div key={label}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, fontSize: 12 }}>
          <span style={{ color: css.textGray }}>{label}</span>
          <strong style={{ color: css.greenDark }}>{progress.completed}/{progress.total} · {progress.percent}%</strong>
        </div>
        <div style={{ fontSize: 11, color: css.textGray, marginTop: 3 }}>
          {progress.applicants} applicants × {progress.perApplicant} reviews = {progress.total} required
        </div>
        <div style={{ fontSize: 11, color: css.textGray, marginTop: 3 }}>
          {progress.fullyReviewedApplicants}/{progress.applicants} applicants fully reviewed
        </div>
      </div>
    ))}
    <div style={{ fontSize: 10, color: css.textGray }}>Extra reviews on one applicant don’t offset missing reviews on another.</div>
  </div>;
}
