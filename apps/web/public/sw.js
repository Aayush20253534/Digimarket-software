/* AmplifyWorld private-workspace service worker.
 * Never cache API responses, authentication, HTML pages, or Next.js RSC payloads. */
const CACHE_NAME = "amplifyworld-offline-v1";
const OFFLINE = "/offline.html";
const ASSETS = [OFFLINE, "/brand/amplifyworld-mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key.startsWith("amplifyworld-offline-") && key !== CACHE_NAME)
        .map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.mode !== "navigate" || request.method !== "GET" ||
      url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error())
  );
});

/* Browser push works when the installed app is closed, provided the user has
   enabled alerts and the server has configured VAPID keys. No private task content
   is sent through the push gateway. */
self.addEventListener("push",(event)=>{
  event.waitUntil(self.registration.showNotification("AmplifyWorld: New task assigned",{
    body:"A task has been assigned to you. Open the workspace to view it.",
    icon:"/brand/amplifyworld-mark.svg",
    badge:"/brand/amplifyworld-mark.svg",
    tag:"amplifyworld-task-assigned",
    data:{url:"/app/tasks"},
  }));
});
self.addEventListener("notificationclick",(event)=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const target=new URL("/app/tasks",self.location.origin).href;
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin===self.location.origin){
        await client.navigate(target);return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
