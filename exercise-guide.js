(() => {
  const esc = s => String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const instructions = {
    squat: ["Set your feet and brace before the rep.", "Lower under control; let your knees track with your toes.", "Drive through the floor and stand tall without rushing."],
    hinge: ["Stand with the weight close and brace your midsection.", "Push your hips back while keeping the weight close to your legs.", "Drive the floor away and finish tall; avoid leaning back."],
    swing: ["Start with the kettlebell close and set a hip hinge.", "Snap your hips forward to swing the bell; keep your arms relaxed.", "Let it return between your legs and hinge again without squatting it."],
    bench: ["Set your feet and shoulder blades before unracking.", "Lower the weight under control to a comfortable chest-level touch.", "Press smoothly back up; keep wrists stacked over elbows."],
    fly: ["Keep a soft bend in your elbows and shoulders relaxed.", "Open your arms only as far as you can control comfortably.", "Bring your hands back together without changing the elbow bend."],
    legpress: ["Set your feet on the platform and keep your hips supported.", "Lower the sled until you reach a comfortable knee bend.", "Press through your whole foot without forcefully locking your knees."],
    legmachine: ["Align the machine pivot with your knee and sit securely.", "Extend or curl your lower leg through a comfortable range.", "Return slowly and keep the weight stack from slamming."],
    pushup: ["Start in a straight line from head to heels.", "Lower your chest between your hands with control.", "Press the floor away and keep your hips from sagging."],
    row: ["Set your torso and spine in a steady position.", "Pull your elbows toward your hips or lower ribs.", "Reach forward slowly without losing your brace."],
    pulldown: ["Set your grip and sit tall with shoulders relaxed.", "Draw your elbows down toward your sides.", "Let the bar rise under control; avoid swinging your torso."],
    pullup: ["Start from a comfortable hang with a steady body.", "Pull your chest toward the bar without swinging.", "Lower until your arms are long again, with control."],
    curl: ["Stand tall and keep your elbows near your sides.", "Curl the weight without rocking your torso.", "Lower slowly until your arm is comfortably extended."],
    overhead: ["Start with the weight near shoulder height and brace.", "Press overhead while keeping ribs stacked over your hips.", "Lower smoothly to the start position."],
    overheadtriceps: ["Brace gently and keep your upper arms pointing up.", "Bend and straighten your elbows without flaring your ribs.", "Lower the weight slowly through a pain-free range."],
    lateral: ["Keep a small bend in your elbows and a steady torso.", "Raise your arms smoothly to around shoulder height.", "Lower slowly; don't swing the weights."],
    triceps: ["Keep your upper arms steady and shoulders relaxed.", "Straighten your elbows through a comfortable range.", "Return slowly without letting the weight pull you out of position."],
    lunge: ["Stand tall and take a stable step or split stance.", "Lower under control while keeping your front foot planted.", "Push through the whole front foot to return."],
    bridge: ["Set your upper back and feet firmly before moving.", "Lift your hips by squeezing your glutes; keep ribs down.", "Lower your hips under control and repeat."],
    core: ["Brace gently before you start the movement.", "Move through a controlled range without pulling on your neck.", "Return slowly and keep your lower back comfortable."],
    plank: ["Stack elbows under shoulders and set a straight body line.", "Brace your midsection and squeeze your glutes.", "Breathe steadily; stop when you can't keep your position."],
    mountain: ["Start in a strong plank with hands under shoulders.", "Bring one knee toward your chest while keeping hips steady.", "Alternate smoothly at a pace you can control."],
    calf: ["Hold a stable position with feet under your hips.", "Rise smoothly onto the balls of your feet.", "Lower your heels slowly to a comfortable stretch."],
    carry: ["Pick up the weights with a stable brace.", "Walk with short, smooth steps and shoulders level.", "Set the weights down carefully when you finish."]
  };

  function family(ex) {
    const n = (ex.name + " " + ex.kind + " " + ex.equipment).toLowerCase();
    if (/chest fly|pec deck/.test(n)) return "fly";
    if (/bench|chest press/.test(n)) return "bench";
    if (/push-up|pushup/.test(n)) return "pushup";
    if (/hip thrust|glute bridge/.test(n)) return "bridge";
    if (/kettlebell swing/.test(n)) return "swing";
    if (/deadlift|romanian|back extension/.test(n)) return "hinge";
    if (/leg press/.test(n)) return "legpress";
    if (/leg extension|leg curl/.test(n)) return "legmachine";
    if (/back squat|front squat|goblet squat|squat/.test(n)) return "squat";
    if (/lunge|step-up/.test(n)) return "lunge";
    if (/pull-up|pull up|chin-up|chin up|assisted pull/.test(n)) return "pullup";
    if (/lat pulldown/.test(n)) return "pulldown";
    if (/row/.test(n)) return "row";
    if (/curl/.test(n)) return "curl";
    if (/lateral raise|front raise|raise/.test(n)) return "lateral";
    if (/overhead press|shoulder press/.test(n)) return "overhead";
    if (/overhead.*triceps|triceps.*overhead/.test(n)) return "overheadtriceps";
    if (/triceps|dip/.test(n)) return "triceps";
    if (/plank/.test(n)) return "plank";
    if (/mountain climber/.test(n)) return "mountain";
    if (/wood chop|crunch|ab wheel/.test(n)) return "core";
    if (/calf/.test(n)) return "calf";
    if (/carry/.test(n)) return "carry";
    return "row";
  }

  const catalogUrl = "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/exercises.json";
  const imageBase = "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/";
  const vitalClips = {
    "pec-deck": "0051",
    "barbell-back-squat": "0054",
    "bulgarian-split-squat": "0063",
    "front-squat": "0056",
    "barbell-hip-thrust": "0057",
    "romanian-deadlift": "0060",
    "goblet-squat": "0064",
    "kettlebell-swing": "0072",
    "leg-extension": "0073",
    "leg-press": "0074",
    "seated-leg-curl": "0079",
    "dumbbell-step-up": "0081",
    "cable-triceps-pushdown": "0085",
    "overhead-press": "0088",
    "cable-lateral-raise": "0095",
    "dumbbell-lateral-raise": "0096"
  };
  const femaleClips = {
    "smith-machine-bent-over-row": "1245",
    "hack-squat": "1254",
    "v-up": "0976"
  };
  let demoModel = "male";
  const fallbackRecords = {
    "barbell bench press": { name_en: "Barbell Bench Press", equipment: "barbell", images: { flat: { start: "images/flat/bench-press-start.webp", peak: "images/flat/bench-press-peak.webp" } } }
  };
  let catalogPromise = null;
  let catalog = null;
  let catalogFailed = false;

  function normalizeName(value) {
    return String(value || "").toLowerCase()
      .replace(/&/g, " and ")
      .replace(/push[\s-]*up/g, "pushup")
      .replace(/pull[\s-]*up/g, "pullup")
      .replace(/chin[\s-]*up/g, "chinup")
      .replace(/\boverhead\s+press\b/g, "shoulder press")
      .replace(/\bbiceps\b/g, "bicep")
      .replace(/\btriceps\b/g, "tricep")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  const equipmentWords = new Set(["barbell", "dumbbell", "cable", "machine", "bodyweight", "kettlebell", "assisted", "smith", "band", "bar"]);
  function nameTokens(value) {
    return normalizeName(value).split(" ").filter(word => word && !equipmentWords.has(word));
  }
  function equipmentMatch(ex, record) {
    const target = normalizeName(ex.equipment);
    const actual = normalizeName(record.equipment);
    if (!target || !actual) return 0;
    const checks = [
      [["barbell", "bar"], ["barbell"]],
      [["dumbbell"], ["dumbbell"]],
      [["machine"], ["machine", "leg press", "pec deck", "chest fly"]],
      [["cable"], ["cable"]],
      [["kettlebell"], ["kettlebell"]],
      [["bodyweight"], ["bodyweight"]]
    ];
    const row = checks.find(([from]) => from.some(x => target.includes(x)));
    if (!row) return 0;
    return row[1].some(x => actual.includes(x) || normalizeName(record.name_en).includes(x)) ? 0.08 : -0.18;
  }
  function findRecord(ex) {
    const target = normalizeName(ex.name);
    const bundled = window.SetwiseBundledGuides && window.SetwiseBundledGuides.records[String(ex.name).toLowerCase()];
    if (bundled) return bundled;
    if (!catalog) return fallbackRecords[target] || null;
    const exact = catalog.find(item => normalizeName(item.name_en) === target);
    if (exact && exact.images && exact.images.flat) return exact;

    const targetTokens = nameTokens(ex.name);
    let best = null, bestScore = -1, second = -1;
    for (const item of catalog) {
      if (!item.name_en || !item.images || !item.images.flat) continue;
      const candidateTokens = nameTokens(item.name_en);
      if (!targetTokens.length || !candidateTokens.length) continue;
      const shared = targetTokens.filter(word => candidateTokens.includes(word)).length;
      const tokenScore = (2 * shared) / (targetTokens.length + candidateTokens.length);
      const score = tokenScore + equipmentMatch(ex, item);
      if (score > bestScore) {
        second = bestScore;
        bestScore = score;
        best = item;
      } else if (score > second) {
        second = score;
      }
    }
    return bestScore >= 0.82 && bestScore - second >= 0.06 ? best : null;
  }

  function safeImageUrl(path) {
    if (typeof path !== "string" || !/^images\/flat\/[a-z0-9-]+\.webp$/i.test(path)) return "";
    return (window.SetwiseBundledGuides && window.SetwiseBundledGuides.images[path]) || imageBase + path;
  }

  function selectedClip(ex) {
    if (demoModel === "female" && femaleClips[ex.id]) return { id: femaleClips[ex.id], model: "female" };
    if (vitalClips[ex.id]) return { id: vitalClips[ex.id], model: "male" };
    return null;
  }

  const prefersReducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  // ONE decision about what a movement shows. The scene, the badge and the disclaimer
  // are all derived from this, so they cannot disagree about what is on screen. (They
  // used to be computed independently, which is how the female-mode disclaimer ended
  // up describing an illustrated guide while a male video was playing.)
  function mediaFor(ex, record, loading, skipVideo = false) {
    const clip = skipVideo ? null : selectedClip(ex);
    if (clip) return { kind: "video", clip };
    if (loading) return { kind: "loading" };
    if (!record) return { kind: "empty", reason: catalogFailed ? "offline" : "none" };
    const paths = record.images && record.images.flat || {};
    // Static holds (plank, farmer carry) ship a single `main` image rather than a
    // start/peak pair; falling back to it makes start === peak, which renders as a hold.
    const start = safeImageUrl(paths.start || paths.main), peak = safeImageUrl(paths.peak || paths.main);
    if (!start && !peak) return { kind: "empty", reason: "missing" };
    if (start && peak && start !== peak) return { kind: "illustration", mode: "loop", start, peak };
    return { kind: "illustration", mode: "hold", src: start || peak, labelled: !!(start && peak) };
  }

  // Identifies what a scene is showing, so a re-hydrate can skip replacing a scene whose
  // media has not changed (replacing restarts a playing video and churns the DOM).
  function mediaKey(media) {
    if (media.kind === "video") return "video:" + media.clip.model + ":" + media.clip.id;
    if (media.kind === "empty") return "empty:" + media.reason;
    if (media.kind === "illustration") return media.mode === "loop" ? "loop:" + media.start + "|" + media.peak : "hold:" + media.src;
    return media.kind;
  }

  const EMPTY_MESSAGES = {
    offline: "Movement pictures need an internet connection. Your form cues are below.",
    none: "No matching movement pictures are available yet. Your form cues are below.",
    missing: "Movement pictures are not available for this exercise. Your form cues are below.",
    broken: "Movement pictures could not be loaded. Your form cues are below."
  };

  function toggleButton(paused) {
    const label = paused ? "Play" : "Pause";
    return '<button class="motion-toggle" type="button" data-motion-toggle aria-pressed="' + String(paused) + '" aria-label="' + label + ' movement preview">' + label + '</button>';
  }

  // Every state renders inside the same square .movement-stage (see styles.css).
  function sceneMarkup(ex, media) {
    const reduced = prefersReducedMotion();
    const open = (cls, extra) => '<div class="movement-scene ' + cls + (extra || "") + '" data-movement-scene data-media-kind="' + media.kind + '" data-media-key="' + esc(mediaKey(media)) + '">';
    const stage = (inner, attrs) => '<div class="movement-stage"' + (attrs || "") + '>' + inner + '</div></div>';

    if (media.kind === "video") {
      const clip = media.clip;
      const src = "./assets/vital-" + (clip.model === "female" ? "female/" : "free/") + clip.id + ".mp4";
      // No native controls: the same Play/Pause button as the pose loop, so a list of
      // exercises has one control system. Reduced motion starts paused, as for stills.
      // The control always STARTS in its paused state and is switched to "Pause" only by
      // the video's own `play` event (see syncVideoControl). Autoplay is a request, not a
      // guarantee: a browser that blocks it (e.g. iOS Low Power Mode) must leave a usable
      // Play button, not a "Pause" button on a stopped video.
      return open("movement-scene-video", " is-paused") + stage(
        '<video class="vital-animation" src="' + esc(src) + '" muted loop playsinline preload="metadata"' + (reduced ? ' data-user-paused="true"' : " autoplay") + ' aria-label="Looping ' + esc(clip.model) + ' demonstration of ' + esc(ex.name) + '"></video>' +
        toggleButton(true));
    }
    if (media.kind === "loading") {
      return open("movement-scene-loading") + stage('<div class="stage-message" aria-live="polite"><span class="visual-loading-dot"></span><span>Loading movement pictures…</span></div>');
    }
    if (media.kind === "empty") {
      return open("movement-scene-empty") + stage('<div class="stage-message"><span class="scene-empty-mark" aria-hidden="true">↗</span><span>' + EMPTY_MESSAGES[media.reason] + '</span></div>');
    }
    if (media.mode === "loop") {
      return open("movement-scene-motion", reduced ? " is-paused" : "") + stage(
        '<img class="motion-frame motion-frame-start" src="' + esc(media.start) + '" alt="" loading="lazy" decoding="async">' +
        '<img class="motion-frame motion-frame-peak" src="' + esc(media.peak) + '" alt="" loading="lazy" decoding="async">' +
        '<span class="motion-state motion-state-start" aria-hidden="true">START</span>' +
        '<span class="motion-state motion-state-peak" aria-hidden="true">PEAK</span>' +
        toggleButton(reduced) +
        '<div class="motion-cycle-track" aria-hidden="true"><span></span></div>',
        ' role="group" aria-label="' + esc(ex.name) + ' movement preview, looping between start and peak positions"');
    }
    return open("movement-scene-hold") + stage(
      '<img class="repdb-position-image stage-image" src="' + esc(media.src) + '" alt="' + esc(ex.name) + ' movement position" loading="lazy" decoding="async">' +
      (media.labelled ? '<span class="stage-label" aria-hidden="true">HOLD</span>' : ""));
  }

  // Two labels, both describing what is actually on screen. Loading and empty states
  // show none (they used to claim "POSITION GUIDE" with no picture present).
  function guideBadge(media) {
    return media.kind === "video" ? "VIDEO" : media.kind === "illustration" ? "ILLUSTRATION" : "";
  }

  const SAFETY = "Use a controlled, comfortable range of motion.";
  function guideDisclaimer(media) {
    if (media.kind === "video") {
      if (media.clip.model === "female") return "Female demonstration · " + SAFETY;
      if (demoModel === "female") return "No female demonstration for this movement yet, so the male one is shown. " + SAFETY;
      return "Male demonstration · " + SAFETY;
    }
    if (media.kind === "illustration") {
      if (demoModel === "female") return "No female demonstration for this movement yet, so the illustrated guide is shown. " + SAFETY;
      return "Illustrated positions are a reference. " + SAFETY;
    }
    return SAFETY;
  }

  function applyChrome(root, media) {
    const badge = root.querySelector(".demo-badge");
    if (badge) { const text = guideBadge(media); badge.textContent = text; badge.hidden = !text; }
    const disclaimer = root.querySelector(".demo-disclaimer");
    if (disclaimer) disclaimer.textContent = guideDisclaimer(media);
  }

  function guideHtml(ex, inline = false) {
    const state = findRecord(ex);
    const media = mediaFor(ex, state, !state && !catalog && !catalogFailed);
    const f = family(ex), catalogCues = state && Array.isArray(state.instructions_en) ? state.instructions_en.filter(Boolean).slice(0, 3) : [], cues = catalogCues.length ? catalogCues : (instructions[f] || instructions.row);
    const badge = guideBadge(media);
    return '<section class="movement-guide' + (inline ? ' movement-guide-inline' : '') + '" data-guide-root data-guide-name="' + esc(ex.name) + '" data-guide-equipment="' + esc(ex.equipment) + '" data-guide-id="' + esc(ex.id) + '">' +
      '<div class="movement-guide-head"><div><span class="eyebrow"><i class="dot"></i>HOW TO PERFORM</span><strong>Movement preview</strong></div><span class="demo-badge"' + (badge ? "" : " hidden") + '>' + badge + '</span></div>' +
      sceneMarkup(ex, media) +
      '<p class="demo-disclaimer">' + guideDisclaimer(media) + '</p>' +
      '<ol class="form-steps">' + cues.map((x, i) => '<li><span>' + (i + 1) + '</span><p>' + esc(x) + '</p></li>').join("") + '</ol></section>';
  }

  const exFromRoot = root => ({ id: root.dataset.guideId, name: root.dataset.guideName, equipment: root.dataset.guideEquipment });

  function hydrateGuides() {
    document.querySelectorAll("[data-guide-root]").forEach(root => {
      const scene = root.querySelector("[data-movement-scene]");
      if (!scene) return;
      const ex = exFromRoot(root);
      const media = mediaFor(ex, findRecord(ex), false);
      // Skip replacing a scene whose media is unchanged: it would restart a playing video.
      if (scene.dataset.mediaKey !== mediaKey(media)) scene.outerHTML = sceneMarkup(ex, media);
      applyChrome(root, media);   // the wording can change even when the media does not
    });
  }

  function loadCatalog() {
    if (catalog) return Promise.resolve(catalog);
    if (catalogFailed) return Promise.resolve([]);
    if (!catalogPromise) {
      catalogPromise = fetch(catalogUrl, { mode: "cors" })
        .then(response => {
          if (!response.ok) throw new Error("Exercise catalog request failed");
          return response.json();
        })
        .then(data => {
          const items = Array.isArray(data) ? data : data.exercises;
          if (!Array.isArray(items)) throw new Error("Exercise catalog format was unexpected");
          catalog = items;
          hydrateGuides();
          return catalog;
        })
        .catch(() => {
          catalogFailed = true;
          hydrateGuides();
          return [];
        });
    }
    return catalogPromise;
  }

  function render(ex) {
    const html = guideHtml(ex, false);
    if (!catalog && !catalogFailed) loadCatalog();
    return html;
  }
  function renderInline(ex) {
    const html = guideHtml(ex, true);
    if (!catalog && !catalogFailed) loadCatalog();
    return html;
  }

  const videoObserver = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(entries => entries.forEach(entry => {
      const video = entry.target;
      // Off-screen always pauses; coming back on-screen resumes only if the user has
      // not paused it themselves (or reduced motion started it paused).
      if (entry.isIntersecting) { if (!video.dataset.userPaused) video.play().catch(() => {}); }
      else video.pause();
    }), { threshold: 0.25 })
    : null;

  function observeVideos(root) {
    const videos = [];
    if (root instanceof HTMLVideoElement && root.classList.contains("vital-animation")) videos.push(root);
    if (root.querySelectorAll) videos.push(...root.querySelectorAll("video.vital-animation"));
    videos.forEach(video => {
      if (video.dataset.observed) return;
      video.dataset.observed = "true";
      if (videoObserver) videoObserver.observe(video);
      else if (!video.dataset.userPaused) video.play().catch(() => {});
    });
  }

  function setControl(scene, paused) {
    const button = scene.querySelector("[data-motion-toggle]");
    scene.classList.toggle("is-paused", paused);
    if (!button) return;
    button.setAttribute("aria-pressed", String(paused));
    button.setAttribute("aria-label", paused ? "Play movement preview" : "Pause movement preview");
    button.textContent = paused ? "Play" : "Pause";
  }

  // A clip's control reflects the video's ACTUAL state, never a guess about it. Media
  // events do not bubble, so listen in the capture phase.
  function syncVideoControl(video) {
    const scene = video.closest("[data-movement-scene]");
    if (scene) setControl(scene, video.paused);
  }
  ["play", "pause"].forEach(type => document.addEventListener(type, event => {
    const video = event.target;
    if (video instanceof HTMLVideoElement && video.classList.contains("vital-animation")) syncVideoControl(video);
  }, true));

  // One Play/Pause control for both the pose loop and the video clip.
  document.addEventListener("click", event => {
    const button = event.target.closest && event.target.closest("[data-motion-toggle]");
    if (!button) return;
    const scene = button.closest("[data-movement-scene]");
    if (!scene) return;
    const video = scene.querySelector("video.vital-animation");
    if (video) {
      // Act on what the video is really doing, so one tap always does the expected thing
      // even when autoplay was blocked and the video never started.
      if (video.paused) {
        delete video.dataset.userPaused;
        video.play().catch(() => syncVideoControl(video));
      } else {
        video.dataset.userPaused = "true";
        video.pause();
      }
      syncVideoControl(video);   // play()/pause() update `paused` synchronously
      return;
    }
    setControl(scene, !scene.classList.contains("is-paused"));
  });

  const videoMutationObserver = new MutationObserver(records => {
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) observeVideos(node);
    }));
  });
  videoMutationObserver.observe(document.body, { childList: true, subtree: true });

  // A media element that fails to load is replaced in place. The badge and disclaimer are
  // updated with it, so a failed video no longer leaves a "VIDEO" badge over a still.
  document.addEventListener("error", event => {
    const el = event.target;
    const isVideo = el instanceof HTMLVideoElement && el.classList.contains("vital-animation");
    const isImage = el instanceof HTMLImageElement && (el.classList.contains("repdb-position-image") || el.classList.contains("motion-frame"));
    if (!isVideo && !isImage) return;
    const scene = el.closest("[data-movement-scene]");
    const root = el.closest("[data-guide-root]");
    if (!scene || !root) return;
    const ex = exFromRoot(root);
    const next = isVideo ? mediaFor(ex, findRecord(ex), false, true) : { kind: "empty", reason: "broken" };
    scene.outerHTML = sceneMarkup(ex, next);
    applyChrome(root, next);
  }, true);

  function setDemoModel(model) {
    const next = model === "female" ? "female" : "male";
    if (next === demoModel) return;
    demoModel = next;
    hydrateGuides();
  }

  window.SetwiseGuide = { render, renderInline, family, setDemoModel, loadCatalog };
})();








