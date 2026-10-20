import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';

interface TripLocationTrackerProps {
  tripId?: string;
  userId?: string;
}

export const TripLocationTracker: React.FC<TripLocationTrackerProps> = ({ tripId, userId }) => {
  const watchIdRef = useRef<number | null>(null);
  const lastSavedRef = useRef<{ latitude: number; longitude: number; timestamp: number } | null>(null);

  useEffect(() => {
    if (!tripId || !userId || !supabase || !navigator.geolocation) return;
    const client = supabase;
    let disposed = false;
    let sharing = false;

    const stopWatching = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

    const startWatching = () => {
      if (disposed || !sharing || watchIdRef.current !== null) return;
      watchIdRef.current = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const previous = lastSavedRef.current;
          if (
            !sharing
            || disposed
            || (previous
              && Math.abs(previous.latitude - latitude) < 0.0005
              && Math.abs(previous.longitude - longitude) < 0.0005
              && Date.now() - previous.timestamp < 60_000)
          ) return;
          const { error } = await client.from('trip_member_locations').upsert({
            trip_id: tripId,
            user_id: userId,
            sharing: true,
            latitude,
            longitude,
            accuracy_m: accuracy,
            updated_at: new Date().toISOString(),
          });
          if (error) console.error('Could not refresh shared trip location:', error);
          else lastSavedRef.current = { latitude, longitude, timestamp: Date.now() };
        },
        async (error) => {
          console.error('Could not continue shared trip location updates:', error);
          if (error.code === error.PERMISSION_DENIED) {
            sharing = false;
            stopWatching();
            const { error: disableError } = await client.from('trip_member_locations').upsert({
              trip_id: tripId,
              user_id: userId,
              sharing: false,
              latitude: null,
              longitude: null,
              accuracy_m: null,
              updated_at: new Date().toISOString(),
            });
            if (disableError) console.error('Could not disable location sharing after permission was revoked:', disableError);
          }
        },
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
      );
    };

    const loadSharing = async () => {
      const { data, error } = await client
        .from('trip_member_locations')
        .select('sharing')
        .eq('trip_id', tripId)
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        console.error('Could not check trip location sharing:', error);
        return;
      }
      if (disposed) return;
      sharing = Boolean(data?.sharing);
      if (sharing) startWatching();
      else stopWatching();
    };

    void loadSharing();
    const channel = client
      .channel(`trip-location-tracker:${tripId}:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_member_locations',
        filter: `trip_id=eq.${tripId}`,
      }, (payload) => {
        const row = payload.new as { user_id?: string; sharing?: boolean };
        if (row.user_id !== userId) return;
        sharing = Boolean(row.sharing);
        if (sharing) startWatching();
        else stopWatching();
      })
      .subscribe();

    return () => {
      disposed = true;
      sharing = false;
      stopWatching();
      void client.removeChannel(channel);
    };
  }, [tripId, userId]);

  return null;
};
