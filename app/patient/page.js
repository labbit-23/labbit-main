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
    // add other patient fields as needed
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Lookup patient in Supabase by phone
  async function lookupPatientInSupabase(phone) {
    try {
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone)
        .single();

      if (error) return null;
      return data;
    } catch {
      return null;
    }
  }

  // Lookup patient in external API using API URL & key from env vars
  async function lookupPatientInExternalAPI(phone) {
    const apiUrl = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_URL;
    const apiKey = process.env.NEXT_PUBLIC_PATIENT_LOOKUP_KEY;
    if (!apiUrl || !apiKey) {
      console.warn("External API URL or key not configured");
      return null;
    }

    const dataParam = encodeURIComponent(JSON.stringify([{ phone }]));
    const url = `${apiUrl}&data=${dataParam}`;

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

  // Handler to lookup patient by phone input value
  const handleLookup = async () => {
    const phone = formData.phone.trim();
    if (!phone) {
      toast({
        title: "Please enter phone number",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setLoading(true);
    setError(null);

    // 1. Try Supabase lookup
    let patient = await lookupPatientInSupabase(phone);

    // 2. If not in Supabase, lookup with external API
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
        description: "Existing data has been auto-filled.",
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
      // Optionally reset other fields except phone:
      // setFormData({ ...formData, name: "", dob: "", ... });
    }

    setLoading(false);
  };

  // Simple form handler for controlled inputs
  const handleChange = (field) => (e) => {
    setFormData((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  // Form submit handler (you may replace with your own creation code)
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitting patient data:", formData);
    // Add your create/update logic here
  };

  return (
    <Box maxW="md" mx="auto" p={6} bg="white" rounded="md" shadow="md">
      <Heading mb={6} textAlign="center">
        Patient Lookup & Creation
      </Heading>

      <form onSubmit={handleSubmit}>
        <VStack spacing={4} align="stretch">
          <FormControl isRequired>
            <FormLabel>Phone Number</FormLabel>
            <Input
              type="tel"
              placeholder="Enter phone number"
              value={formData.phone}
              onChange={handleChange("phone")}
              onBlur={handleLookup} // Lookup on blur, or you can add a button instead
              isDisabled={loading}
              autoComplete="tel"
            />
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
            />
          </FormControl>

          <FormControl>
            <FormLabel>Date of Birth</FormLabel>
            <Input
              type="date"
              placeholder="Date of Birth"
              value={formData.dob}
              onChange={handleChange("dob")}
              isDisabled={loading}
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
            />
          </FormControl>

          {/* Other patient form fields here */}

          <Button colorScheme="teal" type="submit" isLoading={loading}>
            Save Patient
          </Button>
        </VStack>
      </form>

      {error && (
        <Alert status="error" mt={4} borderRadius="md">
          <AlertIcon />
          {error}
        </Alert>
      )}
    </Box>
  );
}
