/**
 * Service layer barrel. Components import the data API ONLY from here —
 * never from ./store or @/data directly. That single import boundary is
 * what lets the backend be swapped without touching a single component.
 *
 *   import { listingsApi, requestsApi } from '@/services'
 *
 * Phase 3: two backends implement the same surface —
 *   - mock (./auth, ./listings, …): in-memory store + seed data
 *   - live (./live/*): Firebase Auth + Firestore
 * The live backend is selected automatically when VITE_FIREBASE_* env
 * vars are configured (see services/firebase.ts); otherwise the app runs
 * on the mock layer (local dev, tests, CI).
 */
import * as mockAuth from './auth'
import * as mockUsers from './users'
import * as mockListings from './listings'
import * as mockRequests from './requests'
import * as mockReviews from './reviews'
import * as mockNotifications from './notifications'
import * as mockMessages from './messages'
import * as mockAdmin from './admin'
import * as mockSafety from './safety'
import * as liveAuth from './live/auth'
import * as liveUsers from './live/users'
import * as liveListings from './live/listings'
import * as liveRequests from './live/requests'
import * as liveReviews from './live/reviews'
import * as liveNotifications from './live/notifications'
import * as liveMessages from './live/messages'
import * as liveAdmin from './live/admin'
import * as liveSafety from './live/safety'
import { isFirebaseConfigured } from './firebase'

export { isFirebaseConfigured } from './firebase'

export const authApi: typeof mockAuth = isFirebaseConfigured
  ? (liveAuth as unknown as typeof mockAuth)
  : mockAuth
export const usersApi: typeof mockUsers = isFirebaseConfigured
  ? (liveUsers as unknown as typeof mockUsers)
  : mockUsers
export const listingsApi: typeof mockListings = isFirebaseConfigured
  ? (liveListings as unknown as typeof mockListings)
  : mockListings
export const requestsApi: typeof mockRequests = isFirebaseConfigured
  ? (liveRequests as unknown as typeof mockRequests)
  : mockRequests
export const reviewsApi: typeof mockReviews = isFirebaseConfigured
  ? (liveReviews as unknown as typeof mockReviews)
  : mockReviews
export const notificationsApi: typeof mockNotifications = isFirebaseConfigured
  ? (liveNotifications as unknown as typeof mockNotifications)
  : mockNotifications
export const messagesApi: typeof mockMessages = isFirebaseConfigured
  ? (liveMessages as unknown as typeof mockMessages)
  : mockMessages
export const safetyApi: typeof mockSafety = isFirebaseConfigured
  ? (liveSafety as unknown as typeof mockSafety)
  : mockSafety

export const adminApi: typeof mockAdmin = isFirebaseConfigured
  ? (liveAdmin as unknown as typeof mockAdmin)
  : mockAdmin

export { ApiError, isApiError, toErrorMessage } from './errors'
export type { BrowseListingsQuery, ListingsCursor, ListingsPage } from './pagination'
export { LISTINGS_PAGE_SIZE } from './pagination'
export type { CreateRequestInput, ReportIssueInput, RequestMutationResult } from './requests'
export type { CreateReviewInput, ReviewMutationResult } from './reviews'
export type { SendMessageResult } from './messages'
export type { CreateReportInput } from './safety'
