# 2. Release publicly under the MIT License

Date: 2026-06-05

## Status

Accepted

## Context

The OmniFocus ↔ Reclaim.ai Sync plugin is being released publicly on GitHub
(`Integral-Productivity/omnifocus-reclaim-sync`). Until a license is declared, the
repository is "all rights reserved" by default copyright law — being public lets
people read the code but grants no legal right to use, modify, or redistribute it.

Constraints and relevant facts:

- The plugin bundles **no third-party code** — every source file is hand-written
  OmniAutomation JavaScript with no vendored libraries and no `package.json`. There
  are therefore no inbound license obligations forcing a particular choice (e.g. no
  copyleft inheritance).
- The plugin integrates with the Reclaim.ai API and the OmniFocus platform. Both
  names are third-party trademarks; trademark usage is governed separately from the
  copyright license on our own code.
- Because the plugin writes to users' calendars and task data, an explicit
  warranty/liability disclaimer is desirable.
- The intent for release is "use it freely, no strings" — others should be able to
  use, modify, fork, and even build commercial products on it, asking only that the
  copyright notice be retained.

## Decision

Release the plugin under the **MIT License**, with the copyright line
`Copyright (c) 2026 Integral Productivity LLC`.

Implementation:

- Add an MIT `LICENSE` file at the repository root.
- Reference the license explicitly in `README.md`.
- Add `SPDX-License-Identifier: MIT` headers to each source file.

MIT was chosen over Apache-2.0 (which adds an explicit patent grant and contribution
terms — unnecessary for a single-author plugin with no patent exposure) and over
GPL-3.0 (copyleft — rejected because the stated intent is permissive, no-strings
reuse including closed-source and commercial forks).

## Consequences

- Anyone may use, modify, distribute, and commercialize the plugin provided the
  copyright notice and license text are retained.
- The README's previously dangling "See license file for details" reference now
  resolves to a real file.
- The MIT "AS IS" clause disclaims warranty and liability, which is appropriate given
  the plugin mutates calendar and task data.
- The permissive grant is effectively irreversible for already-published versions:
  code released under MIT stays usable under MIT even if the license is later changed
  for future versions.
- Trademark considerations for "Reclaim.ai" and "OmniFocus" are out of scope for this
  decision and would need separate treatment if the project is ever rebranded or
  redistributed under those names.
