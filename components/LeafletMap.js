"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export default function LeafletMap({ center, zoom, onMapClick, onMarkerDragEnd, markerPosition }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return; // already initialized

    const map = L.map(mapContainerRef.current).setView(center, zoom);
    mapInstanceRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const marker = L.marker(center, { draggable: true }).addTo(map);
    markerRef.current = marker;

    map.on("click", function (e) {
      marker.setLatLng(e.latlng);
      if (onMapClick) onMapClick(e);
    });

    marker.on("dragend", function (e) {
      if (onMarkerDragEnd) onMarkerDragEnd(e);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, []);

  // Update center and marker position on props change
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
