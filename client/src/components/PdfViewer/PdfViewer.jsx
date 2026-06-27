import { useState, useEffect, useRef } from "react";
import { css } from "../../theme/colors";

const PDFJS_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function PageCanvas({ page, viewport }) {
  const canvasRef = useRef(null);
  const rendered = useRef(false);

  useEffect(() => {
    if (!canvasRef.current || rendered.current) return;
    rendered.current = true;
    const canvas = canvasRef.current;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    page.render({ canvasContext: canvas.getContext("2d"), viewport });
  }, [page, viewport]);

  return (
    <canvas ref={canvasRef} style={{ width: "100%", maxWidth: viewport.width }} />
  );
}

export default function PdfViewer({ url, authToken }) {
  const containerRef = useRef(null);
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load PDF.js script once
  useEffect(() => {
    if (window.pdfjsLib) return;
    const script = document.createElement("script");
    script.src = PDFJS_URL;
    script.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; };
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    async function renderPdf() {
      setLoading(true);
      setError(null);
      setPages([]);

      // Wait for PDF.js to load
      let tries = 0;
      while (!window.pdfjsLib && tries < 40) {
        await new Promise(r => setTimeout(r, 100));
        tries++;
      }
      if (!window.pdfjsLib) { setError("PDF.js failed to load"); setLoading(false); return; }

      try {
        const source = authToken
          ? { url, httpHeaders: { Authorization: `Bearer ${authToken}` } }
          : url;
        const pdf = await window.pdfjsLib.getDocument(source).promise;
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
