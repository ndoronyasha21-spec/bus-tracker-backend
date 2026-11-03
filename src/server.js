require('dotenv').config();
const express = require('express');
const cors = require('cors');
const locationRoutes = require('./routes/location');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use('/api', locationRoutes);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Bus tracker API listening on port ${PORT}`);
});
