const TRACKING_SCRAPE_API_URL = 'https://jsk9x6z4-3000.asse.devtunnels.ms/api/tracking/scrape'
const MAX_TRACKING_AGE_MS = 5 * 60 * 1000
const GPS_SAMPLE_TARGET = 8
const GPS_MIN_SAMPLE_COUNT = 3
const GPS_MAX_WAIT_MS = 15000
const GPS_FAST_ACCEPT_ACCURACY_METERS = 15
const GPS_UNUSABLE_ACCURACY_METERS = 1000

const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

function parseTrackingTimestamp(dateText, timeText) {
  const dateParts = String(dateText || '').trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/)
  const timeParts = String(timeText || '').trim().match(/^(\d{1,2}):(\d{2})$/)

  if (!dateParts || !timeParts) {
    return null
  }

  const day = Number(dateParts[1])
  const month = MONTH_INDEX[dateParts[2].toLowerCase()]
  const year = Number(dateParts[3])
  const hour = Number(timeParts[1])
  const minute = Number(timeParts[2])

  if (
    !Number.isInteger(day) ||
    month === undefined ||
    !Number.isInteger(year) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null
  }

  const parsed = new Date(year, month, day, hour, minute, 0, 0)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toCoordinate(value, maxAbs) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && Math.abs(parsed) <= maxAbs ? parsed : null
}

function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180
  const earthRadiusMeters = 6371000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isEmptyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
}

function normalizePosition(position) {
  const coords = position?.coords || {}
  const lat = toCoordinate(coords.latitude, 90)
  const lng = toCoordinate(coords.longitude, 180)

  if (lat === null || lng === null) {
    return null
  }

  return {
    lat,
    lng,
    accuracy: Number(coords.accuracy),
    speed: Number(coords.speed),
    timestamp: Number(position.timestamp) || Date.now(),
    mocked: coords.mocked === true || position.mocked === true,
  }
}

function summarizeGpsSamples(samples) {
  const validSamples = samples
    .map(normalizePosition)
    .filter(Boolean)
    .filter((sample) => Number.isFinite(sample.accuracy))

  if (validSamples.length === 0) {
    throw new Error('Không lấy được mẫu GPS hợp lệ. Vui lòng bật GPS và thử lại.')
  }

  const bestSample = validSamples.reduce((best, sample) =>
    sample.accuracy < best.accuracy ? sample : best
  )
  const accuracies = validSamples.map((sample) => sample.accuracy)
  const spread = Math.max(
    0,
    ...validSamples.map((sample) =>
      calculateDistanceMeters(bestSample.lat, bestSample.lng, sample.lat, sample.lng)
    )
  )
  const speedFromCoords = validSamples
    .map((sample) => sample.speed)
    .filter((speed) => Number.isFinite(speed) && speed >= 0)
    .map((speed) => speed * 3.6)
  const speedFromSamples = validSamples.slice(1).map((sample, index) => {
    const previous = validSamples[index]
    const seconds = Math.abs(sample.timestamp - previous.timestamp) / 1000
    if (seconds <= 0) {
      return 0
    }

    const meters = calculateDistanceMeters(previous.lat, previous.lng, sample.lat, sample.lng)
    return (meters / seconds) * 3.6
  })
  const maxSpeedKmH = Math.max(0, ...speedFromCoords, ...speedFromSamples)
  const newestTimestamp = Math.max(...validSamples.map((sample) => sample.timestamp))

  return {
    ...bestSample,
    minAccuracy: Math.min(...accuracies),
    maxAccuracy: Math.max(...accuracies),
    accuracySpread: Math.max(...accuracies) - Math.min(...accuracies),
    spread,
    maxSpeedKmH,
    sampleCount: validSamples.length,
    ageMs: Date.now() - newestTimestamp,
    mocked: validSamples.some((sample) => sample.mocked === true),
    samples: validSamples,
  }
}

