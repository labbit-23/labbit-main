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
import TestPackageSelector from "../../components/TestPackageSelector"; // adjust path if needed
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const formatDate = (d) => d.toISOString().split("T")[0];

// Default map center (e.g., Hyderabad)
const DEFAULT_CENTER = { lat: 17.385, lng: 78.4867 };
const MAP_CONTAINER_STYLE = { width: "100%", height: "300px" };

export default function PatientVisitRequest() {
  const toast = useToast();

  // Form states
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

  // Patient detail inputs
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");

  // Address lat/lng for location picker (for new or editing selected address)
  const [addressLatLng, setAddressLatLng] = useState({ lat: null, lng: null });

  // Google Maps API loading
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  });

  // Fetch visit time slots on mount
  useEffect(() => {
    async function fetchTimeSlots() {
      const { data, error } = await supabase
        .from("visit_time_slots")
        .select("*")
        .order("start_time");
      if (!error) setTimeSlots(data || []);
    }
    fetchTimeSlots();
  }, []);

  // When selectedAddressId changes, update addressLatLng based on address
  useEffect(() => {
    if (!selectedAddressId) {
      setAddressLatLng({ lat: null, lng: null });
      return;
    }
    const addr = addresses.find((a) => a.id === selectedAddressId);
    if (addr && addr.lat && addr.lng) {
      setAddressLatLng({ lat: addr.lat, lng: addr.lng });
    } else {
      setAddressLatLng({ lat: null, lng: null });
    }
  }, [selectedAddressId, addresses]);

  // Patient lookup: Supabase primary, then external API fallback
  const lookupPatient = async () => {
    if (!phone.trim()) {
      toast({ title: "Please enter a phone number", status: "warning" });
      return;
    }
    setLookingUp(true);

    try {
      // Supabase lookup
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone.trim())
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Found in Supabase
        setPatient(data);
        setName(data.name || "");
        setDob(data.dob ? data.dob.substr(0, 10) : "");
        setEmail(data.email || "");
        setGender(data.gender || "");

        // Fetch addresses
        const { data: addrData, error: addrError } = await supabase
          .from("patient_addresses")
          .select("*")
          .eq("patient_id", data.id)
          .order("is_default", { ascending: false });

        if (!addrError) {
          setAddresses(addrData || []);
          setSelectedAddressId(addrData?.length > 0 ? addrData[0].id : "");
        } else {
          setAddresses([]);
          setSelectedAddressId("");
          toast({ title: "Failed to load patient addresses", status: "warning" });
        }

        toast({ title: "Patient found. Details loaded." });
      } else {
        // Not in Supabase => fallback to external API proxy
        const resp = await fetch(`/api/patient-lookup?phone=${encodeURIComponent(phone.trim())}`);

        if (!resp.ok) throw new Error(`External API lookup failed: ${resp.statusText}`);
        const json = await resp.json();

        if (Array.isArray(json) && json.length > 0) {
          const exPatient = json[0];
          setPatient(null);
          setName(exPatient.FNAME?.trim() ?? "");
          setDob(exPatient.DOB ? exPatient.DOB.split(" ")[0] : "");
          setEmail(exPatient.EMAIL ?? "");
          setGender(""); // no gender info in external source
          setAddresses([]);
          setSelectedAddressId("");
          toast({ title: "Patient data loaded from external source." });
        } else {
          // Not found anywhere
          setPatient(null);
          setName("");
          setDob("");
          setEmail("");
          setGender("");
          setAddresses([]);
          setSelectedAddressId("");
          toast({ title: "No patient found. Please enter details." });
        }
      }
    } catch (error) {
      toast({ title: "Error looking up patient", status: "error", description: error.message });
    }

    setLookingUp(false);
  };

  // Handle submit: save patient if new or update existing,
  // save address lat/lng if changed,
  // create visit, and add visit details
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !phone.trim() ||
      !name.trim() ||
      !visitDate ||
      !selectedSlotId ||
      !selectedAddressId ||
      selectedTests.size === 0
    ) {
      toast({
        title: "Please fill all required fields and select tests/packages",
        status: "warning",
      });
      return;
    }

    setLoading(true);

    try {
      let patientId = patient?.id;

      if (!patientId) {
        // Insert new patient
        const { data: newPatient, error: newPatientError } = await supabase
          .from("patients")
          .insert([{ phone: phone.trim(), name, dob, email, gender }])
          .select()
          .single();

        if (newPatientError) throw newPatientError;
        patientId = newPatient.id;
      } else {
        // Update patient info
        const { error: updateError } = await supabase
          .from("patients")
          .update({ name, dob, email, gender })
          .eq("id", patientId);

        if (updateError) throw updateError;
      }

      // Save address lat/lng for selected address if changed
      const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
      if (!selectedAddress) {
        toast({ title: "Selected address not found", status: "error" });
        setLoading(false);
        return;
      }

      if (
        (addressLatLng.lat !== selectedAddress.lat) ||
        (addressLatLng.lng !== selectedAddress.lng)
      ) {
        // Update lat/lng in patient_addresses
        const { error: addrUpdateError } = await supabase
          .from("patient_addresses")
          .update({ lat: addressLatLng.lat, lng: addressLatLng.lng })
          .eq("id", selectedAddressId);

        if (addrUpdateError) {
          toast({
            title: "Failed to update address location",
            status: "warning",
          });
          // continue anyway
        } else {
          // Update local addresses state
          setAddresses((prev) =>
            prev.map((addr) =>
              addr.id === selectedAddressId
                ? { ...addr, lat: addressLatLng.lat, lng: addressLatLng.lng }
                : addr
            )
          );
        }
      }

      // Insert visit record
      const { data: visitData, error: visitError } = await supabase
        .from("visits")
        .insert([
          {
            patient_id: patientId,
            visit_date: visitDate,
            time_slot: selectedSlotId,
            address: selectedAddress.label,
            status: "booked",
            executive_id: null,
          },
        ])
        .select()
        .single();

      if (visitError) throw visitError;

      // Insert visit_details for selected tests
      const visitDetailsData = Array.from(selectedTests).map((testId) => ({
        visit_id: visitData.id,
        test_id: testId,
      }));

      if (visitDetailsData.length > 0) {
        const { error: detailsError } = await supabase.from("visit_details").insert(visitDetailsData);
        if (detailsError) throw detailsError;
      }

      toast({ title: "Visit request submitted successfully", status: "success" });

      // Reset form to initial state
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
      setAddressLatLng({ lat: null, lng: null });
    } catch (error) {
      toast({ title: "Failed to submit visit request", status: "error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Google Maps marker drag or map click handler to update lat/lng
  const handleMapClick = (e) => {
    setAddressLatLng({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  // Google Maps marker drag end handler
  const handleMarkerDragEnd = (e) => {
    setAddressLatLng({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  };

  return (
    <Box maxW="md" mx="auto" mt={12} p={6} bg="white" rounded="md" shadow="md">
      <Heading mb={6} textAlign="center">Patient Visit Request</Heading>
      <form onSubmit={handleSubmit}>
        <VStack spacing={4} align="stretch">
          {/* Phone and Lookup */}
          <FormControl isRequired>
            <FormLabel>Phone Number</FormLabel>
            <HStack>
              <Input
                type="tel"
                placeholder="Enter phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                isDisabled={loading || lookingUp}
                aria-label="Patient phone number"
              />
              <Button onClick={lookupPatient} isLoading={lookingUp} aria-label="Lookup patient">
                Lookup
              </Button>
            </HStack>
          </FormControl>

          {/* Patient Details */}
          <FormControl isRequired>
            <FormLabel>Patient Name</FormLabel>
            <Input
              type="text"
              placeholder="Enter patient name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
              placeholder="Enter email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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

          {/* Addresses */}
          <FormControl isRequired>
            <FormLabel>Select Address</FormLabel>
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
            {addresses.length === 0 && (
              <Text fontSize="sm" mt={1} color="gray.500">
                No addresses found. Please add addresses in patient profile before booking.
              </Text>
            )}
          </FormControl>

          {/* Google Maps picker for Selected Address location */}
          <FormControl>
            <FormLabel>Selected Address Location (Drag marker to adjust)</FormLabel>
            {isLoaded ? (
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={
                  addressLatLng.lat && addressLatLng.lng
                    ? addressLatLng
                    : DEFAULT_CENTER
                }
                zoom={addressLatLng.lat && addressLatLng.lng ? 15 : 12}
                onClick={handleMapClick}
                options={{ streetViewControl: false, mapTypeControl: false }}
              >
                {addressLatLng.lat && addressLatLng.lng && (
                  <Marker
                    position={addressLatLng}
                    draggable
                    onDragEnd={handleMarkerDragEnd}
                  />
                )}
              </GoogleMap>
            ) : (
              <Spinner />
            )}
          </FormControl>

          {/* Visit Date */}
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

          {/* Time Slot */}
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

          {/* Tests / Packages */}
          <FormControl isRequired>
            <FormLabel>Select Tests / Packages</FormLabel>
            <Box
              border="1px solid #CBD5E0"
              p={2}
              borderRadius="md"
              maxH="60vh"
              overflowY="auto"
            >
              <TestPackageSelector
                initialSelectedTests={selectedTests}
                onSelectionChange={setSelectedTests}
              />
            </Box>
          </FormControl>

          <Button
            type="submit"
            colorScheme="teal"
            isLoading={loading}
            isDisabled={loading}
          >
            Request Visit
          </Button>
        </VStack>
      </form>
    </Box>
  );
}
