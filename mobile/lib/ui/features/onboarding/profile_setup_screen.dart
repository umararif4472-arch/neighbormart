import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/utils/profile_setup_validation.dart';
import '../../../state/app_state.dart';

/// Phase 6 profile setup — the 3-step flow shown right after a new
/// account's first login (name + phone → city + area → interests).
///
/// First-run onboarding ONLY: editing an existing profile lives in
/// EditProfileScreen (which saves through the same
/// [AppState.completeOnboarding] path). The old editMode variant was
/// removed when the two editors were merged.
class ProfileSetupScreen extends StatefulWidget {
  const ProfileSetupScreen({super.key});

  @override
  State<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends State<ProfileSetupScreen> {
  static const _stepTitles = ['About you', 'Where you are', 'Your interests'];

  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _city;
  late final TextEditingController _area;
  late final Set<String> _interests;
  int _step = 0;
  String? _error;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final me = context.read<AppState>().currentUser;
    _name = TextEditingController(text: me.name);
    _phone = TextEditingController(text: me.phone);
    _city = TextEditingController(text: me.city.isEmpty ? 'Lahore' : me.city);
    _area = TextEditingController(text: me.neighborhood);
    _interests = Set.of(me.interests);
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _city.dispose();
    _area.dispose();
    super.dispose();
  }

  bool get _isLast => _step == _stepTitles.length - 1;

  String? _validateStep() {
    switch (_step) {
      case 0:
        return validateSetupName(_name.text) ?? validateSetupPhone(_phone.text);
      case 1:
        return validateSetupCity(_city.text) ?? validateSetupArea(_area.text);
      default:
        return validateSetupInterests(_interests.toList());
    }
  }

  void _back() {
    if (_step > 0) {
      setState(() {
        _step--;
        _error = null;
      });
    }
  }

  Future<void> _next() async {
    final error = _validateStep();
    if (error != null) {
      setState(() => _error = error);
      return;
    }
    if (!_isLast) {
      setState(() {
        _step++;
        _error = null;
      });
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    final err = await context.read<AppState>().completeOnboarding(
      name: _name.text,
      phone: _phone.text,
      city: _city.text,
      neighborhood: _area.text,
      interests: _interests.toList(),
    );
    if (!mounted) return;
    setState(() => _saving = false);
    if (err != null) {
      setState(() => _error = err);
      return;
    }
    // Gate mode: AppState notified, so AppRoot swaps this screen for
    // the app shell on its own — nothing to navigate here.
  }

  @override
  Widget build(BuildContext context) {
    final reduceMotion = MediaQuery.of(context).disableAnimations;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Finish your profile'),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: Column(
          children: [
            _StepIndicator(step: _step),
            Expanded(
              child: AnimatedSwitcher(
                duration: reduceMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 220),
                child: ListView(
                  key: ValueKey(_step),
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  children: [
                    Text(
                      _stepTitles[_step],
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      _stepSubtitle,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 18),
                    ..._stepFields(),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 14),
                        child: Text(
                          _error!,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
              // The primary action takes the remaining width (full
              // width on step 1) instead of a Spacer pushing two
              // intrinsic-width buttons apart — at large text
              // scales the pair no longer overflows the bar. The
              // label sits in a FittedBox so it scales down rather
              // than breaking out of the button.
              child: Row(
                children: [
                  if (_step > 0) ...[
                    OutlinedButton(
                      onPressed: _saving ? null : _back,
                      child: const Text('Back'),
                    ),
                    const SizedBox(width: 12),
                  ],
                  Expanded(
                    child: ElevatedButton(
                      onPressed: _saving ? null : _next,
                      child: FittedBox(
                        fit: BoxFit.scaleDown,
                        child: Text(
                          _saving
                              ? 'Saving…'
                              : _isLast
                              ? 'Finish'
                              : 'Continue',
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String get _stepSubtitle {
    switch (_step) {
      case 0:
        return 'Confirm how neighbors will see you, and a phone number they can reach you on.';
      case 1:
        return 'Listings and searches start from your area — you can change it any time.';
      default:
        return 'We will surface more of what you like on Explore.';
    }
  }

  List<Widget> _stepFields() {
    switch (_step) {
      case 0:
        return [
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Full name *',
              prefixIcon: Icon(Icons.person_outline),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
              labelText: 'Phone (optional)',
              hintText: 'e.g. 0300 1234567',
              prefixIcon: Icon(Icons.phone_outlined),
            ),
          ),
        ];
      case 1:
        return [
          TextField(
            controller: _city,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'City *',
              prefixIcon: Icon(Icons.location_city_outlined),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _area,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              labelText: 'Area *',
              hintText: 'e.g. Gulberg',
              prefixIcon: Icon(Icons.location_on_outlined),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: kLahoreAreaSuggestions
                .map(
                  (area) => ActionChip(
                    label: Text(area),
                    onPressed: () => setState(() {
                      _area.text = area;
                      _error = null;
                    }),
                  ),
                )
                .toList(),
          ),
        ];
      default:
        return [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: kInterestOptions.map((option) {
              final selected = _interests.contains(option);
              return FilterChip(
                label: Text(option),
                selected: selected,
                onSelected: (on) => setState(() {
                  if (on) {
                    _interests.add(option);
                  } else {
                    _interests.remove(option);
                  }
                  _error = null;
                }),
              );
            }).toList(),
          ),
          const SizedBox(height: 10),
          Text(
            _interests.isEmpty
                ? 'Pick at least one.'
                : '${_interests.length} selected',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ];
    }
  }
}

/// Slim 3-segment progress header: filled segments for finished
/// steps, with the "Step n of 3" caption the tests anchor on.
class _StepIndicator extends StatelessWidget {
  final int step;
  const _StepIndicator({required this.step});
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: List.generate(3, (i) {
              return Expanded(
                child: Container(
                  margin: EdgeInsets.only(right: i < 2 ? 6 : 0),
                  height: 5,
                  decoration: BoxDecoration(
                    color: i <= step
                        ? Theme.of(context).colorScheme.primary
                        : Theme.of(context).colorScheme.surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 8),
          Text(
            'Step ${step + 1} of 3',
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
