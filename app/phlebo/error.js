"use client";

import { useEffect } from "react";

export default function PhleboError({ error, reset }) {
  useEffect(() => {
    console.error("[phlebo error boundary]", error);
  }, [error]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1a2e",
      color: "#fff",
      fontFamily: "monospace",
      padding: "24px 16px",
      boxSizing: "border-box",
    }}>
      <div style={{
        background: "#c0392b",
        borderRadius: 8,
        padding: "16px",
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>
          App Error — Please screenshot this screen
        </div>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Share this with your admin or support team.
        </div>
      </div>

      <div style={{
        background: "#111",
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
        wordBreak: "break-all",
        fontSize: 14,
        lineHeight: 1.6,
      }}>
        <div style={{ color: "#e74c3c", fontWeight: "bold", marginBottom: 6 }}>
          {error?.name || "Error"}
        </div>
        <div style={{ color: "#f5f5f5", marginBottom: 12 }}>
          {error?.message || "An unexpected error occurred."}
        </div>
        {error?.digest && (
          <div style={{ color: "#aaa", fontSize: 12 }}>
            Digest: {error.digest}
          </div>
        )}
      </div>

      {error?.stack && (
        <div style={{
          background: "#111",
          borderRadius: 8,
          padding: 14,
          marginBottom: 20,
          fontSize: 11,
          color: "#aaa",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 300,
          overflowY: "auto",
        }}>
          {error.stack}
        </div>
      )}

      <button
        onClick={reset}
        style={{
          background: "#2980b9",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "14px 28px",
          fontSize: 16,
          cursor: "pointer",
          width: "100%",
        }}
      >
        Try Again
      </button>
    </div>
  );
}
