import { css } from "../../../theme/colors";

export default function SectionCard({ title, children }) {
  return (
    <section style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: "20px 22px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: css.textGray }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
