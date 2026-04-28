// Imports
const app = require('./app');

// Main logic
app.listen(app.get('port') || 3001, () => {
  console.log(`Server running on port ${app.get('port') || 3001}`);
});
