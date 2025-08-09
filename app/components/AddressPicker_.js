// File: /app/components/AddressPicker.js
'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  VStack,
  HStack,
  Button,
  Input,
  Box,
  Text,
  useToast,
  IconButton,
  FormControl,
  FormLabel,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import { DeleteIcon, AddIcon, ChevronDownIcon } from '@chakra-ui/icons';

// Lazy load LeafletMap to avoid SSR issues
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

// Helper: Default Hyderabad coordinates — map centers here if no location provided
const HYDERABAD_COORDS = { lat: 17.385, lng: 78.486 };

/**
 * AddressSearch component for autocomplete
 * Props:
 *  - onSelect(item): callback with selected item
 *  - at: string "lat,lng" for geosearch bias
 */
function AddressSearch1({ onSelect, at }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const abortController = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    if (abortController.current) abortController.current.abort();
    abortController.current = new AbortController();

    (async () => {
      try {
        const params = new URLSearchParams({ q: query.trim(), at: at || '17.385,78.486' });
        const res = await fetch(`/api/nextbillion/search?${params.toString()}`, {
          signal: abortController.current.signal,
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(data.items || []);
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('Address autocomplete error:', err);
          setResults([]);
        }
      }
    })();

    return () => {
      abortController.current?.abort();
    };
  }, [query, at]);

  const handleSelect = (item) => {
    setQuery(item.title);
    setResults([]);
    onSelect(item);
    setIsFocused(false);
  };

  return (
    <Box position="relative" width="100%" mt={3}>
      <Input
        placeholder="Search for address or landmark"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        autoComplete="off"
      />
      {isFocused && results.length > 0 && (
        <Box
          as="ul"
          marginTop="2"
          position="absolute"
          bg="white"
          border="1px solid #ddd"
          borderRadius="md"
          width="100%"
          maxHeight="160px"
          overflowY="auto"
          zIndex={1000}
          padding="0"
          style={{ listStyle: 'none' }}
        >
          {results.map((item) => (
            <Box
              as="li"
              key={item.id}
              padding="2"
              cursor="pointer"
              _hover={{ bg: 'gray.100' }}
              onMouseDown={() => handleSelect(item)}
            >
              <Text fontWeight="medium">{item.title}</Text>
              {item.address?.label && (
                <Text fontSize="sm" color="gray.600">
                  {item.address.label}
                </Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * AddressPicker component for editing multiple addresses with map integration
 * Props:
 *  - addresses: Array of address objects [{ id, label, address_line, etc. }]
 *  - setAddresses: Setter function for addresses
 *  - labels: Array of valid labels for selection/autocomplete
 */
export default function AddressPicker({
  addresses = [],
  setAddresses = () => {},
  labels = [],
}) {
  const toast = useToast();

  // Sort addresses with default flagged first; no default means no reordering
  const orderedAddresses = React.useMemo(() => {
    if (!addresses || addresses.length === 0) {
      // No default pre-fill; map shows Hyderabad location but form fields empty
      return [];
    }
    const defaultIndex = addresses.findIndex((addr) => addr.is_default === true);
    if (defaultIndex === -1) return addresses;
    return [addresses[defaultIndex], ...addresses.filter((_, idx) => idx !== defaultIndex)];
  }, [addresses]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [labelInput, setLabelInput] = useState('');

  // Update labelInput when selection changes
  useEffect(() => {
    if (orderedAddresses.length === 0) {
      setSelectedIndex(0);
      setLabelInput('');
    } else {
      if (selectedIndex >= orderedAddresses.length) setSelectedIndex(0);
      setLabelInput(orderedAddresses[selectedIndex]?.label || '');
    }
  }, [orderedAddresses, selectedIndex]);

  const selectedAddress = orderedAddresses[selectedIndex] || null;

  // Find index in original addresses array by id
  const originalIndex = React.useMemo(() => {
    return addresses.findIndex((addr) => addr.id === selectedAddress?.id);
  }, [addresses, selectedAddress]);

  // Update selected address field in addresses array and labelInput state
  const updateSelectedAddressField = (field, value) => {
    setAddresses((prev) => {
      const newAddresses = [...prev];
      if (originalIndex === -1) {
        const newAddr = { ...selectedAddress, [field]: value };
        newAddresses.push(newAddr);
      } else {
        newAddresses[originalIndex] = { ...newAddresses[originalIndex], [field]: value };
      }
      return newAddresses;
    });

    if (field === 'label') {
      setLabelInput(value);
    }
  };

  // Handle label input change (editable combo box)
  const handleLabelInputChange = (e) => {
    updateSelectedAddressField('label', e.target.value);
  };

  // Select label from dropdown menu
  const handleLabelSelect = (val) => {
    updateSelectedAddressField('label', val);
  };

  // Reverse geocode on map marker movement
  const updateLocation = async (lat, lng) => {
    try {
      const res = await fetch(`/api/nextbillion/reverse-geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) throw new Error('Reverse geocode failed');
      const data = await res.json();

      const newAddressLine = data.features?.[0]?.properties?.label || '';
      const newPincode = data.features?.[0]?.properties?.postal_code || '';

      updateSelectedAddressField('lat', lat);
      updateSelectedAddressField('lng', lng);

      // Update address line only if empty to not overwrite manual input
      if (!selectedAddress?.address_line || selectedAddress.address_line.trim() === '') {
        updateSelectedAddressField('address_line', newAddressLine);
      }
      updateSelectedAddressField('pincode', newPincode);
    } catch (err) {
      toast({
        title: 'Reverse geocode failed',
        description: 'Could not update address fields from map',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      updateSelectedAddressField('lat', lat);
      updateSelectedAddressField('lng', lng);
    }
  };

  // Autocomplete address selection
  const onAutocompleteSelect = (item) => {
    if (!item?.position) return;
    const { lat, lng } = item.position;

    setAddresses((prev) => {
      const newAddresses = [...prev];
      if (originalIndex === -1) {
        // new address
        newAddresses.push({
          ...selectedAddress,
          lat,
          lng,
          address_line: item.title || '',
          pincode: item.address?.postalCode || '',
        });
      } else {
        newAddresses[originalIndex] = {
          ...newAddresses[originalIndex],
          lat,
          lng,
          address_line: item.title || '',
          pincode: item.address?.postalCode || '',
        };
      }
      return newAddresses;
    });
  };

  // Use browser geolocation for current location
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: 'Geolocation not supported',
        description: 'Your browser does not support location services.',
        status: 'warning',
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        updateLocation(latitude, longitude);
        toast({
          title: 'Location set',
          description: 'Your current location has been set for this address.',
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      },
      (error) => {
        toast({
          title: 'Failed to get location',
          description: error.message || 'Permission denied or unavailable.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    );
  };

  // Add new blank address
  const addAddress = () => {
    const newAddress = {
      id: `temp-${Date.now()}`,
      label: '',
      address_line: '',
      pincode: '',
      city: '',
      state: '',
      country: '',
      lat: HYDERABAD_COORDS.lat,
      lng: HYDERABAD_COORDS.lng,
      is_default: false,
    };
    setAddresses((prev) => [...prev, newAddress]);
    setSelectedIndex(orderedAddresses.length); // select newly added address
  };

  // Delete selected address
  const deleteAddress = () => {
    if (!selectedAddress) return;
    setAddresses((prev) => {
      if (originalIndex === -1) return prev;
      const filtered = prev.filter((_, i) => i !== originalIndex);
      return filtered;
    });
    setSelectedIndex(0);
  };

  return (
    <VStack spacing={6} w="full" maxW="700px" mx="auto" p={4} borderWidth="1px" borderRadius="md" align="flex-start">
      <FormControl>
        <FormLabel>Address Label</FormLabel>
        <Menu>
          {({ isOpen }) => (
            <>
              <HStack spacing={2}>
                <Input
                  placeholder="Type or select a label"
                  value={labelInput}
                  onChange={handleLabelInputChange}
                  autoComplete="off"
                />
                <MenuButton 
                  as={IconButton} 
                  aria-label="Select label" 
                  icon={<ChevronDownIcon />} 
                  size="md" 
                />
                <IconButton 
                  aria-label="Add new address" 
                  icon={<AddIcon />} 
                  colorScheme="blue" 
                  size="md" 
                  onClick={addAddress} 
                />
                <IconButton 
                  aria-label="Delete selected address" 
                  icon={<DeleteIcon />} 
                  colorScheme="red" 
                  size="md" 
                  onClick={deleteAddress} 
                  isDisabled={!selectedAddress}
                />
              </HStack>

              {isOpen && labels.length > 0 && (
                <MenuList maxHeight="160px" overflowY="auto" zIndex={1000}>
                  {labels.map((label, idx) => (
                    <MenuItem
                      key={idx}
                      onClick={() => handleLabelSelect(label)}
                      bg={label === labelInput ? 'blue.100' : 'white'}
                    >
                      {label}
                    </MenuItem>
                  ))}
                </MenuList>
              )}
            </>
          )}
        </Menu>
      </FormControl>

      <HStack mb={2} w="full">
        <Input
          placeholder="Address Line"
          flex={3}
          value={selectedAddress?.address_line ?? ''}
          onChange={handleInputChange('address_line')}
        />
        <Input
          placeholder="Pincode"
          flex={1}
          value={selectedAddress?.pincode ?? ''}
          onChange={handleInputChange('pincode')}
        />
      </HStack>

      <HStack mb={2} w="full">
        <Input
          placeholder="City"
          value={selectedAddress?.city ?? ''}
          onChange={handleInputChange('city')}
        />
        <Input
          placeholder="State"
          value={selectedAddress?.state ?? ''}
          onChange={handleInputChange('state')}
        />
        <Input
          placeholder="Country"
          value={selectedAddress?.country ?? ''}
          onChange={handleInputChange('country')}
        />
      </HStack>

      <Box height="300px" width="100%" borderRadius="md" overflow="hidden" mb={3}>
        <LeafletMap
          markerPosition={[
            selectedAddress?.lat ?? HYDERABAD_COORDS.lat,
            selectedAddress?.lng ?? HYDERABAD_COORDS.lng,
          ]}
          onLocationChange={updateLocation}
        />
      </Box>

      <AddressSearch
        onSelect={onAutocompleteSelect}
        at={`${selectedAddress?.lat ?? HYDERABAD_COORDS.lat},${selectedAddress?.lng ?? HYDERABAD_COORDS.lng}`}
      />

      <Button
        onClick={handleUseCurrentLocation}
        leftIcon={<AddIcon />}
        colorScheme="blue"
        mt={2}
        w="full"
      >
        Use My Location
      </Button>
    </VStack>
  );

  // Utility for handling input changes for address fields
  function handleInputChange(field) {
    return (e) => updateSelectedAddressField(field, e.target.value);
  }
}
