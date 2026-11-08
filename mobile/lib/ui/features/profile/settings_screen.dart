import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

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
        ],
      ),
    );
  }
}
