"use client";
import {
  Box, Heading, Button, VStack, FormControl, FormLabel, Input,
  Select, Textarea, Alert, AlertIcon, Text, useToast, Spinner
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

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
  const toast = useToast();
  const [visitForm, setVisitForm] = useState({
    lab_id: "",
    visit_date: formatDate(new Date()),
    time_slot_id: "",
    address: "",
  });

  useEffect(() => {
    fetchLabs();
    fetchTimeSlots();
  }, []);

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
  async function searchPatientByMobile() {
    setErrorMsg(""); setPatient(null);
    const trimmedMobile = mobile.trim();
    if (!trimmedMobile) { setErrorMsg("Enter valid mobile."); return; }
    setPatientLoading(true);
    try {
      const { data, error } = await supabase.from("patients")
        .select("*").eq("phone", trimmedMobile).limit(1).single();
      if (error && error.code !== "PGRST116") throw error;
      setPatient(data || null);
    } catch (error) {
      setErrorMsg("Failed to search: " + (error.message || error));
    }
    setPatientLoading(false);
  }
  async function handleSubmitVisitRequest(e) {
    e.preventDefault(); setErrorMsg("");
    if (!patient) { setErrorMsg("Search mobile and confirm patient."); return; }
    const { lab_id, visit_date, time_slot_id, address } = visitForm;
    if (!lab_id || !visit_date || !time_slot_id || !address.trim())
      { setErrorMsg("Fill in all fields."); return; }
    setLoading(true);
    try {
      const timeSlotObj = timeSlots.find(ts => ts.id === time_slot_id);
      await supabase.from("visits").insert([{
        patient_id: patient.id, lab_id, visit_date,
        time_slot: timeSlotObj?.slot_name || "",
        address: address.trim(), status: "booked"
      }]);
      toast({
        title: "Request submitted.",
        description: "Your home collection request is booked.",
        status: "success", duration: 5000, isClosable: true,
      });
      setVisitForm({ lab_id: "", visit_date: formatDate(new Date()), time_slot_id: "", address: "" });
    } catch (error) {
      setErrorMsg("Failed: " + (error.message || JSON.stringify(error)));
    } setLoading(false);
  }

  return (
    <Box maxW="md" mx="auto" mt={10} p={6} borderWidth={1} borderRadius="xl" boxShadow="2xl" bg="white">
      <Heading textAlign="center" mb={4} size="lg" color="blue.700">
        Book a Home Sample Collection
      </Heading>
      <Text textAlign="center" fontSize="md" mb={4} color="gray.500">
        Search your mobile and book a visit in just a few clicks.
      </Text>

      <form onSubmit={(e) => { e.preventDefault(); searchPatientByMobile(); }}>
        <FormControl mb={2} isRequired>
          <FormLabel>Mobile Number</FormLabel>
          <Input
            placeholder="+919876543210" value={mobile}
            onChange={e => setMobile(e.target.value)} isDisabled={patientLoading || loading}
            size="md"
          />
        </FormControl>
        <Button
          colorScheme="blue" w="100%" mb={4} type="submit" isLoading={patientLoading}
        >{patient ? "Re-lookup" : "Lookup"}</Button>
      </form>

      {errorMsg && (
        <Alert status="error" mb={4} borderRadius="md">
          <AlertIcon boxSize={5} />
          <Text fontSize="sm">{errorMsg}</Text>
        </Alert>
      )}

      {patient && (
        <Box p={3} mb={3} borderWidth={1} borderRadius="md" bg="green.50" borderColor="green.200">
          <Text fontWeight="semibold" color="green.700">
            Hello, {patient.name || "New User"}!
          </Text>
          <Text fontSize="sm" color="green.900">Phone: {patient.phone}</Text>
        </Box>
      )}

      {patient && (
        <form onSubmit={handleSubmitVisitRequest}>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel>Lab</FormLabel>
              <Select
                placeholder="Select Lab"
                value={visitForm.lab_id} onChange={e => setVisitForm(f => ({ ...f, lab_id: e.target.value }))}
                isDisabled={loading}
              >
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>{lab.name}</option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Visit Date</FormLabel>
              <Input
                type="date"
                value={visitForm.visit_date}
                min={formatDate(new Date())}
                onChange={e => setVisitForm(f => ({ ...f, visit_date: e.target.value }))}
                isDisabled={loading}
              />
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Time Slot</FormLabel>
              <Select
                placeholder="Select Time Slot"
                value={visitForm.time_slot_id}
                onChange={e => setVisitForm(f => ({ ...f, time_slot_id: e.target.value }))}
                isDisabled={loading}
              >
                {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
                  <option key={id} value={id}>{slot_name} ({start_time.slice(0,5)}-{end_time.slice(0,5)})</option>
                ))}
              </Select>
            </FormControl>
            <FormControl isRequired>
              <FormLabel>Address for Collection</FormLabel>
              <Textarea
                value={visitForm.address}
                onChange={e => setVisitForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Full address with landmark"
                isDisabled={loading}
                rows={3}
              />
            </FormControl>
            <Button type="submit" colorScheme="green" isLoading={loading} w="100%">
              Submit
            </Button>
          </VStack>
        </form>
      )}

      {!patient && !patientLoading && (
        <Text textAlign="center" fontSize="sm" color="gray.400" mt={3}>
          {mobile && !errorMsg
            ? "Didn't find your number? Registration and OTP coming soon."
            : ""}
        </Text>
      )}
    </Box>
  );
}
