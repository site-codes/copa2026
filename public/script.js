// Configuração dinâmica da API
let API_URL = 'https://copa2026-7exh.onrender.com/api';
let currentUser = localStorage.getItem('currentUser');

async function loadApiConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        if (data.success) {
            API_URL = data.apiUrl;
            console.log('✅ API configurada:', API_URL);
        }
    } catch (error) {
        console.log('⚠️ Usando fallback:', API_URL);
    }
}

function displayCurrentDate() {
    const hoje = new Date();
    document.getElementById('currentDate').textContent = hoje.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: { 'Content-Type': 'application/json' },
            ...options
        });
        return await response.json();
    } catch (error) {
        console.error('Erro na API:', error);
        return { success: false, error: 'Erro de conexão' };
    }
}

async function loadMatches() {
    const result = await apiRequest('/matches');
    return result.success ? result.matches : [];
}

async function loadRanking() {
    const result = await apiRequest('/ranking/details');
    return result.success ? result.ranking : [];
}

async function loadAllBets() {
    const result = await apiRequest('/all-bets');
    return result.success ? result.bets : {};
}

async function loadResults() {
    const result = await apiRequest('/results');
    return result.success ? result.results : {};
}

async function saveBet(matchId, homeScore, awayScore) {
    if (!currentUser) return false;
    const result = await apiRequest('/bet', {
        method: 'POST',
        body: JSON.stringify({ username: currentUser, matchId, homeScore, awayScore })
    });
    return result.success;
}

async function registerUser(username) {
    const result = await apiRequest('/register', { method: 'POST', body: JSON.stringify({ username }) });
    return result;
}

function checkBetAccuracy(bet, result) {
    if (!bet || !result) return null;
    if (bet.home === result.home && bet.away === result.away) return 'exact';

    const betWinner = bet.home > bet.away ? 'home' : (bet.away > bet.home ? 'away' : 'draw');
    const resultWinner = result.home > result.away ? 'home' : (result.away > result.home ? 'away' : 'draw');
    if (betWinner === resultWinner) return 'winner';

    const betDiff = Math.abs(bet.home - bet.away);
    const resultDiff = Math.abs(result.home - result.away);

    if ((bet.home > bet.away && result.home > result.away && betDiff === resultDiff) ||
        (bet.away > bet.home && result.away > result.home && betDiff === resultDiff)) {
        return 'diff';
    }

    return 'wrong';
}

function isMatchStarted(matchDateTime, matchTime) {
    if (!matchDateTime) return false;
    const [day, month, year] = matchDateTime.split('/');
    const [hour, minute] = matchTime.split(':');
    const matchDate = new Date(year, month - 1, day, hour, minute);
    const now = new Date();
    return now >= matchDate;
}

function isTodayMatch(matchDate) {
    if (!matchDate) return false;
    const [day, month, year] = matchDate.split('/');
    const today = new Date();
    return parseInt(day) === today.getDate() &&
        parseInt(month) === today.getMonth() + 1 &&
        parseInt(year) === today.getFullYear();
}

