# DMC floss colour data: provenance and licensing

`floss_adrianj.csv` in this directory is the raw input. `src/data/dmc/dmc-floss.json`
is generated from it by `scripts/build-dmc-dataset.mjs` and must never be edited
by hand.

## Chain of custody

1. **Origin.** `floss_adrianj.csv` was published in
   [adrianj/CrossStitchCreator](https://github.com/adrianj/CrossStitchCreator)
   (`CrossStitchCreator/Resources/DMC ... .csv`). The `Row` column refers to the
   position of each colour on the printed DMC colour card, which strongly
   suggests the RGB values were transcribed from a DMC-published chart. That
   repository has no licence file.
2. **Cleaning.** [sharlagelfand/dmc](https://github.com/sharlagelfand/dmc)
   (MIT, © 2020 Sharla Gelfand) re-published the same CSV and documented, in
   `data-raw/floss.R`, six hex codes mangled by a spreadsheet and nine rows
   where the RGB triple disagreed with the hex; the maintainer chose the value
   that visually matched the floss. Our build script reproduces those exact
   corrections and the abbreviation expansion of colour names.
3. **This repository.** The build script emits one record per colour with
   `number`, `name`, `rgb`, `hex`, and `cardRow`. Lab / OKLab values are computed
   at load time from `rgb`, never stored, so a corrected RGB automatically
   corrects every derived value.

## What the numbers are and are not

* They are **screen approximations** of dyed cotton. Thread is not a flat
  colour: it has sheen, a twist, and looks different under warm versus daylight
  illumination. Treat every match as a suggestion to check against a physical
  card.
* The set is the **454-colour 2017-era range**. The 35 colours DMC added in 2017
  (numbers 01–35) and later additions are **not present**. They should be added
  when a trustworthy source with RGB values is found; the JSON format already
  supports it.
* `310` is stored as pure black (`#000000`) as upstream does. Real 310 floss
  photographs as a very dark warm grey. The engine compensates only by
  matching in a perceptual space; the swatch on screen is still pure black.
* Colour **names** are DMC's trade names as reproduced upstream. `DMC` is a
  trademark of DMC SAS. The names are used here to identify the product for
  the artist's shopping list, which is the customary use.

## Licensing position

The raw CSV is factual data (a list of product numbers and their measured
approximate colours) with negligible creative expression, republished under MIT
by sharlagelfand/dmc. We keep the MIT attribution for the cleaning work and
treat the underlying facts as unprotected data. If DMC or the original
transcriber publishes an authoritative chart under clear terms, replace this
file and rerun the build; nothing else in the codebase needs to change.

## Replacing or extending the dataset

* Put a new CSV with the same header in this directory, or add another thread
  library (Anchor, Madeira) as a sibling folder with its own build script and
  `library` id. The engine consumes `ThreadLibrary` objects and does not know
  about DMC specifically outside `src/engine/threads/dmc.ts`.
