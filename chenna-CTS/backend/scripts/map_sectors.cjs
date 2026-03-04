const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

const SECTOR_MAPPING = {
    'NIFTY BANK': ['HDFCBANK', 'ICICIBANK', 'SBIN', 'BANKBARODA', 'IDFCFIRSTB', 'RBLBANK', 'PNB', 'UNIONBANK', 'AUBANK', 'AXISBANK', 'KOTAKBANK', 'INDUSINDBK', 'BANDHANBNK', 'FEDERALBNK', 'BANKINDIA', 'CANBK', 'INDIANB'],
    'NIFTY IT': ['INFY', 'TCS', 'PERSISTENT', 'COFORGE', 'LTIM', 'WIPRO', 'HCLTECH', 'TECHM', 'MPHASIS', 'CYIENT', 'KPITTECH', 'TATAELXSI', 'OFSS'],
    'NIFTY PHARMA': ['MANKIND', 'AUROPHARMA', 'DRREDDY', 'BIOCON', 'ZYDUSLIFE', 'TORNTPHARM', 'ALKEM', 'SYNGENE', 'DIVISLAB', 'SUNPHARMA', 'LUPIN', 'CIPLA', 'GLENMARK', 'LAURUSLABS', 'APOLLOHOSP', 'MAXHEALTH', 'FORTIS'],
    'NIFTY METAL': ['COALINDIA', 'NMDC', 'VEDL', 'NATIONALUM', 'HINDZINC', 'TATASTEEL', 'JSWSTEEL', 'HINDALCO', 'SAIL', 'JINDALSTEL', 'APLAPOLLO'],
    'NIFTY AUTO': ['TVSMOTOR', 'BAJAJ-AUTO', 'EICHERMOT', 'MOTHERSON', 'ASHOKLEY', 'TATAMOTORS', 'M&M', 'MARUTI', 'HEROMOTOCO', 'BOSCHLTD', 'SONACOMS', 'BHARATFORG', 'MRF', 'TIINDIA', 'UNOMINDA', 'TUBEINVEST'],
    'NIFTY ENERGY': ['ONGC', 'GAIL', 'OIL', 'NTPC', 'RELIANCE', 'POWERGRID', 'BPCL', 'IOC', 'HINDPETRO', 'ADANIGREEN', 'TATAPOWER', 'NHPC', 'TORNTPOWER', 'JSWENERGY', 'IREDA', 'SUZLON'],
    'NIFTY REALTY': ['GODREJPROP', 'DLF', 'OBEROIRLTY', 'PRESTIGE', 'LODHA', 'PHOENIXLTD', 'BRIGADE'],
    'NIFTY FMCG': ['COLPAL', 'MARICO', 'ITC', 'TATACONSUM', 'HINDUNILVR', 'DABUR', 'GODREJCP', 'BRITANNIA', 'VBL', 'UNITDSPR', 'PATANJALI', 'UPL', 'MCDOWELL-N', 'JUBLFOOD', 'RADICO'],
    'NIFTY INFRA': ['NBCC', 'IRFC', 'LT', 'L&T', 'VOLTAS', 'SIEMENS', 'ABB', 'BHEL', 'ADANIPORTS', 'CONCOR', 'IRCTC', 'RVNL', 'TITAGARH', 'CUMMINSIND', 'CGPOWER', 'GMRINFRA', 'GMRAIRPORT', 'HUDCO', 'AMBUJACEM', 'ULTRACEMCO', 'SHREECEM', 'DALBHARAT'],
    'NIFTY FIN SERVICE': ['BAJFINANCE', 'BAJAJFINSV', 'CHOLAFIN', 'HDFCAMC', 'MUTHOOTFIN', 'SRF', 'M&MFIN', 'RECLTD', 'PFC', 'SHRIRAMFIN', 'SBICARD', 'ICICIPRULI', 'SBILIFE', 'HDFCLIFE', 'LICI', 'ICICIGI', 'POLICYBZR', 'PAYTM', 'CAMS', 'MCX', 'CDSL', 'IEX', 'NUVAMA', 'ANGELONE', 'BSE', 'KFINTECH', 'PNBHOUSING', 'LICHSGFIN', 'MANAPPURAM', '360ONE', 'LTF', 'IIFL', 'SAMMAANCAP', 'JIOFIN', 'BAJAJHLDNG', 'ABCAPITAL'],
    'NIFTY CONSUMER CAP': ['TITAN', 'TRENT', 'DMART', 'DIXON', 'HAVELLS', 'CROMPTON', 'BLUESTARCO', 'ASTRAL', 'SUPREMEIND', 'PIDILITIND', 'ASIANPAINT', 'BERGEPAINT', 'POLYCAB', 'KEI', 'PAGEIND', 'BATAINDIA', 'INDHOTEL', 'NYKAA', 'NAUKRI', 'INDIGO', 'DELHIVERY'],
    'NIFTY PSE': ['MAZDOCK', 'HAL', 'BEL', 'BDL', 'PETRONET'],
    'NIFTY COMMODITIES': ['PIIND', 'SRF', 'COROMANDEL']
};

// Fallback search mechanism
function getSectorMap(allSymbols) {
    const finalMap = {};
    for (const sym of allSymbols) {
        let assigned = 'UNKNOWN';
        for (const [sector, stocks] of Object.entries(SECTOR_MAPPING)) {
            if (stocks.includes(sym)) {
                assigned = sector;
                break;
            }
        }
        finalMap[sym] = assigned;
    }
    return finalMap;
}

async function run() {
    const rawIds = fs.readFileSync(path.join(__dirname, '../ib_symbols.json'), 'utf8');
    const symbols = JSON.parse(rawIds);

    const mapped = getSectorMap(symbols);

    // Check unknowns
    const unknowns = symbols.filter(s => mapped[s] === 'UNKNOWN');
    if (unknowns.length > 0) {
        console.log(`Missing manual mappings for ${unknowns.length} items:`, unknowns.join(', '));
        // We'll throw unknown into a miscellaneous bucket just so they exist, or let them remain UNKNOWN.
        unknowns.forEach(u => mapped[u] = 'MISC_EQUITY');
    }

    // 1. Write the static JSON
    const dataDir = path.join(__dirname, '../data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    fs.writeFileSync(path.join(dataDir, 'sector_map.json'), JSON.stringify(mapped, null, 2));

    // 2. Update Stock Table
    // Prisma doesn't have a bulk update for separate IDs with different values easily without heavy transaction,
    // so we'll do an async update loop
    let updated = 0;
    for (const sym of symbols) {
        const sectorVal = mapped[sym];
        try {
            await prisma.stock.update({
                where: { symbol: sym },
                data: { sector: sectorVal }
            });
            updated++;
        } catch (e) {
            console.error(`Failed to update DB for ${sym}:`, e.message);
        }
    }

    console.log(`Successfully mapped and updated ${updated} stocks with sector Data!`);
}

run().then(() => prisma.$disconnect());
