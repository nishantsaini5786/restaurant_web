// config/googleSheets.js
// Google Sheets integration - Optional feature
// To enable: Add GOOGLE_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in .env

let doc = null;
let sheet = null;
let isEnabled = false;

// Initialize Google Sheets connection
async function initGoogleSheets() {
  try {
    // Check if credentials are configured
    if (!process.env.GOOGLE_SPREADSHEET_ID || 
        !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 
        !process.env.GOOGLE_PRIVATE_KEY) {
      if (!isEnabled) {
        console.log('📊 Google Sheets: Not configured. Use CSV export from admin panel.');
        isEnabled = false;
      }
      return false;
    }

    // Dynamic import to avoid crashes if packages not installed
    let GoogleSpreadsheet, JWT;
    try {
      const gs = require('google-spreadsheet');
      const auth = require('google-auth-library');
      GoogleSpreadsheet = gs.GoogleSpreadsheet;
      JWT = auth.JWT;
    } catch (err) {
      console.log('📊 Google Sheets package not installed. Skipping...');
      return false;
    }

    const serviceAccountAuth = new JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    doc = new GoogleSpreadsheet(process.env.GOOGLE_SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    console.log(`✅ Google Sheets connected: "${doc.title}"`);

    // Get or create the "Orders" sheet
    sheet = doc.sheetsByTitle['Orders'];
    if (!sheet) {
      sheet = await doc.addSheet({ title: 'Orders' });
      console.log('📄 Created new "Orders" sheet');
    }

    // Set headers if the sheet is empty
    const rows = await sheet.getRows();
    if (rows.length === 0) {
      await sheet.setHeaderRow([
        'Order ID',
        'Time',
        'Customer Name',
        'Mobile',
        'Table Type',
        'Table No',
        'Members',
        'Items',
        'Subtotal',
        'GST',
        'Total Bill',
        'Payment Status',
        'Order Status'
      ]);
      console.log('📋 Headers set on Google Sheet');
    }

    isEnabled = true;
    return true;
  } catch (error) {
    console.error('❌ Google Sheets error:', error.message);
    isEnabled = false;
    return false;
  }
}

// Format items array to readable string
function formatItems(items) {
  if (!items || !items.length) return '';
  return items.map(item => `${item.name} x${item.quantity} (₹${item.itemTotal || item.price * item.quantity})`).join(' | ');
}

// Format date to IST
function formatIST(date) {
  try {
    return new Date(date).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch (e) {
    return new Date(date).toLocaleString();
  }
}

// Add new order row to Google Sheets
async function addOrderToSheet(order) {
  if (!isEnabled) {
    // Just log, don't throw error
    console.log(`📊 Order ${order.orderId} - Use CSV export for Google Sheets`);
    return null;
  }

  try {
    if (!sheet) {
      const connected = await initGoogleSheets();
      if (!connected) return null;
    }

    const newRow = await sheet.addRow({
      'Order ID': order.orderId,
      'Time': formatIST(order.createdAt),
      'Customer Name': order.customerName,
      'Mobile': order.mobile,
      'Table Type': order.tableType,
      'Table No': order.tableNumber?.toString() || '',
      'Members': order.members?.toString() || '',
      'Items': formatItems(order.items),
      'Subtotal': `₹${order.subtotal}`,
      'GST': order.gstAmount > 0 ? `₹${order.gstAmount} (${order.gstPercent}%)` : 'NIL',
      'Total Bill': `₹${order.finalAmount}`,
      'Payment Status': order.paymentStatus === 'pending' ? '⏳ Pending' : '✅ Paid',
      'Order Status': order.orderStatus === 'pending' ? '🟡 Pending' : order.orderStatus === 'completed' ? '✅ Completed' : '🔵 Preparing'
    });

    console.log(`✅ Order ${order.orderId} added to Google Sheet`);
    return newRow.rowNumber;
  } catch (error) {
    console.error('❌ Error adding to Google Sheet:', error.message);
    return null;
  }
}

// Update order status/payment in Google Sheets
async function updateOrderInSheet(orderId, updates) {
  if (!isEnabled) {
    console.log(`📊 Order ${orderId} status update - Use CSV export for Google Sheets`);
    return false;
  }

  try {
    if (!sheet) {
      const connected = await initGoogleSheets();
      if (!connected) return false;
    }

    const rows = await sheet.getRows();
    const targetRow = rows.find(row => row.get('Order ID') === orderId);
    
    if (!targetRow) {
      console.warn(`⚠️ Order ${orderId} not found in Google Sheet`);
      return false;
    }

    if (updates.paymentStatus) {
      const statusMap = {
        'pending': '⏳ Pending',
        'paid_online': '✅ Paid Online',
        'paid_counter': '✅ Paid Counter'
      };
      targetRow.set('Payment Status', statusMap[updates.paymentStatus] || updates.paymentStatus);
    }

    if (updates.orderStatus) {
      const statusMap = {
        'pending': '🟡 Pending',
        'preparing': '🔵 Preparing',
        'completed': '✅ Completed'
      };
      targetRow.set('Order Status', statusMap[updates.orderStatus] || updates.orderStatus);
    }

    await targetRow.save();
    console.log(`✅ Order ${orderId} updated in Google Sheet`);
    return true;
  } catch (error) {
    console.error('❌ Error updating Google Sheet:', error.message);
    return false;
  }
}

// Get Google Sheets status
function getSheetsStatus() {
  return {
    enabled: isEnabled,
    message: isEnabled ? 'Google Sheets connected' : 'Not configured. Use CSV export.'
  };
}

module.exports = { 
  initGoogleSheets, 
  addOrderToSheet, 
  updateOrderInSheet,
  getSheetsStatus
};