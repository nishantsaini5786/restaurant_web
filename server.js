require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB Schema ───────────────────────────────────────────────────────────
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

const customerSchema = new mongoose.Schema({
    customerId: { type: String, unique: true },
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String, default: '' },
    totalVisits: { type: Number, default: 1 },
    totalSpent: { type: Number, default: 0 },
    lastVisit: { type: Date, default: Date.now },
    favoriteItems: [{ type: String }],
    orderHistory: [{ type: String }], // Order IDs stored
    createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', orderSchema);
const Customer = mongoose.model('Customer', customerSchema);

// ─── MongoDB Connection ───────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bhosdika_restaurant';
let isMongoConnected = false;

mongoose.connect(MONGODB_URI)
    .then(() => {
        isMongoConnected = true;
        console.log('✅✅✅ MONGODB ATLAS CONNECTED! ✅✅✅');
        console.log('📊 Database:', mongoose.connection.name);
    })
    .catch(err => {
        isMongoConnected = false;
        console.error('❌ MongoDB Connection FAILED:', err.message);
    });

// ─── Helper Functions ─────────────────────────────────────────────────────────
function generateOrderId() {
    return 'ORD' + Date.now().toString(36).toUpperCase() + Math.floor(Math.random() * 1000);
}

function generateCustomerId() {
    return 'CUST' + Date.now().toString(36).toUpperCase();
}

// ─── API: CREATE ORDER (Customer + Order both save) ───────────────────────────
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
        
        const newOrder = {
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
        };
        
        let customerSaved = false;
        let orderSaved = false;
        
        if (isMongoConnected) {
            try {
                // 1. SAVE ORDER
                const orderDoc = new Order(newOrder);
                await orderDoc.save();
                orderSaved = true;
                console.log(`✅ ORDER SAVED: ${orderId} - ${customerName} - ₹${finalAmount}`);
            } catch (orderErr) {
                console.error('❌ Order Save Error:', orderErr.message);
            }
            
            try {
                // 2. SAVE OR UPDATE CUSTOMER
                let customer = await Customer.findOne({ mobile });
                
                if (customer) {
                    // EXISTING CUSTOMER - UPDATE
                    customer.totalVisits += 1;
                    customer.totalSpent += finalAmount;
                    customer.lastVisit = new Date();
                    customer.orderHistory.push(orderId);
                    
                    // Update favorite items
                    const currentItems = items.map(i => i.name);
                    const uniqueFavs = [...new Set([...customer.favoriteItems, ...currentItems])];
                    customer.favoriteItems = uniqueFavs.slice(0, 10); // Max 10 favorites
                    
                    await customer.save();
                    customerSaved = true;
                    console.log(`📊 CUSTOMER UPDATED: ${customer.name} | Visits: ${customer.totalVisits} | Total Spent: ₹${customer.totalSpent}`);
                } else {
                    // NEW CUSTOMER - CREATE
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
                    customerSaved = true;
                    console.log(`🆕 NEW CUSTOMER SAVED: ${customerName} (${mobile}) | First Order: ₹${finalAmount}`);
                }
            } catch (custErr) {
                console.error('❌ Customer Save Error:', custErr.message);
            }
        }
        
        // File backup (always save locally)
        const DATA_DIR = path.join(__dirname, 'data');
        const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
        const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
        
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
        
        // Save order to file
        let fileOrders = [];
        if (fs.existsSync(ORDERS_FILE)) {
            fileOrders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
        }
        fileOrders.unshift(newOrder);
        fs.writeFileSync(ORDERS_FILE, JSON.stringify(fileOrders, null, 2));
        
        // Save customer to file
        let fileCustomers = [];
        if (fs.existsSync(CUSTOMERS_FILE)) {
            fileCustomers = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
        }
        const existingCustomerIndex = fileCustomers.findIndex(c => c.mobile === mobile);
        if (existingCustomerIndex !== -1) {
            fileCustomers[existingCustomerIndex].totalVisits += 1;
            fileCustomers[existingCustomerIndex].totalSpent += finalAmount;
            fileCustomers[existingCustomerIndex].lastVisit = new Date().toISOString();
            fileCustomers[existingCustomerIndex].orderHistory.push(orderId);
        } else {
            fileCustomers.push({
                customerId: generateCustomerId(),
                name: customerName,
                mobile: mobile,
                totalVisits: 1,
                totalSpent: finalAmount,
                lastVisit: new Date().toISOString(),
                favoriteItems: items.map(i => i.name),
                orderHistory: [orderId],
                createdAt: new Date().toISOString()
            });
        }
        fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(fileCustomers, null, 2));
        
        res.json({ 
            success: true, 
            orderId, 
            finalAmount, 
            gstAmount, 
            tableType,
            customerSaved: customerSaved,
            orderSaved: orderSaved,
            message: customerSaved ? '✅ Customer & Order saved to MongoDB' : '⚠️ Saved to local only'
        });
        
    } catch (error) {
        console.error('Order creation error:', error);
        res.status(500).json({ success: false, message: 'Server error: ' + error.message });
    }
});

