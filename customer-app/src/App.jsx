import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CHANNEL_OPTIONS,
  CHECK_LABELS,
  KV_OPTIONS,
  STORAGE_KEY,
  channelTypeMap,
  nppByKV,
  nganh_hang_options,
} from './constants/customerConfig'
import { collectVerifiedLocation } from './services/locationService'
import { buildCustomerCode, createInitialForm, formatDate } from './utils/customerHelpers'
import './App.css'

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
      nganh_hang: normalizeNganhHang(customer?.nganh_hang),
    }))

  if (Array.isArray(rawValue)) {
    return toNormalizedArray(rawValue)
  }

  if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.khach_hang)) {
    return toNormalizedArray(rawValue.khach_hang)
  }

  return []
}

function getCustomersFromStorage() {
  try {
    const storedRaw = localStorage.getItem(STORAGE_KEY)
    if (!storedRaw) {
      return null
    }

    const parsed = JSON.parse(storedRaw)
    const parsedCustomers = normalizeCustomers(parsed)
    return parsedCustomers.length ? parsedCustomers : []
  } catch {
    return null
  }
}

function saveCustomersToStorage(customerList) {
  const payload = {
    khach_hang: customerList,
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

function isQuotaExceededError(error) {
  const message = String(error?.message || '').toLowerCase()

  return (
    error?.name === 'QuotaExceededError' ||
    error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error?.code === 22 ||
    error?.code === 1014 ||
    message.includes('quota') ||
    message.includes('exceeded')
  )
}

function saveCustomersWithQuotaGuard(customerList) {
  const trySave = (listToSave) => {
    saveCustomersToStorage(listToSave)
    return listToSave
  }

  try {
    return trySave(customerList)
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      throw error
    }

    const removePhotosFromOldest = customerList.map((customer) => ({ ...customer }))

    // Stage 1: keep all records, progressively drop photos from old to new.
    for (let index = removePhotosFromOldest.length - 1; index >= 0; index -= 1) {
      if (removePhotosFromOldest[index].anh_thuc_te) {
        removePhotosFromOldest[index].anh_thuc_te = ''
      }

      try {
        return trySave(removePhotosFromOldest)
      } catch (retryError) {
        if (!isQuotaExceededError(retryError)) {
          throw retryError
        }
      }
    }

    const keepLatestOnly = customerList.length
      ? [
          {
            ...customerList[0],
            anh_thuc_te: '',
          },
        ]
      : []

    // Stage 2: keep only newest customer metadata (no photo).
    try {
      return trySave(keepLatestOnly)
    } catch (retryError) {
      if (!isQuotaExceededError(retryError)) {
        throw retryError
      }

      throw new Error(
        'Dữ liệu lưu tạm đã đầy trên thiết bị. Đã tự giảm dung lượng nhưng vẫn không đủ. Vui lòng xóa dữ liệu trình duyệt rồi thử lại.',
        {
          cause: retryError,
        }
      )
    }
  }
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
  const [locationData, setLocationData] = useState(null)
  const [photoDataUrl, setPhotoDataUrl] = useState('')
  const [loadingLocation, setLoadingLocation] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)

  const locationBadge = useMemo(() => {
    if (!locationData) {
      return { label: 'Chưa xác thực vị trí', tone: 'neutral' }
    }

    return locationData.trusted
      ? { label: 'Vị trí tin cậy', tone: 'success' }
      : { label: 'Vị trí chưa đạt chuẩn', tone: 'danger' }
  }, [locationData])

  useEffect(() => {
    let cancelled = false

    async function loadInitialData() {
      const fromStorage = getCustomersFromStorage()
      if (!cancelled && fromStorage) {
        setCustomers(fromStorage)
        return
      }

      try {
        const response = await fetch('/data.json', { cache: 'no-store' })
        if (!response.ok) {
          return
        }

        const parsed = await response.json()
        const parsedCustomers = normalizeCustomers(parsed)

        if (!cancelled) {
          setCustomers(parsedCustomers)
          saveCustomersToStorage(parsedCustomers)
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

    try {
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

      const validKenh = CHANNEL_OPTIONS.includes(selectedKenh)
      const validLoai = (channelTypeMap[selectedKenh] || []).includes(selectedLoai)
      const validKv = KV_OPTIONS.includes(selectedKv)
      const validNpp = (nppByKV[selectedKv] || []).includes(selectedNpp)

      if (!validKenh || !validLoai || !validKv || !validNpp) {
        throw new Error('Vui lòng chọn đầy đủ Kênh, Loại, Khu vực và NPP trước khi lưu.')
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

      const payload = {
        ma: buildCustomerCode(customers),
        ten: form.ten.trim(),
        kenh: form.kenh,
        loai: form.loai,
        kv: form.kv,
        npp: form.npp.trim(),
        nganh_hang: form.nganh_hang,
        toa_do: {
          vi_do: locationData.lat,
          kinh_do: locationData.lng,
        },
        anh_thuc_te: photoDataUrl,
        ngay_tao: new Date().toISOString(),
      }

      const nextCustomers = [payload, ...customers]
      const savedCustomers = saveCustomersWithQuotaGuard(nextCustomers)
      setCustomers(savedCustomers)
      resetForm()
    } catch (err) {
      setError(err.message || 'Không thể lưu khách hàng.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Field Sales</p>
          <h1>Thêm khách hàng mới</h1>
          <p className="subtitle">Lấy vị trí GPS chuẩn, chụp ảnh thực tế, và lưu theo mẫu dữ liệu của bạn.</p>
        </div>
      </header>

      <section className="layout">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <h2>Thông tin khách hàng</h2>

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
            <div className="row-between">
              <h3>Xác thực vị trí</h3>
              <span className={`status ${locationBadge.tone}`}>{locationBadge.label}</span>
            </div>
            <button type="button" onClick={handleGetLocation} disabled={loadingLocation}>
              {loadingLocation ? 'Đang lấy vị trí...' : 'Lấy vị trí chuẩn'}
            </button>
            {locationData && (
              <ul className="meta-list">
                <li>Vĩ độ: {locationData.lat.toFixed(8)}</li>
                <li>Kinh độ: {locationData.lng.toFixed(8)}</li>
                {/* <li>Độ chính xác: {locationData.accuracy.toFixed(1)}m</li> */}
                {/* <li>Độ lệch mẫu: {locationData.spread.toFixed(1)}m</li>
                <li>Tốc độ bất thường max: {locationData.maxSpeedKmH.toFixed(1)} km/h</li>
                <li>Múi giờ thiết bị: {locationData.timezone}</li>
                <li>Điểm tin cậy: {locationData.trustScore}/100</li> */}
              </ul>
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
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoFileChange}
            />
            {photoDataUrl ? <img src={photoDataUrl} alt="Ảnh khách hàng" className="preview" /> : null}
          </div>

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
            <span className="count">{customers.length}</span>
          </div>

          {!customers.length ? (
            <p className="empty">Chưa có dữ liệu. Tạo khách hàng đầu tiên để bắt đầu.</p>
          ) : (
            <div className="customer-list">
              {normalizeCustomers(customers).map((customer) => (
                <article key={`${customer.ma}-${customer.ngay_tao}`} className="customer-item">
                  <div className="row-between">
                    <strong>{customer.ten}</strong>
                  </div>
                  <p>{customer.kenh}</p>
                  <p>{customer.loai}</p>
                  <p>{customer.npp}</p>
                  {Array.isArray(customer.nganh_hang) && customer.nganh_hang.length > 0 ? (
                    <p>Ngành hàng: {customer.nganh_hang.join(', ')}</p>
                  ) : null}
                  <p>
                    ({Number(customer?.toa_do?.vi_do ?? 0).toFixed(6)},{' '}
                    {Number(customer?.toa_do?.kinh_do ?? 0).toFixed(6)})
                  </p>
                  <p>{customer.ngay_tao ? formatDate(customer.ngay_tao) : '—'}</p>
                </article>
              ))}
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

export default App
