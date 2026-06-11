import { isDriveUrl } from "../../components/AuthedDriveImage/AuthedDriveImage";
import PdfViewer from "../../components/PdfViewer/PdfViewer";
import { API } from "../../constants/config";
import { css } from "../../theme/colors";
import SectionCard from "./components/SectionCard";

export default function ApplicationResumeSection({ candidate, resume, authToken }) {
  return (
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
              authToken={authToken}
            />
          </div>
        </>
      ) : (
        <p style={{ margin: 0, fontSize: 14, color: css.textGray }}>Not provided</p>
      )}
    </SectionCard>
  );
}
