const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const { updateOrderInSheet } = require('../config/googleSheets');

// Simple auth middleware
function adminAuth(req, res, next) {
  const { password } = req.headers;
  if (password !== (process.env.ADMIN_PASSWORD || 'admin123')) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
}

// GET /api/admin/orders - Get all orders with filters
router.get('/orders', adminAuth, async (req, res) => {
  try {
    const { status, paymentStatus, date, page = 1, limit = 20 } = req.query;
    
    const filter = {};
    if (status) filter.orderStatus = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
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
      .skip((page - 1) * limit)
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
      pages: Math.ceil(total / limit),
      revenue: totalRevenue[0]?.total || 0
    });
  } catch (error) {
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

    // Sync to Google Sheets
    if (Object.keys(updates).length > 0) {
      updateOrderInSheet(order.orderId, updates).catch(console.error);
    }

    res.json({ success: true, message: 'Order updated', order });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Update failed' });
  }
});

// GET /api/admin/stats - Dashboard stats
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, todayOrders, pending, completed] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.countDocuments({ orderStatus: 'pending' }),
      Order.countDocuments({ orderStatus: 'completed' })
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
        totalOrders: total,
        todayOrders,
        pendingOrders: pending,
        completedOrders: completed,
        totalRevenue: revenue[0]?.total || 0,
        todayRevenue: todayRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Stats error' });
  }
});

module.exports = router;
