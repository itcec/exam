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
export const API_URL = 'https://script.google.com/macros/s/PASTE_DEPLOYMENT_ID/exec';

/* Shown on the sign-in screen. Purely cosmetic. */
export const SCHOOL_NAME = 'Information Technology';

/* Restrict the Google account picker to one Workspace domain, e.g.
   'school.edu.ph'. This is a convenience only — it is trivially bypassed,
   so the real check is ALLOWED_EMAIL_DOMAINS in the Apps Script
   properties. Leave blank to show all accounts. */
export const HOSTED_DOMAIN = '';
