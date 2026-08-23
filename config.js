/* ------------------------------------------------------------------
   The only file you need to edit.

   Both values below are safe to commit publicly. A Firebase apiKey is an
   identifier, not a secret — access is controlled by the Authorized
   domains list in the Firebase console and by the domain check on the
   Apps Script side. The /exec URL is likewise public by necessity; it is
   protected by ID-token verification, not by being hard to guess.
   ------------------------------------------------------------------ */

export const FIREBASE_CONFIG = {
   apiKey: 'AIzaSyDBk20h7M2evFU0OHtAhr73K4NX3AmWMFU',
   authDomain: 'onlinecec-bec0e.firebaseapp.com',
   projectId: 'onlinecec-bec0e',
   appId: '1:69594006268:web:3d22028bc27fea704ccd79'
};

/* Apps Script ▸ Deploy ▸ New deployment ▸ Web app ▸ the /exec URL. */
export const API_URL = 'https://script.google.com/macros/s/AKfycbxkB1ec3XtqcbeKgk_xsHTnrEZd2hSzAWy7Tw9CFlMZA4BqqToI2fslscMqhC9QSH4q/exec';

/* Shown on the sign-in screen. Purely cosmetic. */
export const SCHOOL_NAME = 'Information Technology';

/* Restrict the Google account picker to one Workspace domain, e.g.
   'school.edu.ph'. This is a convenience only — it is trivially bypassed,
   so the real check is ALLOWED_EMAIL_DOMAINS in the Apps Script
   properties. Leave blank to show all accounts. */
export const HOSTED_DOMAIN = '';
/* ------------------------------------------------------------------
   Checks the values above before the app tries to use them.

   Returns a short machine-readable code, never a sentence: the caller
   shows the student a plain apology and logs this to the console, where
   only the teacher (with DevTools open) will see which value is missing.
   Naming the missing key on screen would tell a student nothing useful
   and would advertise how the site is wired.
   ------------------------------------------------------------------ */
export function validateConfig() {
  if (!FIREBASE_CONFIG.apiKey)     return 'missing:apiKey';
  if (!FIREBASE_CONFIG.authDomain) return 'missing:authDomain';
  if (!FIREBASE_CONFIG.projectId)  return 'missing:projectId';
  if (!FIREBASE_CONFIG.appId)      return 'missing:appId';
  if (!API_URL || API_URL.indexOf('YOUR_ID') !== -1) return 'missing:apiUrl';
  if (!/^https:\/\/script\.google\.com\/.*\/exec$/.test(API_URL)) return 'bad:apiUrl';
  return null;   // all good
}
