// Imports
const fs = require('fs')
const path = require('path')

// Constants
const DATA_PATH = path.join(__dirname, '../../public/data.json')

// Main logic
exports.addCustomer = (req, res) => {
  const newCustomer = req.body
  let customers = []
  try {
    if (fs.existsSync(DATA_PATH)) {
      const raw = fs.readFileSync(DATA_PATH, 'utf8')
      if (raw) customers = JSON.parse(raw).khach_hang || []
    }
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi đọc dữ liệu khách hàng.' })
  }
  customers.push(newCustomer)
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ khach_hang: customers }, null, 2), 'utf8')
    return res.json({ khach_hang: customers })
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi ghi dữ liệu khách hàng.' })
  }
}
