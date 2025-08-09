// File: /app/components/PatientVisitCards.js
'use client';

import { SimpleGrid, Spinner, Text, Box, VStack } from "@chakra-ui/react";
import PatientVisitCard from "./PatientVisitCard";

export default function PatientVisitCards({
  visits,
  selectedVisitId,
  onSelectVisit,
  openVisitModal,
  loading = false,
  error = null,
}) {
  if (loading) return <Spinner size="lg" my={6} />;

  if (error)
    return (
      <Text mt={6} color="red.500" fontWeight="medium" textAlign="center">
        {error}
      </Text>
    );

  if (!Array.isArray(visits) || visits.length === 0) {
    return (
      <Box
        mt={6}
        p={4}
        bg="rgba(0, 0, 0, 0.5)"
        borderRadius="md"
        maxW="md"
        mx="auto"
        textAlign="center"
      >
        <Text
          color="white"
          fontStyle="italic"
          fontWeight="medium"
          textShadow="0 0 5px rgba(0,0,0,0.8)"
        >
          No visits found for the selected patient. Please book a new visit using the button above.
        </Text>
      </Box>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const activeVisits = visits.filter(
    (v) => new Date(v.visit_date).setHours(0, 0, 0, 0) >= today.getTime()
  );

  const lastPastVisit = visits
    .filter((v) => new Date(v.visit_date).setHours(0, 0, 0, 0) < today.getTime())
    .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date))[0];

  const renderVisitDetails = (visit) => (
    <VStack align="start" spacing={1} mt={1}>
      {visit.address && (
        <Text fontSize="sm" color="gray.600" noOfLines={1} title={visit.address}>
          📍 {visit.address}
        </Text>
      )}
      {visit.executive && visit.executive.name && (
        <Text fontSize="sm" color="gray.600" noOfLines={1} title={visit.executive.name}>
          🧑‍⚕️ HV: {visit.executive.name}
        </Text>
      )}
      {!visit.executive?.name && visit.executive_id && (
        <Text fontSize="sm" color="gray.400" noOfLines={1} title={visit.executive_id}>
          🧑‍⚕️ HV ID: {visit.executive_id.slice(0, 8)}...
        </Text>
      )}
    </VStack>
  );

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mt={6}>
      {activeVisits.map((visit) => (
        <Box key={visit.id} position="relative">
          <PatientVisitCard
            visit={visit}
            isSelected={selectedVisitId === visit.id}
            onSelect={() => onSelectVisit(visit.id)}
            openVisitModal={() => openVisitModal(visit)}
          />
          {renderVisitDetails(visit)}
        </Box>
      ))}
      {lastPastVisit && (
        <Box key={lastPastVisit.id} position="relative">
          <PatientVisitCard
            visit={lastPastVisit}
            isPast
            isSelected={selectedVisitId === lastPastVisit.id}
            onSelect={() => onSelectVisit(lastPastVisit.id)}
            openVisitModal={() => openVisitModal(lastPastVisit)}
          />
          {renderVisitDetails(lastPastVisit)}
        </Box>
      )}
    </SimpleGrid>
  );
}
