require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

console.log('MONGODB_URI exists:', !!MONGODB_URI);

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not set in environment variables');
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err.message));
}

// Order Schema
const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true },
  customerName: String,
  mobile: String,
  members: Number,
  tableType: String,
  tableNumber: Number,
  items: Array,
  subtotal: Number,
  gstAmount: Number,
  finalAmount: Number,
  orderStatus: { type: String, default: 'pending' },
  paymentStatus: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

// Customer Schema - FIXED with orderHistory
const customerSchema = new mongoose.Schema({
  customerId: { type: String, unique: true },
  name: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  totalVisits: { type: Number, default: 1 },
  totalSpent: { type: Number, default: 0 },
  lastVisit: { type: Date, default: Date.now },
  favoriteItems: [{ type: String }],
  orderHistory: [{ type: String }],  // ← IMPORTANT: Added this line
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
const Customer = mongoose.model('Customer', customerSchema);

// Helper Functions
function generateOrderId() {
  return 'ORD' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);
}

function generateCustomerId() {
  return 'CUST' + Date.now().toString(36).toUpperCase();
}

// API: Create Order
app.post('/api/orders', async (req, res) => {
  try {
    const { customerName, mobile, members, tableType, tableNumber, items } = req.body;
    
    if (!customerName || !mobile || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid order data' });
    }

    // Calculate totals
    let subtotal = 0;
    items.forEach(item => { subtotal += item.price * item.quantity; });
    
    const gstPercent = tableType === '5 Star' ? 18 : 0;
    const gstAmount = (subtotal * gstPercent) / 100;
    const finalAmount = subtotal + gstAmount;
    const orderId = generateOrderId();
    
    const newOrder = new Order({
      orderId,
      customerName,
      mobile,
      members: parseInt(members),
      tableType,
      tableNumber: parseInt(tableNumber),
      items: items.map(i => ({ name: i.name, price: i.price, quantity: i.quantity })),
      subtotal,
      gstAmount,
      finalAmount,
      orderStatus: 'pending',
      paymentStatus: 'pending'
    });
    
    await newOrder.save();
    console.log(`✅ ORDER SAVED: ${orderId} - ${customerName} - ₹${finalAmount}`);
    
    // Update or Create Customer
    let customer = await Customer.findOne({ mobile });
    
    if (customer) {
      // Existing customer - Update stats
      customer.totalVisits += 1;
      customer.totalSpent += finalAmount;
      customer.lastVisit = new Date();
      const currentItems = items.map(i => i.name);
      customer.favoriteItems = [...new Set([...customer.favoriteItems, ...currentItems])];
      
      // FIXED: Check if orderHistory exists, if not create it
      if (!customer.orderHistory) {
        customer.orderHistory = [];
      }
      customer.orderHistory.push(orderId);
      
      await customer.save();
      console.log(`📊 CUSTOMER UPDATED: ${customer.name} | Visits: ${customer.totalVisits} | Total Spent: ₹${customer.totalSpent}`);
    } else {
      // New customer
      const newCustomer = new Customer({
        customerId: generateCustomerId(),
        name: customerName,
        mobile: mobile,
        totalVisits: 1,
        totalSpent: finalAmount,
        favoriteItems: items.map(i => i.name),
        orderHistory: [orderId]
      });
      await newCustomer.save();
      console.log(`🆕 NEW CUSTOMER SAVED: ${customerName} (${mobile}) | First Order: ₹${finalAmount}`);
    }
    
    res.json({ success: true, orderId, finalAmount, gstAmount, tableType });
    
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Get Orders
app.get('/api/admin/orders', async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    let query = {};
    if (status && status !== 'all') query.orderStatus = status;
    
    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));
    
    const total = await Order.countDocuments(query);
    
    res.json({ success: true, orders, total, pages: Math.ceil(total / parseInt(limit)) });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Get Customers
app.get('/api/admin/customers', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ totalSpent: -1 });
    console.log(`📊 Found ${customers.length} customers in MongoDB`);
    res.json({ success: true, customers });
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Get Single Customer
app.get('/api/admin/customers/:mobile', async (req, res) => {
  try {
    const { mobile } = req.params;
    const customer = await Customer.findOne({ mobile });
    const orders = await Order.find({ mobile }).sort({ createdAt: -1 });
    
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    
    res.json({ success: true, customer, orders });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Update Order Status
app.patch('/api/admin/orders/:orderId/status', async (req, res) => {
  try {
    const { orderId } = req.params;
    const { orderStatus, paymentStatus } = req.body;
    
    const updateData = {};
    if (orderStatus) updateData.orderStatus = orderStatus;
    if (paymentStatus) updateData.paymentStatus = paymentStatus;
    
    await Order.findOneAndUpdate({ orderId }, updateData);
    console.log(`✅ Order ${orderId} updated:`, updateData);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Get Stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalCustomers = await Customer.countDocuments();
    const pendingOrders = await Order.countDocuments({ orderStatus: 'pending' });
    const completedOrders = await Order.countDocuments({ orderStatus: 'completed' });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = await Order.countDocuments({ createdAt: { $gte: today } });
    
    const revenueResult = await Order.aggregate([
      { $match: { paymentStatus: { $ne: 'pending' } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalOrders,
        totalCustomers,
        pendingOrders,
        completedOrders,
        todayOrders,
        totalRevenue: revenueResult[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// API: Online Payment
app.post('/api/orders/:orderId/pay-online', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findOne({ orderId });
    
    if (!order) return res.status(404).json({ success: false });
    if (order.paymentStatus !== 'pending') return res.json({ success: false, message: 'Already paid' });
    
    const discount = order.finalAmount * 0.02;
    const newAmount = Math.round((order.finalAmount - discount) * 100) / 100;
    
    order.finalAmount = newAmount;
    order.paymentStatus = 'paid_online';
    await order.save();
    
    res.json({ success: true, finalAmount: newAmount, discount });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ success: false });
  }
});

// API: Export CSV
app.get('/api/export-csv', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    
    let csvData = "Order ID,Customer,Mobile,Members,Table Type,Table No,Items,Subtotal,GST,Total,Status,Payment,Date\n";
    
    orders.forEach(order => {
      const itemsStr = order.items.map(i => `${i.name}(${i.quantity})`).join(' | ');
      csvData += `"${order.orderId}","${order.customerName}","${order.mobile}",${order.members},"${order.tableType}",${order.tableNumber},"${itemsStr}",${order.subtotal},${order.gstAmount},${order.finalAmount},"${order.orderStatus}","${order.paymentStatus}","${new Date(order.createdAt).toLocaleString()}"\n`;
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders_export.csv');
    res.send(csvData);
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).send('Error exporting data');
  }
});

// Serve HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/menu.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'menu.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'kitchen.html')));
app.get('/kitchen.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'kitchen.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));
app.get('/payment.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'payment.html')));

// Start server
app.listen(PORT, () => {
  console.log(`\n🍽️ BHOSDIKA RESTAURANT SERVER RUNNING`);
  console.log(`📍 Local:   http://localhost:${PORT}`);
  console.log(`🍳 Kitchen: http://localhost:${PORT}/kitchen`);
  console.log(`🔐 Admin:   http://localhost:${PORT}/admin`);
  console.log(`\n✅ MongoDB: ${MONGODB_URI ? 'Configured' : 'Not configured'}`);
  console.log(`💾 Press Ctrl+C to stop\n`);
});