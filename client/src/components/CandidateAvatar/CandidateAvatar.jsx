import { useAuth } from "../../auth/AuthContext";
import { getInitials } from "../../utils/format";
import AuthedDriveImage from "../AuthedDriveImage/AuthedDriveImage";

export default function CandidateAvatar({
  name,
  headshot,
  size = 44,
  background = "#286241",
  color = "#FFF",
  border,
  fontSize,
}) {
  const { token } = useAuth();
  const initialsSize = fontSize ?? Math.max(11, Math.round(size * 0.34));

  const fallback = (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background,
        color,
        fontWeight: 500,
        fontSize: initialsSize,
        letterSpacing: "0.02em",
      }}
    >
      {getInitials(name)}
    </div>
  );

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        overflow: "hidden",
        flexShrink: 0,
        border,
      }}
    >
      <AuthedDriveImage
        fileUrl={headshot}
        authToken={token}
        alt={name ? `${name} headshot` : "Candidate headshot"}
        fallback={fallback}
      />
    </div>
  );
}
