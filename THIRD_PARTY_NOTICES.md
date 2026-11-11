# Exercise media

Exercise data by [RepDB (repdb.co)](https://repdb.co), used inside Setwise under the [free-tier data license](https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md). The bundled guides are part of this app and are not offered as a standalone dataset.

That licence permits in-app use only and forbids republishing the dataset "as a dataset, dataset repository, or API". So the RepDB records and images are **not committed to this repository**. `tools/build-guides.mjs` fetches them at build time into `bundled-guides.js` and `assets/guides/`, both of which are gitignored and exist only in the deployed application. The manifest at `tools/guide-manifest.json` holds Setwise's own exercise-name matching table, not RepDB content.

Exercise videos by [Vital Animations](https://vitalanimations.com/free-pack), from the user-supplied free pack and female sample files. Use is subject to the [Vital Animations terms](https://vitalanimations.com/terms). The app uses compact copies for phone playback. No general repository license grants rights to these third-party assets.

# Webfonts

Setwise self-hosts three typefaces from `assets/fonts/`, all under the SIL Open Font License 1.1. Full licence texts are in that folder.

- **DM Sans** — Copyright 2014 The DM Sans Project Authors (`OFL-DM-Sans.txt`)
- **DM Mono** — Copyright 2020 The DM Mono Project Authors (`OFL-DM-Mono.txt`)
- **Manrope** — Copyright 2018 The Manrope Project Authors (`OFL-Manrope.txt`)

They are served from this origin rather than the Google Fonts CDN on purpose. A 2022 Landgericht München ruling held that passing a visitor's IP address to Google without consent breached the GDPR, and Setwise's premise is that nothing about a user leaves their device. Self-hosting also means the typography works offline, which a CDN cannot do.
