"use client";

import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Select,
  Textarea,
  Heading,
  Spinner,
  Alert,
  AlertIcon,
  AlertDescription,
  VStack,
  HStack,
  Text,
  useToast,
} from "@chakra-ui/react";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const formatDate = (date) =>
  date ? new Date(date).toISOString().split("T")[0] : "";

export default function PatientVisitRequestPage() {
  const [mobile, setMobile] = useState("");
  const [patient, setPatient] = useState(null);
  const [labs, setLabs] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [patientLoading, setPatientLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

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
      const { data, error } = await supabase
        .from("labs")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      setLabs(data || []);
    } catch (error) {
      setErrorMsg("Failed to load labs");
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
      setErrorMsg("Failed to load time slots");
      console.error(error);
    }
  }

  async function searchPatientByMobile() {
    setErrorMsg(null);
    setPatient(null);

    const trimmedMobile = mobile.trim();
    if (!trimmedMobile) {
      setErrorMsg("Please enter a valid mobile number.");
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

      if (data) {
        setPatient(data);
        setVisitForm({
          lab_id: "",
          visit_date: formatDate(new Date()),
          time_slot_id: "",
          address: "",
        });
      } else {
        setPatient(null);
      }
    } catch (error) {
      setErrorMsg("Failed to search patient: " + (error.message || error));
    } finally {
      setPatientLoading(false);
    }
  }

  const handleVisitFormChange = (field) => (e) => {
    setVisitForm((f) => ({ ...f, [field]: e.target.value }));
  };

  async function handleSubmitVisitRequest(e) {
    e.preventDefault();
    setErrorMsg(null);

    if (!patient) {
      setErrorMsg("Please search for your mobile number and confirm patient first.");
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
      const visitToInsert = {
        patient_id: patient.id,
        lab_id,
        visit_date,
        time_slot: timeSlotObj?.slot_name || "",
        address: address.trim(),
        status: "booked",
      };

      const { error } = await supabase.from("visits").insert([visitToInsert]);

      if (error) throw error;

      toast({
        title: "Visit request submitted.",
        description: "Thank you! Your visit request is booked.",
        status: "success",
        duration: 5000,
        isClosable: true,
      });

      // Reset visit form but keep mobile & patient info so user can book again if needed
      setVisitForm({
        lab_id: "",
        visit_date: formatDate(new Date()),
        time_slot_id: "",
        address: "",
      });
    } catch (error) {
      setErrorMsg("Failed to submit visit: " + (error.message || JSON.stringify(error)));
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box maxW="md" mx="auto" mt={10} p={6} borderWidth={1} borderRadius="md" boxShadow="md" bg="white">
      <Heading textAlign="center" mb={6} size="lg">
        Request a Visit
      </Heading>

      <FormControl mb={4}>
        <FormLabel>Mobile Number</FormLabel>
        <HStack>
          <Input
            placeholder="+919876543210"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            isDisabled={patientLoading || loading}
          />
          <Button onClick={searchPatientByMobile} isLoading={patientLoading} colorScheme="blue">
            Lookup
          </Button>
        </HStack>
      </FormControl>

      {errorMsg && (
        <Alert status="error" mb={6}>
          <AlertIcon />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {patient === null && !patientLoading && (
        <Alert status="warning" mb={6}>
          <AlertIcon />
          <Box>
            <Text fontWeight="medium">
              No patient record found for this number.
            </Text>
            <Text fontSize="sm">
              Patient creation and OTP authentication coming soon.
            </Text>
          </Box>
        </Alert>
      )}

      {patient && (
        <Alert status="success" mb={6}>
          <AlertIcon />
          <Box>
            <Text fontWeight="medium">Found Patient: {patient.name}</Text>
            <Text fontSize="sm">Phone: {patient.phone}</Text>
          </Box>
        </Alert>
      )}

      {patient && (
        <form onSubmit={handleSubmitVisitRequest}>
          <VStack spacing={4} align="stretch">
            <FormControl isRequired>
              <FormLabel>Lab</FormLabel>
              <Select
                placeholder="Select Lab"
                value={visitForm.lab_id}
                onChange={handleVisitFormChange("lab_id")}
                isDisabled={loading}
              >
                {labs.map((lab) => (
                  <option key={lab.id} value={lab.id}>
                    {lab.name}
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Visit Date</FormLabel>
              <Input
                type="date"
                value={visitForm.visit_date}
                min={formatDate(new Date())}
                onChange={handleVisitFormChange("visit_date")}
                isDisabled={loading}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Time Slot</FormLabel>
              <Select
                placeholder="Select Time Slot"
                value={visitForm.time_slot_id}
                onChange={handleVisitFormChange("time_slot_id")}
                isDisabled={loading}
              >
                {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
                  <option key={id} value={id}>
                    {slot_name} ({start_time.slice(0, 5)} - {end_time.slice(0, 5)})
                  </option>
                ))}
              </Select>
            </FormControl>

            <FormControl isRequired>
              <FormLabel>Address for Sample Collection</FormLabel>
              <Textarea
                placeholder="Full address with landmarks"
                value={visitForm.address}
                onChange={handleVisitFormChange("address")}
                isDisabled={loading}
              />
            </FormControl>

            <Button type="submit" colorScheme="green" isLoading={loading}>
              Submit Visit Request
            </Button>
          </VStack>
        </form>
      )}
    </Box>
  );
}
