/**
 * Every number the living background moves by, in one place.
 *
 * The guiding rule: if something reads as "animated" rather than "alive",
 * the amplitude is too big. Durations are deliberately co-prime-ish so the
 * layers never line up into a visible loop.
 */

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';

export const FOREST_ANIMATION = {
  /** Slow camera breathing applied to the oversized base plate. */
  camera: {
    xDuration: 17000,
    yDuration: 23000,
    scaleDuration: 29000,
    xMin: -2.5,
    xMax: 3,
    yMin: -1.5,
    yMax: 2,
    scaleMin: 1.045,
    scaleMax: 1.052,
  },

  /** Device tilt. Depth, not sliding. */
  parallax: {
    enabled: true,
    maxX: 5,
    maxY: 3,
    /** ms between sensor samples — 12 Hz is ample for a 320 ms ease. */
    updateInterval: 80,
    /** How long the image takes to ease toward a new tilt target. */
    smoothingDuration: 320,
    /** Tilt in degrees that corresponds to full deflection. */
    fullTiltDegrees: 26,
    /** Phones are usually held tipped back; treat this as level. */
    restingPitchDegrees: 45,
  },

  /** The plate already contains the sun. This is only the air breathing. */
  sunlight: {
    breathDuration: 21000,
    minOpacity: 0.06,
    maxOpacity: 0.14,
    rayMinOpacity: 0.015,
    rayMaxOpacity: 0.035,
    warmthDuration: 37000,
    warmthMaxOpacity: 0.04,
    /** Fraction of screen. The sun sits upper-left-of-centre in the art. */
    originX: 0.2,
    originY: 0.05,
  },

  /** The loudest layer, and still quiet. */
  water: {
    minOpacity: 0.04,
    maxOpacity: 0.15,
    /** Region of the screen the creek occupies, as fractions. */
    region: { left: 0.47, top: 0.5, width: 0.6, height: 0.48 },
    bandDurations: [27000, 34000, 43000],
  },

  particles: {
    count: 8,
    minDuration: 11000,
    maxDuration: 22000,
    minOpacity: 0.08,
    maxOpacity: 0.3,
  },

  /** Layered, never a flat black sheet. */
  vignette: {
    top: 0.16,
    bottom: 0.2,
    left: 0.12,
    right: 0.07,
  },
} as const;

/**
 * The plate is landscape and the screen is portrait, so the crop is a real
 * decision: bias right to keep the creek in frame, but not so far that the
 * sun through the trees is lost. Tune here and nowhere else.
 */
export const FOREST_FOCAL_POINT = {
  x: 0.54,
  y: 0.5,
};

/** How far the plate exceeds the screen, so drift never exposes an edge. */
export const FOREST_OVERSCAN = 0.06;
