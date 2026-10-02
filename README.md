# Finance Super Week · Resume Connect

A simple sign-up site for a Kent State Department of Finance "super week" of
one-on-one resume reviews.

- **Board members** post the times they're free.
- **Students** tap an open time, attach a resume and LinkedIn, and they're booked.
- **Board members** see who booked them, with the resume and LinkedIn ready to open during the call.
- **Department staff** see every booking on one admin page.

No accounts, no passwords for students. Board members use one shared access code.

## Run it

```bash
npm install
BOARD_CODE=share-this-with-the-board ADMIN_TOKEN=keep-this-private npm start
```

Then open:

| Who           | URL                                              |
| ------------- | ------------------------------------------------ |
| Students      | <http://localhost:3000>                          |
| Board members | <http://localhost:3000/board> (enter `BOARD_CODE`) |
| Department    | `http://localhost:3000/admin?token=<ADMIN_TOKEN>` |

`npm run seed` fills in sample availability so the student page isn't empty
while you're trying it out. Delete `data/slots.json` to start clean.
`npm run dev` restarts the server when files change.

## Set up the event

1. **Event details** live in `data/event.json`: name, dates, tagline, call
   format, and the timezone label shown next to times.
2. **Board roster** lives in `data/board-members.json`. Each entry:

   ```json
   {
     "id": "jane-doe",
     "name": "Jane Doe",
     "title": "Managing Director, Investment Banking",
     "company": "Example Capital Partners",
     "focus": ["Investment Banking", "M&A"],
     "bio": "One or two sentences students see on the card.",
     "linkedin": "https://www.linkedin.com/in/jane-doe",
     "email": "jane.doe@example.com"
   }
   ```

   `id` must be unique and URL-safe. `linkedin` is shown publicly on the
   card. `email` is only ever shown on the admin page. The shipped roster is
   placeholder data, so replace it before launch.
3. Send board members the `/board` link and the access code. They pick their
   name, choose a date and a window (for example 1:00 to 3:00 PM in 20-minute
   slots), and click **Add times**. Students see the new times immediately.

## How booking works

- Each slot can be claimed once. If two students click the same time, the
  second one is told it was just taken and the list refreshes.
- A student can book at most one time per board member, but may book
  different board members.
- Students must use an `@kent.edu` email.
- Resumes must be PDF or Word, 5 MB max. LinkedIn is optional but encouraged.
- Board members can remove an open time, but not one a student has already
  booked. Staff handle those by email.

## Where the data goes

| Path                        | Contents                                    |
| --------------------------- | ------------------------------------------- |
| `uploads/`                  | Resume files under random names             |
| `data/slots.json`           | Availability, including which are booked    |
| `data/bookings.json`        | Student details and resume references       |

All three are git-ignored. Back them up or put them on a persistent disk.

## Configuration

| Variable      | Default | Purpose                                             |
| ------------- | ------- | --------------------------------------------------- |
| `PORT`        | `3000`  | HTTP port                                           |
| `BOARD_CODE`  | unset   | Shared code for `/board`; unset disables it         |
| `ADMIN_TOKEN` | unset   | Token for `/admin`; unset disables it               |

The board code is shared, so any board member can download any student's
resume. That's fine for a small, trusted board. If you need per-member
access, give each member their own code in the roster and check it in
`requireBoard` in `server.js`.

## Deploying

Any host that runs Node 18+ with a persistent disk works (Render, Railway,
Fly.io, a campus VM). Set both environment variables, make sure `uploads/`
and `data/` survive restarts, and serve over HTTPS so resumes and codes are
encrypted in transit.

## Ideas for later

- Email the student and board member a confirmation with a calendar invite.
- Let board members paste a Zoom or Teams link that goes into the confirmation.
- Send a reminder the morning of each call.
- Move files to S3 or similar if you run more than one server instance.
