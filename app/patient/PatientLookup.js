"use client";

import React, { useState } from "react";
import {
  FormControl,
  FormLabel,
  Input,
  Button,
  HStack,
  useToast,
} from "@chakra-ui/react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function PatientLookup({
  phone,
  setPhone,
  setPatient,
  setAddresses,
  setSelectedAddressId,
  setAddressLabel,
  setAddressLine,
  setLatLng,
}) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const lookup = async () => {
    if (!phone.trim()) {
      toast({ title: "Please enter phone number", status: "warning" });
      return;
    }

    setLoading(true);

    try {
      // 1. Look up patient in Supabase first (local DB)
      const { data: supaData, error: supaError } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone.trim())
        .maybeSingle();

      if (supaError) {
        console.error("Supabase patient query error:", supaError);
        throw supaError;
      }

      if (supaData) {
        // Patient found locally, set patient state and load addresses
        setPatient({
          ...supaData,
          cregno: supaData.cregno || null,
        });

        const { data: addrData, error: addrErr } = await supabase
          .from("patient_addresses")
          .select("*")
          .eq("patient_id", supaData.id)
          .order("is_default", { ascending: false });

        if (!addrErr && Array.isArray(addrData) && addrData.length > 0) {
          setAddresses(addrData);
          setSelectedAddressId(addrData[0].id);
          setAddressLabel(addrData[0].label ?? "");
          setAddressLine(addrData[0].address_line ?? "");
          setLatLng({ lat: addrData[0].lat ?? null, lng: addrData[0].lng ?? null });
        } else {
          setAddresses([]);
          setSelectedAddressId("");
          setAddressLabel("");
          setAddressLine("");
          setLatLng({ lat: null, lng: null });
        }
        setLoading(false);
        return;
      }

      // 2. Not found locally, fallback to external API via your API route proxy
      const url = `/api/patient-lookup?phone=${encodeURIComponent(phone.trim())}`;

      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`External lookup failed: ${text || response.statusText}`);
      }

      const apiData = await response.json();

      if (Array.isArray(apiData)) {
        if (apiData.length === 1) {
          const extPatient = apiData[0];
          setPatient({
            id: null, // no internal id - external record
            name: extPatient.FNAME?.trim() || "",
            phone: phone.trim(),
            dob: extPatient.DOB?.split(" ")[0] || "",
            email: extPatient.EMAIL || "",
            gender: "", // external API does not provide gender
            cregno: extPatient.CREGNO || null,
          });

          // Reset addresses as external API does not provide them
          setAddresses([]);
          setSelectedAddressId("");
          setAddressLabel("");
          setAddressLine("");
          setLatLng({ lat: null, lng: null });

          toast({
            title: `Patient found externally: ${extPatient.FNAME}`,
            status: "info",
            duration: 3000,
            isClosable: true,
          });
        } else if (apiData.length > 1) {
          // Multiple external patients found for this phone, prompt user to refine
          throw new Error(
            "Multiple patients found in external database for this phone number. Please refine your search."
          );
        } else {
          // No external patient found
          setPatient({ id: null, name: "", dob: "", email: "", gender: "", cregno: null });
          setAddresses([]);
          setSelectedAddressId("");
          setAddressLabel("");
          setAddressLine("");
          setLatLng({ lat: null, lng: null });
          toast({ title: "Patient not found", status: "info", duration: 3000, isClosable: true });
        }
      } else {
        throw new Error("Invalid response format from external patient lookup API.");
      }
    } catch (err) {
      toast({
        title: "Lookup failed",
        description: err.message || "Unknown error",
        status: "error",
        duration: 5000,
        isClosable: true,
      });
      console.error("Patient lookup error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <FormControl isRequired>
      <FormLabel>Phone Number</FormLabel>
      <HStack>
        <Input
          type="tel"
          placeholder="Enter phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          isDisabled={loading}
          autoComplete="tel"
          aria-label="Patient phone number"
        />
        <Button onClick={lookup} isLoading={loading} aria-label="Lookup patient">
          Lookup
        </Button>
      </HStack>
    </FormControl>
  );
}
