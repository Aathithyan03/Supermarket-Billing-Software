require('dotenv').config();
const { migrate } = require('./database/migrate');
const app = require('./app');

const PORT = process.env.PORT || 5000;

// Ensure schema + default admin exist before accepting traffic
migrate();

app.listen(PORT, () => {
  console.log(`Supermarket Billing Software API running on port ${PORT}`);
});
