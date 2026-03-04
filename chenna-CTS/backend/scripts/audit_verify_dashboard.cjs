// Verify dashboard API and report
(async () => {
    const [sig, sum, alerts] = await Promise.all([
        fetch('http://localhost:3001/api/v5/dashboard/signals').then(r => r.json()),
        fetch('http://localhost:3001/api/v5/dashboard/summary').then(r => r.json()),
        fetch('http://localhost:3001/api/v5/alerts/active').then(r => r.json())
    ]);

    const s = sig.signals || {};
    console.log('=== DASHBOARD API VERIFICATION ===\n');

    console.log('SIGNALS:');
    console.log('  CONFIRMED:', s.CONFIRMED?.length || 0);
    console.log('  PENDING:', s.PENDING?.length || 0);
    console.log('  EXPIRED:', s.EXPIRED?.length || 0);
    console.log('  EXECUTED:', s.EXECUTED?.length || 0);

    console.log('\nSUMMARY:', JSON.stringify(sum.summary?.today, null, 2));
    console.log('\nALERTS:', alerts.count);

    if (s.CONFIRMED?.length) {
        console.log('\nTOP 3 BY SCORE (with direction):');
        s.CONFIRMED.slice(0, 3).forEach((x, i) => {
            console.log(`  #${i + 1} ${x.symbol} | dir: ${x.macd1hState} | score: ${x.confidenceScore} | tier: ${x.confidenceTier}`);
        });

        console.log('\nSCORE DISTRIBUTION:');
        const tiers = { TIER_1: 0, TIER_2: 0, TIER_3: 0 };
        [...(s.CONFIRMED || []), ...(s.EXPIRED || [])].forEach(x => {
            if (x.confidenceTier) tiers[x.confidenceTier] = (tiers[x.confidenceTier] || 0) + 1;
        });
        console.log('  TIER_1 (score >= 95):', tiers.TIER_1);
        console.log('  TIER_2 (score >= 65):', tiers.TIER_2);
        console.log('  TIER_3 (score < 65):', tiers.TIER_3);
    }
})();
