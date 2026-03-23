(function(wHandle, wjQuery) {
    var CONNECTION_URL = window.location.pathname.indexOf('/piraten') === 0
        ? window.location.host + '/piraten-ws'   // behind Caddy proxy
        : window.location.host;                  // direct access
        SKIN_URL = "./skins/", // Skin Directory
        pirateShipSkinData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAYAAABccqhmAAADhklEQVR4nO3azZESURiGUdqarSvLjTkQhgkQAUkYhUkQAQkYBjm4sVwZQLtQKWt+mAFu9/15z6maDT1DfQu+Zy4Nmw0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI5pqD8CyDrvtfOn6/njaHHbbi8+xP568Tgb1rvYA1Lc/njb746n2GFQgAJwJQR4B4AkhyPFQewDaJQLjcwLgLea/PwxGALiGEAxGALiFEAxCALiHEHROAChBCDolAJQkBJ3xMSAl+cpwZwSAEix+pwSAe1j8zgkAt7D4gxAA3myez/f35mmaRGAAPgXgVfM8/7/8/x5zt38AAsCLnlv8R9dFoHMCwBOvLf6j3xWBjrkHwJldzuMEwFX/8V/4e+XolACEK7W7ItAnAaAYEeiPAFCUCPRFAChOBPohACxCBPogACxGBNonABBMAFiUU0DbBIDFiUC7BIBViECbBIDViEB7BIBViUBbBIDViUA7BACCCQBVOAW0QQCoRgTqEwCqEoG6BIDqRKAeAaAJIlCHANAMEVifANAUEViXAEAwAaA5TgHrEQCaJALrEACaJQLLEwCaJgLLEgCaJwLLEQC6IALLEAAIJgB0wymgPAGgKyJQlgDQHREoRwDokgiUIQB0SwTuJwB0TQTuIwB0TwRuJwAQTAAYglPAbQSAYYjA9QSAoYjAdabaA7Csw25790Lsjyevk0E5AUAwAYBgAgDBBACCCQAEEwAIJgAQTAAgmABAMAGAYAIAwQQAggkABBMACCYAEEwAIJgAQDABgGACAMEEAIIJAAQTAAgmABBMACCYAEAwAYBgAgDBBACCCQAEEwAIJgAQTAAgmABAMAGAYAIAwQQAggkABBMACDbVHmBpXz9/mGvPUNPH95/ufo4fv74XmKRfX779HHZPHmoPwLLSl5fLvAWAYAIAwQQAggkABBMACCYAEEwAIJgAQDABgGACAMEEAIIJAAQTAAgmABBMACCYAEAwAYBgAgDBBACCCQAEEwAIJgAQTAAgmABAMAGAYAIAwQQAggkABBMACCYAEEwAIJgAQDABgGACAMEEAIIJAAQTAAgmABBMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA4I/f7RvsUcGftCAAAAAASUVORK5CYII=";

    wHandle.setserver = function(arg) {
        if (arg != CONNECTION_URL) {
            CONNECTION_URL = arg;
            showConnecting();
        }
    };

    var touchX, touchY,rMacro,
        touchable = 'createTouch' in document,
        touches = [];

    var leftTouchID = -1,
        leftTouchPos = new Vector2(0, 0),
        leftTouchStartPos = new Vector2(0, 0),
        leftVector = new Vector2(0, 0);

    var useHttps = "https:" == wHandle.location.protocol;

    function gameLoop() {
        ma = true;
        document.getElementById("canvas").focus();
        var isTyping = false;
        var chattxt;
        mainCanvas = nCanvas = document.getElementById("canvas");
        ctx = mainCanvas.getContext("2d");

        mainCanvas.onmousemove = function(event) {
            rawMouseX = event.clientX;
            rawMouseY = event.clientY;
            mouseCoordinateChange()
        };

        if (touchable) {
            mainCanvas.addEventListener('touchstart', onTouchStart, false);
            mainCanvas.addEventListener('touchmove', onTouchMove, false);
            mainCanvas.addEventListener('touchend', onTouchEnd, false);
        }

        mainCanvas.onmouseup = function() {};
        if (/firefox/i.test(navigator.userAgent)) {
            document.addEventListener("DOMMouseScroll", handleWheel, false);
        } else {
            document.body.onmousewheel = handleWheel;
        }

        mainCanvas.onfocus = function() {
            isTyping = false;
        };

        document.getElementById("chat_textbox").onblur = function() {
            isTyping = false;
        };


        document.getElementById("chat_textbox").onfocus = function() {
            isTyping = true;
        };

        // ═══════════════════════════════════════════════════════
        //  PIRATE SHIP PHYSICS  (clean rewrite)
        //
        //  Convention: shipHeading = 0 → bow points UP (north, -Y)
        //              increases clockwise (east = π/2)
        //  Virtual mouse placed at:
        //    rawMouseX = canvasWidth/2  + sin(heading) * dist
        //    rawMouseY = canvasHeight/2 - cos(heading) * dist
        //  → server moves cell toward that world point.
        // ═══════════════════════════════════════════════════════
        var pirateKeys = {};

        wHandle.onkeydown = function(event) {
            if (isTyping) {
                if (event.keyCode === 13) {
                    isTyping = false;
                    document.getElementById("chat_textbox").blur();
                    chattxt = document.getElementById("chat_textbox").value;
                    if (chattxt.length > 0) sendChat(chattxt);
                    document.getElementById("chat_textbox").value = "";
                }
                return;
            }
            pirateKeys[event.keyCode] = true;
            switch (event.keyCode) {
                case 13:
                    if (!hasOverlay) { document.getElementById("chat_textbox").focus(); isTyping = true; }
                    break;
                case 32: event.preventDefault(); if (playerCells.length > 0) firePirateCannon('both');      break;
                case 90:                          if (playerCells.length > 0) firePirateCannon('port');      break;
                case 88:                          if (playerCells.length > 0) firePirateCannon('starboard'); break;
                case 27: showOverlays(true); break;
                case 37: case 38: case 39: case 40: event.preventDefault(); break;
            }
        };
        wHandle.onkeyup  = function(e) { pirateKeys[e.keyCode] = false; };
        wHandle.onblur   = function()  { pirateKeys = {}; };

        // ── Cannon fire ───────────────────────────────────────
        // Briefly redirect virtual mouse 90° to port or starboard,
        // send fire packet, then immediately restore movement mouse.
        function firePirateCannon(side) {
            pirateFireAnim = { side: side, expires: Date.now() + 350 };
            var FAR = 200 * viewZoom; // well outside 32-unit threshold in world space

            function fireOneSide(a) {
                rawMouseX = canvasWidth  / 2 + Math.sin(a) * FAR;
                rawMouseY = canvasHeight / 2 - Math.cos(a) * FAR;
                mouseCoordinateChange();
                sendMouseMove();
                sendUint8(21); // eject = fire cannon
            }

            if (side === 'port'      || side === 'both') fireOneSide(shipHeading - Math.PI / 2);
            if (side === 'starboard' || side === 'both') fireOneSide(shipHeading + Math.PI / 2);

            // Restore movement mouse immediately so ship doesn't drift sideways
            setMovementMouse();
            sendMouseMove();
        }

        // ── Movement mouse helper ─────────────────────────────
        // Place mouse exactly shipSpeed×32 world-units ahead of the ship.
        // 32 is agar's own speed-cap threshold: below it the cell moves
        // proportionally, above it full speed. Staying within that range
        // gives smooth linear acceleration with no leap.
        function setMovementMouse() {
            var worldUnits = shipSpeed * 31; // 0..31 world units (just under threshold)
            var canvasDist = worldUnits * viewZoom;
            rawMouseX = canvasWidth  / 2 + Math.sin(shipHeading) * canvasDist;
            rawMouseY = canvasHeight / 2 - Math.cos(shipHeading) * canvasDist;
            mouseCoordinateChange();
        }

        // ── Wind drift (slow) ─────────────────────────────────
        setInterval(function() {
            windAngle   += (Math.random() - 0.5) * 0.04;
            windStrength = Math.max(0.4, Math.min(1.0, windStrength + (Math.random() - 0.5) * 0.02));
        }, 3000);

        // ── Main physics tick (16 ms ≈ 60 fps) ───────────────
        setInterval(function() {
            if (isTyping || hasOverlay) return;

            // Bigger ships accelerate and turn more slowly
            var shipSize = (playerCells.length > 0) ? playerCells[0].size : 80;
            var sizeInv  = Math.min(1.0, 80 / shipSize);

            // ── Wind limits top speed ─────────────────────────
            // Against wind: max 30% of full; with wind: up to 100%
            var windDot    = Math.cos(shipHeading - windAngle);
            var windFactor = (windDot + 1) / 2;
            var windMax    = 0.3 + windFactor * windStrength * 0.7; // 0.3..1.0

            // ── Turn (needs speed; scales with size) ──────────
            var maxTurn  = 0.040 * sizeInv;
            var turnRate = maxTurn * Math.min(1.0, shipSpeed * 4.0);
            if (pirateKeys[65] || pirateKeys[37]) shipHeading -= turnRate;
            if (pirateKeys[68] || pirateKeys[39]) shipHeading += turnRate;

            // ── Throttle ──────────────────────────────────────
            var accel = 0.0008 * sizeInv;
            var coast = 0.0002;
            if (pirateKeys[87] || pirateKeys[38]) {
                shipSpeed = Math.min(windMax, shipSpeed + accel);
            } else if (pirateKeys[83] || pirateKeys[40]) {
                shipSpeed = Math.max(0, shipSpeed - accel * 4);
            } else {
                if (shipSpeed > coast) shipSpeed -= coast;
                else                   shipSpeed  = 0;
            }
            // Wind can push over current max if you were going faster
            shipSpeed = Math.min(shipSpeed, windMax);

            // ── Push virtual mouse ────────────────────────────
            setMovementMouse();

        }, 16);

        wHandle.onresize = canvasResize;
        canvasResize();
        if (wHandle.requestAnimationFrame) {
            wHandle.requestAnimationFrame(redrawGameScene);
        } else {
            setInterval(drawGameScene, 1E3 / 60);
        }
        setInterval(sendMouseMove, 40);

        null == ws && showConnecting();
        jQuery("#overlays").show();
    }

    function onTouchStart(e) {
        for (var i = 0; i < e.changedTouches.length; i++) {
            var touch = e.changedTouches[i];
            if ((leftTouchID < 0) && (touch.clientX < canvasWidth / 2)) {
                leftTouchID = touch.identifier;
                leftTouchStartPos.reset(touch.clientX, touch.clientY);
                leftTouchPos.copyFrom(leftTouchStartPos);
                leftVector.reset(0, 0);
            }

            var size = ~~(canvasWidth / 7);
            if ((touch.clientX > canvasWidth - size) && (touch.clientY > canvasHeight - size)) {
                sendMouseMove();
                sendUint8(17); // split
            }

            if ((touch.clientX > canvasWidth - size) && (touch.clientY > canvasHeight - 2 * size - 10) && (touch.clientY < canvasHeight - size - 10)) {
                sendMouseMove();
                sendUint8(21); // eject
            }
        }
        touches = e.touches;
    }

    function onTouchMove(e) {
        e.preventDefault();
        for (var i = 0; i < e.changedTouches.length; i++) {
            var touch = e.changedTouches[i];
            if (leftTouchID == touch.identifier) {
                leftTouchPos.reset(touch.clientX, touch.clientY);
                leftVector.copyFrom(leftTouchPos);
                leftVector.minusEq(leftTouchStartPos);
                rawMouseX = leftVector.x * 3 + canvasWidth / 2;
                rawMouseY = leftVector.y * 3 + canvasHeight / 2;
                mouseCoordinateChange();
                sendMouseMove();
            }
        }
        touches = e.touches;
    }

    function onTouchEnd(e) {
        touches = e.touches;
        for (var i = 0; i < e.changedTouches.length; i++) {
            var touch = e.changedTouches[i];
            if (leftTouchID == touch.identifier) {
                leftTouchID = -1;
                leftVector.reset(0, 0);
                break;
            }
        }
    }

    function handleWheel(event) {
        zoom *= Math.pow(.9, event.wheelDelta / -120 || event.detail || 0);
        1 > zoom && (zoom = 1);
        zoom > 4 / viewZoom && (zoom = 4 / viewZoom)
    }

    function buildQTree() {
        if (.4 > viewZoom) qTree = null;
        else {
            var a = Number.POSITIVE_INFINITY,
                b = Number.POSITIVE_INFINITY,
                c = Number.NEGATIVE_INFINITY,
                d = Number.NEGATIVE_INFINITY,
                e = 0;
            for (var i = 0; i < nodelist.length; i++) {
                var node = nodelist[i];
                if (node.shouldRender() && !node.prepareData && 20 < node.size * viewZoom) {
                    e = Math.max(node.size, e);
                    a = Math.min(node.x, a);
                    b = Math.min(node.y, b);
                    c = Math.max(node.x, c);
                    d = Math.max(node.y, d);
                }
            }
            qTree = Quad.init({
                minX: a - (e + 100),
                minY: b - (e + 100),
                maxX: c + (e + 100),
                maxY: d + (e + 100),
                maxChildren: 2,
                maxDepth: 4
            });
            for (i = 0; i < nodelist.length; i++) {
                node = nodelist[i];
                if (node.shouldRender() && !(20 >= node.size * viewZoom)) {
                    for (a = 0; a < node.points.length; ++a) {
                        b = node.points[a].x;
                        c = node.points[a].y;
                        b < nodeX - canvasWidth / 2 / viewZoom || c < nodeY - canvasHeight / 2 / viewZoom || b > nodeX + canvasWidth / 2 / viewZoom || c > nodeY + canvasHeight / 2 / viewZoom || qTree.insert(node.points[a]);
                    }
                }
            }
        }
    }

    function mouseCoordinateChange() {
        X = (rawMouseX - canvasWidth / 2) / viewZoom + nodeX;
        Y = (rawMouseY - canvasHeight / 2) / viewZoom + nodeY
    }

    function hideOverlays() {
        hasOverlay = false;
        wjQuery("#overlays").hide();
    }

    function showOverlays(arg) {
        hasOverlay = true;
        userNickName = null;
        wjQuery("#overlays").fadeIn(arg ? 200 : 3E3);
    }

    function showConnecting() {
        if (ma) {
            wjQuery("#connecting").show();
            wsConnect((useHttps ? "wss://" : "ws://") + CONNECTION_URL)
        }
    }

    function wsConnect(wsUrl) {
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
            try {
                ws.close()
            } catch (b) {}
            ws = null
        }
        var c = CONNECTION_URL;
        wsUrl = (useHttps ? "wss://" : "ws://") + c;
        nodesOnScreen = [];
        playerCells = [];
        nodes = {};
        nodelist = [];
        Cells = [];
        leaderBoard = [];
        mainCanvas = teamScores = null;
        userScore = 0;
        log.info("Connecting to " + wsUrl + "..");
        ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        ws.onopen = onWsOpen;
        ws.onmessage = onWsMessage;
        ws.onclose = onWsClose;
    }

    function prepareData(a) {
        return new DataView(new ArrayBuffer(a))
    }

    function wsSend(a) {
        ws.send(a.buffer)
    }

    function onWsOpen() {
        var msg;
        delay = 500;
        wjQuery("#connecting").hide();
        msg = prepareData(5);
        msg.setUint8(0, 254);
        msg.setUint32(1, 5, true); // Protocol 5
        wsSend(msg);
        msg = prepareData(5);
        msg.setUint8(0, 255);
        msg.setUint32(1, 0, true);
        wsSend(msg);
        sendNickName();
        log.info("Connection successful!")
    }

    function onWsClose() {
        setTimeout(showConnecting, delay);
        delay *= 1.5;
    }

    function onWsMessage(msg) {
        handleWsMessage(new DataView(msg.data));
    }

    function handleWsMessage(msg) {
        function getString() {
            var text = '',
                char;
            while ((char = msg.getUint16(offset, true)) != 0) {
                offset += 2;
                text += String.fromCharCode(char);
            }
            offset += 2;
            return text;
        }

        var offset = 0,
            setCustomLB = false;
        240 == msg.getUint8(offset) && (offset += 5);
        switch (msg.getUint8(offset++)) {
            case 16: // update nodes
                updateNodes(msg, offset);
                break;
            case 17: // update position
                posX = msg.getFloat32(offset, true);
                offset += 4;
                posY = msg.getFloat32(offset, true);
                offset += 4;
                posSize = msg.getFloat32(offset, true);
                offset += 4;
                break;
            case 20: // clear nodes
                playerCells = [];
                nodesOnScreen = [];
                break;
            case 21: // draw line
                lineX = msg.getInt16(offset, true);
                offset += 2;
                lineY = msg.getInt16(offset, true);
                offset += 2;
                if (!drawLine) {
                    drawLine = true;
                    drawLineX = lineX;
                    drawLineY = lineY;
                }
                break;
            case 32: // add node
                nodesOnScreen.push(msg.getUint32(offset, true));
                offset += 4;
                break;
            case 48: // update leaderboard (custom text)
                setCustomLB = true;
                noRanking = true;
                break;
            case 49: // update leaderboard (ffa)
                if (!setCustomLB) {
                    noRanking = false;
                }
                teamScores = null;
                var LBplayerNum = msg.getUint32(offset, true);
                offset += 4;
                leaderBoard = [];
                for (i = 0; i < LBplayerNum; ++i) {
                    var nodeId = msg.getUint32(offset, true);
                    offset += 4;
                    leaderBoard.push({
                        id: nodeId,
                        name: getString()
                    })
                }
                drawLeaderBoard();
                break;
            case 50: // update leaderboard (teams)
                teamScores = [];
                var LBteamNum = msg.getUint32(offset, true);
                offset += 4;
                for (var i = 0; i < LBteamNum; ++i) {
                    teamScores.push(msg.getFloat32(offset, true));
                    offset += 4;
                }
                drawLeaderBoard();
                break;
            case 64: // set border
                leftPos = msg.getFloat64(offset, true);
                offset += 8;
                topPos = msg.getFloat64(offset, true);
                offset += 8;
                rightPos = msg.getFloat64(offset, true);
                offset += 8;
                bottomPos = msg.getFloat64(offset, true);
                offset += 8;
                posX = (rightPos + leftPos) / 2;
                posY = (bottomPos + topPos) / 2;
                posSize = 1;
                if (0 == playerCells.length) {
                    nodeX = posX;
                    nodeY = posY;
                    viewZoom = posSize;
                }
                break;
            case 99:
                addChat(msg, offset);
                break;
        }
    }

    function addChat(view, offset) {
        function getString() {
            var text = '',
                char;
            while ((char = view.getUint16(offset, true)) != 0) {
                offset += 2;
                text += String.fromCharCode(char);
            }
            offset += 2;
            return text;
        }

        var flags = view.getUint8(offset++);
        
        if (flags & 0x80) {
            // SERVER Message
        }

        if (flags & 0x40) {
            // ADMIN Message
        }

        if (flags & 0x20) {
            // MOD Message
        }

        var r = view.getUint8(offset++),
            g = view.getUint8(offset++),
            b = view.getUint8(offset++),
            color = (r << 16 | g << 8 | b).toString(16);
        while (color.length < 6) {
            color = '0' + color;
        }
        color = '#' + color;
        chatBoard.push({
            "name": getString(),
            "color": color,
            "message": getString(),
            "time": Date.now()
        });
        drawChatBoard();
    }

    function drawChatBoard() {
        if (hideChat)  {
            chatCanvas = null;
            return;
        }
        chatCanvas = document.createElement("canvas");
        var ctx = chatCanvas.getContext("2d");
        var scaleFactor = Math.min(Math.max(canvasWidth / 1200, 0.75), 1); //scale factor = 0.75 to 1
        chatCanvas.width = 1E3 * scaleFactor;
        chatCanvas.height = 550 * scaleFactor;
        ctx.scale(scaleFactor, scaleFactor);
        var nowtime = Date.now();
        var lasttime = 0;
        if (chatBoard.length >= 1)
            lasttime = chatBoard[chatBoard.length - 1].time;
        else return;
        var deltat = nowtime - lasttime;
        ctx.globalAlpha = 0.8 * Math.exp(-deltat / 25000);

        var len = chatBoard.length;
        var from = len - 15;
        if (from < 0) from = 0;
        for (var i = 0; i < (len - from); i++) {
            var chatName = new UText(18, chatBoard[i + from].color);
            chatName.setValue(chatBoard[i + from].name);
            var width = chatName.getWidth();
            var a = chatName.render();
            ctx.drawImage(a, 15, chatCanvas.height / scaleFactor - 24 * (len - i - from));

            var chatText = new UText(18, '#666666');
            chatText.setValue(':' + chatBoard[i + from].message);
            a = chatText.render();
            ctx.drawImage(a, 15 + width * 1.8, chatCanvas.height / scaleFactor - 24 * (len - from - i));
        }
    }


    function updateNodes(view, offset) {
        timestamp = +new Date;
        var code = Math.random();
        ua = false;
        var queueLength = view.getUint16(offset, true);
        offset += 2;

        for (i = 0; i < queueLength; ++i) {
            var killer = nodes[view.getUint32(offset, true)],
                killedNode = nodes[view.getUint32(offset + 4, true)];
            offset += 8;
            if (killer && killedNode) {
                killedNode.destroy();
                killedNode.ox = killedNode.x;
                killedNode.oy = killedNode.y;
                killedNode.oSize = killedNode.size;
                killedNode.nx = killer.x;
                killedNode.ny = killer.y;
                killedNode.nSize = killedNode.size;
                killedNode.updateTime = timestamp;
            }
        }

        for (var i = 0;;) {
            var nodeid = view.getUint32(offset, true);
            offset += 4;
            if (0 == nodeid) break;
            ++i;

            var size, posY, posX = view.getInt32(offset, true);
            offset += 4;
            posY = view.getInt32(offset, true);
            offset += 4;
            size = view.getInt16(offset, true);
            offset += 2;

            for (var r = view.getUint8(offset++), g = view.getUint8(offset++), b = view.getUint8(offset++),
                    color = (r << 16 | g << 8 | b).toString(16); 6 > color.length;) color = "0" + color;
            var colorstr = "#" + color,
                flags = view.getUint8(offset++),
                flagVirus = !!(flags & 0x01),
                flagEjected = !!(flags & 0x20),
                flagAgitated = !!(flags & 0x10),
                _skin = "";

            flags & 2 && (offset += 4);

            if (flags & 4) {
                for (;;) { // skin name
                    t = view.getUint8(offset, true) & 0x7F;
                    offset += 1;
                    if (0 == t) break;
                    _skin += String.fromCharCode(t);
                }
            }

            for (var char, name = "";;) { // nick name
                char = view.getUint16(offset, true);
                offset += 2;
                if (0 == char) break;
                name += String.fromCharCode(char);
            }

            var node = null;
            if (nodes.hasOwnProperty(nodeid)) {
                node = nodes[nodeid];
                node.updatePos();
                node.ox = node.x;
                node.oy = node.y;
                node.oSize = node.size;
                node.color = colorstr;
            } else {
                node = new Cell(nodeid, posX, posY, size, colorstr, name, _skin);
                nodelist.push(node);
                nodes[nodeid] = node;
                node.ka = posX;
                node.la = posY;
            }
            node.isVirus = flagVirus;
            node.isEjected = flagEjected;
            node.isAgitated = flagAgitated;
            node.nx = posX;
            node.ny = posY;
            node.setSize(size);
            node.updateCode = code;
            node.updateTime = timestamp;
            node.flag = flags;
            name && node.setName(name);
            if (-1 != nodesOnScreen.indexOf(nodeid) && -1 == playerCells.indexOf(node)) {
                document.getElementById("overlays").style.display = "none";
                playerCells.push(node);
                if (1 == playerCells.length) {
                    nodeX = node.x;
                    nodeY = node.y;
                }
            }
        }
        queueLength = view.getUint32(offset, true);
        offset += 4;
        for (i = 0; i < queueLength; i++) {
            var nodeId = view.getUint32(offset, true);
            offset += 4;
            node = nodes[nodeId];
            null != node && node.destroy();
        }
        ua && 0 == playerCells.length && showOverlays(false)
    }

    function sendMouseMove() {
        var msg;
        if (wsIsOpen()) {
            msg = rawMouseX - canvasWidth / 2;
            var b = rawMouseY - canvasHeight / 2;
            if (64 <= msg * msg + b * b && !(.01 > Math.abs(oldX - X) && .01 > Math.abs(oldY - Y))) {
                oldX = X;
                oldY = Y;
                msg = prepareData(21);
                msg.setUint8(0, 16);
                msg.setFloat64(1, X, true);
                msg.setFloat64(9, Y, true);
                msg.setUint32(17, 0, true);
                wsSend(msg);
            }
        }
    }

    function sendNickName() {
        if (wsIsOpen() && null != userNickName) {
            var msg = prepareData(1 + 2 * userNickName.length);
            msg.setUint8(0, 0);
            for (var i = 0; i < userNickName.length; ++i) msg.setUint16(1 + 2 * i, userNickName.charCodeAt(i), true);
            wsSend(msg)
        }
    }

    function sendChat(str) {
        if (wsIsOpen() && (str.length < 200) && (str.length > 0) && !hideChat) {
            var msg = prepareData(2 + 2 * str.length);
            var offset = 0;
            msg.setUint8(offset++, 99);
            msg.setUint8(offset++, 0); // flags (0 for now)
            for (var i = 0; i < str.length; ++i) {
                msg.setUint16(offset, str.charCodeAt(i), true);
                offset += 2;
            }

            wsSend(msg);
        }
    }

    function wsIsOpen() {
        return null != ws && ws.readyState == ws.OPEN
    }

    function sendUint8(a) {
        if (wsIsOpen()) {
            var msg = prepareData(1);
            msg.setUint8(0, a);
            wsSend(msg)
        }
    }

    function redrawGameScene() {
        try { drawGameScene(); } catch(e) { console.error('drawGameScene error:', e); }
        wHandle.requestAnimationFrame(redrawGameScene);
    }

    function canvasResize() {
        window.scrollTo(0, 0);
        canvasWidth = wHandle.innerWidth;
        canvasHeight = wHandle.innerHeight;
        nCanvas.width = canvasWidth;
        nCanvas.height = canvasHeight;
        drawGameScene()
    }

    function viewRange() {
        var ratio;
        ratio = Math.max(canvasHeight / 1080, canvasWidth / 1920);
        return ratio * zoom;
    }

    function calcViewZoom() {
        if (0 != playerCells.length) {
            for (var newViewZoom = 0, i = 0; i < playerCells.length; i++) newViewZoom += playerCells[i].size;
            newViewZoom = Math.pow(Math.min(64 / newViewZoom, 1), .4) * viewRange();
            viewZoom = (9 * viewZoom + newViewZoom) / 10;
        }
    }

    function drawGameScene() {
        var a, oldtime = Date.now();
        ++cb;
        timestamp = oldtime;
        if (0 < playerCells.length) {
            calcViewZoom();
            var c = a = 0;
            for (var d = 0; d < playerCells.length; d++) {
                playerCells[d].updatePos();
                a += playerCells[d].x / playerCells.length;
                c += playerCells[d].y / playerCells.length;
            }
            posX = a;
            posY = c;
            posSize = viewZoom;
            nodeX = (nodeX + a) / 2;
            nodeY = (nodeY + c) / 2
        } else {
            nodeX = (29 * nodeX + posX) / 30;
            nodeY = (29 * nodeY + posY) / 30;
            viewZoom = (9 * viewZoom + posSize * viewRange()) / 10;
        }
        buildQTree();
        mouseCoordinateChange();
        xa || ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (xa) {
            if (showDarkTheme) {
                ctx.fillStyle = '#111111';
                ctx.globalAlpha = .05;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.globalAlpha = 1;
            } else {
                ctx.fillStyle = '#F2FBFF';
                ctx.globalAlpha = .05;
                ctx.fillRect(0, 0, canvasWidth, canvasHeight);
                ctx.globalAlpha = 1;
            }
        } else {
            drawGrid();
        }
        nodelist.sort(function(a, b) {
            return a.size === b.size ? a.id - b.id : a.size - b.size
        });
        ctx.save();
        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.scale(viewZoom, viewZoom);
        ctx.translate(-nodeX, -nodeY);
        for (d = 0; d < Cells.length; d++) Cells[d].drawOneCell(ctx);

        for (d = 0; d < nodelist.length; d++) nodelist[d].drawOneCell(ctx);
        if (drawLine) {
            drawLineX = (3 * drawLineX + lineX) /
                4;
            drawLineY = (3 * drawLineY + lineY) / 4;
            ctx.save();
            ctx.strokeStyle = "#FFAAAA";
            ctx.lineWidth = 10;
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalAlpha = .5;
            ctx.beginPath();
            for (d = 0; d < playerCells.length; d++) {
                ctx.moveTo(playerCells[d].x, playerCells[d].y);
                ctx.lineTo(drawLineX, drawLineY);
            }
            ctx.stroke();
            ctx.restore()
        }
        ctx.restore();
        lbCanvas && lbCanvas.width && ctx.drawImage(lbCanvas, canvasWidth - lbCanvas.width - 10, 10); // draw Leader Board
        if (chatCanvas != null) ctx.drawImage(chatCanvas, 0, canvasHeight - chatCanvas.height - 50);

        // ── Wind Compass ──────────────────────────────────────────
        (function drawWindCompass() {
            var cx = canvasWidth - 54, cy = canvasHeight - 54, r = 38;
            ctx.save();
            // Background circle
            ctx.globalAlpha = 0.55;
            ctx.fillStyle = '#040e1c';
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#1a3a5a'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;

            // Cardinal labels
            ctx.font = 'bold 9px monospace';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = '#5a7a9a';
            ctx.fillText('N', cx,     cy - r + 7);
            ctx.fillText('S', cx,     cy + r - 7);
            ctx.fillText('W', cx - r + 7, cy);
            ctx.fillText('E', cx + r - 7, cy);

            // Wind arrow — points in the direction wind blows TO
            var windFactor = (Math.cos(shipHeading - windAngle) + 1) / 2;
            // Arrow color: green = with wind, red = against
            var rf = Math.round((1 - windFactor) * 200);
            var gf = Math.round(windFactor * 200);
            ctx.strokeStyle = 'rgb(' + rf + ',' + gf + ',80)';
            ctx.lineWidth = 2.5;
            var ax = Math.sin(windAngle), ay = -Math.cos(windAngle);
            ctx.beginPath();
            ctx.moveTo(cx - ax * (r - 10), cy - ay * (r - 10));
            ctx.lineTo(cx + ax * (r - 10), cy + ay * (r - 10));
            ctx.stroke();
            // Arrowhead
            var headLen = 8;
            var tip = { x: cx + ax * (r - 10), y: cy + ay * (r - 10) };
            var ha = Math.atan2(ay, ax);
            ctx.beginPath();
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(tip.x - headLen * Math.cos(ha - 0.4), tip.y - headLen * Math.sin(ha - 0.4));
            ctx.moveTo(tip.x, tip.y);
            ctx.lineTo(tip.x - headLen * Math.cos(ha + 0.4), tip.y - headLen * Math.sin(ha + 0.4));
            ctx.stroke();

            // Speed bar along bottom edge of compass
            var barW = (r * 2 - 6), barH = 5;
            var bx = cx - barW / 2, by = cy + r + 5;
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#040e1c';
            ctx.fillRect(bx, by, barW, barH);
            ctx.globalAlpha = 1;
            var spd = Math.max(0, shipSpeed);
            var effectiveMax = 0.35 + windFactor * windStrength * 0.65;
            ctx.fillStyle = spd > effectiveMax * 0.8 ? '#ffd700' : '#4ab';
            ctx.fillRect(bx, by, barW * spd, barH);
            ctx.strokeStyle = '#1a3a5a'; ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, barW, barH);

            ctx.restore();
        })();

        userScore = Math.max(userScore, calcUserScore());
        if (0 != userScore) {
            if (null == scoreText) {
                scoreText = new UText(24, '#FFFFFF');
            }
            scoreText.setValue('Score: ' + ~~(userScore / 100));
            c = scoreText.render();
            a = c.width;
            ctx.globalAlpha = .2;
            ctx.fillStyle = '#000000';
            ctx.fillRect(10, 10, a + 10, 34); //canvasHeight - 10 - 24 - 10
            ctx.globalAlpha = 1;
            ctx.drawImage(c, 15, 15); //canvasHeight - 10 - 24 - 5
        }
        drawSplitIcon(ctx);

        drawTouch(ctx);
        //drawChatBoard();
        var deltatime = Date.now() - oldtime;
        deltatime > 1E3 / 60 ? z -= .01 : deltatime < 1E3 / 65 && (z += .01);
        .4 > z && (z = .4);
        1 < z && (z = 1)
    }

    function drawTouch(ctx) {
        ctx.save();
        if (touchable) {
            for (var i = 0; i < touches.length; i++) {
                var touch = touches[i];
                if (touch.identifier == leftTouchID) {
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = 6;
                    ctx.arc(leftTouchStartPos.x, leftTouchStartPos.y, 40, 0, Math.PI * 2, true);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = 2;
                    ctx.arc(leftTouchStartPos.x, leftTouchStartPos.y, 60, 0, Math.PI * 2, true);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.arc(leftTouchPos.x, leftTouchPos.y, 40, 0, Math.PI * 2, true);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.beginPath();
                    ctx.strokeStyle = "#0096ff";
                    ctx.lineWidth = "6";
                    ctx.arc(touch.clientX, touch.clientY, 40, 0, Math.PI * 2, true);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
    }

    function drawGrid() {
        // ── Pirate ocean background ──────────────────────────
        ctx.fillStyle = '#091f3a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Animated wave ripples
        var t = Date.now() / 1000;
        ctx.save();
        ctx.strokeStyle = 'rgba(80,160,255,0.06)';
        ctx.lineWidth = 1.2;
        for (var wi = 0; wi < 20; wi++) {
            var wx = ((wi * 349 + t * 28) % (canvasWidth + 220)) - 110;
            var wy = ((wi * 211 + t * 18) % (canvasHeight + 120)) - 60;
            var wlen = 35 + (wi % 4) * 25;
            ctx.beginPath();
            ctx.moveTo(wx, wy);
            ctx.quadraticCurveTo(wx + wlen/2, wy - 3 + Math.sin(t*2+wi)*2, wx + wlen, wy);
            ctx.stroke();
        }
        ctx.restore();

        // Subtle ocean-depth grid
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.025)';
        ctx.lineWidth = 1;
        ctx.scale(viewZoom, viewZoom);
        var a = canvasWidth / viewZoom,
            b = canvasHeight / viewZoom;
        ctx.beginPath();
        for (var c = -.5 + (-nodeX + a / 2) % 200; c < a; c += 200) {
            ctx.moveTo(c, 0); ctx.lineTo(c, b);
        }
        for (c = -.5 + (-nodeY + b / 2) % 200; c < b; c += 200) {
            ctx.moveTo(0, c); ctx.lineTo(a, c);
        }
        ctx.stroke();
        ctx.restore();
    }

    function drawSplitIcon(ctx) {
        if (isTouchStart && splitIcon.width) {
            var size = ~~(canvasWidth / 7);
            ctx.drawImage(splitIcon, canvasWidth - size, canvasHeight - size, size, size);
        }

        if (isTouchStart && splitIcon.width) {
            var size = ~~(canvasWidth / 7);
            ctx.drawImage(ejectIcon, canvasWidth - size, canvasHeight - 2 * size - 10, size, size);
        }
    }

    function calcUserScore() {
        for (var score = 0, i = 0; i < playerCells.length; i++) score += playerCells[i].nSize * playerCells[i].nSize;
        return score
    }

    function drawLeaderBoard() {
        lbCanvas = null;
        var drawTeam = null != teamScores;
        if (drawTeam || 0 != leaderBoard.length)
            if (drawTeam || showName) {
                lbCanvas = document.createElement("canvas");
                var ctx = lbCanvas.getContext("2d"),
                    boardLength = 60;
                boardLength = !drawTeam ? boardLength + 24 * leaderBoard.length : boardLength + 180;
                var scaleFactor = Math.min(0.22 * canvasHeight, Math.min(200, .3 * canvasWidth)) * 0.005;
                lbCanvas.width = 200 * scaleFactor;
                lbCanvas.height = boardLength * scaleFactor;

                ctx.scale(scaleFactor, scaleFactor);
                ctx.globalAlpha = .4;
                ctx.fillStyle = "#000000";
                ctx.fillRect(0, 0, 200, boardLength);

                ctx.globalAlpha = 1;
                ctx.fillStyle = "#FFFFFF";
                var c = "Leaderboard";
                ctx.font = "30px Ubuntu";
                ctx.fillText(c, 100 - ctx.measureText(c).width * 0.5, 40);
                var b, l;
                if (!drawTeam) {
                    for (ctx.font = "20px Ubuntu", b = 0, l = leaderBoard.length; b < l; ++b) {
                        c = leaderBoard[b].name || "An unnamed cell";
                        if (!showName) {
                            (c = "An unnamed cell");
                        }
                        var me = -1 != nodesOnScreen.indexOf(leaderBoard[b].id);
                        if (me) playerCells[0].name && (c = playerCells[0].name);
                        me ? ctx.fillStyle = "#FFAAAA" : ctx.fillStyle = "#FFFFFF";
                        if (!noRanking) c = b + 1 + ". " + c;
                        var start = (ctx.measureText(c).width > 200) ? 2 : 100 - ctx.measureText(c).width * 0.5;
                        ctx.fillText(c, start, 70 + 24 * b);
                    }
                } else {
                    for (b = c = 0; b < teamScores.length; ++b) {
                        var d = c + teamScores[b] * Math.PI * 2;
                        ctx.fillStyle = teamColor[b + 1];
                        ctx.beginPath();
                        ctx.moveTo(100, 140);
                        ctx.arc(100, 140, 80, c, d, false);
                        ctx.fill();
                        c = d
                    }
                }
            }
    }

    function Cell(uid, ux, uy, usize, ucolor, uname, a) {
        this.id = uid;
        this.ox = this.x = ux;
        this.oy = this.y = uy;
        this.oSize = this.size = usize;
        this.color = ucolor;
        this.points = [];
        this.pointsAcc = [];
        this.createPoints();
        this.setName(uname)
        this._skin = a;
    }

    function UText(usize, ucolor, ustroke, ustrokecolor) {
        usize && (this._size = usize);
        ucolor && (this._color = ucolor);
        this._stroke = !!ustroke;
        ustrokecolor && (this._strokeColor = ustrokecolor)
    }


    var localProtocol = wHandle.location.protocol,
        localProtocolHttps = "https:" == localProtocol;
    var nCanvas, ctx, mainCanvas, lbCanvas, chatCanvas, canvasWidth, canvasHeight, qTree = null,
        ws = null,
        nodeX = 0,
        nodeY = 0,
        nodesOnScreen = [],
        playerCells = [],
        nodes = {},
        nodelist = [],
        Cells = [],
        leaderBoard = [],
        chatBoard = [],
        rawMouseX = 0,
        rawMouseY = 0,
        shipHeading = 0,
        shipSpeed = 0,       // current throttle  (-0.35 .. 1.0)
        windAngle = Math.random() * Math.PI * 2, // radians, where wind blows TO
        windStrength = 0.65 + Math.random() * 0.35, // 0.65-1.0
        pirateFireAnim = { side: '', expires: 0 }, // firing animation state
        pirateSprite = (function() {
            var img = new Image();
            img.src = 'assets/img/sprites.png';
            return img;
        })()
        X = -1,
        Y = -1,
        cb = 0,
        timestamp = 0,
        userNickName = null,
        leftPos = 0,
        topPos = 0,
        rightPos = 1E4,
        bottomPos = 1E4,
        viewZoom = 1,
        showSkin = true,
        showName = true,
        showColor = false,
        ua = false,
        userScore = 0,
        showDarkTheme = false,
        showMass = false,
        hideChat = false,
        smoothRender = .4,
        posX = nodeX = ~~((leftPos + rightPos) / 2),
        posY = nodeY = ~~((topPos + bottomPos) / 2),
        posSize = 1,
        teamScores = null,
        ma = false,
        hasOverlay = true,
        drawLine = false,
        lineX = 0,
        lineY = 0,
        drawLineX = 0,
        drawLineY = 0,
        Ra = 0,
        teamColor = ["#333333", "#FF3333", "#33FF33", "#3333FF"],
        xa = false,
        zoom = 1,
        isTouchStart = "ontouchstart" in wHandle && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        splitIcon = new Image,
        ejectIcon = new Image,
        noRanking = false;
    splitIcon.src = "assets/img/split.png";
    ejectIcon.src = "assets/img/feed.png";
    var wCanvas = document.createElement("canvas");
    var playerStat = null;
    wHandle.isSpectating = false;
    wHandle.setNick = function(arg) {
        // Accept any pirate name — just use it directly
        var name = (arg && arg.trim()) ? arg.trim() : 'Pirate';
        document.getElementById("hint").style.display = 'none';
        hideOverlays();
        userNickName = name;
        sendNickName();
        userScore = 0;
    };
    wHandle.setSkins = function(arg) {
        showSkin = arg
    };
    wHandle.setNames = function(arg) {
        showName = arg
    };
    wHandle.setDarkTheme = function(arg) {
        showDarkTheme = arg
    };
    wHandle.setColors = function(arg) {
        showColor = arg
    };
    wHandle.setShowMass = function(arg) {
        showMass = arg
    };
    wHandle.setSmooth = function(arg) {
        smoothRender = arg ? 2 : .4
    };
    wHandle.setChatHide = function(arg) {
        hideChat = arg;
        if (hideChat) {
            wjQuery('#chat_textbox').hide();
        } else {
            wjQuery('#chat_textbox').show();
        }
    }
    wHandle.spectate = function() {
        userNickName = null;
        wHandle.isSpectating = true;
        sendUint8(1);
        hideOverlays()
    };
    wHandle.setAcid = function(arg) {
        xa = arg
    };
    wHandle.openSkinsList = function(arg) {
        if ($('#inPageModalTitle').text() != "Skins") {
            $.get('include/gallery.html').then(function(data) {
                $('#inPageModalTitle').text("Skins");
                $('#inPageModalBody').html(data);
            });
        }
    };

    if (null != wHandle.localStorage) {
        wjQuery(window).load(function() {
            wjQuery(".save").each(function() {
                var id = $(this).data("box-id");
                var value = wHandle.localStorage.getItem("checkbox-" + id);
                if (value && value == "true" && 0 != id) {
                    $(this).prop("checked", "true");
                    $(this).trigger("change");
                } else if (id == 0 && value != null) {
                    $(this).val(value);
                }
            });
            wjQuery(".save").change(function() {
                var id = $(this).data('box-id');
                var value = (id == 0) ? $(this).val() : $(this).prop('checked');
                wHandle.localStorage.setItem("checkbox-" + id, value);
            });
        });
        if (null == wHandle.localStorage.AB8) {
            wHandle.localStorage.AB8 = ~~(100 * Math.random());
        }
    }

    setTimeout(function() {}, 3E5);
    var T = {
        ZW: "EU-London"
    };
    wHandle.connect = wsConnect;

    // checkdir.php removed

    // avatars/skins removed

    var delay = 500,
        oldX = -1,
        oldY = -1,
        z = 1,
        scoreText = null,
        skins = {},
        knownNameDict = "pirateship;koch;ron;ah;gr;zanz;niqo;wale".split(";"),
        knownNameDict_noDisp = [];
        // Canvas = null,
        // ib = ["_canvas'blob"];
    Cell.prototype = {
        id: 0,
        points: null,
        pointsAcc: null,
        name: null,
        nameCache: null,
        sizeCache: null,
        x: 0,
        y: 0,
        size: 0,
        ox: 0,
        oy: 0,
        oSize: 0,
        nx: 0,
        ny: 0,
        nSize: 0,
        flag: 0,
        updateTime: 0,
        updateCode: 0,
        drawTime: 0,
        destroyed: false,
        isVirus: false,
        isEjected: false,
        isAgitated: false,
        wasSimpleDrawing: true,
        destroy: function() {
            var tmp;
            for (tmp = 0, len = nodelist.length; tmp < len; tmp++)
                if (nodelist[tmp] === this) {
                    nodelist.splice(tmp, 1);
                    break
                }
            delete nodes[this.id];
            tmp = playerCells.indexOf(this);
            if (-1 != tmp) {
                ua = true;
                playerCells.splice(tmp, 1);
            }
            tmp = nodesOnScreen.indexOf(this.id);
            if (-1 != tmp) nodesOnScreen.splice(tmp, 1);
            this.destroyed = true;
            Cells.push(this)
        },
        getNameSize: function() {
            return Math.max(~~(.3 * this.size), 24)
        },
        setName: function(a) {
            this.name = a;
            if (null == this.nameCache) {
                this.nameCache = new UText(this.getNameSize(), "#FFFFFF", true, "#000000");
                this.nameCache.setValue(this.name);
            } else {
                this.nameCache.setSize(this.getNameSize());
                this.nameCache.setValue(this.name);
            }
        },
        setSize: function(a) {
            this.nSize = a;
            var m = ~~(this.size * this.size * 0.01);
            if (null === this.sizeCache)
                this.sizeCache = new UText(this.getNameSize() * 0.5, "#FFFFFF", true, "#000000");
            else this.sizeCache.setSize(this.getNameSize() * 0.5);
        },
        createPoints: function() {
            for (var samplenum = this.getNumPoints(); this.points.length > samplenum;) {
                var rand = ~~(Math.random() * this.points.length);
                this.points.splice(rand, 1);
                this.pointsAcc.splice(rand, 1)
            }
            if (0 == this.points.length && 0 < samplenum) {
                this.points.push({
                    ref: this,
                    size: this.size,
                    x: this.x,
                    y: this.y
                });
                this.pointsAcc.push(Math.random() - .5);
            }
            while (this.points.length < samplenum) {
                var rand2 = ~~(Math.random() * this.points.length),
                    point = this.points[rand2];
                this.points.splice(rand2, 0, {
                    ref: this,
                    size: point.size,
                    x: point.x,
                    y: point.y
                });
                this.pointsAcc.splice(rand2, 0, this.pointsAcc[rand2])
            }
        },
        getNumPoints: function() {
            if (0 == this.id) return 16;
            var a = 10;
            if (20 > this.size) a = 0;
            if (this.isVirus) a = 30;
            var b = this.size;
            if (!this.isVirus)(b *= viewZoom);
            b *= z;
            if (this.flag & 32)(b *= .25);
            return ~~Math.max(b, a);
        },
        movePoints: function() {
            this.createPoints();
            for (var points = this.points, pointsacc = this.pointsAcc, numpoints = points.length, i = 0; i < numpoints; ++i) {
                var pos1 = pointsacc[(i - 1 + numpoints) % numpoints],
                    pos2 = pointsacc[(i + 1) % numpoints];
                pointsacc[i] += (Math.random() - .5) * (this.isAgitated ? 3 : 1);
                pointsacc[i] *= .7;
                10 < pointsacc[i] && (pointsacc[i] = 10); -
                10 > pointsacc[i] && (pointsacc[i] = -10);
                pointsacc[i] = (pos1 + pos2 + 8 * pointsacc[i]) / 10
            }
            for (var ref = this, isvirus = this.isVirus ? 0 : (this.id / 1E3 + timestamp / 1E4) % (2 * Math.PI), j = 0; j < numpoints; ++j) {
                var f = points[j].size,
                    e = points[(j - 1 + numpoints) % numpoints].size,
                    m = points[(j + 1) % numpoints].size;
                if (15 < this.size && null != qTree && 20 < this.size * viewZoom && 0 != this.id) {
                    var l = false,
                        n = points[j].x,
                        q = points[j].y;
                    qTree.retrieve2(n - 5, q - 5, 10, 10, function(a) {
                        if (a.ref != ref && 25 > (n - a.x) * (n - a.x) + (q - a.y) * (q - a.y)) {
                            l = true;
                        }
                    });
                    if (!l && points[j].x < leftPos || points[j].y < topPos || points[j].x > rightPos || points[j].y > bottomPos) {
                        l = true;
                    }
                    if (l) {
                        if (0 < pointsacc[j]) {
                            (pointsacc[j] = 0);
                        }
                        pointsacc[j] -= 1;
                    }
                }
                f += pointsacc[j];
                0 > f && (f = 0);
                f = this.isAgitated ? (19 * f + this.size) / 20 : (12 * f + this.size) / 13;
                points[j].size = (e + m + 8 * f) / 10;
                e = 2 * Math.PI / numpoints;
                m = this.points[j].size;
                this.isVirus && 0 == j % 2 && (m += 5);
                points[j].x = this.x + Math.cos(e * j + isvirus) * m;
                points[j].y = this.y + Math.sin(e * j + isvirus) * m
            }
        },
        updatePos: function() {
            if (0 == this.id) return 1;
            var a;
            a = (timestamp - this.updateTime) / 120;
            a = 0 > a ? 0 : 1 < a ? 1 : a;
            var b = 0 > a ? 0 : 1 < a ? 1 : a;
            this.getNameSize();
            if (this.destroyed && 1 <= b) {
                var c = Cells.indexOf(this); -
                1 != c && Cells.splice(c, 1)
            }
            this.x = a * (this.nx - this.ox) + this.ox;
            this.y = a * (this.ny - this.oy) + this.oy;
            this.size = b * (this.nSize - this.oSize) + this.oSize;
            return b;
        },
        shouldRender: function() {
            if (0 == this.id) {
                return true
            } else {
                return !(this.x + this.size + 40 < nodeX - canvasWidth / 2 / viewZoom || this.y + this.size + 40 < nodeY - canvasHeight / 2 / viewZoom || this.x - this.size - 40 > nodeX + canvasWidth / 2 / viewZoom || this.y - this.size - 40 > nodeY + canvasHeight / 2 / viewZoom);
            }
        },
        getStrokeColor: function() {
            var r = (~~(parseInt(this.color.substr(1, 2), 16) * 0.9)).toString(16),
                g = (~~(parseInt(this.color.substr(3, 2), 16) * 0.9)).toString(16),
                b = (~~(parseInt(this.color.substr(5, 2), 16) * 0.9)).toString(16);
            if (r.length == 1) r = "0" + r;
            if (g.length == 1) g = "0" + g;
            if (b.length == 1) b = "0" + b;
            return "#" + r + g + b;
        },
        drawOneCell: function(ctx) {
            if (!this.shouldRender()) return;
            ctx.save();
            try {
            this.drawTime = timestamp;
            var alive = this.updatePos();
            if (this.destroyed) ctx.globalAlpha *= (1 - alive);

            var x = this.x, y = this.y, r = this.size;
            var isPlayer = -1 !== playerCells.indexOf(this);

            // ── Ejected mass → cannonball ────────────────────────
            // Spritesheet row 2 (y=250): cannonballs; first ball is ~50×50 at x=0
            if (this.isEjected) {
                var cbR = Math.max(r, 5);
                if (pirateSprite.complete && pirateSprite.naturalWidth) {
                    ctx.drawImage(pirateSprite, 0, 250, 50, 50,
                        x - cbR, y - cbR, cbR * 2, cbR * 2);
                } else {
                    ctx.beginPath();
                    ctx.arc(x, y, cbR, 0, 2*Math.PI);
                    ctx.fillStyle = '#222';
                    ctx.fill();
                }
                ctx.restore();
                return;
            }

            // ── Virus → whirlpool / rocks ────────────────────────
            if (this.isVirus) {
                ctx.strokeStyle = '#336633';
                ctx.lineWidth = r * 0.12;
                ctx.fillStyle = '#1a3320';
                ctx.beginPath();
                ctx.arc(x, y, r * 0.88, 0, 2*Math.PI);
                ctx.fill(); ctx.stroke();
                // Spikes
                var ns = 8;
                ctx.fillStyle = '#4a8a4a';
                for (var si = 0; si < ns; si++) {
                    var sa = (si / ns) * 2 * Math.PI;
                    var sx2 = x + Math.cos(sa) * r;
                    var sy2 = y + Math.sin(sa) * r;
                    ctx.beginPath();
                    ctx.arc(sx2, sy2, r * 0.18, 0, 2*Math.PI);
                    ctx.fill();
                }
                ctx.restore();
                return;
            }

            // ── Food → treasure barrel / chest ──────────────────
            if (r < 18) {
                var isChest = (this.id % 3 === 0);
                var bob = Math.sin(Date.now()/600 + this.id) * 1.5;
                ctx.translate(x, y + bob);
                if (isChest) {
                    ctx.fillStyle = '#8b6914';
                    ctx.fillRect(-r*0.7, -r*0.5, r*1.4, r);
                    ctx.fillStyle = '#ffd700';
                    ctx.fillRect(-r*0.7, -r*0.5, r*1.4, r*0.45);
                    ctx.strokeStyle = '#4a3000';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(-r*0.7, -r*0.5, r*1.4, r);
                } else {
                    ctx.fillStyle = '#5a3010';
                    ctx.beginPath();
                    ctx.ellipse(0, 0, r*0.55, r*0.7, 0, 0, 2*Math.PI);
                    ctx.fill();
                    ctx.strokeStyle = '#888';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.ellipse(0, 0, r*0.55, r*0.25, 0, 0, 2*Math.PI);
                    ctx.stroke();
                }
                ctx.restore();
                return;
            }

            // ── Player / enemy cell → SHIP (sprite) ─────────────
            // Heading: player uses shipHeading, others use movement direction
            var heading;
            if (isPlayer) {
                heading = shipHeading;
            } else {
                if (!this._pirateAngle) this._pirateAngle = Math.random() * 2 * Math.PI;
                if (this._prevX !== undefined) {
                    var mdx = x - this._prevX, mdy = y - this._prevY;
                    if (mdx*mdx + mdy*mdy > 0.01) {
                        this._pirateAngle = Math.atan2(mdx, -mdy);
                    }
                }
                this._prevX = x; this._prevY = y;
                heading = this._pirateAngle;
            }

            // Spritesheet layout (500×500, 3 cols × 4 rows, transparent bg):
            //   Col 0=normal, Col 1=port firing, Col 2=starboard firing
            //   Row 0 (y=0):   player ship variants
            //   Row 1 (y=125): enemy ship variants
            //   Row 2 (y=250): cannonballs + smoke
            //   Row 3 (y=375): explosions
            var SW = 167, SH = 125;
            var sprRow = isPlayer ? 0 : 1;
            var nowMs = Date.now();
            var sprCol = 0;
            if (isPlayer && nowMs < pirateFireAnim.expires) {
                if      (pirateFireAnim.side === 'port')      sprCol = 1;
                else if (pirateFireAnim.side === 'starboard') sprCol = 2;
                else sprCol = (Math.floor(nowMs / 80) % 2) + 1;
            }
            var spx = sprCol * SW, spy = sprRow * SH;
            var drawW = r * 3.0, drawH = r * 2.4;

            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(heading);
            // Draw sprite (centered, transparent bg — no manual shadow needed)
            if (pirateSprite.complete && pirateSprite.naturalWidth) {
                ctx.drawImage(pirateSprite, spx, spy, SW, SH,
                    -drawW / 2, -drawH * 0.6, drawW, drawH);
            } else {
                ctx.fillStyle = isPlayer ? '#8B3A00' : '#1a3a7a';
                ctx.fillRect(-r*0.5, -r, r, r*2);
            }
            ctx.restore(); // end heading rotation

            // Name above ship
            if (this.name && showName) {
                var fs = Math.max(11, Math.min(16, r*0.42));
                ctx.font = 'bold ' + fs + 'px Georgia, serif';
                ctx.textAlign = 'center';
                var nameY = y - r*1.5;
                var tw2 = ctx.measureText(this.name).width;
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(x - tw2/2 - 3, nameY - fs, tw2 + 6, fs + 3);
                ctx.fillStyle = isPlayer ? '#ffd700' : '#ddd';
                ctx.fillText(this.name, x, nameY);
            }

            } catch(e) { /* swallow draw errors to keep rAF loop alive */ }
            ctx.restore();
        }
    };
    UText.prototype = {
        _value: "",
        _color: "#000000",
        _stroke: false,
        _strokeColor: "#000000",
        _size: 16,
        _canvas: null,
        _ctx: null,
        _dirty: false,
        _scale: 1,
        setSize: function(a) {
            if (this._size != a) {
                this._size = a;
                this._dirty = true;
            }
        },
        setScale: function(a) {
            if (this._scale != a) {
                this._scale = a;
                this._dirty = true;
            }
        },
        setStrokeColor: function(a) {
            if (this._strokeColor != a) {
                this._strokeColor = a;
                this._dirty = true;
            }
        },
        setValue: function(a) {
            if (a != this._value) {
                this._value = a;
                this._dirty = true;
            }
        },
        render: function() {
            if (null == this._canvas) {
                this._canvas = document.createElement("canvas");
                this._ctx = this._canvas.getContext("2d");
            }
            if (this._dirty) {
                this._dirty = false;
                var canvas = this._canvas,
                    ctx = this._ctx,
                    value = this._value,
                    scale = this._scale,
                    fontsize = this._size,
                    font = fontsize + 'px Ubuntu';
                ctx.font = font;
                var h = ~~(.2 * fontsize),
                    wd = fontsize * 0.1;
                var h2 = h * 0.5;
                canvas.width = ctx.measureText(value).width * scale + 3;
                canvas.height = (fontsize + h) * scale;
                ctx.font = font;
                ctx.globalAlpha = 1;
                ctx.lineWidth = wd;
                ctx.strokeStyle = this._strokeColor;
                ctx.fillStyle = this._color;
                ctx.scale(scale, scale);
                this._stroke && ctx.strokeText(value, 0, fontsize - h2);
                ctx.fillText(value, 0, fontsize - h2);
            }
            return this._canvas
        },
        getWidth: function() {
            return (ctx.measureText(this._value).width + 6);
        }
    };
    Date.now || (Date.now = function() {
        return (new Date).getTime()
    });
    var Quad = {
        init: function(args) {
            function Node(x, y, w, h, depth) {
                this.x = x;
                this.y = y;
                this.w = w;
                this.h = h;
                this.depth = depth;
                this.items = [];
                this.nodes = []
            }

            var c = args.maxChildren || 2,
                d = args.maxDepth || 4;
            Node.prototype = {
                x: 0,
                y: 0,
                w: 0,
                h: 0,
                depth: 0,
                items: null,
                nodes: null,
                exists: function(selector) {
                    for (var i = 0; i < this.items.length; ++i) {
                        var item = this.items[i];
                        if (item.x >= selector.x && item.y >= selector.y && item.x < selector.x + selector.w && item.y < selector.y + selector.h) return true
                    }
                    if (0 != this.nodes.length) {
                        var self = this;
                        return this.findOverlappingNodes(selector, function(dir) {
                            return self.nodes[dir].exists(selector)
                        })
                    }
                    return false;
                },
                retrieve: function(item, callback) {
                    for (var i = 0; i < this.items.length; ++i) callback(this.items[i]);
                    if (0 != this.nodes.length) {
                        var self = this;
                        this.findOverlappingNodes(item, function(dir) {
                            self.nodes[dir].retrieve(item, callback)
                        })
                    }
                },
                insert: function(a) {
                    if (0 != this.nodes.length) {
                        this.nodes[this.findInsertNode(a)].insert(a);
                    } else {
                        if (this.items.length >= c && this.depth < d) {
                            this.devide();
                            this.nodes[this.findInsertNode(a)].insert(a);
                        } else {
                            this.items.push(a);
                        }
                    }
                },
                findInsertNode: function(a) {
                    return a.x < this.x + this.w / 2 ? a.y < this.y + this.h / 2 ? 0 : 2 : a.y < this.y + this.h / 2 ? 1 : 3
                },
                findOverlappingNodes: function(a, b) {
                    return a.x < this.x + this.w / 2 && (a.y < this.y + this.h / 2 && b(0) || a.y >= this.y + this.h / 2 && b(2)) || a.x >= this.x + this.w / 2 && (a.y < this.y + this.h / 2 && b(1) || a.y >= this.y + this.h / 2 && b(3)) ? true : false
                },
                devide: function() {
                    var a = this.depth + 1,
                        c = this.w / 2,
                        d = this.h / 2;
                    this.nodes.push(new Node(this.x, this.y, c, d, a));
                    this.nodes.push(new Node(this.x + c, this.y, c, d, a));
                    this.nodes.push(new Node(this.x, this.y + d, c, d, a));
                    this.nodes.push(new Node(this.x + c, this.y + d, c, d, a));
                    a = this.items;
                    this.items = [];
                    for (c = 0; c < a.length; c++) this.insert(a[c])
                },
                clear: function() {
                    for (var a = 0; a < this.nodes.length; a++) this.nodes[a].clear();
                    this.items.length = 0;
                    this.nodes.length = 0
                }
            };
            var internalSelector = {
                x: 0,
                y: 0,
                w: 0,
                h: 0
            };
            return {
                root: new Node(args.minX, args.minY, args.maxX - args.minX, args.maxY - args.minY, 0),
                insert: function(a) {
                    this.root.insert(a)
                },
                retrieve: function(a, b) {
                    this.root.retrieve(a, b)
                },
                retrieve2: function(a, b, c, d, callback) {
                    internalSelector.x = a;
                    internalSelector.y = b;
                    internalSelector.w = c;
                    internalSelector.h = d;
                    this.root.retrieve(internalSelector, callback)
                },
                exists: function(a) {
                    return this.root.exists(a)
                },
                clear: function() {
                    this.root.clear()
                }
            }
        }
    };
    wjQuery(function() {
        function renderFavicon() {
            if (0 < playerCells.length) {
                redCell.color = playerCells[0].color;
                redCell.setName(playerCells[0].name);
            }
            ctx.clearRect(0, 0, 32, 32);
            ctx.save();
            ctx.translate(16, 16);
            ctx.scale(.4, .4);
            redCell.drawOneCell(ctx);
            ctx.restore();
            var favicon = document.getElementById("favicon"),
                oldfavicon = favicon.cloneNode(true);
            oldfavicon.setAttribute("href", favCanvas.toDataURL("image/png"));
            favicon.parentNode.replaceChild(oldfavicon, favicon)
        }

        var redCell = new Cell(0, 0, 0, 32, "#ED1C24", ""),
            favCanvas = document.createElement("canvas");
        favCanvas.width = 32;
        favCanvas.height = 32;
        var ctx = favCanvas.getContext("2d");
        renderFavicon();

        // Causes stuttering..
        //setInterval(renderFavicon, 1E3);

        setInterval(drawChatBoard, 1E3);
    });
    wHandle.onload = gameLoop
})(window, window.jQuery);
