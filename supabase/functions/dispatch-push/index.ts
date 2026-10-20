/// <reference path="./web-push.d.ts" />

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webPush from 'npm:web-push@3.6.7';

type NotificationEvent = {
  id: number;
  trip_id: string | null;
  actor_id: string | null;
  recipient_id: string;
  category: string;
  preview: string;
  destination: string;
  high_priority: boolean;
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const webhookSecret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!webhookSecret || request.headers.get('x-webhook-secret') !== webhookSecret) {
    return new Response('Unauthorized webhook.', { status: 401 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT');
  if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return new Response('Push sender environment is incomplete.', { status: 500 });
  }

  const payload = await request.json().catch(() => ({}));
  const event = payload.record as NotificationEvent | undefined;
  if (!event?.trip_id || !event.recipient_id) return new Response('No notification event in webhook payload.', { status: 400 });

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  await sleep(1800);
  const staleClaim = new Date(Date.now() - 60_000).toISOString();
  const { data: events, error: claimError } = await admin
    .from('notification_events')
    .update({ claimed_at: new Date().toISOString() })
    .eq('trip_id', event.trip_id)
    .eq('recipient_id', event.recipient_id)
    .is('sent_at', null)
    .or(`claimed_at.is.null,claimed_at.lt.${staleClaim}`)
    .select('id, trip_id, actor_id, recipient_id, category, preview, destination, high_priority');
  if (claimError) {
    console.error('Could not claim push events:', claimError);
    return new Response('Could not claim notification events.', { status: 500 });
  }
  if (!events?.length) return new Response('Already claimed.', { status: 202 });

  const recipientId = events[0].recipient_id;
  const tripId = events[0].trip_id;
  const { data: preferences, error: preferenceError } = await admin
    .from('notification_preferences')
    .select('enabled, categories, muted_trip_ids')
    .eq('user_id', recipientId)
    .maybeSingle();
  if (preferenceError) {
    console.error('Could not read notification preferences:', preferenceError);
    await releaseClaim(admin, events.map((item) => item.id));
    return new Response('Could not read notification preferences.', { status: 500 });
  }
  const settings = preferences || {
    enabled: true,
    categories: { messages: true, calls: true, polls: true, reactions: true, invitations: true, trip_updates: true },
    muted_trip_ids: [],
  };

  const { data: activity, error: activityError } = await admin
    .from('trip_user_activity')
    .select('is_focused, updated_at')
    .eq('user_id', recipientId)
    .eq('trip_id', tripId)
    .maybeSingle();
  if (activityError) {
    console.error('Could not read focused-trip state:', activityError);
    await releaseClaim(admin, events.map((item) => item.id));
    return new Response('Could not read focused-trip state.', { status: 500 });
  }
  const focused = activity?.is_focused
    && Date.now() - new Date(activity.updated_at).getTime() < 30_000;
  const allowedEvents = settings.enabled && !focused && !settings.muted_trip_ids?.includes(tripId)
    ? events.filter((item) => (
      item.actor_id !== recipientId
      && settings.categories?.[item.category] !== false
    ))
    : [];

  if (!allowedEvents.length) {
    await markSent(admin, events.map((item) => item.id));
    return new Response('Notifications disabled, muted, or already focused.', { status: 200 });
  }

  const actorIds = Array.from(new Set(allowedEvents.map((item) => item.actor_id).filter(Boolean))) as string[];
  const [{ data: profiles, error: profileError }, { data: trip, error: tripError }] = await Promise.all([
    admin.from('profiles').select('id, display_name, language').in('id', Array.from(new Set([...actorIds, recipientId]))),
    tripId ? admin.from('trips').select('name').eq('id', tripId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (profileError) console.error('Could not load notification sender names:', profileError);
  if (tripError) console.error('Could not load trip title for push:', tripError);

  const latestCall = [...allowedEvents].reverse().find((item) => item.category === 'calls');
  const latest = latestCall || allowedEvents[allowedEvents.length - 1];
  const senderName = profiles?.find((profile) => profile.id === latest.actor_id)?.display_name || 'Trip member';
  const language = profiles?.find((profile) => profile.id === recipientId)?.language === 'fi' ? 'fi' : 'en';
  const isCall = latest.category === 'calls';
  const tripName = trip?.name || 'Trip';
  const title = senderName;
  const callType = language === 'fi'
    ? /video/i.test(latest.preview) ? 'Videopuhelu' : 'Äänipuhelu'
    : /video/i.test(latest.preview) ? 'Video call' : 'Voice call';
  const preview = latest.preview.toLowerCase();
  const isGrocery = /^(sent|updated) (a )?grocery list|^updated the grocery list/.test(preview);
  const isMeal = /^(added|updated) (a )?meal|^added or updated a meal/.test(preview);
  const isPlan = /^(added|updated) (a )?plan|^added or updated a plan/.test(preview);
  const category = isCall
    ? 'Call'
    : latest.category === 'polls'
      ? 'Poll'
      : latest.category === 'reactions'
        ? 'Chat'
        : isGrocery
          ? 'Grocery'
          : isMeal
            ? 'Meal'
            : isPlan
              ? 'Plan'
              : 'Chat';
  const localizedCategory = language === 'fi'
    ? ({ Call: 'Puhelu', Poll: 'Kysely', Chat: 'Viesti', Grocery: 'Ostoslista', Meal: 'Ateria', Plan: 'Suunnitelma' } as const)[category]
    : category;
  const previewTranslations: Record<string, string> = {
    'Updated a grocery list': 'Ostoslistaa päivitettiin',
    'Updated the grocery list': 'Ostoslistaa päivitettiin',
    'Sent a grocery list': 'Lähetti ostoslistan',
    'Added a meal': 'Lisäsi aterian',
    'Updated a meal': 'Päivitti ateriaa',
    'Added or updated a meal': 'Lisäsi tai päivitti ateriaa',
    'Added a plan': 'Lisäsi suunnitelman',
    'Updated a plan': 'Päivitti suunnitelmaa',
    'Added or updated a plan': 'Lisäsi tai päivitti suunnitelmaa',
    'Sent a photo': 'Lähetti kuvan',
    'Poll results are ready': 'Kyselyn tulokset ovat valmiit',
    'Edited a message': 'Muokkasi viestiä',
    'Created a poll': 'Loi kyselyn',
    'Reacted to a message': 'Reagoi viestiin',
    'Voted in a poll': 'Äänesti kyselyssä',
    'Liked a meal': 'Tykkäsi ateriasta',
    'Updated plan attendance': 'Päivitti suunnitelman osallistujia',
  };
  const translatedPreview = language === 'fi' ? previewTranslations[latest.preview] || latest.preview : latest.preview;
  const messagePreview = isCall
    ? callType
    : allowedEvents.length > 1
      ? language === 'fi'
        ? `${translatedPreview} (+${allowedEvents.length - 1} päivitystä)`
        : `${latest.preview} (+${allowedEvents.length - 1} more update${allowedEvents.length === 2 ? '' : 's'})`
      : translatedPreview;
  const body = isCall
    ? `${language === 'fi' ? 'Matkalta' : 'From'} ${tripName}\n${localizedCategory}\n${callType}`
    : `${language === 'fi' ? 'Matkalta' : 'From'} ${tripName}\n${localizedCategory}\n${messagePreview}`;
  const appBase = new URL(Deno.env.get('APP_PUBLIC_URL') || supabaseUrl);
  if (!appBase.pathname.endsWith('/')) appBase.pathname += '/';
  const destination = new URL((latest.destination || '/').replace(/^\/+/, ''), appBase).href;
  const message = JSON.stringify({
    title,
    body,
    tag: `trip-${tripId}`,
    renotify: false,
    badge: allowedEvents.length,
    url: destination,
    actions: isCall ? [{ action: 'join', title: language === 'fi' ? 'Liity' : 'Join' }] : [],
  });

  webPush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const { data: subscriptions, error: subscriptionsError } = await admin
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .eq('user_id', recipientId);
  if (subscriptionsError) {
    console.error('Could not load push subscriptions:', subscriptionsError);
    await releaseClaim(admin, events.map((item) => item.id));
    return new Response('Could not load push subscriptions.', { status: 500 });
  }

  let failedDelivery = false;
  for (const subscription of subscriptions || []) {
    try {
      await webPush.sendNotification(
        subscription.subscription,
        message,
        { TTL: 60, urgency: isCall ? 'high' : 'normal' },
      );
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await admin
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint);
        if (deleteError) console.error('Could not remove expired push subscription:', deleteError);
      } else {
        failedDelivery = true;
        console.error('Push delivery failed:', error);
      }
    }
  }

  if (failedDelivery) await releaseClaim(admin, events.map((item) => item.id));
  else await markSent(admin, events.map((item) => item.id));
  return new Response(JSON.stringify({ deliveredTo: subscriptions?.length || 0 }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

type AdminClient = SupabaseClient<any, 'public', any, any, any>;

async function markSent(client: AdminClient, ids: number[]) {
  const { error } = await client.from('notification_events')
    .update({ sent_at: new Date().toISOString() })
    .in('id', ids);
  if (error) console.error('Could not mark push events sent:', error);
}

async function releaseClaim(client: AdminClient, ids: number[]) {
  const { error } = await client.from('notification_events')
    .update({ claimed_at: null })
    .in('id', ids);
  if (error) console.error('Could not release push event claim:', error);
}
