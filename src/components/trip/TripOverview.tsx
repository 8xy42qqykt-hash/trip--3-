import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CaretDown, CaretLeft, CloudSun, Download, X } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { useTrip } from '../../context/TripContext';
import { MemberProfileSheet } from '../common/MemberProfileSheet';
import { useTripLocations, type SharedTripLocation } from './useTripLocations';
import { Profile } from '../../types';

type ForecastHour = { time: string; temperature: number };
type ForecastDay = {
  date: string;
  maximum: number;
  minimum: number;
  average: number;
  code: number;
  hours: ForecastHour[];
};

let photoDownloadSequence = 0;

const timeAgo = (timestamp: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

const weatherDescription = (code: number) => {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Fog';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  if (code <= 99) return 'Thunderstorm';
  return 'Weather';
};

const mapMarker = (profile: Profile, updatedAt: string) => {
  const marker = document.createElement('div');
  marker.className = 'trip-location-marker';
  marker.title = profile.display_name;
  const avatar = document.createElement('div');
  avatar.className = 'trip-location-marker-avatar';
  if (profile.avatar_url) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    avatar.append(image);
  } else {
    avatar.textContent = (profile.display_name || 'U').charAt(0).toUpperCase();
    avatar.style.backgroundColor = profile.color || '#0A84FF';
  }
  const updated = document.createElement('span');
  updated.className = 'trip-location-marker-time';
  updated.textContent = timeAgo(updatedAt);
  marker.append(avatar, updated);
  return L.divIcon({ className: '', html: marker, iconSize: [52, 58], iconAnchor: [26, 29] });
};

const TripLocationMap: React.FC<{
  locations: SharedTripLocation[];
  members: ReturnType<typeof useTrip>['tripMembers'];
  onMemberClick: (userId: string) => void;
}> = ({ locations, members, onMemberClick }) => {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    const map = L.map(mapElementRef.current, { zoomControl: false }).setView([20, 0], 2);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resizeTimer = window.setTimeout(() => map.invalidateSize(), 100);
    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markers = markersRef.current;
    if (!map || !markers) return;
    markers.clearLayers();
    const points: L.LatLngExpression[] = [];
    for (const location of locations) {
      if (location.latitude === null || location.longitude === null) continue;
      const profile = members.find((member) => member.user_id === location.user_id)?.profile;
      if (!profile) continue;
      const point: L.LatLngExpression = [location.latitude, location.longitude];
      points.push(point);
      L.marker(point, { icon: mapMarker(profile, location.updated_at) })
        .on('click', () => onMemberClick(profile.id))
        .addTo(markers);
    }
    if (points.length === 1) map.setView(points[0], 13);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 13 });
  }, [locations, members, onMemberClick]);

  return (
    <div
      ref={mapElementRef}
      className="relative z-0 isolate h-72 w-full rounded-[22px] bg-[#17171a]"
      aria-label="Trip members map"
    />
  );
};

