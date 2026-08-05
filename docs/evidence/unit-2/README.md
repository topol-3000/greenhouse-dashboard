# Unit 2 browser evidence

Screenshots of the migrated screens, produced by `e2e/appearance-evidence.spec.ts`
against the real production bundle and the browser fixtures. Regenerate them
with:

```bash
docker compose run --rm e2e
```

They are review evidence, not assertions. The spec asserts that each screen
renders and does not scroll sideways; nothing compares pixels, so a deliberate
design change does not break a test.

Each screen appears as `<screen>-<viewport>-<appearance>.png`, where the
viewports are `desktop` (1440×900) and `narrow` (390×844), and the appearance is
`light` or `dark`:

| Screen                 | What it shows                                                          |
| ---------------------- | ---------------------------------------------------------------------- |
| `dashboard`            | the purpose card, cloud API availability and the API's topology counts |
| `greenhouses`          | the site cards and the facilities inside each one                      |
| `facility`             | facility details beside its control zones                              |
| `control-zone`         | zone details, point composition, monitoring and manual control         |
| `activity`             | the filters and one control zone's command window                      |
| `command-confirmation` | the manual-command confirmation dialog over the control-zone workspace |
