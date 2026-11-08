import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:image_picker/image_picker.dart';

import '../../core/cloudinary_config.dart';

/// Phase 4 — one photo in a listing form, with its upload lifecycle.
///
/// A photo starts life as a local pick ([localPath] set, status
/// uploading), becomes [PhotoUploadStatus.done] once Cloudinary returns
/// a [remoteUrl], or lands in [PhotoUploadStatus.failed] with a
/// user-facing [error] and can be retried. Only done entries contribute
/// their remote URL to a published listing — temporary file paths are
/// never saved.
enum PhotoUploadStatus { uploading, done, failed }

class ListingPhoto {
  final String? localPath;
  final String? remoteUrl;

  /// 0..1 upload progress while [status] is uploading.
  final double progress;
  final PhotoUploadStatus status;
  final String? error;

  const ListingPhoto._({
    this.localPath,
    this.remoteUrl,
    this.progress = 0,
    required this.status,
    this.error,
  });

  /// A fresh pick on its way up.
  factory ListingPhoto.uploading(String localPath) =>
      ListingPhoto._(localPath: localPath, status: PhotoUploadStatus.uploading);

  /// An already-hosted photo (seed/edit flows, or a finished upload).
  factory ListingPhoto.done(String remoteUrl, {String? localPath}) =>
      ListingPhoto._(
        localPath: localPath,
        remoteUrl: remoteUrl,
        progress: 1,
        status: PhotoUploadStatus.done,
      );

  /// A pick/upload that failed validation or the network.
  factory ListingPhoto.failed(String localPath, String error) => ListingPhoto._(
    localPath: localPath,
    status: PhotoUploadStatus.failed,
    error: error,
  );

  bool get isDone => status == PhotoUploadStatus.done && remoteUrl != null;
  bool get isUploading => status == PhotoUploadStatus.uploading;
  bool get isFailed => status == PhotoUploadStatus.failed;

  /// What to render in a thumbnail: the hosted image once uploaded,
  /// otherwise the local pick.
  String get displaySource => remoteUrl ?? localPath ?? '';

