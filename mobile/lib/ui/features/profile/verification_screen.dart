import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/app_state.dart';

/// Phone/email verification. The demo code is always 123456.
class VerificationScreen extends StatelessWidget {
  const VerificationScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final state = context.watch<AppState>();
    final me = state.currentUser;
    final trust = state.trustFor(me);
    return Scaffold(
      appBar: AppBar(title: const Text('Verification')),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          const Text(
            'Verified details earn trust points — 4 for your phone, 3 for your email, and 3 more for a government ID check. They also reassure neighbors before a first lend or sale.',
          ),
          const SizedBox(height: 8),
          Text(
            'Current verification points: ${trust.breakdown.verification}/10',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 16),
          _VerifyCard(
            icon: Icons.phone_outlined,
            title: 'Phone number',
            verified: me.phoneVerified,
            onVerify: () => _askCode(context, isPhone: true),
          ),
          const SizedBox(height: 12),
          _VerifyCard(
            icon: Icons.mail_outline,
            title: 'Email address',
            subtitle: me.email,
            verified: me.emailVerified,
            onVerify: () => _askCode(context, isPhone: false),
          ),
          const SizedBox(height: 16),
          const Card(
            color: AppColors.creamDark,
            child: Padding(
              padding: EdgeInsets.all(14),
              child: Text(
                'Demo mode: the verification code is always 123456. Nothing is actually texted or emailed.',
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _askCode(BuildContext context, {required bool isPhone}) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => _CodeDialog(isPhone: isPhone),
    );
    if (ok == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${isPhone ? 'Phone' : 'Email'} verified — trust points added.',
          ),
        ),
      );
    }
  }
}

class _VerifyCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final bool verified;
  final VoidCallback onVerify;
  const _VerifyCard({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.verified,
    required this.onVerify,
  });
  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: AppColors.terracotta),
        title: Text(title),
        subtitle: Text(
          verified ? 'Verified' : (subtitle ?? 'Not verified yet'),
        ),
        trailing: verified
            ? const Icon(Icons.check_circle, color: AppColors.moss)
            : ElevatedButton(onPressed: onVerify, child: const Text('Verify')),
      ),
    );
  }
}

class _CodeDialog extends StatefulWidget {
  final bool isPhone;
  const _CodeDialog({required this.isPhone});
  @override
  State<_CodeDialog> createState() => _CodeDialogState();
}

class _CodeDialogState extends State<_CodeDialog> {
  final _ctrl = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Verify your ${widget.isPhone ? 'phone' : 'email'}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Enter the 6-digit code we sent. (Demo code: 123456)'),
          const SizedBox(height: 12),
          TextField(
            controller: _ctrl,
            keyboardType: TextInputType.number,
            maxLength: 6,
            decoration: InputDecoration(
              labelText: 'Code',
              errorText: _error,
              counterText: '',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: const Text('Cancel'),
        ),
        ElevatedButton(
          onPressed: () {
            if (_ctrl.text.trim() != '123456') {
              setState(() => _error = 'That code is not right — try 123456.');
              return;
            }
            final state = context.read<AppState>();
            if (widget.isPhone) {
              state.verifyPhone();
            } else {
              state.verifyEmail();
            }
            Navigator.of(context).pop(true);
          },
          child: const Text('Verify'),
        ),
      ],
    );
  }
}