export const TripOverview: React.FC = () => {
  const { user } = useAuth();
  const { currentTrip, tripMembers, messages, exitTrip } = useTrip();
  const locations = useTripLocations(currentTrip?.id);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [selectedForecast, setSelectedForecast] = useState<ForecastDay | null>(null);
  const [isWeatherExpanded, setIsWeatherExpanded] = useState(false);
  const [error, setError] = useState('');
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const lastWeatherCoordsRef = useRef('');

  const sharedPhotos = useMemo(
    () => messages.filter((message) => message.type === 'image' && message.image_url),
    [messages],
  );
  const ownLocation = locations.find((location) => location.user_id === user?.id);
  const markerClick = (userId: string) => setSelectedProfileId(userId);

  const loadWeather = async (latitude: number, longitude: number) => {
    const coordinateKey = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
    if (lastWeatherCoordsRef.current === coordinateKey) return;
    lastWeatherCoordsRef.current = coordinateKey;
    setIsLoadingWeather(true);
    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        daily: 'temperature_2m_max,temperature_2m_min,weather_code',
        hourly: 'temperature_2m',
        forecast_days: '5',
        timezone: 'auto',
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Weather request failed (${response.status}).`);
      const result = await response.json() as {
        daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] };
        hourly: { time: string[]; temperature_2m: number[] };
      };
      const days = result.daily.time.map((date, index) => {
        const hours = result.hourly.time.flatMap((time, hourIndex) => (
          time.startsWith(date) && hourIndex % 3 === 0
            ? [{ time: time.slice(11, 16), temperature: Math.round(result.hourly.temperature_2m[hourIndex]) }]
            : []
        ));
        const maximum = Math.round(result.daily.temperature_2m_max[index]);
        const minimum = Math.round(result.daily.temperature_2m_min[index]);
        return {
          date,
          maximum,
          minimum,
          average: Math.round((maximum + minimum) / 2),
          code: result.daily.weather_code[index],
          hours,
        };
      });
      setForecast(days);
      setSelectedForecast((selected) => days.find((day) => day.date === selected?.date) || days[0] || null);
    } catch (fetchError) {
      console.error('Could not load trip weather:', fetchError);
      lastWeatherCoordsRef.current = '';
      setError('Could not load the five-day forecast.');
    } finally {
      setIsLoadingWeather(false);
    }
  };

  useEffect(() => {
    const location = ownLocation || locations.find((item) => item.latitude !== null && item.longitude !== null);
    if (location && location.latitude !== null && location.longitude !== null) {
      void loadWeather(location.latitude, location.longitude);
    }
  }, [locations, ownLocation]);

  const downloadSelectedPhoto = async () => {
    if (!selectedPhoto) return;
    setIsDownloading(true);
    try {
      const response = await fetch(selectedPhoto);
      if (!response.ok) throw new Error(`Could not download photo (${response.status}).`);
      const blob = await response.blob();
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = `trip-photo-${++photoDownloadSequence}.${extension}`;
      const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], title: 'Save trip photo' });
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) {
      console.error('Could not download trip photo:', downloadError);
      setError(downloadError instanceof Error ? downloadError.message : 'Could not download this photo.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (!currentTrip) return null;

  return (
    <div className="h-full overflow-y-auto bg-black px-4 pb-32 text-white">
      <header
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className="sticky top-0 isolate z-20 -mx-4 mb-4 shrink-0 px-4"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(to bottom, #000000 0%, rgba(0, 0, 0, 0.94) 42%, rgba(0, 0, 0, 0) 100%)',
            backdropFilter: 'blur(28px) saturate(180%)',
            WebkitBackdropFilter: 'blur(28px) saturate(180%)',
            maskImage: 'linear-gradient(to bottom, #000 0%, #000 35%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, #000 0%, #000 35%, transparent 100%)',
          }}
        />
        <div className="relative z-10 flex h-14 w-full items-center justify-between px-3.5">
          <button type="button" onClick={exitTrip} className="-ml-1 flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-[#0A84FF] active:opacity-70">
            <CaretLeft size={20} weight="bold" /> <span>Trips</span>
          </button>
          <div className="flex max-w-[200px] flex-col truncate text-center">
            <span className="truncate text-base font-bold tracking-tight text-white">{currentTrip.name}</span>
            <span className="-mt-0.5 text-[11px] font-medium text-slate-400">{tripMembers.length} {tripMembers.length === 1 ? 'member' : 'members'}</span>
          </div>
          <div className="w-14" />
        </div>
      </header>

      <section className="mb-7">
        <div className="mb-3 flex items-center gap-2">
          <CloudSun size={20} className="text-[#0A84FF]" />
          <h2 className="text-lg font-bold">Weather</h2>
        </div>
        {forecast.length ? (
          <>
            <div className="grid grid-cols-5 gap-2">
              {forecast.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedForecast(day)}
                  className={`flex min-h-[68px] min-w-0 flex-col items-center justify-center rounded-2xl px-1 py-2 text-center ${
                    selectedForecast?.date === day.date ? 'bg-[#0A84FF] text-white' : 'text-slate-200'
                  }`}
                >
                  <span className="text-xs font-medium uppercase">
                    {new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 3)}
                  </span>
                  <span className="mt-1 text-sm font-semibold">{day.average}°</span>
                </button>
              ))}
            </div>
            {selectedForecast && (
              <div className="mt-2 overflow-hidden rounded-2xl bg-white/[0.05]">
                <button
                  type="button"
                  aria-expanded={isWeatherExpanded}
                  onClick={() => setIsWeatherExpanded((open) => !open)}
                  className="flex min-h-12 w-full items-center justify-between px-4 text-left"
                >
                  <span className="text-sm font-semibold">
                    {new Date(`${selectedForecast.date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'full' })}
                    <span className="ml-2 font-normal text-slate-400">{weatherDescription(selectedForecast.code)}</span>
                  </span>
                  <CaretDown size={18} className={`shrink-0 text-slate-400 transition-transform ${isWeatherExpanded ? 'rotate-180' : ''}`} />
                </button>
                {isWeatherExpanded && (
                  <div className="border-t border-white/[0.08] px-4 pb-4 pt-3">
                    <p className="mb-3 text-xs text-slate-400">
                      Average {selectedForecast.average}°C · High {selectedForecast.maximum}°C · Low {selectedForecast.minimum}°C
                    </p>
                    <div className="grid grid-cols-4 gap-x-2 gap-y-3">
                      {selectedForecast.hours.map((hour) => (
                        <div key={hour.time} className="text-center">
                          <span className="block text-[11px] text-slate-400">{hour.time}</span>
                          <span className="mt-0.5 block text-sm font-semibold">{hour.temperature}°C</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="rounded-2xl bg-white/[0.06] p-4 text-sm text-slate-400">
            {isLoadingWeather ? 'Loading forecast…' : 'A trip member must enable location sharing in Settings to show local weather.'}
          </p>
        )}
      </section>

      <section className="mb-7">
        <div className="mb-3">
          <h2 className="text-lg font-bold">Trip map</h2>
          <p className="text-xs text-slate-400">Members who share their location appear on the map.</p>
        </div>
        <TripLocationMap locations={locations} members={tripMembers} onMemberClick={markerClick} />
        {!locations.length && <p className="mt-3 text-sm text-slate-500">No one is sharing a location yet. Manage sharing in Settings.</p>}
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-bold">Trip collection</h2>
        {sharedPhotos.length ? (
          <div className="columns-2 gap-2">
            {sharedPhotos.map((photo) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => photo.image_url && setSelectedPhoto(photo.image_url)}
                aria-label="View shared trip photo"
                className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-2xl bg-white/[0.06]"
              >
                <img src={photo.image_url || ''} alt="Shared trip photo" loading="lazy" className="mx-auto h-auto max-h-72 w-full object-contain" />
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">Photos shared in chat appear here.</p>}
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-950/70 p-3 text-sm text-red-200">{error}</p>}

      <MemberProfileSheet
        profile={tripMembers.find((member) => member.user_id === selectedProfileId)?.profile || null}
        location={locations.find((location) => location.user_id === selectedProfileId)}
        onClose={() => setSelectedProfileId(null)}
      />

      {selectedPhoto && (
        <div className="fixed inset-0 z-[11000] flex flex-col items-center justify-center bg-black/95 p-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
          <div className="flex w-full max-w-3xl items-center justify-end gap-2 pb-3">
            <button type="button" onClick={() => void downloadSelectedPhoto()} disabled={isDownloading} className="flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm font-semibold text-white disabled:opacity-60">
              <Download size={18} /> {isDownloading ? 'Saving…' : 'Save photo'}
            </button>
            <button type="button" onClick={() => setSelectedPhoto(null)} aria-label="Close photo" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
              <X size={20} />
            </button>
          </div>
          <img src={selectedPhoto} alt="Shared trip photo" className="max-h-[82dvh] max-w-full object-contain" />
        </div>
      )}
    </div>
  );
};
