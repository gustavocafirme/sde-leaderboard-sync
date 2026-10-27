const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const { trackingDir, totalTracks } = require('./config');
const { getPlayerName, getCountryName, getCountrySigla, getCountryCanonicalSigla, getManualCountryId, getCountryFullName } = require('./syncMetadata');
const { calculateEffectiveTime, processTrackRatings, computePlayerRatings, computeCountryRatings } = require('./ssrFamilyEngine');
const { processTrackFiRatings, computePlayerFiRatings } = require('./fiEngine');
const { computePlayerPrestigePoints } = require('./prestigeEngine');

/**
 * Função universal para cálculo do Tick Time (Frame Time)
 */
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

    const canonicalSiglaToIdMap = {};
    const rawCountryIdToCanonicalId = {};

    const { data: countriesData, error: countriesError } = await supabase.from('countries').select('country_id, country_acronym');
    if (!countriesError && countriesData) {
        for (const c of countriesData) {
            const sigla = c.country_acronym.toLowerCase();
            canonicalSiglaToIdMap[sigla] = c.country_id;
        }
    }

    function resolveCanonicalCountryId(rawCountryId) {
        if (rawCountryIdToCanonicalId[rawCountryId] !== undefined) {
            return rawCountryIdToCanonicalId[rawCountryId];
        }
        const canonicalSigla = getCountryCanonicalSigla(rawCountryId);
        const officialId = canonicalSiglaToIdMap[canonicalSigla] !== undefined ? canonicalSiglaToIdMap[canonicalSigla] : rawCountryId;
        rawCountryIdToCanonicalId[rawCountryId] = officialId;
        return officialId;
    }

    const rawTracksEntries = {};
    const allUniqueSteamIds = new Set();
    const allUniqueCountryIds = new Set();
    const playerCountryFrequencies = {};

    // 1ª ETAPA: Carrega todas as pistas calculando Tick Time e Effective Time de forma unificada
    for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
        const filePath = path.join(leaderboardsDir, `leaderboard_track_${trackIndex}.csv`);
        if (!fs.existsSync(filePath)) continue;

        const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
        const trackEntries = [];

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length >= 6) {
                const originalPosition = parseInt(parts[0].trim());
                const steamId = parts[1].trim();
                const rawCountryId = parseInt(parts[2].trim());
                const countryId = resolveCanonicalCountryId(rawCountryId);
                const carId = parseInt(parts[3].trim());
                const timeMs = parseInt(parts[4].trim());
                const scoreOfficial = parseFloat(parts[5].trim()) / 100 || 0.0;

                allUniqueSteamIds.add(steamId);
                allUniqueCountryIds.add(countryId);

                if (!playerCountryFrequencies[steamId]) {
                    playerCountryFrequencies[steamId] = {};
                }
                playerCountryFrequencies[steamId][countryId] = (playerCountryFrequencies[steamId][countryId] || 0) + 1;

                const timeInSeconds = timeMs / 1000.0;
                const tickTime = calculateTickTime(timeInSeconds);
                const effectiveTime = calculateEffectiveTime(timeInSeconds, tickTime);

                trackEntries.push({
                    steamId,
                    countryId,
                    carId,
                    timeMs,
                    timeInSeconds,
                    tickTime,
                    effectiveTime,
                    originalPosition,
                    scoreOfficial
                });
            }
        }

        if (trackEntries.length > 0) {
            rawTracksEntries[trackIndex] = trackEntries;
        }
    }

    // Determina o país oficial (best country) de cada jogador ANTES do cálculo do C-Score
    const playerBestCountry = {};
    for (const steamId of allUniqueSteamIds) {
        const counts = playerCountryFrequencies[steamId] || {};
        const sortedCountryIds = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]);

        let bestCountryId = null;

        if (sortedCountryIds.length > 0) {
            bestCountryId = sortedCountryIds[0];
            const primarySigla = getCountrySigla(bestCountryId);

            if (primarySigla === 'aa' && sortedCountryIds.length > 1) {
                bestCountryId = sortedCountryIds[1];
            }

            if (getCountrySigla(bestCountryId) === 'aa') {
                const manualId = getManualCountryId(steamId);
                if (manualId !== null) {
                    bestCountryId = manualId;
                }
            }
        } else {
            bestCountryId = getManualCountryId(steamId);
        }

        playerBestCountry[steamId] = bestCountryId;
        if (bestCountryId !== null) {
            allUniqueCountryIds.add(bestCountryId);
        }
    }

    const allTracksData = {};
    const playerScoresPerTrack = {};
    const playerFiScoresPerTrack = {};
    const countryScoresPerTrack = {};

    // 2ª ETAPA: Processa as pontuações e o C-Score das pistas utilizando o país oficial do jogador
    for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
        const trackEntries = rawTracksEntries[trackIndex];
        if (!trackEntries || trackEntries.length === 0) continue;

        const processedSSR = processTrackRatings(trackEntries, playerBestCountry);
        const processedFI = processTrackFiRatings(processedSSR.trackEntries);

        allTracksData[trackIndex] = processedFI;
        countryScoresPerTrack[trackIndex] = processedSSR.countryScores;

        for (const entry of processedFI) {
            if (!playerScoresPerTrack[entry.steamId]) {
                playerScoresPerTrack[entry.steamId] = {};
            }
            playerScoresPerTrack[entry.steamId][trackIndex] = entry;

            if (!playerFiScoresPerTrack[entry.steamId]) {
                playerFiScoresPerTrack[entry.steamId] = {};
            }
            playerFiScoresPerTrack[entry.steamId][trackIndex] = entry;
        }
    }

    // Calcula ratings globais
    const playerRatings = computePlayerRatings(allUniqueSteamIds, playerScoresPerTrack);
    const playerFiRatings = computePlayerFiRatings(allUniqueSteamIds, playerFiScoresPerTrack);
    const countryRatings = computeCountryRatings(allUniqueCountryIds, countryScoresPerTrack);

    // Passo D: Sincroniza dados das pistas na tabela track_leaderboards
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
                car_id: entry.carId,
                time_ms: entry.timeMs,
                effective_time: entry.effectiveTime,
                score: entry.score,
                score_w: scoreW,
                to2nd: entry.to2nd,
                c_score: entry.cScore || 0.0,
                score_fi: entry.scoreFi || 0.0,
                score_official: entry.scoreOfficial || 0.0
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

    // Passo E: Atualiza a tabela de jogadores
    console.log("[Players] Atualizando pontuações, país oficial, SSR-FI e Prestige Points na tabela de jogadores...");
    const playerRowsToUpsert = [];

    for (const steamId of allUniqueSteamIds) {
        const rating = playerRatings[steamId];
        const fiRating = playerFiRatings[steamId];
        const playerName = getPlayerName(steamId);
        const bestCountryId = playerBestCountry[steamId];

        const playerTracks = playerScoresPerTrack[steamId] || {};
        const mapsPlayed = Object.keys(playerTracks).length;
        const totalPrestigePoints = computePlayerPrestigePoints(playerTracks);

        if (rating) {
            playerRowsToUpsert.push({
                steam_id: steamId,
                player_name: playerName,
                ssr: rating.ssr,
                ssr_w: rating.ssrW,
                ssr_fi: fiRating ? fiRating.ssrFi : 0.0,
                country_id: bestCountryId,
                maps_played: mapsPlayed,
                prestige_points: totalPrestigePoints
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
    console.log(`[Players] Dados de ${playerRowsToUpsert.length} jogadores atualizados com sucesso.`);

    // Passo F: Atualiza as pontuações C-SSR, acrônimo e nome completo na tabela de países
    console.log("[Countries] Atualizando pontuações C-SSR na tabela de países...");
    const countryRowsToUpsert = [];

    for (const countryId of allUniqueCountryIds) {
        const rating = countryRatings[countryId];
        if (rating) {
            countryRowsToUpsert.push({
                country_id: countryId,
                country_acronym: getCountryName(countryId),
                country_name: getCountryFullName(countryId),
                c_ssr: rating.cssr
            });
        }
    }

    if (countryRowsToUpsert.length > 0) {
        const { error } = await supabase
            .from('countries')
            .upsert(countryRowsToUpsert, { onConflict: 'country_id' });

        if (error) {
            console.error("[Countries Ratings] Erro ao atualizar C-SSR dos países:", error.message);
        } else {
            console.log(`[Countries] C-SSR de ${countryRowsToUpsert.length} países atualizados com sucesso.`);
        }
    }
}

module.exports = {
    processAndSyncLeaderboardsAndRatings
};