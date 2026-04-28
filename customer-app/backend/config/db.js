// Imports
const sql = require('mssql')

// Constants
const config = {
  user: 'sa',
  password: '123',
  server: 'localhost\\SQLEXPRESS',
  port: 1433,
  database: 'kh',
  options: {
    encrypt: false, // Nếu dùng Azure thì true, còn lại false
    trustServerCertificate: true,
  },
}

// Main logic
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then(pool => {
    console.log('Connected to MSSQL')
    return pool
  })
  .catch(err => {
    console.error('Database Connection Failed! Bad Config: ', err)
    throw err
  })

// Export
module.exports = {
  sql,
  poolPromise,
}
