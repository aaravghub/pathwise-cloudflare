# Pathwise — Cloudflare Pages

This is a separate Cloudflare Pages version of Pathwise. The original Vercel repository and deployment are not modified.

## Deploy

1. In Cloudflare, create a Pages project connected to this repository (not a static-only upload).
2. Framework preset: None. Build command: `npm install`. Build output directory: `public`.
3. Ensure Node.js compatibility is enabled via the included `wrangler.toml`.
4. Deploy, then test the homepage and `/api/login` using only an account you are authorized to use.

## Notes and limitations

- `functions/api/login.js` and `functions/api/sync.js` are Cloudflare Pages Functions replacing Vercel's `api/*.js` handlers.
- Genesis integration is carried over from the original repository. Cloudflare compatibility and the district's login/parser behavior still need verification; a successful build does not prove live login works.
- Do not test with a real password until you trust the deployment. Credentials are sent to this project's API over HTTPS for login/sync and held in page memory by the frontend, not stored in a database by these handlers. Frontend Pathwise data may remain in browser localStorage.
- Do not put student passwords, tokens, or secrets in GitHub files. If Genesis requires SSO/MFA, stop rather than trying to bypass it.
- The frontend's grade calculator and A/B-day schedule UI are copied from the source repository, not rewritten.