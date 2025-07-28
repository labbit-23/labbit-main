"use client";

import React, { useEffect, useState, useRef } from "react";
import dynamic from "next/dynamic";
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
import TestPackageSelector from "../../components/TestPackageSelector";

const LeafletMap = dynamic(() => import("../../components/LeafletMap"), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const formatDate = (d) => d.toISOString().split("T")[0];
const DEFAULT_CENTER = [17.385, 78.4867];
const MAP_ZOOM = 13;

export default function PatientVisitRequest() {
  const toast = useToast();

  // Form and state variables
  const [phone, setPhone] = useState("");
  const [patient, setPatient] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [latLng, setLatLng] = useState({ lat: null, lng: null });

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

  // Refs to Leaflet map and marker for "Use My Location"
  const mapRef = useRef(null);
  const markerRef = useRef(null);

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

  // Sync lat/lng and address inputs when selectedAddressId changes
  useEffect(() => {
    if (!selectedAddressId) {
      setAddressLabel("");
      setAddressLine("");
      setLatLng({ lat: null, lng: null });
      return;
    }
    const addr = addresses.find((a) => a.id === selectedAddressId);
    if (addr) {
      setAddressLabel(addr.label || "");
      setAddressLine(addr.address_line || "");
      if (addr.lat != null && addr.lng != null) {
        setLatLng({ lat: addr.lat, lng: addr.lng });
      } else {
        setLatLng({ lat: null, lng: null });
      }
    } else {
      setAddressLabel("");
      setAddressLine("");
      setLatLng({ lat: null, lng: null });
    }
  }, [selectedAddressId, addresses]);

  // Receive map and marker instances from LeafletMap component
  const handleMapReady = ({ map, marker }) => {
    mapRef.current = map;
    markerRef.current = marker;
  };

  // Patient lookup Supabase + fallback external API
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
        setPatient(data);
        setName(data.name || "");
        setDob(data.dob ? data.dob.substr(0, 10) : "");
        setEmail(data.email || "");
        setGender(data.gender || "");

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
        // External API fallback
        const resp = await fetch(`/api/patient-lookup?phone=${encodeURIComponent(phone.trim())}`);
        if (!resp.ok) throw new Error(`External API lookup failed: ${resp.statusText}`);

        const json = await resp.json();

        if (Array.isArray(json) && json.length > 0) {
          const exPatient = json[0];
          setPatient(null);
          setName(exPatient.FNAME?.trim() ?? "");
          setDob(exPatient.DOB ? exPatient.DOB.split(" ")[0] : "");
          setEmail(exPatient.EMAIL ?? "");
          setGender("");
          setAddresses([]);
          setSelectedAddressId("");
          setAddressLabel("");
          setAddressLine("");
          setLatLng({ lat: null, lng: null });
          toast({ title: "Patient data loaded from external source." });
        } else {
          setPatient(null);
          setName("");
          setDob("");
          setEmail("");
          setGender("");
          setAddresses([]);
          setSelectedAddressId("");
          setAddressLabel("");
          setAddressLine("");
          setLatLng({ lat: null, lng: null });
          toast({ title: "No patient found. Please enter details." });
        }
      }
    } catch (error) {
      toast({ title: "Error looking up patient", status: "error", description: error.message });
    }
    setLookingUp(false);
  };

  // Submit handler: Create/update patient, update address, create visit, add tests
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !phone.trim() ||
      !name.trim() ||
      !visitDate ||
      !selectedSlotId ||
      !selectedAddressId
    ) {
      toast({ title: "Please fill all required fields", status: "warning" });
      return;
    }

    setLoading(true);

    try {
      let patientId = patient?.id;
      let currentAddresses = [...addresses];

      if (!patientId) {
        // Insert new patient
        const { data: newPatient, error: insertError } = await supabase
          .from("patients")
          .insert([{ phone: phone.trim(), name, dob, email, gender }])
          .select()
          .single();

        if (insertError) throw insertError;

        patientId = newPatient.id;
      } else {
        // Update patient info
        const { error: updateError } = await supabase
          .from("patients")
          .update({ name, dob, email, gender })
          .eq("id", patientId);
        if (updateError) throw updateError;
      }

      // Find selected address and update
      let selectedAddress = currentAddresses.find((a) => a.id === selectedAddressId);

      if (!selectedAddress) {
        toast({ title: "Selected address not found", status: "error" });
        setLoading(false);
        return;
      }

      // Update label and full address line if changed
      if (addressLabel !== selectedAddress.label || addressLine !== selectedAddress.address_line) {
        const { error: addrLabelError } = await supabase
          .from("patient_addresses")
          .update({ label: addressLabel, address_line: addressLine })
          .eq("id", selectedAddressId);

        if (addrLabelError) {
          toast({ title: "Failed to update address label or full address", status: "warning" });
        } else {
          selectedAddress.label = addressLabel;
          selectedAddress.address_line = addressLine;
          setAddresses(currentAddresses);
        }
      }

      // Update lat/lng if changed
      if (latLng.lat !== selectedAddress.lat || latLng.lng !== selectedAddress.lng) {
        const { error: addrLocError } = await supabase
          .from("patient_addresses")
          .update({ lat: latLng.lat, lng: latLng.lng })
          .eq("id", selectedAddressId);

        if (addrLocError) {
          toast({ title: "Failed to update address coordinates", status: "warning" });
        } else {
          selectedAddress.lat = latLng.lat;
          selectedAddress.lng = latLng.lng;
          setAddresses(currentAddresses);
        }
      }

      // Create visit record
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

      // Insert tests if any selected (optional)
      if (selectedTests.size > 0) {
        const visitDetailsInserts = Array.from(selectedTests).map((testId) => ({
          visit_id: visitData.id,
          test_id: testId,
        }));

        const { error: detailsError } = await supabase
          .from("visit_details")
          .insert(visitDetailsInserts);

        if (detailsError) throw detailsError;
      }

      toast({ title: "Visit request submitted successfully", status: "success" });

      // Reset form fields
      setPhone("");
      setPatient(null);
      setName("");
      setDob("");
      setEmail("");
      setGender("");
      setAddresses([]);
      setSelectedAddressId("");
      setAddressLabel("");
      setAddressLine("");
      setVisitDate(formatDate(new Date()));
      setSelectedSlotId("");
      setSelectedTests(new Set());
      setLatLng({ lat: null, lng: null });
    } catch (error) {
      toast({ title: "Failed to submit visit request", status: "error", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  // "Use My Location" button handler
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      toast({ title: "Geolocation not supported", status: "error" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLatLng(userLatLng);

        if (mapRef.current) {
          mapRef.current.setView([userLatLng.lat, userLatLng.lng], 16);
        }
        if (markerRef.current) {
          markerRef.current.setLatLng([userLatLng.lat, userLatLng.lng]);
        }
      },
      () => {
        toast({ title: "Failed to get your location", status: "error" });
      }
    );
  };

  // Map click and marker drag handlers
  const handleMapClick = (e) => {
    setLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
  };

  const handleMarkerDragEnd = (e) => {
    setLatLng({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng });
  };

  // Receives map and marker instances from LeafletMap
  const onMapReady = ({ map, marker }) => {
    mapRef.current = map;
    markerRef.current = marker;
  };

  return (
    <Box maxW="md" mx="auto" mt={12} p={6} bg="white" rounded="md" shadow="md" fontSize="sm">
      <Heading mb={6} textAlign="center">Patient Visit Request</Heading>
      <form onSubmit={handleSubmit}>
        <VStack spacing={4} align="stretch">

          {/* Phone + Lookup */}
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
                autoComplete="tel"
              />
              <Button onClick={lookupPatient} isLoading={lookingUp} aria-label="Lookup patient">
                Lookup
              </Button>
            </HStack>
          </FormControl>

          {/* Patient details */}
          <FormControl isRequired>
            <FormLabel>Patient Name</FormLabel>
            <Input
              type="text"
              placeholder="Enter patient name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              isDisabled={loading}
              aria-label="Patient name"
              autoComplete="name"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Date of Birth</FormLabel>
            <Input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              isDisabled={loading}
              aria-label="Date of Birth"
              autoComplete="bday"
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
              aria-label="Email"
              autoComplete="email"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Gender</FormLabel>
            <Select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              placeholder="Select gender"
              isDisabled={loading}
              aria-label="Gender"
              autoComplete="sex"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </Select>
          </FormControl>

          {/* Address selection */}
          <FormControl isRequired>
            <FormLabel>Select Address</FormLabel>
            <Select
              placeholder="Select saved address"
              value={selectedAddressId}
              onChange={(e) => setSelectedAddressId(e.target.value)}
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
              <Text fontSize="sm" mt={1} color="gray.500" userSelect="none">
                No addresses found. Please add addresses in patient profile before booking.
              </Text>
            )}
          </FormControl>

          {/* Address label input */}
          <FormControl isRequired>
            <FormLabel>Address Label / Description</FormLabel>
            <Input
              placeholder="Enter address label or description"
              value={addressLabel}
              onChange={(e) => setAddressLabel(e.target.value)}
              isDisabled={loading || !selectedAddressId}
              aria-label="Address label or description"
            />
          </FormControl>

          {/* Full Address Line Input */}
          <FormControl>
            <FormLabel>Full Address / Address Line</FormLabel>
            <Input
              placeholder="Enter full address line"
              value={addressLine}
              onChange={(e) => setAddressLine(e.target.value)}
              isDisabled={loading || !selectedAddressId}
              aria-label="Full address line"
            />
          </FormControl>

          {/* Leaflet map */}
          <Box height="300px" border="1px solid #CBD5E0" rounded="md" overflow="hidden" mb={2}>
            <LeafletMap
              center={
                latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : DEFAULT_CENTER
              }
              zoom={latLng.lat && latLng.lng ? 16 : MAP_ZOOM}
              onMapClick={handleMapClick}
              onMarkerDragEnd={handleMarkerDragEnd}
              markerPosition={latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : null}
              onMapReady={handleMapReady}
            />
          </Box>

          <Button size="sm" mb={4} onClick={handleUseMyLocation} isDisabled={loading}>
            Use My Location
          </Button>

          {/* Visit date */}
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

          {/* Time slot */}
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

          {/* Test selection (Optional) */}
          <FormControl>
            <FormLabel>Select Tests / Packages (Optional)</FormLabel>
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

          {/* Submit button */}
          <Button
            type="submit"
            colorScheme="teal"
            isLoading={loading}
            isDisabled={loading}
            aria-label="Submit visit request"
          >
            Request Visit
          </Button>
        </VStack>
      </form>
    </Box>
  );
}
