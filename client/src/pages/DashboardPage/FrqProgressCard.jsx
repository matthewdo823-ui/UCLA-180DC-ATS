import { css } from "../../theme/colors";
import { ProgressBar } from "./dashboardComponents";

export default function FrqProgressCard({ progress, gradingOpen, onGrade, onHistory }) {
  const { count, expectedReviews: goal } = progress;
  const remaining = Math.max(0, goal - count);
  return (
    <section aria-label="Your free-response progress" style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 16, padding: 24, marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Your free-response progress</h2>
          <p style={{ margin: "6px 0 0", color: css.textGray, fontSize: 13 }}>
            {remaining ? `${remaining} more to reach your cycle goal` : "Goal complete — thank you!"}
          </p>
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: css.greenDark }}>
          {count}<span style={{ fontSize: 16, color: css.textGray }}> / {goal} graded</span>
        </div>
      </div>
      <ProgressBar pct={goal > 0 ? Math.min(100, Math.round(count / goal * 100)) : 0} />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 18 }}>
        {gradingOpen && <button type="button" onClick={onGrade} style={{ background: css.greenDark, color: "#fff", border: 0, borderRadius: 8, padding: "10px 16px", cursor: "pointer", font: "inherit" }}>Grade free responses</button>}
        <button type="button" onClick={onHistory} style={{ background: css.cardWhite, color: css.greenDark, border: `1px solid ${css.borderLight}`, borderRadius: 8, padding: "10px 16px", cursor: "pointer", font: "inherit" }}>View my FRQ reviews</button>
      </div>
      {!gradingOpen && <p style={{ color: css.textGray, fontSize: 12, marginBottom: 0 }}>Grading is closed. Your completed reviews are still available.</p>}
    </section>
  );
}
