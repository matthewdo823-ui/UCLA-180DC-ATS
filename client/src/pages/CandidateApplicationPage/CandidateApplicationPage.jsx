import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth, useAuthedFetch } from "../../auth/AuthContext";
import Topbar from "../../components/Topbar/Topbar";
import PdfViewer from "../../components/PdfViewer/PdfViewer";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import { serifFont } from "../../theme/typography";
import { formatDate, formatScore, getInitials, hasNumericScore, titleCase } from "../../utils/format";

const cardGreen = "#085041";
const cardMint = "#1D9E75";
const cardPale = "#EAF3DE";

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function displayValue(value, fallback = "Not provided") {
  return hasText(value) ? value.trim() : fallback;
}

function isDriveUrl(url) {
  return hasText(url) && /drive\.google\.com|docs\.google\.com/i.test(url);
}

function AuthedDriveImage({ fileUrl, authToken, alt, fallback }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isDriveUrl(fileUrl) || !authToken) {
      setFailed(true);
      return undefined;
    }

    let objectUrl;
    let cancelled = false;
    const proxyUrl = `${API}/view/image?url=${encodeURIComponent(fileUrl.trim())}`;

    (async () => {
      try {
        const res = await fetch(proxyUrl, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error("Failed to load image");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authToken, fileUrl]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    );
  }

  return fallback;
}

function SectionCard({ title, children }) {
  return (
    <section style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 10, padding: "20px 22px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
      <h2 style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: css.textGray }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailField({ label, value, href }) {
  const content = href && hasText(value) ? (
    <a href={href} target="_blank" rel="noreferrer" style={{ color: css.greenDark, fontWeight: 600, textDecoration: "none", wordBreak: "break-word" }}>
      {value}
    </a>
  ) : (
    <span style={{ color: css.textDark, fontWeight: 500, wordBreak: "break-word" }}>{displayValue(value)}</span>
  );

  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: css.textGray }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>{content}</p>
    </div>
  );
}

function EssayBlock({ label, text }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: css.greenDark }}>{label}</p>
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: hasText(text) ? css.textDark : css.textGray, whiteSpace: "pre-wrap" }}>
        {hasText(text) ? text.trim() : "Not provided"}
      </p>
    </div>
  );
}

function CategoryRow({ metric, value, maxPerCategory }) {
  const pct = hasNumericScore(value) ? Math.max(0, Math.min(100, (Number(value) / maxPerCategory) * 100)) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: css.textDark }}>{titleCase(metric)}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: cardGreen }}>
          {formatScore(value)} <span style={{ color: css.textGray, fontWeight: 400 }}>/ {maxPerCategory}</span>
        </span>
      </div>
      <div style={{ height: 5, background: "#EEF1EC", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: cardMint, borderRadius: 3 }} />
      </div>
    </div>
  );
}

