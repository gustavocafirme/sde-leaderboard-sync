require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Inicialização do cliente Supabase com as credenciais do arquivo .env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Erro: As variáveis de ambiente do Supabase não foram configuradas no arquivo .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Lê o caminho do diretório diretamente do .env, ou usa um fallback caso queira testar localmente na mesma pasta
const trackingDir = process.env.GAME_TRACKING_DIR || path.join(__dirname, 'UserData', 'LeaderboardTracking');

async function main() {
    console.log("=== Iniciando Sincronização SDE com o Supabase ===");

    await syncCars();
    await syncCountries();
    await syncTracks();
    await syncPlayersMetadata();
    await processAndSyncLeaderboardsAndRatings();

    console.log("=== Sincronização Concluída com Sucesso! ===");
}

// 1. Sincroniza a tabela de carros
async function syncCars() {
    const filePath = path.join(trackingDir, 'cars.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Cars] Arquivo cars.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
            const carId = parseInt(parts[0].trim());
            const carName = parts.slice(1).join(',').replace(/"/g, '').trim();
            rows.push({ car_id: carId, car_name: carName });
        }
    }

    const { error } = await supabase
        .from('cars')
        .upsert(rows, { onConflict: 'car_id' });

    if (error) {
        console.error("[Cars] Erro ao enviar para o Supabase:", error.message);
    } else {
        console.log(`[Cars] ${rows.length} carros sincronizados com sucesso.`);
    }
}

// 2. Sincroniza a tabela de países
async function syncCountries() {
    const filePath = path.join(trackingDir, 'countries.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Countries] Arquivo countries.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
            const countryId = parseInt(parts[0].trim());
            const countryName = parts.slice(1).join(',').replace(/"/g, '').trim();
            rows.push({ country_id: countryId, country_name: countryName });
        }
    }

    const { error } = await supabase
        .from('countries')
        .upsert(rows, { onConflict: 'country_id' });

    if (error) {
        console.error("[Countries] Erro ao enviar para o Supabase:", error.message);
    } else {
        console.log(`[Countries] ${rows.length} países sincronizados com sucesso.`);
    }
}

