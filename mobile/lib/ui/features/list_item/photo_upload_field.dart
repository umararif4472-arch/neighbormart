import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/cloudinary_config.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/listing.dart';
import '../../../data/services/photo_upload_service.dart';

/// Phase 4 — the photo step shared by both listing flows (items wizard
/// + vehicles/properties/arenas form). Fully controlled: the parent
/// owns the [ListingPhoto] list; this widget renders it and emits a new
/// list on every change (pick, progress tick, success, failure, retry,
/// reorder, cover, delete).
///
/// Picks are compressed at pick time (max 1600px, quality 85) and start
/// uploading immediately; only entries that finish carry a Cloudinary
/// URL, and only those URLs may be published.
class PhotoUploadField extends StatefulWidget {
  final ListingSection section;
  final List<ListingPhoto> photos;
  final ValueChanged<List<ListingPhoto>> onChanged;

  /// Category used for the emoji fallback tile (items pass their
  /// category, other sections pass 'Other').
  final String fallbackCategory;
  final PhotoUploadService service;
  final ImagePicker picker;

  PhotoUploadField({
    super.key,
    required this.section,
    required this.photos,
    required this.onChanged,
    this.fallbackCategory = 'Other',
    PhotoUploadService? service,
    ImagePicker? picker,
  }) : service = service ?? const PhotoUploadService(),
       picker = picker ?? ImagePicker();

  @override
  State<PhotoUploadField> createState() => _PhotoUploadFieldState();
}

class _PhotoUploadFieldState extends State<PhotoUploadField> {
  /// Picked files by path, so Retry re-uploads the exact same file.
  final Map<String, XFile> _pickedFiles = {};

  int get _cap => photoCapForSection(widget.section);
  bool get _atCap => widget.photos.length >= _cap;

  void _emit(List<ListingPhoto> next) => widget.onChanged(next);

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  // -- picking + uploading -------------------------------------------------

  Future<void> _pickFromGallery() async {
    try {
      final picked = await widget.picker.pickMultiImage(
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );
      _addPicks(picked);
    } catch (_) {
      _snack('Could not open the gallery on this device.');
    }
  }

  Future<void> _takePhoto() async {
    try {
      final picked = await widget.picker.pickImage(
        source: ImageSource.camera,
        maxWidth: 1600,
        maxHeight: 1600,
        imageQuality: 85,
      );
      if (picked != null) _addPicks([picked]);
    } catch (_) {
      _snack('Could not open the camera on this device.');
    }
  }

  void _addPicks(List<XFile> files) {
    if (files.isEmpty) return;
    final room = _cap - widget.photos.length;
    if (room <= 0) {
      _snack('Up to $_cap photos per listing.');
      return;
    }
    final accepted = files.take(room).toList();
    final entries = <ListingPhoto>[];
    for (final file in accepted) {
      _pickedFiles[file.path] = file;
      entries.add(ListingPhoto.uploading(file.path));
    }
    _emit([...widget.photos, ...entries]);
    if (accepted.length < files.length) {
      _snack('Up to $_cap photos per listing.');
    }
    for (final entry in entries) {
      _startUpload(entry);
    }
  }

  Future<void> _startUpload(ListingPhoto entry) async {
    final file = _pickedFiles[entry.localPath];
    if (file == null) {
      _replace(
        entry,
        entry.copyWith(
          status: PhotoUploadStatus.failed,
          error: 'That photo is no longer available — pick it again.',
        ),
      );
      return;
    }
    try {
      final url = await widget.service.uploadXFile(
        file,
        onProgress: (progress) {
          _replace(
            _current(entry),
            _current(entry).copyWith(progress: progress),
          );
        },
      );
      final current = _current(entry);
      _replace(current, ListingPhoto.done(url, localPath: current.localPath));
    } on PhotoUploadException catch (e) {
      _replace(
        _current(entry),
        _current(entry)
            .copyWith(status: PhotoUploadStatus.failed, error: e.message),
      );
    } catch (_) {
      _replace(
        _current(entry),
        _current(entry).copyWith(
          status: PhotoUploadStatus.failed,
          error: 'Upload failed — check your connection and retry.',
        ),
      );
    }
  }

  void _retry(ListingPhoto entry) {
    final uploading = entry.copyWith(
      status: PhotoUploadStatus.uploading,
      progress: 0,
      clearError: true,
    );
    _replace(entry, uploading);
    _startUpload(uploading);
  }

  // -- list operations -----------------------------------------------------

  /// The freshest copy of [entry] in the controlled list (uploads tick
  /// progress into it while network calls are in flight).
  ListingPhoto _current(ListingPhoto entry) {
    for (final photo in widget.photos) {
      if (photo.localPath == entry.localPath &&
          photo.remoteUrl == entry.remoteUrl) {
        return photo;
      }
    }
    return entry;
  }

