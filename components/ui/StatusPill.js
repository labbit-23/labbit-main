"use client";
import { Box } from "@chakra-ui/react";

const V = {
  pending:      { bg: "var(--warn-soft)",    color: "var(--warn-ink)",    dot: "var(--warn)",    border: "#ECDDB8" },
  ready:        { bg: "var(--success-soft)", color: "var(--success-ink)", dot: "var(--success)", border: "#C8E2D2" },
  dispatched:   { bg: "var(--accent-soft)",  color: "var(--accent-ink)",  dot: "var(--accent)",  border: "var(--accent-line)" },
  success:      { bg: "var(--success-soft)", color: "var(--success-ink)", dot: "var(--success)", border: "#C8E2D2" },
  warn:         { bg: "var(--warn-soft)",    color: "var(--warn-ink)",    dot: "var(--warn)",    border: "#ECDDB8" },
  danger:       { bg: "var(--danger-soft)",  color: "var(--danger-ink)",  dot: "var(--danger)",  border: "#F2CACA" },
  open:         { bg: "var(--danger-soft)",  color: "var(--danger-ink)",  dot: "var(--danger)",  border: "#F2CACA" },
  closed:       { bg: "var(--surface-2)",    color: "var(--text-3)",      dot: "var(--text-4)",  border: "var(--border)" },
  resolved:     { bg: "var(--success-soft)", color: "var(--success-ink)", dot: "var(--success)", border: "#C8E2D2" },
  acknowledged: { bg: "var(--accent-soft)",  color: "var(--accent-ink)",  dot: "var(--accent)",  border: "var(--accent-line)" },
  info:         { bg: "var(--accent-soft)",  color: "var(--accent-ink)",  dot: "var(--accent)",  border: "var(--accent-line)" },
};

export function StatusPill({ status = "info", dot = true, children }) {
  const v = V[status] || V.info;
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      gap="5px"
      px="10px"
      py="3px"
      borderRadius="full"
      fontSize="11px"
      fontWeight="600"
      letterSpacing="0.02em"
      bg={v.bg}
      color={v.color}
      border={`1px solid ${v.border}`}
      whiteSpace="nowrap"
    >
      {dot && <Box as="span" w="6px" h="6px" borderRadius="full" bg={v.dot} flexShrink={0} />}
      {children}
    </Box>
  );
}
