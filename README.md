# StudioSpace Backend

Express + MongoDB API for the StudioSpace client. Authentication is provided by Better Auth; protected routes accept either an `Authorization: Bearer <jwt>` header or the HTTP-only `studio_jwt` cookie set by `POST /auth/session`.

## Setup

```bash
npm install
cp .env.example .env # if present, otherwise create .env
npm start
```

Environment variables:

```env
PORT=5001
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=http://localhost:3000
```

The API listens on `http://localhost:5001` by default.

## Routes

| Method | Route | Auth | Purpose |
|---|---|---|---|
| GET | `/studios` | Public | List all studios |
| GET | `/studios/featured` | Public | Top-rated studios |
| GET | `/studios/:id` | Public | Studio details |
| POST | `/add-studio`, `/api/studios` | Required | Create a listing |
| PUT | `/studios/:id`, `/api/studios/:id` | Owner | Update a listing |
| DELETE | `/delete-studio/:id`, `/api/studios/:id` | Owner | Delete a listing |
| POST | `/studios/:id/reviews`, `/api/studios/:id/reviews` | Required | Add a review and update the rating |
| POST | `/bookings`, `/api/bookings` | Required | Create a pending booking |
| GET | `/my-bookings/:email` | Required | List the signed-in user's bookings |
| DELETE | `/my-booking/:id` | Owner | Soft-cancel a pending booking |
| POST | `/auth/session` | Required | Exchange a Bearer JWT for the HTTP-only cookie |
| POST | `/auth/logout` | Public | Clear the auth cookie |

New bookings start as `pending`. Cancelling sets the status to `cancelled` and keeps the record for history; cancelled bookings do not block future time slots.
