# 🍽️ BHOSDIKA RESTAURENT — Digital Ordering System

Complete restaurant ordering system with **real-time Google Sheets sync**.

---

## 📁 Folder Structure

```
bhosdika-restaurant/
├── server.js               ← Main Express server
├── package.json
├── .env.example            ← Copy to .env and fill values
├── .gitignore
├── models/
│   └── Order.js            ← MongoDB schema
├── routes/
│   ├── orders.js           ← Order API endpoints
│   └── admin.js            ← Admin API endpoints
├── config/
│   └── googleSheets.js     ← Google Sheets integration
└── public/
    ├── index.html          ← Landing page
    ├── css/
    │   └── styles.css      ← Shared styles
    └── pages/
        ├── menu.html       ← Menu + cart page
        ├── payment.html    ← Payment page
        ├── admin.html      ← Admin dashboard
        └── kitchen.html    ← Kitchen screen
```

---

## 🚀 Local Setup

### Step 1: Install dependencies
```bash
npm install
```

### Step 2: Create .env file
```bash
cp .env.example .env
```
Then fill in your MongoDB URI, Google Sheets credentials (see below).

### Step 3: Run the server
```bash
# Development (auto-restart)
npm run dev

# Production
npm start
```

### Step 4: Open in browser
- Customer: http://localhost:3000
- Kitchen:  http://localhost:3000/kitchen
- Admin:    http://localhost:3000/admin (password: admin123)

---

## 🗃️ MongoDB Setup

1. Go to https://cloud.mongodb.com
2. Create a free cluster (M0 — Free Tier)
3. Click **Connect** → **Drivers**
4. Copy the connection string
5. Replace `<password>` with your DB user password
6. Paste in `.env` as `MONGODB_URI`

---

## 📊 Google Sheets Setup (IMPORTANT — Read Carefully)

### Step 1: Create a Google Sheet
1. Go to https://sheets.google.com
2. Create a new blank spreadsheet
3. Name it: **BHOSDIKA Orders**
4. Copy the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/YOUR_SPREADSHEET_ID/edit
                                          ^^^^^^^^^^^^^^^^^^^^
   ```
5. Set `GOOGLE_SPREADSHEET_ID` in your `.env`

### Step 2: Create a Google Cloud Project
1. Go to https://console.cloud.google.com
2. Click **New Project** → Name it "Bhosdika Restaurant" → Create
3. Make sure your new project is selected in the top dropdown

### Step 3: Enable Google Sheets API
1. Go to **APIs & Services** → **Library**
2. Search for **Google Sheets API**
3. Click it → **Enable**

### Step 4: Create Service Account
1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **Service Account**
3. Name: `bhosdika-sheets`
4. Click **Create and Continue** → **Done**
5. Click on the service account email you just created
6. Go to **Keys** tab → **Add Key** → **Create new key**
7. Choose **JSON** → **Create**
8. A `.json` file will download — **keep this safe!**

### Step 5: Extract credentials from JSON
Open the downloaded JSON file. It looks like:
```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "client_email": "bhosdika-sheets@your-project.iam.gserviceaccount.com",
  "private_key": "-----BEGIN RSA PRIVATE KEY-----\nABC123...\n-----END RSA PRIVATE KEY-----\n",
  ...
}
```

Copy values to `.env`:
```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=bhosdika-sheets@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nABC123...\n-----END RSA PRIVATE KEY-----\n"
```

⚠️ **Important**: Keep the `\n` characters in the private key as-is. Wrap the entire key in double quotes.

### Step 6: Share the Google Sheet with Service Account
1. Open your Google Sheet
2. Click **Share** (top right)
3. Paste the service account email (e.g., `bhosdika-sheets@...iam.gserviceaccount.com`)
4. Set permission to **Editor**
5. Click **Send**

✅ That's it! Now every new order will automatically appear in your Google Sheet.

### Step 7: Set up Kitchen Screen (for real-time view)
1. Open your Google Sheet
2. Go to **File** → **Share** → **Publish to web**
3. Under "Link", select the **Orders** sheet
4. Click **Publish** → Copy the URL
5. On the Kitchen Screen (/kitchen), click "Google Sheets View" tab
6. Paste the URL and click "Load Sheet"
7. The sheet will auto-refresh every 30 seconds!

---

## 🚢 Deploy to Render.com (Free)

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/bhosdika-restaurant.git
git push -u origin main
```

### Step 2: Create Render Service
1. Go to https://render.com → Sign up/login
2. Click **New** → **Web Service**
3. Connect your GitHub repository
4. Settings:
   - **Name**: bhosdika-restaurant
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Step 3: Add Environment Variables
In Render dashboard → Your service → **Environment** tab, add:
```
MONGODB_URI             = your_mongodb_connection_string
GOOGLE_SPREADSHEET_ID   = your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL = your_service_account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY      = -----BEGIN RSA PRIVATE KEY-----\n...your key...\n-----END RSA PRIVATE KEY-----\n
ADMIN_PASSWORD          = your_secure_password
NODE_ENV                = production
PORT                    = 3000
```

⚠️ For `GOOGLE_PRIVATE_KEY` on Render: paste the raw key value without outer quotes. Render will handle the newlines.

### Step 4: Deploy
Click **Create Web Service** — Render will deploy automatically. 🎉

Your app will be live at: `https://bhosdika-restaurant.onrender.com`

---

## 🌐 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Place new order |
| GET | `/api/orders/:orderId` | Get order by ID |
| POST | `/api/orders/:orderId/pay-online` | Process online payment |
| GET | `/api/admin/orders` | Get all orders (admin) |
| PATCH | `/api/admin/orders/:orderId/status` | Update order status |
| GET | `/api/admin/stats` | Dashboard statistics |

---

## 🔧 Troubleshooting

**Google Sheets not updating?**
- Check that you shared the sheet with the service account email
- Verify `GOOGLE_PRIVATE_KEY` has `\n` characters (not actual newlines in .env)
- Check server logs for authentication errors

**MongoDB connection failed?**
- Whitelist your IP in MongoDB Atlas (Network Access → Add IP → 0.0.0.0/0 for all)
- Verify connection string has correct password

**Orders not appearing in kitchen screen?**
- Kitchen screen polls `/api/admin/orders` every 15 seconds using password `admin123`
- If you changed admin password, update the hardcoded value in kitchen.html line ~180

---

## 📱 Pages Overview

| Page | URL | Description |
|------|-----|-------------|
| Landing | `/` | Customer details form |
| Menu | `/menu` | Food menu with cart |
| Payment | `/payment` | Order confirmation & payment |
| Admin | `/admin` | Order management dashboard |
| Kitchen | `/kitchen` | Kitchen display screen |