  ListingPhoto copyWith({
    double? progress,
    PhotoUploadStatus? status,
    String? remoteUrl,
    String? error,
    bool clearError = false,
  }) {
    return ListingPhoto._(
      localPath: localPath,
      remoteUrl: remoteUrl ?? this.remoteUrl,
      progress: progress ?? this.progress,
      status: status ?? this.status,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

/// The remote URLs of all finished uploads, in order (first = cover).
List<String> uploadedUrlsOf(List<ListingPhoto> photos) =>
    photos.where((p) => p.isDone).map((p) => p.remoteUrl!).toList();

/// Upload failure with a message safe to show to the user.
class PhotoUploadException implements Exception {
  final String message;
  const PhotoUploadException(this.message);
  @override
  String toString() => message;
}

typedef PhotoProgressCallback = void Function(double progress);

/// Allowed image extensions (jpg covers .jpeg) — mirrors the preset's
/// allowed formats; anything else is rejected before any network call.
const Set<String> kAllowedPhotoExtensions = {'jpg', 'jpeg', 'png', 'webp'};

String photoExtensionOf(String nameOrPath) {
  final dot = nameOrPath.lastIndexOf('.');
  if (dot < 0 || dot == nameOrPath.length - 1) return '';
  return nameOrPath.substring(dot + 1).toLowerCase();
}

String _mimeForExtension(String ext) => switch (ext) {
  'png' => 'image/png',
  'webp' => 'image/webp',
  _ => 'image/jpeg',
};

/// Pre-upload validation: format + the 5 MB cap the unsigned preset
/// cannot enforce. Returns a user-facing error, or null when the file
/// may be uploaded.
String? validatePhotoFile({
  required String nameOrPath,
  required int sizeBytes,
}) {
  final ext = photoExtensionOf(nameOrPath);
  if (!kAllowedPhotoExtensions.contains(ext)) {
    return 'Only JPG, PNG or WebP photos can be uploaded.';
  }
  if (sizeBytes <= 0) {
    return 'That photo could not be read — try picking it again.';
  }
  if (sizeBytes > kMaxPhotoBytes) {
    final mb = (sizeBytes / (1024 * 1024)).toStringAsFixed(1);
    return 'That photo is $mb MB — the limit is 5 MB per photo. '
        'Pick a smaller one.';
  }
  return null;
}

/// Extract `secure_url` from a Cloudinary upload response body. Throws
/// [PhotoUploadException] with Cloudinary's own message when the API
/// reported an error or the body is not what we expect.
String parseUploadResponse(String body) {
  Object? decoded;
  try {
    decoded = jsonDecode(body);
  } catch (_) {
    throw const PhotoUploadException(
      'Upload failed — the server sent an unreadable reply. Try again.',
    );
  }
  if (decoded is Map<String, dynamic>) {
    final secureUrl = decoded['secure_url'];
    if (secureUrl is String && secureUrl.isNotEmpty) return secureUrl;
    final error = decoded['error'];
    if (error is Map && error['message'] is String) {
      throw PhotoUploadException('Upload failed — ${error['message']}');
    }
  }
  throw const PhotoUploadException(
    'Upload failed — no image URL came back. Try again.',
  );
}

/// The multipart pieces for one unsigned upload, built once so the same
/// bytes can be streamed to the socket in chunks (progress) and unit
/// tested. Body = file part + upload_preset field + closing boundary.
({Uint8List body, String contentType}) buildMultipartBody({
  required List<int> fileBytes,
  required String filename,
  required String boundary,
}) {
  final ext = photoExtensionOf(filename);
  final head = StringBuffer()
    ..write('--$boundary\r\n')
    ..write(
      'Content-Disposition: form-data; name="file"; filename="$filename"\r\n',
    )
    ..write('Content-Type: ${_mimeForExtension(ext)}\r\n\r\n');
  final tail = StringBuffer()
    ..write('\r\n--$boundary\r\n')
    ..write('Content-Disposition: form-data; name="upload_preset"\r\n\r\n')
    ..write('$kCloudinaryUploadPreset\r\n')
    ..write('--$boundary--\r\n');
  final builder = BytesBuilder(copy: false)
    ..add(utf8.encode(head.toString()))
    ..add(fileBytes)
    ..add(utf8.encode(tail.toString()));
  return (
    body: builder.toBytes(),
    contentType: 'multipart/form-data; boundary=$boundary',
  );
}

/// Uploads picked photos to Cloudinary with real progress.
///
/// Deliberately built on `dart:io` HttpClient (no new dependency): the
/// multipart body is written to the request sink in 32 KB chunks, and
/// progress is reported as bytes-handed-to-the-socket / total bytes.
/// Compression happens at pick time — the picker is always called with
/// maxWidth/maxHeight 1600 and imageQuality 85 by the UI layer.
class PhotoUploadService {
  const PhotoUploadService();

  static const int _chunkSize = 32 * 1024;

  /// Validate then upload one picked file; resolves to the Cloudinary
  /// `secure_url`. Throws [PhotoUploadException] with a friendly
  /// message on validation, network, or API failure — callers keep the
  /// [ListingPhoto] entry and offer Retry, which simply calls this
  /// again for the same file.
  Future<String> uploadXFile(
    XFile file, {
    PhotoProgressCallback? onProgress,
  }) async {
    final int size;
    final Uint8List bytes;
    try {
      size = await file.length();
      final validationError = validatePhotoFile(
        nameOrPath: file.name,
        sizeBytes: size,
      );
      if (validationError != null) {
        throw PhotoUploadException(validationError);
      }
      bytes = await file.readAsBytes();
    } on PhotoUploadException {
      rethrow;
    } catch (_) {
      throw const PhotoUploadException(
        'That photo could not be read — try picking it again.',
      );
    }
    return uploadBytes(
      bytes: bytes,
      filename: file.name,
      onProgress: onProgress,
    );
  }

  /// Upload raw image bytes (the testable core of [uploadXFile]).
  Future<String> uploadBytes({
    required List<int> bytes,
    required String filename,
    PhotoProgressCallback? onProgress,
  }) async {
    final validationError = validatePhotoFile(
      nameOrPath: filename,
      sizeBytes: bytes.length,
    );
    if (validationError != null) throw PhotoUploadException(validationError);

    final boundary =
        'neighbormart-${DateTime.now().microsecondsSinceEpoch.toRadixString(16)}';
    final (:body, :contentType) = buildMultipartBody(
      fileBytes: bytes,
      filename: filename,
      boundary: boundary,
    );

    final client = HttpClient();
    try {
      final request = await client.postUrl(Uri.parse(kCloudinaryUploadUrl));
      request.headers.set(HttpHeaders.contentTypeHeader, contentType);
      request.contentLength = body.length;

      var sent = 0;
      for (var offset = 0; offset < body.length; offset += _chunkSize) {
        final end = (offset + _chunkSize > body.length)
            ? body.length
            : offset + _chunkSize;
        request.add(body.sublist(offset, end));
        sent = end;
        onProgress?.call(body.isEmpty ? 1 : sent / body.length);
        // Let the socket drain a little between chunks so the progress
        // callbacks track the actual send instead of just buffering.
        await request.flush();
      }

      final response = await request.close();
      final responseBody = await response
          .transform(utf8.decoder)
          .join()
          .timeout(const Duration(seconds: 60));
      if (response.statusCode < 200 || response.statusCode >= 300) {
        // Cloudinary still sends a JSON error body on failures — parse
        // it for its message before falling back to the status code.
        try {
          parseUploadResponse(responseBody);
        } on PhotoUploadException {
          rethrow;
        }
        throw PhotoUploadException(
          'Upload failed (server said ${response.statusCode}). Try again.',
        );
      }
      return parseUploadResponse(responseBody);
    } on PhotoUploadException {
      rethrow;
    } on TimeoutException {
      throw const PhotoUploadException(
        'Upload timed out — check your connection and retry.',
      );
    } catch (_) {
      throw const PhotoUploadException(
        'Upload failed — check your connection and retry.',
      );
    } finally {
      client.close(force: true);
    }
  }
}
