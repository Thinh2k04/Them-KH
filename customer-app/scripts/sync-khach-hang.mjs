import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const AUTH = 'Basic YWRtaW41QGFjYnQuY29tOmFjZjY4MTljNmNiZjJlMGZkNGE2Njg5MjQ5NjAzODFi'

const API_URL = 'https://api.mobiwork.vn:4014/RecordsV2?getGeoJson=0&isCustomerWeb=1&geom2=&datechoice=cdate&fromdate=null&todate=null&next=999999&skip=0&formID=67eb9cf392d9028035624d98'

function transformRecord(r) {
  return {
    vi_do: r.lat || '',
    kinh_do: r.long || '',
    ma: r.data?.ma_khach_hang?.viewData || '',
    ten: r.data?.khach_hang?.viewData || '',
    loai: r.data?.loai_khach_hang?.viewData || r.data?.loai_khach_hang?.choice_values || '',
    kenh: r.data?.kenh?.viewData || r.data?.kenh?.choice_values || '',
    sdt: r.data?.sdt?.viewData || '',
    anh: r.data?.hinh_anh?.image_url?.[0] || '',
  }
}

async function main() {
  console.log('Fetching all records...')
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: AUTH },
    body: JSON.stringify({
      objfind: {},
      objorder: { createdDate: -1 },
      objdrop: {
        titlekd: 0, syncDate: 0, 'settings.inventory': 0,
        'settings.addNew': 0, 'settings.lien_he': 0,
        'settings.lat': 0, 'settings.long': 0,
        'settings.payment': 0, project: 0, assignTo: 0,
        orgid: 0, clientid: 0, form: 0, repeatableData: 0,
      },
    }),
  })
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`)

  const json = await res.json()
  const records = json.result || []
  console.log(`Received ${records.length} raw records`)

  const flat = records.map(transformRecord)
  const filtered = flat.filter((item) => item.vi_do && item.kinh_do && item.ma)

  const items = filtered
    .map((item) => JSON.stringify(item))
    .join(',\n    ')

  const output = `[\n    ${items}\n]\n`

  const outPath = path.join(__dirname, '..', 'public', 'khach-hang.js')
  fs.writeFileSync(outPath, output, 'utf-8')
  console.log(`OK: ${filtered.length} records written -> ${outPath}`)
}

main().catch((err) => {
  console.error('\nFAILED:', err.message)
  process.exit(1)
})
