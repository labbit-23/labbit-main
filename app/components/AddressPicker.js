// /app/components/AddressPicker.js
'use client';
import React, { useState, useMemo } from 'react';
import { VStack, Button, Text } from '@chakra-ui/react';
import AddressCard from './AddressCard';

export default function AddressPicker({
  addresses = [],
  setAddresses = () => {},
  labels = [],
  onAdd = () => {},
  onEdit = () => {},
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const orderedAddresses = useMemo(() => {
    if (!addresses.length) return [];
    const defaultIndex = addresses.findIndex(a => a.is_default);
    if (defaultIndex === -1) return addresses;
    return [addresses[defaultIndex], ...addresses.filter((_, i) => i !== defaultIndex)];
  }, [addresses]);

  if (!addresses.length) {
    return (
      <VStack spacing={4} maxW="700px" w="full" align="center" p={4}>
        <Text fontStyle="italic" color="gray.500">No addresses available</Text>
        <Button colorScheme="blue" onClick={onAdd}>
          Add Address
        </Button>
      </VStack>
    );
  }

  return (
    <VStack spacing={6} maxW="700px" w="full" align="stretch">
      {orderedAddresses.map((addr, idx) => (
        <AddressCard
          key={addr.id}
          address={addr}
          labels={labels}
          isSelected={idx === selectedIndex}
          isDefault={addr.is_default}
          onSelect={() => setSelectedIndex(idx)}
          onEdit={() => onEdit(addr)}
        />
      ))}
      <Button colorScheme="blue" onClick={onAdd}>
        Add New Address
      </Button>
    </VStack>
  );
}
