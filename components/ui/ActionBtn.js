"use client";
import { Box, Flex, Text } from "@chakra-ui/react";

const V = {
  primary:     { iconBg: "var(--accent-soft)",    iconColor: "var(--accent)",    border: "var(--accent-line)" },
  lab:         { iconBg: "#DBEAFE",                iconColor: "#1E40AF",           border: "#BFDBFE" },
  rad:         { iconBg: "#E0E7FF",                iconColor: "#4338CA",           border: "#C7D2FE" },
  trend:       { iconBg: "var(--hue-micro-soft)",  iconColor: "var(--hue-micro)",  border: "transparent" },
  trendv2:     { iconBg: "#F1EBF5",                iconColor: "#6B4F82",           border: "#E2D5EE" },
  summary:     { iconBg: "#DBEAFE",                iconColor: "#1E40AF",           border: "#BFDBFE" },
  pending:     { iconBg: "var(--warn-soft)",        iconColor: "var(--warn)",       border: "#ECDDB8" },
  outsourced:  { iconBg: "#FCE7D6",                iconColor: "#9A4B1F",           border: "#F9CFBA" },
  neutral:     { iconBg: "var(--surface-2)",        iconColor: "var(--text-2)",     border: "var(--border)" },
};

/* compact=true — single-row pill tile, ~40px tall, for dense grids */
export function ActionBtn({ icon, label, sub, count, variant = "neutral", onClick, disabled, compact = false }) {
  const v = V[variant] || V.neutral;
  const boxSize = compact ? "28px" : "36px";
  const iconRadius = compact ? "var(--r-xs)" : "var(--r-sm)";
  const py = compact ? "7px" : 3;
  const px = compact ? 3 : 4;

  return (
    <Box
      as="button"
      onClick={onClick}
      disabled={disabled}
      w="100%"
      textAlign="left"
      bg="var(--surface)"
      border="1px solid var(--border)"
      borderRadius="var(--r-md)"
      px={px}
      py={py}
      cursor={disabled ? "not-allowed" : "pointer"}
      opacity={disabled ? 0.45 : 1}
      transition="background 0.12s, border-color 0.12s"
      _hover={disabled ? undefined : { bg: "var(--surface-2)", borderColor: "var(--border-mid)" }}
      _active={disabled ? undefined : { bg: "var(--surface-3)" }}
    >
      <Flex align="center" gap={compact ? 2 : 3}>
        <Flex
          align="center"
          justify="center"
          w={boxSize}
          h={boxSize}
          minW={boxSize}
          borderRadius={iconRadius}
          bg={v.iconBg}
          border={`1px solid ${v.border}`}
          color={v.iconColor}
          flexShrink={0}
        >
          {icon}
        </Flex>
        <Box flex={1} minW={0}>
          {compact ? (
            <Flex align="center" justify="space-between" gap={1}>
              <Text fontSize="12px" fontWeight="600" color="var(--text)" lineHeight="1" noOfLines={1}>
                {label}
              </Text>
              {count != null && (
                <Box px="6px" py="1px" borderRadius="full" bg={v.iconBg} border={`1px solid ${v.border}`} fontSize="10px" fontWeight="700" color={v.iconColor} flexShrink={0}>
                  {count}
                </Box>
              )}
            </Flex>
          ) : (
            <>
              <Flex align="center" justify="space-between" gap={2}>
                <Text fontSize="13px" fontWeight="600" color="var(--text)" lineHeight="1.2" noOfLines={1}>
                  {label}
                </Text>
                {count != null && (
                  <Box px="7px" py="1px" borderRadius="full" bg={v.iconBg} border={`1px solid ${v.border}`} fontSize="11px" fontWeight="700" color={v.iconColor} flexShrink={0}>
                    {count}
                  </Box>
                )}
              </Flex>
              {sub && (
                <Text fontSize="11px" color="var(--text-3)" mt="2px" lineHeight="1.3" noOfLines={1}>
                  {sub}
                </Text>
              )}
            </>
          )}
        </Box>
      </Flex>
    </Box>
  );
}
