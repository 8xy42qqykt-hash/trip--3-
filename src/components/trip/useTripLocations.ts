import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface SharedTripLocation {
  trip_id: string;
  user_id: string;
  sharing: boolean;
  latitude: number | null;
  longitude: number | null;
  accuracy_m: number | null;
  updated_at: string;
}

export function useTripLocations(tripId?: string) {
  const [locations, setLocations] = useState<SharedTripLocation[]>([]);

  useEffect(() => {
    if (!tripId || !supabase) {
      setLocations([]);
      return;
    }

    const client = supabase;
    let disposed = false;
    const loadLocations = async () => {
      const { data, error } = await client
        .from('trip_member_locations')
        .select('trip_id, user_id, sharing, latitude, longitude, accuracy_m, updated_at')
        .eq('trip_id', tripId)
        .eq('sharing', true);
      if (error) {
        console.error('Could not load shared trip locations:', error);
        return;
      }
      if (!disposed) setLocations(data || []);
    };

    void loadLocations();
    const channel = client
      .channel(`trip-locations:${tripId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_member_locations',
        filter: `trip_id=eq.${tripId}`,
      }, () => { void loadLocations(); })
      .subscribe();

    return () => {
      disposed = true;
      void client.removeChannel(channel);
    };
  }, [tripId]);

  return locations;
}
