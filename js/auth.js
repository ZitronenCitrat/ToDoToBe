import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

export async function signInWithGoogle(auth) {
    await setPersistence(auth, browserLocalPersistence);
    // signInWithRedirect breaks iOS PWA: after Google redirect the app reloads
    // in a new Safari tab, losing the PWA sessionStorage context and Firebase
    // redirect state. signInWithPopup opens a popup window instead, which keeps
    // the PWA session alive and delivers the result back directly.
    return signInWithPopup(auth, provider);
}

export async function signOutUser(auth) {
    return signOut(auth);
}