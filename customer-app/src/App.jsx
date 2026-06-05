import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point as turfPoint } from '@turf/helpers'
import {
  ADMIN_CODE_MAP,
  CHANNEL_OPTIONS,
  CHECK_LABELS,
  KV_OPTIONS,
  PRODUCT_GROUPS,
  PRODUCT_FIELD_LABELS,
  channelTypeMap,
  nppByKV,
  nganh_hang_options,
} from './constants/customerConfig'
import { collectGpsLocation, collectVerifiedLocation } from './services/locationService'
import { createInitialForm, formatDate } from './utils/customerHelpers'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './App.css'

const API_ORIGIN = (import.meta.env.VITE_API_ORIGIN || 'https://jsk9x6z4-3000.asse.devtunnels.ms').replace(/\/$/, '')
const CUSTOMER_API_URL = `${API_ORIGIN}/api/khachhang/`
const STORE_API_URL = `${API_ORIGIN}/api/cuahang`
const DMS_NEARBY_RADIUS_METERS = 1000

function buildLocationRejectionInfo({
  message = '',
  code,
  permissionState = 'prompt',
  secureContext = true,
  failedChecks = [],
}) {
  const normalizedMessage = String(message || '').trim()
  const rejection = {
    title: 'Vị trí có thể không chính xác',
    message: normalizedMessage || 'Không thể lấy vị trí.',
    hints: [],
  }

  if (!secureContext) {
    rejection.title = 'Trang chưa đủ điều kiện lấy vị trí'
    rejection.message = 'Trang phải mở bằng HTTPS hoặc localhost. Nếu mở bằng file:// hoặc http://, trình duyệt sẽ chặn GPS.'
    rejection.hints = ['Mở đúng link HTTPS/localhost', 'Không dùng file:// hoặc http://', 'Thử lại sau khi đổi đúng môi trường']
    return rejection
  }

  if (permissionState === 'denied' || code === 1) {
    rejection.title = 'Trình duyệt đã từ chối quyền vị trí'
    rejection.message = 'Bạn đang chặn quyền Location/GPS trong trình duyệt, nên app không thể lấy vị trí.'
    rejection.hints = [
      'Bấm biểu tượng ổ khóa cạnh thanh địa chỉ',
      'Đặt Location/GPS thành Allow',
      'Nếu đang dùng điện thoại, kiểm tra cả quyền vị trí của hệ điều hành',
    ]
    return rejection
  }

  if (code === 2 || /GPS|dịch vụ vị trí|định vị/i.test(normalizedMessage)) {
    rejection.title = 'Thiết bị chưa bật GPS'
    rejection.message = 'Máy đang tắt dịch vụ vị trí hoặc GPS, nên không thể lấy tọa độ chính xác.'
    rejection.hints = ['Bật GPS/dịch vụ vị trí trên máy', 'Ra nơi thoáng để bắt tín hiệu tốt hơn', 'Thử lại sau vài giây']
    return rejection
  }

  if (code === 3 || /quá thời gian|timeout/i.test(normalizedMessage)) {
    rejection.title = 'GPS bắt tín hiệu quá chậm'
    rejection.message = 'Thiết bị chưa bắt được GPS đủ nhanh hoặc tín hiệu quá yếu.'
    rejection.hints = ['Đứng gần cửa sổ hoặc ra ngoài trời', 'Tắt chế độ tiết kiệm pin cho GPS nếu có', 'Thử lại khi tín hiệu ổn định hơn']
    return rejection
  }

  if (/mô phỏng|mock/i.test(normalizedMessage)) {
    rejection.title = 'Thiết bị đang trả về vị trí mô phỏng'
    rejection.message = 'App phát hiện mock location nên từ chối để chống fake.'
    rejection.hints = ['Tắt mock location / vị trí giả', 'Gỡ app giả lập GPS nếu đang dùng', 'Thử lại bằng GPS thật của máy']
    return rejection
  }

  if (failedChecks.length > 0) {
    rejection.title = 'Vị trí có thể không chính xác (phát hiện giả mạo)'
    rejection.message = `Các kiểm tra không đạt: ${failedChecks.join(', ')}.`
    rejection.hints = [
      'Đứng ở nơi thoáng để GPS ổn định hơn',
      'Không dùng app giả lập vị trí',
      'Thử lại sau khi tín hiệu ổn định',
    ]
    return rejection
  }

  rejection.hints = ['Thử lại sau vài giây', 'Kiểm tra lại GPS và quyền vị trí', 'Đảm bảo đang ở môi trường thật, không phải vị trí mô phỏng']
  return rejection
}

function getInAppBrowserName(userAgent) {
  const ua = String(userAgent || '').toLowerCase()

  // Common in-app browsers / webviews
  if (ua.includes('zalo')) return 'Zalo'
  if (ua.includes('messenger')) return 'Messenger'
  if (ua.includes('instagram')) return 'Instagram'
  if (ua.includes('fbav') || ua.includes('fban')) return 'Facebook'
  if (ua.includes('line')) return 'LINE'
  if (ua.includes('snapchat')) return 'Snapchat'
  if (ua.includes('wv') || ua.includes('webview')) return 'In-app browser'

  return ''
}

function isStandalonePWA() {
  return (
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  )
}

function formatMetric(value, suffix = '') {
  return Number.isFinite(value) ? `${Number(value).toFixed(1)}${suffix}` : 'Không có'
}

function getPWAChecks({ installPrompt, serviceWorkerReady }) {
  const isSecure = window.isSecureContext
  const isStandalone = isStandalonePWA()
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const isAndroid = /android/i.test(navigator.userAgent)
  const isChrome = /chrome|crios/i.test(navigator.userAgent) && !/edg|opr|samsungbrowser/i.test(navigator.userAgent)
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome|crios|android/i.test(navigator.userAgent)

  return {
    isSecure,
    isStandalone,
    isIOS,
    isAndroid,
    isChrome,
    isSafari,
    canPromptInstall: Boolean(installPrompt),
    serviceWorkerReady,
  }
}

function normalizeNganhHang(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }

  return []
}

function toFiniteNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizedNganhHangOptions = nganh_hang_options.map((item) => String(item || '').trim()).filter(Boolean)

function normalizeCustomers(rawValue) {
  const toNormalizedArray = (list) =>
    list.map((customer) => ({
      ...customer,
      id: Number(customer?.id),
      anh: customer?.anh || customer?.anh_base64 || '',
      vi_do: toFiniteNumber(customer?.vi_do),
      kinh_do: toFiniteNumber(customer?.kinh_do),
      ngay_tao: customer?.ngay_tao || '',
    }))

  if (Array.isArray(rawValue)) {
    return toNormalizedArray(rawValue)
  }

  if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.data)) {
    return toNormalizedArray(rawValue.data)
  }

  return []
}

function normalizeStores(rawValue) {
  const toNormalizedArray = (list) =>
    list.map((store, index) => ({
      ...store,
      id: store?.id ?? index,
      TenCH: store?.TenCH || store?.ten || store?.ten_ch || '',
      DiaChi: store?.DiaChi || store?.dia_chi || '',
      Phuong: store?.Phuong || store?.phuong || '',
      Tinh: store?.Tinh || store?.tinh || '',
      NPP: store?.NPP || store?.npp || '',
      CoTrenDMS: Boolean(store?.CoTrenDMS ?? store?.co_tren_dms),
      HinhAnh: store?.HinhAnh || store?.hinh_anh || '',
      GhiChu: store?.GhiChu || store?.ghi_chu || '',
    }))

  if (Array.isArray(rawValue)) {
    return toNormalizedArray(rawValue)
  }

  if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.data)) {
    return toNormalizedArray(rawValue.data)
  }

  return []
}

async function fetchCustomers() {
  const response = await fetch(CUSTOMER_API_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Không thể tải danh sách khách hàng từ API.')
  }

  const parsed = await response.json()
  return normalizeCustomers(parsed)
}

async function fetchStores() {
  const response = await fetch(STORE_API_URL, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error('Không thể tải danh sách cửa hàng từ API.')
  }

  const parsed = await response.json()
  return normalizeStores(parsed)
}

async function saveCustomer(customerPayload) {
  const response = await fetch(CUSTOMER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
    },
    body: JSON.stringify(customerPayload),
  })

  if (!response.ok) {
    const parsed = await response.json().catch(() => null)
    throw new Error(parsed?.message || 'Không thể lưu khách hàng lên API.')
  }
}

async function saveStore(storePayload) {
  const response = await fetch(STORE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: 'application/json',
      'Accept-Charset': 'utf-8',
    },
    body: JSON.stringify(storePayload),
  })

  if (!response.ok) {
    const parsed = await response.json().catch(() => null)
    throw new Error(parsed?.message || 'Không thể lưu cửa hàng lên API.')
  }
}

async function uploadCustomerImage(file) {
  const formData = new FormData()
  formData.append('anh', file)

  const response = await fetch(`${API_ORIGIN}/upload`, {
    method: 'POST',
    body: formData,
  })

  const parsed = await response.json().catch(() => null)
  if (!response.ok || !parsed?.success || !parsed?.path) {
    throw new Error(parsed?.message || 'Upload ảnh thất bại.')
  }

  return String(parsed.path).trim()
}

