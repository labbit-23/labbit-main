// File: /app/phlebo/PatientLookupTab.js

"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  FormControl,
  FormLabel,
  Input,
  Button,
  VStack,
  Text,
  Spinner,
  useToast,
} from "@chakra-ui/react";
import { supabase } from "../../lib/supabaseClient";
import VisitScheduler from "../patient/VisitScheduler"; // Adjust path if needed

import { useUser } from "../context/UserContext"; // Import global user context

export default function PatientLookupTab({ onSelectVisit, hvExecutiveId: propHvExecutiveId }) {
  const toast = useToast();

  const { user, isLoading: userLoading } = useUser();

  // Internal executive ID state
  const [hvExecutiveId, setHvExecutiveId] = useState(propHvExecutiveId || null);

  const [phone, setPhone] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);

  // Selected patient & visits
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activeVisits, setActiveVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(false);

  // VisitScheduler state
  const [visitDate, setVisitDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [creatingVisit, setCreatingVisit] = useState(false);

  // Update hvExecutiveId when user or propHvExecutiveId changes
  useEffect(() => {
    if (propHvExecutiveId) {
      setHvExecutiveId(propHvExecutiveId);
    } else if (!userLoading && user && user.userType === "executive") {
      setHvExecutiveId(user.id);
    }
  }, [propHvExecutiveId, user, userLoading]);

  // Fetch time slots on mount
  useEffect(() => {
    async function fetchTimeSlots() {
      const { data, error } = await supabase
        .from("visit_time_slots")
        .select("id, slot_name, start_time, end_time")
        .order("start_time");
      if (!error) setTimeSlots(data || []);
    }
    fetchTimeSlots();
  }, []);

  // Search patients by phone
  const lookupPatient = async () => {
    if (!phone.trim()) {
      toast({ title: "Please enter a phone number", status: "warning" });
      return;
    }
    setSearching(true);
    setResults([]);
    setSelectedPatient(null);
    setActiveVisits([]);
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("id, name, phone")
        .ilike("phone", `%${phone.trim()}%`)
        .limit(10);
      if (error) throw error;
      setResults(data || []);
      if (!data || data.length === 0) {
        toast({ title: "No patients found", status: "info" });
      }
    } catch (err) {
      toast({ title: "Error", description: err.message, status: "error" });
    } finally {
      setSearching(false);
    }
  };

  // When a patient is selected from results
  const selectPatient = (patient) => {
    setSelectedPatient(patient);
    setResults([]);
    setPhone(patient.phone);
    setSelectedSlotId("");
    fetchActiveVisits(patient.id);
  };

  // Load active visits (status not completed/canceled) for this patient
  const fetchActiveVisits = async (patientId) => {
    setLoadingVisits(true);
    setActiveVisits([]);
    try {
      const { data, error } = await supabase
        .from("visits")
        .select(
          "id, visit_date, status, time_slot, time_slot:time_slot(slot_name, start_time, end_time)"
        )
        .eq("patient_id", patientId)
        .filter("status", "not.in", "(completed,canceled)")
        .order("visit_date", { ascending: false });
      if (error) throw error;
      setActiveVisits(data || []);
    } catch (err) {
      toast({ title: "Error loading active visits", description: err.message, status: "error" });
      setActiveVisits([]);
    } finally {
      setLoadingVisits(false);
    }
  };

  // Create a new visit assigned to current HV executive
  const createVisit = async () => {
    if (!selectedPatient || !visitDate || !selectedSlotId) {
      toast({ title: "Please select patient, visit date, and time slot", status: "warning" });
      return;
    }
    if (!hvExecutiveId) {
      toast({ title: "HV Executive ID missing", status: "error" });
      return;
    }
    setCreatingVisit(true);
    try {
      const { data, error } = await supabase
        .from("visits")
        .insert([
          {
            patient_id: selectedPatient.id,
            visit_date: visitDate,
            time_slot: selectedSlotId,
            executive_id: hvExecutiveId,
            status: "assigned",
          },
        ])
        .select(
          "*, patient:patient_id(name, phone), time_slot:time_slot(id, slot_name, start_time, end_time)"
        )
        .single();
      if (error) throw error;

      toast({ title: "Visit created and assigned to you", status: "success" });
      onSelectVisit(data); // Pass the new visit up for details tab
      // Reset form
      setSelectedPatient(null);
      setSelectedSlotId("");
      setVisitDate(new Date().toISOString().slice(0, 10));
      setPhone("");
      setActiveVisits([]);
    } catch (err) {
      toast({ title: "Failed to create visit", description: err.message, status: "error" });
    } finally {
      setCreatingVisit(false);
    }
  };

  return (
    <Box>
      {/* Search Section */}
      <FormControl maxW="400px" mb={4}>
        <FormLabel>Search Patient by Phone</FormLabel>
        <VStack spacing={2} align="start">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter phone number"
            disabled={selectedPatient !== null}
          />
          {selectedPatient === null && (
            <Button onClick={lookupPatient} isLoading={searching} colorScheme="teal">
              Search
            </Button>
          )}
          {selectedPatient !== null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedPatient(null);
                setPhone("");
                setResults([]);
                setActiveVisits([]);
              }}
            >
              Clear Selection
            </Button>
          )}
        </VStack>
      </FormControl>

      {/* Search Results */}
      {searching ? (
        <Spinner />
      ) : results.length > 0 && selectedPatient === null ? (
        <VStack spacing={3} align="stretch" maxW="400px">
          {results.map((patient) => (
            <Box
              key={patient.id}
              p={3}
              bg="gray.100"
              borderRadius="md"
              cursor="pointer"
              onClick={() => selectPatient(patient)}
              _hover={{ bg: "gray.200" }}
            >
              <Text fontWeight="bold">{patient.name}</Text>
              <Text>{patient.phone}</Text>
            </Box>
          ))}
        </VStack>
      ) : null}

      {/* Active Visits for selected patient */}
      {selectedPatient && (
        <Box maxW="400px" mt={4} mb={4}>
          <Text fontWeight="bold" mb={2}>
            Active Visits for {selectedPatient.name}
          </Text>
          {loadingVisits ? (
            <Spinner />
          ) : activeVisits.length === 0 ? (
            <Text>No active visits found.</Text>
          ) : (
            activeVisits.map((visit) => (
              <Box key={visit.id} p={3} mb={2} bg="gray.50" rounded="md">
                <Text>Date: {visit.visit_date}</Text>
                <Text>
                  Time Slot:{" "}
                  {visit.time_slot
                    ? `${visit.time_slot.slot_name} (${visit.time_slot.start_time} - ${visit.time_slot.end_time})`
                    : "-"}
                </Text>
                <Text>Status: {visit.status.replace(/_/g, " ")}</Text>
                <Button mt={2} size="sm" onClick={() => onSelectVisit(visit)}>
                  Open Visit Details
                </Button>
              </Box>
            ))
          )}
        </Box>
      )}

      {/* Visit Scheduler and Create Visit form */}
      {selectedPatient && (
        <Box maxW="400px" p={4} borderWidth="1px" borderRadius="md" bg="gray.50">
          <Text fontWeight="bold" mb={4}>
            Create New Visit for {selectedPatient.name}
          </Text>

          <VisitScheduler
            visitDate={visitDate}
            setVisitDate={setVisitDate}
            timeSlots={timeSlots}
            setTimeSlots={setTimeSlots}
            selectedSlotId={selectedSlotId}
            setSelectedSlotId={setSelectedSlotId}
            loading={creatingVisit}
          />

          <Button
            mt={4}
            colorScheme="teal"
            onClick={createVisit}
            isLoading={creatingVisit}
            isDisabled={!selectedSlotId || creatingVisit}
            width="full"
          >
            Create Visit & Assign to Me
          </Button>
        </Box>
      )}
    </Box>
  );
}
