//CLIENT
//(c) 2013 Samuel Erb
 
/* Fallbacks for vendor-specific variables until the spec is finalized.
 * Going to use jquery.browser to detect major version # (to help compatibiliity
 * and to allow later versions of chrome to support stateful connections).
 */
var is_chrome = $.browser.chrome;
var browser_name = $.browser.name;
var browser_ver = $.browser.versionNumber;

var rtc_unsupported = 0;
var reliable_false  = 1;
var reliable_true   = 2;

if (is_chrome) {
	var PeerConnection =  window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection;
} else {
	if (browser_name == "firefox") {
		var PeerConnection = mozRTCPeerConnection;
	}
}
if (is_chrome) {
	var SessionDescription = RTCSessionDescription;
} else {
	if (browser_name == "firefox") {
		var SessionDescription = mozRTCSessionDescription;
	}
}


(function() {

  var rtc;
  if ('undefined' === typeof module) {
    rtc = this.rtc = {};
  } else {
    rtc = module.exports = {};
  }


  // Holds a connection to the server.
  rtc._socket = null;

  // Holds identity for the client
  rtc._me = null;

  // Holds callbacks for certain events.
  rtc._events = {};

  rtc.on = function(eventName, callback) {
    rtc._events[eventName] = rtc._events[eventName] || [];
    rtc._events[eventName].push(callback);
  };

  rtc.fire = function(eventName, _) {
    var events = rtc._events[eventName];
    var args = Array.prototype.slice.call(arguments, 1);

    if (!events) {
      return;
    }

    for (var i = 0, len = events.length; i < len; i++) {
      events[i].apply(null, args);
    }
  };

  // Holds the STUN/ICE server to use for PeerConnections.
  rtc.SERVER = {iceServers:[{url:"stun:stun.l.google.com:19302"}]};

  // Reference to the lone PeerConnection instance.
  rtc.peerConnections = {};

  // Array of known peer socket ids
  rtc.connections = [];
  // Array that says if this connect is OK to send data over, otherwise an error will likely occur
  rtc.connection_ok_to_send = [];
  // Array of usernames, indexed by socket id
  rtc.usernames = [];
  // Stream-related variables.
  rtc.streams = [];


  // Reference to the data channels
  rtc.dataChannels = {};

  // PeerConnection datachannel configuration
  rtc.dataChannelConfig = {optional: [ {RtpDataChannels: true} ] };


  /* returns what is supported by trying reliable first, then unreliable */
  rtc.checkDataChannelSupport = function() {
	
	try {
      /* first try reliable */
      var pc = new PeerConnection(rtc.SERVER, rtc.dataChannelConfig);
      channel = pc.createDataChannel('supportCheck', {reliable: true}); 
      channel.close();
	  console.log('data channel reliability set to true!');
      return reliable_true;
    } catch(e) {	
		try {
		  /* then unreliable */
		  var pc = new PeerConnection(rtc.SERVER, rtc.dataChannelConfig);
		  channel = pc.createDataChannel('supportCheck', {reliable: false}); 
		  channel.close();
		  console.log('data channel reliability set to false!');
		  return reliable_false;
		} catch(e) {
		  /* then fail :( */
		  return rtc_unsupported;
		}
	}
  };

  rtc.dataChannelSupport = rtc.checkDataChannelSupport();

  /**
   * Connects to the websocket server.
   */
  rtc.connect = function(server, room, username) {
    room = room || "";
    rtc._socket = new WebSocket(server);

    rtc._socket.onopen = function() {

      rtc._socket.send(JSON.stringify({
        "eventName": "join_room",
        "data":{
          "room": room,
          "username": username,
		  "encryption": "none",
		  "browser": browser_name,
		  "browserVer": browser_ver
        }
      }));

      rtc._socket.onmessage = function(msg) {
        var json = JSON.parse(msg.data);
        rtc.fire(json.eventName, json.data);
      };

      rtc._socket.onerror = function(err) {
        console.error('onerror');
        console.error(err);
      };

      rtc._socket.onclose = function(data) {
        rtc.fire('disconnect stream', rtc._socket.id);
        delete rtc.peerConnections[rtc._socket.id];
      };

      rtc.on('get_peers', function(data) {
        console.log("get_peers");
		console.log(data);
        rtc.connections = data.connections;
        rtc.usernames = data.usernames;
        rtc._me = data.you;
		
		/* Display warning about room we are entering */
		if (data.browser != browser_name || data.browserVer != browser_ver) {
			alert("Warning!\nThe room you are entering was started by someone with a different browser. You should always match browsers (for now) and try to match major version number:\nYou: " + browser_name + " " + browser_ver + "\nRoom Creator: " + data.browser + " " + data.browserVer + "\n\nTrying to connect now!");
		}
		
        // fire connections event and pass peers
        rtc.fire('connections', rtc.connections);
        // at this point, our connections are ready, fire ready!
        rtc.fire('ready', data.you, rtc.usernames);
      });

      rtc.on('receive_ice_candidate', function(data) {
        var candidate = new RTCIceCandidate(data);
        rtc.peerConnections[data.socketId].addIceCandidate(candidate);
        rtc.fire('receive ice candidate', candidate);
      });

      rtc.on('new_peer_connected', function(data) {
        //add username
        console.log(data.username+" has joined the room.");
        rtc.usernames[data.socketId] = data.username;
        
        //add socket and create streams
        rtc.connections.push(data.socketId);
        var pc = rtc.createPeerConnection(data.socketId);
        for (var i = 0; i < rtc.streams.length; i++) {
         var stream = rtc.streams[i];
          pc.addStream(stream);
        }
      });

      rtc.on('remove_peer_connected', function(data) {
	    rtc.connection_ok_to_send[data.socketId] = false;
        rtc.fire('disconnect stream', data.socketId, rtc.usernames[data.socketId]);
        delete rtc.usernames[data.socketId];
        delete rtc.peerConnections[data.socketId];
      });

      rtc.on('receive_offer', function(data) {
        rtc.receiveOffer(data.socketId, data.sdp);
        rtc.fire('receive offer', data);
      });

      rtc.on('receive_answer', function(data) {
        rtc.receiveAnswer(data.socketId, data.sdp);
        rtc.fire('receive answer', data);
      });

      rtc.fire('connect');
    };
  };


  rtc.sendOffers = function() {
    for (var i = 0, len = rtc.connections.length; i < len; i++) {
      var socketId = rtc.connections[i];
      rtc.sendOffer(socketId);
    }
  };

  rtc.onClose = function(data) {
    rtc.on('close_stream', function() {
      rtc.fire('close_stream', data);
    });
  };

  rtc.createPeerConnections = function() {
    for (var i = 0; i < rtc.connections.length; i++) {
      rtc.createPeerConnection(rtc.connections[i]);
      console.log(rtc.connections[i]);
    }
  };

  rtc.createPeerConnection = function(id) {
    console.log("creating peer conn");
    var config;
    if (rtc.dataChannelSupport != rtc_unsupported) {
      config = rtc.dataChannelConfig;
	}
 
    var pc = rtc.peerConnections[id] = new PeerConnection(rtc.SERVER, config);
    pc.onicecandidate = function(event) {
      if (event.candidate) {
         rtc._socket.send(JSON.stringify({
           "eventName": "send_ice_candidate",
           "data": {
              "label": event.candidate.label,
              "candidate": event.candidate.candidate,
              "socketId": id
           }
         }));
       }
       rtc.fire('ice candidate', event.candidate);
     };

    pc.onopen = function() {
      // TODO: Finalize this API
      rtc.fire('peer connection opened');
    };

    pc.onaddstream = function(event) {
      // TODO: Finalize this API
      rtc.fire('add remote stream', event.stream, id);
    };

    if (rtc.dataChannelSupport != rtc_unsupported) {
      pc.ondatachannel = function (evt) {
        console.log('data channel connecting ' + id);
        rtc.addDataChannel(id, evt.channel);
      };
    }

    return pc;
  };
  
  /* SUPER HACK! (for chrome)
   * https://github.com/Peer5/ShareFest/blob/master/public/js/peerConnectionImplChrome.js#L201
   * https://github.com/Peer5/ShareFest/issues/10
   * This is a wicked impressive hack, lovingly taken from ShareFest
   * This function should retain the following copyright per the apache 2.0 license:
   * https://github.com/Peer5/ShareFest/blob/master/LICENSE 
   */
    rtc. transformOutgoingSdp = function (sdp) {
        var splitted = sdp.split("b=AS:30");
        var newSDP = splitted[0] + "b=AS:1638400" + splitted[1];
        return newSDP;
    };

  rtc.sendOffer = function(socketId) {
    var pc = rtc.peerConnections[socketId];
    
	pc.createOffer( function(session_description) {
	if (is_chrome) {
		session_description.sdp = rtc.transformOutgoingSdp(session_description.sdp);
	}
	
	//description callback? not currently supported - http://www.w3.org/TR/webrtc/#dom-peerconnection-setlocaldescription
    pc.setLocalDescription(session_description);
    rtc._socket.send(JSON.stringify({
        "eventName": "send_offer",
        "data":{
            "socketId": socketId,
            "sdp": session_description
            }
        }));
    }, function(e) {
		console.log('createOffer failed', e);
    });
  };


  rtc.receiveOffer = function(socketId, sdp) {
    var pc = rtc.peerConnections[socketId];
    pc.setRemoteDescription(new SessionDescription(sdp));
    rtc.sendAnswer(socketId);
  };


  rtc.sendAnswer = function(socketId) {
    var pc = rtc.peerConnections[socketId];
	
    pc.createAnswer( function(session_description) {
	if (is_chrome) {
		session_description.sdp = rtc.transformOutgoingSdp(session_description.sdp);
	}
    pc.setLocalDescription(session_description);
    rtc._socket.send(JSON.stringify({
        "eventName": "send_answer",
        "data":{
            "socketId": socketId,
            "sdp": session_description
            }
        }));
    var offer = pc.remoteDescription;
    }, function(e) {
		console.log('createOffer failed', e);
    });
  };


  rtc.receiveAnswer = function(socketId, sdp) {
    var pc = rtc.peerConnections[socketId];
    pc.setRemoteDescription(new SessionDescription(sdp));
  };

  rtc.addStreams = function() {
    for (var i = 0; i < rtc.streams.length; i++) {
      var stream = rtc.streams[i];
      for (var connection in rtc.peerConnections) {
        rtc.peerConnections[connection].addStream(stream);
      }
    }
  };

  rtc.attachStream = function(stream, domId) {
    document.getElementById(domId).src = window.URL.createObjectURL(stream);
  };


  rtc.createDataChannel = function(pcOrId, label) {
    if (rtc.dataChannelSupport == rtc_unsupported) {
      alert('webRTC data channel is not yet supported in this browser,' +
            ' or you must turn on experimental flags');
      return;
    }
    
    id = pcOrId;
    pc = rtc.peerConnections[pcOrId];

    if (!id) {
      throw new Error ('attempt to createDataChannel with unknown id');
	}
 
    // need a label
    label = label || 'fileTransfer' || String(id);

	if (rtc.dataChannelSupport == reliable_false) {
		options = {reliable: false}; /* we only support reliability false */
	}else{
		options = {reliable: true}; /* reliability true!! */
    }
	
    try {
      console.log('createDataChannel ' + id);
      channel = pc.createDataChannel(label, options);
    } catch (error) {
      console.log('seems that DataChannel is NOT actually supported!');
      throw error;
    }

    return rtc.addDataChannel(id, channel);
  };

  rtc.addDataChannel = function(id, channel) {

    channel.onopen = function() {
      console.log('data stream open ' + id);
	  rtc.connection_ok_to_send[id] = true;
      rtc.fire('data stream open', id, rtc.usernames[id]);
    };

    channel.onclose = function(event) {
      delete rtc.dataChannels[id];
      console.log('data stream close ' + id);
      rtc.fire('data stream close', channel);
    };

    channel.onmessage = function(message) {
      //warning - under heavy data usage the following will print out a whole lot
      //console.log('data stream message ' + id);
      //pass along the channel id & username
      rtc.fire('data stream data', channel, message.data, id, rtc.usernames[id]);
    };

    channel.onerror = function(err) {
      console.log('data stream error ' + id + ': ' + err);
      rtc.fire('data stream error', channel, err);
    };

    // track dataChannel
    rtc.dataChannels[id] = channel;
    return channel;
  };

  rtc.addDataChannels = function() {
	if (rtc.dataChannelSupport == rtc_unsupported) {
		return;
	}

	for (var connection in rtc.peerConnections) {
		rtc.createDataChannel(connection);
	}
  };


  rtc.on('ready', function() {
    rtc.createPeerConnections();
    rtc.addStreams();
    rtc.addDataChannels();
    rtc.sendOffers();
  });

}).call(this);
