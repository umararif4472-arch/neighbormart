import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import type { User } from '@/types'
import { getDb } from '../firebase'
import { COLLECTIONS, fromDoc, fromDocs } from './firestoreData'

/** Live user service — public profile documents at users/{uid}. */

export async function getUsers(): Promise<User[]> {
  const snap = await getDocs(collection(getDb(), COLLECTIONS.users))
  return fromDocs<User>(snap.docs)
}

export async function getUserById(userId: string): Promise<User | null> {
  const snap = await getDoc(doc(getDb(), COLLECTIONS.users, userId))
  return fromDoc<User>(snap)
}
