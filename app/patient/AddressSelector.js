// File: /app/patient/AddressSelector.js

"use client";

import React from "react";
import { VStack, FormControl, FormLabel, Select, Text } from "@chakra-ui/react";
import AddressEditor from "./AddressEditor";

export default function AddressSelector({
  addresses = [],              // Default to empty array
  selectedAddressId,
  setSelectedAddressId,
  addressLabel,
  setAddressLabel,
  addressLine,
  setAddressLine,
  latLng,
  setLatLng,
  loading = false,
}) {
  const hasAddresses = Array.isArray(addresses) && addresses.length > 0;

  return (
    <VStack align="stretch" spacing={4}>
      <FormControl isRequired>
        <FormLabel>Select Address</FormLabel>
        <Select
          placeholder="Select your address"
          value={selectedAddressId || ""}
          onChange={(e) => setSelectedAddressId(e.target.value)}
          isDisabled={loading || !hasAddresses}
          aria-label="Select address"
        >
          {hasAddresses &&
            addresses.map(({ id, label, pincode }) => (
              <option key={id} value={id}>
                {label} {pincode ? `(${pincode})` : ""}
              </option>
            ))}
        </Select>
        {!hasAddresses && (
          <Text fontSize="sm" color="gray.500" mt={1} userSelect="none">
            No saved addresses found. Please add addresses in your profile.
          </Text>
        )}
      </FormControl>

      <AddressEditor
        addressLabel={addressLabel}
        setAddressLabel={setAddressLabel}
        addressLine={addressLine}
        setAddressLine={setAddressLine}
        latLng={latLng}
        setLatLng={setLatLng}
        loading={loading}
      />
    </VStack>
  );
}
