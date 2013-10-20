/***************
	CLIENT
	2013 Samuel Erb
****************/

/* 
 * 2 implementation notes:
 *	This is currently configured to fail on unreliable connections (see below ~line 438)
 *  This has the function boot_alert undefined. Change these two calls to alert or define boot_alert if needed.
 */
 
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

var room_info_socket = {};

if (is_chrome) {
	var PeerConnection =  window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection;
	var SessionDescription = RTCSessionDescription;
	var iceCanidate = RTCIceCandidate; 
} else {
	if (browser_name == "firefox") {
		var iceCanidate = mozRTCIceCandidate;
		var SessionDescription = mozRTCSessionDescription;
		var PeerConnection = mozRTCPeerConnection;
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
	//console.log('on:'+eventName);
    rtc._events[eventName] = rtc._events[eventName] || [];
    rtc._events[eventName].push(callback);
  };

  rtc.fire = function(eventName, _) {
	//console.log('fire:'+eventName);
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
  rtc.dataChannelConfig = {optional: [ {'DtlsSrtpKeyAgreement': true} ] };


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


  /* send a request for information to the websocket server
   * ... a bit of a hack, but we're going to open a new socket to quickly grab room info
   * REQUIRED: a function called process_room_state(data) to handle cb data
   */
	rtc.room_info = function(server, room) {
	
		// Holds a connection to the server.
		room_info_socket._socket = null;

		room = room || "";
		room_info_socket._socket = new WebSocket(server);

		room_info_socket._socket.onopen = function() {
			room_info_socket._socket.send(JSON.stringify({
				"eventName": "room_info",
				"data":{ "room": room }
			}));
		};
		room_info_socket._socket.onmessage = function(msg) {
			var json = JSON.parse(msg.data);
			/* we can assume the message is recieve_room_info, but check to be sure */
			if (json.eventName == 'receive_room_info'){
				process_room_state(json.data); /* Due to the nature of this call being so early, if you use this, process_room_state must be defined! */
				room_info_socket._socket.close(); /* close this socket as it's only temporary */
			}
		};
		room_info_socket._socket.onclose = function(data) {};
	};
   

  /**
   * Connects to the websocket server.
   */
  rtc.connect = function(server, room, username, encryption) {
    room = room || "";
    rtc._socket = new WebSocket(server);

    rtc._socket.onopen = function() {

      rtc._socket.send(JSON.stringify({
        "eventName": "join_room",
        "data":{
          "room": room,
          "username": username,
		  "encryption": encryption,
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
		
		/* Display warning about room we are entering, only do so for browser name (browser version seems less important atm) */
		if (data.browser != browser_name) {
			boot_alert("Warning!\nThe room you are entering was started by someone with a different browser. You should always match browsers (for now) and try to match major version number:\nYou: " + browser_name + " " + browser_ver + "\nRoom Creator: " + data.browser + " " + data.browserVer + "\n\nTrying to connect now!");
		}
		
		if (data.encryption != encryption_type) {
			boot_alert("Warning!\n The room you are entering was started by someone with a different encryption type.\nYou: "+encryption_type+"\nRoom creator: "+data.encryption);
		}
		
        // fire connections event and pass peers
        rtc.fire('connections', rtc.connections);
        // at this point, our connections are ready, fire ready!
        rtc.fire('ready', data.you, rtc.usernames);
      });

      rtc.on('receive_ice_candidate', function(data) {
        var candidate = new iceCanidate(JSON.parse(data.candidate));
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
		delete rtc.dataChannels[data.socketId];
        delete rtc.usernames[data.socketId];
        delete rtc.peerConnections[data.socketId];
      });

      rtc.on('receive_offer', function(data) {
        rtc.receiveOffer(data.socketId, data.sdp);
        rtc.fire('receive offer', data);
      });

      rtc.on('receive_answer', function(data) {
        rtc.receiveAnswer(data.socketId, JSON.parse(data.sdp));
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
    //console.log("creating peer conn");
    var config;
    if (rtc.dataChannelSupport != rtc_unsupported) {
      config = rtc.dataChannelConfig;
	}
 
	/* create a new peer connection! */
    var pc = rtc.peerConnections[id] = new PeerConnection(rtc.SERVER, config);
	
	
    pc.onicecandidate = function(event) {
		if (event.candidate == null) { return }
		
		//TODO - does chrome want this only after onicecandidate ?? rtc.createDataChannel(id);
		//if (!rtc.dataChannels[id]) {
		//	rtc.createDataChannel(id);
		//}
		
		rtc._socket.send(JSON.stringify({
			"eventName": "send_ice_candidate",
			"data": {
			"label": event.candidate.label,
			"candidate": JSON.stringify(event.candidate),
			"socketId": id
			}
		}));

		rtc.fire('ice candidate', event.candidate);
		//console.log(event.candidate);
		
		

		/* bloody hell chrome, we have to remove this handler as you send a ton of ice canidates & we only need one */
		pc.onicecandidate = null;
     };

    pc.onopen = function() {
      // TODO: Finalize this API
      rtc.fire('peer connection opened');
    };

    pc.onaddstream = function(event) {
      // TODO: Finalize this API
      rtc.fire('add remote stream', event.stream, id);
    };
	
	pc.oniceconnectionstatechange = function(event) {
		console.log("new ICE state:"+event.target.iceConnectionState);
		if (event.target.iceConnectionState == 'connected') {
			can_close = true; /* TODO! - make per channel */
		}
	}

    //if (rtc.dataChannelSupport != rtc_unsupported) {
	  /* this might need to be removed/handled differently if this is ever supported */
      pc.ondatachannel = function (evt) {
        console.log('data channel connecting ' + id);
        rtc.addDataChannel(id, evt.channel); /* ? */
      //};
    }

    return pc;
  };

  rtc.sendOffer = function(socketId) {
    var pc = rtc.peerConnections[socketId];
    
	//console.log('creating offer');
	pc.createOffer( function(session_description) {
		
		//description callback? not currently supported - http://www.w3.org/TR/webrtc/#dom-peerconnection-setlocaldescription
		pc.setLocalDescription(session_description, function() { //console.log('setLocalDescription success');
																}, function(err) { console.error(err); } );

		rtc._socket.send(JSON.stringify({
        "eventName": "send_offer",
        "data":{
            "socketId": socketId,
            "sdp": JSON.stringify(session_description)
            }
        }));
    }, function(e) {
		console.error('createOffer failed ', e);
    });
  };


  rtc.receiveOffer = function(socketId, sdp) {
    var pc = rtc.peerConnections[socketId];
	var sdp_reply = new SessionDescription(JSON.parse(sdp));
    pc.setRemoteDescription(sdp_reply, function () {
		/* setRemoteDescription success */
		//console.log("setRemoteDescription success - calling sendAnswer!");
		rtc.sendAnswer(socketId);
	},function(err){
        console.error(err);
    });
	
  };


  rtc.sendAnswer = function(socketId) {
    var pc = rtc.peerConnections[socketId];
	
    pc.createAnswer( function(session_description) {
	
		pc.setLocalDescription(session_description, function() { 
		
			//console.log('setLocalDescription Success calling send_answer');
			rtc._socket.send(JSON.stringify({
			"eventName": "send_answer",
			"data":{
				"socketId": socketId,
				"sdp": JSON.stringify(session_description)
				}
			}));
		
		},function(err) {console.error(err);});

    }, function(e) {
		console.error('createOffer failed ', e);
    });
  };


  rtc.receiveAnswer = function(socketId, sdp_in) {
    var pc = rtc.peerConnections[socketId];
	var sdp = new SessionDescription(sdp_in);
	
    pc.setRemoteDescription(sdp, function() { //console.log('setRemoteDescription Success');
											},function(err) {console.error(err);});
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
    
    id = pcOrId;
    pc = rtc.peerConnections[pcOrId];

    if (!id) {
      throw new Error ('attempt to createDataChannel with unknown id');
	}
 
    // need a label
    label = label || 'fileTransfer' || String(id);

	if (rtc.dataChannelSupport == reliable_false) {
		return; /* we only support reliability true options = {reliable: false};  */
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
	  channel.binaryType = "arraybuffer";
      console.log('data stream open ' + id);
      console.log(channel);
	  rtc.connection_ok_to_send[id] = true;
      rtc.fire('data stream open', id, rtc.usernames[id]);
    };

    channel.onclose = function(event) {
      delete rtc.dataChannels[id];
      console.log('data stream close ' + id);
      console.log(event);
      rtc.fire('data stream close', channel);
    };

    channel.onmessage = function(message) {
      //warning - under heavy data usage the following will print out a whole lot
      //console.log('data stream message ' + id + ':'+message);
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
