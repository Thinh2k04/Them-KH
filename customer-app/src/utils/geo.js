export function toRadians(deg) {
  return (deg * Math.PI) / 180
}

export function distanceInMeters(a, b) {
  const earthRadius = 6371000
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const sinLat = Math.sin(dLat / 2)
  const sinLng = Math.sin(dLng / 2)

  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))

  return earthRadius * c
}

export function computeSpeedKmH(distanceMeters, deltaMs) {
  if (!deltaMs || deltaMs <= 0) {
    return 0
  }

  return (distanceMeters / deltaMs) * 3600
}
