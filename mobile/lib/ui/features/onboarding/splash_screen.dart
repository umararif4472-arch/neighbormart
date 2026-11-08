import 'package:flutter/material.dart';

import '../../../core/theme/app_theme.dart';

/// Branded splash shown briefly while the app restores the session.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.terracotta,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 92,
              height: 92,
              decoration: BoxDecoration(
                color: AppColors.cream,
                borderRadius: BorderRadius.circular(26),
              ),
              child: const Icon(
                Icons.handshake_outlined,
                size: 52,
                color: AppColors.terracotta,
              ),
            ),
            const SizedBox(height: 20),
            const Text(
              "NeighborMart",
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.w800,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              "Your neighborhood's shared garage",
              style: TextStyle(fontSize: 15, color: Color(0xFFF3D9C8)),
            ),
            const SizedBox(height: 28),
            const SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 3,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
