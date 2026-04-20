const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

let doc = null;
let sheet = null;

// Initialize Google Sheets connection
async function initGoogleSheets() {
  try {
    if (!process.env.GOOGLE_SPREADSHEET_ID || 
        !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 
        !process.env.GOOGLE_PRIVATE_KEY) {
      console.warn('⚠️  Google Sheets credentials not configured. Sheet sync disabled.');
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

    return true;
  } catch (error) {
    console.error('❌ Google Sheets init error:', error.message);
    return false;
  }
}

// Format items array to readable string
function formatItems(items) {
  return items.map(item => `${item.name} x${item.quantity} (₹${item.itemTotal})`).join(' | ');
}

// Format date to IST
function formatIST(date) {
  return new Date(date).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Add new order row to Google Sheets
async function addOrderToSheet(order) {
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
      'Table No': order.tableNumber.toString(),
      'Members': order.members.toString(),
      'Items': formatItems(order.items),
      'Subtotal': `₹${order.subtotal}`,
      'GST': order.gstAmount > 0 ? `₹${order.gstAmount} (${order.gstPercent}%)` : 'NIL',
      'Total Bill': `₹${order.finalAmount}`,
      'Payment Status': order.paymentStatus === 'pending' ? '⏳ Pending' : '✅ Paid',
      'Order Status': '🟡 Pending'
    });

    console.log(`✅ Order ${order.orderId} added to Google Sheet`);
    
    // Return the row number so we can update it later
    return newRow.rowNumber;
  } catch (error) {
    console.error('❌ Error adding to Google Sheet:', error.message);
    return null;
  }
}

// Update order status/payment in Google Sheets
async function updateOrderInSheet(orderId, updates) {
  try {
    if (!sheet) {
      const connected = await initGoogleSheets();
      if (!connected) return false;
    }

    await sheet.loadCells();
    const rows = await sheet.getRows();
    
    const targetRow = rows.find(row => row.get('Order ID') === orderId);
    if (!targetRow) {
      console.warn(`⚠️  Order ${orderId} not found in Google Sheet`);
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

module.exports = { initGoogleSheets, addOrderToSheet, updateOrderInSheet };
