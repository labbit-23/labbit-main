// //app/test-map/LeafletMap.js
// 'use client';

// import { useEffect } from 'react';
// import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
// import 'leaflet/dist/leaflet.css';
// import L from 'leaflet';

// // Fix Leaflet icons to load correctly
// delete L.Icon.Default.prototype._getIconUrl;
// L.Icon.Default.mergeOptions({
//   iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
//   iconUrl:        'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
//   shadowUrl:      'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
// });

// function MapCenter({ center }) {
//   const map = useMap();
//   useEffect(() => {
//     if (center) {
//       map.setView(center);
//     }
//   }, [center, map]);
//   return null;
// }

// function MapClick({ onClick }) {
//   useMapEvents({
//     click(e) {
//       onClick(e.latlng.lat, e.latlng.lng);
//     }
//   });
//   return null;
// }

// export default function LeafletMap({ markerPosition, onLocation }) {
//   return (
//     <MapContainer
//       center={markerPosition || [17.385, 78.486]}
//       zoom={13}
//       style={{ height: '300px', width: '100%' }}
//       scrollWheelZoom={false}
//       whenCreated={(map) => { /* optional, if you want to access map instance */ }}
//     >
//       <MapCenter center={markerPosition} />
//       <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />
//       <MapClick onClick={onLocation} />
//       {markerPosition && (
//         <Marker
//           position={markerPosition}
//           draggable={true}
//           eventHandlers={{
//             dragend: (e) => {
//               const { lat, lng } = e.target.getLatLng();
//               onLocation(lat, lng);
//             },
//           }}
//         />
//       )}
//     </MapContainer>
//   );
// }
