# NABARD Pavilion Quiz — Global Fintech Festival 2026

A kiosk quiz and feedback application for the NABARD pavilion. Runs entirely on
one machine on the stall. No internet, no QR codes, no external services, and no
npm packages to install.

---

## Running it

You need Node.js 18 or newer. Nothing else.

```
cd nabard-quiz
npm start
```

Or equivalently `node server.js`. The console prints the address, by default
`http://localhost:8080`. To use a different port:

```
PORT=3000 node server.js
```

On first run the app creates a `data/` folder, loads 50 NABARD questions, 3
feedback questions and 3 placeholder wallpapers, and is immediately usable.

---

## Three terminals

One machine runs the server. The other terminals are browsers pointing at it.

1. Put all machines on the same local network, ideally a dedicated router or a
   phone hotspot rather than venue Wi-Fi.
2. Find the server machine's local IP (`ipconfig` on Windows, `ifconfig` or
   `ip addr` on Mac and Linux). It looks like `192.168.1.20`.
3. On each terminal open `http://192.168.1.20:8080`.

The server machine can also be one of the three terminals. Concurrency has been
tested at 3 terminals running continuously with no lost records.

---

## First use

The launcher offers two buttons.

**Display** asks for the 6-digit code `120782`, then puts that terminal into
participant mode. It stays in participant mode through every participant until
someone taps the settings gear, so staff enter the code once per session, not
once per visitor. Wrong codes are throttled after 5 tries.

**Admin** opens the sign-in screen.

| Account | Password | OTP for password changes |
|---|---|---|
| `admin` | `fintech-festival-nabard` | `1982` |
| `xadmin` | `fintech-festival-xadmin` | `0003` |

`xadmin` is the superuser account. Both accounts can manage questions, settings,
branding, reports and their own password. Only `xadmin` additionally sees a
"Super user tools" card under Security, which can overwrite admin's password
outright and restore the display code to its default — the recovery path for
when admin is locked out and doesn't remember their own password or OTP.
`admin` has no equivalent power over `xadmin`.

**Change both passwords and the display code before the event.** Anyone who has
read this file can otherwise sign in.

These credentials are deliberately not shown anywhere in the application. Every
password field has an eye icon so you can check what you have typed before
signing in.

If you are locked out, stop the server and run either of these:

```
node server.js --reset-admin
node server.js --set-password admin "your new password"
```

The first restores both passwords to the values above. The second sets whatever
you choose for one account, which is the quickest way out if a keyboard is
mangling the hyphens. Both leave your questions, settings and recorded data
untouched. Both need shell access to the server machine.

**If admin is locked out and someone is already signed in as xadmin, no shell
access is needed.** Sign in as xadmin, open Security, and use the "Super user
tools" card: enter a new password for admin, plus xadmin's own password and
OTP to confirm. This immediately overwrites admin's password and signs admin
out of any device where they were still logged in. The same card can restore
the display code to `120782` in one click if that has been changed and
forgotten. Neither action needs admin's current password, current OTP, or
knowledge of what they were — that's the point of a superuser account. Because
of that power, xadmin's own password and OTP deserve more care than admin's;
whoever holds them can reset everything else.

Leading and trailing spaces are ignored on passwords and OTPs, and dashes typed
as en dashes or "smart" dashes by a phone or tablet keyboard are treated as
ordinary hyphens. This matters because the default passwords contain hyphens and
mobile keyboards frequently substitute them.

---

## Exiting mid-quiz

A quiet × icon sits at the top-left of the quiz screen. Tapping it asks for
confirmation before returning to home, warning that progress will be lost.
Exiting never creates a quiz-attempt record — only a completed and submitted
quiz counts toward the pass rate and reports.

## Admin panel

- **Reports** — attempts today and overall, pass rate, average score and time,
  attempts by hour, question difficulty, feedback averages, recent activity log,
  CSV downloads for attempts, feedback, question analytics and the access log,
  and a **Reset data** control that permanently clears recorded quiz attempts and
  feedback responses (separately or together) once you confirm your password.
  The question bank, settings, wallpapers and logo are untouched by a reset.
  Nothing is prefilled with sample data — a fresh install starts at zero and
  every number you see reflects real activity on your terminals.
- **Questions** — add, edit, delete and search. Unchecking "include this question
  in the draw" removes it from play while keeping its history intact, which is
  safer mid-event than deleting.
- **Feedback** — add, edit, delete and hide the star-rating questions.
- **Branding** — upload the NABARD logo once; it then appears on the launcher,
  home screen, quiz header and results. Also manage wallpapers and the cycling
  interval.
- **Settings** — questions per attempt, pass threshold, idle reset, thank-you
  duration, and all on-screen wording including the congratulatory message.
- **Security** — change your own password (requires current password plus your
  OTP) and change the 6-digit display code.

Terminals pick up setting changes when they next return to the home screen.

---

## Kiosk hardening

The app already blocks right-click, pinch-zoom, double-tap zoom and text
selection, and resets to home after 60 seconds of inactivity. For a proper kiosk
also lock the device at the operating-system level:

- **Android tablet** — Chrome, then Settings > Screen pinning, or a kiosk launcher app.
- **iPad** — Settings > Accessibility > Guided Access, then triple-click to lock.
- **Windows** — Edge or Chrome started with `--kiosk http://SERVER:8080`.

Disable sleep and screen timeout on every terminal.

---

## Data and backup

Everything lives in `data/`:

| File | Contents |
|---|---|
| `config.json` | Questions, settings, wallpapers, logo, password hashes |
| `attempts.jsonl` | One line per completed quiz attempt |
| `feedback.jsonl` | One line per feedback submission |
| `audit.jsonl` | Sign-ins, failed attempts, configuration changes |
| `uploads/` | Logo and wallpaper image files |

Copy the whole `data/` folder to a USB stick at the end of each day. Restoring is
just putting the folder back.

Passwords are stored as scrypt hashes with per-user salts, never in plain text.
No participant names, phone numbers or personal data are collected at any point,
so there is nothing personally identifiable to protect in the exports.

---

## Points to check before the event

**Verify the question bank.** The 50 preloaded questions are drawn from public
information about NABARD and the widely documented ones have been checked, but
they have not been reviewed by NABARD. Someone from the team should read through
all 50 in the admin panel and correct or deactivate anything off. Figures that
change year to year, such as current fund corpus amounts and office holders, were
deliberately excluded.

**Reconsider the pass threshold.** The default is 8 correct out of 10, as
specified. Against a general festival audience this will produce a low pass rate
and very few gifts given out. If you want most engaged visitors to win, 6 out of
10 is a more realistic setting. The admin panel warns when the threshold is 80%
or higher. Change it in Settings; no code change needed.

**The OTP is a fixed code, not an SMS.** With no mobile network in the design,
`1982` and `0003` act as a second static password each. Anyone who knows an
account's password and OTP can change that password — and anyone who knows
xadmin's can also overwrite admin's password without needing admin's details
at all. Keep both pairs separate from each other and don't write them on the
same card.

**Decide who holds xadmin.** It's the account with recovery power over the
other, so give it to whoever is ultimately responsible at the stall — a lead
or supervisor — and keep `admin` for day-to-day use by staff on shift. If
everyone has both sets of credentials, the separation buys you nothing.

**Restarting the server mid-quiz** loses any attempts that are in progress at
that moment. Completed attempts are already written to disk and are never at
risk. Avoid restarting during opening hours.

---

## Verifying the build

```
node server.js          # in one terminal
node test.js            # in another
```

86 checks cover scoring, randomisation, the admin API, password and OTP rules,
rate limiting, path traversal and CSV export.
