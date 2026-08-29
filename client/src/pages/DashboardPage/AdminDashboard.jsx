import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Topbar from "../../components/Topbar/Topbar";
import PageLoader from "../../components/PageLoader";
import { css } from "../../theme/colors";
import useAdminDashboard from "./useAdminDashboard";
import {
  pageStyle,
  Panel,
  ActionItemList,
  GraderProgressRows,
  RoundTimeline,
  PipelineBreakdown,
  twoColumnGridStyle,
} from "./dashboardComponents";

const severityRank = { critical: 0, warning: 1, info: 2 };

function getDashboardFocus({ context, pipeline, actionItems, isInterview }) {
  const sortedActions = [...actionItems].sort(
    (a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
  );
  const blocker = sortedActions.find((item) => item.severity === "critical");
  const priorityAction = sortedActions.find(
    (item) => item.severity === "critical" || item.severity === "warning"
  );

  if (!context?.cycle) {
    return {
      eyebrow: "Setup required",
      title: "Create a recruiting cycle",
      detail: "A cycle is needed before the application pipeline can start.",
      actionLabel: "Open cycle management",
      path: "/cycle-management",
    };
  }
  if (!context?.activeRound) {
    return {
      eyebrow: "Cycle paused",
      title: "Activate the next round",
      detail: "No work can move forward until a round is active.",
      actionLabel: "Manage rounds",
      path: "/cycle-management",
    };
  }
  if (blocker) {
    return {
      eyebrow: "Action required",
      title: blocker.label,
      detail: blocker.detail || "Resolve this before continuing the round.",
      actionLabel: "Resolve now",
      path: blocker.path,
    };
  }
  if (priorityAction) {
    return {
      eyebrow: "Needs attention",
      title: priorityAction.label,
      detail: priorityAction.detail || "Resolve this before moving on to routine work.",
      actionLabel: "Review now",
      path: priorityAction.path,
    };
  }
  if ((pipeline?.undecidedCount || 0) > 0 && (pipeline?.reviewed || 0) >= (pipeline?.applicants || 0)) {
    return {
      eyebrow: "Decisions ready",
      title: `${pipeline.undecidedCount} candidate${pipeline.undecidedCount === 1 ? "" : "s"} need a decision`,
      detail: "Review holds and pending candidates to finish this stage.",
      actionLabel: "Open decision queue",
      path: "/scoreboard",
    };
  }
  if ((pipeline?.awaitingReviews || 0) > 0) {
    const resumeLeft = pipeline.resumeReviewsRemaining || 0;
    const frqLeft = pipeline.frqReviewsRemaining || 0;
    return {
      eyebrow: `${context.activeRound.name || "Active round"}`,
      title: isInterview
        ? `${pipeline.awaitingReviews} candidate${pipeline.awaitingReviews === 1 ? "" : "s"} still need evaluation`
        : `${resumeLeft} resume · ${frqLeft} free-response grades left`,
      detail: isInterview
        ? `${pipeline.reviewed || 0} of ${pipeline.applicants || 0} evaluated.`
        : `${pipeline.resumeReviewed || 0}/${pipeline.applicants || 0} candidates have a resume grade; ${pipeline.frqReviewed || 0}/${pipeline.applicants || 0} have a free-response grade.`,
      actionLabel: isInterview ? "Open interviews" : "Open review queue",
      path: isInterview ? "/interviews" : "/scoreboard",
    };
  }
  return {
    eyebrow: `${context.activeRound.name || "Active round"}`,
    title: "The round is on track",
    detail: "No review work is waiting. Resolve any exceptions below or prepare the next step.",
    actionLabel: "View scoreboard",
    path: "/scoreboard",
  };
}

function AllActionItemsModal({ items, onClose, onNavigate }) {
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="all-action-items-title"
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <button
        type="button"
        aria-label="Close action items"
        onClick={onClose}
        style={{ position: "absolute", inset: 0, border: "none", background: "rgba(13, 27, 42, 0.34)", cursor: "default" }}
      />
      <div style={{ position: "relative", zIndex: 1, width: "min(620px, 100%)", maxHeight: "min(680px, calc(100vh - 48px))", overflowY: "auto", background: css.bgLight, border: `1px solid ${css.borderLight}`, borderRadius: 14, boxShadow: "0 20px 56px rgba(0,0,0,0.18)" }}>
        <div style={{ position: "sticky", top: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "18px 20px", background: css.bgLight, borderBottom: `1px solid ${css.borderLight}` }}>
          <div>
            <h2 id="all-action-items-title" style={{ margin: 0, fontSize: 17, letterSpacing: "-0.015em", color: css.textDark }}>All attention items</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: css.textGray }}>{items.length} item{items.length === 1 ? "" : "s"}, ordered by priority</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${css.borderLight}`, background: css.cardWhite, color: css.textGray, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: 20 }}>
          <ActionItemList items={items} onNavigate={onNavigate} />
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [showAllActionItems, setShowAllActionItems] = useState(false);
  const { data, loading, error } = useAdminDashboard();

  const context = data?.context;
  const pipeline = data?.pipeline;
  const graderSummary = data?.graderSummary;
  const actionItems = data?.actionItems || [];

  const isInterview = context?.isInterviewRound;
  const phaseLabel = context?.phaseLabel || "Admin Dashboard";

  const focus = getDashboardFocus({ context, pipeline, actionItems, isInterview });
  const sortedActionItems = [...actionItems].sort(
    (a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3)
  );
  const applicants = pipeline?.applicants || 0;
  const reviewPct = applicants ? Math.round(((pipeline?.reviewed || 0) / applicants) * 100) : 0;
  const resumeReviewPct = applicants ? Math.round(((pipeline?.resumeReviewed || 0) / applicants) * 100) : 0;
  const frqReviewPct = applicants ? Math.round(((pipeline?.frqReviewed || 0) / applicants) * 100) : 0;

  return (
    <div style={{ ...pageStyle, padding: 0 }}>
      <Topbar phaseLabel={phaseLabel} showActivePill={Boolean(context?.activeRound)} activeLabel="Admin" />

      <div style={{ padding: "24px 32px 40px", maxWidth: 1200, margin: "0 auto" }}>
        {error ? (
          <div style={{
            background: "rgba(226,75,74,0.08)",
            border: "1px solid rgba(226,75,74,0.22)",
            borderRadius: 12,
            padding: 16,
            color: css.red,
            fontSize: 14,
            marginBottom: 24,
          }}
          >
            {error}
          </div>
        ) : null}

        {loading ? (
          <PageLoader minHeight="60vh" />
        ) : (
          <>
            <Panel
              title={context?.cycle?.name ? `${context.cycle.name} · recruiting timeline` : "Recruiting timeline"}
              rightSlot={(
                <button type="button" onClick={() => navigate("/cycle-management")} style={{ border: "none", padding: 0, background: "transparent", color: css.greenDark, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  Manage cycles →
                </button>
              )}
            >
              <RoundTimeline
                rounds={context?.allRounds}
                activeRound={context?.activeRound}
                nextRound={context?.nextRound}
              />
            </Panel>

            <section style={{
              background: css.cardWhite,
              border: `1px solid ${css.borderLight}`,
              borderRadius: 14,
              padding: "28px 30px",
              marginBottom: 28,
              boxShadow: "0 2px 10px rgba(0,0,0,0.02)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: css.greenDark, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>
                  {focus.eyebrow}
                </div>
                <h1 style={{ fontSize: 26, lineHeight: 1.15, letterSpacing: "-0.025em", margin: 0, color: css.textDark }}>
                  {focus.title}
                </h1>
                <p style={{ margin: "9px 0 0", fontSize: 14, lineHeight: 1.5, color: css.textGray, maxWidth: 620 }}>{focus.detail}</p>
              </div>
              <div style={{ flexShrink: 0, minWidth: 142, textAlign: "right" }}>
                <div style={{ fontSize: 11, color: css.textGray, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Round progress</div>
                {isInterview ? (
                  <>
                    <div style={{ marginTop: 3, fontSize: 25, fontWeight: 700, color: css.greenDark, letterSpacing: "-0.03em" }}>{reviewPct}%</div>
                    <div style={{ marginTop: 2, marginBottom: 13, fontSize: 12, color: css.textGray }}>
                      {pipeline?.reviewed || 0} of {applicants} evaluated
                    </div>
                  </>
                ) : (
                  <div style={{ margin: "7px 0 13px", display: "grid", gap: 5, minWidth: 190 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 12 }}>
                      <span style={{ color: css.textGray }}>Resume</span>
                      <strong style={{ color: css.greenDark }}>{pipeline?.resumeReviewed || 0}/{applicants} · {resumeReviewPct}%</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 12 }}>
                      <span style={{ color: css.textGray }}>Free response</span>
                      <strong style={{ color: "#1D9E75" }}>{pipeline?.frqReviewed || 0}/{applicants} · {frqReviewPct}%</strong>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigate(focus.path)}
                  style={{ border: "none", borderRadius: 8, background: css.greenDark, color: "#FFF", padding: "11px 13px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", boxShadow: "0 2px 8px rgba(40, 98, 65, 0.16)" }}
                >
                  {focus.actionLabel} →
                </button>
              </div>
            </section>

            <Panel
              title={sortedActionItems.length ? "Needs attention" : "Everything clear"}
              rightSlot={sortedActionItems.length > 4 ? (
                <button type="button" onClick={() => setShowAllActionItems(true)} style={{ border: "none", padding: 0, background: "transparent", color: css.greenDark, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                  View all {sortedActionItems.length} items →
                </button>
              ) : null}
            >
              <ActionItemList items={sortedActionItems} onNavigate={navigate} limit={4} />
            </Panel>

            <div style={twoColumnGridStyle}>
              <Panel title={isInterview ? "Evaluation pipeline" : "Pipeline"}>
                <PipelineBreakdown pipeline={pipeline} isInterview={isInterview} />
              </Panel>

              <Panel title="Team health">
                {data?.graderLoadError ? (
                  <div style={{ fontSize: 14, color: css.red }}>{data.graderLoadError}</div>
                ) : !graderSummary ? (
                  <div style={{ fontSize: 14, color: css.textGray }}>No grader data for this cycle.</div>
                ) : (
                  <div style={{ background: css.cardWhite, border: `1px solid ${css.borderLight}`, borderRadius: 12, padding: "18px 20px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, paddingBottom: 14, marginBottom: 4, borderBottom: `1px solid ${css.borderLight}`, fontSize: 13 }}>
                      <span style={{ color: css.textDark, fontWeight: 700 }}>{graderSummary.activeGraders} resume-active <span style={{ color: css.textGray, fontWeight: 500 }}>of {graderSummary.graders} graders</span></span>
                      <span style={{ color: graderSummary.notStarted > 0 ? css.amber : css.green, fontWeight: 700 }}>{graderSummary.notStarted} with no resume grades</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", padding: "10px 0 12px", color: css.textGray, fontSize: 12 }}>
                      <span><strong style={{ color: css.textDark }}>{graderSummary.totalResumeGrades}</strong> resume grades</span>
                      <span><strong style={{ color: css.textDark }}>{graderSummary.totalFrqGrades}</strong> free-response grades</span>
                    </div>
                    {graderSummary.graderProgress?.length > 0 ? (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: css.textGray, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          Progress by grader
                        </div>
                        <div style={{ maxHeight: 430, overflowY: "auto", paddingRight: 4 }}>
                          <GraderProgressRows
                            graders={graderSummary.graderProgress}
                            expectedReviews={graderSummary.expectedReviews}
                            expectedFrqReviews={graderSummary.expectedFrqReviews}
                          />
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 13, color: css.textGray, paddingTop: 10 }}>No grader activity yet.</div>
                    )}
                  </div>
                )}
              </Panel>
            </div>

          </>
        )}
      </div>
      {showAllActionItems ? (
        <AllActionItemsModal
          items={sortedActionItems}
          onClose={() => setShowAllActionItems(false)}
          onNavigate={(path) => {
            setShowAllActionItems(false);
            navigate(path);
          }}
        />
      ) : null}
    </div>
  );
}
