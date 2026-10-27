const { prestigePointsTable } = require('./config');

/**
 * Computes Prestige Points (pp) for a single player based on their original track ranks.
 * @param {Object} playerTracks - Dictionary of tracks played by the player.
 * @returns {number} Total accumulated Prestige Points.
 */
function computePlayerPrestigePoints(playerTracks) {
    let totalPrestigePoints = 0.0;
    
    for (const trackIndexStr in playerTracks) {
        const entry = playerTracks[trackIndexStr];
        const rank = entry.originalPosition;
        
        // Check if rank falls within the valid Prestige Points scoring range (1 to 30)
        if (rank >= 1 && rank < prestigePointsTable.length) {
            totalPrestigePoints += prestigePointsTable[rank];
        }
    }
    
    return totalPrestigePoints;
}

module.exports = {
    computePlayerPrestigePoints
};