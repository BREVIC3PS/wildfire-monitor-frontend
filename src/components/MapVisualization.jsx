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
  const [email, setEmail] = useState('');

  // File upload handler for GeoJSON
  const handleGeoJSONUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!email) {
      toast.error('请先输入电子邮箱');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const geojson = JSON.parse(reader.result);
        const map = featureGroupRef.current._map;
        const layer = L.geoJSON(geojson).addTo(map);
        toast.info('GeoJSON 区域已添加');
        // 保存到后端
        await fetch('http://localhost:4000/api/regions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            name: '前端上传区域',
            geojson
          })
        });
        toast.success('区域已保存到数据库');
      } catch (err) {
        toast.error('无效的 GeoJSON 文件');
      }
    };
    reader.readAsText(file);
  };

  // Drawing created handler
  const onAreaCreated = async (e) => {
    const layer = e.layer;
    const geojson = layer.toGeoJSON();
    setAreas(prev => [...prev, layer]);
    toast.success('订阅区域已创建');
    if (checkRisk(layer)) {
      toast.warn('该区域内检测到火点风险！');
    }
    if (!email) {
      toast.error('请先在上传框中输入电子邮箱');
      return;
    }
    // 保存区域到后端
    await fetch('http://localhost:4000/api/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        name: '手动画区域',
        geojson
      })
    });
    toast.success('区域已保存到数据库');
  };

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
        <div style={{ marginBottom: 8 }}>
          <label>
            Email: <input 
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="请输入邮箱" 
            />
          </label>
        </div>
        <input type="file" accept=".geojson" onChange={handleGeoJSONUpload} />
        <div style={{ marginTop: 8 }}>
          <label>
            预测时段: 
            <select value={period} onChange={e => setPeriod(e.target.value)}>
              <option value="6h">6h</option>
              <option value="12h">12h</option>
              <option value="24h">24h</option>
            </select>
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            透明度: {opacity}
            <input type="range" min={0} max={1} step={0.1} value={opacity} onChange={e => setOpacity(+e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: 8 }}>
          <label>
            阈值: {threshold}
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
            onCreated={onAreaCreated}
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
