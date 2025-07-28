"use client";

import React, { useState } from "react";
import { Box, Heading, VStack, Button, useToast } from "@chakra-ui/react";

import PatientLookup from "./PatientLookup";
import PatientDetails from "./PatientDetails";
import AddressSelector from "./AddressSelector";
import VisitScheduler from "./VisitScheduler";

import TestSelector from "../../components/TestPackageSelector"; // Adjust path if needed
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PatientPage() {
  const toast = useToast();

  // Initialize state with safe defaults
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

  const handleSubmit = async (e) => {
    e.preventDefault();
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

      let addressUpdates = {};
      if (currentAddress.label !== addressLabel) {
        addressUpdates.label = addressLabel;
      }
      if (currentAddress.address_line !== addressLine) {
        addressUpdates.address_line = addressLine;
      }
      if (
        currentAddress.lat !== latLng.lat ||
        currentAddress.lng !== latLng.lng
      ) {
        addressUpdates.lat = latLng.lat;
        addressUpdates.lng = latLng.lng;
      }
      if (Object.keys(addressUpdates).length > 0) {
        const { error } = await supabase
          .from("patient_addresses")
          .update(addressUpdates)
          .eq("id", selectedAddressId);

        if (error) {
          toast({ title: "Failed to update address", status: "warning" });
        } else {
          setAddresses((prev) =>
            prev.map((addr) =>
              addr.id === selectedAddressId ? { ...addr, ...addressUpdates } : addr
            )
          );
        }
      }

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

      // Reset all states
      setPhone("");
      setPatient({ id: null, name: "", dob: "", email: "", gender: "" });
      setAddresses([]);
      setSelectedAddressId("");
      setAddressLabel("");
      setAddressLine("");
      setLatLng({ lat: null, lng: null });
      setVisitDate("");
      setTimeSlots([]);
      setSelectedSlotId("");
      setSelectedTests(new Set());
    } catch (err) {
      toast({
        title: "Failed to submit visit request",
        status: "error",
        description: err.message,
        duration: 6000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box maxW={{ base: "95%", md: "md" }} mx="auto" mt={8} p={6} bg="white" rounded="md" shadow="md">
      <Heading mb={6} textAlign="center" fontSize={{ base: "xl", md: "2xl" }}>
        Patient Visit Request
      </Heading>
      <form onSubmit={handleSubmit}>
        <VStack spacing={6} align="stretch">
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
          <PatientDetails patient={patient} setPatient={setPatient} loading={loading} />
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
          <VisitScheduler
            visitDate={visitDate}
            setVisitDate={setVisitDate}
            timeSlots={timeSlots}
            setTimeSlots={setTimeSlots}
            selectedSlotId={selectedSlotId}
            setSelectedSlotId={setSelectedSlotId}
            loading={loading}
          />
          <TestSelector
            selectedTests={selectedTests}
            setSelectedTests={setSelectedTests}
            loading={loading}
          />
          <Button isLoading={loading} type="submit" colorScheme="teal" size="lg">
            Request Visit
          </Button>
        </VStack>
      </form>
    </Box>
  );
}
