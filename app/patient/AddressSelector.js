"use client";

import React from "react";
import { VStack, FormControl, FormLabel, Select, Text } from "@chakra-ui/react";
import AddressEditor from "./AddressEditor";

export default function AddressSelector({
  addresses,
  selectedAddressId,
  setSelectedAddressId,
  addressLabel,
  setAddressLabel,
  addressLine,
  setAddressLine,
  latLng,
  setLatLng,
  loading,
}) {
  return (
    <VStack align="stretch" spacing={4}>
      <FormControl isRequired>
        <FormLabel>Select Address</FormLabel>
        <Select
          placeholder="Select your address"
          value={selectedAddressId}
          onChange={(e) => setSelectedAddressId(e.target.value)}
          isDisabled={loading || addresses.length === 0}
          aria-label="Select address"
        >
          {addresses.map(({ id, label, pincode }) => (
            <option key={id} value={id}>
              {label} {pincode ? `(${pincode})` : ""}
            </option>
          ))}
        </Select>
        {addresses.length === 0 && (
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
