import { css } from "../../theme/colors";
import { ProgressBar, PrimaryButton } from "./dashboardComponents";

export default function FrqProgressCard({ progress, gradingOpen, onGrade, onHistory }) {
  const { count, expectedReviews: goal } = progress;
  const remaining = Math.max(0, goal - count);
  return (
    <section aria-label="Your free-response progress" style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 16, padding: "28px 32px", boxShadow: "0 4px 32px rgba(0,0,0,0.04)", marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <span style={{ fontSize: 13, color: css.textGray, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚖️</span> Your free-response goal
          </span>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 8 }}>Grade {goal} free response{goal === 1 ? "" : "s"}</div>
          <div style={{ fontSize: 13, color: remaining ? css.textGray : css.green, marginTop: 6, fontWeight: 600 }}>
            {remaining ? `${remaining} more to go` : "Goal complete — thank you!"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: css.textGray, fontWeight: 500 }}>{count} free response{count === 1 ? "" : "s"} graded</div>
          <div style={{ fontSize: 20, fontWeight: 700, marginTop: 4 }}>{goal > 0 ? `${count}/${goal}` : count}</div>
        </div>
      </div>
      <ProgressBar pct={goal > 0 ? Math.min(100, Math.round(count / goal * 100)) : 0} />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 24 }}>
        {gradingOpen && <PrimaryButton label="Grade Free Responses" onClick={onGrade} />}
        <button type="button" onClick={onHistory} style={{ background: "none", color: css.textGray, border: 0, padding: "10px 0", cursor: "pointer", font: "inherit", fontSize: 13 }}>View my FRQ reviews</button>
      </div>
      {!gradingOpen && <p style={{ color: css.textGray, fontSize: 12, marginBottom: 0 }}>Grading is closed. Your completed reviews are still available.</p>}
    </section>
  );
}
