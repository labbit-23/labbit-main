//app/test-map/AddressWrapper.js
'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
  VStack,
  HStack,
  Input,
  Button,
  Box,
  useToast
} from '@chakra-ui/react';
import { SmallAddIcon } from '@chakra-ui/icons';

// Dynamically import LeafletMap with SSR disabled to avoid SSR issues
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`/api/nextbillion/reverse?at=${lat},${lng}`);
    if(!res.ok) {
      console.error('Reverse geocode API error:', await res.text());
      return { address_line: '',  pincode: '' };
    }
    const data = await res.json();
    const props = data.items?.[0]?.address || {};
    return {
      address_line: props.label || '',
      pincode: props.postalCode || '',
    };
  } catch (e) {
    console.error('Reverse geocode fetch error', e);
    return { address_line: '',  pincode: '' };
  }
}

function AddressSearch1({ onSelect, at }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if(trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: trimmed, at: at || '17.385,78.486' });
        const res = await fetch(`/api/nextbillion/search?${params}`);
        if (!res.ok) {
          console.error('Autocomplete API error:', await res.text());
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(data.items || []);
      } catch (err) {
        console.error('Autocomplete fetch error:', err);
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, at]);

  const handleSelect = (item) => {
    setQuery(item.title);
    setResults([]);
    onSelect(item);
    setIsFocused(false);
  };

  // Prevent blur before click
  const onMouseDownHandler = (item) => {
    handleSelect(item);
  };

  return (
    <Box position="relative" width="100%">
      <Input
        placeholder="Search address or landmark"
        value={query}
        autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
      />
      {isFocused && results.length > 0 && (
        <Box
          as="ul"
          style={{
            position: 'absolute',
            backgroundColor: 'white',
            width: '100%',
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid #ccc',
            borderRadius: 4,
            zIndex: 1000,
            marginTop: 4,
            padding: 0,
            listStyle: 'none'
          }}
        >
          {results.map(item => (
            <Box
              as="li"
              key={item.id}
              padding="8px"
              cursor="pointer"
              _hover={{ backgroundColor: '#eee' }}
              onMouseDown={() => onMouseDownHandler(item)}
            >
              <Box fontWeight="medium">{item.title}</Box>
              {item.address?.label && 
                <Box fontSize="sm" color="gray.600">{item.address.label}</Box>
              }
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

export default function AddressWrapper({ address, setAddress }) {
  const toast = useToast();

  const at = `${typeof address.lat === 'number' ? address.lat : 17.385},${typeof address.lng === 'number' ? address.lng : 78.486}`;

  const handleUseLocation = () => {
    if(!navigator.geolocation) {
      toast({description: "Geolocation not supported by this browser.", status: "warning"});
      return;
    }
    navigator.geolocation.getCurrentPosition(async ({coords}) => {
      const lat = coords.latitude;
      const lng = coords.longitude;
      // fetch address for current position
      const addressData = await reverseGeocode(lat, lng);
      setAddress({ lat, lng, ...addressData });
    }, (err) => {
      toast({description: "Failed to get location: " + err.message, status: "error"});
    });
  };

  const onSelectAddress = (item) => {
    if(!item.position) return;
    setAddress({
      lat: item.position.lat,
      lng: item.position.lng,
      address_line: item.title,
      pincode: item.address?.postalCode || ''
    })
  };

  const onMapMoved = async (lat, lng) => {
    const addressData = await reverseGeocode(lat, lng);
    setAddress({ lat, lng, ...addressData });
  };

  const onChange = (field) => (e) => {
    setAddress(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <VStack spacing={4} width="100%" alignItems="stretch">
      <AddressSearch1 onSelect={onSelectAddress} at={at} />
      <HStack>
        <Button leftIcon={<SmallAddIcon />} colorScheme="orange" onClick={handleUseLocation}>Use Location</Button>
      </HStack>
      <LeafletMap 
        markerPosition={[address.lat || 17.385, address.lng || 78.486]} 
        onLocation={onMapMoved}
      />
      <HStack>
        <Input value={address.address_line || ''} onChange={onChange('address_line')} placeholder="Address" flex={3} />
        <Input value={address.pincode || ''} onChange={onChange('pincode')} placeholder="Pin code" flex={1} />
      </HStack>
    </VStack>
  );
}
