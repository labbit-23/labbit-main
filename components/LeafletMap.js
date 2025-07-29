"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";

// Fix for default icon (needed for many React builds)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function LeafletMap({
  center,
  zoom,
  onMapClick,
  onMarkerDragEnd,
  markerPosition,   // Pass only when you actually want marker to move!
  onMapReady,
}) {
  const mapDivRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const searchControlRef = useRef(null);

  // --- Initialize map and controls ONCE ---
  useEffect(() => {
    if (mapDivRef.current && !mapInstanceRef.current) {
      // Initialize map
      const map = L.map(mapDivRef.current, { zoomControl: true }).setView(center, zoom);
      mapInstanceRef.current = map;

      // Add tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Add marker
      const marker = L.marker(center, { draggable: true }).addTo(map);
      markerRef.current = marker;

      // Click/move events
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        if (onMapClick) onMapClick(e);
      });
      marker.on("dragend", (e) => {
        if (onMarkerDragEnd) onMarkerDragEnd(e);
      });

      // Add search control (GeoSearch)
      const provider = new OpenStreetMapProvider();

      const searchControl = new GeoSearchControl({
        provider,
        style: "bar",
        autoComplete: true,
        autoCompleteDelay: 250,
        retainZoomLevel: false,
        showMarker: false,
        keepResult: true,
        searchLabel: "Enter address",
      });

      // Delay adding control to DOM to avoid race condition
      setTimeout(() => {
        map.addControl(searchControl);
        searchControlRef.current = searchControl;
      }, 0);

      // Listen to location selection, move marker, update parent
      map.on("geosearch/showlocation", (result) => {
        if (result && result.location) {
          const { y, x } = result.location;
          marker.setLatLng([y, x]);
          map.setView([y, x], 16);
          if (onMarkerDragEnd) onMarkerDragEnd({ target: marker });
          if (onMapClick)
            onMapClick({ latlng: L.latLng(y, x) });
        }
      });

      if (onMapReady) onMapReady({ map, marker });

      // Cleanup on unmount
      return () => {
        map.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        searchControlRef.current = null;
      };
    }
    // No dependency array here: only runs once
    // eslint-disable-next-line
  }, []);

  // --- Sync marker location *without* re-creating map or control ---
  useEffect(() => {
    if (mapInstanceRef.current && markerPosition) {
      markerRef.current.setLatLng(markerPosition);
      // Optionally pan/zoom as needed:
      // mapInstanceRef.current.setView(markerPosition, zoom);
    }
    // Only run this if markerPosition changes
    // eslint-disable-next-line
  }, [markerPosition]);

  return <div ref={mapDivRef} style={{ height: "100%", width: "100%" }} />;
}
