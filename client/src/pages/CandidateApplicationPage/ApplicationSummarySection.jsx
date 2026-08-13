import { css } from "../../theme/colors";
import { cardGreen, cardPale } from "./constants";
import SectionCard from "./components/SectionCard";

function SummaryParagraphs({ text }) {
  const paragraphs = String(text || "")
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return paragraphs.map((paragraph, index) => (
    <p
      key={index}
      style={{
        margin: index === 0 ? 0 : "12px 0 0",
        fontSize: 14,
        lineHeight: 1.65,
        color: css.textDark,
      }}
    >
      {paragraph}
    </p>
  ));
}

export default function ApplicationSummarySection({
  summary,
  generatedAt,
  loading,
  error,
  unavailable,
  onRefresh,
}) {
  if (unavailable) return null;

  return (
    <SectionCard title="AI candidate summary">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: loading || summary ? 14 : 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: css.textGray, lineHeight: 1.5, maxWidth: 560 }}>
          Incredible, 130 character AI summary powered by Gemma 4
        </p>
        {summary && !loading && (
          <button
            type="button"
            onClick={onRefresh}
            style={{
              flexShrink: 0,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${css.borderLight}`,
              background: css.cardWhite,
              color: cardGreen,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Regenerate
          </button>
        )}
      </div>

      {loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[0.92, 1, 0.78, 0.64].map((width, index) => (
            <div
              key={index}
              style={{
                height: 12,
                width: `${width * 100}%`,
                borderRadius: 6,
                background: `linear-gradient(90deg, ${cardPale} 0%, #f3f7ef 50%, ${cardPale} 100%)`,
                backgroundSize: "200% 100%",
                animation: "summaryShimmer 1.4s ease-in-out infinite",
              }}
            />
          ))}
          <style>{`
            @keyframes summaryShimmer {
              0% { background-position: 200% 0; }
              100% { background-position: -200% 0; }
            }
          `}</style>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>Generating summary…</p>
        </div>
      )}

      {!loading && error && (
        <div style={{ padding: "12px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13 }}>
          {error}
          <button
            type="button"
            onClick={onRefresh}
            style={{
              display: "block",
              marginTop: 10,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid #FECACA",
              background: css.cardWhite,
              color: "#991B1B",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && summary && (
        <>
          <SummaryParagraphs text={summary} />
          {generatedAt && (
            <p style={{ margin: "14px 0 0", fontSize: 11, color: css.textGray }}>
              Generated {new Date(generatedAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}
