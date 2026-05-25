import { distanceInMeters } from '../utils/geo'

function normalizeGeoError(err) {
  if (!err) return new Error('Không thể lấy vị trí.')

  const code = err.code
  if (code === 1) {
    const error = new Error('Quyền vị trí đang bị từ chối. Bắt buộc cấp quyền vị trí để tiếp tục.')
    error.code = code
    return error
  }

  if (code === 2) {
    const error = new Error('Không thể xác định vị trí. Bắt buộc bật GPS hoặc dịch vụ vị trí trên thiết bị.')
    error.code = code
    return error
  }

  if (code === 3) {
    const error = new Error('Lấy vị trí bị quá thời gian. Vui lòng bật GPS và thử lại.')
    error.code = code
    return error
  }

  const error = new Error(err.message || 'Không thể lấy vị trí.')
  error.code = code
  return error
}

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

function getLocationStrategy() {
  const networkInfo = getNetworkInfo()
  const slowNetwork =
    networkInfo.saveData === true ||
    networkInfo.effectiveType === 'slow-2g' ||
    networkInfo.effectiveType === '2g' ||
    (typeof networkInfo.rtt === 'number' && networkInfo.rtt >= 300)

  return {
    networkInfo,
    slowNetwork,
    primaryOptions: {
      enableHighAccuracy: true,
      timeout: slowNetwork ? 6000 : 4500,
      maximumAge: 0,
    },
    fallbackOptions: {
      enableHighAccuracy: false,
      timeout: slowNetwork ? 7000 : 5500,
      maximumAge: slowNetwork ? 15000 : 10000,
    },
  }
}

function buildSecurityChecks(summary) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  const webdriverFlag = navigator.webdriver === true
  const networkInfo = getNetworkInfo()

  const checks = {
    // Loosened thresholds to accommodate devices with slightly worse GPS
    accuracyOk: Number.isFinite(summary.accuracy) && summary.accuracy >= 1.5 && summary.accuracy <= 40,
    spreadOk: Number.isFinite(summary.spread) && summary.spread <= 30,
    freshOk: Number.isFinite(summary.ageMs) && summary.ageMs <= 30000,
    speedOk: Number.isFinite(summary.maxSpeedKmH) && summary.maxSpeedKmH <= 200,
    signalStableOk: Number.isFinite(summary.accuracySpread) && summary.accuracySpread <= 12,
    sampleCountOk: Number.isFinite(summary.sampleCount) && summary.sampleCount >= 1,
    noMockedFlag: summary.mocked !== true,
    noAutomationFlag: !webdriverFlag,
    onlineOk: networkInfo.online !== false,
  }

  const trustScore =
    (checks.accuracyOk ? 30 : 0) +
    (checks.spreadOk ? 25 : 0) +
    (checks.freshOk ? 10 : 0) +
    (checks.speedOk ? 5 : 0) +
    (checks.signalStableOk ? 10 : 0) +
    (checks.sampleCountOk ? 10 : 0) +
    (checks.noMockedFlag ? 7 : 0) +
    (checks.noAutomationFlag ? 2 : 0) +
    (checks.onlineOk ? 1 : 0)

  return {
    checks,
    trustScore,
    timezone,
    networkInfo,
    webdriverFlag,
  }
}

function getCurrentPositionStrict({ timeout = 15000, maximumAge = 0, enableHighAccuracy = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ định vị GPS.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, (err) => reject(normalizeGeoError(err)), {
      enableHighAccuracy,
      timeout,
      maximumAge,
    })
  })
}

function normalizePosition(pos) {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracy: pos.coords.accuracy,
    mocked: pos.coords.mocked === true,
    timestamp: pos.timestamp,
  }
}

