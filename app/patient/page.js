"use client";

import React, { useState } from "react";
import { Box, Heading, VStack, Button, useToast } from "@chakra-ui/react";

import PatientLookup from "./PatientLookup";
import PatientDetails from "./PatientDetails";
import AddressSelector from "./AddressSelector";
import VisitScheduler from "./VisitScheduler";
import TestPackageSelector from "../../components/TestPackageSelector";

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PatientPage() {
  const toast = useToast();

  // Centralized state for the entire flow
  const [phone, setPhone] = useState("");

  const [patient, setPatient] = useState({
    id: null,
    name: "",
    dob: "",
    email: "",
    gender: "",
  });

  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [latLng, setLatLng] = useState({ lat: null, lng: null });

  const [visitDate, setVisitDate] = useState("");
  const [timeSlots, setTimeSlots] = useState([]);
  const [selectedSlotId, setSelectedSlotId] = useState("");

  const [selectedTests, setSelectedTests] = useState(new Set());

  const [loading, setLoading] = useState(false);

  // Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    // Basic validation
    if (
      !phone.trim() ||
      !patient.name.trim() ||
      !selectedAddressId ||
      !visitDate ||
      !selectedSlotId
    ) {
      toast({
        title: "Please fill all required fields",
        status: "warning",
        duration: 3000,
      });
      return;
    }

    setLoading(true);

    try {
      let patientId = patient.id;

      // Insert new patient if not exists
      if (!patientId) {
        const { data: newPatient, error } = await supabase
          .from("patients")
          .insert([
            {
              phone: phone.trim(),
              name: patient.name,
              dob: patient.dob,
              email: patient.email,
              gender: patient.gender,
            },
          ])
          .select()
          .single();

        if (error) throw error;
        patientId = newPatient.id;
      } else {
        // Update existing patient info
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
      }

      // Find current address object
      const currentAddress = addresses.find((a) => a.id === selectedAddressId);
      if (!currentAddress) {
        toast({
          title: "Selected address not found",
          status: "error",
          duration: 3000,
        });
        setLoading(false);
        return;
      }

      // Update address info if changed
      let addrUpdates = {};
      if (currentAddress.label !== addressLabel) {
        addrUpdates.label = addressLabel;
      }
      if (currentAddress.address_line !== addressLine) {
        addrUpdates.address_line = addressLine;
      }
      if (
        currentAddress.lat !== latLng.lat ||
        currentAddress.lng !== latLng.lng
      ) {
        addrUpdates.lat = latLng.lat;
        addrUpdates.lng = latLng.lng;
      }

      if (Object.keys(addrUpdates).length > 0) {
        const { error } = await supabase
          .from("patient_addresses")
          .update(addrUpdates)
          .eq("id", selectedAddressId);

        if (error) {
          toast({
            title: "Failed to update address",
            status: "warning",
          });
        } else {
          // Update local state for addresses with latest data
          setAddresses((prev) =>
            prev.map((addr) =>
              addr.id === selectedAddressId ? { ...addr, ...addrUpdates } : addr
            )
          );
        }
      }

      // Insert visit record
      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .insert([
          {
            patient_id: patientId,
            visit_date: visitDate,
            time_slot: selectedSlotId,
            address: addressLabel,
            status: "booked",
            executive_id: null,
          },
        ])
        .select()
        .single();

      if (visitError) throw visitError;

      // Insert visit details if any tests selected
      if (selectedTests.size > 0) {
        const inserts = Array.from(selectedTests).map((testId) => ({
          visit_id: visit.id,
          test_id: testId,
        }));
        const { error } = await supabase
          .from("visit_details")
          .insert(inserts);

        if (error) throw error;
      }

      toast({
        title: "Visit requested successfully",
        status: "success",
        duration: 3000,
      });

      // Clear form
      setPhone("");
      setPatient({ id: null, name: "", dob: "", email: "", gender: "" });
      setAddresses([]);
      setSelectedAddressId("");
      setAddressLabel("");
      setAddressLine("");
      setLatLng({ lat: null, lng: null });
      setVisitDate("");
      setSelectedSlotId("");
      setSelectedTests(new Set());
    } catch (error) {
      toast({
        title: "Failed to submit visit",
        description: error.message,
        status: "error",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Address update logic if you want a separate Update Address button (optional to add)

  return (
    <Box maxW={{ base: "100%", md: "md" }} mx="auto" mt={6} p={6} bg="white" rounded="md" shadow="md">
      <Heading mb={6} fontSize={{ base: "xl", md: "2xl" }}>
        Patient Visit Request
      </Heading>
      <form onSubmit={handleSubmit}>
        <VStack spacing={6} align="stretch">

          {/* Patient phone lookup */}
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

          {/* Patient Details */}
          <PatientDetails patient={patient} setPatient={setPatient} loading={loading} />

          {/* Address Selector & Editor */}
          <AddressSelector
            addresses={addresses}
            selectedAddressId={selectedAddressId}
            setSelectedAddressId={setSelectedAddressId}
            addressLabel={addressLabel}
            setAddressLabel={setAddressLabel}
            addressLine={addressLine}
            setAddressLine={setAddressLine}
            latLng={latLng}
            setLatLng={setLatLng}
            loading={loading}
          />

          {/* Visit Scheduling */}
          <VisitScheduler
            visitDate={visitDate}
            setVisitDate={setVisitDate}
            timeSlots={timeSlots}
            setTimeSlots={setTimeSlots}
            selectedSlotId={selectedSlotId}
            setSelectedSlotId={setSelectedSlotId}
            loading={loading}
          />

          {/* Test Selector */}
          <TestSelector
            selectedTests={selectedTests}
            setSelectedTests={setSelectedTests}
            loading={loading}
          />

          {/* Submit Button */}
          <Button isLoading={loading} type="submit" colorScheme="teal" size="lg">
            Request Visit
          </Button>
        </VStack>
      </form>
    </Box>
  );
}
