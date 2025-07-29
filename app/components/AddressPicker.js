// app/components/AddressPicker.js
'use client';

import { useState } from 'react';
import { Box, Button, VStack, HStack, useToast, FormLabel } from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';

import LeafletMap from './LeafletMap';

export default function AddressPicker({ onAddressSelect, initialAddress = {} }) {
  const toast = useToast();

  // Handle "Use Current Location"
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Location Access Denied',
        description: 'Geolocation is not supported or disabled.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const addressDetails = await reverseGeocode(latitude, longitude);
        onAddressSelect({ lat: latitude, lng: longitude, ...addressDetails });
        toast({
          title: 'Location Set',
          description: 'Current location set on map.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      },
      (error) => {
        let message = 'An unknown error occurred.';
        if (error.code === error.PERMISSION_DENIED) {
          message = 'Permission denied. Please enable location access.';
        }
        toast({
          title: 'Location Error',
          description: message,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    );
  };

  return (
    <VStack spacing={4} align="stretch" width="100%">
      <FormLabel>Set Location on Map</FormLabel>

      <Box height="300px" width="100%" borderRadius="md" overflow="hidden">
        <LeafletMap
          onLocationSelect={onAddressSelect}
          markerPosition={initialAddress.lat && initialAddress.lng ? [initialAddress.lat, initialAddress.lng] : null}
        />
      </Box>

      <HStack spacing={2}>
        <Button
          leftIcon={<SmallAddIcon />}
          colorScheme="orange"
          onClick={handleUseCurrentLocation}
          size="md"
          flex={1}
        >
          Use Current Location
        </Button>
      </HStack>
    </VStack>
  );
}