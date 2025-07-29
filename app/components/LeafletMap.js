// app/components/LeafletMap.js
'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

export default function LeafletMap({ onLocationSelect, markerPosition }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // ✅ Create the map only once
    if (!leafletMap.current) {
      leafletMap.current = L.map(mapRef.current).setView([17.3850, 78.4867], 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(leafletMap.current);
    }

    // ✅ Add click handler
    const handleClick = (e) => {
      const { lat, lng } = e.latlng;
      onLocationSelect(lat, lng);
    };

    leafletMap.current.on('click', handleClick);

    // ✅ Add or update marker
    if (markerPosition) {
      if (markerRef.current) {
        markerRef.current.setLatLng(markerPosition);
      } else {
        markerRef.current = L.marker(markerPosition).addTo(leafletMap.current);
      }
    } else {
      if (markerRef.current) {
        leafletMap.current.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    }

    // ✅ Cleanup on unmount
    return () => {
      leafletMap.current?.off('click', handleClick);
      if (markerRef.current) {
        leafletMap.current?.removeLayer(markerRef.current);
        markerRef.current = null;
      }
    };
  }, [onLocationSelect, markerPosition]);

  useEffect(() => {
    // ✅ Ensure the map is properly sized when it's ready
    leafletMap.current?.invalidateSize();
  }, [markerPosition]);

  return (
    <div
      ref={mapRef}
      style={{ height: '300px', width: '100%', borderRadius: 'md', overflow: 'hidden' }}
    />
  );
}