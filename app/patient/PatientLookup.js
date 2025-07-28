"use client";

import React, { useState } from "react";
import { FormControl, FormLabel, Input, Button, HStack, useToast } from "@chakra-ui/react";
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
      const { data, error } = await supabase
        .from("patients")
        .select("*")
        .eq("phone", phone.trim())
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPatient(data);

        const { data: addrData, error: addrErr } = await supabase
          .from("patient_addresses")
          .select("*")
          .eq("patient_id", data.id)
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
      } else {
        toast({ title: "Patient not found", status: "info" });
        setPatient({ id: null, name: "", dob: "", email: "", gender: "" });
        setAddresses([]);
        setSelectedAddressId("");
        setAddressLabel("");
        setAddressLine("");
        setLatLng({ lat: null, lng: null });
      }
    } catch (e) {
      toast({ title: "Lookup failed", description: e.message || "Unknown error", status: "error" });
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
