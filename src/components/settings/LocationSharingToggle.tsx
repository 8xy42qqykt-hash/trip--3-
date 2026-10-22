import React, { useEffect, useState } from 'react';
import { MapPin } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { useTripLocations } from '../trip/useTripLocations';
import { useLanguage } from '../../context/LanguageContext';

interface LocationSharingToggleProps {
  tripId?: string;
  userId?: string;
}

export const LocationSharingToggle: React.FC<LocationSharingToggleProps> = ({ tripId, userId }) => {
  const { t } = useLanguage();
  const locations = useTripLocations(tripId);
  const isSharing = locations.some((location) => location.user_id === userId && location.sharing);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => setStatus(''), [isSharing]);

  const toggleSharing = async () => {
    if (!tripId || !userId || !supabase || isBusy) return;
    setHasInteracted(true);
    const client = supabase;
    setIsBusy(true);
    setStatus('');
    try {
      if (isSharing) {
        const { error } = await client.from('trip_member_locations').upsert({
          trip_id: tripId,
          user_id: userId,
          sharing: false,
          latitude: null,
          longitude: null,
          accuracy_m: null,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        setStatus('Location sharing is off.');
        return;
      }
      if (!navigator.geolocation) throw new Error('Location sharing is not supported by this browser.');
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 30_000,
          timeout: 20_000,
        });
      });
      const { error } = await client.from('trip_member_locations').upsert({
        trip_id: tripId,
        user_id: userId,
        sharing: true,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy_m: position.coords.accuracy,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      setStatus('Location sharing is on for this trip.');
    } catch (error) {
      console.error('Could not change trip location sharing:', error);
      const isPermissionDenied = typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === 1;
      setStatus(isPermissionDenied
        ? 'Allow location access in your device settings to share your location.'
        : error instanceof Error ? error.message : 'Could not change location sharing.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF]/20 text-[#0A84FF]">
          <MapPin size={18} weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{t('Location sharing')}</p>
          <p className="text-xs text-slate-400">{t(isSharing ? 'Visible to trip members' : 'Off for this trip')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isSharing}
          aria-label={t('Share my location with trip members')}
          onClick={() => void toggleSharing()}
          disabled={isBusy || !tripId || !userId}
          className={`relative h-8 w-[54px] shrink-0 rounded-full disabled:opacity-60 ${
            hasInteracted ? 'transition-colors duration-200' : ''
          } ${
            isSharing ? 'bg-[#0A84FF]' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow ${
              hasInteracted ? 'transition-[left] duration-200' : ''
            }`}
            style={{ left: isSharing ? 26 : 4 }}
          />
        </button>
      </div>
      {isBusy && <p className="mt-2 text-xs text-slate-400">{t('Updating location sharing…')}</p>}
      {status && <p role="status" className="mt-2 text-xs text-slate-300">{t(status)}</p>}
    </div>
  );
};
