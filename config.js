const path = require('path');

// Base directory for game tracking data files
const trackingDir = process.env.GAME_TRACKING_DIR || path.join(__dirname, 'UserData', 'LeaderboardTracking');

// Prestige Points table indexed by global rank (1 to 30). Ranks above 30 yield 0 points.
const prestigePointsTable = [
    0,      // Rank 0 (placeholder)
    200,    // Rank 1
    80,     // Rank 2
    40,     // Rank 3
    17.5,   // Rank 4
    10,     // Rank 5
    6.03405,// Rank 6
    4.01347,// Rank 7
    2.6991, // Rank 8
    1.74275,// Rank 9
    1,      // Rank 10
    0.25,   // Rank 11
    0.1851, // Rank 12
    0.14735,// Rank 13
    0.12065,// Rank 14
    0.1,    // Rank 15
    0.07727,// Rank 16
    0.06404,// Rank 17
    0.05469,// Rank 18
    0.04745,// Rank 19
    0.04155,// Rank 20
    0.03657,// Rank 21
    0.03227,// Rank 22
    0.02847,// Rank 23
    0.02508,// Rank 24
    0.02202,// Rank 25
    0.01922,// Rank 26
    0.01665,// Rank 27
    0.01428,// Rank 28
    0.01207,// Rank 29
    0.01    // Rank 30
];

module.exports = {
    trackingDir,
    totalTracks: 75,
    scorePowerFactor: 2,
    scoreWDecayFactor: 0.96,
    ssrWFinalPowerPass: 1.5,
    countryContributionFactor: 0.60,
    prestigePointsTable
};