/**
 * Real server-side Cloudflare Turnstile verification.
 *
 * The widget on login.html / signup.html only proves the browser solved a
 * challenge. That token means nothing until your server calls Cloudflare's
 * siteverify endpoint and gets back { success: true }. Do this check inside
 * your existing /api/login and /api/register handlers, BEFORE touching the
 * database or issuing a session.
 *
 * Docs: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

// TODO: put your real SECRET key here (Turnstile dashboard -> your site -> Settings).
// Never ship the secret key to the browser -- only the site key in the HTML is public.
// In a Cloudflare Worker, store this as a secret instead of a literal:
//   wrangler secret put TURNSTILE_SECRET_KEY
const TURNSTILE_SECRET_KEY = "YOUR_SECRET_KEY_HERE"; // e.g. env.TURNSTILE_SECRET_KEY in a Worker

/**
 * Verifies a Turnstile token with Cloudflare's siteverify API.
 * @param {string} token - value of the 'cf-turnstile-response' form field.
 * @param {string} [remoteIp] - the client's IP, if available (recommended).
 * @param {string} secretKey - your Turnstile secret key.
 * @returns {Promise<{success: boolean, errorCodes: string[]}>}
 */
async function verifyTurnstileToken(token, remoteIp, secretKey = TURNSTILE_SECRET_KEY) {
  if (!token) {
    return { success: false, errorCodes: ["missing-input-response"] };
  }

  const formData = new FormData();
  formData.append("secret", secretKey);
  formData.append("response", token);
  if (remoteIp) formData.append("remoteip", remoteIp);

  const result = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: formData }
  );

  const outcome = await result.json();
  return {
    success: outcome.success === true,
    errorCodes: outcome["error-codes"] || [],
  };
}

/**
 * Example usage inside a Cloudflare Worker handling POST /api/login
 * (adapt field names / session logic to match your actual app.js + backend).
 */
async function handleLogin(request, env) {
  const form = await request.formData();
  const token = form.get("cf-turnstile-response");
  const clientIp = request.headers.get("CF-Connecting-IP");

  const { success, errorCodes } = await verifyTurnstileToken(
    token,
    clientIp,
    env.TURNSTILE_SECRET_KEY // bound as a Worker secret, not hardcoded
  );

  if (!success) {
    console.warn("Turnstile verification failed:", errorCodes);
    return new Response(
      JSON.stringify({ error: "Security check failed. Please try again." }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // --- Only past this point do you look up the user, check the password
  // hash, create a session, etc. Turnstile failing should short-circuit
  // everything else, the same way a missing password would. ---

  // ... existing login logic (identifier/password check, session creation) ...
}

module.exports = { verifyTurnstileToken, handleLogin };
