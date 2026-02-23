import { GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

export async function signInWithGoogle(auth) {
    await setPersistence(auth, browserLocalPersistence);
    return signInWithPopup(auth, provider);
}

export async function signOutUser(auth) {
    return signOut(auth);
}

