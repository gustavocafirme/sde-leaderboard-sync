const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');
const { trackingDir } = require('./config');

const countryNamesMap = new Map();         // countryId -> country acronym (e.g., "br", "aa")
const countryAcronymLowerMap = new Map();  // countryId -> lowercase acronym for validation
const countryFullNameMap = new Map();      // countryId -> full country name (e.g., "Brazil")
const manualCountriesMap = new Map();      // steamId   -> manual countryId
const playerNamesMap = new Map();
const playerSkillRatingsMap = new Map();

async function syncCars() {
    const filePath = path.join(trackingDir, 'cars.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Cars] cars.csv file not found.");
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
        console.error("[Cars] Error uploading to Supabase:", error.message);
    } else {
        console.log(`[Cars] Successfully synchronized ${rows.length} cars.`);
    }
}

/**
 * Loads countries from CSV into local memory and optionally upserts them to Supabase.
 */
async function syncCountries(shouldUpsert = true) {
    const filePath = path.join(trackingDir, 'countries.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Countries] countries.csv file not found.");
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

            let lowerAcronym = countryAcronym.toLowerCase();
            let canonicalAcronym = countryAcronym;
            let canonicalName = countryName;

            if (lowerAcronym === 'um' || lowerAcronym === 'vi' || lowerAcronym === 'pr' || lowerAcronym === 'gu' || lowerAcronym === 'as' || lowerAcronym === 'mp') {
                canonicalAcronym = 'us'; canonicalName = 'United States';
            } else if (lowerAcronym.startsWith('gb-')) {
                canonicalAcronym = 'gb'; canonicalName = 'United Kingdom';
            } else if (lowerAcronym === 'sj' || lowerAcronym === 'bv') {
                canonicalAcronym = 'no'; canonicalName = 'Norway';
            } else if (lowerAcronym === 'ax') {
                canonicalAcronym = 'fi'; canonicalName = 'Finland';
            } else if (lowerAcronym === 'gl' || lowerAcronym === 'fo') {
                canonicalAcronym = 'dk'; canonicalName = 'Denmark';
            } else if (lowerAcronym === 'cx' || lowerAcronym === 'cc' || lowerAcronym === 'hm' || lowerAcronym === 'nf') {
                canonicalAcronym = 'au'; canonicalName = 'Australia';
            }

            if (!canonicalCountriesMap.has(canonicalAcronym.toLowerCase())) {
                canonicalCountriesMap.set(canonicalAcronym.toLowerCase(), {
                    country_id: countryId,
                    country_acronym: canonicalAcronym,
                    country_name: canonicalName
                });
            }

            countryNamesMap.set(countryId, canonicalAcronym);
            countryAcronymLowerMap.set(countryId, lowerAcronym);
            countryFullNameMap.set(countryId, canonicalName);
        }
    }

    if (!shouldUpsert) {
        return;
    }

    const rows = Array.from(canonicalCountriesMap.values());
    const { error } = await supabase.from('countries').upsert(rows, { onConflict: 'country_id' });
    if (error) {
        console.error("[Countries] Error uploading to Supabase:", error.message);
    } else {
        console.log(`[Countries] Successfully synchronized ${rows.length} unified canonical countries.`);
    }
}

function getCountryName(countryId) {
    return countryNamesMap.get(countryId) || "Unknown";
}

function getCountryAcronymLower(countryId) {
    return countryAcronymLowerMap.get(countryId) || "";
}

function getCountryCanonicalAcronym(countryId) {
    const lowerAcronym = getCountryAcronymLower(countryId);
    if (lowerAcronym === 'um' || lowerAcronym === 'vi' || lowerAcronym === 'pr' || lowerAcronym === 'gu' || lowerAcronym === 'as' || lowerAcronym === 'mp') return 'us';
    if (lowerAcronym.startsWith('gb-')) return 'gb';
    if (lowerAcronym === 'sj' || lowerAcronym === 'bv') return 'no';
    if (lowerAcronym === 'ax') return 'fi';
    if (lowerAcronym === 'gl' || lowerAcronym === 'fo') return 'dk';
    if (lowerAcronym === 'cx' || lowerAcronym === 'cc' || lowerAcronym === 'hm' || lowerAcronym === 'nf') return 'au';
    return lowerAcronym;
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
            const targetAcronymLower = parts[1].replace(/"/g, '').trim().toLowerCase();

            for (const [countryId, acronymLower] of countryAcronymLowerMap.entries()) {
                if (acronymLower === targetAcronymLower) {
                    manualCountriesMap.set(steamId, countryId);
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
        console.log("[Tracks] tracks.csv file not found.");
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
        console.error("[Tracks] Error uploading to Supabase:", error.message);
    } else {
        console.log(`[Tracks] Successfully synchronized ${rows.length} tracks via tracks.csv.`);
    }
}

async function syncPlayersMetadata(shouldUpsert = true) {
    const filePath = path.join(trackingDir, 'players.csv');
    if (!fs.existsSync(filePath)) {
        console.log("[Players] players.csv file not found.");
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
            playerSkillRatingsMap.set(steamId, skillRatingOfficial);
            rows.push({
                steam_id: steamId,
                player_name: playerName,
                skill_rating_official: skillRatingOfficial
            });
        }
    }

    if (!shouldUpsert) {
        return;
    }

    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from('players').upsert(chunk, { onConflict: 'steam_id' });
        if (error) {
            console.error(`[Players] Error at chunk ${i}:`, error.message);
        }
    }
    console.log(`[Players] Successfully processed and synchronized ${rows.length} players with official skill rating.`);
}

function getPlayerName(steamId) {
    return playerNamesMap.get(steamId) || "Unknown";
}

function getPlayerSkillRating(steamId) {
    return playerSkillRatingsMap.get(steamId) || 0.0;
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
    getPlayerSkillRating,
    getCountryName,
    getCountryAcronymLower,
    getCountryCanonicalAcronym,
    getManualCountryId,
    getCountryFullName
};