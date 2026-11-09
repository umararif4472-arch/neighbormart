import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/config.dart';
import '../core/theme/app_theme.dart';
import '../core/widgets/brand_mark.dart';
import '../core/widgets/profile_header.dart';
import '../data/models/listing.dart';
import '../state/app_state.dart';
import 'features/list_item/list_item_screen.dart';
import 'features/profile/manage_items_screen.dart';
import 'features/profile/settings_screen.dart';
import 'features/trust/trust_explainer_screen.dart';

/// How tab screens reach the SHELL drawer (Part 7). Each tab has its
/// own Scaffold, so Scaffold.of() inside a tab finds the tab's inner
/// scaffold — not the shell's. AppShell therefore publishes an
/// open-drawer callback through this InheritedWidget, and the tab
/// AppBars render a [ShellMenuButton], which reads it. Outside the
/// shell (standalone screens, pushed routes) there is no scope and
/// the button falls back to a back button / nothing.
class ShellDrawerScope extends InheritedWidget {
  final VoidCallback openDrawer;
  const ShellDrawerScope({
    super.key,
    required this.openDrawer,
    required super.child,
  });

  static ShellDrawerScope? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ShellDrawerScope>();

  @override
  bool updateShouldNotify(ShellDrawerScope oldWidget) => false;
}

/// The hamburger button for tab AppBars: opens the shell drawer
/// when inside the shell; mirrors the automatic back button on
/// pushed routes; renders empty at a standalone root.
class ShellMenuButton extends StatelessWidget {
  const ShellMenuButton({super.key});
  @override
  Widget build(BuildContext context) {
    final scope = ShellDrawerScope.of(context);
    if (scope != null) {
      return IconButton(
        tooltip: 'Menu',
        icon: const Icon(Icons.menu),
        onPressed: scope.openDrawer,
      );
    }
    if (Navigator.of(context).canPop()) return const BackButton();
    return const SizedBox.shrink();
  }
}

/// The shell's full menu (Part 7): brand + identity header, grouped
/// destinations, sign-out footer. The bottom NavigationBar stays
/// the primary navigation — this is the complete menu beside it.
/// Selection state (current tab / Explore section) is passed in by
/// the shell; actions are reported back through the callbacks and
/// the drawer closes itself in every case.
class AppDrawer extends StatelessWidget {
  final int currentTab;
  final ListingSection? currentSection;
  final ValueChanged<int> onSelectTab;
  final ValueChanged<ListingSection?> onSelectSection;
  const AppDrawer({
    super.key,
    required this.currentTab,
    required this.currentSection,
    required this.onSelectTab,
    required this.onSelectSection,
  });

  void _close(BuildContext context) => Scaffold.of(context).closeDrawer();

