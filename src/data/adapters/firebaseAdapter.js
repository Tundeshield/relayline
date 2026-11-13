// Firebase adapter — placeholder for the production backend.
//
// The app talks to persistence only through { load, save, clear } (see localAdapter).
// To move to Firebase:
//   1. npm i firebase, add VITE_FIREBASE_* env vars in Netlify.
//   2. Map each collection in COLLECTIONS (store.js) to a Firestore collection,
//      partitioned by organisation_id: organisations/{orgId}/{collection}/{id}.
//   3. Replace demo auth (services/auth.js) with Firebase Auth; keep users/memberships.
//   4. Enforce organisation isolation in Firestore security rules:
//      allow read, write: if exists(/databases/$(db)/documents/organisations/$(orgId)/memberships/$(request.auth.uid));
//   5. Move the simulator + automation engine to Cloud Functions, triggered by
//      Firestore writes and Cloud Scheduler, so they run without an open browser.
export const firebaseAdapter = null;
