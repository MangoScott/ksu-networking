# Resume Connect · Kent State Department of Finance

A simple landing page where Kent State finance students upload a resume and
choose Department of Finance Advisory Board members they'd like a review from.
Staff see every request, with the resume attached, on a token-protected admin page.

## Run it

```bash
npm install
ADMIN_TOKEN=pick-a-long-random-string npm start
```

Then open <http://localhost:3000>. The admin view is at
`http://localhost:3000/admin?token=<your ADMIN_TOKEN>`. If `ADMIN_TOKEN` is
unset the admin page is disabled.

`npm run dev` restarts the server automatically when files change.

## Update the board roster

Edit `data/board-members.json`. Each entry looks like:

```json
{
  "id": "jane-doe",
  "name": "Jane Doe",
  "title": "Managing Director, Investment Banking",
  "company": "Example Capital Partners",
  "focus": ["Investment Banking", "M&A"],
  "bio": "One or two sentences students will see on the card.",
  "email": "jane.doe@example.com"
}
```

The `id` must be unique and URL-safe. The `email` field is only ever shown on
the admin page; it is never sent to the public site. The shipped roster is
placeholder data, so replace it with the real board before launching.

## What students experience

1. Read a short pitch and how-it-works section.
2. Pick up to three board members from the cards, each tagged with their focus areas.
3. Fill in name, `@kent.edu` email, program, graduation date, and an optional note.
4. Attach a resume (PDF or Word, 5 MB max) and submit.

Validation runs in the browser and again on the server.

## Where submissions go

- Resume files are written to `uploads/` under a random filename.
- Request metadata is appended to `data/submissions.json`.
- Both locations are git-ignored.

Staff download resumes from the admin page, then forward each request to the
selected board members by email.

## Configuration

| Variable      | Default | Purpose                                   |
| ------------- | ------- | ----------------------------------------- |
| `PORT`        | `3000`  | HTTP port                                 |
| `ADMIN_TOKEN` | unset   | Enables `/admin` and the admin API        |

## Deploying

Any host that runs Node 18+ with a persistent disk works (Render, Railway,
Fly.io, a campus VM). Set `ADMIN_TOKEN`, make sure `uploads/` and `data/`
persist across restarts, and put the app behind HTTPS so resumes and tokens
are encrypted in transit.

## Possible next steps

- Email the department and selected board members on each new request
  (Nodemailer, SendGrid, or the campus SMTP relay).
- Mark requests as "introduced" or "closed" from the admin page.
- Store files in S3 or similar instead of local disk for multi-instance hosting.
