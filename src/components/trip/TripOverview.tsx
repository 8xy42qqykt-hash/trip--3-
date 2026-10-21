import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowsOut, CloudSun, MapTrifold, X } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { useTrip } from '../../context/TripContext';
import { MemberProfileSheet } from '../common/MemberProfileSheet';
import { useTripLocations, type SharedTripLocation } from './useTripLocations';
import { Profile } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { PhotoLightbox } from '../common/PhotoLightbox';
import { TripMemberStack } from '../common/TripMemberStack';

type ForecastHour = { time: string; temperature: number };
type ForecastDay = {
  date: string;
  maximum: number;
  minimum: number;
  average: number;
  currentTemperature: number | null;
  code: number;
  hours: ForecastHour[];
};

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
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!isExpanded || !mapElementRef.current || mapRef.current) return;
    const map = L.map(mapElementRef.current, { zoomControl: false, preferCanvas: true }).setView([20, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(mapElementRef.current);
    const resizeTimer = window.setTimeout(() => map.invalidateSize({ pan: false }), 500);
    return () => {
      window.clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
  }, [isExpanded]);

  const fitLocations = useCallback(() => {
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
    if (points.length === 1) map.setView(points[0], isExpanded ? 14 : 13);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(isExpanded ? 0.12 : 0.2), { maxZoom: isExpanded ? 15 : 13 });
  }, [isExpanded, locations, members, onMemberClick]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      mapRef.current?.invalidateSize({ pan: false });
      fitLocations();
    });
    const resizeTimer = window.setTimeout(() => {
      mapRef.current?.invalidateSize({ pan: false });
      fitLocations();
    }, 250);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(resizeTimer);
    };
  }, [fitLocations]);

  return (
    isExpanded ? (
      <div
        data-no-edge-swipe
        className="fixed inset-0 z-[11000] flex flex-col bg-black p-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]"
      >
        <div
          ref={mapElementRef}
          className="relative z-0 min-h-0 flex-1 isolate w-full overflow-hidden rounded-2xl bg-[#101116]"
          aria-label={t('Trip members map')}
        />
        <button
          type="button"
          aria-label={t('Close map')}
          title={t('Close map')}
          onClick={() => setIsExpanded(false)}
          className="absolute right-6 top-[calc(env(safe-area-inset-top,0px)+1.5rem)] z-[1200] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/80 text-white shadow-lg backdrop-blur-xl active:scale-95"
        >
          <X size={19} weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="mt-3 min-h-11 shrink-0 rounded-xl bg-white/10 text-sm font-semibold text-white"
        >
          {t('Done')}
        </button>
      </div>
    ) : (
      <button
        type="button"
        data-no-edge-swipe
        onClick={() => setIsExpanded(true)}
        className="flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 active:scale-[0.98]"
      >
        <MapTrifold size={17} weight="duotone" className="text-[#0A84FF]" />
        <span>{t('Expand map')}</span>
        <ArrowsOut size={15} className="ml-1 text-slate-500" />
      </button>
    )
  );
};

