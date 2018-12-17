import "@babel/polyfill";
import "setimmediate";

const pull = require("pull-stream");
const Pushable = require("pull-pushable");
const stringify = require("pull-stringify");
const configuration = {
  iceServers: [{urls: "stun:stun.l.google.com:19302"}]
};

let sendController = Pushable();
let listDOM, channelItem;
window.pull = pull;
const createNode = require("./create-node");

const gotoViewer = (info) => {
  document.body.setAttribute('data-scene', 'viewer')
  document.getElementById('streamerId').textContent = info.profile.nickName;
  document.getElementById('streamerTitle').textContent = info.title;
}

const updateChannelElement = (peerId, info) =>{
  let item = document.getElementById(peerId);
  if (!item) {
    item = channelItem.cloneNode(true);
    item.setAttribute("id", peerId);
    item.addEventListener("click", e => {
      console.log("send request OFFER");
      gotoViewer(info);
      sendController.push({
        type: "requestOfferSDP",
        streamerId : peerId
      });
    });
    
    item.querySelector(".info > .title").textContent = info.title;
    if(info && info.profile){
      item.querySelector(".avatar > .thumbnail").src = info.profile.avatar.image;
      item.querySelector(".info > .streamer").textContent = info.profile.nickName;
    }
    item.querySelector(".channelInfo > .viewer").textContent = "0";
    document.querySelector("dl").appendChild(item);
    document.body.setAttribute("data-scene", "list");
  } else {
    /* update info */

  }
}
const updateChannelSnapshot = (peerId, snapshot) =>{
  let item = document.getElementById(peerId);
  if (item) item.querySelector(".channelInfo").style.backgroundImage = `url("${snapshot}")`;
}

const processEvents = async event => {
  console.log("processEvents");
  console.log(event.type);
  const events = {
    "updateChannelInfo": ({peerId, info})=> {
      console.log("updateChannelInfo", peerId, info);
      updateChannelElement(peerId, info)
    },
    "updateChannelSnapshot": ({peerId, snapshot}) =>{
      updateChannelSnapshot(peerId, snapshot)
    },
    "responseOfferSDP": async ({jsep}) => {
      let pc = new RTCPeerConnection(configuration);

      pc.onicecandidate = event => {
        console.log("[ICE]", event);
        if (event.candidate) {
          sendController.push({
            type: "sendTrickleCandidate",
            candidate: event.candidate
          });
        }
      };

      pc.oniceconnectionstatechange = function (e) {
        console.log("[ICE STATUS] ", pc.iceConnectionState);
      };
      pc.ontrack = async event => {
        console.log("[ON track]", event);
        document.getElementById("video").srcObject = event.streams[0];
      };

      try {
        await pc.setRemoteDescription(jsep);
        await pc.setLocalDescription(await pc.createAnswer());
        sendController.push({
          type: "sendCreateAnswer",
          jsep: pc.localDescription
        });
        console.log("localDescription", pc.localDescription);
      } catch (err) {
        console.error(err);
      }
    },
    "sendChannelList": ({peers})=> {
      for (let peer in peers) {
        if (peers[peer] && peers[peer].roomInfo) {
          console.log("GOT PEER", peers[peer].roomInfo);
          updateChannelElement(peer, peers[peer])
        }
      }
    }
  };
  if (events[event.type]) return events[event.type](event);
  else {
    return new Promise((resolve, reject) => {
      reject("No processEvent", event.type);
    });
  }
};

const initLoadingScreen = ()=> {
  var svgEl = document.querySelector('.animated-lines');

  var randomRange = function(min, max) {
    return ~~(Math.random() * (max - min + 1)) + min
  };

  var numberOfLines = 20,
    lineDataArr = [];

  var createPathString = function() {

    var completedPath = '',
      comma = ',',
      ampl = 50; // pixel range from 0, aka how deeply they bend

    for (var i = 0; i < numberOfLines; i++) {

      var path = lineDataArr[i];

      var current = {
        x: ampl * Math.sin(path.counter / path.sin),
        y: ampl * Math.cos(path.counter / path.cos)
      };

      var newPathSection = `M${path.startX}${comma}${path.startY} 
        Q${path.pointX}${comma}${(current.y * 1.5).toFixed(3)}
        ${((current.x) / 10 + path.centerX).toFixed(3)}${comma}${((current.y) / 5 + path.centerY).toFixed(3)}
        T${path.endX}${comma}${path.endY}`;
      path.counter++;

      completedPath += newPathSection;

    };

    return completedPath;

  };

  var createLines = function() {

    var newPathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path'),
      // higher is slower
      minSpeed = 85,
      maxSpeed = 150;

    // create an arr which contains objects for all lines
    // createPathString() will use this array
    for (var i = 0; i < numberOfLines; i++) {

      var lineDataObj = {
        counter: randomRange(1, 500), // a broad counter range ensures lines start at different cycles (will look more random)
        startX: randomRange(-5, -40),
        startY: randomRange(-5, -30),
        endX: randomRange(200, 220), // viewbox = 200
        endY: randomRange(120, 140), // viewbox = 120
        sin: randomRange(minSpeed, maxSpeed),
        cos: randomRange(minSpeed, maxSpeed),
        pointX: randomRange(30, 55),
        centerX: randomRange(90, 120),
        centerY: randomRange(60, 70)
      }

      lineDataArr.push(lineDataObj)

    }

    var animLoop = function() {
      newPathEl.setAttribute('d', createPathString());
      requestAnimationFrame(animLoop);
    }

    // once the path elements are created, start the animation loop
    svgEl.appendChild(newPathEl);
    svgEl.viewBox.baseVal.width = 200;
    svgEl.viewBox.baseVal.height = 120;
    animLoop();

  };

  createLines();
};
const initApp = async () => {
  let streamers = {};
  console.log("init app");

  /* set list screen */
  document.body.setAttribute('data-scene', 'list')
  /* clone listDOM */
  listDOM = document.querySelector('dd.item');
  channelItem = listDOM.cloneNode(true);
  listDOM.remove();

  document.body.setAttribute('data-scene', 'noItem')
  initLoadingScreen();

  const node = await createNode();
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();

    console.log("Discovered: " + idStr);

    !streamers[idStr] &&
    node.dialProtocol(peerInfo, "/controller", (err, conn) => {
      if (err) {
        return;
      }
      streamers[idStr] = true;
      pull(
        sendController,
        stringify(),
        conn,
        pull.map(o => window.JSON.parse(o.toString())),
        pull.drain(async o => {
          try {
            await processEvents(o);
          } catch(e) {
            console.error("[event]", e);
          } finally {
          }
        })
      );
      sendController.push({
        type: "requestPeerInfo",
        peerId: node.peerInfo.id.toB58String()
      })
    });
  });
  node.on("peer:connect", peerInfo => {
    console.log("connected", peerInfo.id.toB58String())
  });
  node.on("peer:disconnect", peerInfo => {
    const id = peerInfo.id.toB58String();
    console.log("disconnected", id);
    const element = document.getElementById(id);
    if (element) {
      if (document.querySelector("dl").children.length===1) {
        document.body.setAttribute("data-scene", "noItem");
      }
      element.remove();
    }
    delete streamers[id];
  });
  node.start(err => {
    if (err) throw err;
    console.log("node is ready", node.peerInfo.id.toB58String());
    console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
  });
  node.on("peer", peerInfo => {
    console.log("peer-discovery", peerInfo.id.toB58String());
  })
};
initApp();
