import React from "react";
import { Box, Flex, Stat, StatLabel, StatNumber } from "@chakra-ui/react";

const STYLE_BY_TONE_LIGHT = {
  total: { bg: "gray.100", color: "inherit", label: "gray.700", number: "black", weight: "700", shadow: "sm" },
  assigned: { bg: "teal.100", color: "inherit", label: "gray.800", number: "black", weight: "900", shadow: "sm" },
  completed: { bg: "green.100", color: "inherit", label: "gray.700", number: "black", weight: "700", shadow: "sm" },
  pending: { bg: "yellow.100", color: "inherit", label: "gray.800", number: "black", weight: "900", shadow: "sm" },
  unassigned: { bg: "red.100", color: "inherit", label: "gray.800", number: "black", weight: "700", shadow: "sm" },
  info: { bg: "blue.100", color: "inherit", label: "gray.700", number: "black", weight: "700", shadow: "sm" },
  neutral: { bg: "gray.200", color: "inherit", label: "gray.700", number: "black", weight: "700", shadow: "sm" },
};

const STYLE_BY_TONE_DARK = {
  total: { bg: "rgba(255,255,255,0.06)", color: "whiteAlpha.950", label: "whiteAlpha.800", number: "whiteAlpha.950", weight: "700", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  assigned: { bg: "rgba(45,212,191,0.16)", color: "teal.100", label: "whiteAlpha.850", number: "white", weight: "900", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  completed: { bg: "rgba(34,197,94,0.18)", color: "green.100", label: "whiteAlpha.800", number: "whiteAlpha.950", weight: "700", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  pending: { bg: "rgba(250,204,21,0.16)", color: "yellow.100", label: "whiteAlpha.850", number: "white", weight: "900", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  unassigned: { bg: "rgba(248,113,113,0.18)", color: "red.100", label: "whiteAlpha.850", number: "whiteAlpha.950", weight: "700", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  info: { bg: "rgba(56,189,248,0.18)", color: "blue.100", label: "whiteAlpha.800", number: "whiteAlpha.950", weight: "700", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
  neutral: { bg: "rgba(148,163,184,0.18)", color: "whiteAlpha.900", label: "whiteAlpha.800", number: "whiteAlpha.950", weight: "700", shadow: "0 14px 34px rgba(2,6,23,0.28)" },
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
  singleRow = false,
  compactMobile = false,
  onItemClick = null,
}) {
  const fitMobile = compactMobile && singleRow;
  return (
    <Box overflowX={{ base: fitMobile ? "visible" : (singleRow ? "auto" : "visible"), md: "auto" }} mb={6}>
      <Flex
        minW={{ base: "100%", md: minW }}
        gap={{ base: fitMobile ? 3 : 4, md: 4 }}
        wrap={{ base: singleRow ? "nowrap" : "wrap", md: "nowrap" }}
      >
        {items.map((item) => {
          const style = getStyle(themeMode, item?.tone);
          const labelText = fitMobile && item?.shortLabel ? item.shortLabel : (item?.label || "-");
          const clickable = typeof onItemClick === "function";
          return (
            <Stat
              key={item?.key || item?.label}
              bg={style.bg}
              color={style.color}
              p={{ base: fitMobile ? 3 : 4, md: 4 }}
              rounded="md"
              boxShadow={style.shadow}
              minW={{ base: fitMobile ? 0 : (singleRow ? 140 : 0), md: 140 }}
              minH={{ base: fitMobile ? "92px" : "auto", md: "auto" }}
              flex={{ base: fitMobile ? "1 1 0" : (singleRow ? "0 0 auto" : "1 1 calc(50% - 8px)"), md: "none" }}
              borderWidth={themeMode === "dark" ? "1px" : "0"}
              borderColor={themeMode === "dark" ? "whiteAlpha.200" : "transparent"}
              display="flex"
              flexDirection="column"
              justifyContent={fitMobile ? "space-between" : "center"}
              cursor={clickable ? "pointer" : "default"}
              _hover={clickable ? { transform: "translateY(-1px)", filter: "brightness(1.03)" } : undefined}
              onClick={clickable ? () => onItemClick(item) : undefined}
            >
              <StatLabel
                fontSize={{ base: fitMobile ? "12px" : "sm", md: "md" }}
                color={style.label}
                whiteSpace={fitMobile ? "nowrap" : "nowrap"}
                lineHeight={fitMobile ? "1.2" : "1.2"}
                textAlign="center"
                minH={{ base: fitMobile ? "24px" : "auto", md: "auto" }}
                overflow="hidden"
                textOverflow="ellipsis"
              >
                {labelText}
              </StatLabel>
              <StatNumber
                fontSize={{ base: fitMobile ? "2xl" : "lg", md: "2xl" }}
                textAlign="center"
                color={style.number || style.color}
                fontWeight={style.weight || "700"}
                lineHeight="1"
                mt={fitMobile ? 0 : 1}
              >
                {loading ? "..." : (item?.value ?? 0)}
              </StatNumber>
            </Stat>
          );
        })}
      </Flex>
    </Box>
  );
}
