const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Arquivo de banco de dados - usar caminho absoluto para o Render
const DB_FILE = path.join(__dirname, 'database.json');

// Inicializar banco de dados
let db = {
    users: [],
    bets: {},
    results: {},
    matches: []
};

// Carregar dados existentes
if (fs.existsSync(DB_FILE)) {
    try {
        const loaded = JSON.parse(fs.readFileSync(DB_FILE));
        db = { ...db, ...loaded };
        console.log("📂 Database carregado:", db.matches.length, "jogos,", db.users.length, "usuários");
    } catch (e) { console.error("Erro ao ler DB", e); }
}

function saveDatabase() {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    console.log("✅ Database salvo");
}

// Função de pontuação (mesma do seu server.js atual)
function calculateDetailedPoints() {
    const userPoints = {};
    const userMatchPoints = {};

    db.users.forEach(u => {
        userPoints[u] = 0;
        userMatchPoints[u] = {};
    });

    for (const matchId in db.results) {
        const real = db.results[matchId];
        if (!real) continue;

        const realHome = parseInt(real.home);
        const realAway = parseInt(real.away);
        const matchBets = db.bets[matchId] || {};

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
            }
            else {
                const betWinner = betHome > betAway ? "home" : (betAway > betHome ? "away" : "draw");
                const realWinner = realHome > realAway ? "home" : (realAway > realHome ? "away" : "draw");

                if (betWinner === realWinner) {
                    pontos = 5;
                    tipo = 'vencedor';
                }
                else {
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

        for (const username of db.users) {
            if (!matchBets[username] || matchBets[username].home === null) {
                userMatchPoints[username][matchId] = { points: 0, type: 'nao_palpitou', bet: '? x ?', real: `${realHome}x${realAway}` };
            }
        }
    }

    return { userPoints, userMatchPoints };
}

// Rotas (mesmas do seu server.js atual)
app.get('/api/matches', (req, res) => {
    res.json({ success: true, matches: db.matches });
});

app.get('/api/ranking', (req, res) => {
    const { userPoints } = calculateDetailedPoints();
    const ranking = db.users.map(user => ({
        username: user,
        points: userPoints[user] || 0
    })).sort((a, b) => b.points - a.points);
    res.json({ success: true, ranking });
});

app.get('/api/ranking/details', (req, res) => {
    const { userPoints, userMatchPoints } = calculateDetailedPoints();
    const ranking = db.users.map(user => ({
        username: user,
        points: userPoints[user] || 0,
        details: userMatchPoints[user] || {}
    })).sort((a, b) => b.points - a.points);
    res.json({ success: true, ranking });
});

app.post('/api/register', (req, res) => {
    const { username } = req.body;
    if (!username || username.trim() === "") {
        return res.json({ success: false, error: "Nome inválido" });
    }

    const cleanUsername = username.trim();
    if (!db.users.includes(cleanUsername)) {
        db.users.push(cleanUsername);
        saveDatabase();
    }

    res.json({ success: true, username: cleanUsername });
});

app.post('/api/bet', (req, res) => {
    const { username, matchId, homeScore, awayScore } = req.body;

    if (!username || !db.users.includes(username)) {
        return res.json({ success: false, error: "Usuário não encontrado" });
    }

    const matchExists = db.matches.some(m => m.id === matchId);
    if (!matchExists) {
        return res.json({ success: false, error: "Jogo não existe mais" });
    }

    if (!db.bets[matchId]) db.bets[matchId] = {};
    db.bets[matchId][username] = { home: parseInt(homeScore), away: parseInt(awayScore) };
    saveDatabase();

    res.json({ success: true });
});

app.get('/api/all-bets', (req, res) => {
    res.json({ success: true, bets: db.bets });
});

app.get('/api/results', (req, res) => {
    res.json({ success: true, results: db.results });
});

app.get('/api/users', (req, res) => {
    res.json({ success: true, users: db.users });
});

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'admin123') {
        res.json({ success: true, message: "Login admin bem sucedido" });
    } else {
        res.json({ success: false, error: "Senha incorreta" });
    }
});

app.post('/api/admin/add-match', (req, res) => {
    const { match } = req.body;
    if (!match || !match.home || !match.away) {
        return res.json({ success: false, error: "Dados do jogo incompletos" });
    }
    match.id = Date.now().toString();
    db.matches.push(match);
    saveDatabase();
    res.json({ success: true, match });
});

