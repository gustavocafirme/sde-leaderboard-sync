const { syncCars, syncCountries, syncManualCountries, syncTracks, syncPlayersMetadata } = require('./syncMetadata');
const { processAndSyncLeaderboardsAndRatings } = require('./mathEngine');

async function main() {
    console.log("=== Iniciando Sincronização SDE com o Supabase ===");

    await syncCars();
    await syncCountries();
    await syncManualCountries();
    await syncTracks();
    await syncPlayersMetadata();
    await processAndSyncLeaderboardsAndRatings();

    console.log("=== Sincronização Concluída com Sucesso! ===");
}

main().catch(console.error);