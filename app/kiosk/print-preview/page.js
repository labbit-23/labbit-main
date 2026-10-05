"use client";

import { useEffect, useRef, useState } from "react";

const PRINT_SCALE = 2;

export default function KioskPrintPreviewPage() {
  const pagesRef = useRef(null);
  const startedRef = useRef(false);
  const [status, setStatus] = useState("Preparing print preview…");
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;

    const notifyOpener = (message) => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, window.location.origin);
      }
    };

    const closeAfterPrint = () => {
      window.setTimeout(() => window.close(), 250);
    };

    const handlePdf = async (event) => {
      if (
        disposed ||
        startedRef.current ||
        event.origin !== window.location.origin ||
        event.source !== window.opener ||
        event.data?.type !== "LABIT_KIOSK_PRINT_PDF"
      ) {
        return;
      }

      startedRef.current = true;
      try {
        const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const data = new Uint8Array(event.data.bytes);
        const pdf = await pdfjs.getDocument({ data }).promise;
        const container = pagesRef.current;
        if (!container) throw new Error("Print preview is unavailable.");

        setStatus(`Preparing ${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}…`);
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: PRINT_SCALE });
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.className = "pdf-page";
          canvas.setAttribute("aria-label", `Report page ${pageNumber}`);
          container.appendChild(canvas);
          await page.render({
            canvas,
            canvasContext: canvas.getContext("2d", { alpha: false }),
            viewport,
            intent: "print",
            background: "rgb(255,255,255)"
          }).promise;
        }

        if (disposed) return;
        setStatus("Printing…");
        await document.fonts?.ready;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.addEventListener("afterprint", closeAfterPrint, { once: true });
        notifyOpener({ type: "LABIT_KIOSK_PRINT_STARTED", pages: pdf.numPages });
        window.focus();
        window.print();
      } catch (printError) {
        const message = printError?.message || "Unable to prepare this report for printing.";
        setError(message);
        setStatus("");
        notifyOpener({ type: "LABIT_KIOSK_PRINT_ERROR", message });
      }
    };

    window.addEventListener("message", handlePdf);
    notifyOpener({ type: "LABIT_KIOSK_PRINT_READY" });
    const readyInterval = window.setInterval(() => {
      if (startedRef.current) {
        window.clearInterval(readyInterval);
        return;
      }
      notifyOpener({ type: "LABIT_KIOSK_PRINT_READY" });
    }, 500);
    return () => {
      disposed = true;
      window.clearInterval(readyInterval);
      window.removeEventListener("message", handlePdf);
      window.removeEventListener("afterprint", closeAfterPrint);
    };
  }, []);

  return (
    <main>
      <div className="status" role={error ? "alert" : "status"}>
        {error || status}
      </div>
      <section ref={pagesRef} className="pages" aria-label="Report print preview" />
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; min-height: 100%; background: #eef0f2; color: #15181c; font-family: Arial, sans-serif; }
        .status { position: sticky; top: 0; z-index: 2; padding: 12px 18px; text-align: center; background: #6b4f82; color: white; font-weight: 600; }
        .pages { display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 18px; }
        .pdf-page { display: block; width: min(100%, 900px); height: auto; background: white; box-shadow: 0 4px 18px rgba(0,0,0,.18); }
        @media print {
          @page { margin: 0; }
          html, body { background: white; }
          .status { display: none !important; }
          .pages { display: block; padding: 0; }
          .pdf-page { width: 100%; height: auto; box-shadow: none; break-after: page; page-break-after: always; }
          .pdf-page:last-child { break-after: auto; page-break-after: auto; }
        }
      `}</style>
    </main>
  );
}
