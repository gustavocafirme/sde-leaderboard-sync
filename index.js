const { syncCars, syncCountries, syncManualCountries, syncTracks, syncPlayersMetadata } = require('./syncMetadata');
const { processAndSyncLeaderboardsAndRatings } = require('./mathEngine');

async function main() {
    console.log("=== Starting SDE Synchronization with Supabase ===");

    const args = process.argv.slice(2).map(arg => arg.toLowerCase());

    // Unified flag governing dynamic updates (leaderboards, players table, and country C-SSR)
    let runPlayersAndLeaderboardsAndCountries = true;
    let runTracks = false;
    let runCars = false;

    if (args.includes('--fetchall') || args.includes('fetchall')) {
        //runPlayersAndLeaderboardsAndCountries = true;
        runTracks = true;
        runCars = true;
    } else {
        if (args.includes('--tracks')) runTracks = true;
        if (args.includes('--cars')) runCars = true;

        // Disables unified flow only if --noplayersandleaderboards is set and --countries is not requested
        if (args.includes('--noplayersandleaderboards') && !args.includes('--countries')) runPlayersAndLeaderboardsAndCountries = false;
    }

    // Conditionally synchronize static master tables
    if (runCars) await syncCars();
    if (runTracks) await syncTracks();

    // Synchronize and upsert countries (fully governed by the unified flag)
    await syncCountries(runPlayersAndLeaderboardsAndCountries);

    // Always load manual country overrides into local memory for calculation dependencies
    await syncManualCountries();

    // Synchronize player metadata if the unified flag is active
    await syncPlayersMetadata(runPlayersAndLeaderboardsAndCountries);

    // Execute core mathematical engine and synchronize leaderboards, players, and country ratings
    if (runPlayersAndLeaderboardsAndCountries) {
        await processAndSyncLeaderboardsAndRatings();
    }

    console.log("=== Synchronization Completed Successfully! ===");
}

main().catch(console.error);