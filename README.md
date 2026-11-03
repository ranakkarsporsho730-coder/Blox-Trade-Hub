# Blox Trade Hub — starter project

A mobile-friendly Blox Fruits community trade calculator with Firebase database,
admin-only item management, and an external value-source adapter.

## Important: what “automatic values” means

Blox Fruits does not publish an official trading-value API. Trade values are
community estimates and can differ between value sites. This project therefore
does not pretend there is one official or guaranteed value.

When you add an item, the app calls a community value API and saves the returned
value in Firestore. The “Refresh all values” button repeats this for every item.
The app includes an adapter for an API with these routes:

- GET /info/fruits/{slug}
- GET /info/gamepasses/{slug}
- GET /info/limiteds/{slug}

One example open-source API project scrapes a community value website:
https://github.com/iliaprogrammer/bloxfruits-api
It is not an official Blox Fruits API, and its scraping selectors/source may
break when that website changes. Review the upstream project's code, terms,
and reliability before deploying it. You must deploy your own API instance and
use its base URL in `public/app.js`. Do not rely on an undocumented third-party
server or hard-code a private API key in browser JavaScript.

## Setup

1. Create a Firebase project at https://console.firebase.google.com/
2. Add a Web App in Firebase project settings and copy its config into
   `public/firebase-config.js`.
3. Enable **Authentication → Sign-in method → Email/Password**.
4. Create your own admin user in Firebase Authentication.
5. Copy that user's UID into `ADMIN_UID` in `public/app.js`.
6. Replace `PASTE_YOUR_ADMIN_UID_HERE` in `firestore.rules` with the same UID.
7. Create a Firestore database. Publish the included `firestore.rules`.
8. Deploy your compatible value API. Put its base URL into `VALUE_API_BASE`
   in `public/app.js`. It must allow requests from your hosted website (CORS).
9. Install Node.js and Firebase CLI, then run these commands in this folder:

   npm install -g firebase-tools
   firebase login
   firebase use --add
   firebase deploy

Firebase Hosting has a no-cost quota, but usage limits apply. See:
https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Admin security

The admin UID is checked in the UI for convenience AND enforced in Firestore
security rules. Never rely only on hiding the admin button. Keep the UID in both
places identical. Do not share the admin login.

## Current starter limitations

- Add an item with a name, category, image URL and provider slug.
- The value is fetched after adding it; if the source fails, the item remains
  with the manual fallback value.
- Refresh all values is manual/on-demand, not a scheduled background job.
- Fruit/gamepass images are entered as image URLs; upload/storage UI is not
  included in this first version.
- W/F/L uses a 10% tolerance. This is a configurable rule, not an official rule.
- Add a provider-specific scheduled function later if you want automatic
  periodic refresh without pressing the button.
