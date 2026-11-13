export type Coordinates = [number, number];
const earthRadius = 6371e3;
const radians = Math.PI / 180;

export function offsetPosition(coordinates: Coordinates, metres: number, degrees: number): Coordinates {
  const [lng, lat] = coordinates;
  const latitude = lat * radians;
  const bearing = degrees * radians;
  const distance = metres / earthRadius;
  const endLatitude = Math.asin(Math.sin(latitude) * Math.cos(distance) +
    Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing));
  const longitudeOffset = Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
    Math.cos(distance) - Math.sin(latitude) * Math.sin(endLatitude));
  // Keep the endpoint on the same world copy as the start near ±180°.
  return [lng + longitudeOffset / radians, endLatitude / radians];
}

export function initialBearing([fromLng, fromLat]: Coordinates, [toLng, toLat]: Coordinates) {
  const delta = (toLng - fromLng) * radians;
  const a = fromLat * radians;
  const b = toLat * radians;
  return Math.atan2(Math.sin(delta) * Math.cos(b),
    Math.cos(a) * Math.sin(b) - Math.sin(a) * Math.cos(b) * Math.cos(delta)) / radians;
}