// ─── API: GET ALL CUSTOMERS ───────────────────────────────────────────────────
app.get('/api/admin/customers', async (req, res) => {
    try {
        if (isMongoConnected) {
            const customers = await Customer.find().sort({ totalSpent: -1 });
            console.log(`📊 Found ${customers.length} customers in MongoDB`);
            res.json({ success: true, customers, source: 'MongoDB', count: customers.length });
        } else {
            const CUSTOMERS_FILE = path.join(__dirname, 'data', 'customers.json');
            let customers = [];
            if (fs.existsSync(CUSTOMERS_FILE)) {
                customers = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
            }
            res.json({ success: true, customers, source: 'Local File', count: customers.length });
        }
    } catch (error) {
        console.error('Customers fetch error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── API: GET SINGLE CUSTOMER DETAILS ─────────────────────────────────────────
app.get('/api/admin/customers/:mobile', async (req, res) => {
    try {
        const { mobile } = req.params;
        
        if (isMongoConnected) {
            const customer = await Customer.findOne({ mobile });
            const orders = await Order.find({ mobile }).sort({ createdAt: -1 });
            
            if (!customer) {
                return res.json({ success: false, message: 'Customer not found' });
            }
            
            res.json({ 
                success: true, 
                customer, 
                orders,
                totalOrders: orders.length,
                totalAmount: customer.totalSpent
            });
        } else {
            const CUSTOMERS_FILE = path.join(__dirname, 'data', 'customers.json');
            const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
            let customers = [];
            let orders = [];
            
            if (fs.existsSync(CUSTOMERS_FILE)) {
                customers = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
            }
            if (fs.existsSync(ORDERS_FILE)) {
                orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
            }
            
            const customer = customers.find(c => c.mobile === mobile);
            const customerOrders = orders.filter(o => o.mobile === mobile);
            
            if (!customer) {
                return res.json({ success: false, message: 'Customer not found' });
            }
            
            res.json({ success: true, customer: customer, orders: customerOrders });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── API: GET ALL ORDERS ──────────────────────────────────────────────────────
app.get('/api/admin/orders', async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        
        if (isMongoConnected) {
            let query = {};
            if (status && status !== 'all') query.orderStatus = status;
            
            const orders = await Order.find(query)
                .sort({ createdAt: -1 })
                .skip((parseInt(page) - 1) * parseInt(limit))
                .limit(parseInt(limit));
            const total = await Order.countDocuments(query);
            
            res.json({ success: true, orders, total, pages: Math.ceil(total / parseInt(limit)), source: 'MongoDB' });
        } else {
            const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
            let orders = [];
            if (fs.existsSync(ORDERS_FILE)) {
                orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
            }
            if (status && status !== 'all') {
                orders = orders.filter(o => o.orderStatus === status);
            }
            const total = orders.length;
            const start = (parseInt(page) - 1) * parseInt(limit);
            const paginated = orders.slice(start, start + parseInt(limit));
            
            res.json({ success: true, orders: paginated, total, pages: Math.ceil(total / parseInt(limit)), source: 'Local File' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ─── API: GET STATS ───────────────────────────────────────────────────────────
app.get('/api/admin/stats', async (req, res) => {
    try {
        if (isMongoConnected) {
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
            
            const todayRevenueResult = await Order.aggregate([
                { $match: { paymentStatus: { $ne: 'pending' }, createdAt: { $gte: today } } },
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
                    totalRevenue: revenueResult[0]?.total || 0,
                    todayRevenue: todayRevenueResult[0]?.total || 0
                }
            });
        } else {
            const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
            const CUSTOMERS_FILE = path.join(__dirname, 'data', 'customers.json');
            let orders = [];
            let customers = [];
            
            if (fs.existsSync(ORDERS_FILE)) orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
            if (fs.existsSync(CUSTOMERS_FILE)) customers = JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8'));
            
            const today = new Date().toDateString();
            const todayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === today);
            
            res.json({
                success: true,
                stats: {
                    totalOrders: orders.length,
                    totalCustomers: customers.length,
                    pendingOrders: orders.filter(o => o.orderStatus === 'pending').length,
                    completedOrders: orders.filter(o => o.orderStatus === 'completed').length,
                    todayOrders: todayOrders.length,
                    totalRevenue: orders.reduce((sum, o) => sum + (o.paymentStatus !== 'pending' ? o.finalAmount : 0), 0),
                    todayRevenue: todayOrders.reduce((sum, o) => sum + (o.paymentStatus !== 'pending' ? o.finalAmount : 0), 0)
                }
            });
        }
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ─── API: UPDATE ORDER STATUS ─────────────────────────────────────────────────
app.patch('/api/admin/orders/:orderId/status', async (req, res) => {
    try {
        const { orderId } = req.params;
        const { orderStatus, paymentStatus } = req.body;
        
        const updateData = {};
        if (orderStatus) updateData.orderStatus = orderStatus;
        if (paymentStatus) updateData.paymentStatus = paymentStatus;
        
        if (isMongoConnected) {
            await Order.findOneAndUpdate({ orderId }, updateData);
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ─── API: ONLINE PAYMENT ──────────────────────────────────────────────────────
app.post('/api/orders/:orderId/pay-online', async (req, res) => {
    try {
        const { orderId } = req.params;
        
        if (isMongoConnected) {
            const order = await Order.findOne({ orderId });
            if (!order) return res.status(404).json({ success: false });
            if (order.paymentStatus !== 'pending') return res.json({ success: false, message: 'Already paid' });
            
            const discount = order.finalAmount * 0.02;
            const newAmount = Math.round((order.finalAmount - discount) * 100) / 100;
            
            order.finalAmount = newAmount;
            order.paymentStatus = 'paid_online';
            await order.save();
            
            res.json({ success: true, finalAmount: newAmount, discount });
        } else {
            res.json({ success: false, message: 'MongoDB not connected' });
        }
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ─── API: EXPORT CSV ──────────────────────────────────────────────────────────
app.get('/api/export-csv', async (req, res) => {
    try {
        let orders = [];
        if (isMongoConnected) {
            orders = await Order.find().sort({ createdAt: -1 });
        } else {
            const ORDERS_FILE = path.join(__dirname, 'data', 'orders.json');
            if (fs.existsSync(ORDERS_FILE)) {
                orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
            }
        }
        
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

// ─── PAGE ROUTES ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/menu', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'menu.html')));
app.get('/payment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'payment.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'admin.html')));
app.get('/kitchen', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'kitchen.html')));

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🍽️  BHOSDIKA RESTAURANT SERVER RUNNING`);
    console.log(`📍 Local:   http://localhost:${PORT}`);
    console.log(`🍳 Kitchen: http://localhost:${PORT}/kitchen`);
    console.log(`🔐 Admin:   http://localhost:${PORT}/admin`);
    console.log(`\n📊 MongoDB: ${isMongoConnected ? '✅ CONNECTED' : '❌ NOT CONNECTED'}`);
    if (isMongoConnected) {
        console.log(`👥 Customer data will be saved to MongoDB`);
        console.log(`📦 Order data will be saved to MongoDB`);
    }
    console.log(`\n💾 Press Ctrl+C to stop\n`);
});