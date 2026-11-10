/// A bounded, deduplicated window over a paged source.
///
/// The live data layer loads collections one page at a time (see the
/// canonical browse query in `live_sync.dart`); this class is the pure
/// bookkeeping half of that paging — no Firestore types — so the page
/// size, cursor-continuation and dedup rules are unit-testable
/// without a backend.
///
/// The *cursor* itself (a Firestore document snapshot) stays in the
/// live layer; this window only tracks the loaded items, keyed by
/// [idOf], plus whether the source likely has another page: a page
/// that came back full ([pageSize] rows) may have a successor, a
/// short page is always the last one.
class PagedWindow<T> {
  PagedWindow({required this.pageSize, required this.idOf});

  /// Rows requested per page (the canonical browse page is 24).
  final int pageSize;

  /// Identity of a row — pages are deduplicated on this.
  final String Function(T item) idOf;

  final List<T> _items = [];
  final Set<String> _ids = {};
  bool _hasMore = true;
  bool _started = false;

  /// The loaded window, in page order (newest first for listings).
  List<T> get items => List.unmodifiable(_items);

  int get length => _items.length;

  bool contains(String id) => _ids.contains(id);

  /// True until a short page proves the source is exhausted. Starts
  /// true so the first page can always be requested.
  bool get hasMore => _hasMore;

  /// True once at least one page has been applied.
  bool get started => _started;

  /// Merge one fetched page into the window.
  ///
  /// Rows whose id is already loaded are skipped (pages can overlap
  /// when new rows land between fetches), so the window never holds
  /// duplicate ids and existing rows keep their position. Returns the
  /// number of NEW rows added. [rawPageSize] is the row count the
  /// source returned before dedup — pass it when it can differ from
  /// `page.length` (it decides [hasMore]: a full raw page means there
  /// may be more, a short one means the end).
  int appendPage(Iterable<T> page, {int? rawPageSize}) {
    final rows = page.toList();
    var added = 0;
    for (final row in rows) {
      if (_ids.add(idOf(row))) {
        _items.add(row);
        added++;
      }
    }
    _started = true;
    _hasMore = (rawPageSize ?? rows.length) >= pageSize;
    return added;
  }

  /// Replace a loaded row with a fresher version of the same id
  /// (local mutation / snapshot echo), keeping its position. Returns
  /// false when the id is not in the window.
  bool replace(T item) {
    final id = idOf(item);
    final idx = _items.indexWhere((e) => idOf(e) == id);
    if (idx < 0) return false;
    _items[idx] = item;
    return true;
  }

  /// Drop a row by id (local delete). Returns true when it was loaded.
  bool remove(String id) {
    if (!_ids.remove(id)) return false;
    _items.removeWhere((e) => idOf(e) == id);
    return true;
  }

  /// Forget everything — a new browse context starts from page one.
  void reset() {
    _items.clear();
    _ids.clear();
    _hasMore = true;
    _started = false;
  }
}
