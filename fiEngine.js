const { totalTracks } = require('./config');

/**
 * Computes the score_fi metric for each track entry.
 * Formula: score_fi = Wr / Ptt (where Wr is the 1st place tick time and Ptt is the player tick time)
 */
function processTrackFiRatings(trackEntries) {
    if (!trackEntries || trackEntries.length === 0) return trackEntries;

    // World Record (Wr) uses the tickTime of the 1st place entry
    const worldRecordTime = trackEntries[0].tickTime;

    for (let index = 0; index < trackEntries.length; index++) {
        const entry = trackEntries[index];
        const playerTime = entry.tickTime;

        let scoreFi = 0;
        if (playerTime > 0) {
            scoreFi = worldRecordTime / playerTime;
        }

        entry.scoreFi = scoreFi;
    }

    return trackEntries;
}

/**
 * Computes global SSR-FI ratings for all unique players (sum of FI scores divided by total tracks).
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