import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/item.dart';
import '../../../data/models/listing.dart';
import '../../../data/services/photo_upload_service.dart';
import '../../../state/app_state.dart';
import '../explore/listing_section_view.dart';
import 'list_listing_screen.dart';
import 'photo_upload_field.dart';

/// Persists an in-progress listing form to SharedPreferences, like the
/// web app's useListItemDraft. Degrades to no-op when prefs are missing
/// (tests, exotic platforms).
class ListItemDraft {
  static const _key = 'listItemDraftV1';

  static Future<Map<String, dynamic>?> load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null) return null;
      final decoded = jsonDecode(raw);
      return decoded is Map<String, dynamic> ? decoded : null;
    } catch (_) {
      return null;
    }
  }

  static Future<void> save(Map<String, dynamic> values) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_key, jsonEncode(values));
    } catch (_) {
      // Drafts are a convenience — never block listing on them.
    }
  }

  static Future<void> clear() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_key);
    } catch (_) {}
  }
}

/// Three-step listing wizard (Details -> Terms -> Review & publish) with
/// per-step validation and draft auto-save. Also used, prefilled, to edit
/// an existing item from Manage My Items.
class ListItemScreen extends StatefulWidget {
  final Item? existingItem;
  const ListItemScreen({super.key, this.existingItem});
  @override
  State<ListItemScreen> createState() => _ListItemScreenState();
}

