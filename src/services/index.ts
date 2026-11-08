/**
 * Service layer barrel. Components import the data API ONLY from here —
 * never from ./store or @/data directly. That single import boundary is
 * what lets the mock layer be swapped for real HTTP later without
 * touching a single component.
 *
 *   import { listingsApi, requestsApi } from '@/services'
 */
export * as authApi from './auth'
export * as usersApi from './users'
export * as listingsApi from './listings'
export * as requestsApi from './requests'
export * as reviewsApi from './reviews'
export * as notificationsApi from './notifications'
export * as messagesApi from './messages'
export { ApiError, isApiError, toErrorMessage } from './errors'
