"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Heading,
  Input,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Select,
  Spinner,
  useToast,
  Text,
  HStack,
} from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";
import TestPackageSelector from "../../components/TestPackageSelector"; // Adjust path if needed

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Helper to format date YYYY-MM-DD
const formatDate = (d) => d.toISOString().split("T")[0];

export default function PatientVisitRequest() {
  const toast = useToast();

  // Form States
  const [phone, setPhone] = useState("");
  const [patient, setPatient] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [visitDate, setVisitDate] = useState(formatDate(new Date()));
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [selectedTests, setSelectedTests] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Patient detail inputs (if new patient or editing)
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");

  // Fetch visit time slots on mount
  useEffect(() => {
    async function fetchTimeSlots() {
      const { data, error } = await supabase.from("visit_time_slots").select("*").order("start_time");
      if (!error) setTimeSlots(data || []);
    }
    fetchTimeSlots();
  }, []);

  // Lookup patient by phone number
  const lookupPatient = async () => {
    if (!phone) {
      toast({ title: "Please enter a phone number", status: "warning" });
      return;
    }
    setLookingUp(true);
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone.trim())
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPatient(data);
        setName(data.name || "");
        setDob(data.dob ? data.dob.substr(0, 10) : "");
        setEmail(data.email || "");
        setGender(data.gender || "");
        // Fetch addresses for this patient:
        const { data: addrData, error: addrError } = await supabase
          .from("patient_addresses")
          .select("*")
          .eq("patient_id", data.id)
          .order("is_default", { ascending: false });
        if (!addrError) {
          setAddresses(addrData || []);
          setSelectedAddressId(addrData?.length > 0 ? addrData[0].id : "");
        }
        toast({ title: "Patient found. Details loaded." });
      } else {
        // No patient found: clear
        setPatient(null);
        setName("");
        setDob("");
        setEmail("");
        setGender("");
        setAddresses([]);
        setSelectedAddressId("");
        toast({ title: "No patient found. Please enter details." });
      }
    } catch (e) {
      toast({ title: "Error looking up patient", status: "error", description: e.message });
    }
    setLookingUp(false);
  };

  // Handle form submission - create patient if new, create visit for patient
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!phone || !name || !visitDate || !selectedSlotId || !selectedAddressId || selectedTests.size === 0) {
      toast({ title: "Please fill all required fields and select tests/packages", status: "warning" });
      return;
    }

    setLoading(true);
    try {
      let patientId = patient?.id;

      // If no existing patient found, insert one
      if (!patientId) {
        const { data: newPatient, error: newPatientError } = await supabase
          .from("patients")
          .insert([{ phone: phone.trim(), name, dob, email, gender }])
          .select()
          .single();

        if (newPatientError) throw newPatientError;
        patientId = newPatient.id;
      }

      // Verify address exists in saved addresses; if not, create it
      let addressId = selectedAddressId;
      if (!addressId) {
        toast({ title: "Please select or create a patient address", status: "warning" });
        setLoading(false);
        return;
      }

      // You can extend here to insert new address if allowing address creation inline

      // Fetch address for inserting into visits to store textual address (can be improved)
      const selectedAddress = addresses.find((a) => a.id === addressId);
      const visitAddressText = selectedAddress ? selectedAddress.label : "";

      // Create the visit record
      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .insert([
          {
            patient_id: patientId,
            visit_date: visitDate,
            time_slot: selectedSlotId,
            address: visitAddressText,
            status: "booked",
          },
        ])
        .select()
        .single();

      if (visitError) throw visitError;

      // Insert visit_details rows for tests selected
      const inserts = Array.from(selectedTests).map((testId) => ({
        visit_id: visit.id,
        test_id: testId,
      }));

      if (inserts.length > 0) {
        const { error: visitDetailsError } = await supabase.from("visit_details").insert(inserts);
        if (visitDetailsError) throw visitDetailsError;
      }

      toast({ title: "Visit request submitted.", status: "success", duration: 3000 });

      // Clear form or navigate as needed
      setPhone("");
      setPatient(null);
      setName("");
      setDob("");
      setEmail("");
      setGender("");
      setAddresses([]);
      setSelectedAddressId("");
      setVisitDate(formatDate(new Date()));
      setSelectedSlotId("");
      setSelectedTests(new Set());
    } catch (e) {
      toast({ title: "Failed to submit visit request", status: "error", description: e.message });
    }
    setLoading(false);
  };

  return (
    <Box maxW="md" mx="auto" mt={12} p={6} bg="white" rounded="md" shadow="md">
      <Heading mb={6} textAlign="center">
        Patient Visit Request
      </Heading>
      <form onSubmit={handleSubmit}>
        <VStack spacing={4} align="stretch">
          <FormControl isRequired>
            <FormLabel>Phone Number</FormLabel>
            <HStack>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter patient phone"
                isDisabled={loading || lookingUp}
                aria-label="Patient phone number"
              />
              <Button onClick={lookupPatient} isLoading={lookingUp}>
                Lookup
              </Button>
            </HStack>
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Patient Name</FormLabel>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter patient name"
              isDisabled={loading}
              aria-label="Patient name"
            />
          </FormControl>
          <FormControl>
            <FormLabel>Date of Birth</FormLabel>
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              isDisabled={loading}
              aria-label="Patient date of birth"
            />
          </FormControl>
          <FormControl>
            <FormLabel>Email</FormLabel>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
              isDisabled={loading}
              aria-label="Patient email"
            />
          </FormControl>
          <FormControl>
            <FormLabel>Gender</FormLabel>
            <Select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              placeholder="Select gender"
              isDisabled={loading}
              aria-label="Patient gender"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Address</FormLabel>
            <Select
              placeholder="Select saved address"
              onChange={(e) => setSelectedAddressId(e.target.value)}
              value={selectedAddressId}
              isDisabled={loading || addresses.length === 0}
              aria-label="Patient address"
            >
              {addresses.map(({ id, label, pincode }) => (
                <option key={id} value={id}>
                  {label} {pincode ? `(${pincode})` : ""}
                </option>
              ))}
            </Select>
            {addresses.length === 0 && <Text fontSize="sm" mt={1} color="gray.500">No addresses found. Please add address in patient profile first.</Text>}
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Visit Date</FormLabel>
            <Input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              min={formatDate(new Date())}
              isDisabled={loading}
              aria-label="Visit date"
            />
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Time Slot</FormLabel>
            {timeSlots.length === 0 ? (
              <Spinner size="sm" />
            ) : (
              <Select
                placeholder="Select time slot"
                onChange={(e) => setSelectedSlotId(e.target.value)}
                value={selectedSlotId}
                isDisabled={loading}
                aria-label="Visit time slot"
              >
                {timeSlots.map(({ id, slot_name, start_time, end_time }) => (
                  <option key={id} value={slot_name}>
                    {slot_name} ({start_time} - {end_time})
                  </option>
                ))}
              </Select>
            )}
          </FormControl>
          <FormControl isRequired>
            <FormLabel>Select Tests / Packages</FormLabel>
            <Box border="1px solid #CBD5E0" p={2} borderRadius="md" maxH="60vh" overflowY="auto">
              <TestPackageSelector
                initialSelectedTests={selectedTests}
                onSelectionChange={setSelectedTests}
              />
            </Box>
          </FormControl>
          <Button type="submit" colorScheme="teal" isLoading={loading} isDisabled={loading}>
            Request Visit
          </Button>
        </VStack>
      </form>
    </Box>
  );
}
