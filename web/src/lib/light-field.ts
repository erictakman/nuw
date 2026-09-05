import { fieldColor } from "@/lib/sun-shading"

const DEG = Math.PI / 180

/**
 * A frozen sample lattice for the sunlight field.
 *
 * Both map views paint the same quantity — how high the sun stands at every
 * point of the surface — and in both the lattice never moves. Only the sun's
 * declination and hour angle change between frames, so each sample's latitude
 * and longitude trigonometry is worth computing once and keeping.
 */
export type LightGrid = {
  width: number
  height: number
  sinLatitude: Float32Array
  cosLatitude: Float32Array
  sinLongitude: Float32Array
  cosLongitude: Float32Array
  /**
   * How much of each sample cell lands on the globe, 0-255. Partial values
   * only occur along a limb, where they soften what would otherwise be a
   * staircase edge against space.
   */
  coverage: Uint8Array
}

/**
 * `unproject` receives normalised coordinates in [0, 1] and returns the
 * [longitude, latitude] beneath them, or null where the sample misses the
 * Earth entirely — off the limb of a globe, for instance.
 */
export function buildLightGrid(
  width: number,
  height: number,
  unproject: (u: number, v: number) => [number, number] | null
): LightGrid {
  const count = width * height
  const grid: LightGrid = {
    width,
    height,
    sinLatitude: new Float32Array(count),
    cosLatitude: new Float32Array(count),
    sinLongitude: new Float32Array(count),
    cosLongitude: new Float32Array(count),
    coverage: new Uint8Array(count),
  }

  const offsets = [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
  ]

  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      let hits = 0
      let place: [number, number] | null = null

      for (const [dx, dy] of offsets) {
        const sample = unproject((column + dx) / width, (row + dy) / height)
        if (sample) {
          hits++
          place = place ?? sample
        }
      }

      if (!place) {
        continue
      }

      const [longitude, latitude] = place
      const index = row * width + column
      grid.sinLatitude[index] = Math.sin(latitude * DEG)
      grid.cosLatitude[index] = Math.cos(latitude * DEG)
      grid.sinLongitude[index] = Math.sin(longitude * DEG)
      grid.cosLongitude[index] = Math.cos(longitude * DEG)
      grid.coverage[index] = Math.round((hits / offsets.length) * 255)
    }
  }

  return grid
}

/**
 * Paint one frame of the field into RGBA pixels.
 *
 * `baseHourAngle` is the hour angle at the prime meridian, which makes the
 * hour angle at any sample `baseHourAngle + longitude` — one degree per degree
 * east. Expanding cos of that sum lets both terms come from the cached grid.
 */
export function paintLightField(
  data: Uint8ClampedArray,
  grid: LightGrid,
  declination: number,
  baseHourAngle: number
) {
  const sinDeclination = Math.sin(declination * DEG)
  const cosDeclination = Math.cos(declination * DEG)
  const sinBase = Math.sin(baseHourAngle * DEG)
  const cosBase = Math.cos(baseHourAngle * DEG)

  for (let index = 0; index < grid.width * grid.height; index++) {
    const offset = index * 4

    const coverage = grid.coverage[index]
    if (!coverage) {
      data[offset + 3] = 0
      continue
    }

    const cosHourAngle =
      cosBase * grid.cosLongitude[index] - sinBase * grid.sinLongitude[index]
    const sinElevation =
      grid.sinLatitude[index] * sinDeclination +
      grid.cosLatitude[index] * cosDeclination * cosHourAngle
    const elevation = Math.asin(Math.max(-1, Math.min(1, sinElevation))) / DEG

    const [r, g, b] = fieldColor(elevation)
    data[offset] = r
    data[offset + 1] = g
    data[offset + 2] = b
    data[offset + 3] = coverage
  }
}
