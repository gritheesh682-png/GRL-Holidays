require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

/* ========== MongoDB Connection ========== */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB error:', err.message));

/* ========== Booking Schema ========== */
const bookingSchema = new mongoose.Schema(
  {
    bookingID: { type: String, unique: true, required: true, index: true },
    name: String,
    email: String,
    phone: String,
    package: String,
    date: String,
    persons: Number,
    transport: String,
    hotel: String,
    payment: String,
    total: Number,
    status: { type: String, default: 'confirmed' },
    passenger: {
      name: String,
      age: String,
      gender: String,
      idProof: String
    }
  },
  { timestamps: true }
);

const Booking = mongoose.model('Booking', bookingSchema);

/* ========== Auth Middleware ========== */
function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.manager = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/* ========== Email Transporter ========== */
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function buildEmailBody(b) {
  return `
============================================
  GLR HOLIDAYS - BOOKING CONFIRMATION
============================================

Booking ID : ${b.bookingID}
Issued On  : ${new Date().toLocaleString()}

--------------------------------------------
BOOKING DETAILS
--------------------------------------------
Package        : ${b.package}
Travel Date    : ${b.date}
Travelers      : ${b.persons}
Transport      : ${b.transport}
Hotel          : ${b.hotel}
Payment Method : ${b.payment}
Total Amount   : Rs.${Number(b.total).toLocaleString()}

--------------------------------------------
PASSENGER DETAILS
--------------------------------------------
Name     : ${b.passenger.name}
Age      : ${b.passenger.age}
Gender   : ${b.passenger.gender}
ID Proof : ${b.passenger.idProof}

--------------------------------------------
CONTACT
--------------------------------------------
Name  : ${b.name}
Email : ${b.email}
Phone : ${b.phone}

--------------------------------------------
Thank you for choosing GLR Holidays!
============================================
  `.trim();
}

async function sendBookingEmails(booking) {
  try {
    const body = buildEmailBody(booking);
    const subject = `GLR Holidays Booking - ${booking.bookingID}`;

    await transporter.sendMail({
      from: `"GLR Holidays" <${process.env.EMAIL_USER}>`,
      to: booking.email,
      subject,
      text: body
    });

    await transporter.sendMail({
      from: `"GLR Holidays" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `[NEW BOOKING] ${subject}`,
      text: body
    });
    console.log('📧 Emails sent for', booking.bookingID);
  } catch (err) {
    console.error('Email error:', err.message);
  }
}

/* ========== ROUTES ========== */
app.get('/', (req, res) => res.json({ ok: true, service: 'GLR Holidays API' }));

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (
    username === process.env.MANAGER_USERNAME &&
    password === process.env.MANAGER_PASSWORD
  ) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, {
      expiresIn: '8h'
    });
    return res.json({ success: true, token });
  }
  return res.status(401).json({ success: false, error: 'Invalid credentials' });
});

app.post('/api/bookings', async (req, res) => {
  try {
    const payload = req.body || {};
    if (!payload.bookingID) {
      return res.status(400).json({ error: 'bookingID is required' });
    }
    const booking = await Booking.create(payload);
    sendBookingEmails(booking);
    res.status(201).json({ success: true, booking });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Booking ID already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 }).lean();
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/bookings/:id', auth, async (req, res) => {
  try {
    const updated = await Booking.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );
    res.json({ success: true, booking: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ========== START SERVER ========== */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 GLR Holidays API running on http://localhost:${PORT}`)
);