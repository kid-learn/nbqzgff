# On-device demo

`nabard-quiz-demo.html` is the complete portal in a single file. Open it in any
browser — phone, tablet or laptop — with no server, no install and no internet.

Its screens, styles and client code are built from the same production files as
the deployable app, so what you see is what will ship. Only the network layer is
swapped for an in-memory stand-in.

## Try it

Credentials are the ones listed in the main README. They are no longer displayed
anywhere in the interface.

Reach the admin portal from the Admin button on the launcher, or the settings
gear at the top right of the home screen.

The demo starts genuinely empty, exactly like a fresh install — zero attempts,
zero feedback, nothing in the activity log. Take a quiz or two yourself and the
Reports tab fills in with real numbers as you go: pass rate, average score, the
hourly chart, question difficulty, feedback averages. The Reports tab also has
a **Reset data** control if you want to clear what you have generated and start
over without reloading the page. CSV downloads work. Uploading a logo under
Branding updates every kiosk screen immediately — the clearest way to check
that change.

While taking the quiz, the × icon at the top-left lets you back out to the home
screen with a warning that progress will be lost — worth trying to confirm an
exit never counts as a completed attempt in the reports.

Sign in as `xadmin` specifically to see the "Super user tools" card under
Security — it only appears for that account. It can overwrite admin's password
outright and restore the display code to its default, without needing admin's
own password or OTP. Signing in as `admin` instead, the card is absent.

## What differs from the real app

- All data is held in memory. Refreshing the page or tapping **Reset demo**
  returns everything to its starting state; nothing is written to disk.
- Scoring happens in the browser. In the real app it happens on the server, so
  the answer key never reaches the device.
- Rate limiting on wrong codes and passwords is not simulated.
- Because everything runs in the browser, the demo's account details sit in the
  page source. The real server never sends passwords to a device; it stores
  scrypt hashes on disk and compares them server-side.
- The three wallpapers are generated placeholders, as in a fresh install.