// 3. Sincroniza a tabela estática com os nomes oficiais das 75 pistas
async function syncTracks() {
    const tracksList = [
        { track_index: 1, track_name: 'Tropical Beach, Hawaii' },
        { track_index: 2, track_name: 'Spray Lakes, Canada' },
        { track_index: 3, track_name: 'Mud Oval, Finland' },
        { track_index: 4, track_name: 'Rainfall Raceway, Great Britain' },
        { track_index: 5, track_name: 'Rondane Nat. Park, Norway' },
        { track_index: 6, track_name: 'Desierto de Tabernas, Spain' },
        { track_index: 7, track_name: 'Pyramids of Giza, Egypt' },
        { track_index: 8, track_name: 'Farmland Circuit, South Africa' },
        { track_index: 9, track_name: 'Barotse Floodplains, Zambia' },
        { track_index: 10, track_name: 'Michigan Dirt Arena, USA' },
        { track_index: 11, track_name: 'Super Speedway, USA' },
        { track_index: 12, track_name: 'Ring of Faith, USA' },
        { track_index: 13, track_name: 'Zero Eight Speedway, USA' },
        { track_index: 14, track_name: 'Greenwood Speedway, U.S.A' },
        { track_index: 15, track_name: 'Skyfly Stadium, USA' },
        { track_index: 16, track_name: 'Kunming Raceway, China' },
        { track_index: 17, track_name: 'Trondheim Raceway, Norway' },
        { track_index: 18, track_name: 'Twin Ring A, Netherlands' },
        { track_index: 19, track_name: 'Tropical Raceway, Emirates' },
        { track_index: 20, track_name: 'Rub al Khali, Oman' },
        { track_index: 21, track_name: 'Desert Circuit, Saudi Arabia' },
        { track_index: 22, track_name: 'Chester Circuit, England' },
        { track_index: 23, track_name: 'Shanghai Docks, China' },
        { track_index: 24, track_name: 'Twin Ring B, Netherlands' },
        { track_index: 25, track_name: 'City Circuit, France' },
        { track_index: 26, track_name: 'Temple Raceway, Japan' },
        { track_index: 27, track_name: 'Everlong Forest, Germany' },
        { track_index: 28, track_name: 'Airport Circuit, USA' },
        { track_index: 29, track_name: 'Pinehill Park, USA' },
        { track_index: 30, track_name: 'Roughrock Raceway, USA' },
        { track_index: 31, track_name: 'San Andres, Columbia' },
        { track_index: 32, track_name: 'Great Sandy Desert, Australia' },
        { track_index: 33, track_name: 'Winter Village, Canada' },
        { track_index: 34, track_name: 'Arizona Trail, USA' },
        { track_index: 35, track_name: 'Utah Canyon Sprint, USA' },
        { track_index: 36, track_name: 'Varmland Woods, Sweden' },
        { track_index: 37, track_name: 'Mirror Lakes, New Zealand' },
        { track_index: 38, track_name: 'Les Andelys, France' },
        { track_index: 39, track_name: 'Varnek, Russia' },
        { track_index: 40, track_name: 'Airport Parkour, USA' },
        { track_index: 41, track_name: 'Nightrun Highway, China' },
        { track_index: 42, track_name: 'L.A. River, USA' },
        { track_index: 43, track_name: 'Sandpit, Finland' },
        { track_index: 44, track_name: 'Ilha Grande, Brazil' },
        { track_index: 45, track_name: 'Himalaya Glacier, Tibet' },
        { track_index: 46, track_name: 'Atacama Farm, Argentina' },
        { track_index: 47, track_name: 'Outback Plains, Australia' },
        { track_index: 48, track_name: 'Khuiten Peak, Mongolia' },
        { track_index: 49, track_name: 'Grand Canyon, USA' },
        { track_index: 50, track_name: 'Mirny Mine, Siberia' },
        { track_index: 51, track_name: 'Daugava River, Latvia' },
        { track_index: 52, track_name: 'Nantahala Forest, USA' },
        { track_index: 53, track_name: 'Woods of Yakutia, Russia' },
        { track_index: 54, track_name: 'Sandpit II, Finland' },
        { track_index: 55, track_name: 'Icefall' },
        { track_index: 56, track_name: 'Skyfall' },
        { track_index: 57, track_name: 'Canyonfall' },
        { track_index: 58, track_name: 'Fujimi Mountains, Japan' },
        { track_index: 59, track_name: 'Rocky Mountains, USA' },
        { track_index: 60, track_name: 'Mount Haruna, Japan' },
        { track_index: 61, track_name: 'Taroko Gorge Road, Taiwan' },
        { track_index: 62, track_name: 'Nagano Prefecture, Japan' },
        { track_index: 63, track_name: 'Mount Haruna II, Japan' },
        { track_index: 64, track_name: 'Thousand Lakes, Finland' },
        { track_index: 65, track_name: 'Hammerstein, Germany' },
        { track_index: 66, track_name: 'Lake Mountain Sprint, Australia' },
        { track_index: 67, track_name: 'Tour de Corse, France' },
        { track_index: 68, track_name: 'Argolis, Greece' },
        { track_index: 69, track_name: 'Jozefin, Poland' },
        { track_index: 70, track_name: 'Patagonian Desert, Argentina' },
        { track_index: 71, track_name: 'Catamarca, Argentina' },
        { track_index: 72, track_name: 'Jozefin II, Poland' },
        { track_index: 73, track_name: 'Hagfors, Sweden' },
        { track_index: 74, track_name: 'Pant Mawr, Wales' },
        { track_index: 75, track_name: 'Col de Turini, Monaco' }
    ];

    const { error } = await supabase
        .from('tracks')
        .upsert(tracksList, { onConflict: 'track_index' });

    if (error) {
        console.error("[Tracks] Erro ao enviar para o Supabase:", error.message);
    } else {
        console.log(`[Tracks] ${tracksList.length} pistas sincronizadas com sucesso.`);
    }
}

