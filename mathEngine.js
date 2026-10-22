const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const { trackingDir, totalTracks, scorePowerFactor, scoreWDecayFactor, ssrWFinalPowerPass, countryContributionFactor } = require('./config');
const { getPlayerName, getCountryName } = require('./syncMetadata');

function calculateTickTime(timeInSeconds) {
    if (Number(timeInSeconds.toFixed(2)) === timeInSeconds) {
        return timeInSeconds;
    } else {
        return Number((Math.round(timeInSeconds * 50) / 50).toFixed(2));
    }
}

async function processAndSyncLeaderboardsAndRatings() {
    const leaderboardsDir = path.join(trackingDir, 'Leaderboards');
    if (!fs.existsSync(leaderboardsDir)) {
        console.log("[Leaderboards] Pasta de leaderboards não encontrada.");
        return;
    }

    const allTracksData = {};
    const playerScoresPerTrack = {};
    const allUniqueSteamIds = new Set();
    const allUniqueCountryIds = new Set();
    const countryScoresPerTrack = {}; // countryId -> { trackIndex -> cScore }

    // Passo A: Processa cada pista individualmente usando trackIndex (1 a 75)
    for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
        const filePath = path.join(leaderboardsDir, `leaderboard_track_${trackIndex}.csv`);
        if (!fs.existsSync(filePath)) continue;

        const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
        const trackEntries = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 5) {
                const originalPosition = parseInt(parts[0].trim());
                const steamId = parts[1].trim();
                const countryId = parseInt(parts[2].trim());
                const carId = parseInt(parts[3].trim());
                const timeMs = parseInt(parts[4].trim());

                allUniqueSteamIds.add(steamId);
                allUniqueCountryIds.add(countryId);

                const timeInSeconds = timeMs / 1000.0;
                const tickTime = calculateTickTime(timeInSeconds);
                const timeWeight = Math.min(0.316 * Math.tanh((tickTime - 91.15) / 28.51) + 0.884, 1);
                const effectiveTime = (timeInSeconds * timeWeight) + (tickTime * (1 - timeWeight));

                trackEntries.push({
                    steamId,
                    countryId,
                    carId,
                    timeMs,
                    timeInSeconds,
                    tickTime,
                    effectiveTime,
                    originalPosition
                });
            }
        }

        if (trackEntries.length === 0) continue;

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

        // Cálculo do C-Score por país nesta pista
        // Cálculo do C-Score e da contribuição individual por país nesta pista
        const entriesByCountry = {};
        for (const entry of trackEntries) {
            if (!entriesByCountry[entry.countryId]) {
                entriesByCountry[entry.countryId] = [];
            }
            entriesByCountry[entry.countryId].push(entry);
        }

        if (!countryScoresPerTrack[trackIndex]) {
            countryScoresPerTrack[trackIndex] = {};
        }

        for (const countryIdStr in entriesByCountry) {
            const countryId = parseInt(countryIdStr);
            const countryEntries = entriesByCountry[countryId];

            // Ordena os jogadores do país em ordem decrescente de score (SSR)
            countryEntries.sort((a, b) => b.score - a.score);

            let totalCountryCScore = 0;
            let remainingWeight = 1.0;

            for (let k = 0; k < countryEntries.length; k++) {
                const entry = countryEntries[k];
                const contributionWeight = remainingWeight * countryContributionFactor;
                
                // Contribuição individual exata deste jogador para o país neste mapa
                const playerContribution = entry.score * contributionWeight;
                entry.cScore = playerContribution;

                totalCountryCScore += playerContribution;
                remainingWeight -= contributionWeight;
            }

            // O total do país na pista serve para calcular o C-SSR global do país depois
            countryScoresPerTrack[trackIndex][countryId] = totalCountryCScore;
        }

        allTracksData[trackIndex] = trackEntries;

        for (const entry of trackEntries) {
            if (!playerScoresPerTrack[entry.steamId]) {
                playerScoresPerTrack[entry.steamId] = {};
            }
            playerScoresPerTrack[entry.steamId][trackIndex] = entry;
        }
    }

    // Passo B: Calcula Score-W, SSR e SSR-W globais para cada jogador (com desempate por to2nd)
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

    // Passo C: Calcula o C-SSR global para cada país (soma dos C-Scores dividida por 75)
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

    // Passo D: Sincroniza os dados detalhados incluindo o c_score e track_index na constraint
    console.log("[Leaderboards] Enviando dados calculados das pistas para o Supabase...");

    for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
        const trackEntries = allTracksData[trackIndex];
        if (!trackEntries || trackEntries.length === 0) continue;

        const rowsToUpsert = trackEntries.map(entry => {
            const playerRatingData = playerRatings[entry.steamId];
            const scoreW = playerRatingData && playerRatingData.weightedScoresPerTrack[trackIndex] !== undefined
                ? playerRatingData.weightedScoresPerTrack[trackIndex]
                : 0.0;

            return {
                track_index: trackIndex,
                position: entry.calculatedPosition,
                steam_id: entry.steamId,
                country_id: entry.countryId,
                car_id: entry.carId,
                time_ms: entry.timeMs,
                effective_time: entry.effectiveTime,
                score: entry.score,
                score_w: scoreW,
                to2nd: entry.to2nd,
                c_score: entry.cScore || 0.0
            };
        });

        const chunkSize = 500;
        for (let i = 0; i < rowsToUpsert.length; i += chunkSize) {
            const chunk = rowsToUpsert.slice(i, i + chunkSize);
            const { error } = await supabase
                .from('track_leaderboards')
                .upsert(chunk, { onConflict: 'track_index,steam_id' });

            if (error) {
                console.error(`[Leaderboards] Erro na pista #${trackIndex} (lote ${i}):`, error.message);
            }
        }
        console.log(`[Leaderboards] Pista #${trackIndex} sincronizada (${rowsToUpsert.length} registros).`);
    }

    // Passo E: Atualiza as pontuações globais SSR, SSR-W e o player_name na tabela de jogadores
    console.log("[Players] Atualizando pontuações SSR e SSR-W na tabela de jogadores...");
    const playerRowsToUpsert = [];

    for (const steamId of allUniqueSteamIds) {
        const rating = playerRatings[steamId];
        const playerName = getPlayerName(steamId);
        if (rating) {
            playerRowsToUpsert.push({
                steam_id: steamId,
                player_name: playerName,
                ssr: rating.ssr,
                ssr_w: rating.ssrW
            });
        }
    }

    const playerChunkSize = 500;
    for (let i = 0; i < playerRowsToUpsert.length; i += playerChunkSize) {
        const chunk = playerRowsToUpsert.slice(i, i + playerChunkSize);
        const { error } = await supabase
            .from('players')
            .upsert(chunk, { onConflict: 'steam_id' });

        if (error) {
            console.error(`[Players Ratings] Erro no lote ${i}:`, error.message);
        }
    }
    console.log(`[Players] SSR e SSR-W de ${playerRowsToUpsert.length} jogadores atualizados com sucesso.`);

    // Passo F: Atualiza as pontuações C-SSR na tabela de países
    console.log("[Countries] Atualizando pontuações C-SSR na tabela de países...");
    const countryRowsToUpsert = [];

    for (const countryId of allUniqueCountryIds) {
        const rating = countryRatings[countryId];
        const countryName = getCountryName(countryId); // Pega o nome correto para satisfazer o NOT NULL
        if (rating) {
            countryRowsToUpsert.push({
                country_id: countryId,
                country_name: countryName,
                cssr: rating.cssr
            });
        }
    }

    const countryChunkSize = 500;
    for (let i = 0; i < countryRowsToUpsert.length; i += countryChunkSize) {
        const chunk = countryRowsToUpsert.slice(i, i + countryChunkSize);
        const { error } = await supabase
            .from('countries')
            .upsert(chunk, { onConflict: 'country_id' });

        if (error) {
            console.error(`[Countries Ratings] Erro no lote ${i}:`, error.message);
        }
    }
    console.log(`[Countries] C-SSR de ${countryRowsToUpsert.length} países atualizados com sucesso.`);
}

module.exports = {
    processAndSyncLeaderboardsAndRatings
};