import React, { useState } from 'react';
import { Bell } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type NotificationCategory = 'messages' | 'calls' | 'polls' | 'reactions' | 'invitations' | 'trip_updates';
type NotificationPreferences = {
  enabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  muted_trip_ids: string[];
};

const defaultPreferences: NotificationPreferences = {
  enabled: false,
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
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);

  React.useEffect(() => {
    if (!user || !supabase) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('enabled, categories, muted_trip_ids')
        .eq('user_id', user.id)
        .maybeSingle();
        if (error) {
          console.error('Could not load notification preferences:', error);
          return;
        }
        if (cancelled) return;
        if (data) {
          setPreferences({
            enabled: data.enabled,
            categories: { ...defaultPreferences.categories, ...(data.categories || {}) },
            muted_trip_ids: data.muted_trip_ids || [],
          });
          return;
        }
        if ('serviceWorker' in navigator) {
          const registration = 'serviceWorker' in navigator
            ? await navigator.serviceWorker.getRegistration()
            : undefined;
          const subscription = await registration?.pushManager.getSubscription();
          if (!subscription || cancelled) return;
          const { data: storedSubscription, error: subscriptionError } = await supabase
            .from('push_subscriptions')
            .select('endpoint')
            .eq('user_id', user.id)
            .eq('endpoint', subscription.endpoint)
            .maybeSingle();
          if (subscriptionError) {
            console.error('Could not check this device notification subscription:', subscriptionError);
            return;
          }
          if (storedSubscription && !cancelled) {
            setPreferences((current) => ({ ...current, enabled: true }));
          }
        }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggleNotifications = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setStatus('');
    try {
      if (!supabase) {
        setStatus('Connect Supabase before enabling notifications.');
        return;
      }
      if (preferences.enabled) {
        const next = { ...preferences, enabled: false };
        const { error } = await supabase.from('notification_preferences').upsert({
          user_id: user.id,
          enabled: false,
          categories: next.categories,
          muted_trip_ids: next.muted_trip_ids,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        setPreferences(next);
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const { error: deleteError } = await supabase.from('push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('endpoint', subscription.endpoint);
          if (deleteError) throw deleteError;
          await subscription.unsubscribe();
        }
        setStatus('Notifications are off on this device.');
        return;
      }

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
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        setStatus('Push is not configured yet. Generate a VAPID key pair, set its public key as VITE_VAPID_PUBLIC_KEY in the app environment and its private key as the Supabase VAPID_PRIVATE_KEY secret, then redeploy.');
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
      const next = { ...preferences, enabled: true };
      const { error: preferenceError } = await supabase.from('notification_preferences').upsert({
        user_id: user.id,
        enabled: true,
        categories: next.categories,
        muted_trip_ids: next.muted_trip_ids,
        updated_at: new Date().toISOString(),
      });
      if (preferenceError) throw preferenceError;
      setPreferences(next);
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
          <p className="text-xs text-slate-400">{preferences.enabled ? 'On for this device' : 'Off for this device'}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={preferences.enabled}
          aria-label="Turn notifications on or off"
          onClick={() => void toggleNotifications()}
          disabled={isBusy}
          className={`relative h-8 w-[54px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-60 ${
            preferences.enabled ? 'bg-[#0A84FF]' : 'bg-white/20'
          }`}
        >
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
            preferences.enabled ? 'translate-x-[26px]' : 'translate-x-1'
          }`} />
        </button>
      </div>
      {isBusy && <p className="mt-2 text-xs text-slate-400">Updating notification settings…</p>}
      {status && <p role="status" className="mt-3 text-xs text-slate-300">{status}</p>}
    </section>
  );
};
