# Pre-launch security checklist (Daghta)

Agreed on 2026-11-01: do all of these before launch. Based on a Supabase security-advisor scan of project `ztnbyvfupadzhddnbdje` that day.

## Already in place (verified 2026-11-01)
- RLS enabled on all 18 public tables, each with policies.
- 37 of 39 SECURITY DEFINER functions check the caller inside. The two without a check, `ad_event` and `shop_pay_options`, are covered in item 1.
- `card_payment_result` only accepts the service role.
- `confirm_receipt` locks for 15 minutes after 5 wrong codes.
- Contacts hidden until an order exists.

## Fix in the database (about 1 day)
- [ ] 1. Revoke `EXECUTE` from `anon` on every function that needs a signed-in user (26 flagged by the advisor, lint 0028). Keep public only what is meant to be public (e.g. `shop_cards`, `shop_pay_options`). Fix `ad_event` so views/clicks can't be faked (require a session and/or rate limit).
- [ ] 2. Enable leaked-password protection in Supabase Auth; set minimum password length to 8.
- [ ] 3. Rotate keys used during development (service_role, Anthropic, Paymob); store only in Bitwarden + Supabase secrets.
- [ ] 4. Storage buckets: images only, max ~5 MB per file.
- [ ] 5. Per-user daily cap on new requests (e.g. 20/day) to stop spam.

## Accounts and settings
- [ ] 6. Two-step login (MFA) for every partner on Supabase, GitHub, Apple, Google Play, Cloudflare, Google Workspace, Paymob.
- [ ] 7. Admin/staff access limited to named personal accounts; no shared passwords.
- [ ] 8. GitHub: branch protection (review before merge) + Dependabot alerts.
- [ ] 9. Domain: registrar lock + DNSSEC on Cloudflare.

## Paid tools (see Daghta-Cost-Quotation.pdf)
- [ ] 10. Cloudflare Pro WAF ($20/mo)
- [ ] 11. Sentry Team ($29/mo)
- [ ] 12. Supabase PITR 7 days ($100/mo); daily backups already included
- [ ] 13. Bitwarden Teams ($20/mo)

## Legal / process
- [ ] 14. PDPC (data protection centre) licence + appoint a data protection officer.
- [ ] 15. Written breach procedure: who notifies within 72 hours, how users are told.

## Later
- [ ] 16. External penetration test: ~6 months after launch, or before enabling card payments.

After finishing: re-run the Supabase security advisor and confirm zero warnings.
