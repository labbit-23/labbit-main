"use client";

import { useEffect, useRef, useState } from "react";

export default function KioskPrintPreviewPage() {
  const pdfFrameRef = useRef(null);
  const startedRef = useRef(false);
  const confirmedRef = useRef(false);
  const objectUrlRef = useRef("");
  const [status, setStatus] = useState("Loading report preview…");

  useEffect(() => {
    let disposed = false;
    let printTimeout;

    const notifyOpener = (message) => {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(message, window.location.origin);
      }
    };

    const closeAfterPrint = () => {
      if (confirmedRef.current) return;
      confirmedRef.current = true;
      notifyOpener({ type: "LABIT_KIOSK_PRINT_CONFIRMED" });
      window.setTimeout(() => window.close(), 250);
    };

    const printNativePdf = () => {
      const frame = pdfFrameRef.current;
      if (disposed || !startedRef.current || !frame?.contentWindow || frame.dataset.printStarted === "true") return;
      frame.dataset.printStarted = "true";

      const frameWindow = frame.contentWindow;
      frameWindow.addEventListener("afterprint", closeAfterPrint, { once: true });
      window.addEventListener("afterprint", closeAfterPrint, { once: true });
      setStatus("Printing…");
      notifyOpener({ type: "LABIT_KIOSK_PRINT_STARTED" });

      printTimeout = window.setTimeout(() => {
        try {
          frameWindow.focus();
          frameWindow.print();
        } catch (error) {
          const message = error?.message || "Chrome could not start native PDF printing.";
          setStatus(message);
          notifyOpener({ type: "LABIT_KIOSK_PRINT_ERROR", message });
        }
      }, 350);
    };

    const frame = pdfFrameRef.current;
    frame?.addEventListener("load", printNativePdf);

    const handlePdf = (event) => {
      if (
        disposed ||
        startedRef.current ||
        event.origin !== window.location.origin ||
        event.source !== window.opener ||
        event.data?.type !== "LABIT_KIOSK_PRINT_PDF"
      ) return;

      try {
        const pdfBlob = new Blob([event.data.bytes], { type: "application/pdf" });
        objectUrlRef.current = URL.createObjectURL(pdfBlob);
        startedRef.current = true;
        setStatus("Report ready. Starting print…");
        pdfFrameRef.current.src = objectUrlRef.current;
      } catch (error) {
        const message = error?.message || "Unable to open the original PDF.";
        setStatus(message);
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
      window.clearTimeout(printTimeout);
      frame?.removeEventListener("load", printNativePdf);
      window.removeEventListener("message", handlePdf);
      window.removeEventListener("afterprint", closeAfterPrint);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  return (
    <main>
      <div className="status" role="status">{status}</div>
      <iframe
        ref={pdfFrameRef}
        className="pdf-preview"
        title="Report PDF preview"
      />
      <style jsx global>{`
        * { box-sizing: border-box; }
        html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #eef0f2; color: #15181c; font-family: Arial, sans-serif; }
        main { display: flex; flex-direction: column; width: 100vw; height: 100dvh; }
        .status { flex: 0 0 auto; padding: 10px 16px; text-align: center; background: #6b4f82; color: white; font-weight: 600; }
        .pdf-preview { display: block; flex: 1 1 auto; width: 100%; min-height: 0; border: 0; background: #eef0f2; }
        @media print {
          @page { size: A4; margin: 0; }
          html, body, main { width: 100%; height: 100%; margin: 0; overflow: hidden; }
          .status { display: none !important; }
          .pdf-preview { width: 100%; height: 100%; border: 0; }
        }
      `}</style>
    </main>
  );
}
