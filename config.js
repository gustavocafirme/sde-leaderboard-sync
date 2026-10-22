const path = require('path');

const trackingDir = process.env.GAME_TRACKING_DIR || path.join(__dirname, 'UserData', 'LeaderboardTracking');

module.exports = {
    trackingDir,
    totalTracks: 75,
    scorePowerFactor: 2,
    scoreWDecayFactor: 0.96,
    ssrWFinalPowerPass: 1.5,
    countryContributionFactor: 0.60
};