"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Box, Flex, Heading, SimpleGrid, Skeleton, Text } from "@chakra-ui/react";
import RequireAuth from "../../../components/RequireAuth";
import PanelNav from "../../../components/panel/PanelNav";
import UptimeStrip from "../../../components/panel/UptimeStrip";
import { panelFetch, formatIST, STATE_COLORS, NODE_STATE_LABEL } from "../../../components/panel/panelUtils";

function StateBadge({ state, label }) {
  const c = STATE_COLORS[state] || STATE_COLORS.unknown;
  return (
    <Badge bg={`${c}26`} color={c} border={`1px solid ${c}`} textTransform="none" px={2} borderRadius="md">
      {label}
    </Badge>
  );
}

function MonitorContent() {
  const [nodes, setNodes] = useState(null);
  const [uptime, setUptime] = useState({});
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const n = await panelFetch("/api/panel/monitor/nodes");
      const list = Array.isArray(n) ? n : [];
      setNodes(list);
      setErr("");
      const ups = await Promise.all(
        list.map((x) => panelFetch(`/api/panel/monitor/nodes/${encodeURIComponent(x.id)}/uptime`).catch(() => null))
      );
      setUptime(Object.fromEntries(list.map((x, i) => [x.id, ups[i]])));
    } catch (e) {
      setErr(e.message || "Failed to load");
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <Box minH="100vh" bg="#0b1220" color="#e5e9f5">
      <PanelNav />
      <Box maxW="1100px" mx="auto" px={{ base: 4, md: 8 }} py={6}>
        <Heading size="lg">Monitor</Heading>
        <Text color="#94a3b8" mb={4}>Auto-refreshes every 30 seconds. Times are IST.</Text>
        {err && <Box bg="#3b1219" border="1px solid #ef4444" p={3} borderRadius="md" mb={4}>{err}</Box>}
        {!err && nodes === null && (
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            {[0, 1, 2].map((i) => <Skeleton key={i} h="180px" borderRadius="lg" startColor="#111a2e" endColor="#1e2b4a" />)}
          </SimpleGrid>
        )}
        {nodes !== null && nodes.length === 0 && (
          <Box bg="#111a2e" border="1px solid #1e2b4a" p={4} borderRadius="md">No nodes configured.</Box>
        )}
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          {(nodes || []).map((n) => {
            const u = uptime[n.id];
            const notMonitored = n.state === "not_monitored";
            const offHours =
              n.expected_offline === true ||
              (n.quiet === true && n.state === "unreachable" && n.detail?.cause === "self");
            const badgeState = offHours ? "unknown" : n.state;
            const badgeLabel = offHours ? "Off-hours" : NODE_STATE_LABEL[n.state] || n.state;
            const services = Array.isArray(n.services) ? n.services : [];
            return (
              <Box
                key={n.id}
                p={4}
                bg="#111a2e"
                border="1px solid #1e2b4a"
                borderRadius="lg"
                opacity={offHours || notMonitored ? 0.8 : 1}
              >
                <Flex justify="space-between" align="center" mb={2} gap={2}>
                  <Heading as="h3" size="sm">{n.label}</Heading>
                  <StateBadge state={badgeState} label={badgeLabel} />
                </Flex>
                {n.detail?.message && <Text fontSize="sm" color="#cbd5e1" mb={1}>{n.detail.message}</Text>}
                {n.detail?.reason && !notMonitored && (
                  <Text fontSize="xs" color="#94a3b8" mb={1}>
                    Reason: {String(n.detail.reason).replace(/_/g, " ")}
                    {n.detail.cause === "dependency" ? ` (via ${n.detail.via || "dependency"})` : ""}
                  </Text>
                )}
                {offHours && n.expected_offline_note && (
                  <Text fontSize="xs" color="#94a3b8" mb={1}>{n.expected_offline_note}</Text>
                )}
                <Text fontSize="xs" color="#94a3b8" mb={2}>Last seen {formatIST(n.last_seen)}</Text>
                {services.length > 0 && (
                  <Box as="ul" listStyleType="none" mb={3}>
                    {services.map((s) => (
                      <Flex as="li" key={s.id} justify="space-between" fontSize="sm" py="2px">
                        <span>{s.label}</span>
                        <Text as="span" color={STATE_COLORS[s.state] || STATE_COLORS.unknown}>{s.state}</Text>
                      </Flex>
                    ))}
                  </Box>
                )}
                {notMonitored ? null : u ? (
                  <UptimeStrip data={u} />
                ) : (
                  <Text fontSize="xs" color="#94a3b8">{u === null ? "Uptime unavailable" : "Loading uptime..."}</Text>
                )}
              </Box>
            );
          })}
        </SimpleGrid>
      </Box>
    </Box>
  );
}

export default function PanelMonitorPage() {
  return (
    <RequireAuth roles={["director", "director_ceo"]}>
      <MonitorContent />
    </RequireAuth>
  );
}
