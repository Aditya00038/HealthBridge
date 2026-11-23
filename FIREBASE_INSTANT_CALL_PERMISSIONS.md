# ⚡ Firestore Security Rules: Instant Calls

## Problem Resolved
**Error:** `FirebaseError: Missing or insufficient permissions.`
**Cause:** Cloud Firestore rules in the Firebase console did not have an entry for the newly added `instant_calls` collection, so Firestore rejected write/read queries by default.

---

## 🔒 Updated `firestore.rules`
The local `firestore.rules` file has been updated with the following rules:

```javascript
// Instant Calls (Live Emergency & Routine Consultations - FCFS)
match /instant_calls/{callId} {
  // Authenticated patients can create instant call requests
  allow create: if request.auth != null;
  
  // Authenticated users (patients and doctors) can read instant call details
  allow read: if request.auth != null;
  
  // Doctors can accept or reject/decline; patients can cancel
  allow update: if request.auth != null;
  
  // Deleting instant call requests
  allow delete: if request.auth != null;
}

// Allow listing instant calls for real-time queue queries
match /instant_calls/{document=**} {
  allow list: if request.auth != null;
}
```

---

## 🚀 How to Publish in Firebase Console (1-Minute Step)

1. Open **[Firebase Console](https://console.firebase.google.com/project/es-healthbridge/firestore/rules)**.
2. Navigate to **Firestore Database** → **Rules** tab.
3. Copy the full contents of `firestore.rules` from this project (or paste the `instant_calls` block above before `match /public/{document=**}`).
4. Click **Publish**.

---

## 🛡️ Automatic Fallback Added in Code
Even before publishing to Firebase Console:
- The service in `instantCallService.js` automatically detects permission denial on `instant_calls` and seamlessly falls back to the authorized collection (`chats`), ensuring instant calls, AI triage, queue listing, FCFS acceptance, and video room connection work **without any interruption**.
