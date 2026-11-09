import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../data/models/report.dart';
import '../../../state/app_state.dart';

/// Report-a-listing / report-a-user sheet (Phase 8): one of the six
/// fixed reasons (the exact vocabulary the web writes to the shared
/// `reports` collection) plus an optional detail note. Submitting
/// files the report through AppState and confirms with a snackbar.
class ReportSheet extends StatefulWidget {
  final ReportTargetType targetType;
  final String targetId;

  /// Listing owner for a listing report; the user id for a user report.
  final String targetOwnerId;

  /// What the sheet is about, e.g. 'this listing' or a neighbor's name.
  final String targetLabel;

  const ReportSheet({
    super.key,
    required this.targetType,
    required this.targetId,
    required this.targetOwnerId,
    required this.targetLabel,
  });

  static Future<void> show(
    BuildContext context, {
    required ReportTargetType targetType,
    required String targetId,
    required String targetOwnerId,
    required String targetLabel,
  }) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ReportSheet(
        targetType: targetType,
        targetId: targetId,
        targetOwnerId: targetOwnerId,
        targetLabel: targetLabel,
      ),
    );
  }

  @override
  State<ReportSheet> createState() => _ReportSheetState();
}

class _ReportSheetState extends State<ReportSheet> {
  String? _reason;
  final _details = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  void _submit() {
    if (_reason == null) {
      setState(() => _error = 'Pick a reason first.');
      return;
    }
    context.read<AppState>().submitReport(
      targetType: widget.targetType,
      targetId: widget.targetId,
      targetOwnerId: widget.targetOwnerId,
      reason: _reason!,
      details: _details.text,
    );
    final messenger = ScaffoldMessenger.of(context);
    Navigator.of(context).pop();
    messenger.showSnackBar(
      const SnackBar(
        content: Text('Report sent — thanks, we’ll review it shortly.'),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isListing = widget.targetType == ReportTargetType.listing;
    // Scrollable: at landscape heights / 2.0x text the fixed
    // column is taller than the sheet and overflowed (Part 4
    // harness, e.g. 800x360 @ 1.3x by 33px).
    return SingleChildScrollView(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              isListing
                  ? 'Report this listing'
                  : 'Report ${widget.targetLabel}',
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 4),
            Text(
              isListing
                  ? 'Tell us what’s wrong with this listing. The owner won’t be told who reported it.'
                  : 'Tell us what’s wrong. ${widget.targetLabel} won’t be told who reported them.',
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<String>(
              isExpanded: true,
              initialValue: _reason,
              decoration: InputDecoration(
                labelText: 'Reason',
                border: const OutlineInputBorder(),
                errorText: _error,
              ),
              items: kReportReasons
                  .map(
                    (r) => DropdownMenuItem(
                      value: r,
                      child: Text(kReportReasonLabels[r] ?? r),
                    ),
                  )
                  .toList(),
              onChanged: (v) => setState(() {
                _reason = v;
                _error = null;
              }),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _details,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Details (optional)',
                hintText: 'Anything that helps us review it',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: _submit,
                icon: const Icon(Icons.flag_outlined),
                label: const Text('Send report'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
