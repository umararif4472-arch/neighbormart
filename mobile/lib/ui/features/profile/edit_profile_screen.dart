import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/utils/profile_setup_validation.dart';
import '../../../state/app_state.dart';

/// The ONE profile editor (merged from the old "Edit profile" and
/// "Set up profile" rows): name, bio and neighborhood save through
/// [AppState.updateProfile]; phone, city and interests save through
/// the profile-setup path ([AppState.completeOnboarding]) — the same
/// call ProfileSetupScreen's onboarding flow uses, so persistence
/// and the live-mode Firestore mirror keep working exactly as
/// before. ProfileSetupScreen itself remains only as the first-run
/// onboarding gate.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});
  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _bio;
  late final TextEditingController _phone;
  late final TextEditingController _city;
  late final TextEditingController _neighborhood;
  late final Set<String> _interests;
  String? _interestsError;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    final me = context.read<AppState>().currentUser;
    _name = TextEditingController(text: me.name);
    _bio = TextEditingController(text: me.bio);
    _phone = TextEditingController(text: me.phone);
    _city = TextEditingController(text: me.city.isEmpty ? 'Lahore' : me.city);
    _neighborhood = TextEditingController(text: me.neighborhood);
    _interests = Set.of(me.interests);
  }

  @override
  void dispose() {
    _name.dispose();
    _bio.dispose();
    _phone.dispose();
    _city.dispose();
    _neighborhood.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    final interestsError = validateSetupInterests(_interests.toList());
    if (interestsError != null) {
      setState(() => _interestsError = interestsError);
      return;
    }
    setState(() => _saving = true);
    final state = context.read<AppState>();
    // Setup save path first: it validates phone/city/interests with
    // the shared setup rules and persists + mirrors them.
    final err = await state.completeOnboarding(
      name: _name.text,
      phone: _phone.text,
      city: _city.text,
      neighborhood: _neighborhood.text,
      interests: _interests.toList(),
    );
    if (!mounted) return;
    if (err != null) {
      setState(() => _saving = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(err)));
      return;
    }
    // Bio lives only on the classic profile path.
    state.updateProfile(
      name: _name.text,
      bio: _bio.text,
      neighborhood: _neighborhood.text,
    );
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Profile updated.')));
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Edit profile')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            AppSpacing.xxl,
          ),
          children: [
            TextFormField(
              controller: _name,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Name *'),
              validator: (v) => validateSetupName(v ?? ''),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _bio,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'Bio',
                hintText: 'What do you lend, borrow, or just enjoy?',
              ),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(
                labelText: 'Phone (optional)',
                hintText: 'e.g. 0300 1234567',
              ),
              validator: (v) => validateSetupPhone(v ?? ''),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _city,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'City *'),
              validator: (v) => validateSetupCity(v ?? ''),
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _neighborhood,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Neighborhood *'),
              validator: (v) => validateSetupArea(v ?? ''),
            ),
            const SizedBox(height: AppSpacing.xl),
            Text('Interests', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
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
                    _interestsError = null;
                  }),
                );
              }).toList(),
            ),
            if (_interestsError != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: Text(
                  _interestsError!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.error,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            const SizedBox(height: AppSpacing.xl),
            ElevatedButton(
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Saving…' : 'Save changes'),
            ),
          ],
        ),
      ),
    );
  }
}