class _ListItemScreenState extends State<ListItemScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _condition = TextEditingController();
  final _maxDays = TextEditingController(text: '7');
  final _deposit = TextEditingController();
  final _fee = TextEditingController();
  final _pickupNotes = TextEditingController();
  String _category = 'Tools';
  String _pickupPref = 'either';
  int _step = 0;
  bool _draftLoaded = false;

  /// Photos for this listing (Phase 4): each entry tracks its upload to
  /// Cloudinary. Only finished uploads (remote URLs) are published or
  /// saved into the draft — local pick paths never persist.
  final List<ListingPhoto> _photoEntries = [];

  List<String> get _uploadedPhotoUrls => uploadedUrlsOf(_photoEntries);

  bool get _isEdit => widget.existingItem != null;

  static const _stepNames = ['Details', 'Terms', 'Review & publish'];

  @override
  void initState() {
    super.initState();
    final item = widget.existingItem;
    if (item != null) {
      _title.text = item.title;
      _desc.text = item.description;
      _condition.text = item.condition;
      _category = item.category;
      _photoEntries.addAll(item.photos.map(ListingPhoto.done));
      _maxDays.text = '${item.borrowTerms.maxDurationDays}';
      _deposit.text = item.borrowTerms.depositAmount?.toString() ?? '';
      _fee.text = item.borrowTerms.dailyFee?.toString() ?? '';
      _pickupPref = item.borrowTerms.pickupPreference;
      _pickupNotes.text = item.borrowTerms.pickupInstructions;
      _draftLoaded = true;
    } else {
      _restoreDraft();
    }
    for (final c in [
      _title,
      _desc,
      _condition,
      _maxDays,
      _deposit,
      _fee,
      _pickupNotes,
    ]) {
      c.addListener(_saveDraft);
    }
  }

  Future<void> _restoreDraft() async {
    final draft = await ListItemDraft.load();
    if (!mounted) return;
    if (draft == null || draft.values.every((v) => '$v'.trim().isEmpty)) {
      setState(() => _draftLoaded = true);
      return;
    }
    _applyDraft(draft);
    setState(() => _draftLoaded = true);
    final resume = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Resume your draft?'),
        content: const Text(
          'You left a listing half-finished. Pick it up where you left off, or start over.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Start over'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Resume draft'),
          ),
        ],
      ),
    );
    if (resume == false) {
      _clearFields();
      await ListItemDraft.clear();
    }
  }

  void _applyDraft(Map<String, dynamic> d) {
    _title.text = '${d['title'] ?? ''}';
    _desc.text = '${d['description'] ?? ''}';
    _condition.text = '${d['condition'] ?? ''}';
    _category =
        d['category'] is String && kItemCategories.contains(d['category'])
        ? d['category'] as String
        : 'Tools';
    _maxDays.text = '${d['maxDays'] ?? '7'}';
    _deposit.text = '${d['deposit'] ?? ''}';
    _fee.text = '${d['fee'] ?? ''}';
    _pickupPref = '${d['pickupPref'] ?? 'either'}';
    _pickupNotes.text = '${d['pickupNotes'] ?? ''}';
    _photoEntries
      ..clear()
      ..addAll(
        (d['photos'] as List? ?? const [])
            .map((e) => '$e')
            .where((s) => s.isNotEmpty)
            .map(ListingPhoto.done),
      );
    final s = d['step'];
    if (s is int && s >= 0 && s <= 2) _step = s;
  }

  void _clearFields() {
    setState(() {
      _title.clear();
      _desc.clear();
      _condition.clear();
      _maxDays.text = '7';
      _deposit.clear();
      _fee.clear();
      _pickupNotes.clear();
      _photoEntries.clear();
      _category = 'Tools';
      _pickupPref = 'either';
      _step = 0;
    });
  }

  Timer? _draftTimer;
  void _saveDraft() {
    if (_isEdit || !_draftLoaded) return;
    _draftTimer?.cancel();
    _draftTimer = Timer(const Duration(milliseconds: 400), () {
      ListItemDraft.save({
        'title': _title.text,
        'description': _desc.text,
        'condition': _condition.text,
        'category': _category,
        'photos': _uploadedPhotoUrls,
        'maxDays': _maxDays.text,
        'deposit': _deposit.text,
        'fee': _fee.text,
        'pickupPref': _pickupPref,
        'pickupNotes': _pickupNotes.text,
        'step': _step,
      });
    });
  }

  @override
  void dispose() {
    _draftTimer?.cancel();
    _title.dispose();
    _desc.dispose();
    _condition.dispose();
    _maxDays.dispose();
    _deposit.dispose();
    _fee.dispose();
    _pickupNotes.dispose();
    super.dispose();
  }

  int? _parseOptional(String v) =>
      v.trim().isEmpty ? null : int.tryParse(v.trim());

  void _onPhotosChanged(List<ListingPhoto> next) {
    setState(() {
      _photoEntries
        ..clear()
        ..addAll(next);
    });
    _saveDraft();
  }

  void _next() {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _step = (_step + 1).clamp(0, 2));
    _saveDraft();
  }

  Future<void> _publish() async {
    // Only finished Cloudinary uploads may be published — block while
    // any photo is still on its way up or sitting in a failed state.
    if (_photoEntries.any((p) => p.isUploading)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Wait for your photos to finish uploading.'),
        ),
      );
      return;
    }
    if (_photoEntries.any((p) => p.isFailed)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Some photos failed to upload — retry or remove them first.',
          ),
        ),
      );
      return;
    }
    final state = context.read<AppState>();
    if (_isEdit) {
      state.updateItem(
        widget.existingItem!.id,
        title: _title.text,
        category: _category,
        description: _desc.text,
        condition: _condition.text,
        maxDurationDays: int.parse(_maxDays.text.trim()),
        depositAmount: _parseOptional(_deposit.text),
        dailyFee: _parseOptional(_fee.text),
        pickupPreference: _pickupPref,
        pickupInstructions: _pickupNotes.text,
        photos: _uploadedPhotoUrls,
      );
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Listing updated.')));
    } else {
      state.createItem(
        title: _title.text,
        category: _category,
        description: _desc.text,
        condition: _condition.text,
        maxDurationDays: int.parse(_maxDays.text.trim()),
        depositAmount: _parseOptional(_deposit.text),
        dailyFee: _parseOptional(_fee.text),
        pickupPreference: _pickupPref,
        pickupInstructions: _pickupNotes.text,
        photos: _uploadedPhotoUrls,
      );
      ListItemDraft.clear();
      await showSuccessDialog(
        context,
        title: 'Listing published',
        message: 'Your item is now visible in Explore for neighbors to borrow.',
      );
      if (!mounted) return;
    }
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Edit item' : 'List an item')),
      // Action row lives in the bottom bar (SafeArea + keyboard inset),
      // so it can never cover the form content above it.
      bottomNavigationBar: !_draftLoaded
          ? null
          : SafeArea(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  16,
                  10,
                  16,
                  12 + MediaQuery.viewInsetsOf(context).bottom,
                ),
                child: Row(
                  children: [
                    if (_step > 0)
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => setState(() => _step--),
                          child: const Text('Back'),
                        ),
                      ),
                    if (_step > 0) const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: _step < 2 ? _next : _publish,
                        child: Text(
                          _step < 2
                              ? 'Continue'
                              : (_isEdit ? 'Save changes' : 'Publish listing'),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
      body: !_draftLoaded
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: List.generate(3, (i) {
                            final active = i == _step;
                            final done = i < _step;
                            return Expanded(
                              child: Padding(
                                padding: EdgeInsets.only(right: i < 2 ? 6 : 0),
                                child: Container(
                                  padding: const EdgeInsets.symmetric(
                                    vertical: 7,
                                  ),
                                  decoration: BoxDecoration(
                                    color: active || done
                                        ? Theme.of(context).colorScheme.primary
                                              .withValues(alpha: 0.14)
                                        : Colors.black.withValues(alpha: 0.05),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Text(
                                    '${i + 1}. ${_stepNames[i]}',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(
                                      fontSize: 12,
                                      fontWeight: active
                                          ? FontWeight.w800
                                          : FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ),
                            );
                          }),
                        ),
                        const SizedBox(height: 10),
                        LinearProgressIndicator(value: (_step + 1) / 3),
                      ],
                    ),
                  ),
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                      children: [
                        if (_step == 0) ..._detailsStep(),
                        if (_step == 1) ..._termsStep(),
                        if (_step == 2) ..._reviewStep(),
                      ],
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  List<Widget> _detailsStep() {
    return [
      if (!_isEdit) ...[
        const Text(
          'What are you listing?',
          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: [
            const ChoiceChip(
              label: Text('🧰 Items & Tools'),
              selected: true,
              onSelected: null,
            ),
            ...[
              ListingSection.vehicles,
              ListingSection.properties,
              ListingSection.arenas,
            ].map(
              (s) => ChoiceChip(
                label: Text('${kSectionEmoji[s]} ${kSectionLabel[s]}'),
                selected: false,
                onSelected: (_) => Navigator.of(context).pushReplacement(
                  MaterialPageRoute(
                    builder: (_) => ListListingScreen(section: s),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 16),
      ],
      const Text(
        'Share something neighbors can borrow. Be specific — brand, size, and what it is good for.',
        style: TextStyle(color: Colors.black54),
      ),
      const SizedBox(height: 16),
      TextFormField(
        controller: _title,
        decoration: const InputDecoration(
          labelText: 'Title *',
          hintText: 'e.g. 20V Cordless Drill + Bit Kit',
        ),
        validator: (v) => (v == null || v.trim().length < 4)
            ? 'Give your item a clear title (at least 4 characters).'
            : null,
      ),
      const SizedBox(height: 14),
      DropdownButtonFormField<String>(
        initialValue: _category,
        decoration: const InputDecoration(labelText: 'Category *'),
        items: kItemCategories
            .map((c) => DropdownMenuItem(value: c, child: Text(c)))
            .toList(),
        onChanged: (v) {
          setState(() => _category = v ?? 'Tools');
          _saveDraft();
        },
      ),
      const SizedBox(height: 14),
      TextFormField(
        controller: _desc,
        maxLines: 3,
        decoration: const InputDecoration(
          labelText: 'Description *',
          hintText: 'What is it, what is included, any quirks?',
        ),
        validator: (v) => (v == null || v.trim().length < 10)
            ? 'Add a short description (at least 10 characters).'
            : null,
      ),
      const SizedBox(height: 14),
      TextFormField(
        controller: _condition,
        decoration: const InputDecoration(
          labelText: 'Condition *',
          hintText: 'e.g. Good — works perfectly, small scuff',
        ),
        validator: (v) => (v == null || v.trim().isEmpty)
            ? 'Describe the condition honestly.'
            : null,
      ),
      const SizedBox(height: 20),
      PhotoUploadField(
        section: ListingSection.items,
        photos: _photoEntries,
        onChanged: _onPhotosChanged,
        fallbackCategory: _category,
      ),
    ];
  }

  String? _moneyValidator(String? v) {
    if (v == null || v.trim().isEmpty) return null;
    final n = int.tryParse(v.trim());
    return (n == null || n < 0) ? 'Enter a whole dollar amount.' : null;
  }

  List<Widget> _termsStep() {
    return [
      TextFormField(
        controller: _maxDays,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'Max borrow days *'),
        validator: (v) {
          final n = int.tryParse(v ?? '');
          return (n == null || n < 1 || n > 30) ? 'Enter 1–30 days.' : null;
        },
      ),
      const SizedBox(height: 14),
      Row(
        children: [
          Expanded(
            child: TextFormField(
              controller: _deposit,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Deposit (\$)'),
              validator: _moneyValidator,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: TextFormField(
              controller: _fee,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Fee/day (\$)'),
              validator: _moneyValidator,
            ),
          ),
        ],
      ),
      const SizedBox(height: 14),
      DropdownButtonFormField<String>(
        initialValue: _pickupPref,
        decoration: const InputDecoration(labelText: 'Pickup preference'),
        items: const [
          DropdownMenuItem(value: 'either', child: Text('Pickup or drop-off')),
          DropdownMenuItem(value: 'pickup', child: Text('Pickup only')),
          DropdownMenuItem(value: 'drop-off', child: Text('Drop-off only')),
        ],
        onChanged: (v) {
          setState(() => _pickupPref = v ?? 'either');
          _saveDraft();
        },
      ),
      const SizedBox(height: 14),
      TextFormField(
        controller: _pickupNotes,
        maxLines: 2,
        decoration: const InputDecoration(
          labelText: 'Pickup instructions',
          hintText: 'e.g. Pickup from my gate in DHA after 6pm',
        ),
      ),
    ];
  }

  List<Widget> _reviewStep() {
    Widget row(String label, String value) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(
              label,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ),
          Expanded(child: Text(value.isEmpty ? '—' : value)),
        ],
      ),
    );
    return [
      const Text(
        'One last look before it goes live in Explore.',
        style: TextStyle(color: Colors.black54),
      ),
      const SizedBox(height: 16),
      Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            children: [
              row('Title', _title.text.trim()),
              row('Category', _category),
              row(
                'Photos',
                _photoEntries.isEmpty
                    ? 'None — the category picture will be shown'
                    : '${_uploadedPhotoUrls.length} uploaded'
                          '${_photoEntries.any((p) => p.isUploading) ? ' · still uploading' : ''}'
                          '${_photoEntries.any((p) => p.isFailed) ? ' · some failed' : ''}',
              ),
              row('Description', _desc.text.trim()),
              row('Condition', _condition.text.trim()),
              row('Max days', _maxDays.text.trim()),
              row(
                'Deposit',
                _deposit.text.trim().isEmpty
                    ? 'None'
                    : '\$${_deposit.text.trim()}',
              ),
              row(
                'Fee',
                _fee.text.trim().isEmpty ? 'Free' : '\$${_fee.text.trim()}/day',
              ),
              row('Pickup', _pickupNotes.text.trim()),
            ],
          ),
        ),
      ),
    ];
  }
}