function resizeImageFile(file, maxDimension = 960, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      const ratio = Math.min(1, maxDimension / Math.max(image.width, image.height))
      const width = Math.max(1, Math.round(image.width * ratio))
      const height = Math.max(1, Math.round(image.height * ratio))

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(objectUrl)
        reject(new Error('Không thể xử lý ảnh từ camera.'))
        return
      }

      context.drawImage(image, 0, 0, width, height)
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality)

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl)
          if (!blob) {
            reject(new Error('Không thể nén ảnh từ camera.'))
            return
          }

          const fileName = file.name?.replace(/\.[^.]+$/, '') || `camera_${Date.now()}`
          const compressedFile = new File([blob], `${fileName}.jpg`, { type: 'image/jpeg' })
          resolve({ dataUrl: compressedDataUrl, file: compressedFile })
        },
        'image/jpeg',
        quality
      )
    }

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Không thể đọc ảnh từ camera.'))
    }

    image.src = objectUrl
  })
}

function toImageDataUrl(imageValue) {
  if (!imageValue) {
    return ''
  }

  const trimmed = String(imageValue).trim()
  if (!trimmed) {
    return ''
  }

  if (/^data:image\//i.test(trimmed)) {
    return trimmed
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  if (trimmed.startsWith('/')) {
    return `${API_ORIGIN}${trimmed}`
  }

  if (/^[A-Za-z0-9_\-/]+\.(jpg|jpeg|png|webp|gif)$/i.test(trimmed)) {
    return `${API_ORIGIN}/${trimmed.replace(/^\/+/, '')}`
  }

  return `data:image/jpeg;base64,${trimmed}`
}

function updateBounds(lng, lat, bounds) {
  if (lng < bounds.minLng) bounds.minLng = lng
  if (lng > bounds.maxLng) bounds.maxLng = lng
  if (lat < bounds.minLat) bounds.minLat = lat
  if (lat > bounds.maxLat) bounds.maxLat = lat
}

function buildFeatureBounds(geometry) {
  const bounds = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  }

  if (!geometry) {
    return null
  }

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates || []) {
      for (const [lng, lat] of ring || []) {
        updateBounds(lng, lat, bounds)
      }
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates || []) {
      for (const ring of polygon || []) {
        for (const [lng, lat] of ring || []) {
          updateBounds(lng, lat, bounds)
        }
      }
    }
  } else {
    return null
  }

  if (!Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.minLat)) {
    return null
  }

  return bounds
}

function prepareNppAreas(featureCollection) {
  const features = Array.isArray(featureCollection?.features) ? featureCollection.features : []

  return features
    .map((feature) => {
      const geometry = feature?.geometry
      const npp = feature?.properties?.npp
      if (!geometry || !npp) {
        return null
      }

      const bbox = buildFeatureBounds(geometry)
      if (!bbox) {
        return null
      }

      return { feature, bbox }
    })
    .filter(Boolean)
}

function findNppFeatureByPoint(point, areasPrepared) {
  const [lng, lat] = point
  const targetPoint = turfPoint(point)

  for (const item of areasPrepared || []) {
    const { feature, bbox } = item

    if (lng < bbox.minLng || lng > bbox.maxLng || lat < bbox.minLat || lat > bbox.maxLat) {
      continue
    }

    if (booleanPointInPolygon(targetPoint, feature)) {
      return feature
    }
  }

  return null
}

function findKvByNpp(npp) {
  if (!npp) {
    return ''
  }

  return (
    Object.entries(nppByKV).find(([, nppList]) =>
      Array.isArray(nppList) ? nppList.includes(npp) : false
    )?.[0] || ''
  )
}

function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180
  const earthRadius = 6371000
  const dLat = toRadians(lat2 - lat1)
  const dLng = toRadians(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return earthRadius * c
}

function parseLooseCoordinate(value, type) {
  const direct = Number(value)
  if (Number.isFinite(direct) && Math.abs(direct) <= 180) {
    return direct
  }

  const text = String(value || '').trim()
  if (!text) {
    return null
  }

  const digits = text.replace(/\D/g, '')
  if (!digits) {
    return null
  }

  const integerDigits = type === 'lng' ? 3 : 2
  if (digits.length <= integerDigits) {
    return null
  }

  const normalizedText = `${digits.slice(0, integerDigits)}.${digits.slice(integerDigits)}`
  const parsed = Number(normalizedText)
  if (!Number.isFinite(parsed)) {
    return null
  }

  if (type === 'lat') {
    return Math.abs(parsed) <= 90 ? parsed : null
  }

  return Math.abs(parsed) <= 180 ? parsed : null
}

function extractTrackingLink(value) {
  const text = String(value || '').trim()
  const matched = text.match(/https:\/\/h5\.timemark\.com\/s\/[A-Za-z0-9_-]+\/\d+(?:[^\s]*)?/i)
  return matched?.[0] || ''
}


function stripAdministrativePrefix(value) {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return ''
  }

  return normalized
    .replace(/^(thanh pho|tp\.?|tinh|quan|huyen|thi xa|thi tran|xa|phuong)\s+/i, '')
    .trim()
}

function extractWardAndProvinceFromAddress(address) {
  if (!address || typeof address !== 'object') {
    return { phuong: '', tinh: '' }
  }

  const wardRaw =
    address.suburb ||
    address.city_district ||
    address.quarter ||
    address.neighbourhood ||
    address.village ||
    address.town ||
    ''

  const provinceRaw = address.state || address.city || address.province || ''

  return {
    phuong: stripAdministrativePrefix(wardRaw),
    tinh: stripAdministrativePrefix(provinceRaw),
  }
}

async function reverseGeocodeWardAndProvince(lat, lng) {
  const endpoint = new URL('https://nominatim.openstreetmap.org/reverse')
  endpoint.searchParams.set('format', 'jsonv2')
  endpoint.searchParams.set('lat', String(lat))
  endpoint.searchParams.set('lon', String(lng))
  endpoint.searchParams.set('addressdetails', '1')
  endpoint.searchParams.set('accept-language', 'vi')

  const response = await fetch(endpoint.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })
 
  if (!response.ok) {
    throw new Error('Không thể phân tích địa chỉ từ GPS.')
  }

  const parsed = await response.json().catch(() => null)
  return extractWardAndProvinceFromAddress(parsed?.address)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createDmsPopupContent(customer) {
  const fields = [
    ['Mã', customer?.ma || customer?.makh],
    ['Tên', customer?.ten || customer?.tenkh],
    ['Loại', customer?.loai || customer?.loai_kh],
    ['Kênh', customer?.kenh],
    ['SĐT', customer?.sdt],
  ]

  const metaRows = fields
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`)
    .join('')

  const imageUrl = customer?.anh || customer?.hinh_anh
  const image = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(customer?.ten || customer?.tenkh || 'Quán ăn DMS')}" class="map-popup-image" />`
    : ''

  return `<div class="map-popup-content">${metaRows}${image}</div>`
}

