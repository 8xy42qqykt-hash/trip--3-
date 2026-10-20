import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Plus, CloudSun } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { useTrip } from '../../context/TripContext';
import { Avatar } from '../common/Avatar';
import { BottomSheet } from '../common/BottomSheet';
import { MemberProfileSheet } from '../common/MemberProfileSheet';
import { supabase } from '../../lib/supabase';
import { useTripLocations, type SharedTripLocation } from './useTripLocations';
import { Profile } from '../../types';

type ForecastDay = {
  date: string;
  maximum: number;
  minimum: number;
  code: number;
};

type WhereaboutsEntry = {
  id: string;
  user_id: string;
  message: string;
  created_at: string;
};

let whereaboutsSubscriptionSequence = 0;

const timeAgo = (timestamp: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.floor(hours / 24)} days ago`;
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

const mapMarker = (profile: Profile) => {
  const marker = document.createElement('div');
  marker.className = 'trip-location-marker';
  marker.title = profile.display_name;
  if (profile.avatar_url) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    marker.append(image);
  } else {
    marker.textContent = (profile.display_name || 'U').charAt(0).toUpperCase();
    marker.style.backgroundColor = profile.color || '#0A84FF';
  }
  return L.divIcon({ className: '', html: marker, iconSize: [40, 40], iconAnchor: [20, 20] });
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
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
      L.marker(point, { icon: mapMarker(profile) })
        .bindTooltip(`${profile.display_name} · ${timeAgo(location.updated_at)}`)
        .on('click', () => onMemberClick(profile.id))
        .addTo(markers);
    }
    if (points.length === 1) map.setView(points[0], 13);
    if (points.length > 1) map.fitBounds(L.latLngBounds(points).pad(0.2), { maxZoom: 13 });
  }, [locations, members, onMemberClick]);

  return <div ref={mapElementRef} className="h-72 w-full rounded-[22px] bg-[#17171a]" aria-label="Trip members map" />;
};

export const TripOverview: React.FC = () => {
  const { user } = useAuth();
  const { currentTrip, tripMembers, messages } = useTrip();
  const locations = useTripLocations(currentTrip?.id);
  const [forecast, setForecast] = useState<ForecastDay[]>([]);
  const [selectedForecast, setSelectedForecast] = useState<ForecastDay | null>(null);
  const [whereabouts, setWhereabouts] = useState<WhereaboutsEntry[]>([]);
  const [whereaboutsText, setWhereaboutsText] = useState('');
  const [isWhereaboutsOpen, setIsWhereaboutsOpen] = useState(false);
  const [error, setError] = useState('');
  const [isLoadingWeather, setIsLoadingWeather] = useState(false);
  const lastWeatherCoordsRef = useRef('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const sharedPhotos = useMemo(
    () => messages.filter((message) => message.type === 'image' && message.image_url),
    [messages],
  );

  const ownLocation = locations.find((location) => location.user_id === user?.id);

  const loadWhereabouts = async () => {
    if (!currentTrip || !supabase) return;
    const { data, error: loadError } = await supabase
      .from('trip_whereabouts')
      .select('id, user_id, message, created_at')
      .eq('trip_id', currentTrip.id)
      .order('created_at', { ascending: false });
    if (loadError) {
      console.error('Could not load trip whereabouts:', loadError);
      setError('Could not load trip updates.');
      return;
    }
    setWhereabouts(data || []);
  };

  useEffect(() => {
    void loadWhereabouts();
    if (!currentTrip || !supabase) return;
    const subscriptionId = ++whereaboutsSubscriptionSequence;
    const channel = supabase
      .channel(`trip-whereabouts:${currentTrip.id}:${subscriptionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_whereabouts',
        filter: `trip_id=eq.${currentTrip.id}`,
      }, () => { void loadWhereabouts(); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [currentTrip?.id]);

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
        forecast_days: '5',
        timezone: 'auto',
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
      if (!response.ok) throw new Error(`Weather request failed (${response.status}).`);
      const result = await response.json();
      const days = (result.daily.time as string[]).map((date, index) => ({
        date,
        maximum: Math.round(result.daily.temperature_2m_max[index]),
        minimum: Math.round(result.daily.temperature_2m_min[index]),
        code: result.daily.weather_code[index],
      }));
      setForecast(days);
      setSelectedForecast((selected) => selected || days[0] || null);
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

  const startLocationSharing = () => {
    if (!navigator.geolocation || !user || !currentTrip || !supabase) {
      setError('Location sharing is not supported by this browser.');
      return;
    }
    const client = supabase;
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const { error: saveError } = await client.from('trip_member_locations').upsert({
          trip_id: currentTrip.id,
          user_id: user.id,
          sharing: true,
          latitude,
          longitude,
          accuracy_m: accuracy,
          updated_at: new Date().toISOString(),
        });
        if (saveError) {
          console.error('Could not share trip location:', saveError);
          setError('Could not save your location. Check your connection and try again.');
          return;
        }
        void loadWeather(latitude, longitude);
      },
      (locationError) => {
        console.error('Could not read device location:', locationError);
        setError(locationError.code === locationError.PERMISSION_DENIED
          ? 'Allow location access in your device settings to share your location.'
          : 'Could not get your location. Check device location services and try again.');
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
  };

  const stopLocationSharing = async () => {
    if (!user || !currentTrip || !supabase) return;
    const { error: stopError } = await supabase.from('trip_member_locations').upsert({
      trip_id: currentTrip.id,
      user_id: user.id,
      sharing: false,
      latitude: null,
      longitude: null,
      accuracy_m: null,
      updated_at: new Date().toISOString(),
    });
    if (stopError) {
      console.error('Could not stop sharing trip location:', stopError);
      setError('Could not turn off location sharing.');
    }
  };

  const submitWhereabouts = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = whereaboutsText.trim();
    if (!message || !user || !currentTrip || !supabase) return;
    const { error: insertError } = await supabase.from('trip_whereabouts').insert({
      trip_id: currentTrip.id,
      user_id: user.id,
      message,
    });
    if (insertError) {
      console.error('Could not post trip whereabouts:', insertError);
      setError('Could not post your update.');
      return;
    }
    setWhereaboutsText('');
    setIsWhereaboutsOpen(false);
    void loadWhereabouts();
  };

  if (!currentTrip) return null;

  return (
    <div className="h-full overflow-y-auto bg-black px-4 pb-32 pt-safe text-white">
      <header className="sticky top-0 z-20 -mx-4 mb-4 px-4 pt-3 pb-3" style={{
        background: 'linear-gradient(to bottom, #000 0%, rgba(0,0,0,.92) 65%, transparent)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}>
        <h1 className="text-xl font-bold">{currentTrip.name}</h1>
        <p className="text-xs text-slate-400">{tripMembers.length} trip members</p>
      </header>

      <section className="mb-7">
        <div className="mb-3 flex items-center gap-2">
          <CloudSun size={20} className="text-[#0A84FF]" />
          <h2 className="text-lg font-bold">Weather</h2>
        </div>
        {forecast.length ? (
          <>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {forecast.map((day) => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setSelectedForecast(day)}
                  className={`min-w-20 rounded-2xl px-3 py-2 text-left text-sm ${
                    selectedForecast?.date === day.date ? 'bg-[#0A84FF] text-white' : 'bg-white/[0.07] text-slate-200'
                  }`}
                >
                  <span className="block text-xs">{new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}</span>
                  <span className="whitespace-nowrap">{day.maximum}° / {day.minimum}°C</span>
                </button>
              ))}
            </div>
            {selectedForecast && (
              <p className="mt-2 text-sm text-slate-300">
                {new Date(`${selectedForecast.date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: 'full' })}
                {' · '}{weatherDescription(selectedForecast.code)}
                {' · '}High {selectedForecast.maximum}°C, low {selectedForecast.minimum}°C
              </p>
            )}
          </>
        ) : (
          <p className="rounded-2xl bg-white/[0.06] p-4 text-sm text-slate-400">
            {isLoadingWeather ? 'Loading forecast…' : 'Share a location to see the local five-day forecast.'}
          </p>
        )}
      </section>

      <section className="mb-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Trip map</h2>
            <p className="text-xs text-slate-400">Locations are shared only when a member opts in.</p>
          </div>
          {ownLocation ? (
            <button type="button" onClick={() => void stopLocationSharing()} className="min-h-10 rounded-full bg-white/10 px-4 text-sm font-semibold">Stop sharing</button>
          ) : (
            <button type="button" onClick={startLocationSharing} className="min-h-10 rounded-full bg-[#0A84FF] px-4 text-sm font-semibold">Share my location</button>
          )}
        </div>
        <TripLocationMap
          locations={locations}
          members={tripMembers}
          onMemberClick={setSelectedProfileId}
        />
        <div className="mt-3 space-y-2">
          {locations.map((location) => {
            const member = tripMembers.find((item) => item.user_id === location.user_id);
            if (!member?.profile) return null;
            return (
              <button
                key={location.user_id}
                type="button"
                onClick={() => setSelectedProfileId(location.user_id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white/[0.06] p-3 text-left"
              >
                <Avatar name={member.profile.display_name} avatarUrl={member.profile.avatar_url} color={member.profile.color} size={38} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{member.profile.display_name}</span>
                <span className="text-xs text-slate-400">{timeAgo(location.updated_at)}</span>
              </button>
            );
          })}
          {!locations.length && <p className="text-sm text-slate-500">No one is sharing a location yet.</p>}
        </div>
      </section>

      <section className="mb-7">
        <h2 className="mb-3 text-lg font-bold">Trip collection</h2>
        {sharedPhotos.length ? (
          <div className="grid grid-cols-3 grid-flow-dense auto-rows-[90px] gap-2">
            {sharedPhotos.map((photo, index) => (
              <a
                key={photo.id}
                href={photo.image_url || '#'}
                target="_blank"
                rel="noreferrer"
                className={`overflow-hidden rounded-2xl bg-white/10 ${index % 5 === 0 ? 'col-span-2 row-span-2' : index % 4 === 0 ? 'row-span-2' : ''}`}
              >
                <img src={photo.image_url || ''} alt="Shared trip photo" loading="lazy" className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">Photos shared in chat appear here.</p>}
      </section>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Where you at?</h2>
            <p className="text-xs text-slate-400">Add a message when you want to share where you are.</p>
          </div>
          <button type="button" onClick={() => setIsWhereaboutsOpen(true)} aria-label="Add whereabouts" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0A84FF]">
            <Plus size={20} weight="bold" />
          </button>
        </div>
        <div className="space-y-3">
          {whereabouts.map((entry) => {
            const profile = tripMembers.find((member) => member.user_id === entry.user_id)?.profile;
            return (
              <div key={entry.id} className="flex items-start gap-3 rounded-2xl bg-white/[0.06] p-3">
                <button
                  type="button"
                  onClick={() => setSelectedProfileId(entry.user_id)}
                  aria-label={`View ${profile?.display_name || 'trip member'} profile`}
                  className="relative shrink-0 rounded-full"
                >
                  <Avatar name={profile?.display_name} avatarUrl={profile?.avatar_url} color={profile?.color} size={38} />
                  <span className="absolute bottom-0 right-0 h-2.5 w-2.5 animate-pulse rounded-full border-2 border-black bg-green-400" />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{profile?.display_name || 'Trip member'}</span>
                    <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(entry.created_at)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-200">{entry.message}</p>
                </div>
              </div>
            );
          })}
          {!whereabouts.length && <p className="text-sm text-slate-500">No location messages yet.</p>}
        </div>
      </section>

      {error && <p role="alert" className="mb-4 rounded-xl bg-red-950/70 p-3 text-sm text-red-200">{error}</p>}

      <BottomSheet isOpen={isWhereaboutsOpen} onClose={() => setIsWhereaboutsOpen(false)}>
        <form onSubmit={(event) => void submitWhereabouts(event)} className="space-y-4">
          <h3 className="text-lg font-bold">Where are you?</h3>
          <textarea
            value={whereaboutsText}
            onChange={(event) => setWhereaboutsText(event.target.value)}
            maxLength={300}
            rows={3}
            autoFocus
            placeholder="Share a quick update…"
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-[16px] text-white outline-none placeholder:text-slate-500"
          />
          <button type="submit" disabled={!whereaboutsText.trim()} className="min-h-12 w-full rounded-full bg-[#0A84FF] font-bold disabled:opacity-50">Post update</button>
        </form>
      </BottomSheet>
      <MemberProfileSheet
        profile={tripMembers.find((member) => member.user_id === selectedProfileId)?.profile || null}
        location={locations.find((location) => location.user_id === selectedProfileId)}
        onClose={() => setSelectedProfileId(null)}
      />
    </div>
  );
};
