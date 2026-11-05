# Announcements API

A small announcements board with a backend you can explore directly in Swagger. Anyone can browse listings. Once you register, you can publish an announcement, add a photo, and update or remove your own listings.

This project continues [announcements-api](https://github.com/SwissLana/announcements-api) with image uploads, security headers, browser access rules, request limits, and structured logs. It uses Express 5, TypeScript, PostgreSQL, Prisma, and Cloudinary, building on the [course boilerplate](https://github.com/BetterED-Neoversity/Boilerplate-REST-API-Nodejs).

## Start here

You need **Node.js 22.12 or newer**, npm, and Docker Desktop. Start Docker before running the database or tests.

### 1. Install and configure

Open a terminal in this project folder:

```bash
npm ci
cp .env.example .env
```

Generate a signing secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Paste the result into `JWT_SECRET` in `.env`. Keep this file private. The example database settings are for local development. This work uses PostgreSQL port 5433. Keep POSTGRES_PORT and the port in DATABASE_URL consistent.

`ALLOWED_ORIGINS` lists the browser applications allowed to call the API, separated by commas. For local use:

```dotenv
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

Use complete origins without a trailing slash. Requests without an Origin header, such as ordinary curl requests, are accepted; authentication still applies.

### 2. Start the database and apply migrations

```bash
docker compose up -d --wait
npm run prisma:deploy
npm run prisma:generate
npm run dev
```

Open [Swagger UI](http://localhost:3000/api-docs/) to try the API. The OpenAPI document is available at `/openapi.json`.

Already have PostgreSQL? Set `DATABASE_URL` to your database and skip the Docker command. Existing work databases should receive the new migration rather than be reset. The migration adds optional image URLs and converts prices to two decimal places, rounding any existing extra precision.

### 3. Try your first announcement

In Swagger:

1. Expand **POST /auth/register**, choose **Try it out**, and enter your details.
2. Copy the returned `accessToken`.
3. Click **Authorize**, paste the token without the word `Bearer`, and close the dialog.
4. Open **POST /announcements**, enter a title, description, positive price, and category, then execute.
5. Use **GET /announcements** to see the result.

Keep the returned refresh token if you want to renew your access later. Access tokens last 15 minutes; refresh tokens last seven days. Refresh returns a new pair: always replace the old pair with the new one.

## Add a photo with Cloudinary

Create a Cloudinary account and open its API credentials page. Copy these values into your local `.env`:

```dotenv
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Restart the server after changing environment variables.

Choose `multipart/form-data` in Swagger for POST or PATCH announcements. The file field is named **image**. Photos are optional; ordinary JSON requests continue to work.

```bash
curl http://localhost:3000/announcements \
  -H 'Authorization: Bearer YOUR_ACCESS_TOKEN' \
  -F 'title=Bicycle for sale' \
  -F 'description=Mountain bike in excellent condition' \
  -F 'price=250.50' \
  -F 'category=sale' \
  -F 'image=@/absolute/path/bicycle.jpg'
```

Use JPEG, PNG, or WebP, up to 5 MB. The server checks the file contents as well as its declared type. Multer saves a temporary file in `uploads/`; the server uploads it to Cloudinary, stores its HTTPS URL, and removes the local copy. Uploaded files are not served from the local directory.

Without Cloudinary credentials, browsing and requests without images work normally. Upload attempts return a clear 503 error. A successful live upload needs a configured account; automated tests do not require real credentials.

## What you can do

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create an account and receive tokens |
| POST | `/auth/login` | Sign in and receive tokens |
| POST | `/auth/refresh` | Exchange a refresh token for a new pair |
| POST | `/auth/logout` | Revoke the current user's refresh token |
| GET | `/auth/me` | Read your profile |
| GET | `/announcements` | Browse, search, and sort |
| GET | `/announcements/:id` | Read one announcement |
| POST | `/announcements` | Publish an announcement, optionally with a photo |
| PATCH | `/announcements/:id` | Update your own announcement |
| DELETE | `/announcements/:id` | Delete your own announcement |

Browsing is public. Creating requires an access token; updating and deleting also require ownership. IDs and authors are assigned by the server.

### Finding a listing

```text
GET /announcements?search=bicycle&sort=newest&page=1
```

Search matches part of the title without case sensitivity. Sort accepts `newest` or `oldest`; each page holds 10 results. The response includes `data` and `pagination` with `total`, `page`, `totalPages`, and `perPage`. Empty searches return all listings; pages beyond the end return an empty array.

### Validation and useful errors

Usernames need 3 - 30 characters, names at least two, and passwords at least six. Passwords cannot exceed 72 UTF-8 bytes because of bcrypt's limit. Titles need 5 - 50 characters and descriptions at least ten. Categories are `sale`, `service`, `job`, or `other`.

Prices are positive, with at most two decimal places and a maximum of 9,999,999,999.99. PostgreSQL stores them as `Decimal(12,2)`; the API returns JSON numbers to preserve the existing client contract.

Validation errors use the same structure for body, query, parameters, and malformed JSON:

```json
{
  "error": "Validation failed",
  "details": [{ "field": "params.id", "message": "Enter a positive whole number" }]
}
```

Other errors use `{ "error": "A readable explanation" }`. Common statuses are 401 for authentication, 403 for denied access, 404 for missing records, 409 for duplicate accounts, 413 for oversized uploads, and 429 when the auth request limit is reached.

## Security and sessions

Helmet adds security headers. CORS rejects browser origins outside the configured list. Every auth route shares a limit of **10 requests per IP per 15 minutes**; announcement routes do not share that limit. The limiter uses process memory, so a multi-instance deployment would need a shared store.

Passwords are hashed with bcrypt. Access and refresh tokens have separate types, verified signatures, and unique IDs. Refresh rotation rejects reuse, including concurrent attempts. Following the original assignment's login contract, there is one refresh session per user: a new login replaces it. Logout revokes refresh tokens; existing access tokens expire naturally. Multiple-device sessions are a separate product decision, not currently supported.

Pino records HTTP requests and important account and announcement events. Request bodies, credentials, and authorization headers are not included in request logs. Logs are JSON, suitable for collection by hosting platforms.

## Working on the project

| Command | Use it to… |
| --- | --- |
| `npm run dev` | Work with automatic server restarts |
| `npm start` | Start without watch mode |
| `npm run typecheck` | Check TypeScript |
| `npm test` | Run integration tests in an isolated database |
| `npm run verify:live` | Check real Cloudinary uploads and cleanup using disposable data |
| `npm run prisma:deploy` | Apply existing migrations |
| `npm run prisma:migrate -- --name your_change` | Create a development migration |
| `npm run prisma:generate` | Regenerate Prisma Client |

Tests start their own PostgreSQL Docker container and remove it afterwards. They do not reset your application database. An optional `TEST_DB_ENGINE=pglite npm test` fallback is available, but native PostgreSQL is preferred for concurrency checks.

Routes connect middleware to controllers. Validators define accepted input. Controllers handle application operations, and services contain the Cloudinary integration. `app.ts` assembles the app; `server.ts` connects to the database and starts listening. Prisma schema changes belong in new migrations, never edits to an already applied migration.

## If something does not start

- **Database connection failed:** make sure Docker is running and check `docker compose ps` and `DATABASE_URL`.
- **Port 3000 is occupied:** stop your earlier server with Ctrl+C, or choose another `PORT` in `.env`.
- **Swagger is blank after moving the project:** stop and restart the server from its new folder. Check that Swagger JavaScript responses contain JavaScript rather than HTML.
- **429 while exploring authentication:** wait for the 15-minute window to finish. Every auth request counts, including profile and refresh requests.
- **Images fail:** verify all three Cloudinary settings and restart the server. A 502 means the remote upload failed.

To stop the local database while keeping its data, use `docker compose stop`.

## Current upload lifecycle

Temporary local files are cleaned up automatically. The server also requests deletion of old Cloudinary images when a listing is deleted or its image is replaced, and compensates for failed database writes after an upload. If remote deletion fails, it records the public asset ID in the logs for manual retry in Cloudinary. Automated upload tests replace the external service with a controlled test implementation. A real upload must be checked after configuring your account.
