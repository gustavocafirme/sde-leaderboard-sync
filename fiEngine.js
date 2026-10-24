const { totalTracks } = require('./config');

/**
 * Calcula o score_fi para cada entrada de uma pista.
 * Fórmula: score_fi = Wr / Pft (onde Wr é o tick time do 1º lugar e Pft é o tick time do jogador)
 */
function processTrackFiRatings(trackEntries) {
    if (!trackEntries || trackEntries.length === 0) return trackEntries;

    // O World Record (Wr) usa o tickTime do 1º colocado (já ordenado por effectiveTime/tempo)
    const worldRecordTime = trackEntries[0].tickTime;

    for (let index = 0; index < trackEntries.length; index++) {
        const entry = trackEntries[index];
        const playerTime = entry.tickTime; // Pft (Player frame time baseado no tick)

        let scoreFi = 0;
        if (playerTime > 0) {
            scoreFi = worldRecordTime / playerTime;
        }

        entry.scoreFi = scoreFi;
    }

    return trackEntries;
}

/**
 * Calcula globalmente o SSR-FI de cada jogador (soma dos scores dividido por 75).
 */
function computePlayerFiRatings(allUniqueSteamIds, playerScoresPerTrack) {
    const playerFiRatings = {};

    for (const steamId of allUniqueSteamIds) {
        const playerTracks = playerScoresPerTrack[steamId] || {};
        let sumOfFiScores = 0;
        const fiScoresPerTrack = {};

        for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
            const entry = playerTracks[trackIndex];
            const scoreFiValue = (entry && entry.scoreFi !== undefined) ? entry.scoreFi : 0.0;
            
            sumOfFiScores += scoreFiValue;
            if (entry) {
                fiScoresPerTrack[trackIndex] = scoreFiValue;
            }
        }

        const ssrFi = sumOfFiScores / totalTracks;

        playerFiRatings[steamId] = {
            ssrFi: isNaN(ssrFi) ? 0 : ssrFi,
            fiScoresPerTrack
        };
    }

    return playerFiRatings;
}

module.exports = {
    processTrackFiRatings,
    computePlayerFiRatings
};