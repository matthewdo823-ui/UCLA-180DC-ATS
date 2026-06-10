import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveCycle, getGradingPath } from "../../hooks/useActiveCycle";
import { css } from "../../theme/colors";

export default function GradingRouterPage() {
  const navigate = useNavigate();
  const { activeRound, loading, error } = useActiveCycle();

  useEffect(() => {
    if (loading) return;
    if (error || !activeRound) {
      navigate("/", { replace: true });
      return;
    }
    navigate(getGradingPath(activeRound), { replace: true });
  }, [activeRound, loading, error, navigate]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: css.textGray, fontFamily: "'DM Sans', sans-serif" }}>
      Loading active round…
    </div>
  );
}
