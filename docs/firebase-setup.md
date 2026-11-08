# Firebase setup — NeighborMart (Phase 3)

> **Status (2026-11-08): DONE, except Storage.** The live project
> **`neighbormart-7eff0`** exists: web + Android apps registered (the
> Android app carries the CI debug keystore's SHA-1:
> `01:77:91:51:…:c0:d4`), Google + Email/Password providers enabled,
> Firestore created in **asia-south1**, `firestore.rules` deployed,
> all 12 composite indexes **READY**, Firestore seeded (9 users /
> 35 listings / 30 requests / 29 reviews / 6 messages / 2
> notifications), and a live smoke test passes
> (`node scripts/smoke-live.mjs`). Rules and indexes were deployed
> through the API with the service-account key (which was granted the
> Cloud Datastore Index Admin role for that purpose); on your own
> machine, `firebase login` + Part C below does the same job.
> The write-up below is kept as the record of how it was set up.
>
> **One thing remains: Cloud Storage.** Firebase now requires the
> pay-as-you-go **Blaze** plan before Storage can be enabled at all
> (the console shows "Storage requires a billing account"). Auth and
> Firestore run fine on Spark; only Phase 4 photo uploads need
> Storage. Upgrading to Blaze is a billing decision — it adds a card
> to the account, though Storage has a no-cost usage allowance and
> this app's demo-scale usage stays inside it. Until then the app
> runs without photo storage and falls back to emoji/placeholder
> imagery, exactly as designed.

The code is done: with `VITE_FIREBASE_*` set, the web app runs on
Firebase Auth + Firestore, and the Flutter app activates Google
Sign-In when it finds its config file. What remains is creating the
Firebase project and handing the apps their config — about 20 minutes,
all on the free **Spark** plan, no card required.

> Everything in a Firebase web/Android config (`apiKey`, `appId`, …) is
> a public identifier, not a secret — protection comes from
> `firestore.rules` / `storage.rules`. The one file that IS a secret is
> the **service-account key** in Part D: never commit it, never share it.

---

## Part A — Project + app registration

1. Go to <https://console.firebase.google.com> and sign in with your
   Google account (2-Step Verification is on — keep your phone handy).
2. Click **Add project** → name it `NeighborMart` → **Continue**.
   Turn **Google Analytics off** (not needed) → **Create project** →
   **Continue** when it finishes.
3. On the project overview, click the **web icon `</>`** ("Add an app").
   - App nickname: `NeighborMart Web`
   - Leave "Also set up Firebase Hosting" **unticked**
   - **Register app**
   - It shows a `firebaseConfig` object — keep this tab open for Part D.
4. Back on the overview, click **Add app → Android**.
   - Android package name: `com.neighbormart.app` (must match exactly)
   - App nickname: `NeighborMart Android`
   - **Register app**, then **Download google-services.json** and save
     the file as `mobile/android/app/google-services.json` in the repo.
     (It's public config like the web one — safe to commit.)
   - Skip the rest of that wizard ("Next" through to "Continue to console").
5. **Android SHA-1** (needed for Google Sign-In on Android): in Android
   Studio, open the Gradle tool window → app → Tasks → android →
   double-click **signingReport**, and copy the **SHA-1** under
   `Variant: debug`. No Android Studio? Run this in a terminal instead:
   ```
   keytool -list -v -keystore "%USERPROFILE%\.android\debug.keystore" -alias androiddebugkey -storepass android -keypass android
   ```
   Then in Firebase: **Project settings (gear) → General → your Android
   app → Add fingerprint** → paste the SHA-1 → **Save**.
   (When the app gets a real release key later, add that SHA-1 too.)

## Part B — Turn on Auth, Firestore, Storage

6. Left menu → **Build → Authentication → Get started**.
   - **Sign-in method** tab → **Google** → toggle **Enable** → set the
     project support email to your address → **Save**.
   - Again on **Sign-in method** → **Email/Password** → **Enable** →
     **Save**.
   - If Google Cloud asks you to configure the **OAuth consent screen**:
     user type **External**, app name `NeighborMart`, support email =
     yours, developer contact = yours → **Save** (Testing mode is fine).
   - **Settings** tab → **Authorized domains**: `localhost` is already
     there. Add your production domain here when you deploy (Part C
     note) — otherwise Google sign-in will refuse to open there.
7. Left menu → **Build → Firestore Database → Create database**.
   - Location: **asia-south1 (Mumbai)** — closest to Lahore; it can't be
     changed later.
   - Start in **production mode** → **Create**. (The repo's rules are
     deployed in Part C; until then the default production rules deny
     everything, which is safe.)
8. Left menu → **Build → Storage → Get started** → **production mode**
   → **Done**.

## Part C — Deploy the rules and indexes

Preferred — Firebase CLI (does rules + all 12 indexes in one command):

9. On your computer: `npm install -g firebase-tools`, then in the repo:
   ```
   firebase login
   firebase use --add        # pick the NeighborMart project, alias: default
   firebase deploy --only firestore:rules,firestore:indexes,storage
   ```

No-CLI alternative (console paste):

9b. **Firestore → Rules** tab → replace the contents with the repo's
`firestore.rules` → **Publish**. Same for **Storage → Rules** with
`storage.rules`. Indexes can be added one by one under
**Firestore → Indexes → Add index** using `firestore.indexes.json`
as the list (or let Firestore's error messages deep-link you to
create each one the first time a query needs it).

## Part D — Config, demo data, first run

10. **Web config:** copy `.env.example` to a new file named `.env.local`
    and fill it from the `firebaseConfig` you kept open in step 3:
    | firebaseConfig key | .env.local variable               |
    | ------------------ | --------------------------------- |
    | apiKey             | VITE_FIREBASE_API_KEY             |
    | authDomain         | VITE_FIREBASE_AUTH_DOMAIN         |
    | projectId          | VITE_FIREBASE_PROJECT_ID          |
    | storageBucket      | VITE_FIREBASE_STORAGE_BUCKET      |
    | messagingSenderId  | VITE_FIREBASE_MESSAGING_SENDER_ID |
    | appId              | VITE_FIREBASE_APP_ID              |
11. **Demo data (one time):** **Project settings → Service accounts →
    Generate new private key** → save the JSON somewhere private
    (outside the repo). Then in the repo:
    ```
    # PowerShell (Windows)
    $env:GOOGLE_APPLICATION_CREDENTIALS = "C:\path\to\key.json"
    # bash
    export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json

    npm run seed:firestore
    ```
    This writes the 9 demo neighbors, 35 listings, requests, reviews,
    messages, and notifications, and creates demo Auth accounts:
    `maya.chen@example.com` etc., password **`borrow123`** (demo only —
    delete these accounts before any real launch).
12. **Run it:** `npm run dev` → open the app → **Sign in** (top right)
    → Continue with Google or a demo account. Your profile document is
    created automatically on first login (check **Firestore → users**).
    Browsing works signed-out; listing, messaging, and the dashboard
    ask you to sign in.
13. **Flutter:** with `google-services.json` in place (step 4), build
    the APK the usual way (GitHub Actions). The login screen's
    **Continue with Google** button is live; email demo accounts work
    too. Note: the Actions build signs with its own debug key, so for
    Google Sign-In inside CI-built APKs, also add the SHA-1 of that
    key — or test Google Sign-In from a local `flutter run` build,
    whose debug key matches step 5.

## How the fallback works

No `.env.local` → the app uses its built-in mock data layer (that's
what unit tests and CI run). The moment the variables exist, the same
screens talk to Firestore instead — the switch is
`src/services/firebase.ts` (`isFirebaseConfigured`), and no component
knows the difference.
