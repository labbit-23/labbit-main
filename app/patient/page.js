"use client";

import React, { useState } from "react";
import {
  Box,
  Heading,
  Input,
  Button,
  VStack,
  FormControl,
  FormLabel,
  Alert,
  AlertIcon,
  useToast,
  HStack,
  Spinner,
} from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PatientPage() {
  const toast = useToast();

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    dob: "",
    email: "",
    state: "",
    district: "",
    pincode: "",
    // Add other fields if necessary
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Lookup in Supabase
  async function lookupPatientInSupabase(phone) {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone)
        .maybeSingle();

      if (error) return null;
      return data;
    } catch {
      return null;
    }
  }

  // Lookup in external API
  async function lookupPatientInExternalAPI(phone) {
    const apiUrl = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_URL;
    const apiKey = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_KEY;
    if (!apiUrl || !apiKey) {
      console.warn("External API URL or key not configured");
      return null;
    }

    const dataParam = encodeURIComponent(JSON.stringify([{ phone: String(phone) }]));
    const url = `/api/patient-lookup?phone=${encodeURIComponent(phone)}`;

    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        console.error(`External API responded with status ${res.status}`);
        return null;
      }

      const json = await res.json();
      if (!Array.isArray(json) || json.length === 0) return null;

      const patientData = json[0];

      return {
        name: patientData.FNAME?.trim() ?? "",
        dob: patientData.DOB ? patientData.DOB.split(" ")[0] : "",
        email: patientData.EMAIL ?? "",
        pincode: patientData.PINCODE ?? "",
        state: patientData.STATENEW ?? "",
        district: patientData.DISTRICTNEW ?? "",
      };
    } catch (e) {
      console.error("External patient lookup failed:", e);
      return null;
    }
  }

  // Perform lookup on button click or onBlur if you want
  const handleLookup = async () => {
    const phone = formData.phone.trim();
    if (!phone) {
      toast({
        title: "Please enter a phone number",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Try Supabase lookup first
    let patient = await lookupPatientInSupabase(phone);

    // 2. If not found in Supabase, try external API
    if (!patient) {
      patient = await lookupPatientInExternalAPI(phone);
    }

    if (patient) {
      setFormData((prev) => ({
        ...prev,
        name: patient.name || "",
        dob: patient.dob || "",
        email: patient.email || "",
        state: patient.state || "",
        district: patient.district || "",
        pincode: patient.pincode || "",
        phone,
      }));
      toast({
        title: "Patient data loaded",
        description: "Form auto-filled with existing patient data.",
        status: "success",
        duration: 3000,
        isClosable: true,
      });
    } else {
      toast({
        title: "Patient not found",
        description: "Please enter the patient details manually.",
        status: "info",
        duration: 3000,
        isClosable: true,
      });
      // Optionally clear other input fields except phone here
    }

    setLoading(false);
  };

  // Handle field changes
  const handleChange = (field) => (e) => {
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  // Handle form submission (replace with your own logic)
  const handleSubmit = (e) => {
    e.preventDefault();
    // Insert or update patient logic here
    console.log("Submitting patient data:", formData);
  };

  return (
    <Box maxW="md" mx="auto" mt={12} p={6} bg="white" rounded="md" shadow="md">
      <Heading mb={6} textAlign="center">
        Patient Lookup & Registration
      </Heading>

      <form onSubmit={handleSubmit}>
        <VStack spacing={4} align="stretch">
          <FormControl isRequired>
            <FormLabel>Phone Number</FormLabel>
            <HStack>
              <Input
                type="tel"
                placeholder="Enter phone number"
                value={formData.phone}
                onChange={handleChange("phone")}
                isDisabled={loading}
                autoComplete="tel"
                aria-label="Patient phone number"
              />
              <Button
                onClick={handleLookup}
                isLoading={loading}
                colorScheme="blue"
                aria-label="Lookup patient"
              >
                Lookup
              </Button>
            </HStack>
          </FormControl>

          <FormControl isRequired>
            <FormLabel>Name</FormLabel>
            <Input
              type="text"
              placeholder="Patient name"
              value={formData.name}
              onChange={handleChange("name")}
              isDisabled={loading}
              autoComplete="name"
              aria-label="Patient name"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Date of Birth</FormLabel>
            <Input
              type="date"
              value={formData.dob}
              onChange={handleChange("dob")}
              isDisabled={loading}
              aria-label="Patient date of birth"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Email</FormLabel>
            <Input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange("email")}
              isDisabled={loading}
              autoComplete="email"
              aria-label="Patient email"
            />
          </FormControl>

          <FormControl>
            <FormLabel>State</FormLabel>
            <Input
              type="text"
              placeholder="State"
              value={formData.state}
              onChange={handleChange("state")}
              isDisabled={loading}
              aria-label="Patient state"
            />
          </FormControl>

          <FormControl>
            <FormLabel>District</FormLabel>
            <Input
              type="text"
              placeholder="District"
              value={formData.district}
              onChange={handleChange("district")}
              isDisabled={loading}
              aria-label="Patient district"
            />
          </FormControl>

          <FormControl>
            <FormLabel>Pincode</FormLabel>
            <Input
              type="text"
              placeholder="Pincode"
              value={formData.pincode}
              onChange={handleChange("pincode")}
              isDisabled={loading}
              aria-label="Patient pincode"
            />
          </FormControl>

          {/* Additional fields can go here */}

          <Button type="submit" colorScheme="teal" isLoading={loading}>
            Save Patient
          </Button>
        </VStack>
      </form>

      {error && (
        <Alert mt={4} status="error" borderRadius="md">
          <AlertIcon />
          {error}
        </Alert>
      )}
    </Box>
  );
}
