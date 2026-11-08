import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/cloudinary_config.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../data/models/listing.dart';
import '../../../data/services/photo_upload_service.dart';
import '../../../state/app_state.dart';
import '../explore/listing_section_view.dart';
import 'photo_upload_field.dart';

/// Phase 5: post a listing in the vehicles / properties / arenas
/// sections. One scrolling form (the items flow keeps its 3-step
/// wizard); publishes straight into AppState's unified catalog.
class ListListingScreen extends StatefulWidget {
  final ListingSection section;
  const ListListingScreen({super.key, required this.section});

  @override
  State<ListListingScreen> createState() => _ListListingScreenState();
}

class _ListListingScreenState extends State<ListListingScreen> {
  final _title = TextEditingController();
  final _desc = TextEditingController();
  final _price = TextEditingController();
  ListingType _type = ListingType.rent;
  PriceUnit _unit = PriceUnit.day;
  bool _negotiable = false;

  /// Phase 4: photos upload to Cloudinary as they are picked; only
  /// finished uploads (remote URLs) are published.
  final List<ListingPhoto> _photoEntries = [];

  List<String> get _uploadedPhotoUrls => uploadedUrlsOf(_photoEntries);

  // vehicles
  final _make = TextEditingController();
  final _model = TextEditingController();
  final _year = TextEditingController();
  final _mileage = TextEditingController();
  final _condition = TextEditingController();
  final _regCity = TextEditingController();
  VehicleFuelType _fuel = VehicleFuelType.petrol;
  VehicleTransmission _gear = VehicleTransmission.manual;
  bool _withDriver = false;

  // properties
  PropertyType _propertyType = PropertyType.apartment;
  final _areaSize = TextEditingController();
  PropertyAreaUnit _areaUnit = PropertyAreaUnit.marla;
  final _bedrooms = TextEditingController();
  final _bathrooms = TextEditingController();
  bool _furnished = false;
  final _amenities = TextEditingController();

  // arenas
  final _sports = TextEditingController();
  final _surface = TextEditingController();
  final _capacity = TextEditingController();
  final _opens = TextEditingController(text: '08:00');
  final _closes = TextEditingController(text: '23:00');
  int _slotMinutes = 60;
  bool _floodlights = false;
  bool _parking = false;
  bool _washrooms = false;
  bool _changingRooms = false;

  @override
  void initState() {
    super.initState();
    _unit = switch (widget.section) {
      ListingSection.properties => PriceUnit.month,
      ListingSection.arenas => PriceUnit.hour,
      _ => PriceUnit.day,
    };
  }

