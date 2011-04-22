var http = require("http");
var net = require("net");
var repl = require("repl");
var event = require("events");
var util = require("util");
var io = require("socket.io");
var bee = require("beeline");
var bind = require("bind");
var Cookies = require("cookies");

var TOTAL_SCORE = 100, MAX_GAME_TIME = 5 * 60 * 1000;

var route = bee.route({
    "/ /index.html": function(req, res) {
        var cookies = new Cookies(req, res);
        var userId = cookies.get("user-id") || Math.random().toString().substr(2);
        var userName = cookies.get("user-name") || "";
        
        if(userName && clients[userId]) { clients[userId].name = userName; }
        if(clients[userId] && clients[userId].name) { userName = clients[userId].name; }
        
        cookies.set("user-id", userId);
        cookies.set("user-name", userName);
        bind.toFile(
            "./content/templates/index.html",
            { "user-id": userId, "total-score": TOTAL_SCORE, "user-name": userName },
            function(data) {
                res.writeHead(200, { "Content-Length": data.length, "Content-Type": "text/html" });
                res.end(data);
            }
        );
    },
    "/libraries/pie.htc": bee.staticFileHandler("./libraries/PIE/PIE.htc", "text/x-component")
});

var server = http.createServer(route);

function Questions(client) {
    event.EventEmitter.call(this);
    
    var curQuestion = "", curAnswer = "";
    
    var generate = function(curQuestion, curAnswer) {
        var num1 = Math.floor(10 * Math.random()), num2 = Math.floor(10 * Math.random());
        return { question: num1 + " + " + num2, answer: num1 + num2 };
    };
    
    this.current = function() { return curQuestion; };
    
    this.next = function() {
        var content = generate(curQuestion, curAnswer);
        
        curQuestion = content.question;
        curAnswer = content.answer;
        
        this.emit("new-question", curQuestion);
    };
    
    this.isCorrect = function(answer) {
        return answer == curAnswer;
    };
}
util.inherits(Questions, event.EventEmitter);

function Game() {
    event.EventEmitter.call(this);
    
    var players = {}, self = this;
    
    this.started = false;
    
    this.ended = false;
    
    this.start = function() {
        if(this.started) { return; }
        
        this.started = Date.now();
        this.emit("game-started", this);
        
        for(var id in players) {
            players[id].questions.next();
        }
    };
    
    this.end = function() {
        if(this.ended) { return; }
        
        this.ended = Date.now();
        this.emit("game-ended", this);
    };
    
    this.answered = function(userId, answer) {
        var player = players[userId];
        
        if(player.finished) { return; }
        
        if(player.questions.isCorrect(answer)) {
            player.score += 10;
            this.emit("correct-answer", player, answer);
            
            if(player.score < TOTAL_SCORE) {
                player.questions.next();
            } else {
                player.finished = Date.now();
                this.emit("player-finished", player);
            }
        } else {
            this.emit("incorrect-answer", player, answer);
        }
    };
    
    this.addPlayer = function(userId, client) {
        if(userId in players) { return; }
        
        var player = { userId: userId, client: client, score: 0, questions: new Questions(client) };
        player.questions
            .on("new-question", function(question) { self.emit("new-question", player, question); });
        players[userId] = player;
        
        self.emit("player-added", player);
    };
    
    this.removePlayer = function(userId) {
        if(!(userId in players)) { return; }
        
        var player = players[userId];
        players[userId] = null;
        delete players[userId];
        
        self.emit("player-removed", player)
    };
    
    this.getPlayer = function(userId) {
        return players[userId];
    }
    
    this.__defineGetter__("players", function() {
        return Object.keys(players).map(function(key) { return players[key]; });
    });
}
util.inherits(Game, event.EventEmitter);


var clients = {}, games = [];

setInterval(function() { // Game reaper, doesn't take care of all memory leaks
    games = games.filter(function(game) { // TODO: consider curGame in client closure and clients var
        var reap = Date.now() - game.ended < MAX_GAME_TIME;
        
        if(reap) { console.log("A game has been reaped"); }
        
        return reap;
    });
}, MAX_GAME_TIME);

