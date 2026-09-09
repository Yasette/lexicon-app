import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { FOREST_ANIMATION } from './forestAnimationConfig';

type ParticleConfig = {
  id: number;
  /** fractions of the screen */
  x: number;
  y: number;
  size: number;
  opacity: number;
  driftX: number;
  driftY: number;
  duration: number;
  delay: number;
};

/**
 * Fixed table rather than Math.random(): the specks must not jump to new
 * places on every re-render, and each one has to fade to zero before its
 * loop restarts so nothing is ever seen teleporting.
 *
 * Weighted toward the sunlit left and centre, with a couple of strays.
 */
const PARTICLE_TABLE: Omit<ParticleConfig, 'id'>[] = [
  { x: 0.22, y: 0.62, size: 2, opacity: 0.26, driftX: 9, driftY: -64, duration: 16000, delay: 0 },
  { x: 0.34, y: 0.74, size: 1, opacity: 0.18, driftX: -7, driftY: -52, duration: 21000, delay: 3400 },
  { x: 0.45, y: 0.58, size: 2, opacity: 0.3, driftX: 12, driftY: -71, duration: 13500, delay: 6100 },
  { x: 0.17, y: 0.81, size: 3, opacity: 0.12, driftX: -4, driftY: -44, duration: 22000, delay: 1800 },
  { x: 0.58, y: 0.68, size: 1, opacity: 0.22, driftX: 6, driftY: -58, duration: 18500, delay: 8300 },
  { x: 0.29, y: 0.9, size: 2, opacity: 0.15, driftX: -9, driftY: -77, duration: 19500, delay: 4700 },
  { x: 0.68, y: 0.79, size: 1, opacity: 0.1, driftX: 10, driftY: -40, duration: 15000, delay: 10200 },
  { x: 0.4, y: 0.86, size: 2, opacity: 0.2, driftX: -5, driftY: -66, duration: 11500, delay: 7500 },
  { x: 0.75, y: 0.66, size: 2, opacity: 0.14, driftX: -8, driftY: -49, duration: 20000, delay: 12500 },
  { x: 0.51, y: 0.93, size: 1, opacity: 0.24, driftX: 7, driftY: -73, duration: 17000, delay: 9100 },
];

function Particle({
  config,
  unit,
}: {
  config: ParticleConfig;
  unit: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      config.delay,
      withRepeat(
        withTiming(1, { duration: config.duration, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [config.delay, config.duration, progress]);

  const style = useAnimatedStyle(() => {
    const p = progress.value;
    // Fade in, hold, fade out — the tail reaches 0 before the loop wraps.
    const opacity =
      p < 0.18
        ? (p / 0.18) * config.opacity
        : p > 0.75
          ? ((1 - p) / 0.25) * config.opacity
          : config.opacity;

    return {
      opacity,
      transform: [
        { translateX: config.driftX * unit * p },
        { translateY: config.driftY * unit * p },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.particle,
        {
          width: Math.max(1, Math.round(config.size * unit)),
          height: Math.max(1, Math.round(config.size * unit)),
        },
        style,
      ]}
    />
  );
}

export function ForestParticles() {
  const { width, height } = useWindowDimensions();
  // Scale modestly with the screen, but never let a tablet fling specks about.
  const unit = Math.min(1.35, Math.max(0.85, width / 390));

  const configs = useMemo<ParticleConfig[]>(
    () =>
      PARTICLE_TABLE.slice(0, FOREST_ANIMATION.particles.count).map((p, i) => ({
        ...p,
        id: i,
      })),
    [],
  );

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {configs.map((config) => (
        <View
          key={config.id}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: width * config.x,
            top: height * config.y,
          }}
        >
          <Particle config={config} unit={unit} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  particle: {
    // Rectangles, not blurred dots — they have to belong to the pixel grid.
    backgroundColor: 'rgba(255, 246, 214, 0.95)',
  },
});
