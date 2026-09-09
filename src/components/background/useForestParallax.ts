import { useEffect } from 'react';
import { DeviceMotion } from 'expo-sensors';
import {
  Easing,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { FOREST_ANIMATION } from './forestAnimationConfig';

type Parallax = {
  parallaxX: SharedValue<number>;
  parallaxY: SharedValue<number>;
};

const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v;

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Device tilt, turned into a few pixels of depth.
 *
 * Deliberately not a raw sensor feed: samples arrive at ~12 Hz and each one
 * only sets a target that a 320 ms ease moves toward, so the plate never
 * jitters. If the sensor is missing or refuses to start we fall back to the
 * camera drift alone, silently — this is decoration, not a feature worth an
 * error message.
 */
export function useForestParallax(enabled: boolean): Parallax {
  const parallaxX = useSharedValue(0);
  const parallaxY = useSharedValue(0);

  useEffect(() => {
    if (!enabled || !FOREST_ANIMATION.parallax.enabled) {
      parallaxX.value = withTiming(0, { duration: 400 });
      parallaxY.value = withTiming(0, { duration: 400 });
      return;
    }

    let cancelled = false;
    let subscription: { remove: () => void } | undefined;
    let lastSample = 0;

    const {
      maxX,
      maxY,
      updateInterval,
      smoothingDuration,
      fullTiltDegrees,
      restingPitchDegrees,
    } = FOREST_ANIMATION.parallax;

    const start = async () => {
      let available = false;
      try {
        available = await DeviceMotion.isAvailableAsync();
      } catch {
        available = false;
      }
      if (!available || cancelled) return;

      try {
        DeviceMotion.setUpdateInterval(updateInterval);
        subscription = DeviceMotion.addListener((event) => {
          const rotation = event?.rotation;
          if (!rotation) return;

          // expo-sensors reports radians; throttle here rather than lowering
          // the interval further, because some devices ignore the interval.
          const now = Date.now();
          if (now - lastSample < updateInterval) return;
          lastSample = now;

          const gammaDeg = rotation.gamma * RAD_TO_DEG; // roll  → horizontal
          const betaDeg = rotation.beta * RAD_TO_DEG; //  pitch → vertical

          const nx = clamp(gammaDeg / fullTiltDegrees, -1, 1);
          const ny = clamp(
            (betaDeg - restingPitchDegrees) / fullTiltDegrees,
            -1,
            1,
          );

          const easing = Easing.out(Easing.quad);
          parallaxX.value = withTiming(nx * maxX, {
            duration: smoothingDuration,
            easing,
          });
          parallaxY.value = withTiming(ny * maxY, {
            duration: smoothingDuration,
            easing,
          });
        });
      } catch {
        // Sensor unavailable or permission denied — drift only.
      }
    };

    void start();

    return () => {
      cancelled = true;
      subscription?.remove();
      // Belt and braces: some SDK versions leak if only the sub is removed.
      DeviceMotion.removeAllListeners();
    };
  }, [enabled, parallaxX, parallaxY]);

  return { parallaxX, parallaxY };
}
