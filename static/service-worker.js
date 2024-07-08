const CACHE_NAME = 'notes-tasks-app-cache-v1';
const urlsToCache = [
    '/',
    'index.html',
    'static/css/style.css',
    'static/js/main.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdn.quilljs.com/1.3.6/quill.snow.css',
    'https://cdn.quilljs.com/1.3.6/quill.min.js',
    'https://cdn.jsdelivr.net/npm/pouchdb@7.2.2/dist/pouchdb.min.js',
    'https://cdn.jsdelivr.net/npm/pouchdb-authentication@1.1.3/dist/pouchdb.authentication.min.js',
    'https://cdn.jsdelivr.net/npm/showdown/dist/showdown.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/fuse.js/6.4.6/fuse.min.js',
    'https://cdn.jsdelivr.net/npm/uuid/dist/umd/uuid.min.js'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('fetch', function(event) {
    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response;
                }
                return fetch(event.request);
            })
    );
});

self.addEventListener('activate', function(event) {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (!cacheWhitelist.includes(cacheName)) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
