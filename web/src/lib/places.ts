import type { Coordinates } from "@/lib/solar"

export type Place = Coordinates & { name: string }

/** A north-to-south spread of Swedish places, so the latitude effect is easy to feel. */
export const SWEDISH_PLACES: Place[] = [
  { name: "Kiruna", latitude: 67.8558, longitude: 20.2253 },
  { name: "Luleå", latitude: 65.5842, longitude: 22.1547 },
  { name: "Umeå", latitude: 63.8258, longitude: 20.263 },
  { name: "Östersund", latitude: 63.1792, longitude: 14.6357 },
  { name: "Uppsala", latitude: 59.8586, longitude: 17.6389 },
  { name: "Stockholm", latitude: 59.3293, longitude: 18.0686 },
  { name: "Göteborg", latitude: 57.7089, longitude: 11.9746 },
  { name: "Malmö", latitude: 55.605, longitude: 13.0038 },
]

export const DEFAULT_PLACE = SWEDISH_PLACES.find(
  (place) => place.name === "Stockholm"
)!

/** Rough bounding box of Sweden, used only to warn when a point is outside it. */
export const SWEDEN_BOUNDS = {
  minLatitude: 55.2,
  maxLatitude: 69.1,
  minLongitude: 10.9,
  maxLongitude: 24.2,
}

export function isInSweden({ latitude, longitude }: Coordinates) {
  return (
    latitude >= SWEDEN_BOUNDS.minLatitude &&
    latitude <= SWEDEN_BOUNDS.maxLatitude &&
    longitude >= SWEDEN_BOUNDS.minLongitude &&
    longitude <= SWEDEN_BOUNDS.maxLongitude
  )
}
