import { formatDate } from "../../utils/format";
import { hasText, linkedinHref } from "./applicationUtils";
import DetailField from "./components/DetailField";
import SectionCard from "./components/SectionCard";

export default function ApplicationContactSection({ candidate, resume }) {
  return (
    <SectionCard title="Contact & profile">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 }}>
        <DetailField label="Email" value={candidate.email} href={hasText(candidate.email) ? `mailto:${candidate.email}` : undefined} />
        <DetailField label="Phone" value={candidate.phoneNumber} href={hasText(candidate.phoneNumber) ? `tel:${candidate.phoneNumber}` : undefined} />
        <DetailField label="LinkedIn" value={candidate.linkedin} href={linkedinHref(candidate.linkedin)} />
        <DetailField label="Year" value={candidate.year} />
        <DetailField label="Major" value={candidate.major} />
        <DetailField label="GPA" value={candidate.gpa} />
        <DetailField label="Diversity identities" value={candidate.urm} />
        <DetailField label="GM interest" value={candidate.gm} />
        <DetailField label="Newbie training" value={candidate.newbieTraining} />
        <DetailField label="How they heard about 180DC" value={candidate.referralSource} />
        <DetailField label="Previously applied" value={candidate.previouslyApplied} />
        <DetailField label="Consulting Connect interest" value={candidate.consultingConnectInterest} />
        <DetailField label="Upcoming professional development" value={candidate.professionalDevelopment} />
        <DetailField label="Applied" value={formatDate(candidate.appliedAt || resume?.submittedAt, { style: "datetime" })} />
      </div>
    </SectionCard>
  );
}
