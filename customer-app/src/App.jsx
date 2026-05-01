import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point as turfPoint } from '@turf/helpers'
import {
  ADMIN_CODE_MAP,
  CHANNEL_OPTIONS,
  CHECK_LABELS,
  KV_OPTIONS,
  channelTypeMap,
  nppByKV,
  nganh_hang_options,
} from './constants/customerConfig'
import { collectVerifiedLocation } from './services/locationService'
import { createInitialForm, formatDate } from './utils/customerHelpers'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import './App.css'

const CUSTOMER_API_URL = 'https://jsk9x6z4-3000.asse.devtunnels.ms/api/khachhang/'
const API_ORIGIN = new URL(CUSTOMER_API_URL).origin
const DMS_CUSTOMER_API_URL = 'https://jsk9x6z4-3000.asse.devtunnels.ms/api/khachhang/dms'

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

function normalizeCustomers(rawValue) {
  const toNormalizedArray = (list) =>
    list.map((customer) => ({
      ...customer,
      id: Number(customer?.id),
      anh: customer?.anh || customer?.anh_base64 || '',
      vi_do:
        customer?.vi_do === null || customer?.vi_do === undefined ? null : Number(customer.vi_do),
      kinh_do:
        customer?.kinh_do === null || customer?.kinh_do === undefined ? null : Number(customer.kinh_do),
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
      URL.revokeObjectURL(objectUrl)
      resolve(compressedDataUrl)
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

function normalizeDmsCustomers(rawValue) {
  const list = Array.isArray(rawValue) ? rawValue : Array.isArray(rawValue?.data) ? rawValue.data : []
  return list
    .map((item) => {
      const lat = Number(item?.vi_do)
      const lng = Number(item?.kinh_do)
      return {
        ...item,
        vi_do_num: Number.isFinite(lat) ? lat : null,
        kinh_do_num: Number.isFinite(lng) ? lng : null,
      }
    })
    .filter((item) => item.vi_do_num !== null && item.kinh_do_num !== null)
}

async function fetchDmsCustomersByNpp(nppName) {
  if (!nppName) {
    return []
  }

  const response = await fetch(DMS_CUSTOMER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ phong_ban_nv: nppName }),
  })

  if (!response.ok) {
    throw new Error('Không thể tải khách hàng DMS theo NPP.')
  }

  const parsed = await response.json().catch(() => [])
  return normalizeDmsCustomers(parsed)
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
    ['Mã KH', customer?.makh],
    ['Tên KH', customer?.tenkh],
    ['Trạng thái', customer?.trang_thai_kh],
    ['Loại KH', customer?.loai_kh],
    ['Kênh', customer?.kenh],
    ['Địa chỉ', customer?.dia_chi],
    ['ĐC giao hàng', customer?.dc_giao_hangnh],
    ['Liên hệ', customer?.nguoi_lien_he],
    ['SĐT', customer?.sdt],
    ['Email', customer?.email],
  ]

  const metaRows = fields
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`)
    .join('')

  const image = customer?.hinh_anh
    ? `<img src="${escapeHtml(customer.hinh_anh)}" alt="${escapeHtml(customer.tenkh || 'Khách hàng DMS')}" class="map-popup-image" />`
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
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [loginCode, setLoginCode] = useState('')
  const [currentUserCode, setCurrentUserCode] = useState('')
  const [currentUser, setCurrentUser] = useState('')
  const [nppAreasPrepared, setNppAreasPrepared] = useState([])
  const [detectedNpp, setDetectedNpp] = useState('')
  const [detectedKv, setDetectedKv] = useState('')
  const [dmsCustomers, setDmsCustomers] = useState([])
  const [loadingDmsCustomers, setLoadingDmsCustomers] = useState(false)
  const [locationData, setLocationData] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [hasConfirmedNoDms, setHasConfirmedNoDms] = useState(false)
  const [showExpandedMap, setShowExpandedMap] = useState(false)
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loginError, setLoginError] = useState('')

  const fileInputRef = useRef(null)
  const miniMapRef = useRef(null)
  const miniMapInstanceRef = useRef(null)
  const miniMapLayersRef = useRef([])
  const miniMapClusterRef = useRef(null)
  const expandedMapRef = useRef(null)
  const expandedMapInstanceRef = useRef(null)
  const expandedMapLayersRef = useRef([])

  const locationBadge = useMemo(() => {
    if (!locationData) {
      return { label: 'Chưa xác thực vị trí', tone: 'neutral' }
    }

    if (!locationData.trusted) {
      return { label: 'Vị trí chưa đạt chuẩn', tone: 'danger' }
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

      L.tileLayer('http://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}', {
        attribution: '',
        maxZoom: 22,
        minZoom: 5,
      }).addTo(map)

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

      L.tileLayer('http://www.google.cn/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}', {
        attribution: '',
        maxZoom: 22,
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
        const list = await fetchDmsCustomersByNpp(detectedNpp)
        if (!cancelled) {
          setDmsCustomers(list)
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
  }, [detectedNpp])

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
    setForm((prev) => {
      const hasOption = prev.nganh_hang.includes(option)
      const nextNganhHang = hasOption
        ? prev.nganh_hang.filter((item) => item !== option)
        : [...prev.nganh_hang, option]

      return {
        ...prev,
        nganh_hang: nextNganhHang,
      }
    })
  }

  async function handleGetLocation() {
    setError('')
    setLoadingLocation(true)
    setHasConfirmedNoDms(false)

    try {
      if (miniMapInstanceRef.current) {
        miniMapInstanceRef.current.remove()
        miniMapInstanceRef.current = null
        miniMapLayersRef.current = []
      }

      if (!window.isSecureContext) {
        throw new Error('Ứng dụng cần chạy trên HTTPS hoặc localhost để lấy định vị chuẩn.')
      }

      const permissionState = await navigator.permissions
        ?.query({ name: 'geolocation' })
        .then((result) => result.state)
        .catch(() => 'prompt')

      if (permissionState === 'denied') {
        throw new Error('Quyền vị trí đang bị từ chối. Vui lòng cấp quyền để tiếp tục.')
      }

      const verified = await collectVerifiedLocation(3)
      setLocationData(verified)

      if (!verified.trusted) {
        const failedChecks = Object.entries(verified.checks)
          .filter(([, value]) => !value)
          .map(([key]) => CHECK_LABELS[key])
          .filter(Boolean)

        setError(
          `Vị trí chưa đạt chuẩn. Kiểm tra thất bại: ${failedChecks.join(', ')}. Vui lòng thử lại ngoài trời.`
        )
      }
    } catch (err) {
      setError(err.message || 'Không thể lấy vị trí. Vui lòng thử lại.')
    } finally {
      setLoadingLocation(false)
    }
  }

  function handleConfirmNoDms() {
    if (!locationData?.trusted) {
      setError('Vị trí chưa đạt chuẩn chống fake. Vui lòng lấy lại vị trí.')
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
    setHasConfirmedNoDms(true)
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
      const optimizedDataUrl = await resizeImageFile(file)
      setPhotoFile(file)
      setPhotoDataUrl(optimizedDataUrl)
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
      kv: '',
      npp: '',
      nganh_hang: [],
    })
    setLocationData(null)
    setDetectedNpp('')
    setDetectedKv('')
    setDmsCustomers([])
    setHasConfirmedNoDms(false)
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

      const validKenh = CHANNEL_OPTIONS.includes(selectedKenh)
      const validLoai = (channelTypeMap[selectedKenh] || []).includes(selectedLoai)
      const validKv = KV_OPTIONS.includes(selectedKv)
      const validNpp = (nppByKV[selectedKv] || []).includes(selectedNpp)
      const validNganhHang =
        selectedNganhHang.length > 0 &&
        selectedNganhHang.every((item) => nganh_hang_options.includes(item))

      if (!validKenh || !validLoai || !validKv || !validNpp) {
        throw new Error('Vui lòng chọn đầy đủ Kênh, Loại, Khu vực và NPP trước khi lưu.')
      }

      if (!validNganhHang) {
        throw new Error('Vui lòng chọn ít nhất 1 ngành hàng kinh doanh hợp lệ trước khi lưu.')
      }

      if (!form.ten.trim() || !form.npp.trim()) {
        throw new Error('Vui lòng nhập đầy đủ tên khách hàng và nhà phân phối.')
      }

      if (!locationData?.trusted) {
        throw new Error('Bạn cần lấy vị trí đạt chuẩn trước khi lưu khách hàng.')
      }

      if (!photoDataUrl) {
        throw new Error('Bạn cần chụp ảnh cửa hàng trước khi lưu khách hàng.')
      }
      if (!photoFile) {
        throw new Error('Thiếu file ảnh gốc để upload. Vui lòng chụp lại.')
      }

      const uploadedPath = await uploadCustomerImage(photoFile)

      const payload = {
        ten: form.ten.trim(),
        loai: form.loai,
        npp: form.npp.trim(),
        nguoi_tao: currentUserCode || currentUser,
        anh: uploadedPath,
        vi_do: Number(locationData.lat.toFixed(8)),
        kinh_do: Number(locationData.lng.toFixed(8)),
      }

      await saveCustomer(payload)
      const latestCustomers = await fetchCustomers()
      setCustomers(latestCustomers)
      resetForm()
    } catch (err) {
      setError(err.message || 'Không thể lưu khách hàng.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!currentUser) {
    return (
      <main className="page">
        <section className="panel login-panel">
          <h2>Đăng nhập</h2>
          <p className="hint">Nhập mã quản trị để vào hệ thống thêm khách hàng.</p>
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
        <div>
          <p className="eyebrow">Field Sales</p>
          <h1>Thêm khách hàng mới</h1>
          <p className="subtitle">Lấy vị trí GPS chuẩn, chụp ảnh thực tế, và lưu theo mẫu dữ liệu của bạn.</p>
          <p className="subtitle">Đăng nhập: <strong>{currentUser}</strong>{currentUserCode ? ` (${currentUserCode})` : ''}</p>
        </div>
        {/* <button type="button" className="ghost" onClick={handleLogout}>Đăng xuất</button> */}
      </header>

      <section className="layout">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <h2>Thông tin khách hàng</h2>

          <div className="card-block">
            <div className="row-between">
              <h3>Xác nhận chưa có khách hàng DMS</h3>
              <span className={`status ${locationBadge.tone}`}>{locationBadge.label}</span>
            </div>
            <div className="row-buttons">
              <button type="button" onClick={handleGetLocation} disabled={loadingLocation}>
                {loadingLocation
                  ? 'Đang lấy vị trí...'
                  : locationData
                    ? 'Lấy lại vị trí'
                    : 'Lấy vị trí chuẩn'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowExpandedMap(true)}
                disabled={!locationData}
              >
                Xem bản đồ lớn
              </button>
            </div>
            {locationData && detectedNpp && detectedKv && (
              <ul className="meta-list">
                <li>Vĩ độ: {locationData.lat.toFixed(8)}</li>
                <li>Kinh độ: {locationData.lng.toFixed(8)}</li>
              </ul>
            )}

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

            <div className="row-buttons" style={{ marginTop: 10 }}>
              <button
                type="button"
                onClick={handleConfirmNoDms}
                disabled={!locationData?.trusted || !detectedNpp || !detectedKv}
              >
                {hasConfirmedNoDms ? 'Đã xác nhận chưa có khách hàng DMS' : 'Xác nhận chưa có khách hàng DMS'}
              </button>
            </div>
          </div>

          {!hasConfirmedNoDms ? (
            <p className="hint">Hoàn tất bước xác nhận vị trí ở trên để mở phần nhập khách hàng.</p>
          ) : (
            <>
              <label>
                Tên khách hàng
                <input
                  required
                  value={form.ten}
                  onChange={(event) => updateField('ten', event.target.value)}
                  placeholder="Nhập tên cửa hàng"
                  autoComplete="organization"
                  enterKeyHint="next"
                />
              </label>

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
<div className="card-block">
              <h3>Ngành hàng kinh doanh</h3>
              <p className="hint">Chọn các ngành hàng mà cửa hàng đang kinh doanh</p>
              <div className="checkbox-group">
                {nganh_hang_options.map((option) => (
                  <label key={option} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={form.nganh_hang.includes(option)}
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

          <div className="row-buttons action-bar">
            <button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu...' : 'Lưu khách hàng'}
            </button>
            <button type="button" className="ghost" onClick={resetForm}>
              Làm mới
            </button>
          </div>
        </form>

        <aside className="panel list-panel">
          <div className="row-between">
            <h2>Danh sách khách hàng</h2>
            <span className="count">{visibleCustomers.length}</span>
          </div>

          {!visibleCustomers.length ? (
            <p className="empty">Chưa có dữ liệu. Tạo khách hàng đầu tiên để bắt đầu.</p>
          ) : (
            <div className="customer-list">
              {visibleCustomers.map((customer) => (
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
