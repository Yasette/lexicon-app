import React, { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { ForestParticles } from './ForestParticles';
import { SunAtmosphere } from './SunAtmosphere';
import { WaterShimmer } from './WaterShimmer';
import { useForestParallax } from './useForestParallax';
import {
  FOREST_ANIMATION,
  FOREST_FOCAL_POINT,
  FOREST_OVERSCAN,
} from './forestAnimationConfig';

const forestImage = require('../../../assets/backgrounds/forest.png');

/**
 * A static pixel-art plate with weather inside it.
 *
 * Nothing here deforms or replaces the artwork — every layer is light and
 * water painted over a picture that never changes. Order of visibility,
 * loudest first: water, sunlight, particles, camera, tilt. The trees
 * themselves must never appear to wobble.
 *
 *   <View style={{ flex: 1 }}>
 *     <LivingForestBackground />
 *     <MyExistingUI />
 *   </View>
 */
export function LivingForestBackground() {
  const { width, height } = useWindowDimensions();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [active, setActive] = useState(true);

  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const cameraScale = useSharedValue(FOREST_ANIMATION.camera.scaleMin);

  const { parallaxX, parallaxY } = useForestParallax(!reduceMotion && active);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const c = FOREST_ANIMATION.camera;

    if (reduceMotion) {
      // Settle where it stands rather than snapping home.
      cameraX.value = withTiming(0, { duration: 600 });
      cameraY.value = withTiming(0, { duration: 600 });
      cameraScale.value = withTiming(c.scaleMin, { duration: 600 });
      return;
    }

    const sine = Easing.inOut(Easing.sin);

    // Three unrelated clocks: 17s, 23s, 29s. Nothing lines up, so the drift
    // never reads as a loop, and every leg returns through 0 so there is no
    // perceptible pause at an endpoint.
    cameraX.value = withRepeat(
      withSequence(
        withTiming(c.xMax, { duration: c.xDuration * 0.35, easing: sine }),
        withTiming(c.xMin, { duration: c.xDuration * 0.35, easing: sine }),
        withTiming(0, { duration: c.xDuration * 0.3, easing: sine }),
      ),
      -1,
      false,
    );

    cameraY.value = withRepeat(
      withSequence(
        withTiming(c.yMin, { duration: c.yDuration * 0.4, easing: sine }),
        withTiming(c.yMax, { duration: c.yDuration * 0.35, easing: sine }),
        withTiming(0, { duration: c.yDuration * 0.25, easing: sine }),
      ),
      -1,
      false,
    );

    cameraScale.value = withRepeat(
      withTiming(c.scaleMax, { duration: c.scaleDuration / 2, easing: sine }),
      -1,
      true,
    );
  }, [reduceMotion, cameraX, cameraY, cameraScale]);

  const plateStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cameraX.value + parallaxX.value },
      { translateY: cameraY.value + parallaxY.value },
      { scale: cameraScale.value },
    ],
  }));

  const overscan = FOREST_OVERSCAN;
  const showMotion = !reduceMotion && active;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, styles.clip]}>
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: width * (1 + overscan),
              height: height * (1 + overscan),
              left: -width * (overscan / 2),
              top: -height * (overscan / 2),
            },
            plateStyle,
          ]}
        >
          <Image
            source={forestImage}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            /* FOCAL POINT — bias right for the creek, not so far that the
               sun leaves frame. Tune in forestAnimationConfig.ts. */
            contentPosition={{
              left: `${FOREST_FOCAL_POINT.x * 100}%`,
              top: `${FOREST_FOCAL_POINT.y * 100}%`,
            }}
            transition={0}
            /* Keep the pixels sharp; never blur the art. */
            allowDownscaling={false}
          />
        </Animated.View>

        {showMotion && (
          <>
            <SunAtmosphere />
            <WaterShimmer />
            <ForestParticles />
          </>
        )}

        {/* Vignette: two soft passes rather than one black sheet. */}
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(4,10,6,${FOREST_ANIMATION.vignette.top})`,
            'rgba(4,10,6,0)',
            'rgba(4,10,6,0)',
            `rgba(4,10,6,${FOREST_ANIMATION.vignette.bottom})`,
          ]}
          locations={[0, 0.16, 0.62, 1]}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(3,8,5,${FOREST_ANIMATION.vignette.left})`,
            'rgba(3,8,5,0)',
            'rgba(3,8,5,0)',
            `rgba(3,8,5,${FOREST_ANIMATION.vignette.right})`,
          ]}
          locations={[0, 0.26, 0.74, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Readability sheet: above the atmosphere, below every pixel of UI. */}
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(8,14,9,0.30)',
            'rgba(8,14,9,0.06)',
            'rgba(8,14,9,0.20)',
            'rgba(8,14,9,0.62)',
          ]}
          locations={[0, 0.24, 0.52, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    // Shown for the single frame before the plate decodes, so the screen
    // never flashes white.
    backgroundColor: '#14251a',
  },
});
