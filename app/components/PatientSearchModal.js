"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  useToast,
  VStack,
} from "@chakra-ui/react";

function formatDob(dob) {
  if (!dob) return "-";
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return String(dob).slice(0, 10);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PatientSearchModal({
  isOpen,
  onClose,
  onSelect,
  themeMode = "light",
}) {
  const toast = useToast();
  const isDark = themeMode === "dark";

  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const canSearch = useMemo(() => String(q || "").trim().length >= 2, [q]);

  const runSearch = async () => {
    if (!canSearch) return;
    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`/api/patients/search?q=${encodeURIComponent(q)}&limit=50`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Search failed");
      setRows(Array.isArray(json?.data) ? json.data : []);
    } catch (error) {
      toast({
        title: "Patient search failed",
        description: String(error?.message || error),
        status: "error",
        duration: 3500,
        isClosable: true,
      });
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (row) => {
    if (!row?.id) return;
    onSelect?.(row);
    onClose?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="6xl" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Patient Search</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <HStack>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, phone, MRN, email, external key"
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
              <Button colorScheme="blue" onClick={runSearch} isLoading={loading} isDisabled={!canSearch}>
                Search
              </Button>
            </HStack>

            <Box borderWidth="1px" borderColor={isDark ? "whiteAlpha.300" : "gray.200"} borderRadius="md" overflowX="auto" overflowY="hidden">
              <Table size="sm" minW="900px">
                <Thead>
                  <Tr>
                    <Th>Name</Th>
                    <Th>Phone</Th>
                    <Th>MRN</Th>
                    <Th>DOB</Th>
                    <Th>Email</Th>
                    <Th>External Key</Th>
                    <Th>Address</Th>
                    <Th textAlign="right">Action</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {loading ? (
                    <Tr>
                      <Td colSpan={8}>
                        <HStack justify="center" py={4}><Spinner size="sm" /><Text>Searching...</Text></HStack>
                      </Td>
                    </Tr>
                  ) : rows.length === 0 ? (
                    <Tr>
                      <Td colSpan={8}>
                        <Text py={3} color={isDark ? "whiteAlpha.700" : "gray.600"}>
                          {!canSearch
                            ? "Type at least 2 characters to search."
                            : hasSearched
                              ? "No patients found."
                              : "Press Search button to lookup."}
                        </Text>
                      </Td>
                    </Tr>
                  ) : (
                    rows.map((row) => (
                      <Tr key={row.id}>
                        <Td>
                          <Text fontWeight="600">{row.name || "-"}</Text>
                        </Td>
                        <Td>{row.phone || "-"}</Td>
                        <Td>
                          {row.mrn ? <Badge colorScheme="blue">{row.mrn}</Badge> : "-"}
                        </Td>
                        <Td>{formatDob(row.dob)}</Td>
                        <Td>{row.email || "-"}</Td>
                        <Td maxW="180px">
                          <Text noOfLines={1}>{Array.isArray(row.external_keys) && row.external_keys.length > 0 ? row.external_keys.join(", ") : "-"}</Text>
                        </Td>
                        <Td maxW="280px">
                          <Text noOfLines={2}>{row.address_line || "-"}</Text>
                        </Td>
                        <Td textAlign="right">
                          <Button size="xs" colorScheme="green" onClick={() => handleSelect(row)}>
                            Select
                          </Button>
                        </Td>
                      </Tr>
                    ))
                  )}
                </Tbody>
              </Table>
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
