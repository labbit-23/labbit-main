"use client";
import { Box } from "@chakra-ui/react";

const DEPT = {
  haem:  { pip: "var(--hue-haem)",  bg: "var(--hue-haem-soft)",  label: "Haematology" },
  bio:   { pip: "var(--hue-bio)",   bg: "var(--hue-bio-soft)",   label: "Biochemistry" },
  micro: { pip: "var(--hue-micro)", bg: "var(--hue-micro-soft)", label: "Microbiology" },
  rad:   { pip: "var(--hue-rad)",   bg: "var(--hue-rad-soft)",   label: "Radiology" },
};

// Inline dept tag with pip — used in table rows
export function DeptChip({ dept = "bio", label, children }) {
  const d = DEPT[dept] || DEPT.bio;
  return (
    <Box as="span" display="inline-flex" alignItems="center" gap="6px" fontSize="12px" color="var(--text-2)">
      <Box as="span" w="3px" h="14px" borderRadius="full" bg={d.pip} flexShrink={0} />
      {label || children || d.label}
    </Box>
  );
}

// Standalone chip with soft bg — used in filters / page headers
export function DeptBadge({ dept = "bio", label, children }) {
  const d = DEPT[dept] || DEPT.bio;
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      gap="5px"
      px="9px"
      py="3px"
      borderRadius="full"
      fontSize="11px"
      fontWeight="500"
      bg={d.bg}
      color={d.pip}
    >
      <Box as="span" w="5px" h="5px" borderRadius="full" bg={d.pip} flexShrink={0} />
      {label || children || d.label}
    </Box>
  );
}
