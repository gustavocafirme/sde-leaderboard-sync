const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const { trackingDir } = require('./config');
const countryNamesMap = new Map();

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
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 3) {
            const countryId = parseInt(parts[0].trim());
            const countryName = parts[1].replace(/"/g, '').trim();
            const countryFullName = parts.slice(2).join(',').replace(/"/g, '').trim();

            countryNamesMap.set(countryId, countryName);
            rows.push({
                country_id: countryId,
                country_name: countryName,
                country_full_name: countryFullName
            });
        }
    }

    const { error } = await supabase.from('countries').upsert(rows, { onConflict: 'country_id' });
    if (error) {
        console.error("[Countries] Erro ao enviar para o Supabase:", error.message);
    } else {
        console.log(`[Countries] ${rows.length} países sincronizados com sucesso.`);
    }
}

function getCountryName(countryId) {
    return countryNamesMap.get(countryId) || "Unknown";
}

async function syncTracks() {
    const filePath = path.join(trackingDir, 'tracks.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Tracks] Arquivo tracks.csv não encontrado.");
        return;
    }

    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    const rows = [];

    // Ignora o cabeçalho (i = 1)
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
    syncTracks,
    syncPlayersMetadata,
    getPlayerName,
    getCountryName
};