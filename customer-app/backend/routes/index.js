// Imports
const express = require('express')
const router = express.Router()
const customerRoutes = require('./customerRoutes')

// Main logic
router.use(customerRoutes)

// Export
module.exports = router
