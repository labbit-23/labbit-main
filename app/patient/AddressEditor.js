"use client";

import React, { useRef } from "react";
import {
  VStack,
  FormControl,
  FormLabel,
  Input,
  Button,
  Box,
  Spinner,
} from "@chakra-ui/react";
import dynamic from "next/dynamic";

// Dynamically import Leaflet-based map for client-side only rendering
const LeafletMap = dynamic(() => import("../../components/LeafletMap"), { ssr: false });

const DEFAULT_CENTER = [17.385, 78.4867];
const MAP_ZOOM = 13;

export default function AddressEditor({
  addressLabel,
  setAddressLabel,
  addressLine,
  setAddressLine,
  latLng,
  setLatLng,
  loading,
}) {
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  // Update map and marker refs from child
  const handleMapReady = ({ map, marker }) => {
    mapRef.current = map;
    markerRef.current = marker;
  };

  // Handle user clicking map to update marker and latLng state
  const handleMapClick = (e) => {
    setLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
  };

  // Handle marker drag end event
  const handleMarkerDragEnd = (e) => {
    setLatLng({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng });
  };

  // Use browser geolocation to get current position
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLatLng(userPos);
        if (mapRef.current) {
          mapRef.current.setView([userPos.lat, userPos.lng], 16);
        }
        if (markerRef.current) {
          markerRef.current.setLatLng([userPos.lat, userPos.lng]);
        }
      },
      () => {
        alert("Unable to retrieve your location.");
      }
    );
  };

  return (
    <VStack spacing={4} align="stretch">
      <FormControl isRequired>
        <FormLabel>Address Label</FormLabel>
        <Input
          placeholder="Enter address label"
          value={addressLabel}
          onChange={(e) => setAddressLabel(e.target.value)}
          isDisabled={loading}
        />
      </FormControl>

      <FormControl>
        <FormLabel>Full Address</FormLabel>
        <Input
          placeholder="Enter detailed address"
          value={addressLine}
          onChange={(e) => setAddressLine(e.target.value)}
          isDisabled={loading}
        />
      </FormControl>

      <Box height="300px" border="1px solid" borderColor="gray.200" rounded="md" overflow="hidden">
        <LeafletMap
          center={
            latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : DEFAULT_CENTER
          }
          zoom={latLng.lat && latLng.lng ? 16 : MAP_ZOOM}
          onMapReady={handleMapReady}
          onMapClick={handleMapClick}
          onMarkerDragEnd={handleMarkerDragEnd}
          markerPosition={latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : null}
        />
      </Box>

      <Button size="sm" onClick={handleUseMyLocation} isDisabled={loading}>
        Use My Location
      </Button>
    </VStack>
  );
}
