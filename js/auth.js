import { GoogleAuthProvider, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

export async function signInWithGoogle(auth) {
    return signInWithPopup(auth, provider);
}

export async function signOutUser(auth) {
    return signOut(auth);
}

