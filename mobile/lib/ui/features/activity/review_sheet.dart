import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../state/app_state.dart';

/// Leave-a-review sheet for a returned borrow. One review per person per
/// request — AppState.addReview enforces it.
class ReviewSheet extends StatefulWidget {
  final String requestId;
  const ReviewSheet({super.key, required this.requestId});

  static Future<void> show(BuildContext context, String requestId) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => ReviewSheet(requestId: requestId),
    );
  }

  @override
  State<ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends State<ReviewSheet> {
  int _rating = 0;
  final _comment = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _comment.dispose();
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
    final other = state.otherPartyFor(req);
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
            'Review ${other.name}',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 4),
          Text(
            'For the deal: $itemTitle',
            style: Theme.of(context).textTheme.bodySmall,
          ),
          const SizedBox(height: 16),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(5, (i) {
              final star = i + 1;
              return IconButton(
                onPressed: () => setState(() {
                  _rating = star;
                  _error = null;
                }),
                icon: Icon(
                  star <= _rating ? Icons.star : Icons.star_border,
                  size: 38,
                  color: AppColors.amber,
                ),
              );
            }),
          ),
          TextField(
            controller: _comment,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'Comment (optional)',
              hintText: 'How did it go? Condition, communication, timing…',
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
                if (_rating == 0) {
                  setState(() => _error = 'Tap a star rating first.');
                  return;
                }
                final err = state.addReview(
                  widget.requestId,
                  _rating,
                  _comment.text,
                );
                if (err != null) {
                  setState(() => _error = err);
                  return;
                }
                Navigator.of(context).pop();
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Review posted — trust scores updated.'),
                  ),
                );
              },
              child: const Text('Post review'),
            ),
          ),
        ],
      ),
    );
  }
}
