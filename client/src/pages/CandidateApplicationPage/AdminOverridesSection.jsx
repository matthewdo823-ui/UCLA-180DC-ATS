import SectionCard from "./components/SectionCard";
import ReviewOverrideSection from "../../components/ReviewOverride/ReviewOverrideSection";

export default function AdminOverridesSection({
  resumeId,
  scoring,
  onOverrideSaved,
}) {
  return (
    <SectionCard title="Admin override">
      <ReviewOverrideSection
        embedded
        resumeId={resumeId}
        reviews={scoring?.reviews ?? []}
        metrics={scoring?.metrics ?? []}
        maxPerCategory={scoring?.maxPerCategory ?? 4}
        onOverrideSaved={onOverrideSaved}
      />
    </SectionCard>
  );
}
