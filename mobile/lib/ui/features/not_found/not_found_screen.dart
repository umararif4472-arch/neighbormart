import 'package:flutter/material.dart';

/// Friendly 404 used when an item/user id does not resolve.
class NotFoundScreen extends StatelessWidget {
  final String? message;
  const NotFoundScreen({super.key, this.message});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Not found')),
      // Centered when the content fits; scrolls instead of
      // overflowing on short screens with very large text (the
      // default message is long and wraps to many lines).
      body: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: constraints.maxHeight,
              minWidth: constraints.maxWidth,
            ),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 96,
                      height: 96,
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .surfaceContainerHighest,
                        borderRadius: BorderRadius.circular(28),
                      ),
                      child: Icon(
                        Icons.explore_off_outlined,
                        size: 50,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'This page wandered off the block',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(
                      message ?? 'Whatever you were looking for is not here anymore — it may have been returned, removed, or never listed.',
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 22),
                    ElevatedButton.icon(
                      onPressed: () =>
                          Navigator.of(context).popUntil((r) => r.isFirst),
                      icon: const Icon(Icons.explore),
                      label: const Text('Back to Explore'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
