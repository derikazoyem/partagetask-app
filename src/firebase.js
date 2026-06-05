import { initializeApp } from 'firebase/app'
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth'

import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'
import { getFunctions, httpsCallable } from 'firebase/functions'

const firebaseConfig = {
  apiKey: 'AIzaSyCv14Esz5zSvyRJ2iSkdFADjC25VdiPlJ4',
  authDomain: 'partagetask.firebaseapp.com',
  projectId: 'partagetask',
  storageBucket: 'partagetask.firebasestorage.app',
  messagingSenderId: '508127987478',
  appId: '1:508127987478:web:f2adf97fa18f607932b237'
}

const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)

setPersistence(auth, browserLocalPersistence)

auth.onAuthStateChanged(async (user) => {
  if (user) {
    await user.getIdToken(true)
  }
})

export const db = getFirestore(app)
export const storage = getStorage(app)

const functions = getFunctions(app, 'us-central1')



// Cloud Functions callables
export const fnCreateProject        = httpsCallable(functions, 'createProject')
export const fnJoinProject          = httpsCallable(functions, 'joinProject')
export const fnApproveMember        = httpsCallable(functions, 'approveMember')
export const fnRejectMember         = httpsCallable(functions, 'rejectMember')
export const fnRegenerateInviteCode = httpsCallable(functions, 'regenerateInviteCode')
