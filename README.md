# Series-DB

An Express/EJS app for keeping and sharing movie and TV series lists.

## Run locally

Use Node.js 24.18.0 or newer (Node 24 LTS recommended).

1. Run `npm ci`.
2. Copy `.env.example` to `.env` and set a random `SESSION_SECRET`, your MongoDB connection URI, and an OMDb API key.
3. Run `npm start`. The default address is http://localhost:3000.

Google sign-in is optional. Configure both `CLIENT_ID` and `CLIENT_SECRET`, and register `GOOGLE_CALLBACK_URL` in your Google OAuth application. For an existing deployment, set that URL to its existing `/auth/google/secrets` endpoint. Local username/password sign-in works without Google credentials.

`MONGO_USER` and `MONGO_PWD` remain supported for the original Atlas cluster when `MONGODB_URI` is absent. Startup now waits for MongoDB and reports connection failures. Existing collections, password hashes, and list fields retain their formats. Set `SESSION_SECRET` explicitly; the old hardcoded session secret has been removed and existing sessions will require a new login.

## Validation

- `npm test`: HTTP integration checks for rendering, login/logout, sessions, registration, protected submissions, and errors, plus real password-plugin hashing/validation. Database and OMDb calls are substituted; no credentials are required.
- `npm run check`: JavaScript syntax validation.
- `npm audit`: dependency vulnerability check.

Live MongoDB, Google OAuth, and OMDb integration still require configured services. The default express-session memory store is suitable for local use; deployed instances should configure a persistent session store.

## Dependency migration

Versions were checked against the npm registry's `latest` tag on 2026-11-11 and retained dependencies are pinned exactly. `package-lock.json` records the complete tree.

| Original package | Registry latest | Result |
| --- | --- | --- |
| body-parser | 2.4.0 | Replaced by Express's built-in urlencoded parser |
| dotenv | 18.0.10 | Updated |
| ejs | 7.0.2 | Updated |
| express | 5.3.0 | Updated; async route errors reach error middleware |
| express-session | 1.19.0 | Updated |
| mongoose | 9.12.1 | Updated; promise APIs and current connection options |
| mongoose-encryption | 2.1.2 | Removed; never used by this application |
| mongoose-findorcreate | 4.0.0 | Replaced by native promise-based model operations |
| passport | 0.7.0 | Updated; callback logout and direct local authentication |
| passport-google-oauth20 | 2.0.0 | Already latest; Google lookup uses stable profile ID |
| passport-local | 1.0.0 | Already latest |
| passport-local-mongoose | 9.2.1 | Updated; default export and promise registration |
| request | 2.88.2 (deprecated) | Replaced by native fetch with HTTPS, encoded parameters and timeout |

The unused, undeclared Lodash import was removed. Frontend CDN assets now use Bootstrap 5.3.9 and Font Awesome 7.3.1. Templates use Bootstrap 5 utilities and collapse attributes; its bundle replaces the old jQuery and Popper script dependencies. Stylesheet paths are absolute so nested list URLs load them correctly.

Release and migration references: [npm registry](https://registry.npmjs.org/), [Express 5](https://expressjs.com/en/guide/migrating-5/), [Mongoose 9](https://mongoosejs.com/docs/migrating_to_9.html), [Passport Local Mongoose](https://github.com/saintedlama/passport-local-mongoose), [Bootstrap 5](https://getbootstrap.com/docs/5.3/migration/).
