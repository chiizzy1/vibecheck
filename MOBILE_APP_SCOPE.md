# VibeCheck Mobile — React Native Scope

> Post-hackathon project to bring VibeCheck to iOS and Android as a true native app.

---

## Why Native?

| PWA (Current)                         | Native App                               |
| ------------------------------------- | ---------------------------------------- |
| Browser camera API (limited controls) | Native camera with exposure, focus, zoom |
| No push notifications                 | Push notifications for session results   |
| 300ms tap delay workarounds           | True 60fps touch response                |
| "Add to Home Screen" required         | App Store / Play Store presence          |
| No background processing              | Background audio/video processing        |

---

## Tech Stack

| Layer        | Choice                                   | Why                                               |
| ------------ | ---------------------------------------- | ------------------------------------------------- |
| Framework    | **Expo SDK 52+** with Expo Router v4     | File-based routing, OTA updates, managed workflow |
| Video/WebRTC | `@stream-io/video-react-native-sdk`      | Same Stream backend, native WebRTC                |
| Camera       | `expo-camera` + Stream SDK               | Native camera controls with AI overlay            |
| Animations   | `react-native-reanimated` v3             | GPU-accelerated, 60fps spring physics             |
| Gestures     | `react-native-gesture-handler`           | Native bottom sheets, swipe-to-dismiss            |
| Navigation   | Expo Router (file-based)                 | Shared mental model with Next.js                  |
| State        | Zustand                                  | Lightweight, no boilerplate                       |
| Styling      | NativeWind v5 (Tailwind)                 | Port existing Tailwind classes directly           |
| Storage      | `expo-secure-store` + `expo-file-system` | Secure tokens, local video storage                |

---

## Architecture

```
vibecheck/
├── agent/                     ← Backend (UNCHANGED)
│   ├── server.py
│   └── agent.py
│
├── frontend/                  ← Web app (UNCHANGED)
│   └── src/
│
├── mobile/                    ← NEW: React Native app
│   ├── app/
│   │   ├── _layout.tsx        Global layout + Stream provider
│   │   ├── index.tsx          Mode selector (home screen)
│   │   ├── topic.tsx          Topic input
│   │   ├── session.tsx        Live VibeSession
│   │   └── results/[id].tsx   Results screen
│   │
│   ├── components/
│   │   ├── ModeCard.tsx       Animated mode selection card
│   │   ├── BottomSheet.tsx    Reusable gesture-driven bottom sheet
│   │   ├── DirectorNotes.tsx  AI notes feed (bottom sheet content)
│   │   ├── AnimatedCounter.tsx Number tick-up animation
│   │   ├── DonutChart.tsx     SVG donut for eye contact %
│   │   └── RecordButton.tsx   Pulsing record button with haptics
│   │
│   ├── lib/
│   │   ├── api.ts             Shared API client (same endpoints)
│   │   ├── stream.ts          Stream SDK init + token management
│   │   └── types.ts           Shared TypeScript types
│   │
│   ├── app.json               Expo config
│   └── package.json
│
└── shared/                    ← OPTIONAL: shared types package
    └── types.ts
```

---

## Screen-by-Screen Breakdown

### 1. Mode Selector (`index.tsx`)

- 3 large cards with `Reanimated` spring press animations
- Haptic feedback on selection (`expo-haptics`)
- Stagger entrance animation on mount
- **Effort:** 0.5 day

### 2. Topic Input (`topic.tsx`)

- Native `TextInput` with auto-focus
- Keyboard-avoiding view
- Character counter
- "Let's Go" button with gradient (linear-gradient via `expo-linear-gradient`)
- **Effort:** 0.5 day

### 3. VibeSession (`session.tsx`) — The Core Screen

- Stream Video SDK `StreamCall` component for native WebRTC
- Native camera preview (full-screen, no letterboxing)
- **Bottom sheet** for Director's Notes using `react-native-gesture-handler` + `Reanimated`
  - Snap points: collapsed (handle visible), half-screen, full-screen
  - Swipe down to dismiss
- Floating action buttons: Record, Cut, End Session
- `RecordButton` with pulsing red glow animation + haptic on start/stop
- Timer overlay with `Reanimated` shared values
- **Effort:** 2-3 days (most complex screen)

### 4. Results Screen (`results/[id].tsx`)

- Scrollable results with parallax header
- SVG donut chart (reanimated arc animation)
- Animated counter tick-ups for metrics
- Video playback via `expo-av`
- Share sheet for downloading/sharing the best take
- Copy caption button with haptic confirmation
- **Effort:** 1-1.5 days

---

## Backend Changes Required

**Almost none.** The FastAPI backend is already API-first:

```
POST /session/start     → { api_key, token, user_id, call_id }
GET  /session/results/:id → { takes, aesthetic, caption }
```

Only addition needed:

- **Push notifications** (optional): Add Firebase Cloud Messaging (FCM) endpoint to notify when AI analysis is complete
- **Deep links** (optional): Add `/.well-known/apple-app-site-association` for universal links

---

## Native-Only Features (Not Possible in PWA)

| Feature                  | How                                         |
| ------------------------ | ------------------------------------------- |
| **Haptic feedback**      | `expo-haptics` on record, cut, mode select  |
| **Push notifications**   | FCM when results are ready                  |
| **Camera controls**      | Exposure, focus, zoom, flash                |
| **Background recording** | Continue recording when app backgrounded    |
| **Share sheet**          | Native OS share for videos and captions     |
| **Offline mode**         | Cache past sessions with `expo-file-system` |
| **App Store presence**   | Discoverability, reviews, trust             |

---

## Timeline Estimate

| Phase               | Duration      | Deliverable                                  |
| ------------------- | ------------- | -------------------------------------------- |
| **1. Scaffold**     | 0.5 day       | Expo project, routing, Stream SDK init       |
| **2. Mode + Topic** | 1 day         | First 2 screens with animations              |
| **3. VibeSession**  | 2-3 days      | Camera, Stream call, bottom sheet, recording |
| **4. Results**      | 1-1.5 days    | Metrics, video playback, share               |
| **5. Polish**       | 1 day         | Haptics, transitions, edge cases             |
| **6. Build & Test** | 1 day         | EAS Build, TestFlight, internal testing      |
| **Total**           | **~7-8 days** | Production-ready iOS + Android app           |

---

## Risk Factors

| Risk                              | Mitigation                                            |
| --------------------------------- | ----------------------------------------------------- |
| Stream RN SDK quirks              | Check their RN sample app first, pin SDK version      |
| Camera permissions on iOS         | Handle gracefully with `expo-camera` permission flow  |
| Video recording + WebRTC conflict | Use Stream's built-in recording OR local `expo-av`    |
| Large video files on device       | Compress with `expo-video-thumbnails`, limit duration |
| App Store review (camera app)     | Prepare privacy policy, camera usage description      |

---

## Pre-Requisites

- [ ] Apple Developer Account ($99/year) for iOS builds
- [ ] Google Play Console ($25 one-time) for Android
- [ ] EAS Build subscription (free tier works for initial builds)
- [ ] `STREAM_API_KEY` configured for mobile platform in Stream dashboard
