import { css } from "../../theme/colors";
import { hasText } from "./applicationUtils";
import EssayBlock from "./components/EssayBlock";
import SectionCard from "./components/SectionCard";

const ESSAY_FIELDS = [
  { key: "whyConsulting", label: "Why consulting?" },
  { key: "why180dc", label: "Why 180 Degrees Consulting?" },
  { key: "whySocialImpact", label: "Why social impact?" },
];

export default function ApplicationResponsesSection({ candidate }) {
  return (
    <>
      <SectionCard title="Application responses">
        {ESSAY_FIELDS.map(({ key, label }) => (
          <EssayBlock key={key} label={label} text={candidate[key]} />
        ))}
      </SectionCard>

      <SectionCard title="Extenuating circumstances">
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: hasText(candidate.extenuatingCircumstances) ? css.textDark : css.textGray, whiteSpace: "pre-wrap" }}>
          {hasText(candidate.extenuatingCircumstances) ? candidate.extenuatingCircumstances.trim() : "Not provided"}
        </p>
      </SectionCard>
    </>
  );
}
