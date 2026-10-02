/* ══════════════════════════════════════════════
   ROSEBELLA ADMIN — shared setup (dashboard + POS)
   ══════════════════════════════════════════════ */
firebase.initializeApp({
  apiKey:            "AIzaSyCWaVcGjH3ZZ11Oy1vEBJOE9L_wbsgYET0",
  authDomain:        "rosebella-bac0e.firebaseapp.com",
  projectId:         "rosebella-bac0e",
  storageBucket:     "rosebella-bac0e.firebasestorage.app",
  messagingSenderId: "178956178545",
  appId:             "1:178956178545:web:4ebd233e18a0d1484eb7d0",
});

// Must match isAdmin() in firestore.rules
const ADMIN_EMAILS = ['yousefaljailey@gmail.com'];
const STOREFRONT_URL = 'https://rosebella.qa';
const CLOUDINARY = { cloud: 'dp6x1cfmj', preset: 'rosebella' };

const db   = firebase.firestore();
const auth = firebase.auth();

function isAdminUser(u) {
  return !!u && u.emailVerified && ADMIN_EMAILS.includes((u.email || '').toLowerCase());
}

/* Calls onReady(user) once an admin is signed in; otherwise shows the login screen.
   The login screen markup lives in each page (#login). */
function requireAdmin(onReady) {
  const loginEl   = document.getElementById('login');
  const appEl     = document.getElementById('app');
  const errEl     = document.getElementById('loginErr');
  const verifyBtn = document.getElementById('verifyBtn');
  const emailI    = document.getElementById('loginEmail');
  let started = false;

  const say = (msg, ok) => { errEl.textContent = msg; errEl.classList.toggle('login-msg', !!ok); };

  auth.onAuthStateChanged(async user => {
    verifyBtn.hidden = true;
    if (user && !user.emailVerified && ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
      await user.reload();               // picks up a verification done in another tab
      user = auth.currentUser;
    }
    if (user && isAdminUser(user)) {
      loginEl.hidden = true;
      appEl.hidden = false;
      if (!started) { started = true; onReady(user); }
      return;
    }
    if (user) {
      if (!ADMIN_EMAILS.includes((user.email || '').toLowerCase())) {
        say(`${user.email} is not an admin account.`);
        auth.signOut();
      } else {
        // Admin email, not verified yet: stay signed in so the link can be sent
        say(`Verify ${user.email} to continue: send the email, open the link in it, then sign in again.`);
        verifyBtn.hidden = false;
      }
    }
    appEl.hidden = true;
    loginEl.hidden = false;
  });

  document.getElementById('loginForm').onsubmit = async e => {
    e.preventDefault();
    say('');
    const pass = document.getElementById('loginPass').value;
    try { await auth.signInWithEmailAndPassword(emailI.value.trim(), pass); }
    catch (err) { say(friendlyAuthError(err)); }
  };

  document.getElementById('forgotBtn').onclick = async () => {
    const email = emailI.value.trim();
    if (!email) { say('Enter your email above, then click “Forgot password?” again.'); emailI.focus(); return; }
    try {
      await auth.sendPasswordResetEmail(email);
      say(`If ${email} has an account, a password reset link is on its way. Check your inbox and spam.`, true);
    } catch (err) { say(friendlyAuthError(err)); }
  };

  verifyBtn.onclick = async () => {
    const u = auth.currentUser;
    if (!u) return;
    try {
      await u.sendEmailVerification();
      say(`Verification email sent to ${u.email}. Open the link, then sign in again.`, true);
      auth.signOut();
    } catch (err) { say(friendlyAuthError(err)); }
  };
}

function friendlyAuthError(e) {
  const c = e && e.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'Incorrect email or password.';
  if (c.includes('invalid-email')) return 'Enter a valid email address.';
  if (c.includes('unauthorized-domain')) return 'This domain is not authorised in Firebase → Authentication → Settings → Authorised domains.';
  if (c.includes('too-many-requests')) return 'Too many attempts. Try again in a few minutes.';
  return e.message || 'Sign-in failed.';
}

function signOut() { auth.signOut(); }

// ── Small helpers ───────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

let _toastTimer = null;
function toast(msg, isError) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle('bad', !!isError);
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), isError ? 5000 : 2600);
}

function firestoreError(e) {
  console.error(e);
  if (e && e.code === 'permission-denied') {
    return 'Permission denied — publish firestore.rules in the Firebase console.';
  }
  return (e && e.message) || 'Something went wrong.';
}

/* Uploads an image or video to Cloudinary (unsigned preset) and returns its URL. */
async function uploadMedia(file, folder) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLOUDINARY.preset);
  if (folder) fd.append('folder', folder);
  const res  = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.cloud}/auto/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (!res.ok || !data.secure_url) throw new Error(data.error?.message || 'Upload failed');
  if (data.resource_type === 'image') {
    return data.secure_url.replace('/image/upload/', '/image/upload/f_auto,q_auto,w_1200/');
  }
  return data.secure_url;
}
