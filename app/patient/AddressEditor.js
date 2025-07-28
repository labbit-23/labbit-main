"use client";

import React, { useRef } from "react";
import { VStack, FormControl, FormLabel, Input, Button, Box } from "@chakra-ui/react";
import dynamic from "next/dynamic";

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

  const handleMapReady = ({ map, marker }) => {
    mapRef.current = map;
    markerRef.current = marker;
  };

  const handleMapClick = (e) => {
    setLatLng({ lat: e.latlng.lat, lng: e.latlng.lng });
  };

  const handleMarkerDrag = (e) => {
    setLatLng({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng });
  };

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLatLng = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLatLng(userLatLng);
        if (mapRef.current) mapRef.current.setView([userLatLng.lat, userLatLng.lng], 16);
        if (markerRef.current) markerRef.current.setLatLng([userLatLng.lat, userLatLng.lng]);
      },
      () => alert("Unable to retrieve your location.")
    );
  };

  return (
    <VStack spacing={4} align="stretch">
      <FormControl isRequired>
        <FormLabel>Address Label</FormLabel>
        <Input
          placeholder="Enter address label"
          value={addressLabel || ""}
          onChange={(e) => setAddressLabel(e.target.value)}
          isDisabled={loading}
          aria-label="Address label"
        />
      </FormControl>

      <FormControl>
        <FormLabel>Full Address</FormLabel>
        <Input
          placeholder="Enter address line"
          value={addressLine || ""}
          onChange={(e) => setAddressLine(e.target.value)}
          isDisabled={loading}
          aria-label="Address line"
        />
      </FormControl>

      <Box height="300px" border="1px" borderColor="gray.200" rounded="md" overflow="hidden">
        <LeafletMap
          center={latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : DEFAULT_CENTER}
          zoom={latLng.lat && latLng.lng ? 16 : MAP_ZOOM}
          onMapReady={handleMapReady}
          onMapClick={handleMapClick}
          onMarkerDragEnd={handleMarkerDrag}
          markerPosition={latLng.lat && latLng.lng ? [latLng.lat, latLng.lng] : null}
        />
      </Box>

      <Button size="sm" onClick={handleUseLocation} isDisabled={loading}>
        Use My Location
      </Button>
    </VStack>
  );
}
