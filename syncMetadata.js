const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const { trackingDir } = require('./config');

const countryNamesMap = new Map();    // countryId -> countryName (sigla, ex: "br", "aa")
const countrySiglaMap = new Map();    // countryId -> sigla em minúsculo para validação
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

async function syncCountries() {
    const filePath = path.join(trackingDir, 'countries.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Countries] Arquivo countries.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    
    // Mapeamento temporário para consolidar países canônicos únicos
    const canonicalCountriesMap = new Map(); // canonicalSigla -> { country_id, country_name, country_full_name }

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 3) {
            const countryId = parseInt(parts[0].trim());
            const countryName = parts[1].replace(/"/g, '').trim();
            const countryFullName = parts.slice(2).join(',').replace(/"/g, '').trim();

            // Descobre qual é a sigla canônica unificada (ex: "um" vira "us", "gb-eng" vira "gb")
            // Como precisamos da função auxiliar, vamos tratá-la inline ou garantir que getCountryCanonicalSigla use getCountrySigla.
            let sigla = countryName.toLowerCase();
            let canonicalSigla = sigla;
            let canonicalName = countryName;
            let canonicalFullName = countryFullName;

            if (sigla === 'um' || sigla === 'vi' || sigla === 'pr' || sigla === 'gu' || sigla === 'as' || sigla === 'mp') {
                canonicalSigla = 'us'; canonicalName = 'us'; canonicalFullName = 'United States';
            } else if (sigla.startsWith('gb-')) {
                canonicalSigla = 'gb'; canonicalName = 'gb'; canonicalFullName = 'United Kingdom';
            } else if (sigla === 'sj' || sigla === 'bv') {
                canonicalSigla = 'no'; canonicalName = 'no'; canonicalFullName = 'Norway';
            } else if (sigla === 'ax') {
                canonicalSigla = 'fi'; canonicalName = 'fi'; canonicalFullName = 'Finland';
            } else if (sigla === 'gl' || sigla === 'fo') {
                canonicalSigla = 'dk'; canonicalName = 'dk'; canonicalFullName = 'Denmark';
            } else if (sigla === 'cx' || sigla === 'cc' || sigla === 'hm' || sigla === 'nf') {
                canonicalSigla = 'au'; canonicalName = 'au'; canonicalFullName = 'Australia';
            }

            // Armazena mantendo o primeiro ID encontrado (ou o ID principal do país) como referência canônica
            if (!canonicalCountriesMap.has(canonicalSigla)) {
                canonicalCountriesMap.set(canonicalSigla, {
                    country_id: countryId, // Usa o ID do país principal
                    country_name: canonicalName,
                    country_full_name: canonicalFullName
                });
            }

            // Popula os mapas locais para o mathEngine continuar funcionando perfeitamente
            countryNamesMap.set(countryId, canonicalName);
            countrySiglaMap.set(countryId, sigla);
        }
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

// Adicione um mapa para rastrear o ID canônico ou exporte a função auxiliar:
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
        return; // Arquivo opcional caso o mod ainda não tenha gerado
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
            const steamId = parts[0].trim();
            const countrySigla = parts[1].replace(/"/g, '').trim().toLowerCase();

            // Busca o country_id correspondente à sigla na nossa tabela/mapa de países
            for (const [cId, sigla] of countrySiglaMap.entries()) {
                if (sigla === countrySigla) {
                    manualCountriesMap.set(steamId, cId);
                    break;
                }
            }
        }
    }
    console.log(`[Manual Countries] ${manualCountriesMap.size} nacionalidades manuais carregadas.`);
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
        const { error } = await supabase.from('players').upsert(chunk, { onConflict: 'steam_id' });
        if (error) {
            console.error(`[Players] Erro no lote ${i}:`, error.message);
        }
    }
    console.log(`[Players] ${rows.length} jogadores processados.`);
}

function getPlayerName(steamId) {
    return playerNamesMap.get(steamId) || "Unknown";
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
    getManualCountryId
};