export async function collectGpsLocation() {
  if (!window.isSecureContext) {
    throw new Error('Trang phải chạy bằng HTTPS hoặc localhost để lấy GPS chính xác.')
  }

  if (!navigator.geolocation) {
    throw new Error('Trình duyệt không hỗ trợ GPS.')
  }

  const webdriverFlag = navigator.webdriver === true
  const networkInfo = {
    supported: Boolean(navigator.connection),
    online: navigator.onLine,
    effectiveType: navigator.connection?.effectiveType || '',
  }

  const samples = []

  await new Promise((resolve, reject) => {
    let settled = false
    let watchId = null
    let maxWaitTimer = null

    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId)
      }
      clearTimeout(maxWaitTimer)
      resolve()
    }

    const fail = (error) => {
      if (samples.length > 0) {
        finish()
        return
      }

      if (settled) {
        return
      }

      settled = true
      clearTimeout(maxWaitTimer)
      reject(error)
    }

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        samples.push(position)

        const normalized = normalizePosition(position)
        if (
          normalized &&
          samples.length >= Math.min(3, GPS_SAMPLE_TARGET) &&
          normalized.accuracy <= GPS_FAST_ACCEPT_ACCURACY_METERS
        ) {
          finish()
          return
        }

        if (samples.length >= GPS_SAMPLE_TARGET) {
          finish()
        }
      },
      fail,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: GPS_MAX_WAIT_MS,
      }
    )

    maxWaitTimer = setTimeout(finish, GPS_MAX_WAIT_MS)
  })

  const summary = summarizeGpsSamples(samples)

  if (!Number.isFinite(summary.accuracy) || summary.accuracy > GPS_UNUSABLE_ACCURACY_METERS) {
    const error = new Error('Máy đang tắt dịch vụ vị trí hoặc GPS, nên không thể lấy tọa độ chính xác.')
    error.code = 2
    error.reason = 'gps_unusable'
    error.summary = summary
    throw error
  }

  const checks = {
    accuracyOk: Number.isFinite(summary.accuracy) && summary.accuracy >= 1.5 && summary.accuracy <= 60,
    spreadOk: Number.isFinite(summary.spread) && summary.spread <= 40,
    freshOk: Number.isFinite(summary.ageMs) && summary.ageMs <= 30000,
    speedOk: Number.isFinite(summary.maxSpeedKmH) && summary.maxSpeedKmH <= 200,
    signalStableOk: Number.isFinite(summary.accuracySpread) && summary.accuracySpread <= 50,
    sampleCountOk: Number.isFinite(summary.sampleCount) && summary.sampleCount >= GPS_MIN_SAMPLE_COUNT,
    noMockedFlag: summary.mocked !== true,
    noAutomationFlag: !webdriverFlag,
    onlineOk: networkInfo.online !== false,
  }

  return {
    lat: summary.lat,
    lng: summary.lng,
    accuracy: summary.accuracy,
    minAccuracy: summary.minAccuracy,
    maxAccuracy: summary.maxAccuracy,
    accuracySpread: summary.accuracySpread,
    spread: summary.spread,
    maxSpeedKmH: summary.maxSpeedKmH,
    sampleCount: summary.sampleCount,
    timestamp: summary.timestamp,
    capturedDate: new Date(summary.timestamp).toLocaleDateString('vi-VN'),
    capturedTime: new Date(summary.timestamp).toLocaleTimeString('vi-VN'),
    ageMs: summary.ageMs,
    source: 'gps',
    trustScore: Object.values(checks).filter(Boolean).length,
    trusted: Object.values(checks).every(Boolean),
    checks,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    networkInfo,
    webdriverFlag,
    samples: summary.samples,
  }
}

export async function collectVerifiedLocation(link) {
  const normalizedLink = String(link || '').trim()
  if (!normalizedLink) {
    throw new Error('Vui lòng nhập link định vị trước khi lấy dữ liệu.')
  }

  const response = await fetch(TRACKING_SCRAPE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ link: normalizedLink }),
  })

  const parsed = await response.json().catch(() => null)
  if (!response.ok || !parsed?.success || !parsed?.data || isEmptyObject(parsed.data)) {
    throw new Error(parsed?.message || 'Link sai hoặc dữ liệu trả về rỗng. Vui lòng lấy lại link.')
  }

  const lat = toCoordinate(parsed?.data?.coordinates?.lat, 90)
  const lng = toCoordinate(parsed?.data?.coordinates?.lng, 180)
  if (lat === null || lng === null) {
    throw new Error('Dữ liệu trả về rỗng hoặc thiếu vĩ độ/kinh độ. Vui lòng lấy lại link.')
  }

  const capturedAt = parseTrackingTimestamp(parsed?.data?.date, parsed?.data?.time)
  if (!capturedAt) {
    throw new Error('Dữ liệu trả về rỗng hoặc thiếu thời gian định vị. Vui lòng lấy lại link.')
  }

  const ageMs = Date.now() - capturedAt.getTime()
  if (Math.abs(ageMs) > MAX_TRACKING_AGE_MS) {
    throw new Error('Thời gian định vị đã lệch quá 5 phút so với thời gian máy. Vui lòng lấy link mới.')
  }

  const checks = {
    accuracyOk: true,
    spreadOk: true,
    freshOk: true,
    speedOk: true,
    signalStableOk: true,
    sampleCountOk: true,
    noMockedFlag: true,
    noAutomationFlag: true,
    onlineOk: true,
  }

  return {
    lat,
    lng,
    accuracy: null,
    minAccuracy: null,
    maxAccuracy: null,
    accuracySpread: 0,
    spread: 0,
    maxSpeedKmH: 0,
    timestamp: capturedAt.getTime(),
    capturedDate: parsed.data.date,
    capturedTime: parsed.data.time,
    ageMs,
    sourceLink: normalizedLink,
    trustScore: 100,
    trusted: true,
    checks,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    networkInfo: {
      supported: false,
      online: navigator.onLine,
    },
    webdriverFlag: navigator.webdriver === true,
    samples: [{ lat, lng, accuracy: null, timestamp: capturedAt.getTime(), mocked: false }],
  }
}
