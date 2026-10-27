const { syncCars, syncCountries, syncManualCountries, syncTracks, syncPlayersMetadata } = require('./syncMetadata');
const { processAndSyncLeaderboardsAndRatings } = require('./mathEngine');

async function main() {
    console.log("=== Iniciando Sincronização SDE com o Supabase ===");

    const args = process.argv.slice(2).map(arg => arg.toLowerCase());

    // Flag unificada: controla leaderboards, tabela de jogadores, acrônimo/nome e c_ssr de países
    let runPlayersAndLeaderboardsAndCountries = true;
    let runTracks = false;
    let runCars = false;

    if (args.includes('--fetchall') || args.includes('fetchall')) {
        runPlayersAndLeaderboardsAndCountries = true;
        runTracks = true;
        runCars = true;
    }
    else {
        if (args.includes('--tracks')) runTracks = true;
        if (args.includes('--cars')) runCars = true;
        
        // O argumento unificado desativa todo o bloco principal de dados dinâmicos
        // O argumento --countries antigo agora mapeia para a flag unificada ou é coberto por ela
        if (args.includes('--noplayersandleaderboards') && !args.includes('--countries')) runPlayersAndLeaderboardsAndCountries = false;
    }

    // Sincroniza tabelas estáticas de Master Cars e Master Tracks condicionalmente
    if (runCars) await syncCars(true);
    if (runTracks) await syncTracks(true);

    // Sincroniza e envia os países para o Supabase apenas se a flag unificada estiver ativa
    await syncCountries(runPlayersAndLeaderboardsAndCountries);

    // Sempre carrega as nacionalidades manuais na memória RAM (necessário para os cálculos)
    await syncManualCountries();

    // Sincroniza e envia metadados de jogadores se a flag unificada estiver ativa
    await syncPlayersMetadata(runPlayersAndLeaderboardsAndCountries);

    // Executa o motor matemático principal e envio das leaderboards, jogadores e C-SSR dos países
    if (runPlayersAndLeaderboardsAndCountries) {
        await processAndSyncLeaderboardsAndRatings();
    }

    console.log("=== Sincronização Concluída com Sucesso! ===");
}

main().catch(console.error);