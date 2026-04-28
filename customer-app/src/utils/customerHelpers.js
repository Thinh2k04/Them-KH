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