// 4. Sincroniza metadados básicos dos jogadores e armazena em memória para uso posterior
const playerNamesMap = new Map();

async function syncPlayersMetadata() {
    const filePath = path.join(trackingDir, 'players.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Players] Arquivo players.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const commaIndex = lines[i].indexOf(',');
        if (commaIndex !== -1) {
            const steamId = lines[i].substring(0, commaIndex).trim();
            const playerName = lines[i].substring(commaIndex + 1).replace(/"/g, '').trim();
            playerNamesMap.set(steamId, playerName);
            rows.push({ steam_id: steamId, player_name: playerName });
        }
    }

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase
            .from('players')
            .upsert(chunk, { onConflict: 'steam_id' });

        if (error) {
            console.error(`[Players] Erro no lote ${i}:`, error.message);
        }
    }
    console.log(`[Players] ${rows.length} jogadores processados.`);
}

// Função para calcular o Tick Time otimizada
function calculateTickTime(timeInSeconds) {
    if (Number(timeInSeconds.toFixed(2)) === timeInSeconds) {
        return timeInSeconds;
    } else {
        return Number((Math.round(timeInSeconds * 50) / 50).toFixed(2));
    }
}

// 5. Processa os arquivos CSV das 75 pistas, aplica os cálculos e sincroniza com o Supabase
async function processAndSyncLeaderboardsAndRatings() {
    const leaderboardsDir = path.join(trackingDir, 'Leaderboards');
    if (!fs.existsSync(leaderboardsDir)) {
        console.log("[Leaderboards] Pasta de leaderboards não encontrada.");
        return;
    }

    const totalTracks = 75;
    const allTracksData = {};
    const playerScoresPerTrack = {};
    const allUniqueSteamIds = new Set();

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
        const scorePowerFactor = 2;

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
    const scoreDecayFactor = 0.96;
    const ssrWeightedPower = 1.6;

    let normalizationConstant = 0;
    for (let n = 1; n <= totalTracks; n++) {
        normalizationConstant += Math.pow(scoreDecayFactor, n - 1);
    }

    for (const steamId of allUniqueSteamIds) {
        const playerTracks = playerScoresPerTrack[steamId] || {};
        const allScores = [];

        for (let trackIndex = 1; trackIndex <= totalTracks; trackIndex++) {
            const entry = playerTracks[trackIndex];
            const scoreValue = entry ? entry.score : 0.0;
            allScores.push({ trackIndex, score: scoreValue, entry });
        }

        // Ordenação decrescente por score, utilizando o to2nd como critério de desempate (maior to2nd primeiro)
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
            const weightedScore = scoreObj.score * Math.pow(scoreDecayFactor, scorePosition - 1);

            sumOfScores += scoreObj.score;
            sumOfScoreWeighted += weightedScore;

            if (scoreObj.entry) {
                weightedScoresPerTrack[scoreObj.trackIndex] = weightedScore;
            }
        }

        const ssr = sumOfScores / totalTracks;
        const ssrW = Math.pow((sumOfScoreWeighted / normalizationConstant), ssrWeightedPower);

        playerRatings[steamId] = {
            ssr: isNaN(ssr) ? 0 : ssr,
            ssrW: isNaN(ssrW) ? 0 : ssrW,
            weightedScoresPerTrack
        };
    }

    // Passo C: Sincroniza os dados detalhados usando track_index na constraint
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
                to2nd: entry.to2nd
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

    // Passo D: Atualiza as pontuações globais SSR, SSR-W e o player_name na tabela de jogadores
    console.log("[Players] Atualizando pontuações SSR e SSR-W na tabela de jogadores...");
    const playerRowsToUpsert = [];

    for (const steamId of allUniqueSteamIds) {
        const rating = playerRatings[steamId];
        const playerName = playerNamesMap.get(steamId) || "Unknown";
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
}

main().catch(console.error);