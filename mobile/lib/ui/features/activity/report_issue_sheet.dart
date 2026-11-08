import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/app_state.dart';

const kIssueReasons = [
  'Item damaged',
  'Not returned',
  'Wrong item',
  'Safety concern',
  'Other',
];

/// Report-a-problem sheet: fixed reason list + a free-text note.
class ReportIssueSheet extends StatefulWidget {
  final String requestId;
  const ReportIssueSheet({super.key, required this.requestId});

  static Future<void> show(BuildContext context, String requestId) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ReportIssueSheet(requestId: requestId),
    );
  }

  @override
  State<ReportIssueSheet> createState() => _ReportIssueSheetState();
}

class _ReportIssueSheetState extends State<ReportIssueSheet> {
  String? _reason;
  final _note = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = context.read<AppState>();
    final req = state.requests.firstWhere((r) => r.id == widget.requestId);
    final itemTitle =
        state.itemByIdOrNull(req.itemId)?.title ??
        state.listingByIdOrNull(req.itemId)?.title ??
        'Listing';
    return Padding(
      padding: EdgeInsets.fromLTRB(
        20,
        20,
        20,
        MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Report an issue',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(itemTitle, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 14),
          const Text(
            'What happened?',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: kIssueReasons
                .map(
                  (r) => ChoiceChip(
                    label: Text(r),
                    selected: _reason == r,
                    onSelected: (_) => setState(() {
                      _reason = r;
                      _error = null;
                    }),
                  ),
                )
                .toList(),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _note,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Note (optional)',
              hintText: 'Anything the other neighbor should know?',
            ),
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(
                _error!,
                style: const TextStyle(
                  color: AppColors.errorRed,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                if (_reason == null) {
                  setState(() => _error = 'Pick a reason first.');
                  return;
                }
                state.reportIssue(widget.requestId, _reason!, _note.text);
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Issue reported — it is flagged on the request for both of you.',
                    ),
                  ),
                );
              },
              child: const Text('Report issue'),
            ),
          ),
        ],
      ),
    );
  }
}
