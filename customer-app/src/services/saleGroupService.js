const SALE_GROUP_API_URL = 'https://openapi.mobiwork.vn/OpenAPI/V1/SaleGroup'
const SALE_GROUP_AUTH =
  import.meta.env.VITE_MOBIWORK_SALEGROUP_AUTH ||
  'Basic NmExNjViNzU4NTMxZWViNDM0ZWY2NTg1Omc1bHkyYW8xbDNqb3BiMWs5M2l1Nw=='

// Trả về { KV1: ['NPP A', ...], KV2: [...] } dựa trên cây nhóm bán hàng Mobiwork:
// NPP -> (tỉnh/quận) -> KVx.
export async function fetchNppByKV() {
  const res = await fetch(SALE_GROUP_API_URL, {
    headers: { accept: 'application/json', Authorization: SALE_GROUP_AUTH },
  })
  if (!res.ok) {
    throw new Error(`Không tải được danh sách khu vực (${res.status})`)
  }

  const json = await res.json()
  if (!json?.status || !Array.isArray(json.data)) {
    throw new Error('Dữ liệu khu vực không hợp lệ')
  }

  const byCode = new Map(json.data.map((group) => [group.ma_nhom, group]))

  function findKv(code) {
    let parent = byCode.get(code)?.ma_nhom_cha
    for (let i = 0; parent && i < 8; i += 1) {
      const match = parent.match(/^KV\d+/)
      if (match) {
        return match[0]
      }
      parent = byCode.get(parent)?.ma_nhom_cha
    }
    return ''
  }

  const grouped = {}
  json.data.forEach((group) => {
    if (group.loai_nhom !== 'sale' || !/^NPP/i.test(group.ma_nhom)) {
      return
    }
    const kv = findKv(group.ma_nhom)
    if (kv) {
      ;(grouped[kv] ||= []).push(group.ma_nhom)
    }
  })

  return Object.fromEntries(
    Object.keys(grouped)
      .sort((a, b) => parseInt(a.slice(2), 10) - parseInt(b.slice(2), 10))
      .map((kv) => [kv, grouped[kv].sort((a, b) => a.localeCompare(b, 'vi'))])
  )
}
