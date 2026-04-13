import React from "react";
import { Box, Flex, Stat, StatLabel, StatNumber } from "@chakra-ui/react";

const STYLE_BY_TONE_LIGHT = {
  total: { bg: "gray.50", color: "inherit", label: "gray.600", shadow: "sm" },
  assigned: { bg: "teal.50", color: "inherit", label: "gray.600", shadow: "sm" },
  completed: { bg: "green.50", color: "inherit", label: "gray.600", shadow: "sm" },
  pending: { bg: "yellow.50", color: "inherit", label: "gray.600", shadow: "sm" },
  unassigned: { bg: "red.50", color: "inherit", label: "gray.600", shadow: "sm" },
  info: { bg: "blue.50", color: "inherit", label: "gray.600", shadow: "sm" },
  neutral: { bg: "gray.100", color: "inherit", label: "gray.600", shadow: "sm" },
};

const STYLE_BY_TONE_DARK = {
  total: { bg: "rgba(255,255,255,0.06)", color: "whiteAlpha.950", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  assigned: { bg: "rgba(45,212,191,0.16)", color: "teal.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  completed: { bg: "rgba(34,197,94,0.18)", color: "green.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  pending: { bg: "rgba(250,204,21,0.16)", color: "yellow.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  unassigned: { bg: "rgba(248,113,113,0.18)", color: "red.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  info: { bg: "rgba(56,189,248,0.18)", color: "blue.100", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  neutral: { bg: "rgba(148,163,184,0.18)", color: "whiteAlpha.900", label: "whiteAlpha.800", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
};

function getStyle(themeMode, tone) {
  const key = tone || "neutral";
  if (themeMode === "dark") return STYLE_BY_TONE_DARK[key] || STYLE_BY_TONE_DARK.neutral;
  return STYLE_BY_TONE_LIGHT[key] || STYLE_BY_TONE_LIGHT.neutral;
}

export default function MetricCardsStrip({
  items = [],
  themeMode = "light",
  loading = false,
  minW = "600px",
}) {
  return (
    <Box overflowX={{ base: "visible", md: "auto" }} mb={6}>
      <Flex
        minW={{ base: "100%", md: minW }}
        gap={4}
        wrap={{ base: "wrap", md: "nowrap" }}
      >
        {items.map((item) => {
          const style = getStyle(themeMode, item?.tone);
          return (
            <Stat
              key={item?.key || item?.label}
              bg={style.bg}
              color={style.color}
              p={4}
              rounded="md"
              boxShadow={style.shadow}
              minW={{ base: 0, md: 140 }}
              flex={{ base: "1 1 calc(50% - 8px)", md: "none" }}
              borderWidth={themeMode === "dark" ? "1px" : "0"}
              borderColor={themeMode === "dark" ? "whiteAlpha.200" : "transparent"}
            >
              <StatLabel fontSize={{ base: "sm", md: "md" }} color={style.label}>
                {item?.label || "-"}
              </StatLabel>
              <StatNumber fontSize={{ base: "lg", md: "2xl" }}>
                {loading ? "..." : (item?.value ?? 0)}
              </StatNumber>
            </Stat>
          );
        })}
      </Flex>
    </Box>
  );
}
