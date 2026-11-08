# Cloudinary setup for NeighborMart (Phase 4 — photo uploads)

NeighborMart stores listing photos on **Cloudinary's free tier** instead of
Firebase Storage (which requires the paid Blaze plan). Uploads from the app
are **unsigned** through one locked-down upload preset: images only, 5 MB
max, one folder. Thumbnails and gallery sizes are produced on the fly with
Cloudinary URL transforms — nothing extra to configure.

Only two values are needed, and **both are public by design** (they ship in
the browser bundle). Never put the Cloudinary API key or API secret in
`.env.local` or anywhere in the frontend.

## 1. Create the account

1. Go to [cloudinary.com](https://cloudinary.com) → **Sign up for free**.
2. Use the free plan — no card required.
3. After sign-up you land on the **Dashboard**. Note your **Cloud name**
   (shown at the top, e.g. `dxy123abc`). This is value #1.

## 2. Create the restricted upload preset

1. Open **Settings** (gear icon, bottom-left) → **Upload** tab.
2. Scroll to **Upload presets** → **Add upload preset**.
3. Set exactly:
   - **Preset name:** `neighbormart_listings`
   - **Signing mode:** **Unsigned**
   - **Folder:** `neighbormart/listings`
   - **Use unique filename:** ON (prevents collisions/overwrites)
   - **Overwrite:** OFF
   - **Access mode:** Public
4. Under **Upload restrictions / Transformations on upload** (wording varies
   slightly by console version):
   - **Allowed formats:** `jpg`, `png`, `webp` (images only — no video/PDF)
   - **Maximum file size:** the current Cloudinary console has NO
     max-file-size field on upload presets (checked on the live account,
     2026-11-08) — the 5 MB limit is enforced client-side in the app
     before every upload instead (web + Flutter validators).
   - Max width: also no dedicated field — set as an incoming
     transformation `c_limit,w_2000` on the preset (done on the live
     account); the app also compresses client-side to ~1600 px.
5. **Save** the preset.

> Live account (created 2026-11-08): cloud name `sgwcguwo`, free plan,
> preset `neighbormart_listings` exactly as above.

## 3. Put the two values in `.env.local`

In the repo root, add (or extend) `.env.local`:

```
VITE_CLOUDINARY_CLOUD_NAME=<your cloud name from the Dashboard>
VITE_CLOUDINARY_UPLOAD_PRESET=neighbormart_listings
```

Then tell Muse the cloud name (the preset name is fixed above, so only the
cloud name is needed) and Phase 4 can be built against the real account.

## How Phase 4 will use this

- **Upload:** browser compresses/resizes first (~1600 px max, WebP/JPEG),
  then POSTs to `https://api.cloudinary.com/v1_1/<cloud>/image/upload` with
  the unsigned preset. Per-section caps: items 10, vehicles 15,
  properties 20, arenas 10 photos.
- **Listing doc:** Firestore keeps the ordered photo array; photo #1 is the
  cover. Reorder and cover changes are just array edits.
- **Thumbnails:** URL transforms on the delivery URL, e.g.
  cards `w_600,h_450,c_fill,q_auto,f_auto`, detail `w_1600,q_auto,f_auto`.
- **Delete:** removing a photo drops it from the listing's array
  immediately. Actually destroying the asset in Cloudinary needs a _signed_
  call (API secret), which unsigned browser uploads cannot do — orphaned
  assets are cleaned up later with an admin script; they cost nothing at
  free-tier scale and are never linked from the app once removed.
