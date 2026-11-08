# NeighborMart — Launch Checklist

Everything left between "the code is done" and "real users". Items are
grouped by who does them. The app itself shipped in Phase 8:

- **Live web app:** https://neighbormart-7eff0.web.app
  (also https://neighbormart-7eff0.firebaseapp.com)
- **Public legal pages** (needed by Google OAuth + Play Store):
  - Terms: https://neighbormart-7eff0.web.app/terms
  - Privacy: https://neighbormart-7eff0.web.app/privacy
  - Safety: https://neighbormart-7eff0.web.app/safety

---

## 1. Before real users (do these first)

### 1a. Remove the demo data from live Firebase

The live project still contains the 9 demo accounts
(`firstname.lastname@example.com`) and their seed listings/requests.
Remove them when you're ready for real users — **there is no undo**:

```bash
node scripts/remove-demo-data.mjs            # dry run — prints everything it would delete
node scripts/remove-demo-data.mjs --confirm  # actually delete (Firestore docs + Auth users)
```

After cleanup:

- `scripts/smoke-live.mjs` needs a real account: run it with
  `SMOKE_EMAIL` / `SMOKE_PASSWORD` env vars.
- The seed script no longer has a built-in password. It only runs with
  `ALLOW_DEMO_SEED=1 DEMO_SEED_PASSWORD=<throwaway> npm run seed` and is
  for dev/demo projects only — never against production.
- The Flutter app's built-in demo login (`borrow123`) only unlocks the
  app's local mock data on the device — after the cleanup it no longer
  signs in to anything real.

### 1b. Make yourself the first moderator

1. Sign in to the live app once with your own Google account.
2. Firebase Console → Firestore → `users` → your document → **Add field**:
   `role` (string) = `admin`.
3. The **Moderation** link appears in the navbar; the queue also lives
   at https://neighbormart-7eff0.web.app/moderation.
   (Security rules prevent anyone from promoting themselves — the field
   can only be set from the console/Admin SDK.)

### 1c. Have the legal pages reviewed

`/terms` and `/privacy` are templates written for how the app actually
behaves (no payment processing, Firebase + Cloudinary as processors).
Have a lawyer review them before commercial launch, and put a real
contact email in the Privacy Policy.

---

## 2. Google OAuth consent screen → production

Firebase created the OAuth consent screen in **Testing** mode (only
test users can sign in with Google). Publish it:

1. Go to https://console.cloud.google.com/apis/credentials/consent
   and select the **neighbormart-7eff0** project.
2. **App information:** name `NeighborMart`, user support email = yours,
   app logo = `public/icon-512.png` from the repo.
3. **App domain:** home page `https://neighbormart-7eff0.web.app`,
   Privacy Policy `https://neighbormart-7eff0.web.app/privacy`,
   Terms `https://neighbormart-7eff0.web.app/terms`.
4. **Authorized domains:** `neighbormart-7eff0.web.app` (Firebase Auth
   already authorizes `localhost`, `…firebaseapp.com`, `…web.app` —
   verified in Phase 8).
5. **Scopes:** keep only `openid`, `email`, `profile` (what Firebase
   Auth requests). No sensitive scopes ⇒ no Google verification review.
6. Click **Publish app** → confirm. Status changes Testing → In production.

---

## 3. Google Play (Android)

### 3a. Create your upload keystore (once, on your own machine)

The AAB must be signed with YOUR private key — it lives only with you.
Never commit it, never share the password.

```bash
keytool -genkey -v -keystore ~/neighbormart-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias neighbormart-upload
```

Then create `mobile/android/key.properties` (git-ignored already):

```
storePassword=<your password>
keyPassword=<your password>
keyAlias=neighbormart-upload
storeFile=<absolute path to neighbormart-upload.jks>
```

Back the .jks + passwords up somewhere safe (password manager). Losing
them means contacting Google to reset your upload key.

### 3b. Point the release build at the keystore

`mobile/android/app/build.gradle.kts` currently signs release builds
with the debug key. Load `key.properties` and use it for the release
signing config (standard Flutter pattern — see
https://docs.flutter.dev/deployment/android#sign-the-app). Ask Muse to
apply this change when you're ready; then:

```bash
cd mobile
flutter build appbundle --release   # produces build/app/outputs/bundle/release/app-release.aab
```

**Do not build the AAB until you've done 3a** — and per project rules,
Muse builds it only on your explicit go-ahead.

### 3c. Play Console setup

1. **Developer account:** https://play.google.com/console — $25 one-time,
   identity verification can take a few days. New personal accounts must
   also complete a **closed test with 20 testers for 14 days** before
   production (Google requirement).
2. **Create app:** name `NeighborMart`, default language English,
   app (not game), free.
3. **Store listing:**
   - Short description (80 chars): "Borrow, rent, buy & sell items,
     vehicles, homes and arenas near you."
   - Full description: reuse the landing-page copy (four sections,
     trust scores, in-app chat, no advance payments — meet in person).
   - Graphics: icon = `public/icon-512.png`; feature graphic 1024×500
     (make one from the landing hero); **4–8 phone screenshots**
     (1080×1920+) — capture: landing, browse a section, a listing with
     photos, arena slot booking, chat, profile with trust score.
4. **Privacy Policy URL:** https://neighbormart-7eff0.web.app/privacy
5. **Data safety form** (declare honestly):
   - Collected: name, email, profile photo (account); phone number
     (optional, user-provided); photos (user content); messages
     (in-app chat); approximate location (city/neighborhood, not GPS).
   - Shared with processors: Google Firebase (auth/database/hosting),
     Cloudinary (photo storage). Not sold. Not used for ads.
   - Users can request deletion: **in-app account deletion exists**
     (Profile → Safety & account → Delete my account) — say yes.
6. **Content rating:** complete the questionnaire (marketplace with
   user-generated content + chat ⇒ expect a Teen/PEGI 12-ish rating).
7. **Target audience:** 18+ (or 13+ with the UGC safeguards declared:
   reporting, blocking, moderation — all shipped in Phase 8).
8. **App access:** reviewers need a login. Create ONE dedicated review
   account (real email, strong password, NOT a demo seed) and put its
   credentials in the Play Console "App access" instructions.
9. **Ads declaration:** the app contains no ads.

---

## 4. Optional upgrades (post-launch)

- **Sentry:** the hook point is marked in `src/utils/globalErrors.ts`
  (`TODO: forward to Sentry`). Add the DSN as a `VITE_SENTRY_DSN` env
  var when you create the Sentry project.
- **Harder rate limits:** current limits (10 listings/24h, 30
  messages/min) are enforced by Firestore rules + per-user counter
  docs. Bulletproof server-side limiting needs Cloud Functions, which
  requires the Blaze plan (a card on file; free tier is generous).
- **Listing-level SEO:** the sitemap covers public routes. Per-listing
  pages are client-rendered; for rich link previews per listing, add a
  small prerender/OG function later.
- **Custom domain:** Firebase Console → Hosting → Add custom domain,
  then add it to Firebase Auth authorized domains too.
- **Firestore backups:** scheduled exports need a storage bucket
  (Blaze). Until then, the seed data can be recreated with the seed
  script in a dev project.

---

## 5. Redeploying the web app

```bash
npm run lint && npm run typecheck && npm test && npm run build
node scripts/deploy-hosting.mjs   # prints the live URL when done
```

CI (`.github/workflows/ci.yml`) runs lint/typecheck/test/build for web
and analyze/test for Flutter on every pull request automatically.
