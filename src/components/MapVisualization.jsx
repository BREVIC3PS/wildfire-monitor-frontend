import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, FeatureGroup, useMap } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';
import L from 'leaflet';
import 'leaflet.heat';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Fix Leaflet's default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Dummy satellite fire points data
const firePoints = [
  { id: 1, position: [34.1, -118.2], name: 'Fire A', time: '2025-04-26 10:00 UTC' },
  { id: 2, position: [34.05, -118.3], name: 'Fire B', time: '2025-04-26 11:30 UTC' },
];

// Dummy weather stations data
const weatherPoints = [
  { id: 1, position: [34.06, -118.24], temp: 25, condition: 'Sunny' },
  { id: 2, position: [34.0, -118.28], temp: 22, condition: 'Cloudy' },
];

// Dummy heatmap data for different prediction periods
const allHeatData = {
  '6h': [
    [34.055, -118.245, 0.6],
    [34.065, -118.255, 0.4],
    [34.045, -118.235, 0.7],
  ],
  '12h': [
    [34.055, -118.245, 0.8],
    [34.065, -118.255, 0.6],
    [34.045, -118.235, 0.5],
  ],
  '24h': [
    [34.055, -118.245, 0.9],
    [34.065, -118.255, 0.7],
    [34.045, -118.235, 0.6],
  ],
};

// Helper: simple check if any fire point within layer bounds
function checkRisk(layer) {
  const bounds = layer.getBounds ? layer.getBounds() : null;
  if (!bounds) return false;
  return firePoints.some(pt => bounds.contains(L.latLng(pt.position)));
}

// Heatmap overlay component using Leaflet.heat
function HeatmapOverlay({ points, options }) {
  const map = useMap();
  useEffect(() => {
    if (!points || points.length === 0) return;
    const layer = L.heatLayer(points, options).addTo(map);
    return () => { map.removeLayer(layer); };
  }, [points, options, map]);
  return null;
}

export default function MapVisualization() {
  const center = [34.0522, -118.2437]; // Los Angeles
  const featureGroupRef = useRef(null);
  const [areas, setAreas] = useState([]);
  const [period, setPeriod] = useState('6h');
  const [opacity, setOpacity] = useState(0.5);
  const [threshold, setThreshold] = useState(0.3);

  // File upload handler for GeoJSON
  const handleGeoJSONUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const geojson = JSON.parse(reader.result);
        const map = featureGroupRef.current._map;
        const layer = L.geoJSON(geojson).addTo(map);
        toast.info('GeoJSON area(s) added');
      } catch (err) {
        toast.error('Invalid GeoJSON file');
      }
    };
    reader.readAsText(file);
  };

  // For debugging: log Leaflet version
  useEffect(() => {
    console.log('MapVisualization mounted, Leaflet version:', L.version);
  }, []);

  // Filter heatmap points by threshold
  const rawHeatPoints = allHeatData[period] || [];
  const heatPoints = rawHeatPoints
    .filter(p => p[2] >= threshold)
    .map(p => [p[0], p[1], p[2]]);

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <ToastContainer position="top-right" autoClose={5000} />

      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1000, background: 'white', padding: 8, borderRadius: 4 }}>
        <input type="file" accept=".geojson" onChange={handleGeoJSONUpload} />
        <div style={{ marginTop: 8 }}>
          <label>
            Perdicting period: 
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="6h">6h</option>
              <option value="12h">12h</option>
              <option value="24h">24h</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Opacity: {opacity}
            <input type="range" min={0} max={1} step={0.1} value={opacity} onChange={e => setOpacity(+e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            Threashold: {threshold}
            <input type="range" min={0} max={1} step={0.1} value={threshold} onChange={e => setThreshold(+e.target.value)} />
          </label>
        </div>
      </div>

      <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Heatmap Overlay */}
        <HeatmapOverlay
          points={heatPoints}
          options={{ radius: 25, blur: 15, maxOpacity: opacity }}
        />

        {/* Drawing / Subscription Areas */}
        <FeatureGroup ref={featureGroupRef}>
          <EditControl
            position="topright"
            onCreated={(e) => {
              const layer = e.layer;
              setAreas(prev => [...prev, layer]);
              toast.success('Subscription areas created!');
              if (checkRisk(layer)) {
                toast.warn('Fire risks detected within the area!');
              }
            }}
            draw={{ rectangle: true, circle: true, polygon: true, marker: false, polyline: false }}
            edit={{ remove: true }}
          />
        </FeatureGroup>

        {/* Fire Points */}
        {firePoints.map(pt => (
          <Marker key={pt.id} position={pt.position}>
            <Popup>
              <strong>{pt.name}</strong><br />
              Time: {pt.time}
            </Popup>
          </Marker>
        ))}

        {/* Weather Points */}
        {weatherPoints.map(st => (
          <Marker key={st.id} position={st.position}>
            <Popup>
              Temperature: {st.temp}°C<br />
              Condition: {st.condition}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
