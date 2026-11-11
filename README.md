# Madibeng Water & Power Watch

A community board for water cuts and power outages across Madibeng: Brits, Letlhabile, Hartbeespoort, Mothotlung and surrounds. Residents report what's happening in their area and section, and everyone sees the live status. Moderators post official notices from the municipality and Eskom, which take priority over residents' guesses.

Live site: https://simseco453-dot.github.io/madibeng-watch/

## How it works

- **Static site** on GitHub Pages: `index.html`, `style.css`, `app.js`.
- **Database:** Supabase (free tier). Setup and access rules are in `supabase/schema.sql`.
- **Areas and sections** live in `config.js`. Add real block, zone or extension names to an area's `sections` list. While a list is empty, residents can type their own section name.
- **Installable app:** `manifest.webmanifest`, `sw.js` and `icons/` let people add it to their home screen.

## Status rules

- The most recent report for each area, section and service in the last 24 hours sets its status.
- With no new report for 12 hours, a status is marked unconfirmed.
- Each phone can send one report every 30 seconds. The server sets the report time.
- Official notices show from 24 hours before they start until 6 hours after they end. When a notice has an end time, it replaces residents' estimates.

## Moderators

1. In Supabase: Authentication → Users → Add user (email + password, tick Auto Confirm).
2. In the SQL Editor: `insert into public.moderators (email) values ('their@email');`
3. They sign in at the bottom of the site (`#mod`).

This is a community board, not an official Madibeng Municipality or Eskom service.
