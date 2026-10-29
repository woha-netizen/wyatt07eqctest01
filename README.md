# IAM Demo Application

One Cloudflare Worker serves the website and a login API. Accounts, sessions and the audit log live in a D1 database.

## Pages
Public: Home, About, Help, Log in, Register
Signed in: Dashboard (access badge), Security (devices + password), Activity (your audit log), Profile
Admins only: Admin (manage users, see all activity)

## Features
- Register with username, email and password (the first account becomes admin)
- Log in with email or username; log out; change password
- Pages are protected on the server, not just hidden in the browser
- Security page lists signed-in devices and can sign any of them out
- Activity log of sign-ins, failures, lockouts, password and admin changes (kept 90 days)
- Admin console: promote/demote, suspend, delete users
- Passwords: PBKDF2-SHA256 with random salt. Sessions: random token in an HttpOnly cookie, only its hash is stored
- 5 failed logins lock an account for 10 minutes; CSRF origin check; Content-Security-Policy
- Light and dark mode, responsive layout, keyboard focus styles

## Deploy (GitHub -> Cloudflare Workers)
1. Cloudflare dashboard > Storage & Databases > D1 > Create database. Name it iam-demo-db.
2. Copy its Database ID into wrangler.jsonc (database_id).
3. Keep `name` in wrangler.jsonc equal to your Worker's name.
4. Commit and push this folder to your GitHub repo. Cloudflare redeploys automatically.
5. Enable the URL if needed: Worker > Settings > Domains & Routes > workers.dev > Enable.
6. Open the URL and click Register. Tables are created automatically on first request.

## Run locally
    npm install
    npx wrangler dev
Then open http://localhost:8787

## Settings
- Close sign-ups after you've made your admin: set ALLOW_REGISTRATION to "false" in wrangler.jsonc.
- Locked out of admin? In the D1 console: UPDATE users SET role='admin' WHERE username='yourname';

## Design
public/css/styles.css is the whole design system (colour tokens, type, components).
The font is Archivo (variable, width axis), self-hosted in public/fonts under the SIL Open Font License.
The Content-Security-Policy forbids inline styles and scripts, so keep CSS and JS in their own files.
