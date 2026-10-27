const { prestigePointsTable } = require('./config');

/**
 * Calcula os Prestige Points (pp) para um único jogador com base nas posições originais obtidas nas pistas.
 * @param {Object} playerTracks - Dicionário de pistas jogadas pelo jogador.
 * @returns {number} Total de Prestige Points acumulados.
 */
function computePlayerPrestigePoints(playerTracks) {
    let totalPrestigePoints = 0.0;
    
    for (const trackIndexStr in playerTracks) {
        const entry = playerTracks[trackIndexStr];
        const rank = entry.originalPosition;
        
        // Verifica se o rank está dentro do intervalo válido da tabela de Prestige Points (1 a 30)
        if (rank >= 1 && rank < prestigePointsTable.length) {
            totalPrestigePoints += prestigePointsTable[rank];
        }
    }
    
    return totalPrestigePoints;
}

module.exports = {
    computePlayerPrestigePoints
};