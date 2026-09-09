import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { FOREST_ANIMATION } from './forestAnimationConfig';

type Strip = {
  id: number;
  /** fractions of the water region */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  duration: number;
  delay: number;
  travel: number;
};

/**
 * Highlights follow the creek's perspective: short and hairline where the
 * water is far away near the top, longer and heavier as it widens toward the
 * bottom. Positions are scattered and durations are all different, so the
 * rectangular region that contains them never becomes visible.
 */
const STRIP_TABLE: Omit<Strip, 'id'>[] = [
  { x: 0.5, y: 0.06, width: 18, height: 1, opacity: 0.08, duration: 5200, delay: 0, travel: 6 },
  { x: 0.6, y: 0.13, width: 24, height: 1, opacity: 0.1, duration: 4200, delay: 1400, travel: 8 },
  { x: 0.47, y: 0.22, width: 32, height: 1, opacity: 0.08, duration: 6100, delay: 700, travel: 5 },
  { x: 0.62, y: 0.32, width: 44, height: 1, opacity: 0.12, duration: 4800, delay: 2600, travel: 9 },
  { x: 0.4, y: 0.45, width: 58, height: 2, opacity: 0.09, duration: 6800, delay: 400, travel: 7 },
  { x: 0.56, y: 0.59, width: 72, height: 2, opacity: 0.12, duration: 5400, delay: 3100, travel: 11 },
  { x: 0.35, y: 0.72, width: 84, height: 2, opacity: 0.1, duration: 7000, delay: 1900, travel: 13 },
  { x: 0.58, y: 0.83, width: 66, height: 2, opacity: 0.11, duration: 6300, delay: 900, travel: 10 },
  { x: 0.44, y: 0.92, width: 78, height: 2, opacity: 0.08, duration: 5900, delay: 3900, travel: 16 },
];

const SPARK_TABLE = [
  { x: 0.55, y: 0.28, width: 3, duration: 3400, delay: 600 },
  { x: 0.46, y: 0.51, width: 4, duration: 2600, delay: 2100 },
  { x: 0.6, y: 0.7, width: 3, duration: 4300, delay: 1200 },
  { x: 0.4, y: 0.88, width: 4, duration: 3100, delay: 3300 },
];

const clampOpacity = (v: number) =>
  Math.min(FOREST_ANIMATION.water.maxOpacity, Math.max(FOREST_ANIMATION.water.minOpacity, v));

function ShimmerStrip({ strip, unit }: { strip: Strip; unit: number }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      strip.delay,
      withRepeat(
        withTiming(1, { duration: strip.duration, easing: Easing.inOut(Easing.sin) }),
        -1,
        false,
      ),
    );
  }, [strip.delay, strip.duration, t]);

  const style = useAnimatedStyle(() => {
    const p = t.value;
    const peak = clampOpacity(strip.opacity);
    // Each highlight fades smoothly on its own clock; together they read as
    // light moving across water rather than as a row of blinking bars.
    const opacity =
      p < 0.3 ? (p / 0.3) * peak : p < 0.6 ? peak : ((1 - p) / 0.4) * peak * 0.9;
    const translateX = -strip.travel * 0.6 + strip.travel * 1.6 * p;
    return { opacity, transform: [{ translateX }] };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.strip,
        {
          left: `${strip.x * 100}%`,
          top: `${strip.y * 100}%`,
          width: Math.round(strip.width * unit),
          height: Math.max(1, Math.round(strip.height * unit)),
        },
        style,
      ]}
    />
  );
}

function Sparkle({
  spark,
  unit,
}: {
  spark: (typeof SPARK_TABLE)[number];
  unit: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      spark.delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: spark.duration * 0.45, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: spark.duration * 0.55, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
  }, [spark.delay, spark.duration, t]);

  const style = useAnimatedStyle(() => ({ opacity: t.value * 0.4 }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spark,
        {
          left: `${spark.x * 100}%`,
          top: `${spark.y * 100}%`,
          width: Math.round(spark.width * unit),
          height: Math.max(1, Math.round(2 * unit)),
        },
        style,
      ]}
    />
  );
}

function ReflectionBand({
  top,
  height,
  duration,
  reverse,
}: {
  top: string;
  height: number;
  duration: number;
  reverse?: boolean;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [duration, t]);

  const style = useAnimatedStyle(() => {
    const dir = reverse ? -1 : 1;
    return {
      opacity: 0.03 + t.value * 0.045,
      transform: [{ translateX: dir * (-6 + t.value * 13) }],
    };
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.band, { top, height }, style]}>
      <LinearGradient
        colors={['rgba(255,245,205,0)', 'rgba(255,245,205,0.5)', 'rgba(255,245,205,0)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

export function WaterShimmer() {
  const { width, height } = useWindowDimensions();
  const unit = Math.min(1.3, Math.max(0.85, width / 390));
  const region = FOREST_ANIMATION.water.region;

  const strips = useMemo<Strip[]>(
    () => STRIP_TABLE.map((s, i) => ({ ...s, id: i })),
    [],
  );

  return (
    <View
      pointerEvents="none"
      style={[
        styles.region,
        {
          left: width * region.left,
          top: height * region.top,
          width: width * region.width,
          height: height * region.height,
        },
      ]}
    >
      <ReflectionBand top="38%" height={14 * unit} duration={FOREST_ANIMATION.water.bandDurations[0]} />
      <ReflectionBand top="63%" height={20 * unit} duration={FOREST_ANIMATION.water.bandDurations[1]} reverse />
      <ReflectionBand top="84%" height={26 * unit} duration={FOREST_ANIMATION.water.bandDurations[2]} />

      {strips.map((strip) => (
        <ShimmerStrip key={strip.id} strip={strip} unit={unit} />
      ))}
      {SPARK_TABLE.map((spark, i) => (
        <Sparkle key={i} spark={spark} unit={unit} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  region: {
    position: 'absolute',
    overflow: 'hidden',
  },
  strip: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 248, 210, 0.85)',
    borderRadius: 1,
  },
  spark: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 252, 228, 0.95)',
  },
  band: {
    position: 'absolute',
    left: '-10%',
    width: '120%',
  },
});
