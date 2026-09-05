/**
 * The colour scale shared by the map and its legend.
 *
 * Daylight is coloured by *irradiance*, not by the sun's height. Lambert's
 * cosine law: a horizontal square metre collects a share sin(elevation) of what
 * it would collect with the sun straight overhead, because the same beam is
 * smeared across a longer footprint the lower the sun sits. That single factor
 * is most of why northern Sweden gets so much less energy than the south even
 * when both are in full daylight.
 */

const DEG = Math.PI / 180

/**
 * Geometric elevation of the sun's upper limb at true sunrise. Atmospheric
 * refraction bends light this far around the curve of the Earth, so everything
 * between this angle and zero is lit by a sun that is geometrically below the
 * horizon.
 */
export const REFRACTION_LIFT = -0.833

export type RGB = [number, number, number]

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

/** Interpolate a colour out of ascending [stop, colour] pairs. */
function ramp(stops: Array<[number, RGB]>, value: number): RGB {
  if (value <= stops[0][0]) {
    return stops[0][1]
  }
  for (let i = 1; i < stops.length; i++) {
    if (value <= stops[i][0]) {
      const [x0, c0] = stops[i - 1]
      const [x1, c1] = stops[i]
      return mix(c0, c1, (value - x0) / (x1 - x0))
    }
  }
  return stops[stops.length - 1][1]
}

/** Keyed by irradiance, from a grazing sun to one directly overhead. */
const DAY_STOPS: Array<[number, RGB]> = [
  [0, [176, 92, 40]],
  [0.2, [226, 140, 46]],
  [0.45, [246, 190, 72]],
  [0.75, [253, 226, 130]],
  [1, [255, 248, 198]],
]

/** Keyed by elevation: civil, nautical and astronomical twilight into night. */
const NIGHT_STOPS: Array<[number, RGB]> = [
  [-30, [16, 18, 38]],
  [-18, [28, 32, 66]],
  [-12, [46, 50, 100]],
  [-6, [76, 76, 138]],
  [REFRACTION_LIFT, [116, 102, 164]],
]

/** The strip lit only because the atmosphere bends light over the horizon. */
export const REFRACTION_COLOR: RGB = [214, 104, 142]

export function fieldColor(elevation: number): RGB {
  if (elevation >= 0) {
    return ramp(DAY_STOPS, Math.sin(elevation * DEG))
  }
  if (elevation >= REFRACTION_LIFT) {
    return REFRACTION_COLOR
  }
  return ramp(NIGHT_STOPS, elevation)
}

export function cssColor([r, g, b]: RGB) {
  return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
}

/** Irradiance colour for a given share of the overhead maximum. */
export function irradianceColor(fraction: number) {
  return ramp(DAY_STOPS, fraction)
}
