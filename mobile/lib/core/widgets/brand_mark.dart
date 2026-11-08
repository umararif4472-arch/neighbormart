import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../config.dart';

/// The Open Door logo symbol, placed by the brand rules
/// (docs/BRAND.md): the dark-background variant on dark
/// backgrounds; on light backgrounds the full symbol, or the
/// simple symbol (no welcome mat) at [size] 48 and below.
/// The artwork is the kit's verbatim SVG — never redrawn.
class BrandMark extends StatelessWidget {
  final double size;

  const BrandMark({super.key, this.size = 72});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final asset = dark
        ? kBrandSymbolDarkAsset
        : size <= 48
        ? kBrandSymbolSimpleAsset
        : kBrandSymbolAsset;
    return SvgPicture.asset(
      asset,
      width: size,
      height: size,
      semanticsLabel: kAppName,
    );
  }
}
