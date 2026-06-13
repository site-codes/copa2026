const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// String de conexão SIMPLES
const MONGODB_URI = 'mongodb://mattheusoficial44_db_user:uiHvOndEbcaqPcZ1@copa2026-shard-00-00.b2jsqdd.mongodb.net:27017,copa2026-shard-00-01.b2jsqdd.mongodb.net:27017,copa2026-shard-00-02.b2jsqdd.mongodb.net:27017/?ssl=true&replicaSet=atlas-wys4gu-shard-0&authSource=admin&retryWrites=true&w=majority';
const DB_NAME = 'copa2026';

let db;
let client;

async function connectToMongo() {
    try {
        client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db(DB_NAME);
        console.log('✅ Conectado ao MongoDB Atlas');

        // Criar índices
        await db.collection('users').createIndex({ username: 1 });
        await db.collection('matches').createIndex({ id: 1 });
        await db.collection('bets').createIndex({ matchId: 1, username: 1 });
    } catch (error) {
        console.error('❌ Erro ao conectar ao MongoDB:', error.message);
        // Tentar novamente após 5 segundos
        setTimeout(connectToMongo, 5000);
    }
}

// Funções do banco
async function getUsers() {
    const users = await db.collection('users').find({}).toArray();
    return users.map(u => u.username);
}

async function addUser(username) {
    const exists = await db.collection('users').findOne({ username });
    if (!exists) {
        await db.collection('users').insertOne({ username });
    }
}

async function getBets() {
    const bets = await db.collection('bets').find({}).toArray();
    const betsMap = {};
    bets.forEach(bet => {
        if (!betsMap[bet.matchId]) betsMap[bet.matchId] = {};
        betsMap[bet.matchId][bet.username] = { home: bet.home, away: bet.away };
    });
    return betsMap;
}

async function saveBet(matchId, username, home, away) {
    await db.collection('bets').updateOne(
        { matchId, username },
        { $set: { matchId, username, home, away } },
        { upsert: true }
    );
}

async function getResults() {
    const results = await db.collection('results').find({}).toArray();
    const resultsMap = {};
    results.forEach(r => {
        resultsMap[r.matchId] = { home: r.home, away: r.away };
    });
    return resultsMap;
}

async function saveResult(matchId, home, away) {
    await db.collection('results').updateOne(
        { matchId },
        { $set: { matchId, home, away } },
        { upsert: true }
    );
}

async function deleteMatchResults(matchId) {
    await db.collection('results').deleteOne({ matchId });
    await db.collection('bets').deleteMany({ matchId });
}

async function getMatches() {
    return await db.collection('matches').find({}).toArray();
}

async function addMatch(match) {
    await db.collection('matches').insertOne(match);
}

async function updateMatch(id, home, away, date, time) {
    await db.collection('matches').updateOne(
        { id },
        { $set: { home, away, date, time } }
    );
}

async function deleteMatch(id) {
    await db.collection('matches').deleteOne({ id });
    await deleteMatchResults(id);
}

async function deleteUser(username) {
    await db.collection('users').deleteOne({ username });
    await db.collection('bets').deleteMany({ username });
}

// Função de pontuação
async function calculateDetailedPoints() {
    const users = await getUsers();
    const bets = await getBets();
    const results = await getResults();

    const userPoints = {};
    const userMatchPoints = {};

    users.forEach(u => {
        userPoints[u] = 0;
        userMatchPoints[u] = {};
    });

    for (const matchId in results) {
        const real = results[matchId];
        const realHome = parseInt(real.home);
        const realAway = parseInt(real.away);
        const matchBets = bets[matchId] || {};

        for (const username in matchBets) {
            const bet = matchBets[username];
            if (!bet || bet.home === null || bet.away === null) continue;

            const betHome = parseInt(bet.home);
            const betAway = parseInt(bet.away);
            let pontos = 0;
            let tipo = '';

            if (betHome === realHome && betAway === realAway) {
                pontos = 10;
                tipo = 'exato';
            } else {
                const betWinner = betHome > betAway ? "home" : (betAway > betHome ? "away" : "draw");
                const realWinner = realHome > realAway ? "home" : (realAway > realHome ? "away" : "draw");

                if (betWinner === realWinner) {
                    pontos = 5;
                    tipo = 'vencedor';
                } else {
                    const betDiff = Math.abs(betHome - betAway);
                    const realDiff = Math.abs(realHome - realAway);

                    if ((betHome > betAway && realHome > realAway && betDiff === realDiff) ||
                        (betAway > betHome && realAway > realHome && betDiff === realDiff)) {
                        pontos = 2;
                        tipo = 'diferenca';
                    } else {
                        pontos = 0;
                        tipo = 'erro';
                    }
                }
            }

            userPoints[username] += pontos;
            userMatchPoints[username][matchId] = { points: pontos, type: tipo, bet: `${betHome}x${betAway}`, real: `${realHome}x${realAway}` };
        }
    }

    return { userPoints, userMatchPoints };
}

