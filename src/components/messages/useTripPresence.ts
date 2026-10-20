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
  isChatFocused = true,
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
    const publishFocus = async () => {
      const isFocused = isChatFocused
        && document.visibilityState === 'visible'
        && document.hasFocus();
      const { error } = await client.from('trip_user_activity').upsert({
        user_id: userId,
        trip_id: tripId,
        is_focused: isFocused,
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('Could not update focused-trip state:', error);
    };

    const onFocusChange = () => { void publishFocus(); };
    window.addEventListener('focus', onFocusChange);
    window.addEventListener('blur', onFocusChange);
    document.addEventListener('visibilitychange', onFocusChange);
    void publishFocus();
    const focusHeartbeat = window.setInterval(() => { void publishFocus(); }, 20000);

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
      window.clearInterval(focusHeartbeat);
      window.removeEventListener('focus', onFocusChange);
      window.removeEventListener('blur', onFocusChange);
      document.removeEventListener('visibilitychange', onFocusChange);
      void client.from('trip_user_activity')
        .upsert({ user_id: userId, trip_id: tripId, is_focused: false, updated_at: new Date().toISOString() })
        .then(({ error }) => {
          if (error) console.error('Could not clear focused-trip state:', error);
        });
      void client.removeChannel(channel);
    };
  }, [tripId, userId, profile, isChatFocused]);

  return onlineMembers;
}
