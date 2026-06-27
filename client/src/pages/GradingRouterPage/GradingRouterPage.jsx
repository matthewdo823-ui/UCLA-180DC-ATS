import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveCycle, getGradingPath } from "../../hooks/useActiveCycle";
import Topbar from "../../components/Topbar/Topbar";
import { css } from "../../theme/colors";

export default function GradingRouterPage() {
  const navigate = useNavigate();
  const { activeRound, cycle, loading, error, phaseLabel } = useActiveCycle();

  useEffect(() => {
    if (loading || !activeRound) return;
    navigate(getGradingPath(activeRound), { replace: true });
  }, [activeRound, loading, navigate]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: css.textGray, fontFamily: "'DM Sans', sans-serif" }}>
        Loading active round…
      </div>
    );
  }

  if (activeRound) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: css.textGray, fontFamily: "'DM Sans', sans-serif" }}>
        Redirecting…
      </div>
    );
  }

  const message = error
    || (cycle
      ? "No round is active right now. An admin must activate a round in Cycle Management before grading can begin."
      : "No active cycle. An admin must create and activate a cycle before grading can begin.");

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: css.bgLight, color: css.textDark, fontFamily: "'DM Sans', sans-serif", fontSize: 13, overflow: "hidden" }}>
      <Topbar phaseLabel={phaseLabel} showActivePill={false} rightSlot={<></>} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center", color: css.textGray, fontSize: 14, lineHeight: 1.5 }}>
          {message}
        </div>
      </div>
    </div>
  );
}
