import CandidateAvatar from "../../components/CandidateAvatar/CandidateAvatar";
import { css } from "../../theme/colors";
import { sansFont } from "../../theme/typography";
import { formatScore, hasNumericScore } from "../../utils/format";
import { formatReviewCountsStacked } from "../../utils/reviewCounts";
import { hasText } from "./applicationUtils";
import { cardGreen, cardMint, cardPale, ROUND_1_LABEL, UPCOMING_EVALUATION_ROUNDS } from "./constants";
import ApplicationResumeSection from "./ApplicationResumeSection";

export default function ApplicationProfileSidebar({ candidate, resume, scoring, authToken, candidateCount, resumeScreenRank, coffeeChatScore, coffeeChatEvaluationCount }) {
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
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 10, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              {[candidate.year, candidate.major, candidate.gpa ? `GPA ${candidate.gpa}` : ""].filter(Boolean).map(tag => (
                <span
                  key={tag}
                  style={{ display: "inline-block", alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", background: cardPale, color: cardGreen, fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20, boxSizing: "border-box" }}
                >
                  {tag}
                </span>
              ))}
            </div>
            <ApplicationResumeSection
              candidate={candidate}
              resume={resume}
              authToken={authToken}
              compact
            />
          </div>
          <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${css.borderLight}`, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: css.textGray, textTransform: "uppercase" }}>
                {ROUND_1_LABEL}
              </p>
              {hasNumericScore(scoring?.normalizedScore) ? (
                <>
                  <div style={{ display: "flex", alignItems: "stretch", gap: 13 }}>
                    <div style={{ minWidth: 48, paddingRight: 13, borderRight: `1px solid ${css.borderLight}` }}>
                      <p style={{ margin: 0, fontSize: 25, fontWeight: 700, color: cardGreen, lineHeight: 1 }}>
                        {resumeScreenRank ? `#${resumeScreenRank}` : "—"}
                      </p>
                      <p style={{ margin: "5px 0 0", fontSize: 10, color: css.textGray }}>
                        Rank{candidateCount ? ` of ${candidateCount}` : ""}
                      </p>
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: scoring?.adminOverride?.overrideScore != null ? "#E24B4A" : cardGreen, lineHeight: 1 }}>
                        {formatScore(scoring.normalizedScore)}<span style={{ fontSize: 14 }}>%</span>
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>Overall average</p>
                    </div>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12, color: css.textGray, lineHeight: 1.5, whiteSpace: "pre-line" }}>
                    {formatReviewCountsStacked(scoring)}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>No score yet</p>
              )}
            </div>
            <div>
              <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: css.textGray, textTransform: "uppercase" }}>
                Coffee Chats
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: coffeeChatScore > 0 ? cardGreen : coffeeChatScore < 0 ? "#E24B4A" : css.textGray }}>
                  {coffeeChatScore} pts
                </p>
                <p style={{ margin: 0, fontSize: 11, color: css.textGray }}>
                  {coffeeChatEvaluationCount} rating{coffeeChatEvaluationCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            {UPCOMING_EVALUATION_ROUNDS.filter((round) => round.id !== "round-2").map(round => (
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
