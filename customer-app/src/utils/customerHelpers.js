import {
  CHANNEL_OPTIONS,
  KV_OPTIONS,
  channelTypeMap,
  nppByKV,
  PRODUCT_FIELD_LABELS,
} from '../constants/customerConfig'

export function createInitialForm() {
  const kenh = CHANNEL_OPTIONS[0]
  const kv = KV_OPTIONS[0]

  // Initialize all product fields to false
  const productFields = {}
  Object.keys(PRODUCT_FIELD_LABELS).forEach((field) => {
    productFields[field] = false
  })

  return {
    ten: '',
    ten_ch: '',
    dia_chi: '',
    phuong: '',
    tinh: '',
    kenh,
    loai: channelTypeMap[kenh][0] || '',
    kv,
    npp: nppByKV[kv][0] || '',
    nganh_hang: [],
    ...productFields,
  }
}

export function formatDate(value) {
  return new Date(value).toLocaleString('vi-VN')
}
