import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/theme_preference.dart';
import '../../../core/widgets/shared_widgets.dart';
import '../../../state/app_state.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          const ListTile(
            leading: Icon(Icons.brightness_6_outlined),
            title: Text('Appearance'),
            subtitle: Text('Theme for the whole app — saved on this device'),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: SegmentedButton<ThemePreference>(
              segments: const [
                ButtonSegment(
                  value: ThemePreference.system,
                  icon: Icon(Icons.brightness_auto_outlined),
                  label: Text('System'),
                ),
                ButtonSegment(
                  value: ThemePreference.light,
                  icon: Icon(Icons.light_mode_outlined),
                  label: Text('Light'),
                ),
                ButtonSegment(
                  value: ThemePreference.dark,
                  icon: Icon(Icons.dark_mode_outlined),
                  label: Text('Dark'),
                ),
              ],
              selected: {state.themePreference},
              onSelectionChanged: (selection) =>
                  context.read<AppState>().setThemePreference(selection.first),
            ),
          ),
          const Divider(height: 32),
          SwitchListTile(
            title: const Text('Notifications'),
            subtitle: const Text(
              'Request updates, due reminders, and review prompts',
            ),
            value: state.notificationsEnabled,
            onChanged: (v) =>
                context.read<AppState>().setNotificationsEnabled(v),
          ),
          const Divider(height: 32),
          const ListTile(
            leading: Icon(Icons.block_outlined),
            title: Text('Blocked users'),
            subtitle: Text('Their listings stay hidden from your Explore'),
          ),
          if (state.blockedUsers.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Text('You haven’t blocked anyone.'),
            )
          else
            ...state.blockedUsers.map(
              (user) => ListTile(
                leading: UserAvatar(user: user, radius: 18),
                title: Text(user.name),
                subtitle: Text(user.neighborhood),
                trailing: TextButton(
                  onPressed: () =>
                      context.read<AppState>().unblockUser(user.id),
                  child: const Text('Unblock'),
                ),
              ),
            ),
          const Divider(height: 32),
          const ListTile(
            leading: Icon(Icons.info_outline),
            title: Text('About'),
            subtitle: Text(
              "NeighborMart · version 1.0.0 · prototype with demo data",
            ),
          ),
          const Divider(height: 32),
          OutlinedButton.icon(
            onPressed: () async {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Reset demo data?'),
                  content: const Text(
                    'Everything goes back to the original seed: users, items, requests, reviews, and messages.',
                  ),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(context).pop(false),
                      child: const Text('Cancel'),
                    ),
                    ElevatedButton(
                      onPressed: () => Navigator.of(context).pop(true),
                      child: const Text('Reset'),
                    ),
                  ],
                ),
              );
              if (confirm == true && context.mounted) {
                context.read<AppState>().resetDemoData();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Demo data reset.')),
                );
              }
            },
            icon: const Icon(Icons.restart_alt),
            label: const Text('Reset demo data'),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            onPressed: () {
              context.read<AppState>().signOut();
              Navigator.of(context).popUntil((r) => r.isFirst);
            },
            icon: const Icon(Icons.logout),
            label: const Text('Sign out'),
          ),
          const SizedBox(height: 24),
          const Divider(height: 1),
          ListTile(
            leading: Icon(
              Icons.delete_forever_outlined,
              color: Theme.of(context).colorScheme.error,
            ),
            title: Text(
              'Delete my account',
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
            subtitle: const Text(
              'Permanently removes your profile and all your listings',
            ),
            onTap: () => _deleteAccount(context),
          ),
        ],
      ),
    );
  }

  /// Delete flow: type-to-confirm dialog first; only a `deleted`
  /// result leaves this screen (back to the signed-out root). A
  /// partial result still leaves, with its explanation as a snackbar;
  /// a failed one stays put and explains why nothing was deleted.
  Future<void> _deleteAccount(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => const _DeleteAccountDialog(),
    );
    if (confirmed != true || !context.mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final navigator = Navigator.of(context);
    final result = await context.read<AppState>().deleteMyAccount();
    if (!result.deleted) {
      messenger.showSnackBar(
        SnackBar(content: Text(result.message ?? 'Account deletion failed.')),
      );
      return;
    }
    navigator.popUntil((r) => r.isFirst);
    messenger.showSnackBar(
      SnackBar(
        content: Text(result.message ?? 'Your account has been deleted.'),
      ),
    );
  }
}

/// Type-to-confirm guard for account deletion: the Delete button
/// stays disabled until the user types DELETE, and the copy spells
/// out exactly what is removed.
class _DeleteAccountDialog extends StatefulWidget {
  const _DeleteAccountDialog();

  @override
  State<_DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends State<_DeleteAccountDialog> {
  final _confirmText = TextEditingController();

  @override
  void dispose() {
    _confirmText.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Delete my account?'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'This permanently removes your profile and every listing '
            'you posted. It cannot be undone.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _confirmText,
            decoration: const InputDecoration(
              labelText: 'Type DELETE to confirm',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => setState(() {}),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor: Theme.of(context).colorScheme.error,
          ),
          onPressed: _confirmText.text.trim() == 'DELETE'
              ? () => Navigator.of(context).pop(true)
              : null,
          child: const Text('Delete'),
        ),
      ],
    );
  }
}
