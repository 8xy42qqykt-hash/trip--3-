const BADGE_DB_NAME = 'trip-push-state';
const BADGE_STORE_NAME = 'state';
const BADGE_COUNT_KEY = 'unreadCount';

const updateUnreadCount = (reset = false) => new Promise((resolve, reject) => {
  const request = indexedDB.open(BADGE_DB_NAME, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(BADGE_STORE_NAME);
  };
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction(BADGE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BADGE_STORE_NAME);
    const getRequest = store.get(BADGE_COUNT_KEY);
    let nextCount = reset ? 0 : 1;
    getRequest.onsuccess = () => {
      if (!reset) nextCount = (Number(getRequest.result) || 0) + 1;
      store.put(nextCount, BADGE_COUNT_KEY);
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(nextCount);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  };
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_NOTIFICATION_BADGE') {
    event.waitUntil(updateUnreadCount(true).then(() => self.navigator.clearAppBadge?.()));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error('Invalid push payload:', error);
  }

  const title = payload.title || payload.senderName || 'Trip';
  const options = {
    body: payload.body || payload.preview || 'There is an update in your trip.',
    icon: './trip-logo-black.png',
    badge: './trip-logo-black.png',
    tag: payload.tag || payload.chatId || 'trip-update',
    renotify: Boolean(payload.renotify),
    data: { url: payload.url || './' },
    actions: payload.actions || [],
  };
  event.waitUntil((async () => {
    const unreadCount = await updateUnreadCount().catch((error) => {
      console.error('Could not update notification badge count:', error);
      return Number(payload.badge) || 1;
    });
    await self.registration.showNotification(title, options);
    if (self.navigator.setAppBadge) await self.navigator.setAppBadge(unreadCount);
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destinationUrl = new URL(event.notification.data?.url || './', self.location.href);
  if (event.action === 'join') {
    const callId = destinationUrl.searchParams.get('call');
    if (callId) destinationUrl.searchParams.set('joinCall', callId);
  }
  destinationUrl.searchParams.delete('call');
  const destination = destinationUrl.href;
  event.waitUntil((async () => {
    await updateUnreadCount(true);
    if (self.navigator.clearAppBadge) await self.navigator.clearAppBadge();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client && new URL(client.url).origin === self.location.origin) {
        await client.navigate(destination);
        return client.focus();
      }
    }
    return self.clients.openWindow(destination);
  })());
});