export const TripOverview: React.FC = () => {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const { currentTrip, tripMembers, messages } = useTrip();
  const locations = useTripLocations(currentTrip?.id);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [selectedForecast, setSelectedForecast] = useState<ForecastDay | null>(null);
  const [error, setError] = useState('');
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [isTitleCollapsed, setIsTitleCollapsed] = useState(false);
  const lastWeatherCoordsRef = useRef('');
  const daySwipeStartRef = useRef<number | null>(null);

  const sharedPhotos = useMemo(
    () => messages.filter((message) => message.type === 'image' && message.image_url),
    [messages],
  );
  const ownLocation = locations.find((location) => location.user_id === user?.id);
  const markerClick = useCallback((userId: string) => setSelectedProfileId(userId), []);

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
        current: 'temperature_2m',
        hourly: 'temperature_2m',
        forecast_days: '5',
        timezone: 'auto',
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Weather request failed (${response.status}).`);
      const result = await response.json() as {
        daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weather_code: number[] };
        current: { temperature_2m: number };
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
          currentTemperature: index === 0 ? Math.round(result.current.temperature_2m) : null,
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

  if (!currentTrip) return null;

  return (
    <div
      onScroll={(event) => setIsTitleCollapsed(event.currentTarget.scrollTop > 40)}
      className="h-full overflow-y-auto bg-black px-4 pb-32 text-white"
    >
      <header
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        className="sticky top-0 isolate z-20 -mx-4 mb-4 shrink-0 px-4"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-8 -bottom-16"
          style={{
            backgroundImage: 'linear-gradient(to bottom, rgba(0,0,0,0.98) 0%, rgba(0,0,0,0.94) 36%, rgba(0,0,0,0.72) 62%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div className="relative z-10 flex h-14 w-full items-center justify-between px-3.5">
          <div aria-hidden="true" className="w-14" />
          <div className="absolute left-1/2 flex max-w-[calc(100%-8rem)] -translate-x-1/2 flex-col truncate text-center">
            <span className={`truncate text-base font-bold tracking-tight text-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              isTitleCollapsed ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-2 scale-95 opacity-0'
            }`}>{currentTrip.name}</span>
            <TripMemberStack members={tripMembers} />
          </div>
          <div aria-hidden="true" className="w-14" />
        </div>
      </header>

      <h1 className={`mb-5 origin-center text-center text-3xl font-extrabold tracking-tight text-white transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isTitleCollapsed ? 'pointer-events-none -translate-y-3 scale-[0.96] opacity-0' : 'translate-y-0 scale-100 opacity-100'
      }`}>
        {currentTrip.name}
      </h1>

      <section data-no-edge-swipe className="mb-7">
        <div className="mb-3 flex items-center gap-2">
          <CloudSun size={20} className="text-[#0A84FF]" />
          <h2 className="text-lg font-bold">{t('Weather')}</h2>
        </div>
        {forecast.length ? (
          <>
            <div
              onPointerDown={(event) => {
                daySwipeStartRef.current = event.clientX;
              }}
              onPointerUp={(event) => {
                const startX = daySwipeStartRef.current;
                daySwipeStartRef.current = null;
                if (startX === null || Math.abs(event.clientX - startX) < 44 || !selectedForecast) return;
                const selectedIndex = forecast.findIndex((day) => day.date === selectedForecast.date);
                const nextIndex = selectedIndex + (event.clientX < startX ? 1 : -1);
                if (forecast[nextIndex]) setSelectedForecast(forecast[nextIndex]);
              }}
              onPointerCancel={() => {
                daySwipeStartRef.current = null;
              }}
              className="mb-4 flex touch-pan-y justify-between gap-1 border-b border-white/[0.08] px-1 pb-2"
              style={{ scrollbarWidth: 'none', touchAction: 'pan-x' }}
            >
              {forecast.map((day) => {
                const selected = selectedForecast?.date === day.date;
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedForecast(day)}
                    aria-pressed={selected}
                    className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center text-center transition-[transform,color] duration-200 ${
                      selected ? 'scale-105 text-white' : 'text-slate-500'
                    }`}
                  >
                    <span className={`text-xs uppercase leading-none ${selected ? 'font-bold' : 'font-medium'}`}>
                      {new Date(`${day.date}T12:00:00`).toLocaleDateString(language === 'fi' ? 'fi-FI' : 'en-US', { weekday: 'short' }).slice(0, 3)}
                    </span>
                    <span className={`mt-1.5 leading-none ${selected ? 'text-lg font-extrabold' : 'text-base font-medium'}`}>
                      {new Date(`${day.date}T12:00:00`).getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
            {selectedForecast && (
              <div className="pt-1">
                <p className="text-lg font-bold text-white">
                  {new Date(`${selectedForecast.date}T12:00:00`).toLocaleDateString(language === 'fi' ? 'fi-FI' : 'en-US', { dateStyle: 'full' })}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-400">{t(weatherDescription(selectedForecast.code))}</p>
                <div className="mt-4 flex items-end gap-5">
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('High')}</span>
                    <span className="text-3xl font-extrabold tracking-tight">{selectedForecast.maximum}°</span>
                  </div>
                  <div>
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('Low')}</span>
                    <span className="text-3xl font-extrabold tracking-tight text-slate-400">{selectedForecast.minimum}°</span>
                  </div>
                  <div className="ml-auto pb-1 text-right">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t('Average')}</span>
                    <span className="text-lg font-bold">{selectedForecast.average}°</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-x-2 gap-y-3 border-t border-white/[0.08] pt-3">
                  {selectedForecast.hours.map((hour) => (
                    <div key={hour.time} className="min-w-0 text-center">
                      <span className="block text-[11px] text-slate-400">{hour.time}</span>
                      <span className="mt-0.5 block text-sm font-semibold text-slate-200">{hour.temperature}°</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="rounded-2xl bg-white/[0.06] p-4 text-sm text-slate-400">
            {t(isLoadingWeather ? 'Loading forecast…' : 'A trip member must enable location sharing in Settings to show local weather.')}
          </p>
        )}
      </section>

      <section className="mb-7">
        <div className="mb-3">
          <h2 className="text-lg font-bold">{t('Trip map')}</h2>
          <p className="text-xs text-slate-400">{t('Members who share their location appear on the map.')}</p>
        </div>
        <TripLocationMap locations={locations} members={tripMembers} onMemberClick={markerClick} />
        {!locations.length && <p className="mt-3 text-sm text-slate-500">{t('No one is sharing a location yet. Manage sharing in Settings.')}</p>}
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-bold">{t('Trip collection')}</h2>
        {sharedPhotos.length ? (
          <div className="-mx-4 grid auto-rows-[72px] grid-cols-2 gap-x-1 gap-y-1 px-4">
            {sharedPhotos.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => photo.image_url && setSelectedPhoto(photo.image_url)}
                aria-label={t('View shared trip photo')}
                className={`trip-photo-card min-h-0 min-w-0 overflow-visible bg-transparent ${
                  sharedPhotos.length === 1 || (sharedPhotos.length > 3 && index % 5 === 0)
                    ? 'col-span-2 row-span-3'
                    : sharedPhotos.length === 2 ? 'row-span-3' : 'row-span-2'
                }`}
                style={{
                  '--photo-rotation': `${((index % 5) - 2) * 1.2}deg`,
                  '--photo-scale': index % 4 === 0 ? 0.94 : index % 4 === 2 ? 1.02 : 1,
                  animationDelay: `${Math.min(index * 45, 450)}ms`,
                  zIndex: index % 3,
                } as React.CSSProperties}
              >
                <img
                  src={photo.image_url || ''}
                  alt="Shared trip photo"
                  loading="lazy"
                  className="h-full w-full rounded-[20px] object-cover shadow-[0_12px_28px_rgba(0,0,0,0.62)]"
                />
              </button>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">{t('Photos shared in chat appear here.')}</p>}
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-950/70 p-3 text-sm text-red-200">{t(error)}</p>}

      <MemberProfileSheet
        profile={tripMembers.find((member) => member.user_id === selectedProfileId)?.profile || null}
        location={locations.find((location) => location.user_id === selectedProfileId)}
        onClose={() => setSelectedProfileId(null)}
      />

      {selectedPhoto && <PhotoLightbox imageUrl={selectedPhoto} onClose={() => setSelectedPhoto(null)} />}
    </div>
  );
};
