# VibeCheck — Frontend

React 19 + TypeScript + Vite + Tailwind CSS + Framer Motion web app for **VibeCheck**.

> See the [root README](../README.md) for the full project overview.

---

## Screens

```
ModeSelector → TopicInput → VibeSession → ResultsScreen
```

| Screen            | Purpose                                                                   |
| ----------------- | ------------------------------------------------------------------------- |
| **ModeSelector**  | Pick Director / Bestie / Roast coaching mode                              |
| **TopicInput**    | Describe your video for context-aware coaching                            |
| **VibeSession**   | Live camera, WebRTC agent audio, take recording, Director's Notes sidebar |
| **ResultsScreen** | Scores, aesthetic profile, energy chart, TikTok caption, video download   |

---

## Tech Stack

| Layer        | Technology                                                   |
| ------------ | ------------------------------------------------------------ |
| Framework    | React 19 + TypeScript                                        |
| Build        | Vite                                                         |
| Video/WebRTC | Stream Video React SDK                                       |
| Animations   | Framer Motion (AnimatePresence, springs, counter animations) |
| Styling      | Tailwind CSS + custom design tokens                          |
| Recording    | Browser MediaRecorder API (WebM/VP9)                         |
| PWA          | manifest.json, standalone mode, viewport-fit=cover           |

---

## Design System

- **Colors:** Primary `#0dccf2`, Accent `#f20db4`, Background `#081113`
- **Font:** Space Grotesk (Google Fonts)
- **Glass:** `glassmorphism` utility (backdrop-blur + translucent fill)
- **Borders:** `iridescent-border` (animated gradient border)
- **Motion:** Jakub Krehel enter recipe (opacity + translateY + blur, spring, bounce: 0)
- **Interactions:** Emil Kowalski button hygiene (scale 0.97 tap, stiffness 400)
- **Accessibility:** `prefers-reduced-motion` global reset

---

## Running

```bash
npm install
npm run dev
```

Runs at `http://localhost:5173`. Backend must be running at `http://localhost:8000`.

---

## Environment Variables

```env
VITE_API_URL=http://localhost:8000
```

---

## Mobile Responsiveness

- **ModeSelector:** Cards stack vertically on mobile
- **TopicInput:** Full-width with keyboard-safe layout
- **VibeSession:** Video goes full-width, Director's Notes becomes a slide-up bottom sheet
- **ResultsScreen:** 12-column grid collapses, typography scales down
- **PWA:** Add to Home Screen for native app feel (no browser chrome)
