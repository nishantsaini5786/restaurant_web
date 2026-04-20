const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  itemTotal: { type: Number, required: true }
});

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  mobile: {
    type: String,
    required: true,
    match: [/^\d{10}$/, 'Mobile number must be 10 digits']
  },
  members: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  tableType: {
    type: String,
    required: true,
    enum: ['2 Star', '4 Star', '5 Star']
  },
  tableNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 100
  },
  items: [orderItemSchema],
  subtotal: { type: Number, required: true },
  gstAmount: { type: Number, default: 0 },
  gstPercent: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid_online', 'paid_counter'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['pending', 'preparing', 'completed'],
    default: 'pending'
  },
  sheetRowIndex: { type: Number, default: null }, // Store the row index in Google Sheets
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

// Index for faster queries
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });

module.exports = mongoose.model('Order', orderSchema);
