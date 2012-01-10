function(game) {
    for(var player in game.players) {
        emit(player, { started: game.started, ranks: game.finalRank });
    }
}