  void _push(BuildContext context, Widget page) {
    final navigator = Navigator.of(context);
    _close(context);
    navigator.push(MaterialPageRoute(builder: (_) => page));
  }

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.currentUser;
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    // Same tint language as the bottom bar's selected pill: the
    // navigationBarTheme's indicatorColor IS the 12% terracotta
    // tint, and its primary is the selected icon/label color.
    final activeTint = theme.navigationBarTheme.indicatorColor;
    final width = math.min(MediaQuery.sizeOf(context).width * 0.85, 340.0);
    return Drawer(
      width: width,
      backgroundColor: scheme.surface,
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
          children: [
            // Header: door logo + the shared profile identity card
            // (avatar, name, neighborhood, trust badge, verified
            // chips — the Part 3 header, reused as-is).
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.lg,
                AppSpacing.sm,
              ),
              child: Row(
                children: [
                  const BrandMark(size: 36),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          kAppName,
                          style: theme.textTheme.titleMedium,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          kAppTagline,
                          style: theme.textTheme.bodySmall,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: ProfileHeaderCard(user: me, trust: state.trustFor(me)),
            ),
            const SizedBox(height: AppSpacing.md),
            const _GroupLabel('Main'),
            _DrawerRow(
              key: const ValueKey('drawer-tab-explore'),
              icon: Icons.explore_outlined,
              selectedIcon: Icons.explore,
              label: 'Explore',
              selected: currentTab == 0,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectTab(0);
              },
            ),
            _DrawerRow(
              key: const ValueKey('drawer-tab-wishlist'),
              icon: Icons.favorite_outline,
              selectedIcon: Icons.favorite,
              label: 'Wishlist',
              selected: currentTab == 1,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectTab(1);
              },
            ),
            _DrawerRow(
              key: const ValueKey('drawer-tab-activity'),
              icon: Icons.swap_horiz_outlined,
              selectedIcon: Icons.swap_horiz,
              label: 'Activity',
              selected: currentTab == 2,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectTab(2);
              },
            ),
            _DrawerRow(
              key: const ValueKey('drawer-tab-profile'),
              icon: Icons.person_outline,
              selectedIcon: Icons.person,
              label: 'Profile',
              selected: currentTab == 3,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectTab(3);
              },
            ),
            const _GroupLabel('Sections'),
            _DrawerRow(
              key: const ValueKey('drawer-section-items'),
              icon: Icons.build_outlined,
              label: 'Items & Tools',
              selected: currentTab == 0 && currentSection == null,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectSection(null);
              },
            ),
            _DrawerRow(
              key: const ValueKey('drawer-section-vehicles'),
              icon: Icons.directions_car_outlined,
              label: 'Vehicles',
              selected:
                  currentTab == 0 && currentSection == ListingSection.vehicles,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectSection(ListingSection.vehicles);
              },
            ),
            _DrawerRow(
              key: const ValueKey('drawer-section-properties'),
              icon: Icons.house_outlined,
              label: 'Properties',
              selected:
                  currentTab == 0 &&
                  currentSection == ListingSection.properties,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectSection(ListingSection.properties);
              },
            ),
            _DrawerRow(
              key: const ValueKey('drawer-section-arenas'),
              icon: Icons.sports_tennis_outlined,
              label: 'Sports Arenas & Venues',
              selected:
                  currentTab == 0 && currentSection == ListingSection.arenas,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                onSelectSection(ListingSection.arenas);
              },
            ),
            const _GroupLabel('Marketplace'),
            _DrawerRow(
              key: const ValueKey('drawer-list-item'),
              icon: Icons.add_circle_outline,
              label: 'List an item',
              selected: false,
              activeTint: activeTint,
              onTap: () => _push(context, const ListItemScreen()),
            ),
            _DrawerRow(
              key: const ValueKey('drawer-manage-items'),
              icon: Icons.inventory_2_outlined,
              label: 'Manage my items',
              selected: false,
              activeTint: activeTint,
              onTap: () => _push(context, const ManageItemsScreen()),
            ),
            const _GroupLabel('App'),
            _DrawerRow(
              key: const ValueKey('drawer-trust'),
              icon: Icons.school_outlined,
              label: 'How trust works',
              selected: false,
              activeTint: activeTint,
              onTap: () => _push(context, const TrustExplainerScreen()),
            ),
            _DrawerRow(
              key: const ValueKey('drawer-settings'),
              icon: Icons.settings_outlined,
              label: 'Settings',
              selected: false,
              activeTint: activeTint,
              onTap: () => _push(context, const SettingsScreen()),
            ),
            // No Help & About entry: the app has no such screen
            // (only an About info tile inside Settings) — omitted
            // rather than invented.
            const Divider(height: AppSpacing.xl),
            _DrawerRow(
              key: const ValueKey('drawer-sign-out'),
              icon: Icons.logout,
              label: 'Sign out',
              selected: false,
              activeTint: activeTint,
              onTap: () {
                _close(context);
                // AppRoot routes away on the state change; the
                // drawer is already closed and the shell unmounts
                // with it — nothing here touches context after.
                context.read<AppState>().signOut();
              },
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                0,
              ),
              child: Text(
                '$kAppName · version $kAppVersion',
                style: theme.textTheme.bodySmall,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupLabel extends StatelessWidget {
  final String label;
  const _GroupLabel(this.label);
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.xs,
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          letterSpacing: 0.8,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

class _DrawerRow extends StatelessWidget {
  final IconData icon;
  final IconData? selectedIcon;
  final String label;
  final bool selected;
  final Color? activeTint;
  final VoidCallback onTap;
  const _DrawerRow({
    super.key,
    required this.icon,
    this.selectedIcon,
    required this.label,
    required this.selected,
    required this.activeTint,
    required this.onTap,
  });
  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
      child: ListTile(
        // No subtitle: the tile is 56dp — over the 48dp minimum.
        selected: selected,
        selectedTileColor: activeTint,
        selectedColor: scheme.primary,
        iconColor: scheme.onSurfaceVariant,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: Icon(selected ? (selectedIcon ?? icon) : icon),
        title: Text(
          label,
          style: TextStyle(
            fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
          ),
        ),
        onTap: onTap,
      ),
    );
  }
}
