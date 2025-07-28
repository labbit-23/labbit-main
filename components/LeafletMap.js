"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet marker icon URLs so markers show up properly
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function LeafletMap({ center, zoom, onMapClick, onMarkerDragEnd, markerPosition, onMapReady }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // initialize map only once

    // Initialize map
    const map = L.map(mapContainerRef.current).setView(center, zoom);
    mapInstanceRef.current = map;

    // Add OpenStreetMap tiles
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    // Add draggable marker
    const marker = L.marker(center, { draggable: true }).addTo(map);
    markerRef.current = marker;

    // Map click updates marker position and callback
    map.on("click", function (e) {
      marker.setLatLng(e.latlng);
      if (onMapClick) onMapClick(e);
    });

    // Marker dragend callback
    marker.on("dragend", function (e) {
      if (onMarkerDragEnd) onMarkerDragEnd(e);
    });

    // Optional: expose map and marker instances to parent
    if (onMapReady) {
      onMapReady({ map, marker });
    }

    // Cleanup on unmount
    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update map center and zoom when props change
  useEffect(() => {
    if (mapInstanceRef.current && center) {
      mapInstanceRef.current.setView(center, zoom);
    }
    if (markerRef.current && markerPosition) {
      markerRef.current.setLatLng(markerPosition);
    }
  }, [center, zoom, markerPosition]);

  return <div ref={mapContainerRef} style={{ height: "100%", width: "100%" }} />;
}
