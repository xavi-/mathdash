var http = require("http");
var event = require("events");
var util = require("util");
var io = require("socket.io");
var bee = require("beeline");
var bind = require("bind");

var route = bee.route({
    "/ /index.html": function(req, res) {
        bind.toFile("./content/templates/index.html", {}, function(data) {
            res.writeHead(200, { "Content-Length": data.length, "Content-Type": "text/html" });
            res.end(data);
        });
    }
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
    
    this.answered = function(sessionId, answer) {
        var player = players[sessionId];
        if(player.questions.isCorrect(answer)) {
            player.score += 10;
            this.emit("correct-answer", player, answer);
            player.questions.next();
        } else {
            this.emit("incorrect-answer", player, answer);
        }
    };
    
    this.addPlayer = function(client) {
        if(client.sessionId in players) { return; }
        
        var player = { client: client, score: 0, questions: new Questions(client) };
        player.questions
            .on("new-question", function(question) { self.emit("new-question", player, question); });
        players[client.sessionId] = player;
        
        self.emit("player-added", player);
    };
    
    this.removePlayer = function(sessionId) {
        if(!(sessionId in players)) { return; }
        
        var player = players[sessionId];
        players[sessionId] = null;
        delete players[sessionId];
        
        self.emit("player-removed", player)
    };
    
    this.__defineGetter__("players", function() {
        return Object.keys(players).map(function(key) { return players[key]; });
    });
}
util.inherits(Game, event.EventEmitter);


var clients = {}, games = [];

var findOpenGame = (function() {
    function gameStarted(game) {
        this.players.forEach(function(player) {
            player.client.send({ "game-started": game.started });
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
            if(p.client.sessionId === player.client.sessionId) { return; }
            p.client.send({ "score-update": { "id": player.client.sessionId, "score": player.score } });
        });
    }

    function playerAdded(player) {
        var players = {};
        this.players.forEach(function(player) { players[player.client.sessionId] = player.score; });
        player.client.send({ "game-joined": { "players": players } });
        this.players.forEach(function(p) {
            if(p.client.sessionId === player.client.sessionId) { return; }
            p.client.send({ "player-added": { "id": player.client.sessionId, "score": player.score } });
        });
    }

    function playerRemoved(player) {
        player.client.send({ "game-left": true });
        this.players.forEach(function(p) {
            if(p.client.sessionId === player.client.sessionId) { return; }  
            p.client.send({ "player-removed": player.client.sessionId });
        });
    }

    return function findOpenGame() {    
        var openGame = games.filter(function(game) { return !game.started; })[0];
        if(!openGame) {
            openGame = new Game();
            games.push(openGame);
            
            openGame.on("game-started", gameStarted);
            openGame.on("new-question", newQuestion);
            openGame.on("correct-answer", correctAnswer);
            openGame.on("incorrect-answer", incorrectAnswer);
            openGame.on("player-added", playerAdded);
            openGame.on("player-removed", playerRemoved);
        }
        
        return openGame
    };
})();

var socket = io.listen(server);
socket.on('connection', function(client){
    var curGame;
    
    console.log("A new client!!: " + client.sessionId);
    clients[client.sessionId] = client;
    
    client.on('message', function(data){
        console.log("got message...: " + JSON.stringify(data));
        
        if("join-game" in data) {
            if(curGame) { curGame.removePlayer(client.sessionId); }
            curGame = findOpenGame();
            curGame.addPlayer(client);
        }
        if("start-game" in data) {
            curGame.start();
        }
        if("leave-game" in data) {
            curGame.removePlayer(client.sessionId);
        }
        if("answer" in data) {
            curGame.answered(client.sessionId, data["answer"]);
        }
    });
    client.on('disconnect', function(){
        clients[client.sessionId] = null;
        delete clients[client.sessionId];
    });
});

server.listen(8007);
console.log("Listening on port 8007");