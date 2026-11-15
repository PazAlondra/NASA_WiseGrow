import { useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  ZoomControl,
  useMap
} from 'react-leaflet';
import { Droplets, Info, Layers, MapPin, Satellite, Thermometer } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const MAP_BOUNDS = [[14, -119], [33.5, -85]];
const API_BASE_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://127.0.0.1:8000' : '')).replace(/\/$/, '');
const NATIONAL_CLIMATE_API = `${API_BASE_URL}/api/clima/nacional`;
const STATE_BOUNDARIES_API = `${API_BASE_URL}/api/geo/estados`;
const SOIL_PROFILES_API = `${API_BASE_URL}/api/suelos/perfiles`;
const TEMPERATURE_COLORS = [
  { color: '#3289c2', label: 'Muy baja' },
  { color: '#42a873', label: 'Baja' },
  { color: '#d7c94d', label: 'Media' },
  { color: '#ed963e', label: 'Alta' },
  { color: '#c95748', label: 'Muy alta' }
];

const METRICS = {
  temperature: { label: 'Temperatura del aire', shortLabel: 'Temperatura media a 2 m', parameter: 'T2M', unit: '°C', icon: Thermometer, aggregation: 'mean' },
  humidity: { label: 'Humedad atmosférica', shortLabel: 'Humedad relativa a 2 m', parameter: 'RH2M', unit: '%', icon: Droplets, aggregation: 'mean' },
  precipitation: { label: 'Precipitación', shortLabel: 'Precipitación acumulada', parameter: 'PRECTOTCORR', unit: 'mm', icon: Droplets, aggregation: 'sum' }
};

const SOIL_CLUSTERS = [
  { id: 0, label: 'Perfil cercano a neutro · baja salinidad', shortLabel: 'Cercano a neutro · baja salinidad', color: '#2f9476', description: 'Medianas: pH 6.9 y conductividad eléctrica 0.1.' },
  { id: 1, label: 'Perfil alcalino · calcio y CIC más altos', shortLabel: 'Alcalino · más calcio y CIC', color: '#d8a334', description: 'Medianas: pH 8.2, CIC 29.9 y calcio 33.2.' },
  { id: 2, label: 'Perfil con salinidad y sodio elevados', shortLabel: 'Salinidad y sodio elevados', color: '#c65a4d', description: 'Medianas: conductividad eléctrica 25.1 y sodio intercambiable 92.6.' }
];

