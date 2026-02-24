import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    signOut,
    setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

export async function signInWithGoogle(auth) {
    await setPersistence(auth, browserLocalPersistence);
    // iOS Safari in PWA standalone mode blocks popups — use redirect instead.
    // getRedirectResult() in app.js processes the result when the app reloads.
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
        return signInWithRedirect(auth, provider);
    }
    return signInWithPopup(auth, provider);
}

export async function signOutUser(auth) {
    return signOut(auth);
}