export async function collectVerifiedLocation(sampleCount = 4) {
  if (!navigator.geolocation) {
    throw new Error('Trình duyệt không hỗ trợ định vị GPS.')
  }

  const strategy = getLocationStrategy(sampleCount)
  // Allow a single good sample on less-capable devices
  const sampleTarget = 1
  const samples = []

  try {
    const primaryFix = await getCurrentPositionStrict(strategy.primaryOptions)
    samples.push(normalizePosition(primaryFix))
  } catch (primaryErr) {
    if (primaryErr?.code === 1) {
      throw primaryErr
    }
  }

  if (!samples[0] || !Number.isFinite(samples[0].accuracy) || samples[0].accuracy > 60) {
    try {
      const fallbackFix = await getCurrentPositionStrict(strategy.fallbackOptions)
      const normalizedFallback = normalizePosition(fallbackFix)

      if (!samples[0] || normalizedFallback.accuracy <= samples[0].accuracy) {
        samples[0] = normalizedFallback
      }
    } catch (fallbackErr) {
      if (!samples[0]) {
        throw normalizeGeoError(fallbackErr)
      }
    }
  }

  if (!samples[0]) {
    throw new Error('Không thể lấy vị trí.')
  }

  if (samples[0].mocked) {
    throw new Error('Thiết bị đang trả về vị trí mô phỏng. Vui lòng tắt mock location rồi thử lại.')
  }

  while (samples.length < sampleTarget) {
    try {
      const nextFix = await getCurrentPositionStrict({
        enableHighAccuracy: true,
        timeout: strategy.slowNetwork ? 5500 : 3500,
        maximumAge: 0,
      })
      const nextSample = normalizePosition(nextFix)

      if (nextSample.mocked) {
        throw new Error('Thiết bị đang trả về vị trí mô phỏng. Vui lòng tắt mock location rồi thử lại.')
      }

      if (!samples[0] && nextSample.accuracy > 60) {
        continue
      }

      samples.push(nextSample)
    } catch (err) {
      if (samples.length === 0) {
        throw normalizeGeoError(err)
      }
      break
    }
  }

  const bestSample = [...samples].sort((left, right) => left.accuracy - right.accuracy)[0]
  const reference = bestSample || samples[0]
  const current = reference

  const maxSpread = samples.reduce((max, item) => {
    const distance = distanceInMeters(
      { lat: current.lat, lng: current.lng },
      { lat: item.lat, lng: item.lng }
    )
    return Math.max(max, distance)
  }, 0)

  const minAccuracy = Math.min(...samples.map((item) => item.accuracy))
  const maxAccuracy = Math.max(...samples.map((item) => item.accuracy))
  const accuracySpread = maxAccuracy - minAccuracy

  const maxSpeedKmH = samples.reduce((max, item, index) => {
    if (index === 0) {
      return max
    }

    const prev = samples[index - 1]
    const deltaMs = Math.max(1, item.timestamp - prev.timestamp)
    const distanceMeters = distanceInMeters(
      { lat: prev.lat, lng: prev.lng },
      { lat: item.lat, lng: item.lng }
    )
    const speedKmH = (distanceMeters / deltaMs) * 3.6
    return Math.max(max, speedKmH)
  }, 0)

  const now = Date.now()
  const security = buildSecurityChecks({
    accuracy: reference.accuracy,
    ageMs: now - reference.timestamp,
    spread: maxSpread,
    maxSpeedKmH,
    accuracySpread,
    sampleCount: samples.length,
    mocked: samples.some((item) => item.mocked),
  })

  const trusted = Object.values(security.checks).every(Boolean) && samples.length >= sampleTarget

  if (!trusted) {
    const failedChecks = Object.entries(security.checks)
      .filter(([, value]) => !value)
      .map(([key]) => key)
      .join(', ')

    throw new Error(`Vị trí có thể không chính xác. Kiểm tra thất bại: ${failedChecks}.`)
  }

  return {
    lat: reference.lat,
    lng: reference.lng,
    accuracy: reference.accuracy,
    minAccuracy,
    maxAccuracy,
    accuracySpread,
    spread: maxSpread,
    maxSpeedKmH,
    timestamp: reference.timestamp,
    trustScore: security.trustScore,
    trusted,
    checks: security.checks,
    timezone: security.timezone,
    networkInfo: security.networkInfo,
    webdriverFlag: security.webdriverFlag,
    samples,
  }
}
