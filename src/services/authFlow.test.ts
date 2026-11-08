import { describe, expect, it } from 'vitest'
import { authApi, usersApi } from './index'

/**
 * Auth-flow contract tests (Phase 8). The unit suite runs against the
 * mock backend (no Firebase config in tests): mock sign-in resolves to
 * the demo session user, which is exactly the surface the components
 * are written against. The live backend implements the same surface
 * over Firebase Auth (covered by the manual smoke test).
 */
describe('auth flow (mock backend contract)', () => {
  it('session loads the signed-in user', async () => {
    const user = await authApi.getSessionUser()
    expect(user.id).toBe(authApi.CURRENT_USER_ID)
    expect(user.name).toBeTruthy()
  })

  it('email + Google sign-in resolve to the session user', async () => {
    const byEmail = await authApi.signInWithEmail('maya.chen@example.com', 'whatever')
    expect(byEmail.id).toBe(authApi.CURRENT_USER_ID)
    const byGoogle = await authApi.signInWithGoogle()
    expect(byGoogle.id).toBe(authApi.CURRENT_USER_ID)
  })

  it('sign-up resolves and sign-out is a safe no-op in mock mode', async () => {
    const user = await authApi.signUpWithEmail('New Neighbor', 'new@example.com', 'secret1')
    expect(user.id).toBeTruthy()
    await expect(authApi.signOut()).resolves.toBeUndefined()
  })

  it('onboarding completion persists onto the profile (sign-up → setup flow)', async () => {
    const me = await authApi.getSessionUser()
    const updated = await usersApi.completeOnboarding(me.id, me.id, {
      name: me.name,
      avatarUrl: '',
      phone: '+92 300 1234567',
      city: 'Lahore',
      neighborhood: 'Gulberg',
      interests: ['Items & Tools'],
    })
    expect(updated.onboardingCompleted).toBe(true)
    expect(updated.city).toBe('Lahore')
    const reread = await usersApi.getUserById(me.id)
    expect(reread?.onboardingCompleted).toBe(true)
  })

  it('onboarding by a different actor is forbidden', async () => {
    const me = await authApi.getSessionUser()
    await expect(
      usersApi.completeOnboarding(me.id, 'u-someone-else', {
        name: 'Nope',
        avatarUrl: '',
        phone: '',
        city: 'Lahore',
        neighborhood: 'Gulberg',
        interests: [],
      }),
    ).rejects.toThrow(/account owner/)
  })
})
