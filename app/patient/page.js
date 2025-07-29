"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Heading,
  VStack,
  FormControl,
  FormLabel,
  Select,
  Input,
  Button,
  Spinner,
  Text,
  useToast,
  HStack,
} from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";

import PatientLookup from "./PatientLookup";
import PatientDetails from "./PatientDetails";
import AddressEditor from "./AddressEditor"; // Assumes AddressEditor handles map + address inputs
import VisitScheduler from "./VisitScheduler";
import TestPackageSelector from "../../components/TestPackageSelector";

import { savePatientExternalKey } from "../../lib/savePatientExternalKey"; // Import your external key save helper

const DEFAULT_LAB_ID = "b539c161-1e2b-480b-9526-d4b37bd37b1e";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);


const formatDate = (d) => d.toISOString().slice(0, 10);

export default function PatientPage() {
  const toast = useToast();

  // Patient and contact info - including cregno for external key
  const [phone, setPhone] = useState("");
  const [patient, setPatient] = useState({ id: null, name: "", dob: "", email: "", gender: "", cregno: null });

  // Addresses
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  
  // New address flag + inputs
  const [addNewAddressMode, setAddNewAddressMode] = useState(false);
  const [addressLabel, setAddressLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [latLng, setLatLng] = useState({ lat: null, lng: null });

  // Visit scheduling
  const [visitDate, setVisitDate] = useState(formatDate(new Date()));
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");

  // Tests/packages selection (optional)
  const [selectedTests, setSelectedTests] = useState(new Set());

  // Loading states
  const [loading, setLoading] = useState(false);

  // Fetch time slots on mount
  useEffect(() => {
    async function fetchTimeSlots() {
      const { data, error } = await supabase.from("visit_time_slots").select("*").order("start_time");
      if (!error) setTimeSlots(data || []);
    }
    fetchTimeSlots();
  }, []);

  // Handle address selection defaults
  useEffect(() => {
    if (addresses.length > 0) {
      if (!selectedAddressId || !addresses.find(a => a.id === selectedAddressId)) {
        const firstAddr = addresses[0];
        setSelectedAddressId(firstAddr.id);
        setAddressLabel(firstAddr.label ?? "");
        setAddressLine(firstAddr.address_line ?? "");
        setLatLng({ lat: firstAddr.lat ?? null, lng: firstAddr.lng ?? null });
        setAddNewAddressMode(false);
      }
    } else {
      setSelectedAddressId("");
      setAddressLabel("");
      setAddressLine("");
      setLatLng({ lat: null, lng: null });
      setAddNewAddressMode(true);
    }
  }, [addresses, selectedAddressId]);

  const toggleAddNewAddressMode = () => {
    setAddNewAddressMode(!addNewAddressMode);
    if (!addNewAddressMode) {
      setSelectedAddressId("");
      setAddressLabel("");
      setAddressLine("");
      setLatLng({ lat: null, lng: null });
    } else if (addresses.length > 0) {
      const firstAddr = addresses[0];
      setSelectedAddressId(firstAddr.id);
      setAddressLabel(firstAddr.label ?? "");
      setAddressLine(firstAddr.address_line ?? "");
      setLatLng({ lat: firstAddr.lat ?? null, lng: firstAddr.lng ?? null });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!phone.trim() || !patient.name.trim() || !visitDate || !selectedSlotId) {
      toast({ title: "Please fill all required fields", status: "warning" });
      return;
    }

    if (addNewAddressMode) {
      if (!addressLabel.trim() || !addressLine.trim() || !latLng.lat || !latLng.lng) {
        toast({ title: "Please fill all address fields and select location on map", status: "warning" });
        return;
      }
    } else {
      if (!selectedAddressId) {
        toast({ title: "Please select an address or add a new one", status: "warning" });
        return;
      }
    }

    setLoading(true);
    try {
      let patientId = patient.id;

      if (!patientId) {
        // Insert new patient excluding cregno for now 
        // (we'll call helper next to insert external key)
        const { data: newPatient, error } = await supabase
          .from("patients")
          .insert([{
            phone: phone.trim(),
            name: patient.name,
            dob: patient.dob,
            email: patient.email,
            gender: patient.gender,
          }])
          .select()
          .single();
        if (error) throw error;
        patientId = newPatient.id;

        // Save external key into mapping table if cregno present
        if (patient.cregno) {
          await savePatientExternalKey(patientId, DEFAULT_LAB_ID, patient.cregno);
        }

      } else {
        // Update patient info (excluding cregno here)
        const { error } = await supabase
          .from("patients")
          .update({
            name: patient.name,
            dob: patient.dob,
            email: patient.email,
            gender: patient.gender,
          })
          .eq("id", patientId);
        if (error) throw error;

        // Upsert external key in mapping table if cregno present
        if (patient.cregno) {
          await savePatientExternalKey(patientId, DEFAULT_LAB_ID, patient.cregno);
        }
      }

      let addressIdToUse = selectedAddressId;

      if (addNewAddressMode) {
        const { data: newAddr, error } = await supabase
          .from("patient_addresses")
          .insert([{
            patient_id: patientId,
            label: addressLabel,
            address_line: addressLine,
            lat: latLng.lat,
            lng: latLng.lng,
            is_default: false,
          }])
          .select()
          .single();
        if (error) throw error;
        addressIdToUse = newAddr.id;

        setAddresses(prev => [...prev, newAddr]);
        setSelectedAddressId(newAddr.id);
        setAddNewAddressMode(false);
      } else {
        const currentAddress = addresses.find(a => a.id === selectedAddressId);
        if (!currentAddress) throw new Error("Selected address not found.");

        const addrUpdates = {};
        if (currentAddress.label !== addressLabel) addrUpdates.label = addressLabel;
        if (currentAddress.address_line !== addressLine) addrUpdates.address_line = addressLine;
        if (currentAddress.lat !== latLng.lat || currentAddress.lng !== latLng.lng) {
          addrUpdates.lat = latLng.lat;
          addrUpdates.lng = latLng.lng;
        }

        if (Object.keys(addrUpdates).length > 0) {
          const { error } = await supabase
            .from("patient_addresses")
            .update(addrUpdates)
            .eq("id", selectedAddressId);
          if (error) throw error;

          setAddresses(prev => prev.map(addr => addr.id === selectedAddressId ? { ...addr, ...addrUpdates } : addr));
        }
      }

      // Insert visit record
      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .insert([{
          patient_id: patientId,
          visit_date: visitDate,
          time_slot: selectedSlotId,
          address: addressLabel,
          status: "booked",
          executive_id: null,
          lab_id: DEFAULT_LAB_ID,  // Make sure visit is linked to the lab as well.
        }])
        .select()
        .single();
      if (visitError) throw visitError;

      // Insert visit details for selected tests
      if (selectedTests.size > 0) {
        const inserts = Array.from(selectedTests).map(testId => ({ visit_id: visit.id, test_id: testId }));
        const { error } = await supabase.from("visit_details").insert(inserts);
        if (error) throw error;
      }

      toast({ title: "Visit requested successfully", status: "success", duration: 3000 });

      // Reset all form states after submit
      setPhone("");
      setPatient({ id: null, name: "", dob: "", email: "", gender: "", cregno: null });
      setAddresses([]);
      setSelectedAddressId("");
      setAddressLabel("");
      setAddressLine("");
      setLatLng({ lat: null, lng: null });
      setVisitDate(formatDate(new Date()));
      setSelectedSlotId("");
      setSelectedTests(new Set());
      setAddNewAddressMode(false);

    }
    catch (err) {
      toast({ title: "Failed to submit visit", status: "error", description: err.message || "Unknown error" });
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <Box maxW="md" mx="auto" mt={12} p={6} bg="white" rounded="md" shadow="md" fontSize="sm">
      <Heading mb={6} textAlign="center">Patient Visit Request</Heading>
      <form onSubmit={handleSubmit}>
        <VStack spacing={4} align="stretch">

          {/* Patient lookup */}
          <PatientLookup
            phone={phone}
            setPhone={setPhone}
            setPatient={setPatient}
            setAddresses={setAddresses}
            setSelectedAddressId={setSelectedAddressId}
            setAddressLabel={setAddressLabel}
            setAddressLine={setAddressLine}
            setLatLng={setLatLng}
          />

          {/* Patient details form */}
          <PatientDetails patient={patient} setPatient={setPatient} loading={loading} />

          {/* Address selection or add */}
          {!addNewAddressMode ? (
            <>
              <FormControl isRequired>
                <FormLabel>Select Address</FormLabel>
                <Select
                  placeholder="Select saved address"
                  value={selectedAddressId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedAddressId(id);
                    const addr = addresses.find(a => a.id === id);
                    if (addr) {
                      setAddressLabel(addr.label ?? "");
                      setAddressLine(addr.address_line ?? "");
                      setLatLng({ lat: addr.lat ?? null, lng: addr.lng ?? null });
                    }
                  }}
                  isDisabled={loading || addresses.length === 0}
                >
                  {addresses.map(({ id, label, pincode }) => (
                    <option key={id} value={id}>
                      {label} {pincode || ""}
                    </option>
                  ))}
                </Select>
                {addresses.length === 0 && (
                  <Text fontSize="sm" color="gray.500" mt={1}>
                    No addresses found. You can add a new address below.
                  </Text>
                )}
              </FormControl>
              <Button variant="link" colorScheme="blue" size="sm" onClick={() => setAddNewAddressMode(true)} mb={4}>
                + Add New Address
              </Button>
            </>
          ) : (
            <>
              <Button variant="link" colorScheme="blue" size="sm" onClick={() => setAddNewAddressMode(false)} mb={4}>
                ← Back to select saved addresses
              </Button>
              <AddressEditor
                addressLabel={addressLabel}
                setAddressLabel={setAddressLabel}
                addressLine={addressLine}
                setAddressLine={setAddressLine}
                latLng={latLng}
                setLatLng={setLatLng}
                loading={loading}
              />
            </>
          )}

          {/* Visit Schedule */}
          <VisitScheduler
            visitDate={visitDate}
            setVisitDate={setVisitDate}
            timeSlots={timeSlots}
            setTimeSlots={setTimeSlots}
            selectedSlotId={selectedSlotId}
            setSelectedSlotId={setSelectedSlotId}
            loading={loading}
          />

          {/* Tests selection */}
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

          <Button
            type="submit"
            colorScheme="teal"
            isLoading={loading}
            isDisabled={loading}
            mt={4}
          >
            Request Visit
          </Button>

        </VStack>
      </form>
    </Box>
  );
}
