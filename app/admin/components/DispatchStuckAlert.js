"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { Box, Text } from "@chakra-ui/react";
import { useRouter } from "next/navigation";

const POLL_MS = 5 * 60 * 1000;

export default function DispatchStuckAlert({ themeMode }) {
  const [stuckCount, setStuckCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const router = useRouter();
  const pulseTimer = useRef(null);
  const pollTimer = useRef(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/dispatch-stuck-count");
      if (!res.ok) return;
      const data = await res.json();
      const count = data?.stuck_count ?? 0;
      setStuckCount(count);
      if (count > 0) {
        setPulse(true);
        clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => setPulse(false), 2000);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchCount();
    pollTimer.current = setInterval(fetchCount, POLL_MS);
    return () => {
      clearInterval(pollTimer.current);
      clearTimeout(pulseTimer.current);
    };
  }, [fetchCount]);

  if (stuckCount === 0) return null;

  const isDark = themeMode === "dark";

  return (
    <Box
      mb={4}
      px={4}
      py={3}
      borderRadius="lg"
      borderWidth="2px"
      borderColor={pulse ? "orange.500" : "orange.300"}
      bg={isDark ? (pulse ? "orange.900" : "gray.800") : (pulse ? "orange.50" : "white")}
      cursor="pointer"
      className="dispatch-stuck-pulse"
      _hover={{ bg: isDark ? "orange.900" : "orange.50" }}
      onClick={() => router.push("/admin/report-dispatch?monitor_filter=failed")}
      transition="border-color 0.4s, background 0.4s"
    >
      <Text
        fontSize={{ base: "sm", md: "md" }}
        fontWeight="800"
        color={isDark ? "orange.200" : "orange.600"}
      >
        {stuckCount} dispatch job{stuckCount !== 1 ? "s" : ""} need attention
      </Text>
      <Text fontSize="xs" color={isDark ? "orange.400" : "orange.500"} mt={0.5}>
        Exhausted retries or paused after failed attempts — click to review
      </Text>
    </Box>
  );
}
