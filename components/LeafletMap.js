"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { GeoSearchControl, OpenStreetMapProvider } from "leaflet-geosearch";

// Fix for default leaflet marker icon issues in some bundlers/environments
delete L.Icon.Default.prototype._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export default function LeafletMap({
  center,
  zoom,
  onMapClick,
  onMarkerDragEnd,
  markerPosition,
  onMapReady,
}) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    if (mapRef.current && !leafletMap.current) {
      // Initialize the map
      const map = L.map(mapRef.current).setView(center, zoom);
      leafletMap.current = map;

      // Add OSM tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      // Add draggable marker
      const marker = L.marker(center, { draggable: true }).addTo(map);
      markerRef.current = marker;

      // Map click moves marker and calls callback
      map.on("click", (e) => {
        marker.setLatLng(e.latlng);
        if (onMapClick) onMapClick(e);
      });

      // Marker drag calls callback
      marker.on("dragend", (e) => {
        if (onMarkerDragEnd) onMarkerDragEnd(e);
      });

      // Add search control
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

      map.addControl(searchControl);

      // Listen for selection of search result, move marker + update position
      map.on("geosearch/showlocation", (result) => {
        if (!result || !result.location) return;
        const { y, x } = result.location; // latitude (y), longitude (x)
        marker.setLatLng([y, x]);
        map.setView([y, x], 16); // zoom in to selection
        if (onMarkerDragEnd) onMarkerDragEnd({ target: marker });
        if (onMapClick)
          onMapClick({
            latlng: L.latLng(y, x),
          });
      });

      // Expose map and marker instances to parent component if requested
      if (onMapReady) onMapReady({ map, marker });

      // Cleanup on unmount
      return () => {
        map.remove();
        leafletMap.current = null;
        markerRef.current = null;
      };
    }
  }, [center, zoom, onMapClick, onMarkerDragEnd, onMapReady]);

  // Update map center and marker position when props change
  useEffect(() => {
    if (leafletMap.current && center) {
      leafletMap.current.setView(center, zoom);
    }
    if (markerRef.current && markerPosition) {
      markerRef.current.setLatLng(markerPosition);
    }
  }, [center, zoom, markerPosition]);

  return <div ref={mapRef} style={{ height: "100%", width: "100%" }} />;
}
