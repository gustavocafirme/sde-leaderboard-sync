const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const { trackingDir, totalTracks } = require('./config');
const { getPlayerName, getCountryName, getCountrySigla, getCountryCanonicalSigla } = require('./syncMetadata');
const { processTrackRatings, computePlayerRatings, computeCountryRatings } = require('./ssrFamilyEngine');
const { processTrackFiRatings, computePlayerFiRatings } = require('./fiEngine'); // <-- Importa o novo engine FI

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

    const { data: countriesData, error: countriesError } = await supabase.from('countries').select('country_id, country_name');
    if (!countriesError && countriesData) {
        for (const c of countriesData) {
            const sigla = c.country_name.toLowerCase();
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

    const allTracksData = {};
    const playerScoresPerTrack = {};
    const playerFiScoresPerTrack = {}; // Rastreia scores FI por pista e jogador
    const allUniqueSteamIds = new Set();
    const allUniqueCountryIds = new Set();
    const countryScoresPerTrack = {};
    const playerCountryFrequencies = {};

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
                const rawCountryId = parseInt(parts[2].trim());
                const countryId = resolveCanonicalCountryId(rawCountryId);
                const carId = parseInt(parts[3].trim());
                const timeMs = parseInt(parts[4].trim());

                allUniqueSteamIds.add(steamId);
                allUniqueCountryIds.add(countryId);

                if (!playerCountryFrequencies[steamId]) {
                    playerCountryFrequencies[steamId] = {};
                }
                playerCountryFrequencies[steamId][countryId] = (playerCountryFrequencies[steamId][countryId] || 0) + 1;

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

        // 1. Processa a família SSR tradicional
        const processedSSR = processTrackRatings(trackEntries, calculateTickTime);
        
        // 2. Processa a métrica SSR-FI (independente de effective time)
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

    // Processamento do país oficial de cada jogador
    const playerBestCountry = {};
    for (const steamId of allUniqueSteamIds) {
        const counts = playerCountryFrequencies[steamId] || {};
        const sortedCountryIds = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a]);

        if (sortedCountryIds.length > 0) {
            let bestCountryId = sortedCountryIds[0];
            if (getCountrySigla(bestCountryId) === 'aa' && sortedCountryIds.length > 1) {
                bestCountryId = sortedCountryIds[1];
            }
            playerBestCountry[steamId] = bestCountryId;
        } else {
            playerBestCountry[steamId] = null;
        }
    }

    // Calcula SSR e SSR-W tradicionais
    const playerRatings = computePlayerRatings(allUniqueSteamIds, playerScoresPerTrack);

    // Calcula SSR-FI global
    const playerFiRatings = computePlayerFiRatings(allUniqueSteamIds, playerFiScoresPerTrack);

    // Calcula C-SSR global para os países
    const countryRatings = computeCountryRatings(allUniqueCountryIds, countryScoresPerTrack);

    // Passo D: Sincroniza os dados detalhados das pistas (incluindo score_fi)
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
                score_fi: entry.scoreFi || 0.0
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

    // Passo E: Atualiza jogadores (incluindo o ssr_fi)
    console.log("[Players] Atualizando pontuações, país oficial e SSR-FI na tabela de jogadores...");
    const playerRowsToUpsert = [];

    for (const steamId of allUniqueSteamIds) {
        const rating = playerRatings[steamId];
        const fiRating = playerFiRatings[steamId];
        const playerName = getPlayerName(steamId);
        const bestCountryId = playerBestCountry[steamId];

        if (rating) {
            playerRowsToUpsert.push({
                steam_id: steamId,
                player_name: playerName,
                ssr: rating.ssr,
                ssr_w: rating.ssrW,
                ssr_fi: fiRating ? fiRating.ssrFi : 0.0,
                country_id: bestCountryId
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

    // Passo F: Atualiza as pontuações C-SSR na tabela de países
    console.log("[Countries] Atualizando pontuações C-SSR na tabela de países...");
    const countryRowsToUpsert = [];

    for (const countryId of allUniqueCountryIds) {
        const rating = countryRatings[countryId];
        const countryName = getCountryName(countryId);
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