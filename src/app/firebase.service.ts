import { Injectable } from '@angular/core';
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, collection, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, Query, QueryConstraint, QuerySnapshot, Unsubscribe } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, Auth, User } from 'firebase/auth';

// Utility types for Firestore
type FirestoreCollection = ReturnType<typeof collection>;
type FirestoreDoc = ReturnType<typeof doc>;
type FirestoreBatch = ReturnType<typeof writeBatch>;

@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private firebaseConfig = {
    apiKey: 'AIzaSyBd2ymMz7Az97T71xsnP3P2XFjTrxEzruc',
    authDomain: 'video-manager-sync.firebaseapp.com',
    projectId: 'video-manager-sync',
    storageBucket: 'video-manager-sync.firebasestorage.app',
    messagingSenderId: '772995186320',
    appId: '1:772995186320:web:42842957d19e780ebea215',
    measurementId: 'G-KZ3C92XLJH'
  };

  app: FirebaseApp | null = null;
  firestore: Firestore | null = null;
  auth: Auth | null = null;
  user: User | null = null;

  initialized = false;

  async initializeFirebase(): Promise<void> {
    if (this.initialized) return;
    this.app = initializeApp(this.firebaseConfig);
    this.firestore = getFirestore(this.app);
    this.auth = getAuth(this.app);
    this.initialized = true;
  }

  async signInAnonymously(): Promise<User> {
    if (!this.auth) throw new Error('Firebase Auth not initialized');
    const userCredential = await signInAnonymously(this.auth);
    this.user = userCredential.user;
    return this.user;
  }

  onAuthStateChanged(callback: (user: User | null) => void): void {
    if (!this.auth) throw new Error('Firebase Auth not initialized');
    onAuthStateChanged(this.auth, callback);
  }

  // Firestore helpers
  getCollection(path: string) {
    if (!this.firestore) throw new Error('Firestore not initialized');
    return collection(this.firestore, path);
  }

  getDoc(path: string, id: string) {
    if (!this.firestore) throw new Error('Firestore not initialized');
    return doc(this.firestore, path, id);
  }

  async getDocs(col: FirestoreCollection | Query) {
    return getDocs(col);
  }

  async setDoc(ref: FirestoreDoc, data: any) {
    return setDoc(ref, data);
  }

  async updateDoc(ref: FirestoreDoc, data: any) {
    return updateDoc(ref, data);
  }

  async deleteDoc(ref: FirestoreDoc) {
    return deleteDoc(ref);
  }

  onSnapshot(col: FirestoreCollection | Query, next: (snap: QuerySnapshot<any>) => void, error?: (err: any) => void): Unsubscribe {
    return onSnapshot(col, next, error);
  }

  query(col: FirestoreCollection, ...constraints: QueryConstraint[]) {
    return query(col, ...constraints);
  }

  where = where;
  writeBatch() {
    if (!this.firestore) throw new Error('Firestore not initialized');
    return writeBatch(this.firestore);
  }

  // Utility for ID sanitization
  sanitizeId(path: string): string {
    return path.replace(/[\/: ]/g, '_').replace(/[^a-zA-Z0-9._-]/g, '');
  }

  // Utility for path normalization
  normalizePath(filePath: string): string {
    if (!filePath) return '';
    return filePath
      .replace(/^[a-zA-Z]:[\\\/]/, '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
      .toLowerCase();
  }
}
