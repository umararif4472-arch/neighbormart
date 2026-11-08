import { ApiError } from './errors'
import { getStore } from './store'

/** Phase 9: suspended accounts cannot post, message or book (mock). */
export function assertNotSuspendedMock(userId: string): void {
  const user = getStore().users.find((u) => u.id === userId)
  if (user?.suspended) {
    throw new ApiError(
      'forbidden',
      'Your account is suspended, so this action is paused. Contact the NeighborMart team if you think this is a mistake.',
    )
  }
}