const IMAGERY_LAYERS = [
  { id: 'VIIRS_NOAA21_CorrectedReflectance_TrueColor', label: 'VIIRS · NOAA-21' },
  { id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor', label: 'VIIRS · NOAA-20' },
  { id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', label: 'VIIRS · Suomi NPP' },
  { id: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'MODIS · Terra' }
];

function recentDate(daysAgo = 3) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function normalizeName(value = '') {
  const normalized = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const aliases = {
    'coahuila de zaragoza': 'coahuila',
    'michoacan de ocampo': 'michoacan',
    'veracruz de ignacio de la llave': 'veracruz',
    'estado de mexico': 'mexico',
    'ciudad de mexico': 'ciudad de mexico'
  };
  return aliases[normalized] || normalized;
}

function displayStateName(name = '') {
  const aliases = {
    'coahuila': 'Coahuila',
    'michoacan': 'Michoacán',
    'veracruz': 'Veracruz',
    'mexico': 'Estado de México'
  };
  return aliases[normalizeName(name)] || name;
}

async function fetchStateBoundaries(signal) {
  const response = await fetch(STATE_BOUNDARIES_API, { signal });
  if (!response.ok) throw new Error(`La cartografía estatal respondió HTTP ${response.status}.`);
  const data = await response.json();
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length < 30) {
    throw new Error('INEGI no devolvió el GeoJSON esperado de las entidades federativas.');
  }
  return data;
}

async function fetchNationalClimate(parameter, signal) {
  const query = new URLSearchParams({ parameter });
  const response = await fetch(`${NATIONAL_CLIMATE_API}?${query}`, { signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  if (!Array.isArray(payload?.states) || !payload?.period) {
    throw new Error('La API NASA nacional devolvió un formato inesperado.');
  }
  return payload;
}

async function fetchHistoricalSoilProfiles(signal) {
  const response = await fetch(SOIL_PROFILES_API, { signal });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : `HTTP ${response.status}`;
    throw new Error(detail);
  }
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new Error('La API de perfiles históricos de INEGI devolvió un formato inesperado.');
  }
  return payload;
}

function attachClimateData(boundaries, climateByParameter) {
  return {
    ...boundaries,
    features: boundaries.features.map((feature) => {
      const climate = {};
      Object.entries(METRICS).forEach(([metricKey, metric]) => {
        const dataset = climateByParameter[metric.parameter];
        if (!dataset) return;
        const name = normalizeName(feature.properties?.nomgeo || feature.properties?.state_name || '');
        const record = dataset.statesByName?.[name];
        const value = metric.aggregation === 'sum' ? record?.period_total : record?.mean_value;
        climate[metricKey] = Number.isFinite(value) ? {
          value,
          cells: record.cells,
          days: record.valid_days,
          coveragePct: record.coverage_pct,
          nearest: false
        } : null;
      });
      return { ...feature, properties: { ...feature.properties, climate } };
    })
  };
}

function indexClimateStates(payload) {
  return {
    ...payload,
    statesByName: Object.fromEntries(payload.states.map((state) => [normalizeName(state.state), state]))
  };
}

function getMetricValue(feature, metricKey) {
  return feature?.properties?.climate?.[metricKey]?.value ?? null;
}

function quantileBreaks(features, metricKey) {
  const values = features.map((feature) => getMetricValue(feature, metricKey)).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return [];
  return [0.2, 0.4, 0.6, 0.8].map((quantile) => values[Math.min(values.length - 1, Math.floor(quantile * values.length))]);
}

function colorForValue(value, breaks) {
  if (!Number.isFinite(value) || !breaks.length) return '#cbd5d1';
  const rank = breaks.findIndex((breakValue) => value <= breakValue);
  return TEMPERATURE_COLORS[rank < 0 ? TEMPERATURE_COLORS.length - 1 : rank].color;
}

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects = ((y1 > latitude) !== (y2 > latitude))
      && longitude < ((x2 - x1) * (latitude - y1)) / ((y2 - y1) || Number.EPSILON) + x1;
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContainsPoint(geometry, longitude, latitude) {
  if (!geometry) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates]
    : geometry.type === 'MultiPolygon' ? geometry.coordinates
      : [];
  return polygons.some((rings) => pointInRing(longitude, latitude, rings[0])
    && !rings.slice(1).some((hole) => pointInRing(longitude, latitude, hole)));
}

function soilProfilePointLayer(feature, latLng) {
  const cluster = Number(feature.properties?.cluster);
  const group = SOIL_CLUSTERS.find((item) => item.id === cluster) || SOIL_CLUSTERS[0];
  const records = Number(feature.properties?.record_count) || 1;
  return L.circleMarker(latLng, {
    radius: Math.min(7.5, 4 + Math.log2(records) * 0.35),
    color: '#ffffff',
    weight: 1.1,
    fillColor: group.color,
    fillOpacity: 0.88
  });
}

function bindSoilProfileTooltip(feature, layer) {
  const properties = feature.properties || {};
  const cluster = SOIL_CLUSTERS.find((item) => item.id === Number(properties.cluster)) || SOIL_CLUSTERS[0];
  const label = safeTooltipText(cluster.label);
  const description = safeTooltipText(cluster.description);
  const soilGroup = safeTooltipText(properties.soil_group || 'No especificado');
  const records = Number(properties.record_count) || 0;
  layer.bindTooltip(
    `<strong>INEGI · perfil histórico</strong><br>${label}<br>${description}<br>${records} registros en esta ubicación<br>Grupo de suelo común: ${soilGroup}`,
    { sticky: true, direction: 'top', className: 'soil-profile-tooltip' }
  );
}