  @override
  void dispose() {
    for (final c in [
      _title,
      _desc,
      _price,
      _make,
      _model,
      _year,
      _mileage,
      _condition,
      _regCity,
      _areaSize,
      _bedrooms,
      _bathrooms,
      _amenities,
      _sports,
      _surface,
      _capacity,
      _opens,
      _closes,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  void _fail(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  void _onPhotosChanged(List<ListingPhoto> next) {
    setState(() {
      _photoEntries
        ..clear()
        ..addAll(next);
    });
  }

  Future<void> _publish() async {
    final state = context.read<AppState>();
    final me = state.currentUser;
    if (_title.text.trim().length < 4) {
      return _fail('Give your listing a clear title (at least 4 characters).');
    }
    if (_desc.text.trim().length < 10) {
      return _fail('Add a short description (at least 10 characters).');
    }
    final price = int.tryParse(_price.text.replaceAll(',', '').trim()) ?? 0;
    if (price <= 0) return _fail('Set a price above Rs 0.');
    // Photos: only finished Cloudinary uploads count — a photo still
    // uploading, failed, or never uploaded cannot satisfy the minimum.
    if (_photoEntries.any((p) => p.isUploading)) {
      return _fail('Wait for your photos to finish uploading.');
    }
    if (_photoEntries.any((p) => p.isFailed)) {
      return _fail(
        'Some photos failed to upload — retry or remove them first.',
      );
    }
    final uploadedUrls = _uploadedPhotoUrls;
    final photoError = photoPublishError(widget.section, uploadedUrls);
    if (photoError != null) return _fail(photoError);

    final now = DateTime.now();
    final id = 'l-new-${now.millisecondsSinceEpoch}';
    final location = ListingLocation(
      lat: me.homeLocation.lat,
      lng: me.homeLocation.lng,
      city: me.city,
      area: me.neighborhood,
    );
    final isSell = _type == ListingType.sell;
    Listing listing;
    switch (widget.section) {
      case ListingSection.vehicles:
        if (_make.text.trim().isEmpty || _model.text.trim().isEmpty) {
          return _fail('Add the make and model.');
        }
        final year = int.tryParse(_year.text.trim()) ?? 0;
        if (year < 1950 || year > now.year + 1) {
          return _fail('Enter a valid year.');
        }
        listing = VehicleListing(
          id: id,
          ownerId: me.id,
          listingType: _type,
          title: _title.text.trim(),
          description: _desc.text.trim(),
          price: price,
          priceUnit: isSell ? PriceUnit.fixed : _unit,
          negotiable: isSell && _negotiable,
          photos: uploadedUrls,
          location: location,
          createdAt: now,
          updatedAt: now,
          details: VehicleDetails(
            make: _make.text.trim(),
            model: _model.text.trim(),
            year: year,
            mileageKm: int.tryParse(_mileage.text.trim()) ?? 0,
            fuelType: _fuel,
            transmission: _gear,
            condition: _condition.text.trim(),
            withDriver: _withDriver,
            registrationCity: _regCity.text.trim(),
          ),
        );
      case ListingSection.properties:
        final size = num.tryParse(_areaSize.text.trim()) ?? 0;
        if (size <= 0) return _fail('Enter the area size.');
        listing = PropertyListing(
          id: id,
          ownerId: me.id,
          listingType: _type,
          title: _title.text.trim(),
          description: _desc.text.trim(),
          price: price,
          priceUnit: isSell ? PriceUnit.fixed : _unit,
          negotiable: isSell && _negotiable,
          photos: uploadedUrls,
          location: location,
          createdAt: now,
          updatedAt: now,
          details: PropertyDetails(
            propertyType: _propertyType,
            bedrooms: int.tryParse(_bedrooms.text.trim()),
            bathrooms: int.tryParse(_bathrooms.text.trim()),
            areaSize: size,
            areaUnit: _areaUnit,
            furnished: _furnished,
            floor: null,
            amenities: _amenities.text
                .split(',')
                .map((s) => s.trim())
                .where((s) => s.isNotEmpty)
                .toList(),
            availableFrom: now,
          ),
        );
      case ListingSection.arenas:
        final capacity = int.tryParse(_capacity.text.trim()) ?? 0;
        if (_sports.text.trim().isEmpty || capacity < 1) {
          return _fail('Add the sports offered and the capacity.');
        }
        if (!RegExp(r'^\d{2}:\d{2}$').hasMatch(_opens.text.trim()) ||
            !RegExp(r'^\d{2}:\d{2}$').hasMatch(_closes.text.trim()) ||
            _opens.text.trim().compareTo(_closes.text.trim()) >= 0) {
          return _fail('Opening hours must be HH:mm, opening before closing.');
        }
        listing = ArenaListing(
          id: id,
          ownerId: me.id,
          title: _title.text.trim(),
          description: _desc.text.trim(),
          price: price,
          priceUnit: PriceUnit.hour,
          photos: uploadedUrls,
          location: location,
          createdAt: now,
          updatedAt: now,
          details: ArenaDetails(
            sportTypes: _sports.text
                .split(',')
                .map((s) => s.trim())
                .where((s) => s.isNotEmpty)
                .toList(),
            surface: _surface.text.trim(),
            capacity: capacity,
            opensAt: _opens.text.trim(),
            closesAt: _closes.text.trim(),
            slotMinutes: _slotMinutes,
            facilities: ArenaFacilities(
              floodlights: _floodlights,
              parking: _parking,
              washrooms: _washrooms,
              changingRooms: _changingRooms,
            ),
            advanceBooking: const ArenaAdvanceBooking(
              maxAdvanceDays: 14,
              minAdvanceHours: 2,
            ),
          ),
        );
      case ListingSection.items:
        return _fail('Items use the item wizard.');
    }

    state.addListing(listing);
    await showSuccessDialog(
      context,
      title: 'Listing published',
      message:
          'Your ${kSectionLabel[widget.section]} listing is live in Explore.',
    );
    if (mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final isArena = widget.section == ListingSection.arenas;
    return Scaffold(
      appBar: AppBar(title: Text('List in ${kSectionLabel[widget.section]}')),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: ElevatedButton(
            onPressed: _publish,
            child: const Text('Publish listing'),
          ),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          if (!isArena)
            Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Rent'),
                  selected: _type == ListingType.rent,
                  onSelected: (_) => setState(() => _type = ListingType.rent),
                ),
                ChoiceChip(
                  label: const Text('Sell'),
                  selected: _type == ListingType.sell,
                  onSelected: (_) => setState(() => _type = ListingType.sell),
                ),
              ],
            ),
          if (!isArena) const SizedBox(height: 14),
          _field(_title, 'Title *', 'e.g. Toyota Corolla GLi 2021'),
          const SizedBox(height: 14),
          _field(
            _desc,
            'Description *',
            'What is it, what’s included?',
            lines: 3,
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _field(_price, 'Price (Rs) *', '5000', number: true),
              ),
              if (_type == ListingType.rent && !isArena) ...[
                const SizedBox(width: 12),
                SizedBox(
                  width: 130,
                  child: DropdownButtonFormField<PriceUnit>(
                    initialValue: _unit,
                    decoration: const InputDecoration(labelText: 'Charged'),
                    items: const [
                      DropdownMenuItem(
                        value: PriceUnit.hour,
                        child: Text('per hour'),
                      ),
                      DropdownMenuItem(
                        value: PriceUnit.day,
                        child: Text('per day'),
                      ),
                      DropdownMenuItem(
                        value: PriceUnit.week,
                        child: Text('per week'),
                      ),
                      DropdownMenuItem(
                        value: PriceUnit.month,
                        child: Text('per month'),
                      ),
                    ],
                    onChanged: (v) => setState(() => _unit = v ?? _unit),
                  ),
                ),
              ],
            ],
          ),
          if (isArena)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text('Arenas are charged per hour.'),
            ),
          if (_type == ListingType.sell)
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Open to offers (negotiable)'),
              value: _negotiable,
              onChanged: (v) => setState(() => _negotiable = v),
            ),
          const SizedBox(height: 8),
          ..._sectionFields(),
          const SizedBox(height: 20),
          PhotoUploadField(
            section: widget.section,
            photos: _photoEntries,
            onChanged: _onPhotosChanged,
          ),
        ],
      ),
    );
  }

  Widget _field(
    TextEditingController ctrl,
    String label,
    String hint, {
    int lines = 1,
    bool number = false,
  }) {
    return TextFormField(
      controller: ctrl,
      maxLines: lines,
      keyboardType: number ? TextInputType.number : null,
      decoration: InputDecoration(labelText: label, hintText: hint),
    );
  }

  List<Widget> _sectionFields() {
    switch (widget.section) {
      case ListingSection.vehicles:
        return [
          Row(
            children: [
              Expanded(child: _field(_make, 'Make *', 'Toyota')),
              const SizedBox(width: 12),
              Expanded(child: _field(_model, 'Model *', 'Corolla GLi')),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _field(_year, 'Year *', '2021', number: true)),
              const SizedBox(width: 12),
              Expanded(
                child: _field(_mileage, 'Mileage (km)', '45000', number: true),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<VehicleFuelType>(
                  initialValue: _fuel,
                  decoration: const InputDecoration(labelText: 'Fuel'),
                  items: VehicleFuelType.values
                      .map(
                        (f) => DropdownMenuItem(
                          value: f,
                          child: Text(f.name.toUpperCase()),
                        ),
                      )
                      .toList(),
                  onChanged: (v) => setState(() => _fuel = v ?? _fuel),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<VehicleTransmission>(
                  initialValue: _gear,
                  decoration: const InputDecoration(labelText: 'Transmission'),
                  items: VehicleTransmission.values
                      .map(
                        (t) => DropdownMenuItem(value: t, child: Text(t.name)),
                      )
                      .toList(),
                  onChanged: (v) => setState(() => _gear = v ?? _gear),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _field(_condition, 'Condition', 'e.g. Total genuine, new tyres'),
          const SizedBox(height: 14),
          _field(_regCity, 'Registration city', 'Lahore'),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Comes with a driver'),
            value: _withDriver,
            onChanged: (v) => setState(() => _withDriver = v),
          ),
        ];
      case ListingSection.properties:
        return [
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<PropertyType>(
                  initialValue: _propertyType,
                  decoration: const InputDecoration(labelText: 'Type *'),
                  items: PropertyType.values
                      .map(
                        (t) => DropdownMenuItem(value: t, child: Text(t.name)),
                      )
                      .toList(),
                  onChanged: (v) =>
                      setState(() => _propertyType = v ?? _propertyType),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: _field(_areaSize, 'Area size *', '10', number: true),
              ),
              const SizedBox(width: 12),
              SizedBox(
                width: 100,
                child: DropdownButtonFormField<PropertyAreaUnit>(
                  initialValue: _areaUnit,
                  decoration: const InputDecoration(labelText: 'Unit'),
                  items: PropertyAreaUnit.values
                      .map(
                        (u) => DropdownMenuItem(value: u, child: Text(u.name)),
                      )
                      .toList(),
                  onChanged: (v) => setState(() => _areaUnit = v ?? _areaUnit),
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _field(_bedrooms, 'Bedrooms', '3', number: true)),
              const SizedBox(width: 12),
              Expanded(
                child: _field(_bathrooms, 'Bathrooms', '2', number: true),
              ),
            ],
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Furnished'),
            value: _furnished,
            onChanged: (v) => setState(() => _furnished = v),
          ),
          _field(_amenities, 'Amenities', 'Parking, UPS, Separate gate'),
        ];
      case ListingSection.arenas:
        return [
          _field(_sports, 'Sports (comma-separated) *', 'Futsal, Cricket'),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _field(_surface, 'Surface', 'Astro turf')),
              const SizedBox(width: 12),
              Expanded(
                child: _field(_capacity, 'Capacity *', '40', number: true),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(child: _field(_opens, 'Opens at (HH:mm)', '08:00')),
              const SizedBox(width: 12),
              Expanded(child: _field(_closes, 'Closes at (HH:mm)', '23:00')),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<int>(
                  initialValue: _slotMinutes,
                  decoration: const InputDecoration(labelText: 'Slot length'),
                  items: const [
                    DropdownMenuItem(value: 30, child: Text('30 min')),
                    DropdownMenuItem(value: 60, child: Text('60 min')),
                    DropdownMenuItem(value: 90, child: Text('90 min')),
                    DropdownMenuItem(value: 120, child: Text('120 min')),
                  ],
                  onChanged: (v) =>
                      setState(() => _slotMinutes = v ?? _slotMinutes),
                ),
              ),
            ],
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Floodlights'),
            value: _floodlights,
            onChanged: (v) => setState(() => _floodlights = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Parking'),
            value: _parking,
            onChanged: (v) => setState(() => _parking = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Washrooms'),
            value: _washrooms,
            onChanged: (v) => setState(() => _washrooms = v),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Changing rooms'),
            value: _changingRooms,
            onChanged: (v) => setState(() => _changingRooms = v),
          ),
        ];
      case ListingSection.items:
        return const [];
    }
  }
}
