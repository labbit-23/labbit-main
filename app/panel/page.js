"use client";

import { useEffect, useState } from "react";
import { Badge, Box, Button, Flex, Heading, SimpleGrid, Skeleton, Text, HStack } from "@chakra-ui/react";
import RequireAuth from "../../components/RequireAuth";
import PanelNav from "../../components/panel/PanelNav";
import { panelFetch, safeHref, STATE_COLORS } from "../../components/panel/panelUtils";

function Dot({ dot }) {
  if (dot !== "up" && dot !== "down") return null;
  return (
    <Box
      as="span"
      w="10px"
      h="10px"
      borderRadius="full"
      flexShrink={0}
      bg={STATE_COLORS[dot]}
      title={dot}
      aria-label={`status ${dot}`}
    />
  );
}

function TileLink({ item, children, ...rest }) {
  const href = safeHref(item.url);
  if (!href) {
    return (
      <Box aria-disabled="true" opacity={0.55} cursor="not-allowed" {...rest}>
        {children}
      </Box>
    );
  }
  return (
    <Box as="a" href={href} target="_blank" rel="noopener noreferrer" _hover={{ borderColor: "#6366f1" }} {...rest}>
      {children}
    </Box>
  );
}

function MenuContent() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await panelFetch("/api/panel/menu");
        if (alive) {
          setItems(Array.isArray(data) ? data : []);
          setErr("");
        }
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load");
      }
    }
    load();
    const t = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const pinned = (items || []).filter((i) => i.pinned);
  const groups = {};
  (items || []).filter((i) => !i.pinned).forEach((i) => {
    (groups[i.group || "Other"] ||= []).push(i);
  });

  return (
    <Box minH="100vh" bg="#0b1220" color="#e5e9f5">
      <PanelNav />
      <Box maxW="1100px" mx="auto" px={{ base: 4, md: 8 }} py={6}>
        <Heading size="lg">Systems</Heading>
        <Text color="#94a3b8" mb={4}>Open a system in a new tab.</Text>
        {err && <Box bg="#3b1219" border="1px solid #ef4444" p={3} borderRadius="md" mb={4}>{err}</Box>}
        {!err && items === null && (
          <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
            {[0, 1, 2, 3].map((i) => <Skeleton key={i} h="84px" borderRadius="lg" startColor="#111a2e" endColor="#1e2b4a" />)}
          </SimpleGrid>
        )}
        {pinned.length > 0 && (
          <Flex as="section" aria-label="Quick access" wrap="wrap" gap={3} mb={6}>
            {pinned.map((it) => (
              <TileLink
                key={it.id}
                item={it}
                px={4}
                py={2}
                bg="#1e1b4b"
                border="1px solid #4338ca"
                borderRadius="full"
                fontWeight="600"
              >
                <HStack spacing={2}>
                  <Dot dot={it.dot} />
                  <span>{it.label}</span>
                </HStack>
              </TileLink>
            ))}
          </Flex>
        )}
        {items !== null && items.length === 0 && (
          <Box bg="#111a2e" border="1px solid #1e2b4a" p={4} borderRadius="md">No systems available.</Box>
        )}
        {Object.entries(groups).map(([g, list]) => (
          <Box as="section" key={g} mb={6}>
            <Heading as="h2" size="sm" color="#94a3b8" textTransform="uppercase" letterSpacing="0.06em" mb={3}>{g}</Heading>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4}>
              {list.map((it) => (
                <TileLink key={it.id} item={it} p={4} bg="#111a2e" border="1px solid #1e2b4a" borderRadius="lg" minH="84px">
                  <Flex direction="column" gap={2}>
                    <HStack spacing={2}>
                      <Dot dot={it.dot} />
                      <Text fontWeight="600">{it.label}</Text>
                    </HStack>
                    {!safeHref(it.url) && <Badge alignSelf="flex-start" colorScheme="gray">Not configured</Badge>}
                    {it.admin_console && <Badge alignSelf="flex-start" colorScheme="purple">admin &middot; VPN</Badge>}
                  </Flex>
                </TileLink>
              ))}
            </SimpleGrid>
          </Box>
        ))}
        {items !== null && <Button size="xs" variant="ghost" color="#94a3b8" onClick={() => window.location.reload()}>Refresh</Button>}
      </Box>
    </Box>
  );
}

export default function PanelMenuPage() {
  return (
    <RequireAuth roles={["director", "director_ceo"]}>
      <MenuContent />
    </RequireAuth>
  );
}