function App() {
  const [form, setForm] = useState(() => {
    const initial = createInitialForm()
    return {
      ...initial,
      kenh: '',
      loai: '',
      kv: '',
      npp: '',
      nganh_hang: [],
    }
  })
  const [customers, setCustomers] = useState([])
  const [stores, setStores] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedStore, setSelectedStore] = useState(null)
  const [loginCode, setLoginCode] = useState('')
  const [currentUserCode, setCurrentUserCode] = useState('')
  const [currentUser, setCurrentUser] = useState('')
  const [nppAreasPrepared, setNppAreasPrepared] = useState([])
  const [detectedNpp, setDetectedNpp] = useState('')
  const [detectedKv, setDetectedKv] = useState('')
  const [dmsCustomers, setDmsCustomers] = useState([])
  const [loadingDmsCustomers, setLoadingDmsCustomers] = useState(false)
  const [loadingCustomers, setLoadingCustomers] = useState(false)
  const [loadingStores, setLoadingStores] = useState(false)
  const [locationData, setLocationData] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [dmsStatus, setDmsStatus] = useState(null)
  const [showExpandedMap, setShowExpandedMap] = useState(false)
  const [showLocationPrompt, setShowLocationPrompt] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [locationRejectionInfo, setLocationRejectionInfo] = useState(null)
  const [locationInlineNotice, setLocationInlineNotice] = useState(null)
  const [trackingLink, setTrackingLink] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [blockedBrowserName] = useState(() => (isStandalonePWA() ? '' : getInAppBrowserName(navigator.userAgent)))
  const [installPrompt, setInstallPrompt] = useState(null)
  const [isAppInstalled, setIsAppInstalled] = useState(() => isStandalonePWA())
  const [installMessage, setInstallMessage] = useState('')
  const [serviceWorkerReady, setServiceWorkerReady] = useState(() => Boolean(navigator.serviceWorker?.controller))
  const [showStoreList, setShowStoreList] = useState(false)
  const [searchCustomer, setSearchCustomer] = useState('')
  const [searchStore, setSearchStore] = useState('')

  const fileInputRef = useRef(null)
  const miniMapRef = useRef(null)
  const miniMapInstanceRef = useRef(null)
  const miniMapLayersRef = useRef([])
  const miniMapClusterRef = useRef(null)
  const miniMapBaseLayerRef = useRef(null)
  const expandedMapRef = useRef(null)
  const expandedMapInstanceRef = useRef(null)
  const expandedMapLayersRef = useRef([])
  const cachedDmsRef = useRef(null)
  const gettingLocationRef = useRef(false)

  const locationBadge = useMemo(() => {
    if (!locationData) {
      return { label: 'Chưa xác thực vị trí', tone: 'neutral' }
    }

    if (!locationData.trusted) {
      return { label: 'Vị trí có thể không chính xác', tone: 'danger' }
    }

    if (detectedNpp && detectedKv) {
      return { label: 'Vị trí thành công', tone: 'success' }
    }

    return { label: 'Chưa tìm thấy NPP/Khu vực', tone: 'danger' }
  }, [locationData, detectedNpp, detectedKv])

  const visibleCustomers = useMemo(() => {
    if (!currentUser) {
      return []
    }

    const allowedCreators = new Set(
      [currentUserCode, currentUser]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )

    return normalizeCustomers(customers).filter((customer) =>
      allowedCreators.has(String(customer?.nguoi_tao || '').trim())
    )
  }, [customers, currentUser, currentUserCode])

  const visibleStores = useMemo(() => {
    if (!currentUser) {
      return []
    }

    const allowedCreators = new Set(
      [currentUserCode, currentUser]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )

    return normalizeStores(stores).filter((store) =>
      allowedCreators.has(String(store?.nguoi_tao || '').trim())
    )
  }, [stores, currentUser, currentUserCode])

  const filteredVisibleCustomers = useMemo(() => {
    if (!searchCustomer.trim()) {
      return visibleCustomers
    }

    const lowerSearch = searchCustomer.toLowerCase()
    return visibleCustomers.filter((customer) => {
      const ten = String(customer?.ten || '').toLowerCase()
      const npp = String(customer?.npp || '').toLowerCase()
      const loai = String(customer?.loai || '').toLowerCase()
      return ten.includes(lowerSearch) || npp.includes(lowerSearch) || loai.includes(lowerSearch)
    })
  }, [visibleCustomers, searchCustomer])

  const filteredVisibleStores = useMemo(() => {
    if (!searchStore.trim()) {
      return visibleStores
    }

    const lowerSearch = searchStore.toLowerCase()
    return visibleStores.filter((store) => {
      const tenCH = String(store?.TenCH || '').toLowerCase()
      const diaChi = String(store?.DiaChi || '').toLowerCase()
      const npp = String(store?.NPP || '').toLowerCase()
      return tenCH.includes(lowerSearch) || diaChi.includes(lowerSearch) || npp.includes(lowerSearch)
    })
  }, [visibleStores, searchStore])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault()
      setInstallPrompt(event)
      setInstallMessage('')
    }

    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setIsAppInstalled(true)
      setInstallMessage('App đã được cài vào máy.')
    }

    const handlePWAStatusChange = (event) => {
      if (typeof event.detail?.serviceWorkerReady === 'boolean') {
        setServiceWorkerReady(event.detail.serviceWorkerReady)
      }
    }

    const handleControllerChange = () => {
      setServiceWorkerReady(true)
    }

    const handleDisplayModeChange = () => {
      setIsAppInstalled(isStandalonePWA())
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('pwa-status-change', handlePWAStatusChange)
    navigator.serviceWorker?.addEventListener?.('controllerchange', handleControllerChange)

    const displayModeQueries = [
      window.matchMedia?.('(display-mode: fullscreen)'),
      window.matchMedia?.('(display-mode: standalone)'),
      window.matchMedia?.('(display-mode: minimal-ui)'),
    ].filter(Boolean)

    displayModeQueries.forEach((query) => {
      query.addEventListener?.('change', handleDisplayModeChange)
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('pwa-status-change', handlePWAStatusChange)
      navigator.serviceWorker?.removeEventListener?.('controllerchange', handleControllerChange)
      displayModeQueries.forEach((query) => {
        query.removeEventListener?.('change', handleDisplayModeChange)
      })
    }
  }, [])

  async function handleInstallPWA() {
    const pwaChecks = getPWAChecks({ installPrompt, serviceWorkerReady })

    if (isStandalonePWA()) {
      setIsAppInstalled(true)
      setInstallMessage('App đã chạy ở chế độ cài đặt.')
      return
    }

    if (!pwaChecks.isSecure) {
      setInstallMessage('Chưa thể cài: hãy mở bằng link HTTPS đã deploy, không dùng http/IP local.')
      return
    }

    if (!installPrompt) {
      if (pwaChecks.isIOS) {
        setInstallMessage('iPhone: chỉ Safari cài được. Mở bằng Safari, bấm Chia sẻ, chọn Thêm vào màn hình chính.')
        return
      }

      if (!pwaChecks.serviceWorkerReady) {
        setInstallMessage('Đang chuẩn bị chế độ cài app. Vui lòng tải lại trang sau vài giây rồi bấm Cài app.')
        return
      }

      setInstallMessage('Android: mở bằng Chrome, bấm menu, chọn Cài đặt ứng dụng. Không dùng Zalo/Facebook/Messenger.')
      return
    }

    const promptEvent = installPrompt
    setInstallPrompt(null)
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice

    if (choice.outcome === 'accepted') {
      setIsAppInstalled(true)
      setInstallMessage('Đang cài app vào máy.')
    } else {
      setInstallMessage('Bạn đã hủy cài app.')
    }
  }

  async function loadCustomers({ showError = true } = {}) {
    setLoadingCustomers(true)

    try {
      const parsedCustomers = await fetchCustomers()
      setCustomers(parsedCustomers)
      if (showError) {
        setError('')
      }
      return true
    } catch {
      if (showError) {
        setError('Không thể tải lại danh sách quán ăn.')
      }
      return false
    } finally {
      setLoadingCustomers(false)
    }
  }

  async function loadStores({ showError = true } = {}) {
    setLoadingStores(true)

    try {
      const parsedStores = await fetchStores()
      setStores(parsedStores)
      if (showError) {
        setError('')
      }
      return true
    } catch {
      if (showError) {
        setError('Không thể tải lại danh sách thực địa.')
      }
      return false
    } finally {
      setLoadingStores(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      try {
        const parsedCustomers = await fetchCustomers()

        if (!cancelled) {
          setCustomers(parsedCustomers)
        }
      } catch {
        // Ignore load failures and allow user to create new data.
      }
    }

    loadInitialData()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadInitialStores() {
      try {
        const parsedStores = await fetchStores()

        if (!cancelled) {
          setStores(parsedStores)
        }
      } catch {
        // Ignore load failures and allow manual refresh from the button.
      }
    }

    loadInitialStores()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!selectedCustomer) {
      return undefined
    }

    function handleEsc(event) {
      if (event.key === 'Escape') {
        setSelectedCustomer(null)
      }
    }

    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [selectedCustomer])

  useEffect(() => {
    let cancelled = false

    async function loadAreas() {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}areas.geojson`, { cache: 'no-store' })
        if (!response.ok) {
          return
        }

        const parsed = await response.json()
        if (!cancelled) {
          setNppAreasPrepared(prepareNppAreas(parsed))
        }
      } catch {
        // Ignore area data load failures.
      }
    }

    loadAreas()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!locationData) {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove()
        miniMapInstanceRef.current = null
      }
      miniMapLayersRef.current = []
      miniMapClusterRef.current = null
      return
    }

    if (!miniMapRef.current) {
      return
    }

    if (!miniMapInstanceRef.current) {
      const map = L.map(miniMapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([locationData.lat, locationData.lng], 16)

      const baseLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri — Source: Esri, DigitalGlobe, Earthstar Geographics, USDA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, and the GIS User Community',
        maxZoom: 19,
        minZoom: 5,
      }).addTo(map)

      miniMapBaseLayerRef.current = baseLayer

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
        attribution: '',
        maxZoom: 22,
        minZoom: 5,
        opacity: 0.9,
        subdomains: 'abcd',
      }).addTo(map)

      miniMapInstanceRef.current = map
    }

    const map = miniMapInstanceRef.current
    miniMapLayersRef.current.forEach((layer) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer)
      }
    })
    miniMapLayersRef.current = []
    if (miniMapClusterRef.current) {
      map.removeLayer(miniMapClusterRef.current)
      miniMapClusterRef.current = null
    }

    const currentPoint = [locationData.lng, locationData.lat]
    const currentLatLng = [locationData.lat, locationData.lng]
    const matchedFeature = findNppFeatureByPoint(currentPoint, nppAreasPrepared)
    const matchedNpp = matchedFeature?.properties?.npp || ''
    const matchedKv = findKvByNpp(matchedNpp)
    setDetectedNpp(matchedNpp)
    setDetectedKv(matchedKv)

    const markerLayer = L.circleMarker(currentLatLng, {
      radius: 6,
      color: '#dc2626',
      fillColor: '#ef4444',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map)
    miniMapLayersRef.current.push(markerLayer)

    if (matchedFeature) {
      const featureLayer = L.geoJSON(matchedFeature, {
        style: {
          color: '#2563eb',
          weight: 2,
          fillColor: '#60a5fa',
          fillOpacity: 0.22,
        },
      }).addTo(map)
      miniMapLayersRef.current.push(featureLayer)

      const tooltipLayer = L.tooltip({
        permanent: true,
        direction: 'top',
        className: 'npp-map-label',
      })
        .setLatLng(currentLatLng)
        .setContent(`NPP: ${matchedNpp}`)
        .addTo(map)
      miniMapLayersRef.current.push(tooltipLayer)

      map.fitBounds(featureLayer.getBounds(), { padding: [20, 20], maxZoom: 17 })
    } else {
      map.setView(currentLatLng, 16)
    }

    const clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 80,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 17,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount()
        return L.divIcon({
          html: `<span>${count}</span>`,
          className: 'custom-cluster-icon',
          iconSize: L.point(36, 36),
        })
      },
    })

    dmsCustomers.forEach((customer) => {
      const marker = L.marker([customer.vi_do_num, customer.kinh_do_num], {
        icon: L.divIcon({
          className: 'custom-dms-dot',
          iconSize: [12, 12],
        }),
      }).bindPopup(createDmsPopupContent(customer), { maxWidth: 260, className: 'dms-popup' })

      clusterGroup.addLayer(marker)
    })

    clusterGroup.addTo(map)
    miniMapClusterRef.current = clusterGroup

    map.invalidateSize()

    // extra invalidates to handle cases where container is animated/hidden at mount
    setTimeout(() => map.invalidateSize(), 250)
    requestAnimationFrame(() => requestAnimationFrame(() => map.invalidateSize()))

    // keep map responsive on window resize
    const resizeHandler = () => map.invalidateSize()
    window.addEventListener('resize', resizeHandler)

    // fallback to OSM if many tile errors (helps when provider blocks small tile requests)
    let tileErrorCount = 0
    const onTileError = () => {
      tileErrorCount += 1
      if (tileErrorCount === 1) {
        setTimeout(() => map.invalidateSize(), 300)
      }
      if (tileErrorCount >= 6) {
        try {
          if (miniMapBaseLayerRef.current && map.hasLayer(miniMapBaseLayerRef.current)) {
            map.removeLayer(miniMapBaseLayerRef.current)
          }
          const fallback = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxZoom: 19,
            minZoom: 5,
          }).addTo(map)
          miniMapBaseLayerRef.current = fallback
        } catch {
          // ignore
        }
      }
    }
    map.on('tileerror', onTileError)

    return () => {
      window.removeEventListener('resize', resizeHandler)
      if (map && map.off) {
        map.off('tileerror', onTileError)
      }
    }
  }, [locationData, nppAreasPrepared, dmsCustomers])

  useEffect(() => {
    if (!showExpandedMap || !locationData || !expandedMapRef.current) {
      if (expandedMapInstanceRef.current) {
        expandedMapInstanceRef.current.remove()
        expandedMapInstanceRef.current = null
      }
      expandedMapLayersRef.current = []
      return
    }

    if (!expandedMapInstanceRef.current) {
      const map = L.map(expandedMapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([locationData.lat, locationData.lng], 15)

      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri — Source: Esri, DigitalGlobe, Earthstar Geographics, USDA, USGS, AEX, Getmapping, Aerogrid, IGN, IGP, and the GIS User Community',
        maxZoom: 19,
        minZoom: 5,
      }).addTo(map)

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}.png', {
        attribution: '',
        maxZoom: 22,
        minZoom: 5,
        opacity: 0.9,
        subdomains: 'abcd',
      }).addTo(map)

      expandedMapInstanceRef.current = map
    }

    const map = expandedMapInstanceRef.current
    expandedMapLayersRef.current.forEach((layer) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer)
      }
    })
    expandedMapLayersRef.current = []

    const matchedFeature = findNppFeatureByPoint([locationData.lng, locationData.lat], nppAreasPrepared)
    if (matchedFeature) {
      const featureLayer = L.geoJSON(matchedFeature, {
        style: {
          color: '#2563eb',
          weight: 2,
          fillColor: '#60a5fa',
          fillOpacity: 0.2,
        },
      }).addTo(map)
      expandedMapLayersRef.current.push(featureLayer)
      map.fitBounds(featureLayer.getBounds(), { padding: [24, 24], maxZoom: 16 })
    } else {
      map.setView([locationData.lat, locationData.lng], 15)
    }

    const currentMarker = L.circleMarker([locationData.lat, locationData.lng], {
      radius: 7,
      color: '#1d4ed8',
      fillColor: '#3b82f6',
      fillOpacity: 1,
      weight: 2,
    })
      .bindTooltip('Vị trí của tôi', { direction: 'top' })
      .addTo(map)
    expandedMapLayersRef.current.push(currentMarker)

    dmsCustomers.forEach((customer) => {
      const marker = L.circleMarker([customer.vi_do_num, customer.kinh_do_num], {
        radius: 6,
        color: '#dc2626',
        fillColor: '#ef4444',
        fillOpacity: 0.95,
        weight: 2,
      })
        .bindPopup(createDmsPopupContent(customer), { maxWidth: 280, className: 'dms-popup' })
        .addTo(map)
      expandedMapLayersRef.current.push(marker)
    })

    map.invalidateSize()
  }, [showExpandedMap, locationData, nppAreasPrepared, dmsCustomers])

  function handleFocusMyMapPoint() {
    if (!expandedMapInstanceRef.current || !locationData) {
      return
    }
    expandedMapInstanceRef.current.setView([locationData.lat, locationData.lng], 18)
  }

  useEffect(() => {
    return () => {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove()
        miniMapInstanceRef.current = null
      }
      if (expandedMapInstanceRef.current) {
        expandedMapInstanceRef.current.remove()
        expandedMapInstanceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadDmsCustomers() {
      if (!detectedNpp) {
        setDmsCustomers([])
        return
      }

      setLoadingDmsCustomers(true)
      try {
        // Fetch and cache parsed DMS customers to avoid re-parsing on each location change
        let parsed = cachedDmsRef.current
        if (!parsed) {
          const res = await fetch(`${import.meta.env.BASE_URL}khach-hang.js`)
          const raw = await res.json()

          parsed = raw
            .map((item) => {
              const lat = parseLooseCoordinate(item?.vi_do, 'lat')
              const lng = parseLooseCoordinate(item?.kinh_do, 'lng')
              return {
                ...item,
                vi_do_num: Number.isFinite(lat) ? lat : null,
                kinh_do_num: Number.isFinite(lng) ? lng : null,
              }
            })
            .filter((item) => item.vi_do_num !== null && item.kinh_do_num !== null)

          cachedDmsRef.current = parsed
        }

        if (!locationData) {
          if (!cancelled) setDmsCustomers([])
          return
        }

        // Quick bbox prefilter to avoid expensive distance calculations for all points
        const lat = Number(locationData.lat)
        const lng = Number(locationData.lng)
        const latDelta = DMS_NEARBY_RADIUS_METERS / 111320 // approx meters per degree lat
        const lngMetersPerDeg = Math.max(1e-6, 111320 * Math.cos((lat * Math.PI) / 180))
        const lngDelta = DMS_NEARBY_RADIUS_METERS / lngMetersPerDeg

        const bboxCandidates = parsed.filter((customer) => {
          return (
            Math.abs(customer.vi_do_num - lat) <= latDelta &&
            Math.abs(customer.kinh_do_num - lng) <= lngDelta
          )
        })

        const nearbyList = bboxCandidates.filter((customer) => {
          const distance = calculateDistanceMeters(
            lat,
            lng,
            Number(customer.vi_do_num),
            Number(customer.kinh_do_num)
          )
          return distance <= DMS_NEARBY_RADIUS_METERS
        })

        if (!cancelled) {
          setDmsCustomers(nearbyList)
        }
      } catch {
        if (!cancelled) {
          setDmsCustomers([])
        }
      } finally {
        if (!cancelled) {
          setLoadingDmsCustomers(false)
        }
      }
    }

    loadDmsCustomers()
    return () => {
      cancelled = true
    }
  }, [detectedNpp, locationData])

  function handleLoginSubmit(event) {
    event.preventDefault()
    setLoginError('')

    const normalizedCode = String(loginCode || '').trim().toUpperCase()
    const userName = ADMIN_CODE_MAP[normalizedCode]
    if (!userName) {
      setLoginError('Mã đăng nhập không đúng. Vui lòng nhập lại.')
      return
    }

    setCurrentUserCode(normalizedCode)
    setCurrentUser(userName)
    setLoginCode('')
  }

  function updateField(key, value) {
    setError('')
    setForm((prev) => {
      if (key === 'kenh') {
        const nextKenh = value || ''
        return {
          ...prev,
          kenh: nextKenh,
          loai: channelTypeMap[nextKenh]?.[0] || '',
        }
      }

      if (key === 'kv') {
        const nextKv = value || ''
        return {
          ...prev,
          kv: nextKv,
          npp: nppByKV[nextKv]?.[0] || '',
        }
      }

      if (key === 'npp') {
        const nextNpp = value || ''
        const mappedKv = findKvByNpp(nextNpp)
        return {
          ...prev,
          npp: nextNpp,
          kv: mappedKv || prev.kv,
        }
      }

      return { ...prev, [key]: value }
    })
  }

  function handleNganhHangChange(option) {
    const normalizedOption = String(option || '').trim()

    if (!normalizedOption) {
      return
    }

    setError('')
    setForm((prev) => {
      const currentNganhHang = normalizeNganhHang(prev.nganh_hang)
      const hasOption = currentNganhHang.includes(normalizedOption)
      const nextNganhHang = hasOption
        ? currentNganhHang.filter((item) => item !== normalizedOption)
        : [...currentNganhHang, normalizedOption]

      return {
        ...prev,
        nganh_hang: nextNganhHang,
      }
    })
  }

  function handleOpenLocationPrompt() {
    if (gettingLocationRef.current || loadingLocation) {
      return
    }

    setError('')
    setLocationRejectionInfo(null)
    setLocationInlineNotice(null)
    void handleResolveLocation()
  }

  function handleOpenGpsPrompt() {
    if (gettingLocationRef.current || loadingLocation) {
      return
    }

    setError('')
    setLocationRejectionInfo(null)
    setLocationInlineNotice(null)
    setShowLocationPrompt(true)
  }

  function resetTrackingResult() {
    setLocationData(null)
    setDetectedNpp('')
    setDetectedKv('')
    setDmsCustomers([])
    setDmsStatus(null)
    setShowExpandedMap(false)
    setLocationRejectionInfo(null)
    setLocationInlineNotice(null)
  }

  function applyTrackingLink(nextLink) {
    setTrackingLink(nextLink)
    resetTrackingResult()
  }

  async function handlePasteTrackingLink() {
    setError('')
    applyTrackingLink('')

    try {
      const clipboardText = await navigator.clipboard.readText()
      const nextLink = extractTrackingLink(clipboardText)
      if (!nextLink) {
        setError('Clipboard không có link định vị Timemark hợp lệ để dán.')
        return
      }
      applyTrackingLink(nextLink)
    } catch {
      setError('Không thể đọc clipboard. Vui lòng bấm nút Dán lại sau khi copy link định vị.')
    }
  }

  function handleTrackingLinkChange(event) {
    applyTrackingLink(event.target.value)
    setError('')
  }

  function handleTrackingLinkPaste(event) {
    const pastedText = event.clipboardData?.getData('text') || ''
    const nextLink = extractTrackingLink(pastedText)

    if (!nextLink) {
      return
    }

    event.preventDefault()
    setError('')
    applyTrackingLink(nextLink)
  }

  function applyVerifiedLocation(verified) {
    setLocationData(verified)

    if (Number.isFinite(verified?.lat) && Number.isFinite(verified?.lng)) {
      void reverseGeocodeWardAndProvince(verified.lat, verified.lng)
        .then(({ phuong, tinh }) => {
          if (phuong || tinh) {
            setForm((prev) => ({
              ...prev,
              phuong: phuong || prev.phuong || '',
              tinh: tinh || prev.tinh || '',
            }))
          }
        })
        .catch(() => {})
    }

    if (!verified.trusted) {
      const failedChecks = Object.entries(verified.checks)
        .filter(([, value]) => !value)
        .map(([key]) => CHECK_LABELS[key])
        .filter(Boolean)
      const rejectionInfo = buildLocationRejectionInfo({
        message: `Vị trí có thể không chính xác. Kiểm tra thất bại: ${failedChecks.join(', ')}.`,
        permissionState: 'granted',
        secureContext: window.isSecureContext,
        failedChecks,
      })

      setLocationRejectionInfo(rejectionInfo)
      setLocationInlineNotice({
        title: 'Vị trí chưa đạt chuẩn',
        message: rejectionInfo.message,
        hints: rejectionInfo.hints,
        failedChecks,
        locationData: verified,
      })
      setError('')
    }
  }

  function resetMiniMap() {
    if (miniMapInstanceRef.current) {
      miniMapInstanceRef.current.remove()
      miniMapInstanceRef.current = null
      miniMapLayersRef.current = []
    }
  }

  async function handleResolveLocation() {
    if (gettingLocationRef.current || loadingLocation) {
      return
    }
    gettingLocationRef.current = true
    setShowLocationPrompt(false)
    setLoadingLocation(true)
    setDmsStatus(null)
    setLocationRejectionInfo(null)
    setLocationInlineNotice(null)

    try {
      resetMiniMap()
      applyVerifiedLocation(await collectVerifiedLocation(trackingLink))
    } catch (err) {
      const message = err?.message || 'Không thể lấy vị trí. Vui lòng thử lại.'
      const rejectionInfo = buildLocationRejectionInfo({
        message,
        code: err?.code,
        permissionState: 'granted',
        secureContext: window.isSecureContext,
      })

      setLocationRejectionInfo(rejectionInfo)
      setError(message)
    } finally {
      setLoadingLocation(false)
      gettingLocationRef.current = false
    }
  }

  async function handleResolveGpsLocation() {
    if (gettingLocationRef.current || loadingLocation) {
      return
    }

    gettingLocationRef.current = true
    setShowLocationPrompt(false)
    setLoadingLocation(true)
    setDmsStatus(null)
    setLocationRejectionInfo(null)
    setLocationInlineNotice(null)
    setError('')

    try {
      resetMiniMap()
      applyVerifiedLocation(await collectGpsLocation())
    } catch (err) {
      const message = err?.message || 'Không thể lấy GPS chính xác. Vui lòng thử lại.'
      resetTrackingResult()
      const rejectionInfo = buildLocationRejectionInfo({
        message,
        code: err?.code,
        permissionState: err?.code === 1 ? 'denied' : 'granted',
        secureContext: window.isSecureContext,
      })

      if (err?.code === 1) {
        setLocationRejectionInfo(rejectionInfo)
        setError(message)
        setShowLocationPrompt(true)
      } else {
        setShowLocationPrompt(false)
        setLocationInlineNotice({
          title: rejectionInfo.title,
          message: rejectionInfo.message,
          hints: rejectionInfo.hints,
        })
        setError('')
      }
    } finally {
      setLoadingLocation(false)
      gettingLocationRef.current = false
    }
  }

  function handleSelectDmsStatus(nextStatus) {
    if (!locationData?.trusted) {
      setError('Vị trí có thể không chính xác. Vui lòng lấy lại vị trí.')
      return
    }
    if (!detectedNpp || !detectedKv) {
      setError('Chỉ xác nhận khi đã tìm thấy NPP theo GPS và khu vực.')
      return
    }
    setForm((prev) => ({
      ...prev,
      kv: detectedKv,
      npp: detectedNpp,
    }))
    setError('')
    setDmsStatus(nextStatus)
  }

  function handleOpenCamera() {
    setError('')

    fileInputRef.current?.click()
  }

  async function handlePhotoFileChange(event) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setError('')

    if (!file.type.startsWith('image/')) {
      setError('Tệp đã chọn không phải ảnh hợp lệ. Vui lòng chụp lại.')
      event.target.value = ''
      return
    }

    try {
      const optimized = await resizeImageFile(file)
      setPhotoFile(optimized.file)
      setPhotoDataUrl(optimized.dataUrl)
    } catch {
      setError('Không thể xử lý ảnh từ camera. Vui lòng thử lại.')
    }

    event.target.value = ''
  }

  function resetForm() {
    const initial = createInitialForm()
    setForm({
      ...initial,
      kenh: '',
      loai: '',
    })
    setLocationData(null)
    setDetectedNpp('')
    setDetectedKv('')
    setDmsCustomers([])
    setDmsStatus(null)
    setTrackingLink('')
    setShowExpandedMap(false)
    setPhotoFile(null)
    setPhotoDataUrl('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const selectedKenh = form.kenh || ''
      const selectedLoai = form.loai || ''
      const selectedKv = form.kv || ''
      const selectedNpp = form.npp || ''
      const selectedNganhHang = normalizeNganhHang(form.nganh_hang)
      const tenKhachHang = String(form.ten || '').trim()
      const tenCuaHang = String(form.ten_ch || '').trim()
      const ghiChuCuaHang = String(form.ghi_chu || '').trim()
      const ghiChuKhachHang = String(form.ghi_chu_kh || '').trim()
      const diaChi = String(form.dia_chi || '').trim()
      const phuong = String(form.phuong || '').trim()
      const tinh = String(form.tinh || '').trim()

      const validKenh = CHANNEL_OPTIONS.includes(selectedKenh)
      const validLoai = (channelTypeMap[selectedKenh] || []).includes(selectedLoai)
      const validKv = KV_OPTIONS.includes(selectedKv)
      const validNpp = (nppByKV[selectedKv] || []).includes(selectedNpp)
      const validNganhHang =
        selectedNganhHang.length > 0 &&
        selectedNganhHang.every((item) => normalizedNganhHangOptions.includes(item))

      if (dmsStatus === null) {
        throw new Error('Vui lòng xác nhận trạng thái khách hàng trên DMS trước khi lưu.')
      }

      if (!validKv || !validNpp) {
        throw new Error('Vui lòng chọn đầy đủ Khu vực và NPP trước khi lưu.')
      }

      if (dmsStatus === 'noDms' && !tenKhachHang) {
        throw new Error('Vui lòng nhập tên khách hàng.')
      }

      if (!tenCuaHang || !selectedNpp.trim()) {
        throw new Error('Vui lòng nhập đầy đủ tên cửa hàng và nhà phân phối.')
      }

      if (!locationData?.trusted) {
        throw new Error('Bạn cần lấy vị trí đạt chuẩn trước khi lưu cửa hàng.')
      }

      if (!photoDataUrl) {
        throw new Error('Bạn cần chụp ảnh cửa hàng.')
      }
      if (!photoFile) {
        throw new Error('Thiếu file ảnh gốc để upload. Vui lòng chụp lại.')
      }

      const uploadedPath = await uploadCustomerImage(photoFile)

      // Collect product fields
      const productPayload = {}
      Object.keys(PRODUCT_FIELD_LABELS).forEach((field) => {
        productPayload[field] = Boolean(form[field])
      })

      if (dmsStatus === 'noDms') {
        if (!validKenh || !validLoai) {
          throw new Error('Vui lòng chọn đầy đủ Kênh và Loại trước khi lưu khách hàng mới.')
        }

        if (!validNganhHang) {
          throw new Error('Vui lòng chọn ít nhất 1 ngành hàng kinh doanh hợp lệ trước khi lưu.')
        }

        if (!diaChi || !phuong || !tinh) {
          throw new Error('Vui lòng nhập Địa chỉ, Phường, Tỉnh để lưu khách hàng mới.')
        }

        const customerPayload = {
          ten: tenKhachHang,
          kenh: selectedKenh,
          loai: selectedLoai,
          kv: selectedKv,
          npp: selectedNpp.trim(),
          CoTrenDMS: false,
          // send nganh_hang as a comma-separated string to match API expectation
          nganh_hang: Array.isArray(selectedNganhHang)
            ? selectedNganhHang.join(',')
            : String(selectedNganhHang || ''),
          nguoi_tao: currentUserCode || currentUser,
          anh: uploadedPath,
          vi_do: Number(locationData.lat.toFixed(8)),
          kinh_do: Number(locationData.lng.toFixed(8)),
          ghi_chu: ghiChuKhachHang || null,
          ...productPayload,
        }

        const storePayload = {
          TenCH: tenCuaHang,
          GhiChu: ghiChuCuaHang || null,
          DiaChi: diaChi,
          Phuong: phuong,
          NPP: selectedNpp.trim(),
          Tinh: tinh,
          CoTrenDMS: false,
          nguoi_tao: currentUser || currentUserCode,
          ...productPayload,
          HinhAnh: uploadedPath,
        }

        await Promise.all([saveCustomer(customerPayload), saveStore(storePayload)])
      } else if (dmsStatus === 'hasDms') {
        if (!diaChi || !phuong || !tinh) {
          throw new Error('Khách hàng đã có trên DMS: vui lòng nhập Địa chỉ, Phường, Tỉnh để lưu cửa hàng.')
        }

        const storePayload = {
          TenCH: tenCuaHang,
          GhiChu: ghiChuCuaHang || null,
          DiaChi: diaChi,
          Phuong: phuong,
          NPP: selectedNpp.trim(),
          Tinh: tinh,
          CoTrenDMS: true,
          nguoi_tao: currentUser || currentUserCode,
          ...productPayload,
          HinhAnh: uploadedPath,
        }

        await saveStore(storePayload)
      }

      resetForm()

      void Promise.all([
        loadCustomers({ showError: false }),
        loadStores({ showError: false }),
      ]).then(([reloadedCustomers, reloadedStores]) => {
        if (!reloadedCustomers || !reloadedStores) {
          setError(
            dmsStatus === 'hasDms'
              ? 'Đã lưu cửa hàng, nhưng không thể tải lại danh sách.'
              : 'Đã lưu khách hàng, nhưng không thể tải lại danh sách.'
          )
        }
      })
    } catch (err) {
      setError(err.message || 'Không thể lưu dữ liệu.')
    } finally {
      setSubmitting(false)
    }
  }

  const installPanel = !isAppInstalled ? (
    <div className="pwa-install-card">
      <div>
        <strong>Cài app vào máy</strong>
        {installMessage ? <p>{installMessage}</p> : <p>Bấm cài để mở app từ màn hình chính và không hiện thanh URL.</p>}
        <p className="pwa-install-status">
          HTTPS: {window.isSecureContext ? 'OK' : 'Chưa OK'} · SW: {serviceWorkerReady ? 'OK' : 'Đang bật'} · Prompt: {installPrompt ? 'OK' : 'Chưa có'}
        </p>
      </div>
      <button type="button" className="install-app-btn" onClick={handleInstallPWA}>
        Cài app
      </button>
    </div>
  ) : null

  if (blockedBrowserName) {
    return (
      <main className="page browser-gate">
        <section className="panel browser-gate-panel" role="dialog" aria-modal="true" aria-label="Yêu cầu mở bằng trình duyệt">
          <h2>Mở bằng Safari/Chrome</h2>
          <p className="hint">
            Bạn đang mở bằng <strong>{blockedBrowserName}</strong>. Vui lòng mở link bằng <strong>Safari</strong>{' '}
            (iPhone) hoặc <strong>Chrome</strong> (Android/PC) để tiếp tục sử dụng.
          </p>
          <div className="row-buttons">
            <button
              type="button"
              className="ghost"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(window.location.href)
                  alert('Đã copy link. Hãy dán vào Safari/Chrome để mở.')
                } catch {
                  prompt('Copy link này và mở bằng Safari/Chrome:', window.location.href)
                }
              }}
            >
              Copy link để mở bằng Safari/Chrome
            </button>
            <button
              type="button"
              onClick={() => {
                // Best-effort: some apps will offer "Open in browser" after opening a new tab
                alert('Vui lòng copy link và mở trực tiếp trong Safari/Chrome.')
              }}
            >
              Thử mở tab mới
            </button>
          </div>
          <ul className="meta-list">
            <li>iPhone: bấm nút chia sẻ (Share) → “Open in Safari”.</li>
            <li>Android: menu (⋮) → “Open in Chrome/Browser”.</li>
          </ul>
        </section>
      </main>
    )
  }

  if (!currentUser) {
    return (
      <main className="page">
        <section className="panel login-panel">
          <h2>Đăng nhập</h2>
          <p className="hint">Nhập mã quản trị để vào hệ thống thêm khách hàng.</p>
          {installPanel}
          <form onSubmit={handleLoginSubmit} className="login-form">
            <label>
              Mã đăng nhập
              <input
                value={loginCode}
                onChange={(event) => setLoginCode(event.target.value.toUpperCase())}
                placeholder="Ví dụ: ADTHANH"
                autoComplete="off"
              />
            </label>
            {loginError ? <p className="error">{loginError}</p> : null}
            <button type="submit">Vào hệ thống</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="page">
      <header className="page-header">
        <div className="header-content">
          <img src="https://res.cloudinary.com/dvg7ourbo/image/upload/v1766046738/logo22px_re6vqu.png" alt="Thêm khách hàng mới" className="logo" />
          <div>
            <p className="eyebrow">Thêm khách hàng mới</p>
            <h1>Hệ thống thêm khách hàng mới</h1>
            <p className="subtitle">Lấy vị trí GPS, chụp ảnh thực tế, và lưu thông tin khách hàng của bạn.</p>
            <p className="subtitle">Đăng nhập: <strong>{currentUser}</strong>{currentUserCode ? ` (${currentUserCode})` : ''}</p>
          </div>
          {installPanel}
        </div>
        {/* <button type="button" className="ghost" onClick={handleLogout}>Đăng xuất</button> */}
      </header>

      <section className="layout">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <h2>Thông tin khách hàng</h2>

          <div className="card-block">
            <div className="row-between">
              <h3>Xác nhận trạng thái khách hàng trên DMS</h3>
              <span className={`status ${locationBadge.tone}`}>{locationBadge.label}</span>
            </div>
            <div className="tracking-link-row">
              <label>
                Link định vị
                <input
                  type="url"
                  value={trackingLink}
                  onChange={handleTrackingLinkChange}
                  onPaste={handleTrackingLinkPaste}
                  placeholder="Bấm Dán"
                  inputMode="url"
                  autoComplete="off"
                />
              </label>
              <div className="tracking-actions">
                <button type="button" className="ghost paste-link-btn" onClick={handlePasteTrackingLink}>
                  Dán
                </button>
                <button
                  type="button"
                  className="fetch-location-btn"
                  onClick={handleOpenLocationPrompt}
                  disabled={loadingLocation}
                >
                  {loadingLocation ? 'Đang...' : 'Lấy từ link'}
                </button>
                <button
                  type="button"
                  className="gps-location-btn"
                  onClick={handleOpenGpsPrompt}
                  disabled={loadingLocation}
                >
                  {loadingLocation ? 'Đang...' : 'GPS Máy'}
                </button>
              </div>
            </div>

            {locationInlineNotice ? (
              <div className="location-warning-card">
                <strong>{locationInlineNotice.title}</strong>
                <p>{locationInlineNotice.message}</p>
                {locationInlineNotice.failedChecks?.length ? (
                  <ul>
                    {locationInlineNotice.failedChecks.map((check) => (
                      <li key={check}>{check}</li>
                    ))}
                  </ul>
                ) : null}
                {locationInlineNotice.hints?.length ? (
                  <ul>
                    {locationInlineNotice.hints.map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                ) : null}
                {locationInlineNotice.locationData ? (
                  <p>
                    Accuracy: {formatMetric(locationInlineNotice.locationData.accuracy, 'm')} ·
                    Spread: {formatMetric(locationInlineNotice.locationData.spread, 'm')} ·
                    Tín hiệu lệch: {formatMetric(locationInlineNotice.locationData.accuracySpread, 'm')} ·
                    Tốc độ: {formatMetric(locationInlineNotice.locationData.maxSpeedKmH, 'km/h')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {locationData ? (
              <div className="row-buttons location-extra-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setShowExpandedMap(true)}
                >
                  Xem bản đồ lớn
                </button>
              </div>
            ) : null}
            {locationData ? (
              <ul className="meta-list">
                <li>Vĩ độ: {locationData.lat.toFixed(8)}</li>
                <li>Kinh độ: {locationData.lng.toFixed(8)}</li>
                {locationData.capturedDate && locationData.capturedTime ? (
                  <li>Thời gian định vị: {locationData.capturedTime} {locationData.capturedDate}</li>
                ) : null}
                <li>Độ chính xác: {formatMetric(locationData.accuracy, 'm')}</li>
                <li>Số mẫu GPS: {Number.isFinite(locationData.sampleCount) ? locationData.sampleCount : locationData.samples?.length || 1}</li>
              </ul>
            ) : null}

            {locationData ? (
              <div className="location-map-card">
                <p className="hint">
                  Khu vực NPP theo GPS: <strong>{detectedNpp || 'Đang xác định'}</strong>
                </p>
                <p className="hint">
                  Khu vực theo NPP: <strong>{detectedKv || 'Đang xác định'}</strong>
                </p>
                <p className="hint">
                  Khách hàng DMS trong khu vực: <strong>{loadingDmsCustomers ? 'Đang tải...' : dmsCustomers.length}</strong>
                </p>
                <div ref={miniMapRef} className="mini-map-frame" />
              </div>
            ) : null}

            {locationData?.trusted && detectedNpp && detectedKv ? (
              <div className="row-buttons dms-choice-actions" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className={dmsStatus === 'noDms' ? 'active-choice' : ''}
                  onClick={() => handleSelectDmsStatus('noDms')}
                >
                  {dmsStatus === 'noDms'
                    ? 'Đã chọn khách hàng chưa có trên DMS'
                    : 'Khách hàng chưa có trên DMS'}
                </button>
                <button
                  type="button"
                  className={`${dmsStatus === 'hasDms' ? 'active-choice' : ''} ghost`.trim()}
                  onClick={() => handleSelectDmsStatus('hasDms')}
                >
                  {dmsStatus === 'hasDms'
                    ? 'Đã chọn khách hàng đã có trên DMS'
                    : 'Khách hàng đã có trên DMS'}
                </button>
              </div>
            ) : null}
          </div>

          {dmsStatus === null ? (
            <p className="hint">Hoàn tất bước xác nhận trạng thái DMS ở trên để mở phần nhập thông tin.</p>
          ) : (
            <>
              {dmsStatus === 'noDms' && (
                <label>
                  Tên khách hàng
                  <input
                    required
                    value={form.ten}
                    onChange={(event) => updateField('ten', event.target.value)}
                    placeholder="Nhập tên khách hàng"
                    autoComplete="organization"
                    enterKeyHint="next"
                  />
                </label>
              )}

              <label>
                Tên cửa hàng
                <input
                  required
                  value={form.ten_ch || ''}
                  onChange={(event) => updateField('ten_ch', event.target.value)}
                  placeholder="Nhập tên cửa hàng"
                  autoComplete="organization"
                />
              </label>

              <div className="grid-2">
                <label>
                  Địa chỉ
                  <input
                    value={form.dia_chi || ''}
                    onChange={(event) => updateField('dia_chi', event.target.value)}
                    placeholder="Nhập địa chỉ cửa hàng"
                    autoComplete="street-address"
                  />
                </label>

                <label>
                  Phường
                  <input
                    value={form.phuong || ''}
                    onChange={(event) => updateField('phuong', event.target.value)}
                    placeholder="Nhập phường"
                    autoComplete="address-level3"
                  />
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Tỉnh/Thành
                  <input
                    value={form.tinh || ''}
                    onChange={(event) => updateField('tinh', event.target.value)}
                    placeholder="Nhập tỉnh/thành"
                    autoComplete="address-level1"
                  />
                </label>

                <label>
                  NPP
                  <select value={form.npp} onChange={(event) => updateField('npp', event.target.value)}>
                    <option value="">
                      chọn NPP
                    </option>
                    {(nppByKV[form.kv] || []).map((npp) => (
                      <option value={npp} key={npp}>
                        {npp}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid-2">
                <label>
                  Khu vực
                  <select value={form.kv} onChange={(event) => updateField('kv', event.target.value)}>
                    <option value="">
                      chọn Khu vực
                    </option>
                    {KV_OPTIONS.map((kv) => (
                      <option value={kv} key={kv}>
                        {kv}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {dmsStatus === 'noDms' ? (
                <>
                  <div className="grid-2">
                    <label>
                      Kênh
                      <select value={form.kenh} onChange={(event) => updateField('kenh', event.target.value)}>
                        <option value="">
                          chọn kênh
                        </option>
                        {CHANNEL_OPTIONS.map((channel) => (
                          <option value={channel} key={channel}>
                            {channel}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      Loại
                      <select value={form.loai} onChange={(event) => updateField('loai', event.target.value)}>
                        <option value="">
                          chọn loại
                        </option>
                        {(channelTypeMap[form.kenh] || []).map((type) => (
                          <option value={type} key={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="card-block">
                    <h3>Ngành hàng kinh doanh</h3>
                    <p className="hint">Chọn các ngành hàng mà khách hàng đang kinh doanh</p>
                    <div className="checkbox-group">
                      {nganh_hang_options.map((option) => (
                        <label key={option} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={normalizeNganhHang(form.nganh_hang).includes(String(option || '').trim())}
                            onChange={() => handleNganhHangChange(option)}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                    {form.nganh_hang.length > 0 && (
                      <div className="selected-info">
                        Đã chọn: {form.nganh_hang.length} ngành hàng
                      </div>
                    )}
                  </div>

                  <label>
                    Ghi chú khách hàng
                    <textarea
                      value={form.ghi_chu_kh || ''}
                      onChange={(event) => updateField('ghi_chu_kh', event.target.value)}
                      placeholder="Nhập ghi chú khách hàng"
                      rows={3}
                    />
                  </label>
                </>
              ) : null}

            <div className="card-block">
              <h3>Sản phẩm hiện có</h3>
              <p className="hint">Chọn các sản phẩm mà khách hàng đang bán</p>
              {Object.entries(PRODUCT_GROUPS).map(([key, group]) => (
                <div key={key} className="product-group">
                  <h4>{group.label}</h4>
                  <div className="checkbox-group">
                    {group.fields.map((field) => (
                      <label key={field} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={form[field] || false}
                          onChange={(event) => updateField(field, event.target.checked)}
                        />
                        <span>{PRODUCT_FIELD_LABELS[field] || field}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <label>
                Ghi chú cửa hàng
                <textarea
                  value={form.ghi_chu || ''}
                  onChange={(event) => updateField('ghi_chu', event.target.value)}
                  placeholder="Nhập ghi chú cửa hàng"
                  rows={3}
                />
              </label>
            </div>

          <div className="card-block">
            <h3>Ảnh thực tế</h3>
            <p className="hint">Bấm chụp để mở camera điện thoại và chụp ảnh mới.</p>
            <div className="row-buttons">
              <button type="button" onClick={handleOpenCamera}>
                Chụp ảnh bằng camera
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*;capture=camera,image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoFileChange}
            />
            {photoDataUrl ? <img src={photoDataUrl} alt="Ảnh khách hàng" className="preview" /> : null}
          </div>
            </>
          )}

          {error ? <p className="error">{error}</p> : null}

          {dmsStatus !== null ? (
            <div className="row-buttons action-bar">
              <button type="submit" disabled={submitting}>
                {submitting ? 'Đang lưu...' : dmsStatus === 'hasDms' ? 'Lưu cửa hàng' : 'Lưu khách hàng'}
              </button>
              <button type="button" className="ghost" onClick={resetForm}>
                Làm mới
              </button>
            </div>
          ) : null}
        </form>

        <aside className="panel list-panel">
          <div className="row-between">
            <h2>{showStoreList ? 'Danh sách thực địa' : 'Danh sách khách hàng'}</h2>
            <div className="list-actions">
              <button
                type="button"
                className="ghost refresh-btn"
                onClick={async () => {
                  await Promise.all([loadCustomers(), loadStores()])
                }}
                disabled={loadingCustomers || loadingStores}
              >
                {loadingCustomers || loadingStores ? 'Đang tải...' : 'Tải lại'}
              </button>
              <button
                type="button"
                className="ghost refresh-btn"
                onClick={async () => {
                  setShowStoreList((prev) => !prev)
                  await loadStores()
                }}
                disabled={loadingStores}
              >
                {loadingStores ? 'Đang tải...' : showStoreList ? 'Xem khách hàng' : 'Danh sách thực địa'}
              </button>
              <span className="count">{showStoreList ? filteredVisibleStores.length : filteredVisibleCustomers.length}</span>
            </div>
          </div>

          <input
            type="text"
            placeholder={showStoreList ? 'Tìm kiếm thực địa...' : 'Tìm kiếm khách hàng...'}
            value={showStoreList ? searchStore : searchCustomer}
            onChange={(event) => (showStoreList ? setSearchStore(event.target.value) : setSearchCustomer(event.target.value))}
            style={{ width: '100%', padding: '10px 14px', marginBottom: '15px', borderRadius: '12px', border: '1px solid #e0e0e0', fontSize: '14px',marginTop: '18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          />

          {showStoreList ? (
            !filteredVisibleStores.length ? (
              <p className="empty">{visibleStores.length === 0 ? 'Chưa có dữ liệu thực địa.' : 'Không tìm thấy thực địa.'}</p>
            ) : (
              <div className="customer-list">
                {filteredVisibleStores.map((store) => (
                  <article key={store.id || `${store.TenCH}-${store.NPP}`} className="customer-item">
                    <div className="row-between">
                      <strong>{store.TenCH || '—'}</strong>
                      <span className="count">#{store.id || 'moi'}</span>
                    </div>
                    <p>{store.DiaChi || '—'}</p>
                    <p>{store.Phuong || '—'} - {store.Tinh || '—'}</p>
                    <p>NPP: {store.NPP || '—'}</p>
                    <p>DMS: {store.CoTrenDMS ? 'Có' : 'Không'}</p>
                    <button
                      type="button"
                      className="ghost detail-btn"
                      onClick={() => setSelectedStore(store)}
                    >
                      Xem chi tiết
                    </button>
                  </article>
                ))}
              </div>
            )
          ) : !filteredVisibleCustomers.length ? (
            <p className="empty">{visibleCustomers.length === 0 ? 'Chưa có dữ liệu. Tạo khách hàng đầu tiên để bắt đầu.' : 'Không tìm thấy khách hàng.'}</p>
          ) : (
            <div className="customer-list">
              {filteredVisibleCustomers.map((customer) => (
                <article key={customer.id || `${customer.ten}-${customer.ngay_tao}`} className="customer-item">
                  <div className="row-between">
                    <strong>{customer.ten}</strong>
                    <span className="count">#{customer.id || 'moi'}</span>
                  </div>
                  <p>{customer.loai}</p>
                  <p>{customer.npp}</p>
                  <p>NV tạo: {customer.nguoi_tao || '—'}</p>
                  <p>
                    ({customer.vi_do === null ? '—' : Number(customer.vi_do).toFixed(8)},{' '}
                    {customer.kinh_do === null ? '—' : Number(customer.kinh_do).toFixed(8)})
                  </p>
                  <p>{customer.ngay_tao ? formatDate(customer.ngay_tao) : '—'}</p>
                  <button
                    type="button"
                    className="ghost detail-btn"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    Xem chi tiết
                  </button>
                </article>
              ))}
            </div>
          )}
        </aside>
      </section>

      {showLocationPrompt ? (
        <div
          className="modal-overlay location-permission-overlay"
          role="presentation"
          onClick={() => setShowLocationPrompt(false)}
        >
          <section
            className="modal-panel location-permission-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Bật GPS và cấp quyền vị trí"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="location-permission-hero">
              <span className="location-permission-badge">GPS chính xác nhất</span>
              <h3>Bắt buộc bật GPS và cấp quyền vị trí.</h3>
              <p>Nếu không bật định vị, tính năng này sẽ không hoạt động.</p>
            </div>

            {locationRejectionInfo ? (
              <div className="card-block">
                <div className="row-between">
                  <h3>{locationRejectionInfo.title}</h3>
                </div>
                <p className="error">{locationRejectionInfo.message}</p>
                {locationRejectionInfo.hints?.length ? (
                  <div className="location-permission-list">
                    {locationRejectionInfo.hints.map((hint) => (
                      <div className="location-permission-item" key={hint}>
                        <span className="location-permission-dot" />
                        <div>
                          <strong>Khắc phục</strong>
                          <p>{hint}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="location-permission-list">
              <div className="location-permission-item">
                <span className="location-permission-dot" />
                <div>
                  <strong>Bật định vị</strong>
                  <p>Điện thoại hoặc máy tính phải mở GPS/dịch vụ vị trí.</p>
                </div>
              </div>
              <div className="location-permission-item">
                <span className="location-permission-dot" />
                <div>
                  <strong>Cho phép truy cập</strong>
                  <p>Chọn cho phép để app lấy tọa độ GPS chính xác nhất.</p>
                </div>
              </div>
            </div>

            <div className="location-permission-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setShowLocationPrompt(false)
                  setError('')
                }}
                disabled={loadingLocation}
              >
                Đóng
              </button>
              <button type="button" onClick={handleResolveGpsLocation} disabled={loadingLocation}>
                Tôi đã bật GPS
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {selectedCustomer ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSelectedCustomer(null)}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Chi tiết khách hàng"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row-between modal-header">
              <h3>Chi tiết khách hàng</h3>
              <button type="button" className="ghost close-btn" onClick={() => setSelectedCustomer(null)}>
                Đóng
              </button>
            </div>

            <div className="modal-content">
              <p><strong>ID:</strong> {selectedCustomer.id || '—'}</p>
              <p><strong>Tên KH:</strong> {selectedCustomer.ten || '—'}</p>
              <p><strong>Loại:</strong> {selectedCustomer.loai || '—'}</p>
              <p><strong>NPP:</strong> {selectedCustomer.npp || '—'}</p>
              <p>
                <strong>Ngành hàng:</strong>{' '}
                {(() => {
                  const nh = normalizeNganhHang(selectedCustomer.nganh_hang)
                  return nh.length > 0 ? nh.join(', ') : '—'
                })()}
              </p>
              <p><strong>Nhân viên tạo:</strong> {selectedCustomer.nguoi_tao || '—'}</p>
              <p>
                <strong>Tọa độ:</strong>{' '}
                {selectedCustomer.vi_do === null ? '—' : Number(selectedCustomer.vi_do).toFixed(8)},{' '}
                {selectedCustomer.kinh_do === null ? '—' : Number(selectedCustomer.kinh_do).toFixed(8)}
              </p>
              <p><strong>Ngày tạo:</strong> {selectedCustomer.ngay_tao ? formatDate(selectedCustomer.ngay_tao) : '—'}</p>

              {selectedCustomer.anh ? (
                <img
                  src={toImageDataUrl(selectedCustomer.anh)}
                  alt={`Ảnh thực tế ${selectedCustomer.ten || ''}`}
                  className="modal-image"
                />
              ) : (
                <p>Chưa có ảnh thực tế.</p>
              )}

              {selectedCustomer.vi_do !== null && selectedCustomer.kinh_do !== null ? (
                <>
                  <a
                    href={`https://www.google.com/maps?q=${selectedCustomer.vi_do},${selectedCustomer.kinh_do}`}
                    target="_blank"
                    rel="noreferrer"
                    className="map-link"
                  >
                    Xem vị trí trên Google Maps
                  </a>
                  <iframe
                    title="Bản đồ vị trí khách hàng"
                    className="map-frame"
                    loading="lazy"
                    src={`https://maps.google.com/maps?q=${selectedCustomer.vi_do},${selectedCustomer.kinh_do}&z=16&output=embed`}
                  />
                </>
              ) : (
                <p>Chưa có tọa độ GPS.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {selectedStore ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setSelectedStore(null)}
        >
          <section
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Chi tiết thực địa"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row-between modal-header">
              <h3>Chi tiết thực địa</h3>
              <button type="button" className="ghost close-btn" onClick={() => setSelectedStore(null)}>
                Đóng
              </button>
            </div>

            <div className="modal-content">
              <p><strong>Tên CH:</strong> {selectedStore.TenCH || '—'}</p>
              <p><strong>Địa chỉ:</strong> {selectedStore.DiaChi || '—'}</p>
              <p><strong>Phường:</strong> {selectedStore.Phuong || '—'}</p>
              <p><strong>Tỉnh:</strong> {selectedStore.Tinh || '—'}</p>
              <p><strong>NPP:</strong> {selectedStore.NPP || '—'}</p>
              <p><strong>CoTrenDMS:</strong> {selectedStore.CoTrenDMS ? 'Có' : 'Không'}</p>
              <p>
                <strong>Sản phẩm hiện có:</strong>{' '}
                {Object.keys(PRODUCT_FIELD_LABELS)
                  .filter((field) => Boolean(selectedStore[field]))
                  .map((field) => PRODUCT_FIELD_LABELS[field])
                  .join(', ') || '—'}
              </p>
              <p><strong>Ghi chú:</strong> {selectedStore.GhiChu || '—'}</p>

              {selectedStore.HinhAnh ? (
                <img
                  src={toImageDataUrl(selectedStore.HinhAnh)}
                  alt={`Ảnh thực địa ${selectedStore.TenCH || ''}`}
                  className="modal-image"
                />
              ) : (
                <p>Chưa có ảnh thực địa.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {showExpandedMap && locationData ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setShowExpandedMap(false)}
        >
          <section
            className="modal-panel map-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Bản đồ lớn"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="row-between modal-header">
              <h3>Bản đồ lớn</h3>
              <div className="row-buttons">
                <button type="button" className="ghost close-btn" onClick={handleFocusMyMapPoint}>
                  Chuyển tới vị trí của tôi
                </button>
                <button type="button" className="ghost close-btn" onClick={() => setShowExpandedMap(false)}>
                  Đóng
                </button>
              </div>
            </div>
            <div ref={expandedMapRef} className="map-frame map-frame-expanded" />
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
