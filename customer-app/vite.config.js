import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

function normalizeCustomers(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue
  }

  if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.khach_hang)) {
    return rawValue.khach_hang
  }

  return []
}

function buildCustomerCode(customers) {
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

function toRawBase64(value) {
  if (!value) {
    return ''
  }

  const raw = String(value).trim()
  const matched = /^data:.*;base64,(.+)$/i.exec(raw)
  return (matched?.[1] || raw).replace(/\s+/g, '')
}

function isValidBase64(value) {
  if (!value) {
    return false
  }

  // Accept canonical base64 payload (no data URL header).
  return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
}

function dataJsonApiPlugin() {
  let saveQueue = Promise.resolve()

  async function readCustomers(dataFilePath) {
    try {
      const raw = await fs.readFile(dataFilePath, 'utf8')
      return normalizeCustomers(JSON.parse(raw || '{}'))
    } catch {
      return []
    }
  }

  async function handleSave(req, res, rootDir) {
    let body = ''
    for await (const chunk of req) {
      body += chunk
    }

    saveQueue = saveQueue.then(async () => {
      const dataFilePath = path.resolve(rootDir, 'public', 'data.json')
      const currentCustomers = await readCustomers(dataFilePath)
      const incoming = JSON.parse(body || '{}')
      const rawBase64 = toRawBase64(incoming.anh_thuc_te)
      const validBase64 = isValidBase64(rawBase64)

      const customer = {
        ma: buildCustomerCode(currentCustomers),
        ten: incoming.ten || '',
        kenh: incoming.kenh || '',
        loai: incoming.loai || '',
        kv: incoming.kv || '',
        npp: incoming.npp || '',
        nguoi_tao: incoming.nguoi_tao || '',
        nganh_hang: Array.isArray(incoming.nganh_hang) ? incoming.nganh_hang : [],
        toa_do: {
          vi_do: incoming?.toa_do?.vi_do,
          kinh_do: incoming?.toa_do?.kinh_do,
        },
        anh_thuc_te: validBase64 ? rawBase64 : '',
        ngay_tao: incoming.ngay_tao || new Date().toISOString(),
      }

      const nextCustomers = [customer, ...currentCustomers]
      await fs.writeFile(
        dataFilePath,
        JSON.stringify({ khach_hang: nextCustomers }, null, 2),
        'utf8'
      )

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ok: true, customer, khach_hang: nextCustomers }))
    })

    try {
      await saveQueue
    } catch {
      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ ok: false }))
      }
    }
  }

  function registerMiddleware(server, rootDir) {
    server.middlewares.use('/api/customers', async (req, res, next) => {
      if (req.method !== 'POST') {
        next()
        return
      }

      await handleSave(req, res, rootDir)
    })
  }

  return {
    name: 'data-json-api-plugin',
    configureServer(server) {
      registerMiddleware(server, server.config.root)
    },
    configurePreviewServer(server) {
      registerMiddleware(server, server.config.root)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    watch: {
      ignored: ['**/public/data.json'],
    },
  },
  plugins: [react(), dataJsonApiPlugin()],
})
