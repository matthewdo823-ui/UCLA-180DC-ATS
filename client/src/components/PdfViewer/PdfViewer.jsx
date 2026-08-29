import { useState, useEffect, useRef } from "react";
import { css } from "../../theme/colors";
import { fetchDriveBlob } from "../../utils/driveFileCache";

// Code-split: pdfjs-dist is only pulled into a chunk when a PdfViewer actually mounts.
let pdfjsLibPromise = null;
function loadPdfjs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString();
      return pdfjsLib;
    });
  }
  return pdfjsLibPromise;
}

function PageCanvas({ page, viewport }) {
  const canvasRef = useRef(null);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    let renderTask;
    try {
      renderTask = page.render({ canvasContext: canvas.getContext("2d"), viewport });
      renderTask.promise.catch((error) => {
        if (cancelled) return;
        console.warn("Could not render PDF page:", error);
        setRenderError(true);
      });
    } catch (error) {
      console.warn("Could not start PDF page render:", error);
      setRenderError(true);
    }

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [page, viewport]);

  if (renderError) {
    return (
      <div style={{ color: css.textGray, fontSize: 13, padding: 20, textAlign: "center" }}>
        This PDF page could not be rendered.
      </div>
    );
  }

  return (
    <canvas ref={canvasRef} style={{ width: "100%", maxWidth: viewport.width }} />
  );
}

export default function PdfViewer({ url, authToken }) {
  const containerRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    async function renderPdf() {
      setLoading(true);
      setError(null);
      setPages([]);

      let pdfjsLib;
      try {
        pdfjsLib = await loadPdfjs();
      } catch {
        if (!cancelled) { setError("PDF.js failed to load"); setLoading(false); }
        return;
      }
      if (cancelled) return;

      try {
        // Fetch the bytes ourselves with the auth header rather than relying on
        // PDF.js's httpHeaders — PDF.js doesn't reliably attach them to the
        // request its worker/range logic issues, so the proxy rejects it with
        // "Missing bearer token". This mirrors AuthedDriveImage's blob approach.
        const blob = await fetchDriveBlob(url, authToken);
        if (cancelled) return;
        // A fresh ArrayBuffer per render: getDocument detaches the one it's given,
        // which would corrupt the cached copy for every later viewing.
        const data = await blob.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) return;

        const pageDataArr = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.6 });
          pageDataArr.push({ page, viewport });
        }
        if (!cancelled) { setPages(pageDataArr); setLoading(false); }
      } catch {
        if (!cancelled) { setError("Could not render PDF"); setLoading(false); }
      }
    }

    renderPdf();
    return () => { cancelled = true; };
  }, [authToken, url]);

  return (
    <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflowY: "auto", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "0", scrollbarWidth: "thin", scrollbarColor: `${css.borderLight} transparent` }}>
      {loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: css.textGray, fontSize: 13 }}>
          <div style={{ width: 36, height: 36, border: `3px solid ${css.borderLight}`, borderTopColor: css.greenDark, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Rendering PDF…
        </div>
      )}
      {error && <div style={{ color: css.red, fontSize: 13, padding: 20 }}>{error}</div>}
      {pages.map(({ page, viewport }, idx) => (
        <PageCanvas key={idx} page={page} viewport={viewport} />
      ))}
    </div>
  );

}
