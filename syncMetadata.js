const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const { trackingDir } = require('./config');

const countryNamesMap = new Map();    // countryId -> countryName (sigla, ex: "br", "aa")
const countrySiglaMap = new Map();    // countryId -> sigla em minúsculo para validação
const countryFullNameMap = new Map(); // countryId -> countryFullName (ex: "Brazil")
const manualCountriesMap = new Map(); // steamId   -> countryId manual
const playerNamesMap = new Map();

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

    const { error } = await supabase.from('cars').upsert(rows, { onConflict: 'car_id' });
    if (error) {
        console.error("[Cars] Erro ao enviar para o Supabase:", error.message);
    } else {
        console.log(`[Cars] ${rows.length} carros sincronizados com sucesso.`);
    }
}

/**
 * Carrega os países do CSV para a memória local (obrigatório para o mathEngine) 
 * e opcionalmente faz o upsert no Supabase.
 */
async function syncCountries(shouldUpsert = true) {
    const filePath = path.join(trackingDir, 'countries.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Countries] Arquivo countries.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const canonicalCountriesMap = new Map();

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 3) {
            const countryId = parseInt(parts[0].trim());
            const countryAcronym = parts[1].replace(/"/g, '').trim();
            const countryName = parts.slice(2).join(',').replace(/"/g, '').trim();

            let sigla = countryAcronym.toLowerCase();
            let canonicalSigla = sigla;
            let canonicalAcronym = countryAcronym;
            let canonicalName = countryName;

            if (sigla === 'um' || sigla === 'vi' || sigla === 'pr' || sigla === 'gu' || sigla === 'as' || sigla === 'mp') {
                canonicalSigla = 'us'; canonicalAcronym = 'us'; canonicalName = 'United States';
            } else if (sigla.startsWith('gb-')) {
                canonicalSigla = 'gb'; canonicalAcronym = 'gb'; canonicalName = 'United Kingdom';
            } else if (sigla === 'sj' || sigla === 'bv') {
                canonicalSigla = 'no'; canonicalAcronym = 'no'; canonicalName = 'Norway';
            } else if (sigla === 'ax') {
                canonicalSigla = 'fi'; canonicalAcronym = 'fi'; canonicalName = 'Finland';
            } else if (sigla === 'gl' || sigla === 'fo') {
                canonicalSigla = 'dk'; canonicalAcronym = 'dk'; canonicalName = 'Denmark';
            } else if (sigla === 'cx' || sigla === 'cc' || sigla === 'hm' || sigla === 'nf') {
                canonicalSigla = 'au'; canonicalAcronym = 'au'; canonicalName = 'Australia';
            }

            if (!canonicalCountriesMap.has(canonicalSigla)) {
                canonicalCountriesMap.set(canonicalSigla, {
                    country_id: countryId,
                    country_acronym: canonicalAcronym,
                    country_name: canonicalName
                });
            }

            countryNamesMap.set(countryId, canonicalAcronym);
            countrySiglaMap.set(countryId, sigla);
            countryFullNameMap.set(countryId, canonicalName);
        }
    }

    // Se o upsert não foi solicitado, encerra aqui após popular a memória RAM
    if (!shouldUpsert) {
        return;
    }

    const rows = Array.from(canonicalCountriesMap.values());
    const { error } = await supabase.from('countries').upsert(rows, { onConflict: 'country_id' });
    if (error) {
        console.error("[Countries] Erro ao enviar para o Supabase:", error.message);
    } else {
        console.log(`[Countries] ${rows.length} países canônicos unificados sincronizados com sucesso.`);
    }
}

function getCountryName(countryId) {
    return countryNamesMap.get(countryId) || "Unknown";
}

function getCountrySigla(countryId) {
    return countrySiglaMap.get(countryId) || "";
}

function getCountryCanonicalSigla(countryId) {
    const sigla = getCountrySigla(countryId);
    if (sigla === 'um' || sigla === 'vi' || sigla === 'pr' || sigla === 'gu' || sigla === 'as' || sigla === 'mp') return 'us';
    if (sigla.startsWith('gb-')) return 'gb';
    if (sigla === 'sj' || sigla === 'bv') return 'no';
    if (sigla === 'ax') return 'fi';
    if (sigla === 'gl' || sigla === 'fo') return 'dk';
    if (sigla === 'cx' || sigla === 'cc' || sigla === 'hm' || sigla === 'nf') return 'au';
    return sigla;
}

async function syncManualCountries() {
    const filePath = path.join(trackingDir, 'manual_countries.csv');
    if (!fs.existsSync(filePath)) {
        return; 
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
            const steamId = parts[0].trim();
            const countrySigla = parts[1].replace(/"/g, '').trim().toLowerCase();

            for (const [cId, sigla] of countrySiglaMap.entries()) {
                if (sigla === countrySigla) {
                    manualCountriesMap.set(steamId, cId);
                    break;
                }
            }
        }
    }
}

function getManualCountryId(steamId) {
    return manualCountriesMap.get(steamId) || null;
}

async function syncTracks() {
    const filePath = path.join(trackingDir, 'tracks.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Tracks] Arquivo tracks.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
            const trackIndex = parseInt(parts[0].trim());
            const trackName = parts.slice(1).join(',').replace(/"/g, '').trim();
            rows.push({ track_index: trackIndex, track_name: trackName });
        }
    }

    const { error } = await supabase.from('tracks').upsert(rows, { onConflict: 'track_index' });
    if (error) {
        console.error("[Tracks] Erro ao enviar para o Supabase:", error.message);
    } else {
        console.log(`[Tracks] ${rows.length} pistas sincronizadas com sucesso via tracks.csv.`);
    }
}

/**
 * Carrega os nomes dos jogadores para a memória local (necessário para o mathEngine)
 * e opcionalmente faz o upsert na tabela de jogadores do Supabase.
 */
async function syncPlayersMetadata(shouldUpsert = true) {
    const filePath = path.join(trackingDir, 'players.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Players] Arquivo players.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const comma1 = line.indexOf(',');
        if (comma1 !== -1) {
            const steamId = line.substring(0, comma1).trim();
            const rest = line.substring(comma1 + 1);
            
            let playerName = "";
            let skillRatingOfficial = 0.0;

            if (rest.startsWith('"')) {
                const closingQuote = rest.indexOf('"', 1);
                if (closingQuote !== -1) {
                    playerName = rest.substring(1, closingQuote).replace(/""/g, '"').trim();
                    const afterQuote = rest.substring(closingQuote + 1);
                    const comma2 = afterQuote.indexOf(',');
                    if (comma2 !== -1) {
                        skillRatingOfficial = parseFloat(afterQuote.substring(comma2 + 1).trim()) / 100 || 0.0;
                    }
                }
            } else {
                const comma2 = rest.indexOf(',');
                if (comma2 !== -1) {
                    playerName = rest.substring(0, comma2).replace(/"/g, '').trim();
                    skillRatingOfficial = parseFloat(rest.substring(comma2 + 1).trim()) / 100 || 0.0;
                } else {
                    playerName = rest.replace(/"/g, '').trim();
                }
            }

            playerNamesMap.set(steamId, playerName);
            rows.push({
                steam_id: steamId,
                player_name: playerName,
                skill_rating_official: skillRatingOfficial
            });
        }
    }

    // Se o upsert não foi solicitado, encerra aqui após popular a memória RAM
    if (!shouldUpsert) {
        return;
    }

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from('players').upsert(chunk, { onConflict: 'steam_id' });
        if (error) {
            console.error(`[Players] Erro no lote ${i}:`, error.message);
        }
    }
    console.log(`[Players] ${rows.length} jogadores processados com skill rating oficial.`);
}

function getPlayerName(steamId) {
    return playerNamesMap.get(steamId) || "Unknown";
}

function getCountryFullName(countryId) {
    return countryFullNameMap.get(countryId) || "Unknown";
}

module.exports = {
    syncCars,
    syncCountries,
    syncManualCountries,
    syncTracks,
    syncPlayersMetadata,
    getPlayerName,
    getCountryName,
    getCountrySigla,
    getCountryCanonicalSigla,
    getManualCountryId,
    getCountryFullName
};