import { useEffect, useState } from "react";
import { API } from "../../constants/config";
import { fetchDriveBlob } from "../../utils/driveFileCache";

export function isDriveUrl(url) {
  return typeof url === "string" && url.trim().length > 0 && /drive\.google\.com|docs\.google\.com/i.test(url);
}

export default function AuthedDriveImage({ fileUrl, authToken, alt, fallback }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);

  // Derived rather than pushed into state from the effect: "this isn't a Drive
  // URL" is knowable during render, so there's no reason to trigger a second
  // render pass to discover it.
  const canLoad = isDriveUrl(fileUrl) && Boolean(authToken);

  useEffect(() => {
    if (!canLoad) return undefined;

    let objectUrl;
    let cancelled = false;
    const proxyUrl = `${API}/view/image?url=${encodeURIComponent(fileUrl.trim())}`;

    (async () => {
      try {
        // The Blob itself lives in the shared cache; the object URL is per-mount
        // so the existing revoke-on-unmount stays correct.
        const blob = await fetchDriveBlob(proxyUrl, authToken);
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
  }, [authToken, canLoad, fileUrl]);

  if (canLoad && src && !failed) {
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
