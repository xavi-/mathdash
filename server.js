var fs = require("fs");
var settings = JSON.parse(fs.readFileSync("./settings.json"));

var http = require("http");
var url = require("url");
var query = require("querystring");
var net = require("net");
var repl = require("repl");
var event = require("events");
var util = require("util");
var bee = require("beeline");
var quip = require("quip");
var bind = require("bind");
var Cookies = require("cookies");
var uuid = require("node-uuid");
var moment = require("moment");
var CouchClient = require("couch-client");

var TOTAL_SCORE = 150, MAX_GAME_TIME = 5 * 60 * 1000, AI_COUNT = 20;

var userdb = CouchClient("http://" + settings.couchdb.auth + "@127.0.0.1:5984/users");
var gamedb = CouchClient("http://" + settings.couchdb.auth + "@127.0.0.1:5984/games");

var generators = {
    "times-50": require("./problem-generators/times-50"),
    "times-25": require("./problem-generators/times-25"),
    "times-11": require("./problem-generators/times-11"),
    "grade7": require("./problem-generators/grade7"),
    "grade6": require("./problem-generators/grade6"),
    "grade5": require("./problem-generators/grade5"),
    "grade4": require("./problem-generators/grade4"),
    "grade3": require("./problem-generators/grade3"),
    "grade2": require("./problem-generators/grade2"),
    "grade1": require("./problem-generators/grade1"),
    "times-tables-basic": require("./problem-generators/times-tables-basic"),
    "times-tables-ten": require("./problem-generators/times-tables-ten"),
    "divide-basic": require("./problem-generators/divide-basic")
};

