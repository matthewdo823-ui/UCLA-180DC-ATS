import { useEffect, useState } from "react";
import { API } from "../../constants/config";
import { fetchDriveImageBlob } from "../../utils/driveFileCache";
import { fetchHeadshotUrl } from "../../utils/headshotUrl";

export function isDriveUrl(url) {
  return typeof url === "string" && url.trim().length > 0 && /drive\.google\.com|docs\.google\.com/i.test(url);
}

function extractDriveFileId(url) {
  try {
    const parsed = new URL(url);
    return parsed.searchParams.get('id') || parsed.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || null;
  } catch {
    return null;
  }
}

// Start fetching shortly before a row scrolls into view, so the image is usually
// decoded by the time it's actually on screen.
const PRELOAD_MARGIN = "200px";

export default function AuthedDriveImage({ fileUrl, authToken, alt, fallback, candidateId }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  // Callback ref rather than useRef: the observer effect has to re-run once the
  // node actually attaches, and a ref object mutating doesn't trigger that.
  const [container, setContainer] = useState(null);
  const [inView, setInView] = useState(false);

  // Derived rather than pushed into state from the effect: "this isn't a Drive
  // URL" is knowable during render, so there's no reason to trigger a second
  // render pass to discover it.
  const driveVersion = extractDriveFileId(fileUrl);
  const canLoad = isDriveUrl(fileUrl) && Boolean(authToken) && Boolean(candidateId) && Boolean(driveVersion);

  // Only request images the user can actually see. The scoreboard renders one of
  // these per candidate with no pagination, so fetching on mount meant a few
  // hundred simultaneous requests through a single API instance — most of them
  // for rows far below the fold — which queued behind each other and rate-limited
  // upstream Drive. Gating on visibility cuts that to the dozen or so rows on
  // screen. Once seen, an image stays loaded: unloading on scroll-away would
  // re-request it the moment the user scrolled back.
  useEffect(() => {
    if (!canLoad || inView || !container) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: PRELOAD_MARGIN }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, [canLoad, container, inView]);

  useEffect(() => {
    if (!canLoad || !inView) return undefined;

    let objectUrl;
    let cancelled = false;

    (async () => {
      try {
        // Preferred path: the file has been copied into Supabase Storage, so the
        // browser fetches it from a CDN directly. No Authorization header means no
        // JS-mediated fetch, no Blob, and a URL the HTTP cache can reuse across
        // page loads — none of which the proxy path can offer.
        if (candidateId) {
          const signedUrl = await fetchHeadshotUrl(candidateId, authToken);
          if (cancelled) return;
          if (signedUrl) {
            setSrc(signedUrl);
            setFailed(false);
            return;
          }
        }

        // Not synced yet: use a candidate-bound fallback. The server resolves the
        // Drive URL from the authorized database row and verifies this version;
        // callers can no longer turn the service account into an arbitrary Drive
        // file proxy by supplying their own URL.
        const proxyUrl = `${API}/candidates/${encodeURIComponent(candidateId)}/headshot-content?version=${encodeURIComponent(driveVersion)}`;
        // The Blob itself lives in the shared cache; the object URL is per-mount
        // so the existing revoke-on-unmount stays correct.
        const blob = await fetchDriveImageBlob(proxyUrl, authToken);
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
  }, [authToken, canLoad, candidateId, driveVersion, inView]);

  const loaded = canLoad && src && !failed;

  // The wrapper is always rendered at full size so the observer has a stable node
  // to watch and the row reserves its space immediately — the fallback paints on
  // the first frame and the photo replaces it in place, with no layout shift.
  return (
    <div ref={setContainer} style={{ width: "100%", height: "100%" }}>
      {loaded ? (
        <img
          src={src}
          alt={alt}
          decoding="async"
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        fallback
      )}
    </div>
  );
}
