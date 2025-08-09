//app/components/AddressSearch.js
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Box, Input, Text } from '@chakra-ui/react';

/**
 * AddressSearch component for autocomplete
 * Props:
 *  - onSelect(item): callback with selected item
 *  - at: string "lat,lng" for geosearch bias
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

