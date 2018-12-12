const Node = require('./browser-bundle');
const PeerInfo = require('peer-info');
const multiaddr = require('multiaddr');
const createNode = async ()=> new Promise((resolve, reject) => {
  PeerInfo.create((err, peerInfo) => {
    if (err) reject(err);
    peerInfo.multiaddrs.add(multiaddr("/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star/"));
    // peerInfo.multiaddrs.add(multiaddr("/ip4/64.137.231.84/tcp/9090/wss/p2p-websocket-star/"));
    // peerInfo.multiaddrs.add(multiaddr("/ip4/59.10.206.150/tcp/9999/wss/p2p-websocket-star/"));
    const node = new Node({peerInfo});
    resolve(node);
  });
});

module.exports = createNode;
