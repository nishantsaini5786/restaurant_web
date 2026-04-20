const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Customer = require('../models/Customer');

// Generate short order ID: ORD-YYYYMMDD-XXXX
function generateOrderId() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(1000 + Math.random() * 9000);
  return `ORD-${dateStr}-${randomPart}`;
}

// Generate Customer ID
function generateCustomerId() {
  const date = new Date();
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `CUST-${dateStr}-${randomPart}`;
}

// POST /api/orders - Place new order
router.post('/', async (req, res) => {
  try {
    const {
      customerName, mobile, members, tableType, tableNumber, items
    } = req.body;

    // Validation
    if (!customerName || !mobile || !members || !tableType || !tableNumber || !items?.length) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ success: false, message: 'Mobile must be 10 digits' });
    }

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const gstPercent = tableType === '5 Star' ? 18 : 0;
    const gstAmount = Math.round((subtotal * gstPercent / 100) * 100) / 100;
    const finalAmount = Math.round((subtotal + gstAmount) * 100) / 100;

    const itemsWithTotal = items.map(item => ({
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      itemTotal: Math.round(item.price * item.quantity * 100) / 100
    }));

    const orderId = generateOrderId();

    const order = new Order({
      orderId,
      customerName: customerName.trim(),
      mobile,
      members: parseInt(members),
      tableType,
      tableNumber: parseInt(tableNumber),
      items: itemsWithTotal,
      subtotal,
      gstAmount,
      gstPercent,
      finalAmount,
      paymentStatus: 'pending',
      orderStatus: 'pending',
      createdAt: new Date()
    });

    await order.save();
    console.log(`✅ Order saved: ${orderId} - ${customerName} - ₹${finalAmount}`);

    // Update or Create Customer
    let customer = await Customer.findOne({ mobile });
    
    if (customer) {
      // Existing customer - Update stats
      customer.totalVisits += 1;
      customer.totalSpent += finalAmount;
      customer.lastVisit = new Date();
      const currentItems = items.map(i => i.name);
      customer.favoriteItems = [...new Set([...customer.favoriteItems, ...currentItems])];
      customer.orderHistory.push(orderId);
      await customer.save();
      console.log(`📊 Customer updated: ${customer.name} (Visit #${customer.totalVisits})`);
    } else {
      // New customer - Create
      const newCustomer = new Customer({
        customerId: generateCustomerId(),
        name: customerName.trim(),
        mobile,
        totalVisits: 1,
        totalSpent: finalAmount,
        lastVisit: new Date(),
        favoriteItems: items.map(i => i.name),
        orderHistory: [orderId]
      });
      await newCustomer.save();
      console.log(`🆕 New customer saved: ${customerName} (${mobile})`);
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      orderId: order.orderId,
      finalAmount: order.finalAmount,
      gstAmount: order.gstAmount,
      tableType: order.tableType
    });

  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// GET /api/orders/:orderId - Get single order
router.get('/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (error) {
    console.error('Fetch order error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/orders/:orderId/pay-online - Mock online payment
router.post('/:orderId/pay-online', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.paymentStatus !== 'pending') {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    // Apply 2% online discount
    const discount = Math.round(order.finalAmount * 0.02 * 100) / 100;
    const discountedAmount = Math.round((order.finalAmount - discount) * 100) / 100;

    order.paymentStatus = 'paid_online';
    order.finalAmount = discountedAmount;
    await order.save();

    console.log(`💰 Payment successful for ${order.orderId}: ₹${discountedAmount} (Saved ₹${discount})`);

    res.json({
      success: true,
      message: 'Payment successful!',
      discount,
      finalAmount: discountedAmount,
      orderId: order.orderId
    });
  } catch (error) {
    console.error('Payment error:', error);
    res.status(500).json({ success: false, message: 'Payment failed' });
  }
});

module.exports = router;