app.put('/api/admin/update-match/:id', (req, res) => {
    const { id } = req.params;
    const { home, away, date, time } = req.body;

    const matchIndex = db.matches.findIndex(m => m.id === id);
    if (matchIndex === -1) {
        return res.json({ success: false, error: "Jogo não encontrado" });
    }

    db.matches[matchIndex] = {
        ...db.matches[matchIndex],
        home: home || db.matches[matchIndex].home,
        away: away || db.matches[matchIndex].away,
        date: date || db.matches[matchIndex].date,
        time: time || db.matches[matchIndex].time
    };

    saveDatabase();
    res.json({ success: true });
});

app.delete('/api/admin/delete-match/:id', (req, res) => {
    const { id } = req.params;

    db.matches = db.matches.filter(m => m.id !== id);

    if (db.bets[id]) {
        delete db.bets[id];
    }

    if (db.results[id]) {
        delete db.results[id];
    }

    saveDatabase();
    res.json({ success: true });
});

app.post('/api/admin/result', (req, res) => {
    const { matchId, homeScore, awayScore } = req.body;

    if (!matchId) {
        return res.json({ success: false, error: "ID do jogo não informado" });
    }

    const matchExists = db.matches.some(m => m.id === matchId);
    if (!matchExists) {
        return res.json({ success: false, error: "Jogo não encontrado" });
    }

    if (isNaN(homeScore) || isNaN(awayScore)) {
        return res.json({ success: false, error: "Placar inválido" });
    }

    db.results[matchId] = { home: parseInt(homeScore), away: parseInt(awayScore) };
    saveDatabase();

    res.json({ success: true });
});

app.delete('/api/admin/delete-user/:username', (req, res) => {
    const { username } = req.params;
    const index = db.users.indexOf(username);
    if (index !== -1) {
        db.users.splice(index, 1);

        for (const matchId in db.bets) {
            if (db.bets[matchId][username]) {
                delete db.bets[matchId][username];
            }
        }
        saveDatabase();
        res.json({ success: true });
    } else {
        res.json({ success: false, error: "Usuário não encontrado" });
    }
});

app.get('/api/admin/all-matches', (req, res) => {
    res.json({ success: true, matches: db.matches });
});

app.get('/api/profile/:username', (req, res) => {
    const { username } = req.params;

    if (!db.users.includes(username)) {
        return res.json({ success: false, error: "Usuário não encontrado" });
    }

    const { userPoints, userMatchPoints } = calculateDetailedPoints();
    const userTotalPoints = userPoints[username] || 0;
    const userDetails = userMatchPoints[username] || {};

    let exactCount = 0, winnerCount = 0, diffCount = 0, wrongCount = 0, noBetCount = 0;
    const userBets = [];

    for (const matchId in db.results) {
        const result = db.results[matchId];
        const match = db.matches.find(m => m.id === matchId);
        if (!match) continue;

        const bet = db.bets[matchId]?.[username];
        const hasBet = bet && bet.home !== null && bet.away !== null;
        const detail = userDetails[matchId];

        let type = detail?.type || 'nao_palpitou';
        let points = detail?.points || 0;

        if (type === 'exato') exactCount++;
        else if (type === 'vencedor') winnerCount++;
        else if (type === 'diferenca') diffCount++;
        else if (type === 'erro') wrongCount++;
        else if (type === 'nao_palpitou') noBetCount++;

        userBets.push({
            matchId: matchId,
            match: {
                home: match.home,
                away: match.away,
                homeFlag: match.homeFlag,
                awayFlag: match.awayFlag,
                date: match.date,
                time: match.time
            },
            bet: hasBet ? { home: bet.home, away: bet.away } : null,
            result: result,
            points: points,
            type: type
        });
    }

    userBets.sort((a, b) => {
        if (!a.match.date) return 1;
        if (!b.match.date) return -1;
        const [dayA, monthA, yearA] = a.match.date.split('/');
        const [dayB, monthB, yearB] = b.match.date.split('/');
        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);
        return dateB - dateA;
    });

    res.json({
        success: true,
        profile: {
            username: username,
            totalPoints: userTotalPoints,
            stats: {
                exact: exactCount,
                winner: winnerCount,
                diff: diffCount,
                wrong: wrongCount,
                noBet: noBetCount
            },
            bets: userBets
        }
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    console.log(`👑 Painel Admin: http://localhost:${PORT}/admin.html`);
    console.log(`🔑 Senha admin: admin123`);
});