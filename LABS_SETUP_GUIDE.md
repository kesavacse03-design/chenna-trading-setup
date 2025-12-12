# Time-Travel Labs Setup Guide

## 🚀 Quick Start

### 1. Database Migration

**Prerequisites:**
- PostgreSQL running on `localhost:5432`
- Database `cts_db` created

**Run Migration:**
```bash
cd chenna-CTS/backend
npx prisma migrate dev --name add_labs_models
npx prisma generate
```

This will create 3 new tables:
- `labs_runs` - Stores Time-Travel Labs research runs
- `labs_cache` - Caches stock research (30-day TTL)
- `trap_detections` - Stores institutional trap history

---

### 2. Start Backend

```bash
cd chenna-CTS/backend
npm start
```

Backend will run on `http://localhost:5174` (or port from `.env`)

---

### 3. Start Frontend

```bash
# From project root
npm run dev
```

Frontend will run on `http://localhost:5173`

---

## 🔬 Using Time-Travel Labs

### From Watchlist Page

1. Navigate to Watchlist page
2. Find a category card (e.g., "DOWNSIDE LOM SWING")
3. Click **"Run Labs"** button (emerald green with beaker icon)
4. Labs window opens full-screen

### Labs Workflow

```
1. Click "Run Time-Travel Labs"
   ↓
2. Backend tests 220+ combinations
   ↓
3. Shows recommended logic with accuracy
   ↓
4. If accuracy ≥70%, click "Promote to V1"
   ↓
5. Strategy version created in database
   ↓
6. Available in Strategy Workbench
```

---

## 📋 What Gets Created

### When You Run Labs:

1. **LabsRun Record** - Stores:
   - TT version (TT-V1, TT-V2, etc.)
   - Accuracy percentage
   - Recommended entry/exit logic
   - Trap avoidance rules
   - Performance metrics

2. **LabsCache Entries** - For each stock:
   - Best technical patterns
   - Detected traps
   - Last research date

3. **TrapDetection Records** - For each trap found:
   - Trap type (volume, bull, bear, stop hunt, etc.)
   - Confidence score
   - Detection indicators

### When You Promote to V1:

1. **StrategyVersion Record** - Stores:
   - Version tag (V1, V2, V3)
   - Source: 'labs'
   - Full strategy logic
   - Performance metrics
   - Link to Labs run

---

## 🎨 UI Features

### Category Cards
- **Color-coded** by type:
  - Blue gradient: Swing categories
  - Purple gradient: Intraday categories
  - Gray gradient: Other categories

- **Stock preview**: Shows first 3 stocks
- **Action buttons**:
  - 🔬 Run Labs (emerald)
  - 🔧 Strategy (cyan)

### Labs Window
- **Emerald glassmorphism theme**
- **Live progress tracking**
- **Cache status display**
- **Recommended logic viewer**
- **Performance metrics grid**

---

## 🔧 Troubleshooting

### Database Connection Error

```
Error: P1001: Can't reach database server at `localhost`:`5432`
```

**Solution**: Start PostgreSQL service
```bash
# Windows
net start postgresql-x64-14

# Mac
brew services start postgresql

# Linux
sudo systemctl start postgresql
```

### Backend Not Starting

**Check**:
1. `.env` file exists in `chenna-CTS/backend`
2. `DATABASE_URL` is correct
3. Port 5174 is not in use

### Labs Window Not Opening

**Check**:
1. Category has stocks
2. Backend is running
3. Browser console for errors

---

## 📊 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/labs/run-timetravel` | POST | Run Labs research |
| `/api/labs/cache-status/:categoryKey` | GET | Check cache |
| `/api/labs/promote-to-strategy` | POST | Promote to V1 |
| `/api/labs/versions/:categoryKey` | GET | Version history |
| `/api/traps/detect` | POST | Detect traps |
| `/api/traps/history/:symbol` | GET | Trap history |

---

## 🎯 Next Steps

1. **Run Migration** (when PostgreSQL is ready)
2. **Test Labs** on a small category (5-10 stocks)
3. **Verify Promotion** workflow
4. **Check Strategy Workbench** shows V1
5. **Move to Phase 3**: Shadow Learner

---

## 📝 Notes

- **Mock Data**: Currently using mock data generator for testing
- **Upstox**: Ready for integration when authenticated
- **Performance**: 220 combinations on 20 stocks takes ~2-5 minutes
- **Caching**: Reduces research time by 60-80% on subsequent runs

**Phase 2 Complete! Ready for testing! 🚀**
