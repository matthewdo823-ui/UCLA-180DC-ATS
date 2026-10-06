import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { canGradeFrq } from "../../utils/auth";
import { canRecordGrades } from "../../constants/roundPhases";
import useGraderDashboard from "./useGraderDashboard";
import FrqProgressCard from "./FrqProgressCard";

export default function PersonalFrqProgress() {
  const { user } = useAuth();
  const eligible = canGradeFrq(user?.role);
  const { data, loading, error } = useGraderDashboard(eligible);
  const navigate = useNavigate();
  if (!eligible) return null;
  if (error) return <p role="alert">Your FRQ progress could not be loaded: {error}</p>;
  if (loading) return <p>Loading your FRQ progress…</p>;
  if (!data?.personalFrq) return null;
  return <FrqProgressCard
    progress={data.personalFrq}
    gradingOpen={data.context?.isResumeRound && canRecordGrades(data.context?.activeRound?.status)}
    onGrade={() => navigate("/grading", { state: { gradingMode: "frq" } })}
    onHistory={() => navigate("/grading", { state: { gradingMode: "frq", openPastQueue: true } })}
  />;
}
