// Imports
const express = require('express')
const router = express.Router()
const { addCustomer } = require('../controllers/customerController')

// Main logic
router.post('/customers', addCustomer)

// Export
module.exports = router
