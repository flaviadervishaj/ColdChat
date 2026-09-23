const form = document.querySelector('#authForm');
const title = document.querySelector('#authTitle');
const intro = document.querySelector('#authIntro');
const submit = document.querySelector('#authSubmit');
const error = document.querySelector('#authError');
const switchCopy = document.querySelector('#switchCopy');
const switchButton = document.querySelector('#switchMode');
const password = document.querySelector('#password');
let mode = 'signin';

function setBusy(busy) {
  submit.disabled = busy;
  submit.textContent = busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account';
}

function setMode(next) {
  mode = next;
  title.textContent = mode === 'signin' ? 'Sign in to ColdChat' : 'Create your account';
  intro.textContent = mode === 'signin' ? 'Continue the conversation with your account.' : 'Set up your account, then choose a community profile.';
  switchCopy.textContent = mode === 'signin' ? 'New here?' : 'Already have an account?';
  switchButton.textContent = mode === 'signin' ? 'Create an account' : 'Sign in instead';
  password.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  error.textContent = '';
  setBusy(false);
}

async function createOAuthSession() {
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return false;
  history.replaceState(null, '', '/login');
  const response = await fetch('/standalone/auth/session', {
    method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken, expires_in: params.get('expires_in') }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Google sign-in could not be completed.');
  location.replace('/');
  return true;
}

switchButton.addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
form.addEventListener('submit', async event => {
  event.preventDefault();
  error.textContent = '';
  setBusy(true);
  try {
    const response = await fetch('/standalone/auth/login', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode, email: form.email.value, password: form.password.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Authentication failed.');
    if (data.needsConfirmation) {
      setMode('signin');
      error.classList.add('success-message');
      error.textContent = 'Check your email to confirm the account, then sign in.';
      return;
    }
    location.replace('/');
  } catch (cause) {
    error.classList.remove('success-message');
    error.textContent = cause.message || 'Authentication failed.';
  } finally {
    setBusy(false);
  }
});

createOAuthSession().catch(cause => { error.textContent = cause.message; });
