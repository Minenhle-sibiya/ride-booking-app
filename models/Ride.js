const mongoose = require('mongoose');

const rideSchema = new mongoose.Schema({
  // ===== RIDER INFORMATION =====
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  riderName: {
    type: String,
    default: ''
  },
  riderPhone: {
    type: String,
    default: ''
  },
  
  // ===== DRIVER INFORMATION =====
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  driverName: {
    type: String,
    default: ''
  },
  driverPhone: {
    type: String,
    default: ''
  },
  
  // ===== LOCATIONS =====
  pickup: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: '' }
  },
  dropoff: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    address: { type: String, default: '' }
  },
  
  // ===== RIDE TYPE =====
  rideType: {
    type: String,
    enum: ['economy', 'premium', 'suv', 'xl'],
    default: 'economy'
  },
  
  // ⚠️ THIS IS THE FIX - Added 'in_progress' and 'cancelled'
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  // ===== PRICING & DISTANCE =====
  estimatedFare: {
    type: Number,
    default: 0
  },
  actualFare: {
    type: Number
  },
  distance: {
    type: Number,
    default: 0
  },
  duration: {
    type: Number,
    default: 0
  },
  
  // ===== PAYMENT =====
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'paypal'],
    default: 'cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending'
  },
  
  // ===== RATINGS =====
  riderRating: {
    rating: { type: Number, min: 1, max: 5 },
    feedback: { type: String }
  },
  driverRating: {
    rating: { type: Number, min: 1, max: 5 },
    feedback: { type: String }
  },
  
  // ===== SCHEDULING =====
  isScheduled: {
    type: Boolean,
    default: false
  },
  scheduledTime: {
    type: Date
  },
  
  // ===== TIMESTAMPS =====
  createdAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  cancellationReason: {
    type: String
  }
});

// ===== CREATE INDEXES FOR FASTER QUERIES =====
rideSchema.index({ status: 1, createdAt: -1 });
rideSchema.index({ riderId: 1 });
rideSchema.index({ driverId: 1 });

module.exports = mongoose.model('Ride', rideSchema);