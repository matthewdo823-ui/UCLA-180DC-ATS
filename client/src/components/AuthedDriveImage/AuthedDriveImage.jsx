import { useEffect, useState } from "react";
import { API } from "../../constants/config";

export function isDriveUrl(url) {
  return typeof url === "string" && url.trim().length > 0 && /drive\.google\.com|docs\.google\.com/i.test(url);
}

export default function AuthedDriveImage({ fileUrl, authToken, alt, fallback }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isDriveUrl(fileUrl) || !authToken) {
      setFailed(true);
      setSrc(null);
      return undefined;
    }

    let objectUrl;
    let cancelled = false;
    const proxyUrl = `${API}/view/image?url=${encodeURIComponent(fileUrl.trim())}`;

    (async () => {
      try {
        const res = await fetch(proxyUrl, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (!res.ok) throw new Error("Failed to load image");
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setSrc(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authToken, fileUrl]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={alt}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
    );
  }

  return fallback;
}
