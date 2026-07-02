import React, { useEffect, useState } from "react";
import { Box, VStack, HStack, Text, Button, Spinner, Badge, useToast, AlertDialog, AlertDialogBody, AlertDialogFooter, AlertDialogHeader, AlertDialogContent, AlertDialogOverlay, Tooltip } from "@chakra-ui/react";
import { AlertCircle, CheckCircle, WifiOff, RefreshCw } from "lucide-react";

export function SophosWanCard({ monitoringApiUrl = "http://100.65.63.54:5000" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const toast = useToast();
  const cancelRef = React.useRef();

  // Fetch monitoring data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // The monitoring result is ingested into CTO dashboard via monitoring API
        // For now, we'll fetch from monitoring collector or display cached data
        // This would typically come from the monitoring ingestion API
        const response = await fetch(`${monitoringApiUrl}/api/monitoring/sophos_firewall`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error("Failed to fetch Sophos data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every 60 seconds
    return () => clearInterval(interval);
  }, [monitoringApiUrl]);

  const handleRestart = async () => {
    setShowRestartDialog(false);
    setRestarting(true);

    try {
      // This endpoint should be proxied through the CTO dashboard or called directly via Tailscale
      const response = await fetch("/api/infrastructure/sophos/restart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const result = await response.json();
        toast({
          title: "Restart Initiated",
          description: result.message,
          status: "success",
          duration: 5000,
          isClosable: true,
        });
      } else {
        const error = await response.json();
        toast({
          title: "Restart Failed",
          description: error.detail || "Failed to restart Sophos",
          status: "error",
          duration: 5000,
          isClosable: true,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error.message,
        status: "error",
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setRestarting(false);
    }
  };

  if (loading && !data) {
    return (
      <Box p={6} borderWidth={1} borderRadius="md" bg="white" shadow="sm">
        <HStack spacing={4}>
          <Spinner />
          <Text>Loading Sophos status...</Text>
        </HStack>
      </Box>
    );
  }

  if (!data || !data.payload) {
    return (
      <Box p={6} borderWidth={1} borderRadius="md" bg="white" shadow="sm" borderColor="red.200">
        <HStack spacing={2}>
          <AlertCircle size={24} color="red" />
          <VStack align="start" spacing={0}>
            <Text fontWeight="bold">Sophos Firewall Unavailable</Text>
            <Text fontSize="sm" color="gray.600">Unable to fetch monitoring data</Text>
          </VStack>
        </HStack>
      </Box>
    );
  }

  const { firewall, wans } = data.payload;
  const allWansUp = wans && wans.every(w => w.link_up);
  const anyWanDown = wans && wans.some(w => !w.link_up);

  const statusColor = firewall.reachable ? (allWansUp ? "green" : anyWanDown ? "orange" : "red") : "red";
  const statusIcon = firewall.reachable ? (allWansUp ? <CheckCircle size={20} /> : <AlertCircle size={20} />) : <WifiOff size={20} />;

  return (
    <Box borderWidth={1} borderRadius="md" bg="white" shadow="sm" p={6} borderColor={`${statusColor}.200`}>
      {/* Header */}
      <VStack align="start" spacing={4}>
        <HStack justify="space-between" width="100%">
          <HStack spacing={2}>
            <Box color={statusColor} display="flex" alignItems="center">
              {statusIcon}
            </Box>
            <VStack align="start" spacing={0}>
              <Text fontWeight="bold" fontSize="lg">{firewall.name}</Text>
              <Text fontSize="xs" color="gray.500">{firewall.host}</Text>
            </VStack>
          </HStack>
          <Badge colorScheme={statusColor === "green" ? "green" : statusColor === "orange" ? "orange" : "red"}>
            {firewall.reachable ? (allWansUp ? "OK" : "DEGRADED") : "CRITICAL"}
          </Badge>
        </HStack>

        {/* Firewall Info */}
        <HStack fontSize="sm" color="gray.600" spacing={6}>
          <Box>
            <Text fontWeight="semibold" display="inline">Uptime: </Text>
            <Text display="inline">{firewall.uptime}</Text>
          </Box>
          <Box>
            <Text fontWeight="semibold" display="inline">Mode: </Text>
            <Text display="inline">{firewall.mode.replace(/_/g, " ")}</Text>
          </Box>
        </HStack>

        {/* WAN Status Cards */}
        {wans && wans.length > 0 && (
          <VStack width="100%" spacing={3}>
            {wans.map((wan) => (
              <Box key={wan.interface} width="100%" p={3} bg="gray.50" borderRadius="md">
                <HStack justify="space-between" width="100%" mb={2}>
                  <HStack spacing={2}>
                    <Box
                      width={3}
                      height={3}
                      borderRadius="full"
                      bg={wan.link_up ? "green.400" : "red.400"}
                    />
                    <Text fontWeight="semibold">{wan.name}</Text>
                  </HStack>
                  <Badge colorScheme={wan.link_up ? "green" : "red"} variant="subtle">
                    {wan.link_up ? "UP" : "DOWN"}
                  </Badge>
                </HStack>

                <VStack align="start" fontSize="xs" color="gray.600" spacing={1}>
                  <HStack spacing={4}>
                    <Text><span style={{ fontWeight: "bold" }}>IP:</span> {wan.ip}</Text>
                    <Text><span style={{ fontWeight: "bold" }}>Gateway:</span> {wan.gateway}</Text>
                  </HStack>
                  <HStack spacing={4}>
                    <Text><span style={{ fontWeight: "bold" }}>RX:</span> {formatBytes(wan.rx_bytes)}</Text>
                    <Text><span style={{ fontWeight: "bold" }}>TX:</span> {formatBytes(wan.tx_bytes)}</Text>
                  </HStack>
                  {wan.latency_ms && (
                    <Text><span style={{ fontWeight: "bold" }}>Latency:</span> {wan.latency_ms}ms</Text>
                  )}
                </VStack>
              </Box>
            ))}
          </VStack>
        )}

        {/* Footer: Last Update & Restart Button */}
        <HStack justify="space-between" width="100%" fontSize="xs" color="gray.500">
          <Text>
            Last updated: {data.payload.timestamp ? new Date(data.payload.timestamp).toLocaleTimeString() : "N/A"}
          </Text>
          <Tooltip
            label={!firewall.reachable ? "Firewall unreachable — restart only available when connected" : ""}
            isDisabled={firewall.reachable}
          >
            <Button
              size="sm"
              colorScheme="red"
              variant="outline"
              leftIcon={<RefreshCw size={16} />}
              onClick={() => setShowRestartDialog(true)}
              isDisabled={!firewall.reachable || restarting}
              isLoading={restarting}
            >
              Restart Firewall
            </Button>
          </Tooltip>
        </HStack>
      </VStack>

      {/* Restart Confirmation Dialog */}
      <AlertDialog isOpen={showRestartDialog} leastDestructiveRef={cancelRef} onClose={() => setShowRestartDialog(false)}>
        <AlertDialogOverlay>
          <AlertDialogContent>
            <AlertDialogHeader fontSize="lg" fontWeight="bold">
              Restart Sophos Firewall?
            </AlertDialogHeader>
            <AlertDialogBody>
              This will restart the firewall. Both WAN connections will be temporarily unavailable. Continue?
            </AlertDialogBody>
            <AlertDialogFooter>
              <Button ref={cancelRef} onClick={() => setShowRestartDialog(false)}>
                Cancel
              </Button>
              <Button colorScheme="red" onClick={handleRestart} ml={3} isLoading={restarting}>
                Restart
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialogOverlay>
      </AlertDialog>
    </Box>
  );
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}
