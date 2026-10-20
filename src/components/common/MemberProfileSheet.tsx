import React, { useEffect, useState } from 'react';
import { At } from '@phosphor-icons/react';
import { Avatar } from './Avatar';
import { BottomSheet } from './BottomSheet';
import { Profile } from '../../types';
import { SharedTripLocation } from '../trip/useTripLocations';
import { useLanguage } from '../../context/LanguageContext';

const reverseGeocodeCache = new Map<string, string>();
let lastReverseGeocodeAt = 0;

interface MemberProfileSheetProps {
  profile: Profile | null;
  location?: SharedTripLocation;
  onClose: () => void;
  onMention?: () => void;
}

export const MemberProfileSheet: React.FC<MemberProfileSheetProps> = ({ profile, location, onClose, onMention }) => {
  const { t } = useLanguage();
  const [placeName, setPlaceName] = useState('');

  useEffect(() => {
    setPlaceName('');
    if (!profile || location?.latitude === null || location?.latitude === undefined
      || location.longitude === null || location.longitude === undefined) return;
    const cacheKey = `${location.latitude.toFixed(2)},${location.longitude.toFixed(2)}`;
    const cachedName = reverseGeocodeCache.get(cacheKey);
    if (cachedName) {
      setPlaceName(cachedName);
      return;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(location.latitude),
      lon: String(location.longitude),
    });
    const delay = Math.max(0, lastReverseGeocodeAt + 1000 - Date.now());
    const timer = window.setTimeout(() => {
      lastReverseGeocodeAt = Date.now();
      void fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`Location lookup failed (${response.status}).`);
          return response.json();
        })
        .then((result: { display_name?: string }) => {
          const name = result.display_name || '';
          if (name) reverseGeocodeCache.set(cacheKey, name);
          setPlaceName(name);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name !== 'AbortError') {
            console.error('Could not look up shared member location:', error);
          }
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [profile?.id, location?.latitude, location?.longitude]);

  return (
    <BottomSheet isOpen={Boolean(profile)} onClose={onClose}>
      {profile && (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Avatar
            name={profile.display_name}
            avatarUrl={profile.avatar_url}
            color={profile.color}
            size={104}
          />
          <h2 className="text-xl font-bold text-white">{profile.display_name}</h2>
          {location && (
            <p className="max-w-full text-sm text-slate-300">
              {placeName || `${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}`}
            </p>
          )}
          {onMention && (
            <button
              type="button"
              onClick={onMention}
              className="mt-1 inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold text-white active:bg-white/15"
            >
              <At size={17} weight="bold" />
              {t('Mention')}
            </button>
          )}
        </div>
      )}
    </BottomSheet>
  );
};
