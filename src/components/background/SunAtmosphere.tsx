import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { FOREST_ANIMATION, type TimeOfDay } from './forestAnimationConfig';

type Props = {
  /**
   * Not wired to anything yet — the hook is here so a day/night system can
   * later swap tints without touching the layout.
   */
  timeOfDay?: TimeOfDay;
};

const TINTS: Record<TimeOfDay, { glow: string; warm: string }> = {
  morning: { glow: 'rgba(255, 238, 198, 1)', warm: 'rgba(255, 219, 160, 1)' },
  day: { glow: 'rgba(255, 236, 190, 1)', warm: 'rgba(255, 214, 150, 1)' },
  evening: { glow: 'rgba(255, 218, 158, 1)', warm: 'rgba(255, 186, 118, 1)' },
  night: { glow: 'rgba(196, 214, 255, 1)', warm: 'rgba(150, 178, 224, 1)' },
};

/** Three nested circles fake a radial falloff without pulling in a mask. */
function SunGlow({ size, tint }: { size: number; tint: string }) {
  const t = useSharedValue(0);
  const { breathDuration, minOpacity, maxOpacity } = FOREST_ANIMATION.sunlight;

  useEffect(() => {
    // Irregular stops, so it breathes rather than pulses.
    t.value = withRepeat(
      withSequence(
        withTiming(0.35, { duration: breathDuration * 0.22, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.2, { duration: breathDuration * 0.23, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: breathDuration * 0.23, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.12, { duration: breathDuration * 0.18, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: breathDuration * 0.14, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [breathDuration, t]);

  const style = useAnimatedStyle(() => ({
    opacity: minOpacity + t.value * (maxOpacity - minOpacity),
  }));

  const circle = (scale: number, opacity: number) => (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (size - size * scale) / 2,
        top: (size - size * scale) / 2,
        width: size * scale,
        height: size * scale,
        borderRadius: (size * scale) / 2,
        backgroundColor: tint,
        opacity,
      }}
    />
  );

  return (
    <Animated.View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      {circle(1, 0.16)}
      {circle(0.66, 0.2)}
      {circle(0.36, 0.26)}
    </Animated.View>
  );
}

function Ray({
  left,
  width,
  rotate,
  duration,
  peak,
}: {
  left: string;
  width: number;
  rotate: string;
  duration: number;
  peak: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [duration, t]);

  const style = useAnimatedStyle(() => ({
    opacity: FOREST_ANIMATION.sunlight.rayMinOpacity + t.value * peak,
    transform: [{ rotate }, { translateX: -1 + t.value * 2 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ray, { left, width }, style]}
    >
      <LinearGradient
        colors={['rgba(255,240,200,0.55)', 'rgba(255,240,200,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

function GlobalWarmth({ tint }: { tint: string }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(
      withTiming(1, {
        duration: FOREST_ANIMATION.sunlight.warmthDuration,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true,
    );
  }, [t]);

  const style = useAnimatedStyle(() => ({
    opacity: t.value * FOREST_ANIMATION.sunlight.warmthMaxOpacity,
  }));

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <LinearGradient
        colors={[tint, 'rgba(255,190,120,0.35)', 'rgba(255,180,110,0)']}
        locations={[0, 0.45, 0.75]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

export function SunAtmosphere({ timeOfDay = 'day' }: Props) {
  const { width, height } = useWindowDimensions();
  const tint = TINTS[timeOfDay];

  const glowSize = Math.min(400, Math.max(210, Math.min(width, height) * 0.78));
  const { originX, originY } = FOREST_ANIMATION.sunlight;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: width * originX - glowSize / 2,
          top: height * originY - glowSize * 0.3,
        }}
      >
        <SunGlow size={glowSize} tint={tint.glow} />
      </View>

      {/* Shafts, not laser beams: opacity only, a pixel or two of travel. */}
      <Ray left="26%" width={26} rotate="24deg" duration={26000} peak={0.02} />
      <Ray left="34%" width={15} rotate="29deg" duration={34000} peak={0.016} />
      <Ray left="17%" width={34} rotate="20deg" duration={41000} peak={0.012} />

      <GlobalWarmth tint={tint.warm} />

      {/* The distant ridge sits a touch cooler than everything in front. */}
      <View pointerEvents="none" style={styles.depth}>
        <LinearGradient
          colors={['rgba(150,180,220,0.55)', 'rgba(150,180,220,0)']}
          start={{ x: 1, y: 0 }}
          end={{ x: 0.2, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ray: {
    position: 'absolute',
    top: '-8%',
    height: '135%',
    transformOrigin: 'top left',
  },
  depth: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '62%',
    height: '44%',
    opacity: 0.045,
  },
});
