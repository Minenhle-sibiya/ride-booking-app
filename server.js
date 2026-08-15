require('dotenv').config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcryptjs');

const Ride = require('./models/Ride');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});

// Make io available to routes
app.set('io', io);

app.use(cors());
app.use(express.json());
app.use(express.static("public", { index: false }));

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

// ============ MONGODB CONNECTION ============
if (MONGO_URI) {
  mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
  })
    .then(() => {
      console.log("✅ Connected to MongoDB Atlas");
    })
    .catch((error) => {
      console.error("❌ Error connecting to MongoDB Atlas:", error.message);
    });
} else {
  console.warn("⚠️ MongoDB connection string is missing. Continuing without a database connection.");
}

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
  console.log('🔌 New client connected:', socket.id);
  
  socket.on('join-ride', (rideId) => {
    socket.join(`ride-${rideId}`);
    console.log(`Socket ${socket.id} joined ride ${rideId}`);
  });
  
  socket.on('driver-location', (data) => {
    io.to(`ride-${data.rideId}`).emit('driver-location-update', {
      driverId: data.driverId,
      lat: data.lat,
      lng: data.lng
    });
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Client disconnected:', socket.id);
  });
});

// ============ SERVE PAGES ============
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

// ============ USER SIGNUP ============
app.post('/api/users', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'User signup requires a configured database (MONGO_URI).' });
  }
  try {
    const { username, password, role, name, email, phone } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const existing = await User.findOne({ username: username.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    const hash = bcrypt.hashSync(password, 10);
    const user = new User({ 
      username: username.toLowerCase(), 
      passwordHash: hash, 
      role,
      name: name || username,
      email: email || '',
      phone: phone || ''
    });
    await user.save();
    
    return res.status(201).json({ 
      username: user.username, 
      role: user.role,
      name: user.name,
      id: user._id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ USER LOGIN ============
app.post('/api/login', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'Login requires a configured database (MONGO_URI).' });
  }
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Missing username or password' });
    }
    
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const ok = bcrypt.compareSync(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account has been deactivated' });
    }
    
    return res.json({ 
      username: user.username, 
      role: user.role,
      name: user.name,
      id: user._id
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ============ FORGOT PASSWORD ============
app.post('/api/forgot-password', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'Password reset requires a configured database (MONGO_URI).' });
  }
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      // For security, don't reveal if user exists
      return res.json({ 
        success: true, 
        message: 'If an account exists with this username, a password reset link has been sent.' 
      });
    }
    
    // In a production app, you would:
    // 1. Generate a unique reset token
    // 2. Save it to the database with an expiration time
    // 3. Send an email with a reset link containing the token
    
    // For now, we'll just return success
    console.log(`🔐 Password reset requested for user: ${username}`);
    
    return res.json({ 
      success: true, 
      message: 'Password reset link has been sent to your email' 
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============ GET USER PROFILE ============
app.get('/api/users/:username', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'Database not configured' });
  }
  
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone,
      favorites: user.favorites || [],
      profilePicture: user.profilePicture || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ UPDATE USER PROFILE ============
app.patch('/api/users/:username', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'Database not configured' });
  }
  
  try {
    const { name, email, phone, profilePicture } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (phone) updateData.phone = phone;
    if (profilePicture) updateData.profilePicture = profilePicture;
    
    const user = await User.findOneAndUpdate(
      { username: req.params.username.toLowerCase() },
      updateData,
      { new: true }
    );
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      username: user.username,
      role: user.role,
      name: user.name,
      email: user.email,
      phone: user.phone
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ ADD FAVORITE LOCATION ============
app.post('/api/users/:username/favorites', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(501).json({ error: 'Database not configured' });
  }
  
  try {
    const { name, lat, lng } = req.body;
    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.favorites.push({ name, lat, lng });
    await user.save();
    
    res.json({ favorites: user.favorites });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ GET USER'S RIDE HISTORY ============
app.get('/api/users/:username/rides', async (req, res) => {
  if (!MONGO_URI) {
    return res.json([]);
  }
  
  try {
    const user = await User.findOne({ username: req.params.username.toLowerCase() });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const rides = await Ride.find({
      $or: [
        { riderId: user._id },
        { driverId: user._id }
      ]
    }).sort({ createdAt: -1 });
    
    res.json(rides);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ CREATE RIDE ============
app.post('/api/rides', async (req, res) => {
  if (!MONGO_URI) {
    return res.status(200).json({
      _id: 'demo-' + Date.now(),
      pickup: req.body.pickup,
      dropoff: req.body.dropoff,
      status: 'pending',
      createdAt: new Date().toISOString(),
      riderId: req.body.riderId || 'demo-user',
      estimatedFare: 10.50,
      distance: 5.2,
      duration: 12,
      rideType: req.body.rideType || 'economy'
    });
  }

  try {
    const { 
      pickup, 
      dropoff, 
      rideType, 
      paymentMethod, 
      riderId, 
      estimatedFare, 
      distance, 
      duration,
      scheduledTime 
    } = req.body;
    
    // Get rider info
    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({ error: 'Rider not found' });
    }
    
    // Create ride with all data
    const ride = new Ride({
      riderId: rider._id,
      riderName: rider.name || rider.username,
      riderPhone: rider.phone || '',
      pickup,
      dropoff,
      rideType: rideType || 'economy',
      status: 'pending',
      estimatedFare: estimatedFare || 0,
      distance: distance || 0,
      duration: duration || 0,
      paymentMethod: paymentMethod || 'cash',
      isScheduled: !!scheduledTime,
      scheduledTime: scheduledTime || null
    });
    
    const savedRide = await ride.save();
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('new-ride', savedRide);
    }
    
    res.status(201).json(savedRide);
  } catch (err) {
    console.error('Error creating ride:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============ GET ALL RIDES ============
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

// ============ GET SINGLE RIDE ============
app.get('/api/rides/:id', async (req, res) => {
  if (!MONGO_URI) {
    return res.json({
      _id: req.params.id,
      status: 'pending',
      pickup: { lat: 51.505, lng: -0.09 },
      dropoff: { lat: 51.51, lng: -0.08 }
    });
  }
  
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    res.json(ride);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============ UPDATE RIDE STATUS ============
app.patch('/api/rides/:id', async (req, res) => {
  if (!MONGO_URI) {
    return res.json({ _id: req.params.id, status: req.body.status });
  }

  try {
    const { status, driverId } = req.body;
    
    // Validate status - THIS PREVENTS THE "in_progress" ERROR
    const validStatuses = ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
      });
    }
    
    const ride = await Ride.findById(req.params.id);
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    
    // Build update data
    const updateData = { status };
    
    // If accepting, assign driver
    if (status === 'accepted' && driverId) {
      const driver = await User.findById(driverId);
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      updateData.driverId = driver._id;
      updateData.driverName = driver.name || driver.username;
      updateData.driverPhone = driver.phone || '';
      updateData.acceptedAt = new Date();
    }
    
    if (status === 'in_progress') {
      updateData.startedAt = new Date();
    }
    
    if (status === 'completed') {
      updateData.completedAt = new Date();
      updateData.actualFare = ride.estimatedFare;
      updateData.paymentStatus = 'paid';
    }
    
    if (status === 'cancelled') {
      updateData.cancelledAt = new Date();
    }
    
    const updatedRide = await Ride.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    // Emit socket event for real-time updates
    const io = req.app.get('io');
    if (io) {
      io.emit('ride-updated', updatedRide);
      io.to(`ride-${req.params.id}`).emit('ride-status-update', updatedRide);
    }
    
    res.json(updatedRide);
  } catch (err) {
    console.error('Error updating ride:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============ RATE A RIDE ============
app.post('/api/rides/:id/rate', async (req, res) => {
  if (!MONGO_URI) {
    return res.json({ success: true, message: 'Ride rated (demo)' });
  }
  
  try {
    const { rating, feedback, role } = req.body;
    const ride = await Ride.findById(req.params.id);
    
    if (!ride) {
      return res.status(404).json({ error: 'Ride not found' });
    }
    
    if (ride.status !== 'completed') {
      return res.status(400).json({ error: 'Only completed rides can be rated' });
    }
    
    if (role === 'rider') {
      ride.riderRating = { rating, feedback: feedback || '' };
    } else if (role === 'driver') {
      ride.driverRating = { rating, feedback: feedback || '' };
    } else {
      return res.status(400).json({ error: 'Invalid role. Must be "rider" or "driver"' });
    }
    
    await ride.save();
    
    // Update driver's average rating if rider rated
    if (role === 'rider' && ride.driverId) {
      const allRides = await Ride.find({
        driverId: ride.driverId,
        'riderRating.rating': { $exists: true }
      });
      
      if (allRides.length > 0) {
        const avgRating = allRides.reduce((acc, r) => acc + r.riderRating.rating, 0) / allRides.length;
        await User.findByIdAndUpdate(ride.driverId, {
          averageRating: Math.round(avgRating * 10) / 10
        });
      }
    }
    
    res.json({ success: true, ride });
  } catch (err) {
    console.error('Error rating ride:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============ START SERVER ============
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Rider app: http://localhost:${PORT}/rider`);
  console.log(`🚗 Driver app: http://localhost:${PORT}/driver`);
});