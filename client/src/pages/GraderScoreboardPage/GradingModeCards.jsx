import { css } from '../../theme/colors';

export default function GradingModeCards({ modes, activeMode, totals, onChange }) {
  return <nav aria-label="Grading scoreboard" style={{ maxWidth: 1200, margin: '0 auto', width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
    {modes.map(mode => {
      const active = mode.id === activeMode;
      return <button key={mode.id} type="button" aria-pressed={active} onClick={() => onChange(mode.id)}
        style={{ textAlign: 'left', cursor: 'pointer', padding: '18px 22px', borderRadius: 12, border: `2px solid ${active ? css.greenDark : css.borderLight}`, background: active ? css.greenDark : css.cardWhite, color: active ? 'var(--color-on-primary)' : css.textDark, fontFamily: 'inherit', boxShadow: active ? '0 4px 16px rgba(40,98,65,0.18)' : 'none' }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{mode.label}</div>
        <div style={{ marginTop: 8, fontSize: 28, fontWeight: 700 }}>{totals[mode.id] ?? '—'}</div>
        <div style={{ marginTop: 3, fontSize: 12 }}>Total {mode.id === 'resume' ? 'resume reviews' : mode.id === 'frq' ? 'free-response reviews' : 'evaluations'} submitted</div>
      </button>;
    })}
  </nav>;
}
