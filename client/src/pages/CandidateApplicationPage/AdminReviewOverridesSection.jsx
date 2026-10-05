import ReviewOverrideSection from "../../components/ReviewOverride/ReviewOverrideSection";
import SectionCard from "./components/SectionCard";

export default function AdminReviewOverridesSection({ isAdmin, resumeId, scoring, onOverrideSaved }) {
  const reviews = scoring?.reviews || [];
  if (!isAdmin || !resumeId || !reviews.length) return null;

  return (
    <SectionCard title="Admin review overrides">
      <ReviewOverrideSection
        resumeId={resumeId}
        reviews={reviews}
        metrics={scoring.metrics || []}
        maxPerCategory={scoring.maxPerCategory || 4}
        embedded
        onOverrideSaved={onOverrideSaved}
      />
    </SectionCard>
  );
}
