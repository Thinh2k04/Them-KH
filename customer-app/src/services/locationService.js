import { computeSpeedKmH, distanceInMeters } from '../utils/geo'

function getNetworkInfo() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection

  if (!connection) {
    return {
      supported: false,
      online: navigator.onLine,
    }
  }

  return {
    supported: true,
    online: navigator.onLine,
    effectiveType: connection.effectiveType || 'unknown',
    rtt: connection.rtt,
    downlink: connection.downlink,
    saveData: connection.saveData,
  }
}

function buildSecurityChecks(summary) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  const webdriverFlag = navigator.webdriver === true
  const networkInfo = getNetworkInfo()

  const checks = {
    accuracyOk: summary.avgAccuracy >= 4 && summary.avgAccuracy <= 25,
    spreadOk: summary.maxSpread <= 18,
    freshOk: summary.ageMs <= 10000,
    speedOk: summary.maxSpeedKmH <= 120,
    signalStableOk: summary.accuracySpread <= 15,
    noAutomationFlag: !webdriverFlag,
    timezoneOk: timezone === 'Asia/Ho_Chi_Minh',
    onlineOk: networkInfo.online !== false,
  }

  const trustScore =
    (checks.accuracyOk ? 20 : 0) +
    (checks.spreadOk ? 20 : 0) +
    (checks.freshOk ? 15 : 0) +
    (checks.speedOk ? 15 : 0) +
    (checks.signalStableOk ? 10 : 0) +
    (checks.noAutomationFlag ? 10 : 0) +
    (checks.timezoneOk ? 5 : 0) +
    (checks.onlineOk ? 5 : 0)

  return {
    checks,
    trustScore,
    timezone,
    networkInfo,
    webdriverFlag,
  }
}

function getCurrentPositionStrict() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ định vị GPS.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    })
  })
}

export async function collectVerifiedLocation(sampleCount = 3) {
  const samples = []

  for (let i = 0; i < sampleCount; i += 1) {
    const pos = await getCurrentPositionStrict()
    samples.push({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      timestamp: pos.timestamp,
    })
  }

  const avgLat = samples.reduce((sum, item) => sum + item.lat, 0) / sampleCount
  const avgLng = samples.reduce((sum, item) => sum + item.lng, 0) / sampleCount
  const avgAccuracy = samples.reduce((sum, item) => sum + item.accuracy, 0) / sampleCount
  const minAccuracy = Math.min(...samples.map((x) => x.accuracy))
  const maxAccuracy = Math.max(...samples.map((x) => x.accuracy))
  const accuracySpread = maxAccuracy - minAccuracy
  const maxSpread = samples.reduce((max, item) => {
    const d = distanceInMeters({ lat: avgLat, lng: avgLng }, { lat: item.lat, lng: item.lng })
    return Math.max(max, d)
  }, 0)

  const maxSpeedKmH = samples.reduce((max, item, index) => {
    if (index === 0) {
      return max
    }

    const prev = samples[index - 1]
    const d = distanceInMeters({ lat: prev.lat, lng: prev.lng }, { lat: item.lat, lng: item.lng })
    const speed = computeSpeedKmH(d, item.timestamp - prev.timestamp)
    return Math.max(max, speed)
  }, 0)

  const now = Date.now()
  const newestTimestamp = Math.max(...samples.map((x) => x.timestamp))
  const ageMs = now - newestTimestamp

  const security = buildSecurityChecks({
    avgAccuracy,
    maxSpread,
    ageMs,
    maxSpeedKmH,
    accuracySpread,
  })

  return {
    lat: avgLat,
    lng: avgLng,
    accuracy: avgAccuracy,
    minAccuracy,
    maxAccuracy,
    accuracySpread,
    spread: maxSpread,
    maxSpeedKmH,
    timestamp: newestTimestamp,
    trustScore: security.trustScore,
    trusted: security.trustScore >= 85,
    checks: security.checks,
    timezone: security.timezone,
    networkInfo: security.networkInfo,
    webdriverFlag: security.webdriverFlag,
    samples,
  }
}
