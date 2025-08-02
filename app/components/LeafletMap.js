// app/components/LeafletMap.js
'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix leaflet default icon URLs
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

function MapCenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center);
  }, [center, map]);
  return null;
}

function MapClick({ onLocationChange }) {
  useMapEvents({
    click(e) {
      onLocationChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/**
 * LeafletMap Component Props:
 * - markerPosition: [lat, lng] array
 * - onLocationChange: callback(lat, lng) called on marker dragend or map click
 */
export default function LeafletMap({ markerPosition, onLocationChange }) {
  return (
    <MapContainer
      center={markerPosition || [17.385, 78.486]}
      zoom={16}
      style={{ height: '300px', width: '100%' }}
      scrollWheelZoom={false}
    >
      <MapCenter center={markerPosition} />
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <MapClick onLocationChange={onLocationChange} />
      {markerPosition && (
        <Marker
          position={markerPosition}
          draggable
          eventHandlers={{
            dragend: (e) => {
              const { lat, lng } = e.target.getLatLng();
              onLocationChange(lat, lng);
            },
          }}
        />
      )}
    </MapContainer>
  );
}
