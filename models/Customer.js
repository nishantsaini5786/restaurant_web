const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customerId: {
    type: String,
    unique: true,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  mobile: {
    type: String,
    required: true,
    unique: true,
    match: [/^\d{10}$/, 'Mobile number must be 10 digits']
  },
  totalVisits: {
    type: Number,
    default: 1,
    min: 1
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: 0
  },
  lastVisit: {
    type: Date,
    default: Date.now
  },
  favoriteItems: [{
    type: String
  }],
  orderHistory: [{
    type: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
customerSchema.index({ mobile: 1 });
customerSchema.index({ totalSpent: -1 });

module.exports = mongoose.model('Customer', customerSchema);