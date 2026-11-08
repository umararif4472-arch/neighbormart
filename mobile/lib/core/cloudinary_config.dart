import '../data/models/listing.dart';

/// Phase 4 — Cloudinary photo storage (Flutter mirror of the web
/// config). Both values are PUBLIC by design: uploads are unsigned
/// through a restricted preset, so the cloud name + preset name ship in
/// the app exactly like google-services.json. The Cloudinary API key /
/// secret are never used by the client.
const String kCloudinaryCloudName = 'sgwcguwo';
const String kCloudinaryUploadPreset = 'neighbormart_listings';

/// Unsigned upload endpoint for our cloud.
const String kCloudinaryUploadUrl =
    'https://api.cloudinary.com/v1_1/$kCloudinaryCloudName/image/upload';

/// Delivery host prefix for our cloud's images.
const String _deliveryPrefix =
    'https://res.cloudinary.com/$kCloudinaryCloudName/image/upload/';

/// Transform used for listing cards / thumbnails everywhere.
const String kCardImageTransform = 'w_600,h_450,c_fill,q_auto,f_auto';

/// Larger transform for detail heroes / galleries.
const String kDetailImageTransform = 'w_1200,h_900,c_fill,q_auto,f_auto';

/// Hard per-photo size limit (5 MB). The unsigned preset cannot enforce
/// size, so every client MUST check this before uploading.
const int kMaxPhotoBytes = 5 * 1024 * 1024;

/// Per-section photo caps (Phase 4 spec, same numbers as the web app).
const Map<ListingSection, int> kPhotoCaps = {
  ListingSection.items: 10,
  ListingSection.vehicles: 15,
  ListingSection.properties: 20,
  ListingSection.arenas: 10,
};

int photoCapForSection(ListingSection section) => kPhotoCaps[section] ?? 10;

/// Sections that cannot publish without this many real uploaded photos.
const Map<ListingSection, int> kMinPhotosToPublish = {
  ListingSection.vehicles: 3,
  ListingSection.properties: 3,
};

int minPhotosForSection(ListingSection section) =>
    kMinPhotosToPublish[section] ?? 0;

/// True when [url] is a delivery URL from OUR Cloudinary cloud.
bool isCloudinaryUrl(String url) => url.startsWith(_deliveryPrefix);

/// Insert [transform] into a Cloudinary delivery URL (right after
/// `/upload/`, before an optional `v<version>` segment). Foreign URLs,
/// local paths and already-transformed URLs are returned unchanged, so
/// this is safe to call on any photo source.
String cloudinaryImageUrl(String url, {String? transform}) {
  if (transform == null || transform.isEmpty) return url;
  if (!isCloudinaryUrl(url)) return url;
  final rest = url.substring(_deliveryPrefix.length);
  if (rest.isEmpty) return url;
  final first = rest.split('/').first;
  // Already transformed: a transform segment contains ',' (e.g.
  // "w_600,h_450,...") — never stack a second one.
  if (first.contains(',')) return url;
  // Inserting at the front is correct both for plain public ids and
  // for versioned URLs (.../upload/v1712345/photo.jpg → the transform
  // goes before the version segment).
  return '$_deliveryPrefix$transform/$rest';
}

/// Card/thumbnail URL for any photo source: Cloudinary photos get the
/// card transform, everything else passes through unchanged.
String cardImageUrl(String url) =>
    cloudinaryImageUrl(url, transform: kCardImageTransform);

/// Detail/hero URL for any photo source.
String detailImageUrl(String url) =>
    cloudinaryImageUrl(url, transform: kDetailImageTransform);

/// How many of [photoUrls] are real uploads on our Cloudinary cloud.
/// Temporary local paths and foreign links do NOT count.
int uploadedCloudinaryCount(Iterable<String> photoUrls) =>
    photoUrls.where(isCloudinaryUrl).length;

/// Publish gate for photos: returns a user-facing error string when the
/// section's minimum is not met by DONE Cloudinary uploads, else null.
String? photoPublishError(ListingSection section, List<String> photoUrls) {
  final minimum = minPhotosForSection(section);
  if (minimum == 0) return null;
  if (uploadedCloudinaryCount(photoUrls) >= minimum) return null;
  final label = section == ListingSection.vehicles ? 'vehicle' : 'property';
  return 'Add at least $minimum uploaded photos to publish a $label — '
      'buyers need to see it.';
}
