import CandidateAvatar from "../../components/CandidateAvatar/CandidateAvatar";
import { css } from "../../theme/colors";
import { sansFont } from "../../theme/typography";
import { formatScore, hasNumericScore } from "../../utils/format";
import { hasText } from "./applicationUtils";
import { cardGreen, cardMint, cardPale, ROUND_1_LABEL, UPCOMING_EVALUATION_ROUNDS } from "./constants";

export default function ApplicationProfileSidebar({ candidate, resume, scoring }) {
  return (
    <aside style={{ position: "sticky", top: 16 }}>
      <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ background: cardGreen, padding: "22px 20px 18px", textAlign: "center" }}>
          <div style={{ margin: "0 auto 14px", width: 132 }}>
            <CandidateAvatar
              name={candidate.name}
              headshot={candidate.headshot}
              size={132}
              background={cardMint}
              color={cardPale}
              border={`3px solid ${cardMint}`}
              fontSize={34}
            />
          </div>
          <h1 style={{ margin: 0, fontFamily: sansFont, fontSize: 24, fontWeight: 600, color: cardPale, lineHeight: 1.15 }}>
            {candidate.name || resume?.name || "Unknown"}
          </h1>
          {hasText(candidate.pronouns) && (
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9FE1CB" }}>{candidate.pronouns}</p>
          )}
        </div>

        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
          {[candidate.year, candidate.major, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).map(tag => (
            <span
              key={tag}
              style={{ display: "inline-block", alignSelf: "flex-start", background: cardPale, color: cardGreen, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20 }}
            >
              {tag}
            </span>
          ))}
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${css.borderLight}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: css.textGray, textTransform: "uppercase" }}>
                {ROUND_1_LABEL}
              </p>
              {hasNumericScore(scoring?.normalizedScore) ? (
                <>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: scoring?.adminOverride?.overrideScore != null ? "#E24B4A" : cardGreen, lineHeight: 1 }}>
                      {formatScore(scoring.normalizedScore)}<span style={{ fontSize: 14 }}>%</span>
                    </p>
                    {scoring?.adminOverride?.overrideScore != null && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          padding: "3px 8px",
                          borderRadius: 20,
                          background: "rgba(226,75,74,0.12)",
                          color: "#E24B4A",
                          border: "1px solid rgba(226,75,74,0.28)",
                        }}
                      >
                        Overridden
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>
                    {scoring?.adminOverride?.overrideScore != null
                      ? `Admin override · ${scoring.numReviews} ${scoring.numReviews === 1 ? "review" : "reviews"}`
                      : `${formatScore(scoring.aggregateScore)} raw pts · ${scoring.numReviews} ${scoring.numReviews === 1 ? "review" : "reviews"}`
                    }
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>No score yet</p>
              )}
            </div>
            {UPCOMING_EVALUATION_ROUNDS.map(round => (
              <div key={round.id}>
                <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: css.textGray, textTransform: "uppercase" }}>
                  {round.label}
                </p>
                <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>—</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
