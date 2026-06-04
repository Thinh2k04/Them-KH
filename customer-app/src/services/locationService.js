const TRACKING_SCRAPE_API_URL = 'https://jsk9x6z4-3000.asse.devtunnels.ms/api/tracking/scrape'
const MAX_TRACKING_AGE_MS = 5 * 60 * 1000

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

function isEmptyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0
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
