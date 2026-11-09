import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../data/models/listing.dart';
import '../state/app_state.dart';
import 'app_drawer.dart';
import 'features/explore/explore_screen.dart';
import 'features/wishlist/wishlist_screen.dart';
import 'features/activity/activity_screen.dart';
import 'features/profile/profile_screen.dart';
import 'features/list_item/list_item_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key});
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;
  final _shellKey = GlobalKey<ScaffoldState>();

  /// Explore's section, shared with the drawer (Part 7): the
  /// drawer's SECTIONS entries write here, ExploreScreen's chips
  /// read/write the same notifier, so both stay in sync.
  final _exploreSection = ValueNotifier<ListingSection?>(null);

  late final _screens = <Widget>[
    ExploreScreen(sectionController: _exploreSection),
    const WishlistScreen(),
    const ActivityScreen(),
    const ProfileScreen(),
  ];

  @override
  void dispose() {
    _exploreSection.dispose();
    super.dispose();
  }

  void _selectTab(int i) {
    HapticFeedback.selectionClick();
    setState(() => _index = i);
  }

  void _selectSection(ListingSection? section) {
    _exploreSection.value = section;
    _selectTab(0);
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    // Activity badge = requests awaiting my action + unread
    // notifications. DerivedNotification has no per-item read flag
    // (NotificationDoc.read exists on the remote docs, but AppState
    // merges those in without it), and the Notifications screen
    // itself treats kind == 'action' items as the ones needing
    // attention — so the unread proxy is the action notifications
    // OTHER than 'request-received', whose count is exactly
    // pendingIncomingCount (adding notificationBadgeCount on top
    // would double-count those). The total therefore equals
    // pending + other-action, arithmetically notificationBadgeCount.
    final pending = state.pendingIncomingCount;
    final otherAction = state.derivedNotifications
        .where((n) => n.kind == 'action' && n.type != 'request-received')
        .length;
    final badgeCount = pending + otherAction;
    final theme = Theme.of(context);
    return ShellDrawerScope(
      openDrawer: () => _shellKey.currentState?.openDrawer(),
      child: Scaffold(
        key: _shellKey,
        drawer: ValueListenableBuilder<ListingSection?>(
          valueListenable: _exploreSection,
          builder: (context, section, _) => AppDrawer(
            currentTab: _index,
            currentSection: section,
            onSelectTab: _selectTab,
            onSelectSection: _selectSection,
          ),
        ),
        body: IndexedStack(index: _index, children: _screens),
        // The "+ List item" FAB belongs to browsing only — on the
        // other tabs it covered content (e.g. Profile's Settings row)
        // and invited an action that doesn't belong there.
        floatingActionButton: _index == 0
            ? FloatingActionButton.extended(
                onPressed: () async {
                  await Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const ListItemScreen()),
                  );
                },
                icon: const Icon(Icons.add),
                label: const Text('List item'),
              )
            : null,
        floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            border: Border(top: BorderSide(color: theme.colorScheme.outline)),
          ),
          child: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: _selectTab,
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.explore_outlined),
                selectedIcon: Icon(Icons.explore),
                label: 'Explore',
              ),
              const NavigationDestination(
                icon: Icon(Icons.favorite_outline),
                selectedIcon: Icon(Icons.favorite),
                label: 'Wishlist',
              ),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: badgeCount > 0,
                  label: Text('$badgeCount'),
                  child: const Icon(Icons.swap_horiz_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: badgeCount > 0,
                  label: Text('$badgeCount'),
                  child: const Icon(Icons.swap_horiz),
                ),
                label: 'Activity',
              ),
              const NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'Profile',
              ),
            ],
          ),
        ),
      ),
    );
  }
}
