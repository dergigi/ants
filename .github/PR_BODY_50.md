This PR switches the NIP-05 verified icon to the regular `fa-id-badge`, polishes profile interactions, and simplifies the search `replacements` loader to support shorthands like `nip:05` without code changes.

- Use regular `fa-id-badge` for NIP-05 (keeps green styling)
- Avatar click searches by image filename
- Profile website/lightning: text triggers search; external-link icon opens externally
- Simplify `replacements`: parse generic `kind:key => expansion` and keep special-case for `site:` comma lists
- Expand NIPS mappings: add missing `01..99` and non-numeric (`B0`, `C0`, `EE`, `A0`, `C7`, `7D`)
