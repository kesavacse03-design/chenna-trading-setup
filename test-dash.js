const fetch = require('node-fetch');
fetch('http://localhost:3001/api/v5/dashboard/signals')
    .then(r => r.json())
    .then(signalsData => {
        const sigs = signalsData.signals || {};
        const allRaw = [...(sigs.CONFIRMED || []), ...(sigs.PENDING || [])];
        const mapped = allRaw.map((s) => ({
            id: s.id,
            signalId: s.signalId || s.id?.toString(),
            categoryKey: s.category || s.categoryKey || 'INTRADAY_BOOST',
            type: s.direction || s.macd1hState || 'LONG',
            symbol: s.symbol,
            signalDate: s.signalDate || s.createdAt,
            confidenceScore: (s.confidenceScore || 0) / 100,
            userAction: typeof s.userAction !== 'undefined' ? s.userAction : null,
            ageMinutes: s.ageMinutes ?? null,
            opportunityStatus: s.opportunityStatus || 'UNKNOWN',
        }));
        
        const getRecencyMultiplier = (mins) => {
            if (mins === null) return 1.0;
            if (mins < 5) return 1.5;
            if (mins < 15) return 1.2;
            if (mins < 30) return 1.0;
            if (mins < 60) return 0.7;
            return 0.3;
        };

        const activeSignals = mapped.filter(s => !s.userAction)
          .map(s => ({
            ...s,
            priority: (s.confidenceScore * 100) * getRecencyMultiplier(s.ageMinutes)
          }));
          
        console.log('Total mapped:', mapped.length);
        console.log('Total active:', activeSignals.length);
        if(activeSignals.length > 0) {
            console.log('First active signal:', activeSignals[0]);
        }
    }).catch(console.error);
