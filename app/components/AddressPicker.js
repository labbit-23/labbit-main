//app/components/AddressPicker.js
'use client';

import React, { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  VStack,
  HStack,
  Button,
  Input,
  Box,
  Select,
  Text,
  useToast,
} from '@chakra-ui/react';
import { SmallAddIcon, DeleteIcon } from '@chakra-ui/icons';

// Lazy load LeafletMap - no SSR to avoid server rendering issues
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

/**
 * Address search autocomplete component.
 * Props:
 *  - onSelect: function(selectedItem)
 *  - at: string of lat,lng to bias results.
 */
function AddressSearch({ onSelect, at }) {
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
    <Box position="relative" width="100%">
      <Input
        placeholder="Search for address or landmark"
        value={query}
        onChange={e => setQuery(e.target.value)}
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
          {results.map(item => (
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
                <Text fontSize="sm" color="gray.600">{item.address.label}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

/**
 * AddressPicker component for editing addresses.
 * Props:
 *  - addresses: array of address objects
 *  - setAddresses: setter function for addresses array
 *  - labels: array of possible labels
 */
export default function AddressPicker({ addresses = [], setAddresses = () => {}, labels = [] }) {
  const toast = useToast();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [labelOptions, setLabelOptions] = useState(labels);

  useEffect(() => {
    setLabelOptions(labels.length > 0 ? labels : ['Default']);
  }, [labels]);

  // Defensive: ensure selectedIndex is within bounds
  useEffect(() => {
    if (selectedIndex >= addresses.length) {
      setSelectedIndex(addresses.length > 0 ? addresses.length - 1 : 0);
    }
  }, [addresses, selectedIndex]);

  // Current selected address or fallback
  const selectedAddress = addresses[selectedIndex] || {
    id: 'temp-0',
    label: 'Default',
    address_line: '',
    pincode: '',
    city: '',
    state: '',
    country: '',
    lat: 17.385,
    lng: 78.486,
  };

  // Update field handler
  const updateField = (field) => (e) => {
    const value = e.target.value ?? '';
    setAddresses(prev => {
      const copy = [...prev];
      if (!copy[selectedIndex]) return prev;
      copy[selectedIndex] = { ...copy[selectedIndex], [field]: value };
      return copy;
    });
  };

  // Update lat,lng from map interactions
  const updateLocation = (lat, lng) => {
    setAddresses(prev => {
      const copy = [...prev];
      if (!copy[selectedIndex]) return prev;
      copy[selectedIndex] = { ...copy[selectedIndex], lat, lng };
      return copy;
    });
  };

  // Autocomplete selection handler
  const onAutocompleteSelect = (item) => {
    if (typeof setAddresses !== 'function') {
      toast({
        title: 'Address update function missing',
        status: 'error',
      });
      return;
    }
    if (!item?.position) return;

    setAddresses(prev => {
      const copy = [...prev];
      if (!copy[selectedIndex]) return prev;

      // Always update lat/lng for new position
      copy[selectedIndex].lat = item.position.lat;
      copy[selectedIndex].lng = item.position.lng;

      // Only update address_line if currently empty or matches previous suggested text
      if (!copy[selectedIndex].address_line || copy[selectedIndex].address_line.trim() === item.title.trim()) {
        copy[selectedIndex].address_line = item.title || '';
        copy[selectedIndex].pincode = item.address?.postalCode || '';
      }
      return copy;
    });
  };

  // Add new address button handler
  const addAddress = () => {
    const newAddress = {
      id: `temp-${Date.now()}`,
      label: 'Default',
      address_line: '',
      pincode: '',
      city: '',
      state: '',
      country: '',
      lat: 17.385,
      lng: 78.486,
    };
    setAddresses(prev => [...prev, newAddress]);
    setSelectedIndex(addresses.length); // Select new address tab
  };

  // Delete currently selected address
  const deleteAddress = () => {
    if (selectedIndex === -1) return;
    setAddresses(prev => {
      const copy = prev.filter((_, i) => i !== selectedIndex);
      return copy;
    });
    setSelectedIndex(addresses.length > 1 ? 0 : -1);
  };

  // Add new label handler
  const addLabel = () => {
    const input = prompt('Enter new label');
    if (!input) return;
    const trimmedLabel = input.trim();
    if (!trimmedLabel) {
      toast({ title: 'Label cannot be empty', status: 'warning' });
      return;
    }
    if (labelOptions.includes(trimmedLabel)) {
      toast({ title: 'Label already exists', status: 'info' });
      // Select existing label
      updateField('label')({ target: { value: trimmedLabel } });
      return;
    }
    setLabelOptions(prev => [...prev, trimmedLabel]);
    updateField('label')({ target: { value: trimmedLabel } });
    toast({ title: `Added label: "${trimmedLabel}"`, status: 'success' });
  };

  return (
    <VStack spacing={6} w='full' maxW='700px' mx='auto' p={4} borderWidth='1px' borderRadius='md'>
      {/* Address selector dropdown */}
      <Select
        value={selectedIndex}
        onChange={e => setSelectedIndex(Number(e.target.value))}
        mb={4}
        w='full'
      >
        {addresses.map((addr, idx) => (
          <option key={`${addr.id ?? 'addr'}-${idx}`} value={idx}>
            {addr.label || 'No Label'}
          </option>
        ))}
      </Select>

      {/* Label input */}
      <Input
        placeholder='Address Label'
        value={selectedAddress.label ?? ''}
        onChange={updateField('label')}
        mb={2}
      />

      <Button size='sm' mb={3} onClick={addLabel}>
        + Add Label
      </Button>

      {/* Address line and pin */}
      <HStack mb={2}>
        <Input
          placeholder='Address Line'
          flex={3}
          value={selectedAddress.address_line ?? ''}
          onChange={updateField('address_line')}
        />
        <Input
          placeholder='Pincode'
          flex={1}
          value={selectedAddress.pincode ?? ''}
          onChange={updateField('pincode')}
        />
      </HStack>

      {/* City, State, Country */}
      <HStack mb={2}>
        <Input
          placeholder='City'
          value={selectedAddress.city ?? ''}
          onChange={updateField('city')}
        />
        <Input
          placeholder='State'
          value={selectedAddress.state ?? ''}
          onChange={updateField('state')}
        />
        <Input
          placeholder='Country'
          value={selectedAddress.country ?? ''}
          onChange={updateField('country')}
        />
      </HStack>

      {/* Leaflet Map container: Ensure fixed height and width */}
      <Box height='300px' width='100%' borderRadius='md' overflow='hidden' mb={3}>
        <LeafletMap
          markerPosition={[selectedAddress.lat ?? 17.385, selectedAddress.lng ?? 78.486]}
          onLocationChange={updateLocation}
        />
      </Box>

      {/* Autocomplete search input */}
      <AddressSearch onSelect={onAutocompleteSelect} at={`${selectedAddress.lat ?? 17.385},${selectedAddress.lng ?? 78.486}`} />

      {/* Controls */}
      <HStack justify='flex-end' spacing={4} w='full'>
        <Button onClick={deleteAddress} leftIcon={<DeleteIcon />} colorScheme='red'>
          Delete
        </Button>
        <Button onClick={addAddress} leftIcon={<SmallAddIcon />} colorScheme='blue'>
          Add New Address
        </Button>
      </HStack>
    </VStack>
  );
}
