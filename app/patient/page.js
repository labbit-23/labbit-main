"use client";

import {
  Box,
  Heading,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  Alert,
  AlertIcon,
  Text,
  useToast,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  HStack,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { CheckCircleIcon } from "@chakra-ui/icons";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const formatDate = (date) => (date ? new Date(date).toISOString().split("T")[0] : "");

export default function PatientVisitRequestPage() {
  const [mobile, setMobile] = useState("");
  const [patient, setPatient] = useState(null);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [visitForm, setVisitForm] = useState({
    lab_id: "",
    visit_date: formatDate(new Date()),
    time_slot_id: "",
    address: "",
  });
  const [loading, setLoading] = useState(false);
  const [patientLoading, setPatientLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [patientVisits, setPatientVisits] = useState([]);
  const toast = useToast();

  useEffect(() => {
    fetchLabs();
    fetchTimeSlots();
  }, []);

  useEffect(() => {
    if (patient) {
      fetchPatientVisits(patient.id);
    } else {
      setPatientVisits([]);
    }
  }, [patient]);

  async function fetchLabs() {
    try {
      const { data, error } = await supabase
        .from("labs")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      setLabs(data || []);
    } catch (error) {
      setErrorMsg("Failed to load labs.");
      console.error(error);
    }
  }

  async function fetchTimeSlots() {
    try {
      const { data, error } = await supabase
        .from("visit_time_slots")
        .select("id, slot_name, start_time, end_time")
        .order("start_time");
      if (error) throw error;
      setTimeSlots(data || []);
    } catch (error) {
      setErrorMsg("Failed to load time slots.");
      console.error(error);
    }
  }

  async function searchPatientByMobile(e) {
    e && e.preventDefault();
    setErrorMsg("");
    setPatient(null);

    const trimmedMobile = mobile.trim();
    if (!trimmedMobile) {
      setErrorMsg("Please enter your mobile number.");
      return;
    }

    setPatientLoading(true);
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", trimmedMobile)
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;

      setPatient(data || null);
      setVisitForm({
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot_id: "",
        address: "",
      });
    } catch (error) {
      setErrorMsg("Failed to search patient: " + (error.message || error));
      console.error(error);
    }
    setPatientLoading(false);
  }

  async function fetchPatientVisits(patientId) {
    try {
      const { data, error } = await supabase
        .from("visits")
        .select("id, visit_code, visit_date, time_slot, status")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false }); // Show most recent first

      if (error) throw error;

      console.log("Fetched patient visits:", data);

      setPatientVisits(data || []);
    } catch (error) {
      console.error("Failed to fetch patient visits:", error);
    }
  }

  async function handleSubmitVisitRequest(e) {
    e.preventDefault();
    setErrorMsg("");

    if (!patient) {
      setErrorMsg("Please confirm your patient information first.");
      return;
    }

    const { lab_id, visit_date, time_slot_id, address } = visitForm;

    if (!lab_id || !visit_date || !time_slot_id || !address.trim()) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    try {
      const timeSlotObj = timeSlots.find((ts) => ts.id === time_slot_id);

      if (!timeSlotObj) {
        setErrorMsg("Invalid time slot selected.");
        setLoading(false);
        return;
      }

      const { error } = await supabase.from("visits").insert([
        {
          patient_id: patient.id,
          lab_id,
          visit_date,
          time_slot: timeSlotObj.slot_name,
          address: address.trim(),
          status: "booked",
        },
      ]);

      if (error) throw error;

      toast({
        title: "Visit request submitted!",
        description: "We will notify you once your visit is confirmed.",
        status: "success",
        duration: 5000,
        isClosable: true,
        icon: <CheckCircleIcon color="brand.500" />,
      });

      // Reset visit form but keep mobile & patient info
      setVisitForm({
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot_id: "",
        address: "",
      });

      // Refresh the patient's visits list
      fetchPatientVisits(patient.id);
    } catch (error) {
      setErrorMsg("Failed to submit visit: " + (error.message || JSON.stringify(error)));
      console.error(error);
    }
    setLoading(false);
  }

  // Badge color based on status
  const statusColorScheme = (status) => {
    switch (status) {
      case "booked":
        return "blue";
      case "pending":
        return "orange";
      case "accepted":
        return "teal";
      case "postponed":
        return "yellow";
      case "rejected":
        return "red";
      case "completed":
        return "green";
      default:
        return "gray";
    }
  };

  return (
    <Box minH="100vh" bg="gray.50" py={[8, 12]} px={4}>
      <Box
        maxW="md"
        mx="auto"
        p={[6, 8]}
        bg="white"
        borderRadius="2xl"
        boxShadow="2xl"
        border="1px solid"
        borderColor="brand.50"
      >
        <Heading
          as="h1"
          size={["lg", "2xl"]}
          fontWeight="extrabold"
          color="brand.600"
          letterSpacing="tight"
          mb={4}
          textAlign="center"
        >
          Book a Home Sample Collection
        </Heading>
        <Text color="brand.900" fontSize="md" mb={6} textAlign="center">
          Enter your mobile phone to find your profile and manage your visits.
        </Text>

        {/* Mobile number lookup form */}
        <form onSubmit={searchPatientByMobile}>
          <HStack mb={6} align="stretch" spacing={3}>
            <Input
              placeholder="+919876543210"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              size="md"
              focusBorderColor="brand.400"
              isDisabled={patientLoading || loading}
              bg="gray.50"
              aria-label="Mobile phone number input"
              autoComplete="tel"
            />
            <Button
              type="submit"
              colorScheme="brand"
              isLoading={patientLoading}
              px={6}
              aria-label="Lookup mobile phone"
            >
              {patient ? "Re-Lookup" : "Lookup"}
            </Button>
          </HStack>
        </form>

        {/* Error display */}
        {errorMsg && (
          <Alert status="error" mb={6} borderRadius="md">
            <AlertIcon />
            <Text fontSize="sm">{errorMsg}</Text>
          </Alert>
        )}

        {/* Patient found box */}
        {patient && (
          <Box
            p={3}
            mb={6}
            borderWidth={1}
            borderRadius="lg"
            bgGradient="linear(to-bl, brand.100, white)"
            borderColor="brand.200"
            textAlign="center"
          >
            <Text fontWeight="semibold" color="brand.700" fontSize="lg">
              Welcome, {patient.name || "Patient"}!
            </Text>
            <Text color="brand.900" fontSize="md">
              Phone: {patient.phone}
            </Text>
          </Box>
        )}

        {/* All visits (no filter on status) */}
        {patient && patientVisits.length > 0 && (
          <Box
            maxW="lg"
            mx="auto"
            mb={6}
            p={4}
            borderWidth={1}
            borderRadius="xl"
            bg="teal.50"
            borderColor="teal.200"
          >
            <Heading size="md" color="teal.700" mb={3} textAlign="center">
              Your Visit Requests
            </Heading>
            <Table variant="simple" size="sm">
              <Thead>
                <Tr>
                  <Th>Visit Code</Th>
                  <Th>Date</Th>
                  <Th>Time Slot</Th>
                  <Th>Status</Th>
                </Tr>
              </Thead>
              <Tbody>
                {patientVisits.map((visit) => (
                  <Tr key={visit.id}>
                    <Td>{visit.visit_code || "N/A"}</Td>
                    <Td>{new Date(visit.visit_date).toLocaleDateString()}</Td>
                    <Td>{visit.time_slot}</Td>
                    <Td>
                      <Badge
                        colorScheme={statusColorScheme(visit.status)}
                        rounded="md"
                        px={2}
                      >
                        {visit.status.toUpperCase()}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            <Text mt={3} textAlign="center" color="teal.800" fontStyle="italic" fontSize="sm">
              You can make a new booking if none of your existing visits are active.
            </Text>
          </Box>
        )}

        {/* Show booking form always so patient can re-book if needed */}
        {patient && (
          <form onSubmit={handleSubmitVisitRequest}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel color="brand.800">Lab</FormLabel>
                <Select
                  placeholder="Select Lab"
                  value={visitForm.lab_id}
                  onChange={(e) => setVisitForm((f) => ({ ...f, lab_id: e.target.value }))}
                  bg="gray.50"
                  focusBorderColor="brand.400"
                  aria-label="Select lab"
                >
                  {labs.map((lab) => (
                    <option key={lab.id} value={lab.id}>
                      {lab.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel color="brand.800">Visit Date</FormLabel>
                <Input
                  type="date"
                  bg="gray.50"
                  value={visitForm.visit_date}
                  min={formatDate(new Date())}
                  onChange={(e) => setVisitForm((f) => ({ ...f, visit_date: e.target.value }))}
                  focusBorderColor="brand.400"
                  aria-label="Select visit date"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel color="brand.800">Time Slot</FormLabel>
                <Select
                  placeholder="Select Time Slot"
                  value={visitForm.time_slot_id}
                  onChange={(e) => setVisitForm((f) => ({ ...f, time_slot_id: e.target.value }))}
                  bg="gray.50"
                  focusBorderColor="brand.400"
                  aria-label="Select time slot"
                >
                  {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
                    <option key={id} value={id}>
                      {slot_name} ({start_time.slice(0, 5)} - {end_time.slice(0, 5)})
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel color="brand.800">Address for Collection</FormLabel>
                <Textarea
                  value={visitForm.address}
                  onChange={(e) => setVisitForm((f) => ({ ...f, address: e.target.value }))}
                  placeholder="Complete address with landmark"
                  rows={3}
                  bg="gray.50"
                  focusBorderColor="brand.400"
                  aria-label="Address for sample collection"
                />
              </FormControl>
              <Button
                type="submit"
                colorScheme="brand"
                size="lg"
                w="100%"
                isLoading={loading}
                rounded="full"
                boxShadow="md"
                mt={2}
                aria-label="Submit visit request"
              >
                Submit Visit Request
              </Button>
            </VStack>
          </form>
        )}

        {(!patient && !patientLoading) && (
          <Text textAlign="center" fontSize="sm" color="gray.400" mt={3}>
            Not found? Registration and OTP-based booking coming soon.
          </Text>
        )}
      </Box>
    </Box>
  );
}
