import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CHANNEL_OPTIONS,
  CHECK_LABELS,
  KV_OPTIONS,
  STORAGE_KEY,
  channelTypeMap,
  nppByKV,
} from './constants/customerConfig'
import { collectVerifiedLocation } from './services/locationService'
import { buildCustomerCode, createInitialForm, formatDate } from './utils/customerHelpers'
import './App.css'

function App() {
  const [form, setForm] = useState(createInitialForm)
  const [customers, setCustomers] = useState(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return []
    }

    try {
      return JSON.parse(raw)
    } catch {
      return []
    }
  })
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

  const nextCustomerCode = useMemo(() => buildCustomerCode(customers), [customers])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customers))
  }, [customers])

  function updateField(key, value) {
    setForm((prev) => {
      if (key === 'kenh') {
        return {
          ...prev,
          kenh: value,
          loai: channelTypeMap[value]?.[0] || '',
        }
      }

      if (key === 'kv') {
        return {
          ...prev,
          kv: value,
          npp: nppByKV[value]?.[0] || '',
        }
      }

      return { ...prev, [key]: value }
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

  function handleOpenPhotoInput() {
    fileInputRef.current?.click()
  }

  function handlePhotoFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setError('')

    if (!file.type.startsWith('image/')) {
      setError('Tệp đã chọn không phải hình ảnh. Vui lòng chọn lại.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setPhotoDataUrl(String(reader.result || ''))
    }
    reader.onerror = () => {
      setError('Không thể đọc ảnh. Vui lòng thử lại.')
    }
    reader.readAsDataURL(file)

    event.target.value = ''
  }

  function resetForm() {
    setForm(createInitialForm())
    setLocationData(null)
    setPhotoDataUrl('')
    setError('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    try {
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
        ma: nextCustomerCode,
        ten: form.ten.trim(),
        kenh: form.kenh,
        loai: form.loai,
        kv: form.kv,
        npp: form.npp.trim(),
        toa_do: {
          vi_do: locationData.lat,
          kinh_do: locationData.lng,
          do_chinh_xac_m: Number(locationData.accuracy.toFixed(2)),
          do_chinh_xac_nho_nhat_m: Number(locationData.minAccuracy.toFixed(2)),
          do_chinh_xac_lon_nhat_m: Number(locationData.maxAccuracy.toFixed(2)),
          do_lech_m: Number(locationData.spread.toFixed(2)),
          do_on_dinh_tin_hieu_m: Number(locationData.accuracySpread.toFixed(2)),
          toc_do_bat_thuong_max_kmh: Number(locationData.maxSpeedKmH.toFixed(2)),
          moc_thoi_gian: new Date(locationData.timestamp).toISOString(),
          diem_tin_cay: locationData.trustScore,
          ket_qua_kiem_tra: locationData.checks,
          thong_tin_mang: locationData.networkInfo,
          mui_gio_thiet_bi: locationData.timezone,
          co_automation_flag: locationData.webdriverFlag,
        },
        anh_thuc_te: photoDataUrl,
        ngay_tao: new Date().toISOString(),
      }

      setCustomers((prev) => [payload, ...prev])
      resetForm()
    } catch (err) {
      setError(err.message || 'Không thể lưu khách hàng.')
    } finally {
      setSubmitting(false)
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ khach_hang: customers }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `khach-hang-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Field Sales</p>
          <h1>Thêm khách hàng mới</h1>
          <p className="subtitle">Lấy vị trí GPS chuẩn, chụp ảnh thực tế, và lưu theo mẫu dữ liệu của bạn.</p>
        </div>
        <button type="button" className="ghost" onClick={exportJson} disabled={!customers.length}>
          Xuất JSON
        </button>
      </header>

      <section className="layout">
        <form className="panel form-panel" onSubmit={handleSubmit}>
          <h2>Thông tin khách hàng</h2>

          <label>
            Mã khách hàng (tự động)
            <input value={nextCustomerCode} readOnly aria-readonly="true" />
          </label>

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
                {(nppByKV[form.kv] || []).map((npp) => (
                  <option value={npp} key={npp}>
                    {npp}
                  </option>
                ))}
              </select>
            </label>
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
            <p className="hint">Bấm "Chụp ảnh nhanh" để mở thẳng camera trên điện thoại.</p>
            <div className="row-buttons">
              <button type="button" onClick={handleOpenPhotoInput}>
                Chụp ảnh nhanh
              </button>
              <button type="button" className="ghost" onClick={handleOpenPhotoInput}>
                Chọn/chụp lại
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoFileChange}
              className="hidden"
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
              {customers.map((customer) => (
                <article key={`${customer.ma}-${customer.ngay_tao}`} className="customer-item">
                  <div className="row-between">
                    <strong>{customer.ten}</strong>
                    <span>{customer.ma}</span>
                  </div>
                  <p>{customer.kenh}</p>
                  <p>{customer.loai}</p>
                  <p>{customer.npp}</p>
                  <p>
                    ({customer.toa_do.vi_do.toFixed(6)}, {customer.toa_do.kinh_do.toFixed(6)}) -{' '}
                    {customer.toa_do.do_chinh_xac_m}m
                  </p>
                  <p>{formatDate(customer.ngay_tao)}</p>
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