var findOpenGame = (function() {
    function gameStarted(game) {
        this.players.forEach(function(player) {
            player.client.send({ "game-started": game.started });
        });
    }

    function gameEnded(game) {
        var ranks = {};
        game.players
            .sort(function(a, b) { return a.finished - b.finished; })
            .forEach(function(player, idx) { ranks[player.userId] = idx; });
        
        this.players.forEach(function(player) {
            player.client.send({ "game-ended": { "time": game.ended, "ranks": ranks } });
        });
    }

    function newQuestion(player, question) {
        player.client.send({ "new-question": question });
    }

    function incorrectAnswer(player, answer) {
        player.client.send({ "incorrect-answer": answer });
    }

    function correctAnswer(player, answer) {
        player.client.send({ "correct-answer": { "answer": answer, "score": player.score } });
        this.players.forEach(function(p) {
            if(p.userId === player.userId) { return; }
            p.client.send({ "score-update": { "id": player.userId, "score": player.score } });
        });
    }

    function playerFinished(player) {
        var rank = this.players.filter(function(p) {return p.finished < player.finished }).length;
        player.client.send({ "finished-game": { "rank": rank } });
        
        this.players.forEach(function(p) {
            if(p.userId === player.userId) { return; }
            p.client.send({ "player-finished": { "id": player.userId, "rank": rank } });
        })
    }

    function playerAdded(player) {
        var players = {};
        this.players.forEach(function(player) {
            players[player.userId] = { "score": player.score, "name": clients[player.userId].name };
        });
        player.client.send({ "game-joined": { "players": players } });
        this.players.forEach(function(p) {
            if(p.userId === player.userId) { return; }
            p.client.send({
                "player-added": {
                    "id": player.userId, "score": player.score, "name": clients[player.userId].name
                }
            });
        });
    }

    function playerRemoved(player) {
        player.client.send({ "game-left": true });
        this.players.forEach(function(p) {
            if(p.userId === player.userId) { return; }
            p.client.send({ "player-removed": player.userId });
        });
    }
    
    function gameManager() {
        var game = this, players = game.players;
        
        if(game.started) {
            if(players.length === 0) { game.end(); }
            if(players.every(function(p) { return p.finished; })) { game.end(); }
            if(Date.now() - game.started > 5 * 60 * 1000) { game.end(); }
        } else { // Game not started
            if(players.length >= 2) {
                
                if(!game.startTimer) {
                    game.startTimer = setTimeout(function() {
                        game.start();
                        game.startingAt = null;
                        game.startTimer = null;
                    }, 10000);
                    game.startingAt = Date.now() + 10000;
                    this.players.forEach(function(p) {
                        p.client.send({ "game-starting": 9000 });
                    });
                }
            }
        }
    }

    return function findOpenGame() {
        var openGame = games.filter(function(game) { return !game.started; })[0];
        if(!openGame) {
            openGame = new Game();
            games.push(openGame);
            
            openGame.on("game-started", gameStarted);
            openGame.on("game-ended", gameEnded);
            openGame.on("new-question", newQuestion);
            openGame.on("correct-answer", correctAnswer);
            openGame.on("incorrect-answer", incorrectAnswer);
            openGame.on("player-finished", playerFinished);
            openGame.on("player-added", playerAdded);
            openGame.on("player-removed", playerRemoved);
            
            openGame.on("correct-answer", gameManager);
            openGame.on("player-finished", gameManager);
            openGame.on("player-added", gameManager);
            openGame.on("player-removed", gameManager);
        }
        
        return openGame
    };
})();

function reconnectLogic(userId, client, msg) {
    console.log("Force reconnect: " + userId);
    
    if(clients[userId].disconnectTimer) { clearTimeout(clients[userId].disconnectTimer); }
    clients[userId].disconnectTimer = null;
    clients[userId].client = client;
    
    msg["reconnected"] = true;
    
    var curGame = clients[userId].curGame;
    if(curGame) {
        curGame.getPlayer(userId).client = client;
        
        var players = {};
        curGame.players.forEach(function(player) {
            players[player.userId] = { "score": player.score, "name": clients[player.userId].name };
        });
        msg["game-joined"] = { players: players };
        if(curGame.startingAt) {
            msg["game-starting"] = curGame.startingAt - Date.now();
        }
        if(curGame.started) {
            msg["game-started"] = curGame.started;
            msg["new-question"] = curGame.getPlayer(userId).questions.current();
        }
        if(curGame.ended) {
            var ranks = {};
            curGame
                .players
                .sort(function(a, b) { return a.finished - b.finished; })
                .forEach(function(player, idx) { ranks[player.userId] = idx; });
            msg["game-ended"] = { "time": curGame.ended, "ranks": ranks };
        }
    }
}

var socket = io.listen(server);
socket.on('connection', function(client){
    var curGame, userId;
    
    console.log("A new client!!: sessionId: " + client.sessionId);
    
    client.on('message', function(data){
        console.log("got message...: userId: " + userId + "; data: " + JSON.stringify(data));
        
        if("setup" in data) {
            var msg = { "setup-done": true };
            userId = data["setup"]["user-id"];
            
            if(!clients[userId]) { clients[userId] = { curGame: null, client: client }; }
            else {
                reconnectLogic(userId, client, msg);
                curGame = clients[userId].curGame;
            }
            
            client.send(msg);
        }
        if("user-name" in data) {
            clients[userId].name = data["user-name"];
        }
        if("join-game" in data) {
            if(curGame) { curGame.removePlayer(userId); }
            clients[userId].curGame = curGame = findOpenGame();
            curGame.addPlayer(userId, client);
        }
        if("start-game" in data) {
            curGame.start();
        }
        if("leave-game" in data) {
            curGame.removePlayer(userId);
            clients[userId].curGame = curGame = null;
        }
        if("answer" in data) {
            curGame.answered(userId, data["answer"]);
        }
    });
    client.on('disconnect', function(){
        if(!userId) { return; }
        if(clients[userId].client.sessionId !== client.sessionId) { return; }
        if(clients[userId].client.connected) { return; }
        
        clients[userId].disconnectTimer = setTimeout(function() {
            console.log("Really disconnected: " + userId);
            if(curGame) { curGame.removePlayer(userId); }
            clients[userId] = null;
            delete clients[userId];
        }, 10000);
        
        console.log("About to disconnect: " + userId);
    });
});

server.listen(8007);
console.log("Listening on port 8007");


net.createServer(function (socket) {
  var r = repl.start("mathdash> ", socket);
  r.context.clients = clients;
  r.context.games = games;
  r.context.socket = socket;
}).listen("/tmp/mathdash-repl-sock");
