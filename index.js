require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { requireAuth } = require('./middleware');

const app = express();
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', require('./routes/auth'));
app.use('/api/bills', requireAuth, require('./routes/bills'));

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`AirVoice API running on http://localhost:${port}`));