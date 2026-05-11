import { computeSpeedKmH, distanceInMeters } from '../utils/geo'

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

function getCollectionStrategy(sampleCount) {
  const networkInfo = getNetworkInfo()
  const slowNetwork =
    networkInfo.saveData === true ||
    networkInfo.effectiveType === 'slow-2g' ||
    networkInfo.effectiveType === '2g' ||
    (typeof networkInfo.rtt === 'number' && networkInfo.rtt >= 300)

  const requestedSamples = Number.isFinite(sampleCount) ? Math.max(1, Math.floor(sampleCount)) : 2
  const sampleTarget = slowNetwork ? 1 : Math.min(2, requestedSamples)

  return {
    networkInfo,
    slowNetwork,
    sampleTarget,
    watchOptions: {
      enableHighAccuracy: !slowNetwork,
      maximumAge: slowNetwork ? 15000 : 5000,
    },
    fallbackOptions: {
      timeout: slowNetwork ? 8000 : 12000,
      maximumAge: slowNetwork ? 15000 : 5000,
    },
    overallTimeoutMs: slowNetwork
      ? Math.max(4000, Math.min(10000, sampleTarget * 3500))
      : Math.max(5000, Math.min(15000, sampleTarget * 4500)),
  }
}

function buildSecurityChecks(summary) {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown'
  const webdriverFlag = navigator.webdriver === true
  const networkInfo = getNetworkInfo()

  const checks = {
    accuracyOk: Number.isFinite(summary.avgAccuracy) && summary.avgAccuracy > 1.5 && summary.avgAccuracy <= 50,
    spreadOk: Number.isFinite(summary.maxSpread) && summary.maxSpread <= 20,
    freshOk: Number.isFinite(summary.ageMs) && summary.ageMs <= 20000,
    speedOk: Number.isFinite(summary.maxSpeedKmH) && summary.maxSpeedKmH <= 150,
    signalStableOk: Number.isFinite(summary.accuracySpread) && summary.accuracySpread <= 20,
    noAutomationFlag: !webdriverFlag,
    onlineOk: networkInfo.online !== false,
  }

  const trustScore =
    (checks.accuracyOk ? 20 : 0) +
    (checks.spreadOk ? 20 : 0) +
    (checks.freshOk ? 15 : 0) +
    (checks.speedOk ? 15 : 0) +
    (checks.signalStableOk ? 10 : 0) +
    (checks.noAutomationFlag ? 10 : 0) +
    (checks.onlineOk ? 5 : 0)

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

export async function collectVerifiedLocation(sampleCount = 3) {
  if (!navigator.geolocation) {
    throw new Error('Trình duyệt không hỗ trợ định vị GPS.')
  }

  const strategy = getCollectionStrategy(sampleCount)

  try {
    const fastFix = await getCurrentPositionStrict({
      timeout: strategy.slowNetwork ? 2500 : 1800,
      maximumAge: strategy.fallbackOptions.maximumAge,
      enableHighAccuracy: !strategy.slowNetwork,
    })

    const quickSample = {
      lat: fastFix.coords.latitude,
      lng: fastFix.coords.longitude,
      accuracy: fastFix.coords.accuracy,
      timestamp: fastFix.timestamp,
    }

    if (strategy.sampleTarget === 1) {
      const security = buildSecurityChecks({
        avgAccuracy: quickSample.accuracy,
        maxSpread: 0,
        ageMs: 0,
        maxSpeedKmH: 0,
        accuracySpread: 0,
      })

      return {
        lat: quickSample.lat,
        lng: quickSample.lng,
        accuracy: quickSample.accuracy,
        minAccuracy: quickSample.accuracy,
        maxAccuracy: quickSample.accuracy,
        accuracySpread: 0,
        spread: 0,
        maxSpeedKmH: 0,
        timestamp: quickSample.timestamp,
        trustScore: security.trustScore,
        trusted: Object.values(security.checks).every(Boolean),
        checks: security.checks,
        timezone: security.timezone,
        networkInfo: security.networkInfo,
        webdriverFlag: security.webdriverFlag,
        samples: [quickSample],
      }
    }
  } catch {
    // Fall back to the multi-sample collector below.
  }

  const samples = await new Promise((resolve, reject) => {
    const collected = []
    let settled = false
    let watchId = null

    const finish = (value, isError) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
      if (isError) reject(value)
      else resolve(value)
    }

    const overallTimeoutMs = strategy.overallTimeoutMs
    const timer = window.setTimeout(() => {
      // If we got at least 1 sample, use it instead of failing hard.
      if (collected.length > 0) {
        finish(collected, false)
        return
      }
      finish(new Error('Lấy vị trí bị quá thời gian. Vui lòng thử lại.'), true)
    }, overallTimeoutMs)

    const pushSample = (pos) => {
      const next = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        timestamp: pos.timestamp,
      }

      // De-dup very similar consecutive updates.
      const last = collected[collected.length - 1]
      if (
        last &&
        Math.abs(last.lat - next.lat) < 0.0000001 &&
        Math.abs(last.lng - next.lng) < 0.0000001 &&
        Math.abs(last.accuracy - next.accuracy) < 0.5
      ) {
        return
      }

      collected.push(next)
      if (collected.length >= sampleCount) {
        window.clearTimeout(timer)
        finish(collected, false)
      }
    }

    // Warm start: allow a small cache window to get an instant fix, then watch refines accuracy.
    watchId = navigator.geolocation.watchPosition(
      (pos) => pushSample(pos),
      () => {
        window.clearTimeout(timer)
        // Fallback to getCurrentPosition for browsers where watchPosition is flaky.
        getCurrentPositionStrict({
          timeout: strategy.fallbackOptions.timeout,
          maximumAge: strategy.fallbackOptions.maximumAge,
          enableHighAccuracy: !strategy.slowNetwork,
        })
          .then((pos) => finish([{
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          }], false))
          .catch((fallbackErr) => finish(normalizeGeoError(fallbackErr), true))
          .finally(() => {})
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
      }
    )
  })

  const denom = Math.max(1, samples.length)
  const avgLat = samples.reduce((sum, item) => sum + item.lat, 0) / denom
  const avgLng = samples.reduce((sum, item) => sum + item.lng, 0) / denom
  const avgAccuracy = samples.reduce((sum, item) => sum + item.accuracy, 0) / denom
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
    trusted: Object.values(security.checks).every(Boolean),
    checks: security.checks,
    timezone: security.timezone,
    networkInfo: security.networkInfo,
    webdriverFlag: security.webdriverFlag,
    samples,
  }
}
