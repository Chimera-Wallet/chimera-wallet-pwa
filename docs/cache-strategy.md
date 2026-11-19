# Cache Control Configuration for PWA

This document explains the caching strategy for the Chimera Wallet PWA.

## Service Worker Cache Versioning

The service worker now uses build-time cache versioning to ensure users always get the latest version:

- **Cache Name**: `arkade-cache-${BUILD_TIME}` where BUILD_TIME is generated at build time
- **Auto Cleanup**: Old caches are automatically deleted when a new service worker activates
- **Force Reload**: Clients are notified to reload when the service worker updates

## HTTP Cache Headers (Server Configuration)

To ensure proper cache invalidation, configure your web server with these headers:

### HTML Files (index.html)
```
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

### JavaScript & CSS Files (with content hash in filename)
```
Cache-Control: public, max-age=31536000, immutable
```

### Service Worker File (wallet-service-worker.mjs)
```
Cache-Control: no-cache, no-store, must-revalidate
Service-Worker-Allowed: /
```

### Manifest & Other Assets
```
Cache-Control: public, max-age=86400
```

## Where these headers are configured

The wallet is deployed only to Azure Static Web Apps, which reads headers from
`public/staticwebapp.config.json` (copied into `dist`; a copy anywhere else is
never deployed). Its `routes` set the cache headers above per path; `globalHeaders`
holds the security headers sent with every response. Anything not listed (fonts,
images, icons in `public/`) gets Azure's default
(`Cache-Control: public, must-revalidate, max-age=30`).

The year-long `immutable` rule is only safe for files whose name changes with
their content. That's everything Vite writes to `/assets/`, so the rule is
limited to `/assets/*`. Never extend it to a path holding a file whose name
stays the same across releases (e.g. `/wallet-service-worker.mjs`,
`/manifest.json`, or anything copied from `public/`): browsers would keep the
old copy for a year.

## Testing Cache Invalidation

After deploying a new version:

1. Open DevTools → Application → Service Workers
2. Check "Update on reload" 
3. Refresh the page
4. Verify the new service worker is activated
5. Check Application → Cache Storage - only the latest cache should be present

## Forcing Updates for Users

The app now automatically:
- Checks for service worker updates every 60 minutes
- Activates new service workers immediately on page load
- Clears old caches automatically
- Notifies clients to reload when updates are available

## Manual Cache Clear (for testing)

Users can manually clear all caches by:
1. Opening DevTools (F12)
2. Going to Application → Storage
3. Clicking "Clear site data"
4. Refreshing the page