function safeTooltipText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function MapViewController({ selectedState, center }) {
  const map = useMap();
  useEffect(() => {
    if (selectedState === 'México') map.fitBounds(MAP_BOUNDS, { padding: [12, 12] });
    else map.setView(center, 6, { animate: true });
  }, [map, selectedState, center]);
  return null;
}

export default function MapPage({ selectedState = 'México', center = [23.6, -102.5], onStateChange }) {
  const [activeLayer, setActiveLayer] = useState('temperature');
  const activeMetricKey = activeLayer === 'temperature' || activeLayer === 'humidity' || activeLayer === 'precipitation' ? activeLayer : null;
  const metric = activeMetricKey ? METRICS[activeMetricKey] : null;
  const [imageryLayer, setImageryLayer] = useState(IMAGERY_LAYERS[0].id);
  const [satelliteVisible, setSatelliteVisible] = useState(false);
  const [stateBoundaries, setStateBoundaries] = useState(null);
  const [climateByParameter, setClimateByParameter] = useState({});
  const [soilProfileData, setSoilProfileData] = useState(null);
  const [loadingBoundaries, setLoadingBoundaries] = useState(true);
  const [loadingClimate, setLoadingClimate] = useState(true);
  const [loadingSoilProfiles, setLoadingSoilProfiles] = useState(false);
  const [climateRefreshKey, setClimateRefreshKey] = useState(0);
  const [boundaryRefreshKey, setBoundaryRefreshKey] = useState(0);
  const [soilRefreshKey, setSoilRefreshKey] = useState(0);
  const [boundaryError, setBoundaryError] = useState('');
  const [climateError, setClimateError] = useState('');
  const [soilProfileError, setSoilProfileError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetchStateBoundaries(controller.signal)
      .then(setStateBoundaries)
      .catch((error) => { if (error.name !== 'AbortError') setBoundaryError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoadingBoundaries(false); });
    return () => controller.abort();
  }, [boundaryRefreshKey]);

  useEffect(() => {
    if (activeLayer !== 'soil' || soilProfileData) return undefined;
    const controller = new AbortController();
    setSoilProfileError('');
    setLoadingSoilProfiles(true);
    fetchHistoricalSoilProfiles(controller.signal)
      .then(setSoilProfileData)
      .catch((error) => { if (error.name !== 'AbortError') setSoilProfileError(error.message || 'No fue posible leer los perfiles históricos de INEGI.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingSoilProfiles(false); });
    return () => controller.abort();
  }, [activeLayer, soilProfileData, soilRefreshKey]);

  useEffect(() => {
    if (!metric) return undefined;
    const parameter = metric.parameter;
    if (climateByParameter[parameter]) {
      setLoadingClimate(false);
      return undefined;
    }
    const controller = new AbortController();
    setClimateError('');
    setLoadingClimate(true);
    fetchNationalClimate(parameter, controller.signal)
      .then((payload) => {
        const indexed = indexClimateStates(payload);
        setClimateByParameter((current) => ({ ...current, [parameter]: indexed }));
      })
      .catch((error) => { if (error.name !== 'AbortError') setClimateError(error.message || 'No fue posible consultar NASA POWER.'); })
      .finally(() => { if (!controller.signal.aborted) setLoadingClimate(false); });
    return () => controller.abort();
  }, [activeLayer, metric, climateByParameter, climateRefreshKey]);

  const stateClimate = useMemo(
    () => stateBoundaries && Object.keys(climateByParameter).length ? attachClimateData(stateBoundaries, climateByParameter) : null,
    [stateBoundaries, climateByParameter]
  );
  const breaks = useMemo(() => stateClimate && activeMetricKey ? quantileBreaks(stateClimate.features, activeMetricKey) : [], [stateClimate, activeMetricKey]);
  const selectedFeature = selectedState === 'México' ? null : stateClimate?.features.find((feature) => normalizeName(feature.properties?.nomgeo) === normalizeName(selectedState));
  const selectedClimate = selectedFeature?.properties?.climate;
  const displayError = boundaryError || (activeLayer === 'soil' ? soilProfileError : climateError);
  const nasaCenterCount = metric ? climateByParameter[metric.parameter]?.spatial_query?.nasa_centers || 0 : 0;
  const activeDataset = metric ? climateByParameter[metric.parameter] : null;
  const climatePartial = Boolean(activeDataset?.states.some((state) => state.valid_days < activeDataset.period.days));
  const period = activeDataset?.period;
  const periodLabel = period
    ? `${period.start.slice(6, 8)}/${period.start.slice(4, 6)}/${period.start.slice(0, 4)} – ${period.end.slice(6, 8)}/${period.end.slice(4, 6)}/${period.end.slice(0, 4)}`
    : 'últimos 7 días disponibles';

  const soilProfilesForView = useMemo(() => {
    if (!soilProfileData?.features) return null;
    if (selectedState === 'México' || !stateBoundaries) return soilProfileData.features;
    const boundary = stateBoundaries.features.find((feature) => normalizeName(feature.properties?.nomgeo) === normalizeName(selectedState));
    if (!boundary?.geometry) return soilProfileData.features;
    return soilProfileData.features.filter((feature) => {
      const coordinates = feature.geometry?.coordinates;
      return Array.isArray(coordinates) && geometryContainsPoint(boundary.geometry, coordinates[0], coordinates[1]);
    });
  }, [soilProfileData, selectedState, stateBoundaries]);

  const soilProfileSummary = useMemo(() => {
    const summary = { locations: soilProfilesForView?.length || 0, records: 0, clusters: { 0: 0, 1: 0, 2: 0 } };
    soilProfilesForView?.forEach((feature) => {
      const properties = feature.properties || {};
      summary.records += Number(properties.record_count) || 0;
      Object.entries(properties.cluster_counts || {}).forEach(([cluster, count]) => {
        summary.clusters[cluster] = (summary.clusters[cluster] || 0) + (Number(count) || 0);
      });
    });
    return summary;
  }, [soilProfilesForView]);

  const stateStyle = (feature) => {
    const name = feature.properties?.nomgeo || 'Estado';
    const isSelected = selectedState !== 'México' && normalizeName(name) === normalizeName(selectedState);
    const value = activeMetricKey ? getMetricValue(feature, activeMetricKey) : null;
    return {
      color: isSelected ? '#173e31' : '#ffffff',
      weight: isSelected ? 2.6 : 1.2,
      opacity: 1,
      fillColor: activeLayer === 'soil' ? '#9cbda7' : colorForValue(value, breaks),
      fillOpacity: activeLayer === 'soil' ? 0.06 : 0.88
    };
  };

  function onEachState(feature, layer) {
    const name = feature.properties?.nomgeo;
    layer.bindTooltip(name || 'Entidad federativa', { sticky: true, direction: 'auto' });
    layer.on('click', () => {
      if (name) onStateChange?.(displayStateName(name));
    });
  }

  const MetricIcon = metric?.icon || Layers;
  const value = selectedClimate?.[activeMetricKey]?.value;

  return (
    <section className="map-page">
      <div className="map-heading">
        <div>
          <span className="map-eyebrow">EXPLORACIÓN GEOGRÁFICA · MÉXICO</span>
          <h1>Condiciones ambientales por estado</h1>
          <p className="map-subtitle">Selecciona una entidad para consultar los datos NASA y compararla con el resto del país.</p>
        </div>
        <div className="map-source"><Satellite size={17} />NASA POWER · INEGI</div>
      </div>

      <div className={`map-indicator-strip ${activeLayer === 'temperature' ? 'temperature-active' : ''}`}>
        <span className="map-indicator-icon"><MetricIcon size={19} /></span>
        <div className="map-indicator-copy">
          <strong>{activeLayer === 'soil' ? 'Calidad histórica del suelo' : metric?.shortLabel}</strong>
          <small>{activeLayer === 'soil' ? 'INEGI · perfiles históricos · grupos químicos exploratorios' : `NASA POWER · ${metric?.parameter} · ${periodLabel}`}</small>
        </div>
      </div>

      <div className="map-toolbar">
        <div className="map-toolbar-title"><Layers size={18} /><span>Capas y variable</span></div>
        <label className="layer-option data-layer-picker">Variable
          <select value={activeLayer} onChange={(event) => {
            const nextLayer = event.target.value;
            setActiveLayer(nextLayer);
            if (nextLayer !== 'soil') setClimateError('');
          }}>
            <option value="temperature">Temperatura del aire · T2M (°C)</option>
            <option value="humidity">Humedad atmosférica · RH2M (%)</option>
            <option value="precipitation">Precipitación · PRECTOTCORR (mm/7 días)</option>
            <option value="soil">Calidad histórica del suelo · INEGI</option>
          </select>
        </label>
        <label className="layer-option satellite-toggle"><input type="checkbox" checked={satelliteVisible} onChange={(event) => setSatelliteVisible(event.target.checked)} /><Satellite size={16} />Imagen satelital NASA</label>
        {satelliteVisible && <label className="layer-option map-imagery-picker">Base
          <select value={imageryLayer} onChange={(event) => setImageryLayer(event.target.value)}>
            {IMAGERY_LAYERS.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
          </select>
        </label>}
        <span className="grid-resolution">{activeLayer === 'soil' ? 'INEGI · registros históricos' : 'NASA POWER · cuadrícula regional'}</span>
      </div>

      <div className="map-wrapper">
        <MapContainer center={center} zoom={selectedState === 'México' ? 4 : 6} minZoom={4} maxZoom={9} zoomControl={false} scrollWheelZoom={false} className="national-map">
          <MapViewController selectedState={selectedState} center={center} />
          <ZoomControl position="bottomright" />
          {satelliteVisible && <TileLayer
            url={`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${imageryLayer}/default/${recentDate(2)}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`}
            attribution="Imagery: NASA GIBS / NASA Earthdata" maxNativeZoom={9} maxZoom={9}
          />}
          {stateClimate && <GeoJSON
            key={`${activeLayer}-${selectedState}-${breaks.join('-')}`}
            data={stateClimate}
            style={stateStyle}
            onEachFeature={onEachState}
          />}
          {!stateClimate && stateBoundaries && <GeoJSON
            key={`boundaries-${selectedState}`}
            data={stateBoundaries}
            style={(feature) => ({ color: normalizeName(feature.properties?.nomgeo) === normalizeName(selectedState) ? '#173e31' : '#ffffff', weight: 1.3, fillColor: '#dbe9df', fillOpacity: 0.45 })}
            onEachFeature={onEachState}
          />}
          {activeLayer === 'soil' && soilProfileData && soilProfilesForView && <GeoJSON
            key={`soil-profiles-${selectedState}`}
            data={{ ...soilProfileData, features: soilProfilesForView }}
            pointToLayer={soilProfilePointLayer}
            onEachFeature={bindSoilProfileTooltip}
          />}
        </MapContainer>

        <div className={`map-overlay-info map-state-card${activeLayer === 'soil' ? ' map-state-card-soil' : ''}`}>
          <div className="map-state-card-heading"><MapPin size={15} /><strong>{selectedState === 'México' ? 'México · 32 entidades' : selectedState}</strong></div>
          <div className="map-state-reading">
            <span>{activeLayer === 'soil' ? 'Ubicaciones con perfiles' : metric?.shortLabel}</span>
            <strong>{activeLayer === 'soil' ? loadingSoilProfiles ? 'Cargando…' : soilProfileSummary.locations.toLocaleString('en-US') : selectedState === 'México' ? 'Selecciona un estado' : loadingClimate ? 'Consultando…' : Number.isFinite(value) ? `${value.toFixed(1)} ${metric?.unit}` : 'Sin datos'}</strong>
          </div>
          <div className="map-state-card-meta">
            <div><span>{activeLayer === 'soil' ? 'Registros' : 'Cobertura'}</span><strong>{activeLayer === 'soil' ? soilProfileSummary.records.toLocaleString('en-US') : selectedClimate?.[activeMetricKey] ? `${selectedClimate[activeMetricKey].coveragePct.toFixed(1)}% · ${selectedClimate[activeMetricKey].cells} celdas` : '—'}</strong></div>
            <div><span>{activeLayer === 'soil' ? 'Fuente' : 'Días válidos'}</span><strong>{activeLayer === 'soil' ? 'INEGI histórico' : (selectedClimate?.[activeMetricKey]?.days ? `${selectedClimate[activeMetricKey].days} de ${period?.days || 7}` : '—')}</strong></div>
          </div>
        </div>
        {(loadingBoundaries || loadingSoilProfiles || (loadingClimate && activeLayer !== 'soil')) && <div className="map-loading"><span className="map-spinner" />{loadingBoundaries ? 'Cargando mapa estatal…' : loadingSoilProfiles ? 'Leyendo perfiles históricos…' : 'Consultando variables NASA…'}</div>}
      </div>

      <div className="map-bottom">
        {activeLayer !== 'soil' ? <div className="state-map-legend" aria-label={`Leyenda de ${metric?.label}`}>
          <div className="legend-heading"><strong>{metric?.label}</strong><small>{metric?.parameter} · {metric?.unit} · quintiles del periodo</small></div>
          <div className="state-legend-swatches">{TEMPERATURE_COLORS.map((item) => <span key={item.label} style={{ background: item.color }} title={item.label} />)}</div>
          <div className="state-legend-labels">{TEMPERATURE_COLORS.map((item) => <span key={item.label}>{item.label}</span>)}</div>
          <small className="legend-footnote">{loadingClimate ? 'Calculando valores por estado…' : `${nasaCenterCount.toLocaleString('en-US')} centros de cuadrícula NASA · ${periodLabel}`}</small>
        </div> : <div className="state-map-legend soil-map-legend soil-quality-legend">
          <strong>Grupos químicos exploratorios</strong>
          <small>INEGI · agrupación K-means. Descripciones basadas en medianas; unidades de origen por verificar.</small>
          <div className="soil-cluster-key">{SOIL_CLUSTERS.map((cluster) => <span key={cluster.id} title={cluster.description}><i style={{ background: cluster.color }} /><span><b>{cluster.shortLabel}</b><small>{cluster.description}</small></span><strong>{(soilProfileSummary.clusters[cluster.id] || 0).toLocaleString('en-US')}</strong></span>)}</div>
          <small className="legend-footnote">{soilProfileSummary.locations.toLocaleString('en-US')} ubicaciones · {soilProfileSummary.records.toLocaleString('en-US')} registros históricos</small>
        </div>}

        <div className="map-notice"><Info size={17} /><p>{activeLayer === 'soil'
          ? 'Los perfiles son históricos. Los colores representan grupos químicos exploratorios calculados con K-means; no son una clasificación oficial, una medición actual ni un diagnóstico de calidad del suelo.'
          : `Los tonos muestran quintiles relativos entre estados para el periodo consultado. El valor de cada estado se calcula ponderando por superficie las intersecciones entre sus límites y las celdas NASA POWER.${climatePartial ? ' Algunas fechas no tienen datos válidos en todos los estados.' : ''}`}</p></div>
        {displayError && <div className="map-error" role="alert"><span>{displayError}</span><button type="button" onClick={() => {
          if (boundaryError) { setBoundaryError(''); setLoadingBoundaries(true); setBoundaryRefreshKey((key) => key + 1); }
          if (climateError && metric) { setClimateByParameter((current) => { const next = { ...current }; delete next[metric.parameter]; return next; }); setClimateError(''); setLoadingClimate(true); setClimateRefreshKey((key) => key + 1); }
          if (soilProfileError) { setSoilProfileError(''); setSoilProfileData(null); setLoadingSoilProfiles(true); setSoilRefreshKey((key) => key + 1); }
        }}>Reintentar</button></div>}
        <p className="map-source-note">{activeLayer === 'soil' ? 'Fuente del suelo: perfiles históricos de INEGI · registros por ubicación; grupos K-means exploratorios.' : 'Límites estatales: INEGI. Clima nacional: NASA POWER Daily Regional · promedio ponderado por área de intersección.'}</p>
        {stateBoundaries && stateBoundaries.features.length < 32 && <p className="map-source-note">INEGI devolvió {stateBoundaries.features.length} de las 32 entidades.</p>}
      </div>
    </section>
  );
}
