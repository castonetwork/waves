import "@babel/polyfill";
import "setimmediate";
import {initLoadingScreen, pauseAnimation, resumeAnimation} from "./loadingScreen";
import adapter from "webrtc-adapter";

const pull = require("pull-stream");
const Pushable = require("pull-pushable");
const stringify = require("pull-stringify");
const configuration = {
  iceServers: [{urls: "stun:stun.l.google.com:19302"}]
};

let listDOM, channelItem;
let serviceId;

const createNode = require("./create-node");

const updateViewerInfo = info => {
  document.getElementById('streamerId').textContent = info.profile && info.profile.nickName;
  document.getElementById('streamerTitle').textContent = info.title;
};
const gotoViewer = info => {
  document.body.setAttribute('data-scene', 'viewer');
  updateViewerInfo(info);
};
const gotoList = ()=> {
  document.body.setAttribute("data-scene", "list");
};

const updateChannelSnapshot = (peerId, snapshot) =>{
  let item = document.getElementById(peerId);
  if (item) {
    const itemDom = item.querySelector(".channelInfo>.imagePreview");
    itemDom.src = `${snapshot}`;
  }
};


function checkEmptyList() {
  if (document.querySelector(".list").children.length===0) {
    document.body.setAttribute("data-scene", "noItem");
    resumeAnimation();
  } else {
    pauseAnimation();
  }
}

let selectedFlowPeerId;

const initApp = async () => {
  let prisms = {};
  window.prisms = prisms;
  console.log("init app");
  serviceId = new URL(location.href).searchParams.get('serviceId');

  /* set list screen */
  document.body.setAttribute('data-scene', 'list')
  /* clone listDOM */
  listDOM = document.querySelector('div.item');
  channelItem = listDOM.cloneNode(true);
  listDOM.remove();

  document.body.setAttribute('data-scene', 'noItem')

  document.querySelector(".exitButton").addEventListener("click", gotoList);

  initLoadingScreen();

  const node = await createNode();
  node.on("peer:discovery", peerInfo => {
    // console.log("Discovered: " + prismPeerId);
    const prismPeerId = peerInfo.id.toB58String();
    !prisms[prismPeerId] &&
    node.dialProtocol(peerInfo, `/controller/${serviceId}`, (err, conn) => {
      if (err) {
        return;
      }
      console.log("dialed: ", prismPeerId);

      let sendToPrism = Pushable();
      const mediaStream = new MediaStream();
      prisms[prismPeerId] = {
        isDialed : true,
        pushable : sendToPrism,
        mediaStream
      };


      const playChannel = async (peerId) => {
        /* initialize mediaStream */
        mediaStream.getTracks().forEach(o=>mediaStream.removeTrack(o));
        try {
          let pc = new RTCPeerConnection( { ...configuration, sdpSemantics: 'unified-plan' } );
          prisms[prismPeerId].pc = pc;
          pc.onicecandidate = event => {
            console.log("[ICE]", event);
            if (event.candidate) {
              sendToPrism.push({
                topic: "sendTrickleCandidate",
                candidate: event.candidate
              });
            }
          };
          pc.oniceconnectionstatechange = function (e) {
            console.log("[ICE STATUS] ", pc.iceConnectionState);
            if(pc.iceConnectionState === "disconnected"){
              pc.getTransceivers().forEach(transceiver => transceiver.direction = 'inactive');
            }
          };
          pc.ontrack = async event => {
            console.log("[ON track]", event);
            mediaStream.addTrack(event.track);
          };

          await pc.setLocalDescription(await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          }));
          sendToPrism.push({
            topic: "sendCreateOffer",
            sdp: pc.localDescription,
            peerId
          });
          console.log("localDescription", pc.localDescription);
          /* set video srcObject to mediaStream */
          document.getElementById("video").srcObject = mediaStream;

        } catch (err) {
          console.error(err);
        }
        console.log("playChannel", mediaStream.getTracks());
      };
      const processEvents = async (event) => {
        let pc = prisms[prismPeerId].pc;
        console.log("Incoming event ", event.topic);
        const events = {
          "sendCreatedAnswer": async ({sdp}) => {
            console.log('controller answered', sdp)
            await pc.setRemoteDescription(sdp)
          },
          "updateChannelInfo": ({peerId, info})=> {
            console.log("updateChannelInfo", peerId, info);
            updateChannelElement(peerId, info)
          },
          "updateChannelSnapshot": ({peerId, snapshot}) =>{
            updateChannelSnapshot(peerId, snapshot)
          },
          "updateWaves": ({waves})=>{
            document.getElementById("currentViewerCount").textContent = `Current Viewers ${Object.entries(waves).length}`
          },
          "sendChannelsList": ({channels})=> {
            for (let channel in channels) {
              if (channels[channel]) {
                console.log("GOT iceEER", channels[channel]);
                prisms[prismPeerId].flowPeerId = channel;
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
        };
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
        checkEmptyList();
      };
      pull(
        sendToPrism,
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
      sendToPrism.push({
        topic: "registerWaveInfo",
        peerId: node.peerInfo.id.toB58String()
      })
    });
  });
  node.on("peer:connect", peerInfo => {
    // console.log("connected", peerInfo.id.toB58String())
  });
  node.on("peer:disconnect", peerInfo => {
    const peerId = peerInfo.id.toB58String();
    console.log("disconnected", peerId);
    // if(prisms[peerId]){
    //   const element = document.getElementById(peerId);
    //   if (element) {
    //     element.remove();
    //     checkEmptyList();
    //   }
    //   delete prisms[peerId];
    // }
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
