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

// Fix Leaflet's default icon paths
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});


// Helper: simple check if any fire point within layer bounds
// function checkRisk(layer) {
//   const bounds = layer.getBounds ? layer.getBounds() : null;
//   if (!bounds) return false;
//   return riskPoints.some(pt => bounds.contains(L.latLng(pt.position)));
// }

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
  // —— state for high-risk points from DB ——
  const [riskPoints, setRiskPoints] = useState([]);
  const center = [34.0522, -118.2437]; // Los Angeles
  const featureGroupRef = useRef(null);
  const [areas, setAreas] = useState([]);
  const [period, setPeriod] = useState('6h');
  const [opacity, setOpacity] = useState(0.5);
  const [threshold, setThreshold] = useState(0.3);
  const [email, setEmail] = useState('');
  const [loadedEmail, setLoadedEmail] = useState('');

  const handleSubmit = () => {
    if (!email) {
      toast.error('请输入邮箱后再提交');
      return;
    }
    setLoadedEmail(email);
  };

  // —— 当 loadedEmail 变化（用户「提交」）时，拉取 regional_fire_risk 表中 probability 最高的前 5 条
  useEffect(() => {
    if (!loadedEmail) return;
    (async () => {
      try {
        const res = await fetch(
          `http://54.149.91.212:4000/api/regional_fire_risk?limit=5`
        );
        if (!res.ok) throw new Error(res.statusText);
        let data = await res.json();
        // 确保按 probability 降序，并截取前 5 条
        data = data
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 5);
        setRiskPoints(data);
      } catch (err) {
        console.error('加载高风险点失败', err);
        toast.error('加载火险预警点失败');
      }
    })();
  }, [loadedEmail]);


 //—— 在本地缓存 email，下次自动加载 ——
 useEffect(() => {
   const saved = localStorage.getItem('wm_email');
   if (saved)
   {
      setEmail(saved);
      setLoadedEmail(saved);
      toast.info('已加载上次使用的邮箱');
   }
 }, []);

 //—— 当 email 确定后，向后端拉取历史 regions ——
 useEffect(() => {
  if (!loadedEmail) return;
  localStorage.setItem('wm_email', loadedEmail);

  (async () => {
    try {
      const res = await fetch(`http://54.149.91.212:4000/api/regions?email=${encodeURIComponent(loadedEmail)}`);
      const regions = await res.json();

      const fg = featureGroupRef.current;
      // 先清空组里的旧图层
      fg.clearLayers();
      setAreas([]);

      // 把每个 geojson 加入到同一个 FeatureGroup
      const loaded = regions.map(r => {
        const layer = L.geoJSON(r.geojson)
          .bindPopup(r.name);
        layer.regionId = r.id;
        fg.addLayer(layer);
        return layer;
      });

      setAreas(loaded);
      toast.success('历史订阅区域已加载');
    } catch (err) {
      console.error(err);
      toast.error('加载历史区域失败');
    }
  })();
}, [loadedEmail]);


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
        await fetch('http://54.149.91.212:4000/api/regions', {
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
    if (!email) {
      toast.error('请先在上传框中输入电子邮箱');
      return;
    }
    // 保存区域到后端
    // 1) 调 API 创建
    try {
      const res = await fetch('http://54.149.91.212:4000/api/regions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name: 'New Area' + new Date().toISOString(),
          geojson
        })
      });
      const { regionId } = await res.json();
      // 2) 把 regionId 绑到 layer 上
      layer.regionId = regionId;
      toast.success(`区域已保存（ID=${regionId}）`);
    } catch (err) {
      console.error(err);
      toast.error('保存区域到数据库失败');
    }
  };

  // Drawing deleted handler
  const onAreaDeleted = async (e) => {
    if (!email) {
      toast.error('请先在上传框中输入电子邮箱');
      return;
    }
  
    const layers = e.layers;
    // 1) 收集所有被删图层的 regionId（自动去重）
    const regionIds = new Set();
    layers.eachLayer(layer => {
      if (layer.regionId != null) {
        regionIds.add(layer.regionId);
      }
    });
  
    // 2) 从前端 state 中移除这些图层
    setAreas(prev =>
      prev.filter(l => !regionIds.has(l.regionId))
    );
  
    // 3) 并行调用删除接口，每个 regionId 只调用一次
    try {
      await Promise.all(
        Array.from(regionIds).map(id =>
          fetch(
            `http://54.149.91.212:4000/api/regions/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`,
            { method: 'DELETE' }
          )
        )
      );
      toast.success('订阅区域已删除');
    } catch (err) {
      console.error(err);
      toast.error('删除区域时出错，请稍后重试');
    }
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
          <button onClick={handleSubmit} style={{ marginLeft: 8 }}>
          提交
        </button>
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
            onDeleted={onAreaDeleted}
            draw={{ rectangle: true, polygon: true, polyline: false }}
            edit={{ remove: true }}
          />
        </FeatureGroup>

        {/* 从数据库拉取的 high-risk markers */}
        {riskPoints.map(pt => (
          <Marker
            key={pt.id}
            position={[pt.latitude, pt.longitude]}
          >
            <Popup>
              火险概率：{(pt.probability * 100).toFixed(1)}%<br/>
              时间：{new Date(pt.timestamp).toLocaleString()}
            </Popup>
          </Marker>
        ))}

      </MapContainer>
    </div>
  );
}
