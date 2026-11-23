import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// SVG Marker Icons generator for crisp, modern rendering without bundle asset issues
const createCustomIcon = (type, isSelected = false) => {
  let bgColor = '#ef4444'; // Red for hospitals
  let iconSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" class="w-4 h-4">
      <path d="M19 10.5h-5.5V5a1.5 1.5 0 00-3 0v5.5H5a1.5 1.5 0 000 3h5.5V19a1.5 1.5 0 003 0v-5.5H19a1.5 1.5 0 000-3z" />
    </svg>
  `;

  if (type === 'clinic') {
    bgColor = '#10b981'; // Green for clinics
    iconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" class="w-4 h-4">
        <path d="M4.5 3.75a3 3 0 00-3 3v.75h21v-.75a3 3 0 00-3-3h-15z" />
        <path fill-rule="evenodd" d="M22.5 9.75h-21v7.5a3 3 0 003 3h15a3 3 0 003-3v-7.5zm-10.5 3a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5a.75.75 0 01.75-.75z" clip-rule="evenodd" />
      </svg>
    `;
  } else if (type === 'user') {
    bgColor = '#3b82f6'; // Blue for user location
    iconSvg = `
      <div class="w-3 h-3 bg-white rounded-full animate-ping"></div>
    `;
  } else if (type?.includes('camp') || type === 'blood_donation' || type === 'vaccination') {
    bgColor = '#8b5cf6'; // Purple for health camps
    iconSvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" class="w-4 h-4">
        <path d="M11.644 1.59a.75.75 0 01.712 0l9.75 5.25a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l9.75-5.25z" />
        <path d="M3.265 10.602l7.668 4.129a2.25 2.25 0 002.134 0l7.668-4.13 1.37.739a.75.75 0 010 1.32l-9.75 5.25a.75.75 0 01-.712 0l-9.75-5.25a.75.75 0 010-1.32l1.372-.738z" />
      </svg>
    `;
  }

  const size = isSelected ? 44 : 36;
  const pinHtml = `
    <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
      <div style="
        background: ${bgColor};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 4px 10px rgba(0,0,0,0.35);
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s ease;
      ">
      </div>
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 2;
        pointer-events: none;
      ">
        ${iconSvg}
      </div>
    </div>
  `;

  return L.divIcon({
    html: pinHtml,
    className: 'custom-leaflet-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size]
  });
};

const createUserIcon = () => {
  const html = `
    <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
      <div style="position: absolute; width: 28px; height: 28px; background: rgba(59, 130, 246, 0.4); border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
      <div style="width: 18px; height: 18px; background: #2563eb; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4); z-index: 2;"></div>
    </div>
  `;
  return L.divIcon({
    html: html,
    className: 'custom-user-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const HospitalMapLeaflet = ({
  facilities = [],
  userLocation = null,
  selectedFacility = null,
  onSelectFacility = () => {},
  center = { lat: 18.5204, lng: 73.8567 }, // Default Pune
  zoom = 13,
  className = "h-[500px] w-full rounded-2xl shadow-lg border border-gray-200"
}) => {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const userMarkerRef = useRef(null);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [center.lat, center.lng],
        zoom: zoom,
        zoomControl: true,
        scrollWheelZoom: true
      });

      // Standard high-quality OpenStreetMap tiles
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);

      const markersLayer = L.layerGroup().addTo(map);
      markersLayerRef.current = markersLayer;
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Handle center / zoom changes
  useEffect(() => {
    if (mapInstanceRef.current && center && center.lat && center.lng) {
      mapInstanceRef.current.setView([center.lat, center.lng], zoom, {
        animate: true,
        duration: 0.8
      });
    }
  }, [center?.lat, center?.lng, zoom]);

  // Update facility markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    markersLayer.clearLayers();

    const validFacilities = facilities.filter(
      f => f.coordinates && typeof f.coordinates.lat === 'number' && typeof f.coordinates.lng === 'number'
    );

    validFacilities.forEach((facility) => {
      const isSelected = selectedFacility && selectedFacility.id === facility.id;
      const marker = L.marker([facility.coordinates.lat, facility.coordinates.lng], {
        icon: createCustomIcon(facility.type, isSelected),
        title: facility.name
      });

      // Build rich popup HTML
      const ratingStars = '★'.repeat(Math.round(facility.rating || 4.5));
      const distanceBadge = facility.distance ? `<span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: bold;">${facility.distance}</span>` : '';
      const typeLabel = facility.type ? facility.type.toUpperCase() : 'HEALTHCARE';
      const phoneHtml = facility.phone && facility.phone !== 'N/A' 
        ? `<a href="tel:${facility.phone}" style="display: inline-flex; align-items: center; gap: 4px; color: #0d9488; text-decoration: none; font-weight: 600; font-size: 12px; margin-top: 6px;">📞 ${facility.phone}</a>`
        : '';
      const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${facility.coordinates.lat},${facility.coordinates.lng}`;

      const popupContent = `
        <div style="font-family: system-ui, -apple-system, sans-serif; min-width: 220px; max-width: 280px; padding: 4px;">
          ${facility.image ? `<img src="${facility.image}" alt="${facility.name}" style="width: 100%; height: 110px; object-fit: cover; border-radius: 8px; margin-bottom: 8px;" />` : ''}
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
            <span style="background: #ccfbf1; color: #0f766e; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: bold; text-transform: uppercase;">${typeLabel}</span>
            ${distanceBadge}
          </div>
          <h4 style="margin: 4px 0 2px 0; font-size: 14px; font-weight: bold; color: #111827; line-height: 1.3;">${facility.name}</h4>
          <p style="margin: 0 0 4px 0; font-size: 12px; color: #4b5563;">${facility.specialty || 'Healthcare Center'}</p>
          <div style="color: #f59e0b; font-size: 12px; margin-bottom: 6px;">
            ${ratingStars} <span style="color: #6b7280; font-size: 11px;">(${facility.rating || '4.5'})</span>
          </div>
          <p style="margin: 0 0 6px 0; font-size: 11px; color: #6b7280; line-height: 1.3;">📍 ${facility.address || ''}</p>
          ${phoneHtml}
          <div style="display: flex; gap: 8px; margin-top: 10px; border-top: 1px solid #f3f4f6; padding-top: 8px;">
            <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer" style="flex: 1; text-align: center; background: #0d9488; color: white; padding: 6px 10px; border-radius: 6px; text-decoration: none; font-size: 11px; font-weight: 600;">Get Directions</a>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 300 });

      marker.on('click', () => {
        onSelectFacility(facility);
      });

      markersLayer.addLayer(marker);

      // Auto-open popup if currently selected
      if (isSelected) {
        marker.openPopup();
      }
    });
  }, [facilities, selectedFacility]);

  // Handle user location marker
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userLocation && typeof userLocation.lat === 'number' && typeof userLocation.lng === 'number') {
      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
          icon: createUserIcon(),
          title: 'Your Location',
          zIndexOffset: 1000
        }).addTo(map);

        userMarkerRef.current.bindPopup(`
          <div style="padding: 4px; font-family: system-ui, sans-serif; text-align: center;">
            <strong style="color: #2563eb; font-size: 13px;">📍 You are here</strong>
            <p style="margin: 4px 0 0 0; font-size: 11px; color: #6b7280;">Hospitals are sorted by distance from this location.</p>
          </div>
        `);
      } else {
        userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      }
    } else if (userMarkerRef.current) {
      map.removeLayer(userMarkerRef.current);
      userMarkerRef.current = null;
    }
  }, [userLocation]);

  // Pan to selected facility when updated from list
  useEffect(() => {
    if (mapInstanceRef.current && selectedFacility?.coordinates?.lat && selectedFacility?.coordinates?.lng) {
      mapInstanceRef.current.flyTo(
        [selectedFacility.coordinates.lat, selectedFacility.coordinates.lng],
        15,
        { duration: 1 }
      );
    }
  }, [selectedFacility]);

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      if (userLocation) {
        mapInstanceRef.current.flyTo([userLocation.lat, userLocation.lng], 14);
      } else if (center) {
        mapInstanceRef.current.flyTo([center.lat, center.lng], zoom);
      }
    }
  };

  return (
    <div className="relative">
      <div ref={mapContainerRef} className={className} style={{ minHeight: '380px', zIndex: 1 }} />
      
      {/* Map floating controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <button
          onClick={handleRecenter}
          className="bg-white/95 hover:bg-white text-gray-800 p-2.5 rounded-xl shadow-md border border-gray-200 transition-all flex items-center justify-center hover:shadow-lg hover:text-teal-600"
          title="Recenter Map"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
        </button>
      </div>

      {/* Map Legend */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-xl shadow-md border border-gray-200 text-xs flex items-center gap-3">
        <div className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block shadow-sm"></span>
          <span>Hospital</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block shadow-sm"></span>
          <span>Clinic</span>
        </div>
        <div className="flex items-center gap-1.5 font-medium text-gray-700">
          <span className="w-3 h-3 rounded-full bg-purple-500 inline-block shadow-sm"></span>
          <span>Health Camp</span>
        </div>
        {userLocation && (
          <div className="flex items-center gap-1.5 font-medium text-blue-700">
            <span className="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-sm"></span>
            <span>You</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default HospitalMapLeaflet;
