//app/components/AddressManager.js
import React, { useEffect, useState } from 'react';
import { VStack, Text } from '@chakra-ui/react';
import AddressPicker from './AddressPicker';

export default function AddressManager({ patientId, onChange }) {
  const [addresses, setAddresses] = useState([]);
  const [labels, setLabels] = useState([]);

    useEffect(() => {
    if (!patientId) {
        setLabels([]);
        return;
    }
    fetch(`/api/patients/address_labels?patient_id=${patientId}`)
        .then(res => res.json())
        .then(data => setLabels(Array.isArray(data) ? data : []))
        .catch(() => setLabels([]));
    }, [patientId]);

  useEffect(() => {
    if (!patientId) {
      setAddresses([]);
      onChange?.([]);
      return;
    }
    fetch(`/api/patients/addresses?patient_id=${patientId}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setAddresses(data);
          onChange?.(data);
        } else {
          const defaultAddr = {
            id: 'temp-default',
            label: 'Default',
            address_line: '',
            pincode: '',
            city: '',
            state: '',
            country: '',
            lat: 17.385,
            lng: 78.486,
          };
          setAddresses([defaultAddr]);
          onChange?.([defaultAddr]);
        }
      })
      .catch(() => {
        setAddresses([]);
        onChange?.([]);
      });
  }, [patientId, onChange]);

  const handleSetAddresses = (arr) => {
    setAddresses(arr);
    onChange?.(arr);
  };

  return (
    <VStack spacing={4} maxH="440px" overflowY="auto">
      <AddressPicker
        addresses={addresses}
        setAddresses={handleSetAddresses}
        labels={labels}
      />
      {addresses.length === 0 && (
        <Text color="gray.500" fontStyle="italic" textAlign="center">
          No addresses available.
        </Text>
      )}
    </VStack>
  );
}
