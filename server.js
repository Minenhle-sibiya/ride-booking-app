require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const Ride = require('./models/Ride');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public", { index: false }));

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  })
    .then(() => {
      console.log("Connected to MongoDB Atlas");
    })
    .catch((error) => {
      console.error("Error connecting to MongoDB Atlas:", error.message);
    });
} else {
  console.warn("MongoDB connection string is missing. Continuing without a database connection.");
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/login.html');
});

app.get('/rider', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/driver', (req, res) => {
  res.sendFile(__dirname + '/public/driver.html');
});

app.get('/signup', (req, res) => {
  res.sendFile(__dirname + '/public/signup.html');
});

// User signup
app.post('/api/users', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'User signup requires a configured database (MONGO_URI).' });
  }
  try {
    const { username, password, role } = req.body;
    if (!username || !password || !role) return res.status(400).json({ error: 'Missing fields' });
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    const hash = bcrypt.hashSync(password, 10);
    const user = new User({ username: username.toLowerCase(), passwordHash: hash, role });
    await user.save();
    return res.status(201).json({ username: user.username, role: user.role });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// User login
app.post('/api/login', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'Login requires a configured database (MONGO_URI).' });
  }
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    return res.json({ username: user.username, role: user.role });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/rides', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(200).json({
      _id: 'demo-ride',
      pickup: req.body.pickup,
      dropoff: req.body.dropoff,
      status: 'pending',
      createdAt: new Date().toISOString()
    });
  }

  try {
    const { pickup, dropoff } = req.body;
    const ride = new Ride({ pickup, dropoff });
    const savedRide = await ride.save();
    res.status(201).json(savedRide);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/rides', async (req, res) => {
  if (!MONGO_URI) {
    return res.json([]);
  }

  try {
    const rides = await Ride.find().sort({ createdAt: -1 });
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/rides/:id', async (req, res) => {
  if (!MONGO_URI) {
    return res.json({ _id: req.params.id, status: req.body.status });
  }

  try {
    const { status } = req.body;
    const ride = await Ride.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    res.json(ride);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});