async function renderMatches() {
    const container = document.getElementById('matchesList');
    if (!container || !currentUser) return;

    const [matches, allBets, results] = await Promise.all([loadMatches(), loadAllBets(), loadResults()]);

    if (!matches.length) {
        container.innerHTML = '<div class="warning">⚠️ Nenhum jogo disponível. Aguarde o administrador cadastrar os jogos.</div>';
        return;
    }

    // Função para converter data DD/MM/AAAA para Date
    function parseDate(dateStr) {
        if (!dateStr) return null;
        const [day, month, year] = dateStr.split('/');
        return new Date(year, month - 1, day);
    }

    // Data atual (hoje)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Filtrar apenas jogos de hoje ou futuros
    const upcomingMatches = matches.filter(match => {
        const matchDate = parseDate(match.date);
        if (!matchDate) return true; // Se não tem data, mostra
        return matchDate >= today;
    });

    if (upcomingMatches.length === 0) {
        container.innerHTML = '<div class="warning">📅 Nenhum jogo programado para hoje. Volte amanhã para novos palpites!</div>';
        return;
    }

    // Ordenar por data (mais próximos primeiro)
    upcomingMatches.sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);
        return dateA - dateB;
    });

    container.innerHTML = upcomingMatches.map(match => {
        const existingBet = allBets[match.id]?.[currentUser];
        const hasResult = results[match.id];
        const result = results[match.id];
        const accuracy = hasResult && existingBet ? checkBetAccuracy(existingBet, result) : null;

        const matchStarted = isMatchStarted(match.date, match.time);
        const canEdit = !hasResult && !matchStarted;

        let cardClass = 'match-card';
        if (!canEdit && !hasResult) {
            cardClass += ' match-locked';
        } else if (hasResult) {
            cardClass += ' match-finished';
        }

        const buttonText = existingBet ? '✏️ EDITAR' : '💾 PALPITAR';

        let accuracyText = '';
        let accuracyClass = '';
        if (accuracy === 'exact') { accuracyText = '✅ EXATO! +10pts'; accuracyClass = 'correct-guess'; }
        else if (accuracy === 'winner') { accuracyText = '🎯 VENCEDOR! +5pts'; accuracyClass = 'winner-guess'; }
        else if (accuracy === 'diff') { accuracyText = '📊 DIFERENÇA! +2pts'; accuracyClass = 'diff-guess'; }
        else if (accuracy === 'wrong') { accuracyText = '❌ ERRADO! 0pts'; accuracyClass = 'incorrect-guess'; }

        return `
            <div class="${cardClass}">
                <div class="match-header">
                    <span>📅 ${match.date || 'Data a definir'} às ${match.time || '--:--'}</span>
                    ${matchStarted && !hasResult ? '<span class="warning-badge">⏰ JOGO EM ANDAMENTO</span>' : ''}
                    ${hasResult ? '<span class="finished-badge">✅ JOGO FINALIZADO</span>' : ''}
                </div>
                <div class="teams">
                    <div class="team">
                        <strong>${match.home}</strong>
                        <img src="${match.homeFlag}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                    </div>
                    <div class="score-display">
                        <input type="number" id="home_${match.id}" placeholder="0" value="${existingBet ? existingBet.home : ''}" min="0" step="1" ${!canEdit ? 'disabled' : ''}>
                        <span class="vs-text">vs</span>
                        <input type="number" id="away_${match.id}" placeholder="0" value="${existingBet ? existingBet.away : ''}" min="0" step="1" ${!canEdit ? 'disabled' : ''}>
                    </div>
                    <div class="team">
                        <img src="${match.awayFlag}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                        <strong>${match.away}</strong>
                    </div>
                </div>
                <div class="bet-actions">
                    ${canEdit ? `<button class="btn-submit-palpite" data-match="${match.id}">${buttonText}</button>` : ''}
                    ${!canEdit && !hasResult ? '<span class="warning-badge">🔒 PALPITES ENCERRADOS</span>' : ''}
                    ${accuracyText ? `<span class="accuracy-badge ${accuracyClass}">${accuracyText}</span>` : ''}
                    ${hasResult ? `<span class="result-badge">📊 ${result.home} x ${result.away}</span>` : ''}
                </div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.btn-submit-palpite').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const matchId = btn.getAttribute('data-match');
            const homeVal = parseInt(document.getElementById(`home_${matchId}`).value);
            const awayVal = parseInt(document.getElementById(`away_${matchId}`).value);
            if (isNaN(homeVal) || isNaN(awayVal)) { alert('Informe números válidos!'); return; }
            if (await saveBet(matchId, homeVal, awayVal)) {
                const isEditing = btn.textContent.includes('EDITAR');
                alert(isEditing ? 'Palpite editado com sucesso!' : 'Palpite salvo com sucesso!');
                await refreshAll();
            } else alert('Erro ao salvar');
        });
    });
}   

async function renderRanking() {
    const ranking = await loadRanking();
    const container = document.getElementById('rankingContainer');
    if (!ranking.length) { container.innerHTML = '<div>Ainda não há participantes.</div>'; return; }

    container.innerHTML = `<div class="ranking-list">${ranking.map((user, idx) => {
        const isCurrentUser = user.username === currentUser;
        const position = idx + 1;
        return `
            <div class="rank-item ${isCurrentUser ? 'current-user-rank' : ''}" onclick="goToProfile('${user.username}')" style="cursor: pointer;">
                <div>
                    <span class="rank-number ${position <= 3 ? 'top-' + position : ''}">${position}º</span> 
                    <span class="rank-name">${user.username} ${isCurrentUser ? '(você)' : ''}</span>
                </div>
                <div class="rank-points">${user.points} pts</div>
            </div>
        `;
    }).join('')}</div>`;
}

window.goToProfile = function (username) {
    window.location.href = `/profile.html?user=${encodeURIComponent(username)}`;
};

async function renderBetsAndResults() {
    const container = document.getElementById('betsContainer');
    const [ranking, matches, allBets, results] = await Promise.all([
        loadRanking(),
        loadMatches(),
        loadAllBets(),
        loadResults()
    ]);

    if (!ranking.length) { container.innerHTML = '<div>Nenhum membro registrado ainda.</div>'; return; }

    const currentUserData = ranking.find(u => u.username === currentUser);
    const otherUsers = ranking.filter(u => u.username !== currentUser);
    const orderedUsers = currentUserData ? [currentUserData, ...otherUsers] : ranking;

    container.innerHTML = orderedUsers.map(user => {
        const userBetsList = [];

        for (const matchId in allBets) {
            if (allBets[matchId][user.username]) {
                const match = matches.find(m => m.id === matchId);
                const bet = allBets[matchId][user.username];
                const result = results[matchId];

                if (match) {
                    let statusIcon = '⏳';
                    let statusText = `Palpite: ${bet.home} x ${bet.away}`;
                    let statusClass = 'pending';

                    if (result) {
                        const accuracy = checkBetAccuracy(bet, result);
                        if (accuracy === 'exact') { statusIcon = '✅'; statusText = `EXATO! ${bet.home}x${bet.away} = ${result.home}x${result.away} +10pts`; statusClass = 'exact'; }
                        else if (accuracy === 'winner') { statusIcon = '🎯'; statusText = `VENCEDOR! Palpite ${bet.home}x${bet.away} | Real ${result.home}x${result.away} +5pts`; statusClass = 'winner'; }
                        else if (accuracy === 'diff') { statusIcon = '📊'; statusText = `DIFERENÇA! Palpite ${bet.home}x${bet.away} | Real ${result.home}x${result.away} +2pts`; statusClass = 'diff'; }
                        else { statusIcon = '❌'; statusText = `ERROU! Palpite ${bet.home}x${bet.away} | Real ${result.home}x${result.away} 0pts`; statusClass = 'wrong'; }
                    }

                    userBetsList.push({
                        match: match,
                        statusIcon: statusIcon,
                        statusText: statusText,
                        statusClass: statusClass,
                        bet: bet,
                        result: result
                    });
                }
            }
        }

        userBetsList.sort((a, b) => {
            if (!a.match.date) return 1;
            if (!b.match.date) return -1;
            const [dayA, monthA, yearA] = a.match.date.split('/');
            const [dayB, monthB, yearB] = b.match.date.split('/');
            const dateA = new Date(yearA, monthA - 1, dayA);
            const dateB = new Date(yearB, monthB - 1, dayB);
            return dateB - dateA;
        });

        const lastThreeBets = userBetsList.slice(0, 3);
        const isCurrentUserCard = user.username === currentUser;
        const cardClass = isCurrentUserCard ? 'member-card current-user-card' : 'member-card';

        if (lastThreeBets.length === 0) {
            return `
                <div class="${cardClass}">
                    <div class="member-header">
                        <strong>👤 ${user.username} ${isCurrentUserCard ? '(você)' : ''}</strong>
                        <span class="member-points">🏆 ${user.points} pts</span>
                    </div>
                    <div class="member-bets">
                        <div class="no-bets">Nenhum palpite registrado ainda</div>
                    </div>
                    <div class="member-footer">
                        <button class="view-all-btn" onclick="goToProfile('${user.username}')">📊 VER HISTÓRICO COMPLETO</button>
                    </div>
                </div>
            `;
        }

        return `
            <div class="${cardClass}">
                <div class="member-header">
                    <strong>👤 ${user.username} ${isCurrentUserCard ? '(você)' : ''}</strong>
                    <span class="member-points">🏆 ${user.points} pts</span>
                </div>
                <div class="member-bets">
                    ${lastThreeBets.map(bet => `
                        <div class="bet-item ${bet.statusClass}">
                            <div class="bet-match">
                                <strong>${bet.match.home}</strong>
                                <img src="${bet.match.homeFlag}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                                <span class="bet-score">${bet.bet.home} x ${bet.bet.away}</span>
                                <img src="${bet.match.awayFlag}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                                <strong>${bet.match.away}</strong>
                            </div>
                            <div class="bet-result">
                                <span class="bet-status ${bet.statusClass}">${bet.statusIcon} ${bet.statusText}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                ${userBetsList.length > 3 ? `<div class="member-footer"><button class="view-all-btn" onclick="goToProfile('${user.username}')">📊 VER MAIS (${userBetsList.length - 3} restantes)</button></div>` : `
                <div class="member-footer">
                    <button class="view-all-btn" onclick="goToProfile('${user.username}')">📊 VER HISTÓRICO COMPLETO</button>
                </div>`}
            </div>
        `;
    }).join('');
}

async function updateUserHeader() {
    const ranking = await loadRanking();
    const userData = ranking.find(u => u.username === currentUser);
    if (userData) {
        const userHeader = document.getElementById('userHeader');
        if (userHeader) {
            userHeader.innerHTML = `
                <div class="user-info-header">
                    <span class="user-name">👤 ${currentUser}</span>
                    <span class="user-points-header">🏆 ${userData.points} pontos</span>
                </div>
            `;
        }
    }
}

async function refreshAll() {
    await Promise.all([renderMatches(), renderRanking(), renderBetsAndResults(), updateUserHeader()]);
}

async function doLogin() {
    const username = document.getElementById('usernameInput').value.trim();
    if (!username) { alert('Digite um nome!'); return; }
    const result = await registerUser(username);
    if (result.success) {
        currentUser = username;
        localStorage.setItem('currentUser', username);
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        await refreshAll();
    } else alert('Erro ao criar conta');
}

function logout() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    document.getElementById('authContainer').style.display = 'block';
    document.getElementById('mainContent').style.display = 'none';
    document.getElementById('usernameInput').value = '';
}

// Inicialização
async function initApp() {
    await loadApiConfig();
    displayCurrentDate();
    document.getElementById('loginBtn').addEventListener('click', doLogin);
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    if (currentUser) {
        document.getElementById('authContainer').style.display = 'none';
        document.getElementById('mainContent').style.display = 'block';
        await refreshAll();
    }
}

initApp();