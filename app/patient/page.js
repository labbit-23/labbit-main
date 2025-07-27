"use client";
import {
  Box, Heading, Button, VStack, FormControl, FormLabel, Input,
  Select, Textarea, Alert, AlertIcon, Text, useToast, Badge,
  Table, Thead, Tbody, Tr, Th, Td, Spinner, HStack
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { CheckCircleIcon } from "@chakra-ui/icons";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
const formatDate = (date) => date ? new Date(date).toISOString().split("T")[0] : "";

export default function PatientVisitRequestPage() {
  const [mobile, setMobile] = useState("");
  const [patient, setPatient] = useState(null);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [patientLoading, setPatientLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [visitForm, setVisitForm] = useState({
    lab_id: "",
    visit_date: formatDate(new Date()),
    time_slot_id: "",
    address: "",
  });
  const [patientVisits, setPatientVisits] = useState([]);
  const toast = useToast();

  useEffect(() => {
    fetchLabs();
    fetchTimeSlots();
  }, []);

  useEffect(() => {
    if (patient) fetchPatientVisits(patient.id);
    else setPatientVisits([]);
  }, [patient]);

  async function fetchLabs() {
    try {
      const { data } = await supabase.from("labs").select("id, name").eq("is_active", true).order("name");
      setLabs(data || []);
    } catch {}
  }
  async function fetchTimeSlots() {
    try {
      const { data } = await supabase.from("visit_time_slots").select("id, slot_name, start_time, end_time").order("start_time");
      setTimeSlots(data || []);
    } catch {}
  }
  async function searchPatientByMobile(e) {
    e && e.preventDefault();
    setErrorMsg(""); setPatient(null);
    const trimmedMobile = mobile.trim();
    if (!trimmedMobile) { setErrorMsg("Enter your mobile number."); return; }
    setPatientLoading(true);
    try {
      const { data, error } = await supabase.from("patients")
        .select("*").eq("phone", trimmedMobile).limit(1).single();
      if (error && error.code !== "PGRST116") throw error;
      setPatient(data || null);
    } catch (error) { setErrorMsg("Failed to search: " + (error.message || error)); }
    setPatientLoading(false);
  }
  async function fetchPatientVisits(patientId) {
    try {
      const { data } = await supabase
        .from("visits")
        .select("id, visit_code, visit_date, time_slot, status")
        .eq("patient_id", patientId)
        .order("visit_date", { ascending: false });
      setPatientVisits(data || []);
    } catch {}
  }
  async function handleSubmitVisitRequest(e) {
    e.preventDefault(); setErrorMsg("");
    if (!patient) { setErrorMsg("Lookup or confirm patient first."); return; }
    const { lab_id, visit_date, time_slot_id, address } = visitForm;
    if (!lab_id || !visit_date || !time_slot_id || !address.trim()) {
      setErrorMsg("Please fill out all fields.");
      return;
    }
    setLoading(true);
    try {
      const timeSlotObj = timeSlots.find(ts => ts.id === time_slot_id);
      await supabase.from("visits").insert([{
        patient_id: patient.id, lab_id, visit_date,
        time_slot: timeSlotObj?.slot_name || "",
        address: address.trim(), status: "booked"
      }]);
      toast({
        title: "Home visit requested!",
        description: "We'll confirm by SMS/call. Your status appears below.",
        status: "success", duration: 5000, isClosable: true,
        icon: <CheckCircleIcon color="brand.500" />
      });
      setVisitForm({ lab_id: "", visit_date: formatDate(new Date()), time_slot_id: "", address: "" });
      fetchPatientVisits(patient.id);
    } catch (error) {
      setErrorMsg("Failed: " + (error.message || JSON.stringify(error)));
    }
    setLoading(false);
  }

  // Status badge color mapping
  const statusColorScheme = status => {
    switch (status) {
      case "booked": return "blue";
      case "accepted": return "teal";
      case "postponed": return "yellow";
      case "rejected": return "red";
      case "completed": return "green";
      default: return "gray";
    }
  };

  return (
    <Box minH="100vh" bg="gray.50" py={[6, 12]} px={2}>
      <Box
        maxW="md"
        mx="auto"
        p={[4, 8]}
        bg="white"
        borderRadius="2xl"
        boxShadow="2xl"
        border="1px solid"
        borderColor="brand.50"
      >
        <Heading
          as="h1"
          textAlign="center"
          mb={3}
          fontWeight="extrabold"
          size={["lg", "2xl"]}
          color="brand.600"
          letterSpacing="tight"
        >
          Book a Home Sample Collection
        </Heading>
        <Text mb={5} color="brand.900" fontSize="md" textAlign="center">
          Enter your mobile number to see/save your visit.
        </Text>
        {/* Mobile Input Row */}
        <form onSubmit={searchPatientByMobile}>
          <HStack mb={3} align="stretch" spacing={3}>
            <Input
              placeholder="+919876543210"
              value={mobile}
              onChange={e => setMobile(e.target.value)}
              size="md"
              focusBorderColor="brand.400"
              isDisabled={patientLoading || loading}
              bg="gray.50"
            />
            <Button
              colorScheme="brand"
              type="submit"
              isLoading={patientLoading}
              px={6}
            >
              {patient ? "Re-Lookup" : "Lookup"}
            </Button>
          </HStack>
        </form>
        {errorMsg && (
          <Alert status="error" mb={4} borderRadius="md">
            <AlertIcon boxSize={5} /> <Text fontSize="sm">{errorMsg}</Text>
          </Alert>
        )}
        {/* Patient Found Box */}
        {patient && (
          <Box
            p={3} mb={3}
            borderWidth={1}
            borderRadius="lg"
            bgGradient="linear(to-bl, brand.100, white)"
            borderColor="brand.200"
          >
            <Text fontWeight="semibold" color="brand.700">
              Welcome, {patient.name || "Patient"}!
            </Text>
            <Text fontSize="sm" color="brand.900">Phone: {patient.phone}</Text>
          </Box>
        )}
        {/* Visit Request Form */}
        {patient && (
          <form onSubmit={handleSubmitVisitRequest}>
            <VStack gap={3}>
              <FormControl isRequired>
                <FormLabel color="brand.800">Lab</FormLabel>
                <Select
                  placeholder="Select Lab"
                  value={visitForm.lab_id}
                  onChange={e => setVisitForm(f => ({ ...f, lab_id: e.target.value }))}
                  bg="gray.50"
                  focusBorderColor="brand.400"
                >
                  {labs.map(lab => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel color="brand.800">Visit Date</FormLabel>
                <Input
                  type="date"
                  bg="gray.50"
                  value={visitForm.visit_date}
                  min={formatDate(new Date())}
                  onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))}
                  focusBorderColor="brand.400"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel color="brand.800">Time Slot</FormLabel>
                <Select
                  placeholder="Select Time Slot"
                  value={visitForm.time_slot_id}
                  onChange={e => setVisitForm(f => ({ ...f, time_slot_id: e.target.value }))}
                  bg="gray.50"
                  focusBorderColor="brand.400"
                >
                  {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
                    <option key={id} value={id}>
                      {slot_name} ({start_time.slice(0,5)}-{end_time.slice(0,5)})
                    </option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel color="brand.800">Address for Collection</FormLabel>
                <Textarea
                  value={visitForm.address}
                  onChange={e => setVisitForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Complete address / landmarks"
                  rows={3}
                  bg="gray.50"
                  focusBorderColor="brand.400"
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
              >
                Submit Visit Request
              </Button>
            </VStack>
          </form>
        )}
        {(!patient && !patientLoading) && (
          <Text textAlign="center" fontSize="sm" color="gray.400" mt={3}>
            Not found? Registration and OTP based booking coming soon.
          </Text>
        )}
      </Box>
      {/* Patient Visit Requests: Status/History */}
      {patientVisits.length > 0 && (
        <Box
          mt={[8, 12]}
          maxW="lg"
          mx="auto"
          bg="white"
          borderRadius="2xl"
          boxShadow="xl"
          p={[3, 6]}
          border="1px solid"
          borderColor="brand.50"
        >
          <Heading size="md" color="brand.700" mb={4} textAlign="center" letterSpacing="tight">
            Your Home Visit Requests
          </Heading>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th>Code</Th>
                <Th>Date</Th>
                <Th>Slot</Th>
                <Th>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {patientVisits.map((visit) => (
                <Tr key={visit.id}>
                  <Td>{visit.visit_code || "—"}</Td>
                  <Td>{new Date(visit.visit_date).toLocaleDateString()}</Td>
                  <Td>{visit.time_slot}</Td>
                  <Td>
                    <Badge colorScheme={statusColorScheme(visit.status)} variant="solid" rounded="md" px={2}>
                      {visit.status.replace(/_/g, ' ').toUpperCase()}
                    </Badge>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>
      )}
    </Box>
  );
}