  void _replace(ListingPhoto old, ListingPhoto updated) {
    final index = widget.photos.indexOf(old);
    if (index < 0) return;
    final next = [...widget.photos];
    next[index] = updated;
    _emit(next);
  }

  void _remove(int index) {
    final removed = widget.photos[index];
    if (removed.localPath != null) _pickedFiles.remove(removed.localPath);
    _emit([...widget.photos]..removeAt(index));
  }

  void _move(int index, int delta) {
    final target = index + delta;
    if (target < 0 || target >= widget.photos.length) return;
    final next = [...widget.photos];
    final item = next.removeAt(index);
    next.insert(target, item);
    _emit(next);
  }

  void _makeCover(int index) {
    if (index <= 0) return;
    final next = [...widget.photos];
    final item = next.removeAt(index);
    next.insert(0, item);
    _emit(next);
  }

  // -- UI ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Text(
              'Photos',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
            ),
            const SizedBox(width: 8),
            Text(
              '${photos.length}/$_cap',
              style: TextStyle(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                fontSize: 13,
              ),
            ),
            if (photos.any((p) => p.isUploading))
              Padding(
                padding: const EdgeInsets.only(left: 8),
                child: Text(
                  'Uploading…',
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontSize: 13,
                  ),
                ),
              ),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          'Photos upload as you add them. The first photo is the cover.',
          style: TextStyle(
            color: Theme.of(context).colorScheme.onSurfaceVariant,
            fontSize: 13,
          ),
        ),
        const SizedBox(height: 10),
        if (photos.isNotEmpty)
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: List.generate(photos.length, (i) => _tile(i, photos[i])),
          ),
        if (photos.isNotEmpty) const SizedBox(height: 10),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _atCap ? null : _pickFromGallery,
                icon: const Icon(Icons.photo_library_outlined, size: 18),
                label: const Text('Add from gallery'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _atCap ? null : _takePhoto,
                icon: const Icon(Icons.camera_alt_outlined, size: 18),
                label: const Text('Take a photo'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _tile(int index, ListingPhoto photo) {
    return SizedBox(
      width: 88,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Stack(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: SizedBox(
                  width: 88,
                  height: 80,
                  child: itemPhotoImage(
                    photo.displaySource,
                    category: widget.fallbackCategory,
                    fit: BoxFit.cover,
                    fallbackSize: 80,
                    width: 88,
                    height: 80,
                  ),
                ),
              ),
              if (photo.isUploading)
                Positioned.fill(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      color: Colors.black45,
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          LinearProgressIndicator(
                            value: photo.progress > 0 ? photo.progress : null,
                            color: Colors.white,
                            backgroundColor: Colors.white24,
                          ),
                          const SizedBox(height: 6),
                          Text(
                            '${(photo.progress * 100).round()}%',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (photo.isFailed)
                Positioned.fill(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      color: Colors.black54,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(
                            Icons.error_outline,
                            color: Colors.white,
                            size: 20,
                          ),
                          TextButton.icon(
                            onPressed: () => _retry(photo),
                            icon: const Icon(Icons.refresh, size: 16),
                            label: const Text('Retry'),
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 6,
                              ),
                              minimumSize: const Size(0, 28),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              if (index == 0 && photo.isDone)
                Positioned(
                  top: 4,
                  left: 4,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 6,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black54,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Cover',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              Positioned(
                top: 0,
                right: 0,
                // 48dp hit area (was a 22dp visual-only target);
                // the dark circle visual stays 22dp at the same
                // corner spot.
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _remove(index),
                  child: SizedBox(
                    width: 48,
                    height: 48,
                    child: Align(
                      alignment: Alignment.topRight,
                      child: Padding(
                        padding: const EdgeInsets.only(top: 2, right: 2),
                        child: Container(
                          width: 22,
                          height: 22,
                          decoration: const BoxDecoration(
                            color: Colors.black54,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close,
                            size: 14,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              _miniButton(
                Icons.chevron_left,
                'Move earlier',
                index == 0 ? null : () => _move(index, -1),
              ),
              _miniButton(
                index == 0 ? Icons.star : Icons.star_border,
                'Set as cover',
                index == 0 ? null : () => _makeCover(index),
              ),
              _miniButton(
                Icons.chevron_right,
                'Move later',
                index == widget.photos.length - 1
                    ? null
                    : () => _move(index, 1),
              ),
            ],
          ),
          if (photo.isFailed && photo.error != null)
            Text(
              photo.error!,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 10,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
        ],
      ),
    );
  }

  Widget _miniButton(IconData icon, String tooltip, VoidCallback? onPressed) {
    return IconButton(
      icon: Icon(icon, size: 18),
      tooltip: tooltip,
      onPressed: onPressed,
      style: IconButton.styleFrom(
        minimumSize: const Size(28, 28),
        maximumSize: const Size(28, 28),
        padding: EdgeInsets.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      visualDensity: VisualDensity.compact,
    );
  }
}
