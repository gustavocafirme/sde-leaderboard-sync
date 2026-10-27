const { syncCars, syncCountries, syncManualCountries, syncTracks, syncPlayersMetadata } = require('./syncMetadata');
const { processAndSyncLeaderboardsAndRatings } = require('./mathEngine');

async function main() {
    console.log("=== Iniciando Sincronização SDE com o Supabase ===");

    const args = process.argv.slice(2).map(arg => arg.toLowerCase());

    // Novas flags espelhando exatamente a intenção unificada do Leaderboard Extractor
    let runPlayersAndLeaderboards = true; // Controla leaderboards, tabela players e c_ssr de countries
    let runTracks = false;                // Controla a tabela tracks
    let runCars = false;                  // Controla a tabela cars
    let runCountries = false;             // Controla country_acronym e country_name na tabela countries

    if (args.includes('--fetchall') || args.includes('fetchall')) {
        runPlayersAndLeaderboards = true;
        runTracks = true;
        runCars = true;
        runCountries = true;
    }
    else {
        if (args.includes('--tracks')) runTracks = true;
        if (args.includes('--cars')) runCars = true;
        if (args.includes('--countries')) runCountries = true;
    }

    // Argumento unificado para desativar leaderboards e jogadores
    if (args.includes('--noplayersandleaderboards')) runPlayersAndLeaderboards = false;

    // Sincroniza tabelas estáticas de Master Cars e Master Tracks condicionalmente
    if (runCars) await syncCars();
    if (runTracks) await syncTracks();

    // Carrega os países na memória RAM obrigatoriamente (para resolver IDs no mathEngine),
    // mas só faz o upsert das colunas acrônimo/nome no Supabase se 'runCountries' for true.
    await syncCountries(runCountries);

    // Sempre carrega as nacionalidades manuais na memória RAM (necessário para os cálculos)
    await syncManualCountries();

    // Carrega os nomes dos jogadores na memória RAM obrigatoriamente para dependências,
    // mas o upsert completo da tabela players será gerenciado pelo bloco principal.
    await syncPlayersMetadata(runPlayersAndLeaderboards);

    // Executa o motor matemático principal, envio das leaderboards, tabela players e c_ssr se ativado
    if (runPlayersAndLeaderboards) {
        await processAndSyncLeaderboardsAndRatings({ runPlayersAndLeaderboards, runCountries });
    }

    console.log("=== Sincronização Concluída com Sucesso! ===");
}

main().catch(console.error);