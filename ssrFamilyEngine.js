const { totalTracks, scorePowerFactor, scoreWDecayFactor, ssrWFinalPowerPass, countryContributionFactor } = require('./config');

/**
 * Calcula o Tick Time e o Effective Time oficial para uma entrada de tempo.
 * Fórmulas:
 * Wt = Min( 0.316 * Tanh((Tt-91.15)/28.51) + 0.884; 1)
 * Et = T * Wt + Tt * (1 - Wt)
 */

/**
 * Calcula o Effective Time recebendo o tempo em segundos puro
 */
function calculateEffectiveTime(timeInSeconds, tickTime) {
    const weight = Math.min(0.316 * Math.tanh((tickTime - 91.15) / 28.51) + 0.884, 1);
    const effectiveTime = (timeInSeconds * weight) + (tickTime * (1 - weight));
    return effectiveTime;
}

/**
 * Calcula os scores, posições e desempates (to2nd) para as entradas de uma pista.
 * Também calcula o C-Score por país unificado (usando o país oficial do jogador se fornecido).
 */
function processTrackRatings(trackEntries, playerBestCountryMap = null) {
    if (!trackEntries || trackEntries.length === 0) return { trackEntries, countryScores: {} };

    // Ordena por Effective Time crescente
    trackEntries.sort((a, b) => a.effectiveTime - b.effectiveTime);

    const worldRecordEffectiveTime = trackEntries[0].effectiveTime;
    const baseTimePosition = Math.round(trackEntries.length * 0.75);
    const baseTimeEffectiveTime = trackEntries[baseTimePosition - 1].effectiveTime;

    for (let index = 0; index < trackEntries.length; index++) {
        const entry = trackEntries[index];
        const calculatedPosition = index + 1;
        let score = 0;

        if (calculatedPosition === 1) {
            score = 1.0;
        } else if (calculatedPosition >= baseTimePosition) {
            score = 0.0;
        } else {
            const numerator = entry.effectiveTime - worldRecordEffectiveTime;
            const denominator = baseTimeEffectiveTime - worldRecordEffectiveTime;
            score = Math.pow(1 - (numerator / denominator), scorePowerFactor);
        }

        entry.calculatedPosition = calculatedPosition;
        entry.score = Math.max(0, Math.min(1, score));
    }

    for (let index = 0; index < trackEntries.length; index++) {
        const entry = trackEntries[index];
        if (entry.calculatedPosition === 1) {
            entry.to2nd = entry.score - trackEntries[1].score;
        } else {
            entry.to2nd = 0.0;
        }
    }

    // Agrupamento e cálculo do C-Score por país na pista usando o país oficial do jogador
    const entriesByCountry = {};
    for (const entry of trackEntries) {
        const effectiveCountryId = (playerBestCountryMap && playerBestCountryMap[entry.steamId] !== undefined && playerBestCountryMap[entry.steamId] !== null)
            ? playerBestCountryMap[entry.steamId]
            : entry.countryId;

        entry.effectiveCountryId = effectiveCountryId;

        if (!entriesByCountry[effectiveCountryId]) {
            entriesByCountry[effectiveCountryId] = [];
        }
        entriesByCountry[effectiveCountryId].push(entry);
    }

    const trackCountryScores = {};

    for (const countryIdStr in entriesByCountry) {
        const countryId = parseInt(countryIdStr);
        const countryEntries = entriesByCountry[countryId];

        countryEntries.sort((a, b) => b.score - a.score);

        let totalCountryCScore = 0;
        let remainingWeight = 1.0;

        for (let k = 0; k < countryEntries.length; k++) {
            const entry = countryEntries[k];
            const contributionWeight = remainingWeight * countryContributionFactor;
            
            const playerContribution = entry.score * contributionWeight;
            entry.cScore = playerContribution;

            totalCountryCScore += playerContribution;
            remainingWeight -= contributionWeight;
        }

        trackCountryScores[countryId] = totalCountryCScore;
    }

    return { trackEntries, countryScores: trackCountryScores };
}

/**
 * Calcula globalmente o SSR, SSR-W e Score-W de cada jogador.
 * Ordena os scores considerando rigorosamente o desempate pela coluna `to2nd` (maior to2nd fica mais alto).
 */
function computePlayerRatings(allUniqueSteamIds, playerScoresPerTrack) {
    const playerRatings = {};
    let normalizationConstant = 0;
    for (let n = 1; n <= totalTracks; n++) {
        normalizationConstant += Math.pow(scoreWDecayFactor, n - 1);
    }

    for (const steamId of allUniqueSteamIds) {
        const playerTracks = playerScoresPerTrack[steamId] || {};
        const allScores = [];

        for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
            const entry = playerTracks[trackIndex];
            const scoreValue = entry ? entry.score : 0.0;
            allScores.push({ trackIndex, score: scoreValue, entry });
        }

        // Ordenação primária por score decrescente, secundária por to2nd decrescente
        allScores.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            const to2ndA = a.entry ? a.entry.to2nd : 0.0;
            const to2ndB = b.entry ? b.entry.to2nd : 0.0;
            return to2ndB - to2ndA;
        });

        let sumOfScores = 0;
        let sumOfScoreWeighted = 0;
        const weightedScoresPerTrack = {};

        for (let index = 0; index < allScores.length; index++) {
            const scoreObj = allScores[index];
            const scorePosition = index + 1;
            const weightedScore = scoreObj.score * Math.pow(scoreWDecayFactor, scorePosition - 1);

            sumOfScores += scoreObj.score;
            sumOfScoreWeighted += weightedScore;

            if (scoreObj.entry) {
                weightedScoresPerTrack[scoreObj.trackIndex] = weightedScore;
            }
        }

        const ssr = sumOfScores / totalTracks;
        const ssrW = Math.pow((sumOfScoreWeighted / normalizationConstant), ssrWFinalPowerPass);

        playerRatings[steamId] = {
            ssr: isNaN(ssr) ? 0 : ssr,
            ssrW: isNaN(ssrW) ? 0 : ssrW,
            weightedScoresPerTrack
        };
    }

    return playerRatings;
}

/**
 * Calcula o C-SSR global de cada país.
 */
function computeCountryRatings(allUniqueCountryIds, countryScoresPerTrack) {
    const countryRatings = {};
    for (const countryId of allUniqueCountryIds) {
        let sumOfCScores = 0;
        for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
            sumOfCScores += (countryScoresPerTrack[trackIndex] && countryScoresPerTrack[trackIndex][countryId]) || 0.0;
        }
        const cssr = sumOfCScores / totalTracks;
        countryRatings[countryId] = {
            cssr: isNaN(cssr) ? 0 : cssr
        };
    }
    return countryRatings;
}

module.exports = {
    calculateEffectiveTime,
    processTrackRatings,
    computePlayerRatings,
    computeCountryRatings
};