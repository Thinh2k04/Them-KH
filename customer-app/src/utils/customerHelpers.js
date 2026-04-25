import { CHANNEL_OPTIONS, KV_OPTIONS, channelTypeMap, nppByKV } from '../constants/customerConfig'

export function createInitialForm() {
  const kenh = CHANNEL_OPTIONS[0]
  const kv = KV_OPTIONS[0]

  return {
    ten: '',
    kenh,
    loai: channelTypeMap[kenh][0] || '',
    kv,
    npp: nppByKV[kv][0] || '',
  }
}

export function formatDate(value) {
  return new Date(value).toLocaleString('vi-VN')
}

export function buildCustomerCode(customers) {
  const maxId = customers.reduce((max, customer) => {
    const matched = /^KHT-(\d+)$/i.exec(customer.ma || '')
    if (!matched) {
      return max
    }

    const numericPart = Number(matched[1])
    return Number.isNaN(numericPart) ? max : Math.max(max, numericPart)
  }, 0)

  return `KHT-${String(maxId + 1).padStart(2, '0')}`
}
