import React, { useState } from 'react';
import { Bell } from '@phosphor-icons/react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../context/LanguageContext';

type NotificationCategory = 'messages' | 'calls' | 'polls' | 'games' | 'reactions' | 'invitations' | 'trip_updates';
type NotificationPreferences = {
  enabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  muted_trip_ids: string[];
};

const defaultPreferences: NotificationPreferences = {
  enabled: false,
  categories: { messages: true, calls: true, polls: true, games: true, reactions: true, invitations: true, trip_updates: true },
  muted_trip_ids: [],
};

const decodeVapidKey = (key: string) => {
  const normalized = key.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(window.atob(padded), (char) => char.charCodeAt(0));
};

export const NotificationPermissionButton: React.FC = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [status, setStatus] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [hasInteracted, setHasInteracted] = useState(false);

  React.useEffect(() => {
    if (!user || !supabase) {
      setPreferences(defaultPreferences);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setIsLoading(true);
      setStatus('');
      setPreferences(defaultPreferences);
      try {
        const client = supabase;
        const [{ data, error }, registration] = await Promise.all([
          client
            .from('notification_preferences')
            .select('enabled, categories, muted_trip_ids')
            .eq('user_id', user.id)
            .maybeSingle(),
          'serviceWorker' in navigator ? navigator.serviceWorker.getRegistration() : Promise.resolve(undefined),
        ]);
        if (error) throw error;
        if (cancelled) return;

        const localSubscription = await registration?.pushManager.getSubscription();
        let deviceEnabled = false;
        if (localSubscription) {
          const { data: savedSubscription, error: subscriptionError } = await client
            .from('push_subscriptions')
            .select('endpoint')
            .eq('user_id', user.id)
            .eq('endpoint', localSubscription.endpoint)
            .maybeSingle();
          if (subscriptionError) throw subscriptionError;
          deviceEnabled = Boolean(savedSubscription);
        }

        if (deviceEnabled && data?.enabled === false) {
          const { error: preferenceError } = await client.from('notification_preferences').upsert({
            user_id: user.id,
            enabled: true,
            categories: data.categories || defaultPreferences.categories,
            muted_trip_ids: data.muted_trip_ids || [],
            updated_at: new Date().toISOString(),
          });
          if (preferenceError) throw preferenceError;
        } else if (deviceEnabled && !data) {
          const { error: preferenceError } = await client.from('notification_preferences').upsert({
            user_id: user.id,
            enabled: true,
            categories: defaultPreferences.categories,
            muted_trip_ids: [],
            updated_at: new Date().toISOString(),
          });
          if (preferenceError) throw preferenceError;
        }

        if (!cancelled) {
          setPreferences({
            enabled: deviceEnabled,
            categories: { ...defaultPreferences.categories, ...(data?.categories || {}) },
            muted_trip_ids: data?.muted_trip_ids || [],
          });
        }
      } catch (error) {
        console.error('Could not load notification settings:', error);
        if (!cancelled) {
          setStatus(error instanceof Error ? `Could not load notification settings: ${error.message}` : 'Could not load notification settings.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const toggleNotifications = async () => {
    if (!user || isBusy) return;
    setHasInteracted(true);
    setIsBusy(true);
    setStatus('');
    try {
      if (!supabase) {
        setStatus('Connect Supabase before enabling notifications.');
        return;
      }
      if (preferences.enabled) {
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
        const { count, error: countError } = await supabase
          .from('push_subscriptions')
          .select('endpoint', { count: 'exact', head: true })
          .eq('user_id', user.id);
        if (countError) throw countError;
        const { error: preferenceError } = await supabase.from('notification_preferences').upsert({
          user_id: user.id,
          enabled: (count || 0) > 0,
          categories: preferences.categories,
          muted_trip_ids: preferences.muted_trip_ids,
          updated_at: new Date().toISOString(),
        });
        if (preferenceError) throw preferenceError;
        setPreferences((current) => ({ ...current, enabled: false }));
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
    <div>
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF]/20 text-[#0A84FF]">
          <Bell size={18} weight="bold" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">{t('Notifications')}</p>
          <p className="text-xs text-slate-400">{t(preferences.enabled ? 'On for this device' : 'Off for this device')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={preferences.enabled}
          aria-label={t('Turn notifications on or off')}
          onClick={() => void toggleNotifications()}
          disabled={isLoading || isBusy}
          className={`relative h-8 w-[54px] shrink-0 rounded-full disabled:opacity-60 ${
            hasInteracted ? 'transition-colors duration-200' : ''
          } ${
            preferences.enabled ? 'bg-[#0A84FF]' : 'bg-white/20'
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow ${
              hasInteracted ? 'transition-[left] duration-200' : ''
            }`}
            style={{ left: preferences.enabled ? 26 : 4 }}
          />
        </button>
      </div>
      {isLoading && <p className="mt-2 text-xs text-slate-400">{t('Loading notification settings…')}</p>}
      {isBusy && <p className="mt-2 text-xs text-slate-400">{t('Updating notification settings…')}</p>}
      {status && <p role="status" className="mt-3 text-xs text-slate-300">{t(status)}</p>}
    </div>
  );
};