// ============= ROTAS =============

// Rota de configuração - envia a URL base para o frontend
app.get('/api/config', (req, res) => {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    res.json({
        success: true,
        apiUrl: `${baseUrl}/api`
    });
});

app.get('/api/matches', async (req, res) => {
    const matches = await getMatches();
    res.json({ success: true, matches });
});

app.get('/api/ranking', async (req, res) => {
    const { userPoints } = await calculateDetailedPoints();
    const users = await getUsers();
    const ranking = users.map(user => ({
        username: user,
        points: userPoints[user] || 0
    })).sort((a, b) => b.points - a.points);
    res.json({ success: true, ranking });
});

app.get('/api/ranking/details', async (req, res) => {
    const { userPoints, userMatchPoints } = await calculateDetailedPoints();
    const users = await getUsers();
    const ranking = users.map(user => ({
        username: user,
        points: userPoints[user] || 0,
        details: userMatchPoints[user] || {}
    })).sort((a, b) => b.points - a.points);
    res.json({ success: true, ranking });
});

app.post('/api/register', async (req, res) => {
    const { username } = req.body;
    if (!username || username.trim() === "") {
        return res.json({ success: false, error: "Nome inválido" });
    }
    await addUser(username.trim());
    res.json({ success: true, username: username.trim() });
});

app.post('/api/bet', async (req, res) => {
    const { username, matchId, homeScore, awayScore } = req.body;
    const users = await getUsers();
    if (!users.includes(username)) {
        return res.json({ success: false, error: "Usuário não encontrado" });
    }
    await saveBet(matchId, username, parseInt(homeScore), parseInt(awayScore));
    res.json({ success: true });
});

app.get('/api/all-bets', async (req, res) => {
    const bets = await getBets();
    res.json({ success: true, bets });
});

app.get('/api/results', async (req, res) => {
    const results = await getResults();
    res.json({ success: true, results });
});

app.get('/api/users', async (req, res) => {
    const users = await getUsers();
    res.json({ success: true, users });
});

// Admin
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        res.json({ success: true });
    } else {
        res.json({ success: false, error: "Senha incorreta" });
    }
});

app.post('/api/admin/add-match', async (req, res) => {
    const { match } = req.body;
    match.id = Date.now().toString();
    await addMatch(match);
    res.json({ success: true, match });
});

app.put('/api/admin/update-match/:id', async (req, res) => {
    const { id } = req.params;
    const { home, away, date, time } = req.body;
    await updateMatch(id, home, away, date, time);
    res.json({ success: true });
});

app.delete('/api/admin/delete-match/:id', async (req, res) => {
    const { id } = req.params;
    await deleteMatch(id);
    res.json({ success: true });
});

app.post('/api/admin/result', async (req, res) => {
    const { matchId, homeScore, awayScore } = req.body;
    await saveResult(matchId, parseInt(homeScore), parseInt(awayScore));
    res.json({ success: true });
});

app.delete('/api/admin/delete-user/:username', async (req, res) => {
    const { username } = req.params;
    await deleteUser(username);
    res.json({ success: true });
});

app.get('/api/admin/all-matches', async (req, res) => {
    const matches = await getMatches();
    res.json({ success: true, matches });
});

app.get('/api/profile/:username', async (req, res) => {
    const { username } = req.params;
    const { userPoints, userMatchPoints } = await calculateDetailedPoints();
    const results = await getResults();
    const matches = await getMatches();

    let exactCount = 0, winnerCount = 0, diffCount = 0, wrongCount = 0, noBetCount = 0;
    const userBets = [];

    for (const matchId in results) {
        const result = results[matchId];
        const match = matches.find(m => m.id === matchId);
        if (!match) continue;

        const detail = userMatchPoints[username]?.[matchId];
        let type = detail?.type || 'nao_palpitou';
        let points = detail?.points || 0;

        if (type === 'exato') exactCount++;
        else if (type === 'vencedor') winnerCount++;
        else if (type === 'diferenca') diffCount++;
        else if (type === 'erro') wrongCount++;
        else if (type === 'nao_palpitou') noBetCount++;

        userBets.push({
            match: {
                home: match.home,
                away: match.away,
                homeFlag: match.homeFlag,
                awayFlag: match.awayFlag,
                date: match.date,
                time: match.time
            },
            result,
            points,
            type
        });
    }

    res.json({
        success: true,
        profile: {
            username,
            totalPoints: userPoints[username] || 0,
            stats: { exact: exactCount, winner: winnerCount, diff: diffCount, wrong: wrongCount, noBet: noBetCount },
            bets: userBets
        }
    });
});

// Iniciar servidor
async function startServer() {
    await connectToMongo();
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
        console.log(`👑 Admin: http://localhost:${PORT}/admin.html`);
    });
}

startServer();