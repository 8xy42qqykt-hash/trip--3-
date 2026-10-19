import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../types';

export interface OnlineTripMember {
  userId: string;
  profile: Profile;
}

export function useTripPresence(
  tripId: string | undefined,
  userId: string | undefined,
  profile: Profile | null,
) {
  const [onlineMembers, setOnlineMembers] = useState<OnlineTripMember[]>([]);

  useEffect(() => {
    if (!tripId || !userId || !profile || !supabase) {
      setOnlineMembers([]);
      return;
    }

    setOnlineMembers([]);
    const client = supabase;
    const channel = client.channel(`trip-presence:${tripId}`, {
      config: { private: true, presence: { key: userId } },
    });
    let disposed = false;

    const syncMembers = () => {
      const members = Object.values(channel.presenceState()).flatMap((presences) =>
        presences.flatMap((presence) => {
          const data = presence as { userId?: string; profile?: Profile };
          return data.userId && data.profile
            ? [{ userId: data.userId, profile: data.profile }]
            : [];
        }),
      );
      if (!disposed) {
        setOnlineMembers(
          Array.from(new Map(members.map((member) => [member.userId, member])).values()),
        );
      }
    };

    channel.on('presence', { event: 'sync' }, syncMembers);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const result = await channel.track({ userId, profile });
        if (result !== 'ok') {
          console.error('Could not publish online presence:', result);
        }
        syncMembers();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error(`Trip presence channel failed: ${status}`);
      }
    });

    return () => {
      disposed = true;
      void client.removeChannel(channel);
    };
  }, [tripId, userId, profile]);

  return onlineMembers;
}
