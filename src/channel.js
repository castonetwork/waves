import "@babel/polyfill";
import "setimmediate";
import initLoadingScreen from "./loadingScreen";
import adapter from "webrtc-adapter";

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

const updateViewerInfo = info => {
  document.getElementById('streamerId').textContent = info.profile && info.profile.nickName;
  document.getElementById('streamerTitle').textContent = info.title;
};
const gotoViewer = info => {
  document.body.setAttribute('data-scene', 'viewer');
  updateViewerInfo(info);
};

const mediaStream = new MediaStream();
const pc = new RTCPeerConnection( { ...configuration, sdpSemantics: 'unified-plan' } );
pc.onicecandidate = event => {
  console.log("[ICE]", event);
  if (event.candidate) {
    sendController.push({
      topic: "sendTrickleCandidate",
      candidate: event.candidate
    });
  }
};
pc.oniceconnectionstatechange = function (e) {
  console.log("[ICE STATUS] ", pc.iceConnectionState);
};
pc.ontrack = async event => {
  console.log("[ON track]", event);
  mediaStream.addTrack(event.track);
};

const playChannel = async peerId => {
  /* initialize mediaStream */
  mediaStream.getTracks().forEach(mediaStream.removeTrack);
  try {
    await pc.setLocalDescription(await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    }));
    sendController.push({
      topic: "sendCreateOffer",
      sdp: pc.localDescription,
      peerId
    });
    console.log("localDescription", pc.localDescription);
  } catch (err) {
    console.error(err);
  }
};
const updateChannelElement = (peerId, info) =>{
  let item = document.getElementById(peerId);
  const updateItemDetails = (item, info) => {
    item.querySelector(".info > .title").textContent = info.title;
    if(info && info.profile){
      item.querySelector(".avatar > .thumbnail").src = info.profile.avatar.image;
      item.querySelector(".info > .streamer").textContent = info.profile.nickName;
    }
    item.querySelector(".channelInfo > .viewer").textContent = "0";
    updateViewerInfo(info);
  }

  if (!item) {
    item = channelItem.cloneNode(true);
    item.setAttribute("id", peerId);
    item.addEventListener("click", async ()=> {
      gotoViewer(info);
      await playChannel(peerId);
    });

    updateItemDetails(item, info);
    document.querySelector(".list").appendChild(item);
    document.body.setAttribute("data-scene", "list");
  } else {
    /* update info */
    updateItemDetails(item, info);
  }
};
const updateChannelSnapshot = (peerId, snapshot) =>{
  let item = document.getElementById(peerId);
  if (item) {
    const itemDom = item.querySelector(".channelInfo");
    itemDom.style.backgroundImage = `url("${snapshot}")`;
    itemDom.style.backgroundSize = "cover";
  }
};

const processEvents = async event => {
  console.log("Incoming event ", event.topic);
  const events = {
    "updateChannelInfo": ({peerId, info})=> {
      console.log("updateChannelInfo", peerId, info);
      updateChannelElement(peerId, info)
    },
    "updateChannelSnapshot": ({peerId, snapshot}) =>{
      updateChannelSnapshot(peerId, snapshot)
    },
    "sendChannelsList": ({channels})=> {
      for (let channel in channels) {
        if (channels[channel]) {
          console.log("GOT iceEER", channels[channel]);
          updateChannelElement(channel, channels[channel])
        }
      }
    },
    "sendTrickleCandidate": ({ice})=> {
      console.log("received iceCandidate");
      pc.addIceCandidate(ice);
    }
  };
  if (events[event.topic]) return events[event.topic](event);
  else {
    return new Promise((resolve, reject) => {
      reject("No processEvent", event.topic);
    });
  }
};

const initApp = async () => {
  let prisms = {};
  console.log("init app");

  /* set list screen */
  document.body.setAttribute('data-scene', 'list')
  /* clone listDOM */
  listDOM = document.querySelector('div.item');
  channelItem = listDOM.cloneNode(true);
  listDOM.remove();

  document.body.setAttribute('data-scene', 'noItem')

  document.querySelector(".exitButton").addEventListener("click",
    () => document.body.setAttribute("data-scene", "list"))

  /* set video srcObject to mediaStream */
  document.getElementById("video").srcObject = mediaStream;
  initLoadingScreen();

  const node = await createNode();
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();

    console.log("Discovered: " + idStr);

    !prisms[idStr] &&
    node.dialProtocol(peerInfo, "/controller", (err, conn) => {
      if (err) {
        return;
      }
      prisms[idStr] = true;
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
        topic: "registerWaveInfo",
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
      if (document.querySelector(".list").children.length===1) {
        document.body.setAttribute("data-scene", "noItem");
      }
      element.remove();
    }
    delete prisms[id];
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
