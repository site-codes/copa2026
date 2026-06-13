// Detecta automaticamente se está local ou produção
const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://copa2026-cs7y.onrender.com/api';
let currentUser = localStorage.getItem('currentUser');

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
        console.error('Erro:', error);
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

    container.innerHTML = matches.map(match => {
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
        // Mostrar TODOS os jogos (com ou sem palpite)
        const allMatchesInfo = matches.map(match => {
            const bet = allBets[match.id]?.[user.username];
            const result = results[match.id];
            const hasBet = !!bet;
            const hasResult = !!result;

            let statusIcon = '⏳';
            let statusText = 'Aguardando resultado';
            let statusClass = 'pending';

            if (!hasBet && hasResult) {
                // Não palpitou em jogo que já tem resultado
                statusIcon = '❌';
                statusText = 'NÃO PALPITOU! 0pts';
                statusClass = 'no-bet';
            } else if (hasBet && hasResult) {
                // Tem palpite e tem resultado - verificar acerto
                const accuracy = checkBetAccuracy(bet, result);
                if (accuracy === 'exact') { statusIcon = '✅'; statusText = `EXATO! ${bet.home}x${bet.away} = ${result.home}x${result.away} +10pts`; statusClass = 'exact'; }
                else if (accuracy === 'winner') { statusIcon = '🎯'; statusText = `VENCEDOR! Palpite ${bet.home}x${bet.away} | Real ${result.home}x${result.away} +5pts`; statusClass = 'winner'; }
                else if (accuracy === 'diff') { statusIcon = '📊'; statusText = `DIFERENÇA! Palpite ${bet.home}x${bet.away} | Real ${result.home}x${result.away} +2pts`; statusClass = 'diff'; }
                else { statusIcon = '❌'; statusText = `ERROU! Palpite ${bet.home}x${bet.away} | Real ${result.home}x${result.away} 0pts`; statusClass = 'wrong'; }
            } else if (hasBet && !hasResult) {
                // Tem palpite mas aguarda resultado
                statusIcon = '⏳';
                statusText = `Palpite: ${bet.home} x ${bet.away}`;
                statusClass = 'pending';
            } else {
                // Não tem palpite e não tem resultado
                statusIcon = '⚪';
                statusText = 'Sem palpite';
                statusClass = 'no-bet';
            }

            return {
                match: match,
                statusIcon: statusIcon,
                statusText: statusText,
                statusClass: statusClass,
                hasBet: hasBet,
                hasResult: hasResult,
                bet: bet
            };
        });

        // Filtrar apenas jogos que já tem resultado OU que são de hoje
        const relevantMatches = allMatchesInfo.filter(info => info.hasResult || isTodayMatch(info.match.date));

        if (relevantMatches.length === 0) {
            return `
                <div class="member-card">
                    <div class="member-header">
                        <strong>👤 ${user.username} ${user.username === currentUser ? '(você)' : ''}</strong>
                        <span class="member-points">🏆 ${user.points} pts</span>
                    </div>
                    <div class="member-bets">
                        <div class="no-bets">Nenhum resultado disponível ainda</div>
                    </div>
                    <div class="member-footer">
                        <button class="view-all-btn" onclick="goToProfile('${user.username}')">📊 VER HISTÓRICO COMPLETO</button>
                    </div>
                </div>
            `;
        }

        // Pegar apenas os últimos 3
        const lastThree = relevantMatches.slice(-3);

        return `
            <div class="member-card">
                <div class="member-header">
                    <strong>👤 ${user.username} ${user.username === currentUser ? '(você)' : ''}</strong>
                    <span class="member-points">🏆 ${user.points} pts</span>
                </div>
                <div class="member-bets">
                    ${lastThree.map(info => `
                        <div class="bet-item ${info.statusClass}">
                            <div class="bet-match">
                                <strong>${info.match.home}</strong>
                                <img src="${info.match.homeFlag}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                                ${info.hasBet ? `<span class="bet-score">${info.bet.home} x ${info.bet.away}</span>` : '<span class="bet-score">? x ?</span>'}
                                <img src="${info.match.awayFlag}" onerror="this.src='https://flagcdn.com/w320/un.png'">
                                <strong>${info.match.away}</strong>
                            </div>
                            <div class="bet-result">
                                <span class="bet-status ${info.statusClass}">${info.statusIcon} ${info.statusText}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="member-footer">
                    <button class="view-all-btn" onclick="goToProfile('${user.username}')">📊 VER HISTÓRICO COMPLETO</button>
                </div>
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

if (currentUser) {
    document.getElementById('authContainer').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
    refreshAll();
}

document.getElementById('logoutBtn')?.addEventListener('click', logout);
displayCurrentDate();
document.getElementById('loginBtn').addEventListener('click', doLogin);