import React, { useState } from "react";
import { Box, VStack, HStack, Text, Button, Input, useToast, SimpleGrid, Badge } from "@chakra-ui/react";
import { Lock, Unlock, Cable, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

// Replaces the Sophos WAN card in Infrastructure Status (2026-09-05, user:
// "replace with Machine (Mirth) Data and control (gated control behind
// passcodes)"). Passcode-verify against the server-only MIRTH_CONTROL_PASSCODE
// (never sent to the client). `mirthServices` is the mirth_*-prefixed slice of
// the page's own realServices (cto_service_latest rows) -- a local collector
// ("neosoft-edge-1-local") already pushes real per-channel Mirth data here
// (mirth_channel_metrics__local.payload.channels[]: name/state/received/sent/
// errors/filtered/queued/success_rate_percent), confirmed live 2026-09-05.
// No control actions exist yet (view-only) -- that's the actual follow-up
// scope, see the mirth-cto-dashboard-integration memory note.
function channelSeverity(ch) {
  if (String(ch.state) === "unknown" || ch.status_code === 404) return "unknown";
  if (Number(ch.errors) > 0) return "error";
  if (Number(ch.queued) > 0) return "warn";
  return "ok";
}

export function MirthControlCard({ mirthServices = [] }) {
  const [passcode, setPasscode] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const toast = useToast();

  async function handleUnlock(e) {
    e.preventDefault();
    if (!passcode.trim()) return;
    setVerifying(true);
    try {
      const res = await fetch("/api/internal/mirth-control/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body?.ok) {
        setUnlocked(true);
      } else {
        toast({
          status: "error",
          title: "Access denied",
          description: body?.error || "Incorrect passcode",
          duration: 3000
        });
        setPasscode("");
      }
    } catch {
      toast({ status: "error", title: "Could not verify passcode", duration: 3000 });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <Box
      borderRadius="14px"
      border="1px solid rgba(170, 250, 240, 0.15)"
      bg="rgba(255,255,255,0.04)"
      p={4}
      position="relative"
      overflow="hidden"
      _before={{
        content: '""',
        position: "absolute",
        inset: 0,
        background: "radial-gradient(120% 140% at 0% 0%, rgba(170,250,240,0.12) 0%, transparent 60%)",
        pointerEvents: "none"
      }}
    >
      <HStack spacing={2} mb={3} position="relative">
        <Box as={Cable} size={16} color="#aafaf0" filter="drop-shadow(0 0 4px #aafaf088)" />
        <Text fontWeight="700" fontSize="sm" color="whiteAlpha.950">Machine Data (Mirth)</Text>
        <Box as={unlocked ? Unlock : Lock} size={13} color="whiteAlpha.600" ml="auto" />
      </HStack>

      {!unlocked ? (
        <form onSubmit={handleUnlock}>
          <VStack spacing={2} align="stretch" position="relative">
            <Text fontSize="xs" color="whiteAlpha.700">
              Control is passcode-gated. Enter it to view/manage machine channels.
            </Text>
            <HStack>
              <Input
                type="password"
                size="sm"
                placeholder="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                bg="rgba(11,19,32,0.6)"
                borderColor="whiteAlpha.200"
              />
              <Button size="sm" colorScheme="teal" type="submit" isLoading={verifying}>
                Unlock
              </Button>
            </HStack>
          </VStack>
        </form>
      ) : (
        <MirthUnlockedBody mirthServices={mirthServices} />
      )}
    </Box>
  );
}

const severityColor = { ok: "#34d399", warn: "#fbbf24", error: "#f87171", unknown: "#94a3b8" };

function MirthUnlockedBody({ mirthServices }) {
  const [showLegacy, setShowLegacy] = useState(false);
  const metricsRow = mirthServices.find((s) => s.service_key === "mirth_channel_metrics__local");
  const channels = Array.isArray(metricsRow?.payload?.channels) ? metricsRow.payload.channels : [];
  const healthRows = mirthServices.filter((s) => s.service_key !== "mirth_channel_metrics__local");

  if (!metricsRow && healthRows.length === 0) {
    return (
      <HStack
        spacing={2}
        bg="rgba(251, 191, 36, 0.1)"
        border="1px solid rgba(251, 191, 36, 0.25)"
        borderRadius="8px"
        px={3}
        py={2}
      >
        <Box as={AlertTriangle} size={14} color="#fbbf24" flexShrink={0} />
        <Text fontSize="xs" color="whiteAlpha.800">
          Unlocked, but no Mirth data has arrived from the collector yet.
        </Text>
      </HStack>
    );
  }

  // "unknown"/404 entries are legacy Shivam channels still in the collector's
  // list but deleted/renamed in Mirth (confirmed with the user 2026-09-05) --
  // not a real health problem, so keep them out of the live-machine list
  // entirely rather than sorting them in among real channels.
  const activeChannels = channels.filter((ch) => channelSeverity(ch) !== "unknown");
  const legacyChannels = channels.filter((ch) => channelSeverity(ch) === "unknown");
  const sorted = [...activeChannels].sort((a, b) => {
    const rank = { error: 0, warn: 1, ok: 2 };
    return rank[channelSeverity(a)] - rank[channelSeverity(b)];
  });

  return (
    <VStack spacing={2.5} align="stretch" position="relative">
      {healthRows.length > 0 && (
        <HStack spacing={2} flexWrap="wrap">
          {healthRows.map((row) => (
            <HStack
              key={row.service_key}
              spacing={1.5}
              px={2}
              py={1}
              borderRadius="8px"
              bg="rgba(255,255,255,0.04)"
              border="1px solid rgba(255,255,255,0.08)"
            >
              <Box
                as={row.status === "healthy" ? CheckCircle2 : XCircle}
                size={12}
                color={row.status === "healthy" ? "#34d399" : "#f87171"}
              />
              <Text fontSize="10px" color="whiteAlpha.800">{row.label || row.service_key}</Text>
            </HStack>
          ))}
        </HStack>
      )}
      {sorted.length > 0 && (
        <VStack spacing={1.5} align="stretch" maxH="260px" overflowY="auto">
          {sorted.map((ch) => {
            const sev = channelSeverity(ch);
            return (
              <HStack
                key={ch.channel_id}
                spacing={2.5}
                px={2.5}
                py={1.5}
                borderRadius="8px"
                bg="rgba(255,255,255,0.03)"
              >
                <Box
                  w="9px"
                  h="9px"
                  borderRadius="full"
                  flexShrink={0}
                  bg={severityColor[sev]}
                  boxShadow={`0 0 8px ${severityColor[sev]}`}
                />
                <Text fontSize="xs" color="whiteAlpha.900" fontWeight="600" flex="1" noOfLines={1}>
                  {ch.name}
                </Text>
                <Text fontSize="10px" color="whiteAlpha.600">recv {ch.received ?? 0}</Text>
                <Text fontSize="10px" color="whiteAlpha.600">sent {ch.sent ?? 0}</Text>
                {Number(ch.queued) > 0 && (
                  <Badge fontSize="9px" colorScheme="orange">queued {ch.queued}</Badge>
                )}
                {Number(ch.errors) > 0 && (
                  <Badge fontSize="9px" colorScheme="red">errors {ch.errors}</Badge>
                )}
                <Badge fontSize="9px" colorScheme={sev === "ok" ? "green" : "gray"}>
                  {ch.success_rate_percent ?? 0}%
                </Badge>
              </HStack>
            );
          })}
        </VStack>
      )}
      {legacyChannels.length > 0 && (
        <Box>
          <Text
            as="button"
            type="button"
            onClick={() => setShowLegacy((v) => !v)}
            fontSize="10px"
            color="whiteAlpha.500"
            textDecoration="underline"
            cursor="pointer"
          >
            {showLegacy ? "Hide" : "Show"} {legacyChannels.length} legacy Shivam channel{legacyChannels.length === 1 ? "" : "s"} (inactive)
          </Text>
          {showLegacy && (
            <VStack spacing={1} align="stretch" mt={1.5}>
              {legacyChannels.map((ch) => (
                <HStack key={ch.channel_id} spacing={2} px={2.5} py={1} opacity={0.5}>
                  <Box w="7px" h="7px" borderRadius="full" bg={severityColor.unknown} flexShrink={0} />
                  <Text fontSize="11px" color="whiteAlpha.700" noOfLines={1}>{ch.name}</Text>
                </HStack>
              ))}
            </VStack>
          )}
        </Box>
      )}
      {metricsRow?.checked_at && (
        <Text fontSize="10px" color="whiteAlpha.500">
          Last updated {new Date(metricsRow.checked_at).toLocaleTimeString()} · view-only for now
        </Text>
      )}
    </VStack>
  );
}
