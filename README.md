# Setwise

Setwise is a free personal strength-training app: plan routines, log sets as you lift, review workout history, and track strength and body metrics. Optional donations may support its upkeep, but never unlock features. It is a static web app, so GitHub Pages can host it without a server or paid service.

## Live app

https://rdzoagbe.github.io/setwise-workout/

## Run it

Open `index.html` in a modern browser for a desktop preview. Open `phone-preview.html` to see the live app inside an approximate Galaxy-sized phone frame; the frame is illustrative, not an official Samsung hardware measurement. For phone installation, host the folder at an HTTPS address such as GitHub Pages, then open that link in Chrome or Samsung Internet and choose **Install app** or **Add to Home screen**. iPhone and iPad users can use Safari Share → **Add to Home Screen**. A downloaded `file://` copy is only a preview: browsers require HTTPS (or localhost) for service workers and PWA installation.

## Install on a phone

The manifest includes app icons and standalone display settings. After the first HTTPS visit, the service worker caches Setwise's app shell and bundled assets so the logger can reopen offline. Workout records stay local to that browser/device; export a backup before moving to another phone. Bundled guides for 49 built-in exercises work offline. Additional RepDB catalog illustrations need an internet connection.

## Publish with GitHub Pages

1. Create a GitHub repository and add the contents of this folder at the repository root.
2. In **Settings → Pages**, choose **GitHub Actions** as the build and deployment source.
3. Push to the `main` branch. The included workflow deploys the app to GitHub Pages.

The app does not need a build step, API key, database, or account. The workflow deploys the static files as-is.

## Privacy and backups

Workout history, routines, preferences, and body measurements are stored in this browser's local storage. Your training log is not uploaded to GitHub or sent to a server. When online, the app requests exercise records and images from RepDB; the RepDB library is loaded into memory and is not re-published as a bundled dataset. Those requests do not include your workout history. Each browser/device has its own data. Use **Settings & backup → Export backup** regularly to save a JSON copy, and import that file on another device to restore it.

Anyone can see the source code in a public repository. Your personal training data is not part of the repository unless you manually add an exported backup.

## What is included

- 52 bundled exercises available offline, plus a searchable illustrated RepDB strength catalog when online
- Build editable 2-, 3-, or 4-day routine templates by goal, experience, and equipment
- Active-workout cards autoplay matching Vital Animations MP4 demos with form cues. Settings lets you choose the demo character; the supplied female clips cover Hack Squat, V-Up, and Smith Machine Bent-Over Row. Other movements use the available illustrated guide until matching female footage is added.
- Editable routines and custom exercises, including saving an active workout as a reusable routine
- Edit saved sessions, log timed holds in seconds, and set a weekly session target
- Persistent workout logging with warm-up and working sets, reps or hold time, load, RPE, notes, previous-session reference, and rest timer
- Session history, weekly volume, estimated one-rep max trends, and personal records
- Body weight and measurement tracking
- One-rep-max and plate-loading calculators
- Metric/imperial display preference
- Local JSON backup and restore
- Responsive layout and offline app shell; the 19 bundled video demos are local assets, while RepDB illustrations for movements without a local clip require an internet connection

## Exercise visual credits

Sixteen matched clips from the [Vital Animations Free Pack](https://vitalanimations.com/free-pack) and three female sample clips supplied in its archive are bundled for use in Setwise. The [Vital Animations terms](https://vitalanimations.com/terms) allow hosting or bundling assets within an app and prohibit redistribution as a standalone asset library. Female sample clips currently cover Hack Squat, V-Up, and Smith Machine Bent-Over Row; they are not full male/female pairs for the exercise catalog.

## RepDB illustration credits

[Exercise data by RepDB (repdb.co)](https://repdb.co) is used in-app under its [free-tier license](https://github.com/RepDB/exercise-dataset/blob/main/LICENSE-DATA.md). The free catalog provides start/peak illustrations rather than motion clips; Setwise crossfades matching pairs to create a simple looping pose preview. Guides for 49 built-in exercises are bundled inside the app; additional catalog illustrations need internet.


Setwise is an independent project inspired by common workout-tracker workflows. It is not affiliated with Lyfta or any other fitness service.






The app now bundles RepDB position guides for 49 built-in exercises, including bench press. These two-pose illustrations work offline and are distinct from the 19 supplied video clips. The standalone phone preview embeds both the bundled illustrations and compact videos. Additional online catalog illustrations still require internet. Exercise data by RepDB (https://repdb.co), used inside Setwise under the free-tier license.
