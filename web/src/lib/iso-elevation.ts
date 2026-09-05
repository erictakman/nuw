import type { MapProjection } from "@/lib/map-projection"

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

/**
 * Every point where the sun stands at the same height lies on a circle drawn
 * around the subsolar point — the one spot on Earth with the sun straight
 * overhead. The terminator is just the circle at zero elevation, which is why
 * the day-night edge is curved rather than a meridian.
 *
 * Tracing that circle and projecting it gives exact contours, no sampling of
 * the field required.
 */
export type IsoLine = {
  elevation: number
  /** SVG path, possibly several subpaths where the circle leaves the frame. */
  d: string
  /** A point near the middle of the frame to hang a label on, if any. */
  label: [number, number] | null
}

/** Only trace the part of the circle that can plausibly reach the frame. */
const LATITUDE_WINDOW = { min: 50, max: 76 }
const LONGITUDE_WINDOW = { min: -30, max: 60 }

export function isoElevationLine(
  elevation: number,
  declination: number,
  subsolarLongitude: number,
  projection: MapProjection,
  frame: { width: number; height: number }
): IsoLine {
  const zenith = (90 - elevation) * DEG
  const sinZenith = Math.sin(zenith)
  const cosZenith = Math.cos(zenith)
  const sinCentre = Math.sin(declination * DEG)
  const cosCentre = Math.cos(declination * DEG)

  const segments: Array<Array<[number, number]>> = []
  let current: Array<[number, number]> = []
  const margin = 40

  for (let bearing = 0; bearing <= 360; bearing += 1) {
    const cosBearing = Math.cos(bearing * DEG)
    const sinBearing = Math.sin(bearing * DEG)

    const sinLatitude =
      sinCentre * cosZenith + cosCentre * sinZenith * cosBearing
    const latitude = Math.asin(Math.max(-1, Math.min(1, sinLatitude))) * RAD
    const longitude =
      subsolarLongitude +
      Math.atan2(
        sinBearing * sinZenith * cosCentre,
        cosZenith - sinCentre * Math.sin(latitude * DEG)
      ) *
        RAD

    const inWindow =
      latitude >= LATITUDE_WINDOW.min &&
      latitude <= LATITUDE_WINDOW.max &&
      longitude >= LONGITUDE_WINDOW.min &&
      longitude <= LONGITUDE_WINDOW.max

    if (!inWindow) {
      if (current.length > 1) {
        segments.push(current)
      }
      current = []
      continue
    }

    const point = projection.project(longitude, latitude)
    if (
      point[0] < -margin ||
      point[0] > frame.width + margin ||
      point[1] < -margin ||
      point[1] > frame.height + margin
    ) {
      if (current.length > 1) {
        segments.push(current)
      }
      current = []
      continue
    }

    current.push(point)
  }

  if (current.length > 1) {
    segments.push(current)
  }

  const d = segments
    .map(
      (segment) =>
        "M" +
        segment.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")
    )
    .join(" ")

  // Hang the label where the contour crosses the middle of the frame, which for
  // a country this shape is reliably over land.
  const middle = frame.width / 2
  let label: [number, number] | null = null
  for (const segment of segments) {
    for (let i = 1; i < segment.length; i++) {
      const [x0, y0] = segment[i - 1]
      const [x1, y1] = segment[i]
      if ((x0 - middle) * (x1 - middle) <= 0 && x0 !== x1) {
        const t = (middle - x0) / (x1 - x0)
        label = [middle, y0 + t * (y1 - y0)]
        break
      }
    }
    if (label) {
      break
    }
  }

  return { elevation, d, label }
}

/** Contour levels: every five degrees, plus the two horizons. */
export function isoElevationLevels() {
  const levels: number[] = [-0.833]
  for (let value = -30; value <= 65; value += 5) {
    levels.push(value)
  }
  return levels
}