export default function CandidateApplicationPage() {
  const { candidateId: resumeId } = useParams();
  const navigate = useNavigate();
  const authedFetch = useAuthedFetch();
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadApplication() {
      setLoading(true);
      setError("");
      try {
        const res = await authedFetch(`${API}/scoreboard/${resumeId}/application`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json.error || "Failed to load application");
        }
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load application");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (resumeId) loadApplication();
    return () => { cancelled = true; };
  }, [authedFetch, resumeId]);

  const candidate = data?.candidate;
  const resume = data?.resume;
  const scoring = data?.scoring;
  const contextLabel = data?.context?.cycle && data?.context?.round
    ? `${data.context.cycle.name} · ${data.context.round.name}`
    : "Candidate application";

  const linkedinHref = hasText(candidate?.linkedin) && !/^https?:\/\//i.test(candidate.linkedin)
    ? `https://${candidate.linkedin.trim()}`
    : candidate?.linkedin?.trim();

  const essays = [
    { label: "Why consulting?", text: candidate?.whyConsulting },
    { label: "Why 180 Degrees Consulting?", text: candidate?.why180dc },
    { label: "Why social impact?", text: candidate?.whySocialImpact },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13 }}>
      <Topbar phaseLabel={contextLabel} activeLabel="Application" rightSlot={<></>} />

      <div style={{ flex: 1, padding: "20px 22px 40px", maxWidth: 1180, margin: "0 auto", width: "100%" }}>
        <button
          type="button"
          onClick={() => navigate("/scoreboard")}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 20,
            padding: "8px 14px",
            borderRadius: 6,
            border: `1px solid ${css.borderLight}`,
            background: css.cardWhite,
            color: css.textDark,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          ← Back to scoreboard
        </button>

        {loading && (
          <div style={{ padding: 48, textAlign: "center", color: css.textGray }}>Loading application…</div>
        )}

        {!loading && error && (
          <div style={{ padding: 24, borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
            {error}
          </div>
        )}

        {!loading && !error && candidate && (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 300px) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
            <aside style={{ position: "sticky", top: 16 }}>
              <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                <div style={{ background: cardGreen, padding: "22px 20px 18px", textAlign: "center" }}>
                  <div style={{ width: 132, height: 132, borderRadius: "50%", margin: "0 auto 14px", overflow: "hidden", border: `3px solid ${cardMint}`, background: cardMint }}>
                    <AuthedDriveImage
                      fileUrl={candidate.headshot}
                      authToken={token}
                      alt={`${candidate.name} headshot`}
                      fallback={(
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 700, color: cardPale }}>
                          {getInitials(candidate.name)}
                        </div>
                      )}
                    />
                  </div>
                  <h1 style={{ margin: 0, fontFamily: serifFont, fontSize: 24, fontWeight: 600, color: cardPale, lineHeight: 1.15 }}>
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
                  {hasNumericScore(scoring?.normalizedScore) && (
                    <div style={{ marginTop: 6, paddingTop: 14, borderTop: `1px solid ${css.borderLight}` }}>
                      <p style={{ margin: "0 0 4px", fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", color: css.textGray }}>ROUND 1 SCORE</p>
                      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: cardGreen, lineHeight: 1 }}>
                        {formatScore(scoring.normalizedScore)}<span style={{ fontSize: 14 }}>%</span>
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>
                        {formatScore(scoring.aggregateScore)} raw pts · {scoring.numReviews} {scoring.numReviews === 1 ? "review" : "reviews"}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </aside>

            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
              <SectionCard title="Contact & profile">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
                  <DetailField label="Email" value={candidate.email} href={hasText(candidate.email) ? `mailto:${candidate.email}` : undefined} />
                  <DetailField label="Phone" value={candidate.phoneNumber} href={hasText(candidate.phoneNumber) ? `tel:${candidate.phoneNumber}` : undefined} />
                  <DetailField label="LinkedIn" value={candidate.linkedin} href={linkedinHref} />
                  <DetailField label="Year" value={candidate.year} />
                  <DetailField label="Major" value={candidate.major} />
                  <DetailField label="GPA" value={candidate.gpa} />
                  <DetailField label="URM" value={candidate.urm} />
                  <DetailField label="GM interest" value={candidate.gm} />
                  <DetailField label="Newbie training" value={candidate.newbieTraining} />
                  <DetailField label="Applied" value={formatDate(candidate.appliedAt || resume?.submittedAt, { style: "datetime" })} />
                </div>
              </SectionCard>

              <SectionCard title="Application responses">
                {essays.map(item => (
                  <EssayBlock key={item.label} label={item.label} text={item.text} />
                ))}
              </SectionCard>

              <SectionCard title="Extenuating circumstances">
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: hasText(candidate.extenuatingCircumstances) ? css.textDark : css.textGray, whiteSpace: "pre-wrap" }}>
                  {hasText(candidate.extenuatingCircumstances) ? candidate.extenuatingCircumstances.trim() : "Not provided"}
                </p>
              </SectionCard>

              <SectionCard title="Resume">
                {isDriveUrl(resume?.fileUrl) ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                      <p style={{ margin: 0, fontSize: 13, color: css.textGray }}>
                        {resume.name || candidate.name}
                      </p>
                      <a
                        href={resume.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 13, fontWeight: 600, color: css.greenDark, textDecoration: "none" }}
                      >
                        Open in Drive ↗
                      </a>
                    </div>
                    <div style={{ height: 480, border: `1px solid ${css.borderLight}`, borderRadius: 8, overflow: "hidden", background: "#F8FAF6" }}>
                      <PdfViewer
                        url={`${API}/view/pdf?url=${encodeURIComponent(resume.fileUrl)}`}
                        authToken={token}
                      />
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 14, color: css.textGray }}>Not provided</p>
                )}
              </SectionCard>

              <SectionCard title="Review summary">
                {scoring?.numReviews > 0 ? (
                  <>
                    {(scoring.metrics || []).map(metric => (
                      <CategoryRow
                        key={metric}
                        metric={metric}
                        value={scoring.categoryScores?.[metric]}
                        maxPerCategory={scoring.maxPerCategory}
                      />
                    ))}

                    <div style={{ marginTop: 18, borderTop: `1px solid ${css.borderLight}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                      {(scoring.reviews || []).map((review, index) => (
                      <div key={review.id} style={{ padding: "12px 14px", background: "#F8FAF6", borderRadius: 8, border: `1px solid ${css.borderLight}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: review.notes ? 8 : 0 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: css.textDark }}>
                              {review.reviewerName || review.reviewerEmail || `Reviewer ${index + 1}`}
                            </p>
                            <p style={{ margin: "2px 0 0", fontSize: 12, color: css.textGray }}>
                              {formatDate(review.submittedAt, { style: "datetime" })}
                              {review.decision && review.decision !== "pass" ? ` · ${titleCase(review.decision)}` : ""}
                            </p>
                          </div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: cardGreen }}>
                            {formatScore(review.normalizedScore)}% · {formatScore(review.score)} raw
                          </p>
                        </div>
                        {hasText(review.notes) && (
                          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: css.textDark, whiteSpace: "pre-wrap" }}>
                            {review.notes.trim()}
                          </p>
                        )}
                      </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p style={{ margin: 0, fontSize: 14, color: css.textGray }}>No reviews yet</p>
                )}
              </SectionCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
