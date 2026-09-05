/**
 * A pinhole camera looking down on the globe from orbit, so Sweden can be
 * drawn on a surface that visibly curves away.
 *
 * The Earth is the unit sphere. That keeps every test cheap: a point `p` on
 * the surface faces the camera exactly when `p · C > 1`, which is the horizon
 * condition, and ray-sphere intersection is a two-term quadratic.
 */

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

export type Vec3 = [number, number, number]

export function fromLatLon(latitude: number, longitude: number): Vec3 {
  const lat = latitude * DEG
  const lon = longitude * DEG
  return [
    Math.cos(lat) * Math.cos(lon),
    Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
  ]
}

export function toLatLon(v: Vec3): [number, number] {
  return [Math.asin(v[2]) * RAD, Math.atan2(v[1], v[0]) * RAD]
}

export function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

export function scale(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k]
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]) || 1
  return scale(a, 1 / length)
}

/** Great-circle interpolation, for drawing arcs that hug the surface. */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const cosine = Math.max(-1, Math.min(1, dot(a, b)))
  const angle = Math.acos(cosine)
  if (angle < 1e-6) {
    return a
  }
  const sine = Math.sin(angle)
  return normalize(
    add(
      scale(a, Math.sin((1 - t) * angle) / sine),
      scale(b, Math.sin(t * angle) / sine)
    )
  )
}

/** Where the sun sits, as a unit vector from the centre of the Earth. */
export function sunDirection(declination: number, subsolarLongitude: number) {
  return fromLatLon(declination, subsolarLongitude)
}

/**
 * The camera hangs over Sweden and tilts a little north, low enough that the
 * country fills the frame and the surface visibly curves away beyond it.
 *
 * Height matters for more than framing: from directly over Sweden the sun sits
 * tens of degrees off the view axis all day, so the beams cross the picture at
 * a slant instead of arriving end-on and foreshortening to nothing.
 */
const ANCHOR = { latitude: 58.5, longitude: 16 }
const TARGET = { latitude: 65.5, longitude: 16 }
/** Distance from the centre of the Earth, in Earth radii. */
const ORBIT = 1.3
/** Screen units per unit of tangent at the focal plane. */
const ZOOM = 1.15

export type Projected = { x: number; y: number; depth: number }

export type Camera = {
  position: Vec3
  /** Perspective projection into the drawing box; null when behind the lens. */
  project: (point: Vec3) => Projected | null
  /** True when a point on the surface is on the near side of the horizon. */
  facing: (surfacePoint: Vec3) => boolean
  /** True when the straight line from a point to the lens clears the globe. */
  unobstructed: (point: Vec3) => boolean
  /** Surface point under a normalised screen position, or null past the limb. */
  surfaceAt: (u: number, v: number) => Vec3 | null
}

export function createCamera(width: number, height: number): Camera {
  const position = scale(fromLatLon(ANCHOR.latitude, ANCHOR.longitude), ORBIT)
  const forward = normalize(
    subtract(fromLatLon(TARGET.latitude, TARGET.longitude), position)
  )
  // Keep the north pole up on screen.
  const right = normalize(cross(forward, [0, 0, 1]))
  const up = cross(right, forward)

  const scaleToScreen = (height / 2) * ZOOM
  const centreX = width / 2
  const centreY = height / 2

  function project(point: Vec3): Projected | null {
    const offset = subtract(point, position)
    const depth = dot(offset, forward)
    if (depth <= 1e-6) {
      return null
    }
    return {
      x: centreX + (dot(offset, right) / depth) * scaleToScreen,
      y: centreY - (dot(offset, up) / depth) * scaleToScreen,
      depth,
    }
  }

  /** Direction through a normalised screen position, for picking. */
  function rayThrough(u: number, v: number): Vec3 {
    const x = (u * width - centreX) / scaleToScreen
    const y = (centreY - v * height) / scaleToScreen
    return normalize(add(forward, add(scale(right, x), scale(up, y))))
  }

  /** Nearest intersection of a ray from the lens with the unit sphere. */
  function hit(direction: Vec3): Vec3 | null {
    const b = dot(position, direction)
    const c = dot(position, position) - 1
    const discriminant = b * b - c
    if (discriminant < 0) {
      return null
    }
    const t = -b - Math.sqrt(discriminant)
    return t <= 0 ? null : add(position, scale(direction, t))
  }

  return {
    position,
    project,
    facing: (surfacePoint) => dot(surfacePoint, position) > 1,
    unobstructed(point) {
      // Parameterise the segment from the point to the lens and ask whether it
      // dips inside the sphere anywhere strictly between the two ends.
      const direction = subtract(position, point)
      const a = dot(direction, direction)
      const b = dot(point, direction)
      const c = dot(point, point) - 1
      const discriminant = b * b - a * c
      if (discriminant <= 0) {
        return true
      }
      const root = Math.sqrt(discriminant)
      const first = (-b - root) / a
      const second = (-b + root) / a
      const epsilon = 1e-6
      return !(first < 1 - epsilon && second > epsilon)
    },
    surfaceAt: (u, v) => hit(rayThrough(u, v)),
  }
}