var route = bee.route({
    "`preprocess`": [
        function(req, res) { quip.update(res); }
    ],
    "r`^/css/(.*)$`": bee.staticDir("./static/css", { ".css": "text/css" }),
    "r`^/cars/(.*)$`": bee.staticDir("./static/img/cars", { ".png": "image/png" }),
    "/libraries/pie.htc": bee.staticFile("./libraries/PIE/PIE.htc", "text/x-component"),
    "/teacher-feedback": (function() {
        var fd = fs.createWriteStream("./feedback.txt", { flags: "a+" });

        return function(req, res) {
            var cookies = new Cookies(req, res);
            var userId = cookies.get("user-id");

            var data = "";
            req.on("data", function(chunk) { data += chunk; });
            req.on("end", function() {
                var form = query.parse(data);
                var content = "\n--------\nfeedback: " + form.feedback + "\nemail: " + form.email + "; user-id: " + userId + "\n";
                fd.write(content);
                res.json({ error: false });

                saveEmail(userId, form.email, "feedback");
            });
        };
    })(),
    "/new-lessons-notification": (function() {
        var fd = fs.createWriteStream("./new-lessons-notifications.txt", { flags: "a+" });

        return function(req, res) {
            var cookies = new Cookies(req, res);
            var userId = cookies.get("user-id");

            var data = "";
            req.on("data", function(chunk) { data += chunk; });
            req.on("end", function() {
                var form = query.parse(data);
                fd.write("email: " + form.email + "; user-id: " + userId + "\n");
                res.json({ error: false });

                saveEmail(userId, form.email, "notification");
            });
        };
    })(),
    "/tutorial-example": function(req, res) {
        var uri  = url.parse(req.url, true);
        var tutorial = generators[uri.query["name"]];

        res.setHeader("Cache-Control", "no-cache, must-revalidate");
        res.setHeader("Pragma", "no-cache");

        if(!tutorial) { return res.json({ error: "unknown-tutorial" }); }

        res.json(tutorial({ tutorial: true }));
    },
    "/ /index.html": function(req, res) {
        var cookies = new Cookies(req, res);
        var userId = cookies.get("user-id");
        var isNewUser = false;
        
        userdb.get(userId, function(err, result) {
            if(err) { // Unknown user
                isNewUser = true;
                userId = uuid(); result = { "_id": userId, "name": cookies.get("user-name"), created: new Date() };
                userdb.save(result, function(err, result) { if(err) { return console.error(err); } });
            }
            
            if(!users[userId]) { users[userId] = {}; }
            users[userId].id = userId;
            users[userId].name = result.name;
            users[userId].icon = result.icon || "blue";
            users[userId].rank = result.rank || 0;
            users[userId]["lessons-seen"] = result["lessons-seen"] || {};
            
            cookies.set("user-id", userId, { expires: new Date(2050, 11, 31) });
            cookies.set("user-name", result.name, { expires: new Date(2050, 11, 31) });
            bind.toFile(
                "./templates/index.html",
                {
                    "user-id": userId,
                    "total-score": TOTAL_SCORE,
                    "user-name": result.name,
                    "user-icon": result.icon || "blue",
                    "logged-in?": !!result.email,
                    "is-new-user?": isNewUser,
                    "lessons-seen": JSON.stringify(users[userId]["lessons-seen"]),
                    "email-for-notifications?": !!result["email-notification"] + ""
                },
                function(data) {
                    res.setHeader("Cache-Control", "no-cache, must-revalidate");
                    res.setHeader("Pragma", "no-cache");
                    res.html(data);
                }
            );
        });
    },
    "/logout /signout": function(req, res) {
        var cookies = new Cookies(req, res);
        cookies.set("user-id", uuid());
        cookies.set("user-name", "");
        res.redirect("/");
    },
    "/login /signin": {
        "GET": function(req, res) {
            bind.toFile("./templates/login.html", { errors: false }, function(data) { res.html(data); });
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
                        bind.toFile("./templates/login.html", form, function(data) { res.html(data); });
                    } else {
                        userdb.view("/users/_design/users/_view/email", { key: form["email"] }, function(err, result) {
                            console.dir(result);
                            errors = findErrors(form, result.rows);
                            if(errors.count > 0) {
                                form.errors = errors;
                                bind.toFile("./templates/login.html", form, function(data) { res.html(data); });
                            } else if("signin" in form) {
                                var cookies = new Cookies(req, res);
                                cookies.set("user-id", result.rows[0].id);
                                cookies.set("user-name", result.rows[0].value.name);
                                res.redirect("/");
                            } else if("signup" in form) {
                                var data = { _id: uuid(), email: form.email, password: form.password };
                                userdb.save(data, function(err, result) {
                                    console.log("saving new user:");
                                    console.dir(result);
                                    var cookies = new Cookies(req, res);
                                    cookies.set("user-id", result._id);
                                    res.redirect("/");
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
                    bind.toFile("./templates/account.html", info, function(data) { res.html(data); });
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

function saveEmail(userId, email, source) {
    var fields = {};
    fields["email-" + source] = email;

    userdb.request(
        "PUT",
        "/users/_design/users/_update/setfield/" + userId + "?"
            + query.stringify({ "fields": JSON.stringify(fields) }),
        function(err, result) { if(err) { return console.error(err); } }
    );
}

var server = http.createServer(route);

function Questions(user) {
    event.EventEmitter.call(this);
    
    var curQuestion = "", curAnswer = "";
    
    var generate = function(curQuestion, curAnswer) {
        var question, frequency = [ "times-11", "times-11", "times-11", "times-25", "times-50", "times-tables-basic", "times-tables-ten", "divide-basic", "general" ];

        if(user.rank < 24) { frequency.push("general"); }

        var pick = frequency[(frequency.length * Math.random()) >> 0];
        if(pick === "general") {
            if(user.rank >= 72) { question = generators["grade7"](); }
            else if(user.rank >= 60) { question = generators["grade6"](); }
            else if(user.rank >= 48) { question = generators["grade5"](); }
            else if(user.rank >= 36) { question = generators["grade4"](); }
            else if(user.rank >= 24) { question = generators["grade3"](); }
            else if(user.rank >= 12) { question = generators["grade2"](); }
            else { question = generators["grade1"](); }
        } else {
            question = generators[pick]();
        }

        if(frequency.length === 0) { throw "Failed to generate a question: " + user.rank; }

        return question;
    };
    
    this.current = function() { return curQuestion; };
    
    this.next = function() {
        var content = generate(curQuestion, curAnswer);
        
        curQuestion = content.question;
        curAnswer = content.answer;
        
        this.emit("new-question", curQuestion, curAnswer);
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
    
    this.created = Date.now();
    
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
            player.wrong += 1;
            this.emit("incorrect-answer", player, answer);
        }
    };
    
    this.addPlayer = function(userId, client) {
        if(userId in players) { return; }
        
        var player = { userId: userId, client: client, score: 0, questions: new Questions(users[userId]), wrong: 0 };
        player.questions
            .on("new-question", function(question, answer) { self.emit("new-question", player, question, answer); });
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
            if(players.length === 0) { return game.end(); }
            if(players.every(function(p) { return p.finished; })) { return game.end(); }
            if(Date.now() - game.started > MAX_GAME_TIME) { return game.end(); }
            
            return;
        }
        
        if(players.length >= 2 && !game.startTimer) {
            game.startTimer = setTimeout(function() {
                game.start();
                game.startingAt = null;
                game.startTimer = null;
            }, 10000);
            game.startingAt = Date.now() + 10000;
            game.broadcast({ "game-starting": 9500 });
        }
    }
    
    Game.events.on("create", function(game) {
        game.on("correct-answer", gameManager);
        game.on("player-finished", gameManager);
        game.on("player-added", gameManager);
        game.on("player-removed", gameManager);
    });
})();

(function() { // AI Manager
    var AIs = JSON.parse(fs.readFileSync("./static/ai-players.json"));
    AIs.forEach(function(ai) { users[ai.id] = ai; });
    
    function randomAnswerTime() { return 3000 + (Math.random() * 2000 - 1000); }
    
    function addAIPlayer(game) {
        var id = "AI" + Math.floor(Math.random() * AI_COUNT);
        game.addPlayer(id, { json: { send: function() {} } });
        
        var curAnswer;
        function answerQuestion() {
            if(game.getPlayer(id).finished) { return; }
            
            game.answered(id, curAnswer);
            
            setTimeout(answerQuestion, randomAnswerTime());
        }
        game.on("game-started", function() {
            setTimeout(answerQuestion, randomAnswerTime());
        });
        game.on("new-question", function(player, question, answer) {
            if(player.userId !== id) { return; }
            
            curAnswer = answer;
        });
    }
    
    Game.events.on("create", function(game) {
        game.on("game-starting", function() {
            clearTimeout(game.addAIPlayerTimer);
            game.addAIPlayerTimer = null;
        });
        game.addAIPlayerTimer = setTimeout(function() { addAIPlayer(game); }, 8000);
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
    
    var points = {
        "4": { "0": 6, "1": 3, "2": 0, "3": -3 },
        "3": { "0": 6, "1": 2, "2": -2 },
        "2": { "0": 6, "1": -1 },
        "1": { "0": 0 }
    }
    function updatePlayerRank(player) {
        var userId = player.userId, players = this.players, placed = 0;
        for(var i = 0; i < players.length; i++) {
            if(players[i].userId === userId) { continue; }
            if(!players[i].finished) { continue; }
            if(players[i].finished > player.finished) { continue; }
            placed += 1;
        }
        
        users[userId].rank += points[players.length][placed] - player.wrong / 2;
        console.log("user rank: id: " + userId + "; rank: " + users[userId].rank);
        userdb.request(
            "PUT",
            "/users/_design/users/_update/setfield/" + userId + "?"
                + query.stringify({ "fields": JSON.stringify({ "rank": users[userId].rank }) }),
            function(err, result) { if(err) { return console.error(err); } }
        );
    }
    
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
        game.on("player-finished", updatePlayerRank);
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
    var curGame, userId, timestamps = [];

    function addTimestamp() {
        timestamps.push(Date.now());

        if(timestamps.length > 11) { timestamps.shift(); }
    }
    function isCheater() { // is Cheater if more than 10 messages in a 1 seconds
        if(timestamps.length < 10) { return false; }

        return (timestamps[timestamps.length - 1] - timestamps[0]) < 1000;
    }
    
    console.log("A new client!!: sessionId: " + client.sessionId);
    
    client.on('message', function(data){
        addTimestamp();
        if(users[userId] && users[userId].isCheater) {
            if((Date.now() - users[userId].isCheater) > 60 * 1000) { users[userId].isCheater = null; }
            else { return; }
        }
        if(isCheater()) {
            if(users[userId] && !users[userId].isCheater) {
                users[userId].isCheater = new Date();
                userdb.request(
                    "PUT",
                    "/users/_design/users/_update/setfield/" + userId + "?"
                        + query.stringify({ "fields": JSON.stringify({ "is-cheater": users[userId].isCheater }) }),
                    function(err, result) { if(err) { return console.error(err); } }
                );
                console.log("Cheater found: " + userId);
            }

            return;
        }

        console.log("got message...: userId: " + userId + "; data: " + JSON.stringify(data));
        
        if("setup" in data) {
            var msg = { "setup-done": true };
            userId = data["setup"]["user-id"];
            
            // Handle case where server resets and page doesn't refresh
            // Consider going to DB in this case.  Should be rare
            if(!users[userId]) { users[userId] = { id: userId }; console.log("Strange case"); }
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
        if("lessons-seen" in data) {
            users[userId]["lessons-seen"] = data["lessons-seen"];
            userdb.request(
                "PUT",
                "/users/_design/users/_update/setfield/" + userId + "?"
                    + query.stringify({ "fields": JSON.stringify({ "lessons-seen": users[userId]["lessons-seen"] }) }),
                function(err, result) { if(err) { return console.error(err); } }
            );
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
if(settings.environment === "prod") {
    io.set("log level", 1);
    io.enable("browser client minification");
    io.enable("browser client etag");
}
server.listen(8007);
console.log("Listening on port 8007");

process.title = "node-mathdash";
process.on("uncaughtException", function (err) {
    console.log(Date() + ' -- Caught exception: ' + err);
    console.log("stack: " + err.stack);
});

fs.unlinkSync("/tmp/mathdash-repl-sock");
net.createServer(function (socket) {
    var r = repl.start({ prompt: "mathdash> ", input: socket, output: socket });
    r.on("exit", function() { socket.end(); });
    r.context.users = users;
    r.context.games = games;
    r.context.socket = socket;
}).listen("/tmp/mathdash-repl-sock");
