import { SWEDEN_RINGS } from "@/lib/sweden"

const DEG = Math.PI / 180

/**
 * Lambert conformal conic, the projection atlases use for mid-latitude
 * countries. Two standard parallels cut through the cone, so scale error stays
 * small between them — over Sweden's 14 degrees of latitude a plate carrée
 * would smear the north badly, since a degree of longitude is 64 km at Malmö
 * but only 40 km at Kiruna.
 */
const PARALLEL_SOUTH = 58 * DEG
const PARALLEL_NORTH = 66 * DEG
const CENTRAL_MERIDIAN = 15 * DEG
const ORIGIN_LATITUDE = 62 * DEG

/** The cone constant: how much of a full turn one revolution of longitude covers. */
const N =
  Math.log(Math.cos(PARALLEL_SOUTH) / Math.cos(PARALLEL_NORTH)) /
  Math.log(
    Math.tan(Math.PI / 4 + PARALLEL_NORTH / 2) /
      Math.tan(Math.PI / 4 + PARALLEL_SOUTH / 2)
  )

const F =
  (Math.cos(PARALLEL_SOUTH) * Math.tan(Math.PI / 4 + PARALLEL_SOUTH / 2) ** N) /
  N

function radius(latitude: number) {
  return F / Math.tan(Math.PI / 4 + latitude / 2) ** N
}

const RHO_0 = radius(ORIGIN_LATITUDE)

/** Unscaled cone coordinates, before fitting to a viewport. */
function raw(longitude: number, latitude: number): [number, number] {
  const theta = N * (longitude * DEG - CENTRAL_MERIDIAN)
  const rho = radius(latitude * DEG)
  // Negated so that north ends up at the top once y grows downwards on screen.
  return [rho * Math.sin(theta), rho * Math.cos(theta) - RHO_0]
}

function rawInverse(x: number, y: number): [number, number] {
  const dy = y + RHO_0
  const rho = Math.sign(N) * Math.hypot(x, dy)
  const theta = Math.atan2(x, dy)
  const latitude = 2 * Math.atan((F / rho) ** (1 / N)) - Math.PI / 2
  const longitude = CENTRAL_MERIDIAN + theta / N
  return [longitude / DEG, latitude / DEG]
}

export type MapProjection = {
  project: (longitude: number, latitude: number) => [number, number]
  unproject: (x: number, y: number) => [number, number]
}

/**
 * Fit the country into a `width` x `height` box, keeping the projection's
 * aspect ratio so Sweden is not stretched. The extent comes from the outline
 * itself rather than its bounding box: the box corners project well outside
 * the coastline on a cone, which would leave a fifth of the frame empty.
 */
export function createProjection(
  width: number,
  height: number,
  padding = 6
): MapProjection {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const ring of SWEDEN_RINGS) {
    for (const [longitude, latitude] of ring) {
      const [x, y] = raw(longitude, latitude)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
    }
  }

  const scale = Math.min(
    (width - 2 * padding) / (maxX - minX),
    (height - 2 * padding) / (maxY - minY)
  )
  const offsetX = (width - (maxX - minX) * scale) / 2 - minX * scale
  const offsetY = (height - (maxY - minY) * scale) / 2 - minY * scale

  return {
    project(longitude, latitude) {
      const [x, y] = raw(longitude, latitude)
      return [x * scale + offsetX, y * scale + offsetY]
    },
    unproject(x, y) {
      return rawInverse((x - offsetX) / scale, (y - offsetY) / scale)
    },
  }
}
