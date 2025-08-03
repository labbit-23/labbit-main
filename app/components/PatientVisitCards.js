// File: /app/components/PatientVisitCards.js
'use client';

import { useEffect, useState } from "react";
import { SimpleGrid, Spinner, Text, Box } from "@chakra-ui/react";
import PatientVisitCard from "./PatientVisitCard";

export default function PatientVisitCards({
  patientId,
  selectedVisitId,
  onSelectVisit,
  openVisitModal
}) {
  const [visits, setVisits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!patientId) {
      setVisits(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    fetch(`/api/visits?patient_id=${patientId}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error fetching visits: ${res.statusText}`);
        }
        return res.json();
      })
      .then((data) => {
        setVisits(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to fetch visits");
        setVisits([]);
        setLoading(false);
      });
  }, [patientId]);

  if (!patientId) return null;

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

  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mt={6}>
      {activeVisits.map((visit) => (
        <PatientVisitCard
          key={visit.id}
          visit={visit}
          isSelected={selectedVisitId === visit.id}
          onSelect={() => onSelectVisit(visit.id)}
          openVisitModal={() => openVisitModal(visit)}
        />
      ))}
      {lastPastVisit && (
        <PatientVisitCard
          visit={lastPastVisit}
          isPast
          isSelected={selectedVisitId === lastPastVisit.id}
          onSelect={() => onSelectVisit(lastPastVisit.id)}
          openVisitModal={() => openVisitModal(lastPastVisit)}
        />
      )}
    </SimpleGrid>
  );
}
