# Clear the Bill measurement

Status: form links are wired. This is not a launch. The 14-day clock has not started. No response has been submitted by this implementation. Do not promote from this change.

The page is a Rowfield Data research project. Clear the Bill is the working title. The chosen parent name is not formed and is intentionally absent from the public page and from this file. No personal name, address, phone, or birth date belongs here.

## What is connected

`config.js` holds two public links:

- `responderUrl`: the anyone-with-the-link form. Plain join uses this URL unchanged. It does not prefill a sample.
- `samplePrefillUrl`: the form UI's prefilled link with all four sample checkboxes checked. The page uses it only to learn checkbox field `entry.1405724595` and the exact option text. A visitor's link is rebuilt with only the samples they selected.

The official embed link, `viewform?embedded=true` on the same form id, is not loaded. The page navigates to the hosted form in a new tab. It does not iframe Google, and it does not POST to `formResponse`. Email and the required no-payment acknowledgement are left blank for the person to complete. This page cannot tell whether a response was stored.

Option text on the form, copied exactly:

- SAMPLE utility bill A: $40
- SAMPLE utility bill B: $65
- SAMPLE medical bill C: $90
- SAMPLE medical bill D: $120

The published form also asks for a required email ("Email for the research waitlist") and a required acknowledgement ("I understand these are fictional samples; no donation or bill payment will occur."). That acknowledgement is not a sample bill. A completed bundle is one or more of the four SAMPLE options above, not the acknowledgement by itself.

A read-only check of the public form, with no submit, showed that the two-bill link checks only SAMPLE utility bill A and SAMPLE utility bill B, leaves the email empty, and leaves the acknowledgement unchecked. The plain responder link does not precheck a sample. No response was submitted.

There is no editor URL in this folder. Do not add one. The supplied responder link uses `usp=publish-editor` on the public `viewform` address. That is the link visitors get. It is not an editor path.

## What counts

Count only rows in the private form responses. A click on this page does not count. Browser storage is not used and must not be added.

- Unique signup: one distinct email after trim and lowercase, excluding internal QA. A repeated email counts once. Skip a response with an empty email.
- Completed sample bundle: one non-test response with at least one sample checkbox checked. This is a response count, not a unique-email count.
- Internal QA: any submission made to check the form, including the first end-to-end check. Keep that exclusion list in the private account, not in git.

Both counts are unchanged by this repository change because no response was submitted here.

## Stopping rule

Start the 14 days only after the public page is verified on the live Pages URL and a real response path has been confirmed in the private form. Approval time and this pull request do not start the clock.

After those 14 days, park the test if unique non-test signups are fewer than 10, or if completed sample bundles are zero.

## Checks before any launch note

1. Do not merge until the page has been reviewed.
2. After merge, open `/clear-the-bill/` on the existing GitHub Pages site. Confirm the guides homepage, sitemap, and robots file are unchanged.
3. Select two sample bills. Confirm the SAMPLE total is the sum of those invented amounts.
4. Open "Review selected samples". Confirm only those boxes are checked, the email field is empty, and the no-payment acknowledgement is unchecked. Close the form without submitting, or submit one QA response and exclude that email.
5. Open the plain join link. Confirm no sample box is checked. Do not submit unless that response will be marked QA.
6. Record a launch timestamp only after that private-response check. Then, and not before, the 14-day clock can start.

Run `node --test clear-the-bill/bill-logic.test.js` from the repository root. The page script does not send email.
