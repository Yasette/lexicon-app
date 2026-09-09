# LivingForestBackground

An atmospheric background system for the forest plate: one static pixel-art
image with light and water moving over it. Nothing here swaps frames, deforms
the artwork, or blurs it.

## Status — read this first

**These files are not yet compiled or run.** At the time of writing this repo
has no Expo project in it: no `package.json`, no `node_modules`, no
`app.json`, no React Native entry point. The app currently ships as a single
`index.html`.

So the code below is complete and written against the real Expo / Reanimated /
expo-image APIs, but it is **unverified** — it has never been through a
TypeScript compiler or a Metro bundle. Expect to fix small things on first
build, particularly:

- `transformOrigin` in `SunAtmosphere.tsx` needs React Native 0.74+.
- `contentPosition` on `expo-image` has changed shape across major versions;
  check it against the version you install.
- `AccessibilityInfo.addEventListener` returns a subscription on RN 0.65+.

The same system **is** live and working in the web app, implemented with CSS
animations in `index.html` — same layers, same amplitudes, same durations.
Use that as the reference for how it should look.

## Setting up an Expo project

```bash
npx create-expo-app@latest lexicon-native --template blank-typescript
cd lexicon-native
npx expo install react-native-reanimated expo-linear-gradient expo-sensors expo-image
```

Add the Reanimated plugin to `babel.config.js` (it must be last):

```js
plugins: ['react-native-reanimated/plugin'],
```

Then copy `src/components/background/` and `assets/backgrounds/forest.png`
across.

## Usage

```tsx
<View style={{ flex: 1 }}>
  <LivingForestBackground />
  <View style={{ flex: 1, zIndex: 1 }}>
    {/* existing UI, untouched */}
  </View>
</View>
```

The component is `pointerEvents="none"` throughout, so it never intercepts a
tap, a scroll, a gesture, or a screen reader.

## Files

| file | what it does |
|---|---|
| `forestAnimationConfig.ts` | every amplitude and duration, plus the focal point |
| `useForestParallax.ts` | DeviceMotion → two clamped, smoothed shared values |
| `WaterShimmer.tsx` | perspective-placed highlight strips, reflection bands, sparkles |
| `SunAtmosphere.tsx` | glow, three shafts, global warmth, cool distance tint |
| `ForestParticles.tsx` | eight pollen specks from a fixed table |
| `LivingForestBackground.tsx` | composes the above, camera drift, vignette, readability |

## Tuning

Everything lives in `forestAnimationConfig.ts`. The rule that matters: **if
anything reads as moving, make it smaller.** The scene should feel alive, not
animated — a person should look at it for three seconds before noticing.

Order of visibility, loudest first: water → sunlight → particles → camera →
tilt. The trees themselves must never appear to wobble.
