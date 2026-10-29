"use client";

import { useState } from "react";
import { Box, Flex, Text } from "@chakra-ui/react";
import { STATE_COLORS, NODE_STATE_LABEL } from "./panelUtils";

const TIP_FMT = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export default function UptimeStrip({ data }) {
  const [hover, setHover] = useState(null);
  const buckets = Array.isArray(data?.buckets) ? data.buckets : [];
  const n = buckets.length || 1;
  const b = hover !== null ? buckets[hover] : null;
  const pct = typeof data?.uptime_pct === "number" ? `${data.uptime_pct.toFixed(2)}%` : "n/a";
  const tipTime = b && !Number.isNaN(new Date(b.t).getTime()) ? `${TIP_FMT.format(new Date(b.t))} IST` : "";
  return (
    <Box>
      <Box position="relative" onMouseLeave={() => setHover(null)}>
        {b && (
          <Box
            position="absolute"
            bottom="26px"
            left={`${((hover + 0.5) / n) * 100}%`}
            transform="translateX(-50%)"
            bg="#1e2b4a"
            color="#e5e9f5"
            fontSize="11px"
            px={2}
            py={1}
            borderRadius="md"
            whiteSpace="nowrap"
            zIndex={2}
            pointerEvents="none"
          >
            {tipTime} · {b.state === "unknown" ? "No data" : NODE_STATE_LABEL[b.state] || b.state}
          </Box>
        )}
        {buckets.length === 0 && <Text fontSize="xs" color="#94a3b8">No uptime data yet</Text>}
        <Flex
          h="22px"
          gap="1px"
          role="img"
          aria-label={`24 hour uptime ${pct === "n/a" ? "not available" : pct}`}
        >
          {buckets.map((x, i) => (
            <Box
              key={i}
              flex="1"
              minW="1px"
              borderRadius="1px"
              bg={STATE_COLORS[x.state] || STATE_COLORS.unknown}
              opacity={x.state === "unknown" ? 0.5 : 1}
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </Flex>
      </Box>
      <Flex justify="space-between" fontSize="11px" color="#94a3b8" mt={1}>
        <span>24h ago</span>
        <span>{pct} uptime</span>
        <span>now</span>
      </Flex>
    </Box>
  );
}
