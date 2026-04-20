const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { updateOrderInSheet } = require('../config/googleSheets');

// Simple auth middleware - PASSWORD CHANGED TO "salonisaini"
function adminAuth(req, res, next) {
  const { password } = req.headers;
  // YAHAN PASSWORD CHANGE KIYA - "salonisaini"
  if (password !== (process.env.ADMIN_PASSWORD || 'salonisaini')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/orders - Get all orders with filters
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status, paymentStatus, date, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (status && status !== 'all') filter.orderStatus = status;
    if (paymentStatus && paymentStatus !== 'all') filter.paymentStatus = paymentStatus;
    if (date) {
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Summary stats
    const totalRevenue = await Order.aggregate([
      { $match: { paymentStatus: { $ne: 'pending' } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);

    res.json({
      success: true,
      orders,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      revenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
    console.error('Orders fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/customers - Get all customers
router.get('/customers', adminAuth, async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const customers = await Customer.find().sort({ totalSpent: -1 });
    res.json({ success: true, customers });
  } catch (error) {
    console.error('Customers fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/admin/customers/:mobile - Get single customer with orders
router.get('/customers/:mobile', adminAuth, async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const customer = await Customer.findOne({ mobile: req.params.mobile });
    const orders = await Order.find({ mobile: req.params.mobile }).sort({ createdAt: -1 });
    
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    
    res.json({ success: true, customer, orders });
  } catch (error) {
    console.error('Customer detail error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /api/admin/orders/:orderId/status - Update order status
router.patch('/orders/:orderId/status', adminAuth, async (req, res) => {
  try {
    const { orderStatus, paymentStatus } = req.body;
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const updates = {};
    if (orderStatus) { order.orderStatus = orderStatus; updates.orderStatus = orderStatus; }
    if (paymentStatus) { order.paymentStatus = paymentStatus; updates.paymentStatus = paymentStatus; }
    
    await order.save();

    // Sync to Google Sheets (if configured)
    if (Object.keys(updates).length > 0 && typeof updateOrderInSheet === 'function') {
      updateOrderInSheet(order.orderId, updates).catch(console.error);
    }

    res.json({ success: true, message: 'Order updated', order });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// GET /api/admin/stats - Dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const Customer = require('../models/Customer');
    
    const [totalOrders, todayOrders, pendingOrders, completedOrders, totalCustomers] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.countDocuments({ orderStatus: 'pending' }),
      Order.countDocuments({ orderStatus: 'completed' }),
      Customer.countDocuments()
    ]);

    const revenue = await Order.aggregate([
      { $match: { paymentStatus: { $ne: 'pending' } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);

    const todayRevenue = await Order.aggregate([
      { $match: { createdAt: { $gte: today }, paymentStatus: { $ne: 'pending' } } },
      { $group: { _id: null, total: { $sum: '$finalAmount' } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalOrders,
        totalCustomers,
        todayOrders,
        pendingOrders,
        completedOrders,
        totalRevenue: revenue[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: 'Stats error' });
  }
});

// GET /api/admin/export-csv - Export orders to CSV
router.get('/export-csv', adminAuth, async (req, res) => {
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
    res.status(500).send('Error exporting data');
  }
});

module.exports = router;