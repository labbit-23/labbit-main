//app/test-map/page.js
'use client';

import { useState, useEffect } from 'react';
import { Box, VStack, Button, Text, useToast } from '@chakra-ui/react';
import AddressWrapper from './AddressWrapper';

export default function TestPage() {
  const [address, setAddress] = useState({
    lat: 17.385,
    lng: 78.486,
    address_line: '',
    pincode: ''
  });

  const toast = useToast();

  useEffect(() => {
    // Simulate existing data load
    const saved = {
      lat: 17.4926,
      lng: 78.4204,
      address_line: '8-2-93/82, Sainikpuri, Hyderabad',
      pincode: '500077'
    };
    setAddress(saved);
  }, []);

  const save = () => {
    console.log('Saving patient address:', address);
    toast({description: 'Address saved', status: 'success'});
  };

  return (
    <Box maxW="700px" mx="auto" padding={6}>
      <VStack spacing={6} align="stretch">
        <Text fontSize="2xl" fontWeight="bold">Address Picker Test</Text>
        <AddressWrapper address={address} setAddress={setAddress} />
        <Button colorScheme="blue" onClick={save}>Save</Button>
      </VStack>
    </Box>
  );
}
