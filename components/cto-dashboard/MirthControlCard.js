import React, { useState } from "react";
import { Box, VStack, HStack, Text, Button, Input, useToast } from "@chakra-ui/react";
import { Lock, Unlock, Cable, AlertTriangle } from "lucide-react";

// Replaces the Sophos WAN card in Infrastructure Status (2026-09-05, user:
// "replace with Machine (Mirth) Data and control (gated control behind
// passcodes)"). No live Mirth API integration exists yet -- see the
// mirth-cto-dashboard-integration memory note -- so this is the gated shell:
// passcode-verify against the server-only MIRTH_CONTROL_PASSCODE (never sent
// to the client), unlocking to an honest "not wired up yet" placeholder
// rather than fake data or controls. Swap the placeholder body for real
// channel/queue data once that integration lands.
export function MirthControlCard() {
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
        <VStack spacing={2} align="stretch" position="relative">
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
              Unlocked, but no live Mirth channel/queue data source is wired up yet.
              This panel is a placeholder for the machine-queue integration.
            </Text>
          </HStack>
          <Text fontSize="xs" color="whiteAlpha.500">
            Once the collector reports real channel data, per-machine queue
            depths and controls will render here.
          </Text>
        </VStack>
      )}
    </Box>
  );
}
