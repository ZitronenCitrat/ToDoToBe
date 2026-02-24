import {
    GoogleAuthProvider,
    EmailAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    signInWithEmailAndPassword,
    linkWithCredential,
    updatePassword as fbUpdatePassword,
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

// ─── Google Sign-In ───────────────────────────────────────────────────────────

export async function signInWithGoogle(auth) {
    // WICHTIG: Persistence NICHT abwarten (kein await hier!)
    // Wir setzen sie parallel, damit der Klick-Event "frisch" bleibt
    // und iOS Safari window.open() nicht blockiert.
    setPersistence(auth, browserLocalPersistence);

    try {
        const result = await signInWithPopup(auth, provider);
        return result;
    } catch (error) {
        console.error("Popup Error:", error);
        // Fallback: Popup geblockt (z.B. iOS PWA Standalone) → Redirect
        if (error.code === 'auth/popup-blocked' || error.code === 'auth/cancelled-popup-request') {
            return signInWithRedirect(auth, provider);
        }
        throw error;
    }
}

// ─── Email / Password Sign-In ─────────────────────────────────────────────────

/**
 * Meldet einen bestehenden User per E-Mail + Passwort an.
 * Funktioniert nur für Accounts, die bereits über Google erstellt wurden
 * und ein Passwort verknüpft haben (linkEmailPassword).
 */
export async function signInWithEmail(auth, email, password) {
    await setPersistence(auth, browserLocalPersistence);
    return signInWithEmailAndPassword(auth, email, password);
}

// ─── Account Linking ──────────────────────────────────────────────────────────

/**
 * Verknüpft ein Passwort mit dem bestehenden Google-Account.
 * Erstellt KEINEN neuen Account — nur Linking an existierenden User.
 *
 * Voraussetzung: User ist bereits per Google eingeloggt.
 */
export async function linkEmailPassword(user, password) {
    const credential = EmailAuthProvider.credential(user.email, password);
    return linkWithCredential(user, credential);
}

/**
 * Ändert das Passwort eines bereits verknüpften Email-Providers.
 * Wirft auth/requires-recent-login wenn die Session zu alt ist.
 */
export async function changePassword(user, newPassword) {
    return fbUpdatePassword(user, newPassword);
}

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

/**
 * Gibt true zurück, wenn der User einen Email/Password-Provider verknüpft hat.
 */
export function isPasswordLinked(user) {
    return user ? user.providerData.some(p => p.providerId === 'password') : false;
}

/**
 * Gibt eine nutzerfreundliche deutsche Fehlermeldung für Auth-Fehler zurück.
 */
export function getAuthErrorMessage(code) {
    const messages = {
        'auth/invalid-credential':          'E-Mail oder Passwort falsch.',
        'auth/user-not-found':              'Kein Konto mit dieser E-Mail. Bitte zuerst mit Google anmelden.',
        'auth/wrong-password':              'Falsches Passwort.',
        'auth/too-many-requests':           'Zu viele Versuche. Bitte warte kurz und versuche es erneut.',
        'auth/user-disabled':               'Dieses Konto wurde deaktiviert.',
        'auth/weak-password':               'Passwort zu schwach. Mindestens 8 Zeichen.',
        'auth/requires-recent-login':       'Bitte melde dich kurz ab und erneut an, um dein Passwort zu ändern.',
        'auth/email-already-in-use':        'Diese E-Mail ist bereits mit einem anderen Konto verknüpft.',
        'auth/provider-already-linked':     'Ein Passwort ist bereits mit diesem Konto verknüpft.',
        'auth/credential-already-in-use':   'Diese Zugangsdaten werden bereits verwendet.',
        'auth/operation-not-allowed':       'E-Mail/Passwort-Login ist nicht aktiviert. Bitte den Administrator kontaktieren.',
    };
    return messages[code] || 'Ein Fehler ist aufgetreten. Bitte versuche es erneut.';
}

// ─── Sign-Out ─────────────────────────────────────────────────────────────────

export async function signOutUser(auth) {
    return signOut(auth);
}
