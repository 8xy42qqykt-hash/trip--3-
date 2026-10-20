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
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    self.registration.setAppBadge ? self.registration.setAppBadge(Number(payload.badge) || 1) : Promise.resolve(),
  ]));
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
    if (self.registration.clearAppBadge) await self.registration.clearAppBadge();
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
