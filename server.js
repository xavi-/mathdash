var http = require("http");
var url = require("url");
var query = require("querystring");
var net = require("net");
var repl = require("repl");
var event = require("events");
var util = require("util");
var bee = require("beeline");
var bind = require("bind");
var Cookies = require("cookies");
var uuid = require("node-uuid");
var moment = require("moment");
var CouchClient = require("couch-client");

var TOTAL_SCORE = 100, MAX_GAME_TIME = 5 * 60 * 1000;

var userdb = CouchClient("http://whoyou:yeah@127.0.0.1:5984/users");
var gamedb = CouchClient("http://whoyou:yeah@127.0.0.1:5984/games");

var route = bee.route({
    "`preprocess`": [
        (function() {
            function sendHtml(data) {
                this.writeHead(200, { "Content-Length": data.length,
                                      "Content-Type": "text/html; charset=utf-8" });
                this.end(data);
            }
            
            function sendJson(json) {
                var data = JSON.stringify(json);
                this.writeHead(200, { "Content-Length": data.length,
                                      "Content-Type": "application/json; charset=utf-8" });
                this.end(data);
            }
            
            return function(req, res) {
                res.html = sendHtml;
                res.json = sendJson;
            };
        })()
    ],
    "r`^/css/(.*)$`": bee.staticDir("./content/css", { ".css": "text/css" }),
    "r`^/cars/(.*)$`": bee.staticDir("./content/cars", { ".png": "image/png" }),
    "/libraries/pie.htc": bee.staticFile("./libraries/PIE/PIE.htc", "text/x-component"),
    "/ /index.html": function(req, res) {
        var cookies = new Cookies(req, res);
        var userId = cookies.get("user-id");
        
        userdb.get(userId, function(err, result) {
            if(err) { // Unknown user
                userId = uuid(); result = { "_id": userId, "name": cookies.get("user-name"), created: new Date() };
                userdb.save(result, function(err, result) { if(err) { return console.error(err); } });
            }
            
            if(!users[userId]) { users[userId] = {}; }
            users[userId].name = result.name;
            users[userId].icon = result.icon || "blue";
            
            cookies.set("user-id", userId, { expires: new Date(2050, 11, 31) });
            cookies.set("user-name", result.name, { expires: new Date(2050, 11, 31) });
            bind.toFile(
                "./content/templates/index.html",
                {
                    "user-id": userId,
                    "total-score": TOTAL_SCORE,
                    "user-name": result.name,
                    "user-icon": result.icon || "blue",
                    "logged-in?": !!result.email
                },
                function(data) {
                    res.writeHead(200, { "Content-Length": data.length, "Content-Type": "text/html" });
                    res.end(data);
                }
            );
        });
    },
    "/logout /signout": function(req, res) {
        var cookies = new Cookies(req, res);
        cookies.set("user-id", uuid());
        cookies.set("user-name", "");
        res.writeHead(302, { "Location": "/" });
        res.end();
    },
    "/login /signin": {
        "GET": function(req, res) {
            bind.toFile("./content/templates/login.html", { errors: false }, function(data) {
                res.writeHead(200, { "Content-Length": data.length, "Content-Type": "text/html" });
                res.end(data);
            });
        },
        "POST": (function() {
            function findErrors(form, rows) {
                var errors = {
                    "signin-error": false,
                    "signin-email-error": false,
                    "signin-no-email": false,
                    "signin-email-unknown": false,
                    "signin-no-password": false,
                    "signin-password-error": false,
                    "signin-password-incorrect": false,
                    "signup-error": false,
                    "signup-no-email": false,
                    "signup-email-error": false,
                    "signup-email-taken": false,
                    "signup-no-password": false,
                    "signup-password-mismatch": false
                };
                if("signin" in form) {
                    errors["signin-no-email"] = (form["email"] == "");
                    errors["signin-no-password"] = (form["password"] == "");
                } else if("signup" in form) {
                    errors["signup-no-email"] = (form["email"] == "");
                    errors["signup-no-password"] = (form["password"] == "");
                    errors["signup-password-mismatch"] = (form["password"] !== form["password2"]);
                }
                errors["signin-email-error"] = errors["signin-no-email"];
                errors["signin-password-error"] = errors["signin-no-password"];
                errors["signin-error"] = errors["signin-no-email"] || errors["signin-no-password"];
                errors["signup-email-error"] = errors["signup-no-email"];
                errors["signup-error"] = errors["signup-no-email"] ||
                    errors["signup-no-password"] || errors["signup-password-mismatch"];
                
                if(rows) {
                    if("signin" in form) {
                        errors["signin-email-unknown"] = (rows.length < 1);
                        errors["signin-password-incorrect"] =
                            !errors["signin-email-unknown"] && (form["password"] !== rows[0].value.password);
                    } else if("signup" in form) {
                        errors["signup-email-taken"] = (rows.length > 0);
                    }
                    errors["signin-email-error"] = errors["signin-email-unknown"];
                    errors["signin-password-error"] = errors["signin-password-incorrect"];
                    errors["signin-error"] = errors["signin-email-error"] || errors["signin-password-error"];
                    errors["signup-email-error"] = errors["signup-email-taken"];
                    errors["signup-error"] = errors["signup-email-error"];
                }
                
                errors.count = Object.keys(errors).filter(function(key) { return errors[key]; }).length;
                
                console.dir(errors);
                return errors;
            }
            
            return function(req, res) {
                var data = "";
                req.on("data", function(chunk) { data += chunk; })
                req.on("end", function() {
                    var form = query.parse(data);
                    console.dir(form);
                    
                    var errors = findErrors(form);
                    if(errors.count > 0) {
                        form.errors = errors;
                        bind.toFile("./content/templates/login.html", form, function(data) {
                            res.writeHead(200, { "Content-Length": data.length, "Content-Type": "text/html" });
                            res.end(data);
                        });
                    } else {
                        userdb.view("/users/_design/users/_view/email", { key: form["email"] }, function(err, result) {
                            console.dir(result);
                            errors = findErrors(form, result.rows);
                            if(errors.count > 0) {
                                form.errors = errors;
                                bind.toFile("./content/templates/login.html", form, function(data) {
                                    res.writeHead(200, { "Content-Length": data.length, "Content-Type": "text/html" });
                                    res.end(data);
                                });
                            } else if("signin" in form) {
                                var cookies = new Cookies(req, res);
                                cookies.set("user-id", result.rows[0].id);
                                cookies.set("user-name", result.rows[0].value.name);
                                res.writeHead(302, { "Location": "/" });
                                res.end();
                            } else if("signup" in form) {
                                var data = { _id: uuid(), email: form.email, password: form.password };
                                userdb.save(data, function(err, result) {
                                    console.log("saving new user:");
                                    console.dir(result);
                                    var cookies = new Cookies(req, res);
                                    cookies.set("user-id", result._id);
                                    res.writeHead(302, { "Location": "/" });
                                    res.end();
                                });
                            }
                        });
                    }
                });
            };
        })()
    },
    "/account /my-account": {
        "GET": function(req, res) {
            var cookies = new Cookies(req, res);
            var userId = cookies.get("user-id");
            var ranks = { "-1": "Not Finished", 0: "1st", 1: "2nd", 2: "3rd", 3: "4th" };
            gamedb.view("/games/_design/games/_view/users", { key: userId }, function(err, result) {
                var info = {
                    errors: false,
                    games:
                        result.rows
                            .sort(function(a, b) { return new Date(a.value.started) - new Date(b.value.started); })
                            .map(function(r, idx) {
                                return {
                                    id: r.id,
                                    index: idx + 1,
                                    started: moment(r.value.started).fromNow(),
                                    time: r.value.started,
                                    rank: ranks[r.value.ranks.indexOf(userId)]
                                };
                            }).reverse()
                };
                userdb.get(userId, function(err, result) {// Should maybe start using Step?
                    info.name = result.name;
                    info.email = result.email;
                    console.dir(info);
                    bind.toFile("./content/templates/account.html", info, function(data) {
                        res.writeHead(200, { "Content-Length": data.length, "Content-Type": "text/html" });
                        res.end(data);
                    });
                });
            });
        },
        "POST": (function() {
            function findErrors(userId, form, rows) { console.dir(rows);
                var errors = {
                    "no-name": (form["name"] == ""),
                    "no-email": !form["email"],
                    "email-taken": (rows && rows.length > 0 && rows[0].id !== userId),
                    "email-malformed": (!!form["email"] && form["email"].indexOf("@") < 0),
                    "password-mismatch": (!!form["password"] && form["password"] !== form["password2"])
                }
                
                errors.count = Object.keys(errors).filter(function(key) { return errors[key]; }).length;
                
                return errors;
            }
            
            return function(req, res) {
                var cookies = new Cookies(req, res);
                var userId = cookies.get("user-id");
                var data = "";
                req.on("data", function(chunk) { data += chunk; })
                req.on("end", function() {
                    gamedb.view("/games/_design/games/_view/users", { key: userId }, function(err, result) {
                        var form = query.parse(data);
                        var errors = findErrors(userId, form);
                        if(errors.count > 0) { return res.json({ errors: errors }); }
                        
                        userdb.view(
                            "/users/_design/users/_view/email",
                            { key: form["email"] },
                            function(err, result) {
                                errors = findErrors(userId, form, result.rows);
                                if(errors.count > 0) { return res.json({ errors: errors }); }
                                
                                var newVals = {
                                    email: form["email"],
                                    name: form["name"]
                                };
                                if(form["password"].length > 0) { newVals["password"] = form["password"]; }
                                
                                var updateUrl =
                                    url.parse(url.resolve("/users/_design/users/_update/setfield/", userId));
                                updateUrl.query = { "fields": JSON.stringify(newVals) };
                                userdb.request("PUT", url.format(updateUrl), function(err, results) {
                                    if(err) { console.error(err); res.json({ errors: { "db-error": true } }); }
                                    
                                    res.json({ ok: true });
                                });
                            }
                        );
                    });
                });
            };
        })()
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
    
    this.id = uuid();
    
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
        if(this.started) {
            players[userId].gone = Date.now();
            
            self.emit("player-gone", player);
        } else {
            players[userId] = null;
            delete players[userId];
            
            self.emit("player-removed", player);
        }
    };
    
    this.getPlayer = function(userId) {
        return players[userId];
    }
    
    this.__defineGetter__("players", function() {
        return Object.keys(players).map(function(key) { return players[key]; });
    });
    
    this.broadcast = function(msg, except) {
        this.players.forEach(function(p) {
            if(!p.gone && p.userId !== except) { p.client.json.send(msg); }
        });
    }
    
    Game.events.emit("create", this);
}
util.inherits(Game, event.EventEmitter);
Game.events = new event.EventEmitter();


var users = {}, games = [];

setInterval(function() { // Game reaper, doesn't take care of all memory leaks
    for(var i = 0; i < games.length; i++) { // Don't user filter -- makes games unavailble to repl
        if((Date.now() - games[i].ended) < MAX_GAME_TIME) {
            console.log("A game has been reaped");
            games.splice(i--, 1);
        }
    }
}, MAX_GAME_TIME);


(function() { // Game Manager
    function gameManager() {
        var game = this, players = game.players;
        
        if(game.started) {
            if(players.length === 0) { game.end(); }
            if(players.every(function(p) { return p.finished; })) { game.end(); }
            if(Date.now() - game.started > MAX_GAME_TIME) { game.end(); }
        } else { // Game not started
            if(players.length >= 2) {
                
                if(!game.startTimer) {
                    game.startTimer = setTimeout(function() {
                        game.start();
                        game.startingAt = null;
                        game.startTimer = null;
                    }, 10000);
                    game.startingAt = Date.now() + 10000;
                    game.broadcast({ "game-starting": 9000 });
                }
            }
        }
    }
    
    Game.events.on("create", function(game) {
        game.on("correct-answer", gameManager);
        game.on("player-finished", gameManager);
        game.on("player-added", gameManager);
        game.on("player-removed", gameManager);
    });
})();

(function() { // Relay game info to browser
    function gameStarted(game) {
        this.broadcast({ "game-started": game.started });
    }
    function gameEnded(game) {
        var ranks = {};
        game.players
            .sort(function(a, b) { return a.finished - b.finished; })
            .forEach(function(player, idx) { ranks[player.userId] = idx; });
        
        this.broadcast({ "game-ended": { "time": game.ended, "ranks": ranks } });
    }
    function newQuestion(player, question) {
        player.client.json.send({ "new-question": question });
    }
    function incorrectAnswer(player, answer) {
        player.client.json.send({ "incorrect-answer": answer });
    }
    function correctAnswer(player, answer) {
        player.client.json.send({ "correct-answer": { "answer": answer, "score": player.score } });
        this.broadcast({ "score-update": { "id": player.userId, "score": player.score } }, player.userId);
    }
    function playerFinished(player) {
        var rank = this.players.filter(function(p) {return p.finished < player.finished }).length;
        player.client.json.send({ "finished-game": { "rank": rank } });
        
        this.broadcast({ "player-finished": [ { "id": player.userId, "rank": rank } ] }, player.userId);
    }
    function playerAdded(player) {
        var players = {};
        this.players.forEach(function(player) {
            var user = users[player.userId];
            players[player.userId] = { "score": player.score, "name": user.name, "icon": user.icon };
        });
        var msg = { "game-joined": { "players": players } };
        if(this.startingAt > Date.now()) {
            msg["game-starting"] = this.startingAt - Date.now();
        }
        player.client.json.send(msg);
        
        var user = users[player.userId];
        this.broadcast({
            "player-added": { "id": player.userId, "score": player.score, "name": user.name, "icon": user.icon }
        }, player.userId);
    }
    function playerRemoved(player) {
        player.client.json.send({ "game-left": true });
        this.broadcast({ "player-removed": player.userId }, player.userId);
    }
    function playerGone(player) {
        player.client.json.send({ "game-left": true });
        this.broadcast({ "player-gone": [ { "id":  player.userId } ] }, player.userId);
    }
    function playerIconChanged(player, icon) {
        player.client.json.send({ "icon-change": true });
        this.broadcast({ "player-icon-changed": { "id":  player.userId, "icon": icon } }, player.userId);
    }
    
    Game.events.on("create", function(game) {
        game.on("game-started", gameStarted);
        game.on("game-ended", gameEnded);
        game.on("new-question", newQuestion);
        game.on("correct-answer", correctAnswer);
        game.on("incorrect-answer", incorrectAnswer);
        game.on("player-gone", playerGone);
        game.on("player-finished", playerFinished);
        game.on("player-added", playerAdded);
        game.on("player-removed", playerRemoved);
        game.on("player-icon-changed", playerIconChanged);
    });
})();

(function() { // Persist game info
    function save(game) {
        if(game.db.savePending) { return; }
        
        if(game.db.saveInflight) { game.db.savePending = true; return; }
        
        process.nextTick(function() {
            gamedb.save(game.db.data, function(err, result) {
                if(err) { throw err; }
                
                game.db.data._rev = result._rev;
                
                game.db.saveInflight = false;
                if(game.db.savePending) { game.db.savePending = false; save(game); }
            });
            game.db.savePending = false;
            game.db.saveInflight = true;
        });
        game.db.savePending = true;
    }
    function logPlayerAction(game, player, info) {
        var players = game.db.data.players;
        var id = player.userId;
        
        players[id] = players[id] || [];
        players[id].push(info);
        
        save(game);
    }
    
    function gameStarted(game) {
        game.db.data.started = new Date();
        save(game);
    }
    function gameEnded(game) {
        game.db.data.ended = new Date();
        game.db.data.finalRank = game.players.sort(function(a, b) {
            if(!a.finished && !b.finished) { return b.score - a.score; }
            
            if(!a.finished) { return 1; }
            
            if(!b.finished) { return -1; }
            
            return a.finished - b.finished;
        }).map(function(p) { return p.userId; });
        
        save(game);
    }
    function newQuestion(player, question) {
        logPlayerAction(this, player, { "new-question": { "question": question, "time": new Date() } });
    }
    function incorrectAnswer(player, answer) {
        logPlayerAction(this, player, { "incorrect-answer": { "answer": answer, "time": new Date() } });
    }
    function correctAnswer(player, answer) {
        logPlayerAction(this, player, { "correct-answer": { "answer": answer, "time": new Date() } });
    }
    function playerFinished(player) { logPlayerAction(this, player, { "finished": new Date() }); }
    function playerAdded(player) { logPlayerAction(this, player, { "added": new Date() }); }
    function playerRemoved(player) { logPlayerAction(this, player, { "removed": new Date() }); }
    function playerGone(player) { logPlayerAction(this, player, { "gone": new Date() }); }
    
    Game.events.on("create", function(game) {
        game.db = { savePending: false, saveInflight: false };
        game.db.data = { _id: game.id, created: new Date(), players: {}, finalRank: [] };
        
        game.on("game-started", gameStarted);
        game.on("game-ended", gameEnded);
        game.on("new-question", newQuestion);
        game.on("correct-answer", correctAnswer);
        game.on("incorrect-answer", incorrectAnswer);
        game.on("player-gone", playerGone);
        game.on("player-finished", playerFinished);
        game.on("player-added", playerAdded);
        game.on("player-removed", playerRemoved);
        
        gamedb.save(game.db.data, function(err, result) {
            if(err) { throw err; }
            console.log("--- first game result: ")
            console.dir(result);
            game.db.data._rev = result._rev;
            
            game.db.saveInflight = false;
            if(game.db.savePending) { game.db.savePending = false; save(game); }
        });
        game.db.saveInflight = true;
    });
})();

function findOpenGame() {
    var openGame = games.filter(function(game) { return !game.started; })[0];
    if(!openGame) {
        openGame = new Game();
        games.push(openGame);
    }
    
    return openGame
}

function reconnectLogic(userId, client, msg) {
    console.log("Force reconnect: " + userId);
    
    if(users[userId].disconnectTimer) { clearTimeout(users[userId].disconnectTimer); }
    users[userId].disconnectTimer = null;
    users[userId].client = client;
    
    msg["reconnected"] = true;
    
    var curGame = users[userId].curGame;
    if(curGame) {
        var player = curGame.getPlayer(userId);
        player.client = client;
        
        var players = {};
        curGame.players.forEach(function(player) {
            var user = users[player.userId];
            players[player.userId] = { "score": player.score, "name": user.name, "icon": user.icon };
        });
        msg["game-joined"] = { players: players };
        if(curGame.startingAt > Date.now()) {
            msg["game-starting"] = curGame.startingAt - Date.now();
        }
        if(curGame.started) {
            msg["game-started"] = curGame.started;
            msg["new-question"] = curGame.getPlayer(userId).questions.current();
            msg["player-gone"] =
                curGame.players
                    .filter(function(p) { return p.gone; })
                    .map(function(p) { return { "id": p.userId }; });
            msg["player-finished"] =
                curGame.players
                    .filter(function(p) { return p.finished; })
                    .sort(function(a, b) { return a.finished - b.finished; })
                    .map(function(p, idx) { return { "id": p.userId, "rank": idx }; })
                    .filter(function(info) { return info.id !== player.userId; });
        }
        if(player.finished) {
            var rank = curGame.players.filter(function(p) {return p.finished < player.finished }).length;
            msg["finished-game"] = { "rank": rank };
        }
        if(curGame.ended) {
            var ranks = {};
            curGame.players
                .sort(function(a, b) { return a.finished - b.finished; })
                .forEach(function(player, idx) { ranks[player.userId] = idx; });
            msg["game-ended"] = { "time": curGame.ended, "ranks": ranks };
        }
    }
}

var io = require("socket.io").listen(server);
io.sockets.on('connection', function(client){
    var curGame, userId;
    
    console.log("A new client!!: sessionId: " + client.sessionId);
    
    client.on('message', function(data){
        console.log("got message...: userId: " + userId + "; data: " + JSON.stringify(data));
        
        if("setup" in data) {
            var msg = { "setup-done": true };
            userId = data["setup"]["user-id"];
            
            // Handle case where server resets and page doesn't refresh
            // Consider going to DB in this case.  Should be rare
            if(!users[userId]) { users[userId] = {}; console.log("Strange case"); }
            users[userId].client = client;
            if(users[userId].connected) {
                reconnectLogic(userId, client, msg);
                curGame = users[userId].curGame;
            }
            users[userId].connected = true;
            
            client.json.send(msg);
        }
        if("user-name" in data) {
            users[userId].name = data["user-name"];
            
            userdb.request(
                "PUT",
                "/users/_design/users/_update/setfield/" + userId + "?"
                    + query.stringify({ "fields": JSON.stringify({ "name": users[userId].name }) }),
                function(err, result) { if(err) { return console.error(err); } }
            );
        }
        if("change-icon" in data) {
            users[userId].icon = data["change-icon"];
            userdb.request(
                "PUT",
                "/users/_design/users/_update/setfield/" + userId + "?"
                    + query.stringify({ "fields": JSON.stringify({ "icon": users[userId].icon }) }),
                function(err, result) { if(err) { return console.error(err); } }
            );
            curGame.emit("player-icon-changed", curGame.getPlayer(userId), users[userId].icon);
        }
        if("join-game" in data) {
            if(curGame) { curGame.removePlayer(userId); }
            users[userId].curGame = curGame = findOpenGame();
            curGame.addPlayer(userId, client);
        }
        if("start-game" in data) {
            curGame.start();
        }
        if("leave-game" in data) {
            curGame.removePlayer(userId);
            users[userId].curGame = curGame = null;
        }
        if("answer" in data) {
            curGame.answered(userId, data["answer"]);
        }
    });
    client.on('disconnect', function(){
        if(!userId) { return; } // Handle case where setup isn't done
        if(users[userId].client.sessionId !== client.sessionId) { return; }
        if(users[userId].client.connected) { return; }
        
        users[userId].disconnectTimer = setTimeout(function() {
            console.log("Really disconnected: " + userId);
            if(curGame) { curGame.removePlayer(userId); }
            users[userId] = null;
            delete users[userId];
            userId = null;
            curGame = null;
        }, 10000);
        
        console.log("About to disconnect: " + userId);
    });
});

server.listen(8007);
console.log("Listening on port 8007");


net.createServer(function (socket) {
    var r = repl.start("mathdash> ", socket);
    r.context.users = users;
    r.context.games = games;
    r.context.socket = socket;
}).listen("/tmp/mathdash-repl-sock");
