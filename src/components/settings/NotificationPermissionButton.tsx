import React, { useState } from 'react';
import { Bell } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useTrip } from '../../context/TripContext';

type NotificationCategory = 'messages' | 'calls' | 'polls' | 'reactions' | 'invitations' | 'trip_updates';
type NotificationPreferences = {
  enabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  muted_trip_ids: string[];
};

const defaultPreferences: NotificationPreferences = {
  enabled: true,
  categories: { messages: true, calls: true, polls: true, reactions: true, invitations: true, trip_updates: true },
  muted_trip_ids: [],
};

const decodeVapidKey = (key: string) => {
  const normalized = key.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(window.atob(padded), (char) => char.charCodeAt(0));
};

export const NotificationPermissionButton: React.FC = () => {
  const { user } = useAuth();
  const { currentTrip } = useTrip();
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);

  React.useEffect(() => {
    if (!user || !supabase) return;
    let cancelled = false;
    void supabase
      .from('notification_preferences')
      .select('enabled, categories, muted_trip_ids')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('Could not load notification preferences:', error);
          return;
        }
        if (!cancelled && data) {
          setPreferences({
            enabled: data.enabled,
            categories: { ...defaultPreferences.categories, ...(data.categories || {}) },
            muted_trip_ids: data.muted_trip_ids || [],
          });
        }
      });
    return () => { cancelled = true; };
  }, [user]);

  const savePreferences = async (next: NotificationPreferences) => {
    setPreferences(next);
    if (!user || !supabase) {
      setStatus('Connect Supabase before saving notification preferences.');
      return;
    }
    const { error } = await supabase.from('notification_preferences').upsert({
      user_id: user.id,
      enabled: next.enabled,
      categories: next.categories,
      muted_trip_ids: next.muted_trip_ids,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      setStatus(`Could not save notification preferences: ${error.message}`);
      console.error('Could not save notification preferences:', error);
    }
  };

  const enableNotifications = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setStatus('');
    try {
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (isIOS && !isStandalone) {
        setStatus('On iPhone or iPad, use Share → Add to Home Screen, then enable notifications from the installed app.');
        return;
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setStatus('Push notifications are not supported by this browser.');
        return;
      }
      if (!supabase) {
        setStatus('Connect Supabase before enabling notifications.');
        return;
      }
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setStatus('Notifications need a VAPID public key. Add VITE_VAPID_PUBLIC_KEY to the app environment.');
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('Notifications are blocked. You can allow them in your browser or device settings.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(vapidKey),
        });
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      setStatus('Notifications are enabled on this device.');
    } catch (error) {
      console.error('Could not enable push notifications:', error);
      setStatus(error instanceof Error ? error.message : 'Could not enable notifications.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="border-y border-white/[0.08] py-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF]/20 text-[#0A84FF]">
          <Bell size={18} weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-white">Notifications</h3>
          <p className="text-xs text-slate-400">Enable updates on this device.</p>
        </div>
        <button
          type="button"
          onClick={() => void enableNotifications()}
          disabled={isBusy}
          className="min-h-11 rounded-full bg-[#0A84FF] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isBusy ? 'Enabling…' : 'Enable'}
        </button>
      </div>
      {status && <p role="status" className="mt-3 text-xs text-slate-300">{status}</p>}
      <div className="mt-4 space-y-1 border-t border-white/[0.08] pt-3">
        <label className="flex min-h-11 items-center justify-between gap-3 text-sm text-white">
          <span className="font-semibold">All notifications</span>
          <input
            type="checkbox"
            checked={preferences.enabled}
            onChange={(event) => void savePreferences({ ...preferences, enabled: event.target.checked })}
            className="h-5 w-5 accent-[#0A84FF]"
          />
        </label>
        {([
          ['messages', 'Messages and structured updates'],
          ['calls', 'Calls'],
          ['polls', 'Polls'],
          ['reactions', 'Reactions'],
          ['invitations', 'Invitations'],
          ['trip_updates', 'Trip membership changes'],
        ] as const).map(([category, label]) => (
          <label key={category} className="flex min-h-10 items-center justify-between gap-3 pl-3 text-sm text-slate-300">
            <span>{label}</span>
            <input
              type="checkbox"
              checked={preferences.categories[category]}
              disabled={!preferences.enabled}
              onChange={(event) => void savePreferences({
                ...preferences,
                categories: { ...preferences.categories, [category]: event.target.checked },
              })}
              className="h-5 w-5 accent-[#0A84FF] disabled:opacity-40"
            />
          </label>
        ))}
        {currentTrip && (
          <label className="flex min-h-10 items-center justify-between gap-3 border-t border-white/[0.08] pt-2 text-sm text-slate-300">
            <span>Mute {currentTrip.name}</span>
            <input
              type="checkbox"
              checked={preferences.muted_trip_ids.includes(currentTrip.id)}
              onChange={(event) => {
                const mutedTrips = new Set(preferences.muted_trip_ids);
                if (event.target.checked) mutedTrips.add(currentTrip.id);
                else mutedTrips.delete(currentTrip.id);
                void savePreferences({ ...preferences, muted_trip_ids: Array.from(mutedTrips) });
              }}
              className="h-5 w-5 accent-[#0A84FF]"
            />
          </label>
        )}
      </div>
    </section>
  );
};
