'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var firstFlag = false;
var mySocketId;

var pcConfig = {
  'iceServers': [{
    'url': 'stun:stun.l.google.com:19302'
  }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true
  }
};

var pcPool = new Map();

// navigator.getUserMedia = navigator.getUserMedia ||
//                          navigator.webkitGetUserMedia ||
//                          navigator.mozGetUserMedia;

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room, serverSocketId) {
  console.log('Created room ' + room);
  isInitiator = true;
  firstFlag = true;
  mySocketId = serverSocketId;
  console.log('after Create Room mySocketId=' + mySocketId);
  createLocalStream();
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room, socketId){
  console.log('join socketId:' + socketId);
  console.log('Another peer made a request to join room ' + room);

  isChannelReady = true;
  // maybeStart();
  if(firstFlag) {
    startPeerConnect(socketId);
  }
});

socket.on('joined', function(room, serverSocketId) {
  console.log('joined: ' + room);
  isChannelReady = true;
  mySocketId = serverSocketId;
  console.log('after join Room mySocketId=' + mySocketId);
  // maybeStart();
});

socket.on('ready', function(room) {
  console.log('room ' + room + " ready to start peerConnection");
  // maybeStart();
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});


////////////////////////////////////////////////
function sendMessage(message, type, toSocketId) {
  if(!toSocketId) {
    toSocketId = 0;
  }
  var messageObj = {'type':type, 'entity': message , 'socketId':mySocketId, 'toSocketId':toSocketId};
  socket.emit('message', messageObj);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  console.error("message from " + message.socketId);
  
  var messageSocketId = message.socketId;
  var targetSocketId = message.toSocketId;
  if(targetSocketId !== 0 && targetSocketId !== mySocketId) {
      console.log('message:', message, 'not for me:', mySocketId);
      return;
  }

  if (message === 'got user media') {
    // maybeStart();

  } else if (message.type === 'offer') {
    
    startPeerConnect(messageSocketId);
    console.log(pcPool.get(messageSocketId));
    var socketPc = pcPool.get(messageSocketId);
console.log("receive offer from peer");
console.log("socketId=", messageSocketId, "socketPc:", socketPc); 
    console.log(message.entity);
    socketPc.setRemoteDescription(message.entity);
    doAnswer(socketPc, messageSocketId);

  } else if (message.type === 'answer') {

    var socketPc = pcPool.get(messageSocketId);
    console.log("receive answer from " + messageSocketId);
    console.log(message.entity);
    console.log("set remote desctiption");
    console.log("socketId=", message.socketId, "socketPc:", socketPc);
    socketPc.setRemoteDescription(message.entity);

  } else if (message.type === 'candidate') {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.entity.label,
      candidate: message.entity.candidate
    });
    var socketPc = pcPool.get(message.socketId);
    socketPc.addIceCandidate(candidate);
  } else if (message.type === 'text' && message.entity === 'bye') {
    handleRemoteHangup(message.socketId);
  } 
});

function replyOfferDescription(sessionDescription, socketId) {
  var replyMsg = {'type':'replysdp', 'sdp': sessionDescription , 'socketId':socketId};
  sendMessage(replyMsg);
}

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');



function createLocalStream() {
  // first user video 
  console.log('firstFlag:' + firstFlag);
  if( firstFlag ) {
      
      console.log('first User to start UserMedia');

      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true
      })
    .then(gotStream)
    .catch(function(e) {
      alert('getUserMedia() error: ' + e.name);
    });
  }
}


function gotStream(stream) {
  console.log('Adding local stream.');
  localVideo.src = window.URL.createObjectURL(stream);
  localStream = stream;
  //sendMessage('got user media');
  // if (isInitiator) {
  //   maybeStart();
  // }
}

var constraints = {
  video: true
};

console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

function startPeerConnect(socketId) {
  console.log('createConnect with socket:' + socketId);
  if(pcPool.get(socketId)) {
    console.log("connection exist");
  }
  var socketPc = new RTCPeerConnection(null);
  socketPc.onicecandidate = handleIceCandidate;
  socketPc.ontrack = handleRemoteStreamAdded;
  socketPc.onremovestream = handleRemoteStreamRemoved;
  console.error('Created RTCPeerConnnection: ' + socketId);

  if(typeof localStream !== 'undefined') {
    socketPc.addStream(localStream);
  }

  // add peerconnection to user
  pcPool.set(socketId,socketPc);

  if(firstFlag) {
     socketPc.createOffer(function(offer) {

      // Set Opus as the preferred codec in SDP if Opus is present.
      //  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
      socketPc.setLocalDescription(offer);
      console.log('setLocalAndSendMessage sending message', offer);
      sendMessage(offer, 'offer', socketId);

    }, handleCreateOfferError);
  }
 

}


window.onbeforeunload = function() {
  sendMessage( 'bye', 'text');
};


function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    var candidate = {
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    };
    sendMessage(candidate, 'candidate');
  } else {
    console.log('End of candidates.');
  }
}


function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}


//send answer description to offer socketId
function doAnswer(socketPc, toSocketId) {
  console.log('Sending answer to peer.');
  socketPc.createAnswer().then( function(answer) {
    socketPc.setLocalDescription(answer);
    sendMessage(answer, 'answer', toSocketId);
  },
    onCreateSessionDescriptionError
  );
}

//after reply description
function handleLocalDescription(sessionDescription, socketId) {
  pcPool.get(socketId).setLocalDescription(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added. event ', event.streams);
  remoteVideo.src = window.URL.createObjectURL(event.streams[0]);
  remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye', 'text');
}

function handleRemoteHangup(socketId) {
  console.log('Session terminated.');
  stop(socketId);
  isInitiator = false;
}

function stop(socketId) {
  isStarted = false;
  // isAudioMuted = false;
  // isVideoMuted = false;
  if(!socketId) {
    //clear all pc
    console.log('need to clear all peerConnection');
  }
  if(socketId && pcPool.get(socketId)) {
    pcPool.get(socketId).close();
    pcPool.get(socketId) = null;  
  } 
  
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('m=audio') !== -1) {
      mLineIndex = i;
      break;
    }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
          opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length - 1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}
