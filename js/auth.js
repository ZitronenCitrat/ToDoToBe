import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    signOut,
    setPersistence,
    browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/11.3.0/firebase-auth.js';

const provider = new GoogleAuthProvider();

/**
 * Gibt true zurück, wenn die App als iOS-PWA im Standalone-Modus läuft.
 *
 * Warum iOS PWA ein Sonderfall ist:
 * iOS Safari blockiert window.open() wenn es nicht im selben synchronen
 * Call-Stack eines User-Gesture-Events passiert. Firebase's signInWithPopup
 * ruft window.open() erst nach einem internen await (setPersistence) auf —
 * das verletzt diese Regel und der Popup wird geblockt.
 *
 * navigator.standalone ist ein iOS-exklusives Flag (true nur bei "Zum
 * Homescreen hinzufügen" + App aus dem Homescreen geöffnet).
 * Auf Android-PWA ist es undefined — dort funktioniert signInWithPopup.
 */
function isIOSPWA() {
    return (
        /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
        navigator.standalone === true
    );
}

export async function signInWithGoogle(auth) {
    await setPersistence(auth, browserLocalPersistence);

    if (isIOSPWA()) {
        return signInWithRedirect(auth, provider);
    }

    // Alle anderen Plattformen: Popup (Desktop, Android PWA, iOS Safari Browser)
    return signInWithPopup(auth, provider);
}

export async function signOutUser(auth) {
    return signOut(auth);
}
