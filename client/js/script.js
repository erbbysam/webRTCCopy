
/***************
	ROOM INIT & functionality
	(c) 2013 Samuel Erb
****************/

//var PeerConnection = window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection;

/* your username */
var username = "";

/* intro function */
initRTCCopy();

function display_error() {
	if ($.browser.name == "chrome") {
		alert('Your browser is not supported. Please update to the latest version of Chrome to use this site. Recommended: Chrome version 30 or greater.');
	}else if ($.browser.name == "firefox") {
		alert('Your browser is not supported. Please update to the latest version of Firefox to use this site.');
	}else {
		alert('Your browser is not supported. Please use Chrome or Firefox, sorry :(');
	}
}

/* intro function */
function initRTCCopy() {

	var button = document.getElementById("newRoom");

	/* create a new room when button is clicked */ 
	button.addEventListener('click', function(event) {
		var chars = "2345689ABCDEFGHJKMNPQRSTUVWXTZabcdefghkmnpqrstuvwxyz";
		var string_length = 8;//53^8 = 62259690411361, lots of room for everyone!
		var randomstring = '';
		for(var i = 0; i < string_length; i++) {
		  var rnum = Math.floor(Math.random() * chars.length);
		  randomstring += chars.substring(rnum, rnum + 1);
		}

		window.location.hash = randomstring;
		location.reload();
	});
  
	/* initial create room/username logic */
	var r = window.location.hash.slice(1);
	if (r != 0){
		/* existing room, show username input */
		$.colorbox.close(); // hide the colorbox!
		$.colorbox({onLoad: function() {$('#cboxClose').remove();}, href:"#userprompt", inline:true, open:true, overlayClose:false, escKey:false, transition:'none', width:"640px", height:"350px"});
		//$("#userprompt").show();
	} else {
		/* no room number? make a colorbox! */
		$.colorbox({onLoad: function() {$('#cboxClose').remove();}, href:"#roomprompt", inline:true, open:true, overlayClose:false, escKey:false, transition:'none', width:"640px", height:"350px"});
	
		/* allow entering a room number */
		var existing_input = document.getElementById("existing");
		existing_input.addEventListener('keydown', function(event) {
			var key = event.which || event.keyCode;
			if(key === 13) {
				window.location.hash = existing_input.value;
				location.reload();
			}
		}, false);
	}
	
	/* handle username input */
	var username_input = document.getElementById("username");
	username_input.addEventListener('keydown', function(event) {
		var key = event.which || event.keyCode;
		if(key === 13) {
			username = username_input.value;
			$.colorbox.close(); // hide the colorbox!
			init();
			$("#chat_display").show();
		}
	}, false);
	
	/* display & update support messages */
	if (is_chrome && browser_ver >=30) {
		$(".support").append('<br />You are using Chrome version 30 or greater, please make sure "Enable SCTP Data Channels" is enabled in chrome://flags/#enable-sctp-data-channels.');
	}
	
	/* let's run a quick check before we begin to make sure we have rtc datachannel support */
	var rtc_status = rtc.checkDataChannelSupport();
	if (rtc_status == rtc_unsupported) {
		display_error();
	}
	
	/* lets now also set our chunk burst rate (100 for reliable connections, 1(default) for non-reliable) */
	if (rtc_status == reliable_true) {
		set_chunk_burst(100);
	}
}

/* adds to your chat */
function addToChat(msg, color) {
  var messages = document.getElementById('messages');
  msg = sanitize(msg);
  if(color) {
    msg = '<span style="color: ' + color + '; padding-left: 15px">' + msg + '</span>';
  } else {
    msg = '<strong style="padding-left: 15px">' + msg + '</strong>';
  }
  messages.innerHTML = messages.innerHTML + msg + '<br>';
  messages.scrollTop = 10000;
}

/* adds small text to chat */
function systemMessage(msg) {
  var messages = document.getElementById('messages');
  msg = sanitize(msg);
  msg = '<strong class="small" style="padding-left: 15px">' + msg + '</strong>';
  messages.innerHTML = messages.innerHTML + msg + '<br>';
  messages.scrollTop = 10000;
}

/* this isn't actual security, just avoids accidential html input */
function sanitize(msg) {
  return msg.replace(/</g, '&lt;');
}

/* WebRTC functionality */
var dataChannelChat = {
	broadcast: function(message) {
		for(var connection in rtc.dataChannels) {
			var channel = rtc.dataChannels[connection];
			if (rtc.connection_ok_to_send[connection]) {
				channel.send(message);
			} else {
				console.log("unable to send message to " + connection);
			}
		}
	},
	send: function(connection, message) {
		var channel = rtc.dataChannels[connection];
		if (rtc.connection_ok_to_send[connection]) {
			channel.send(message);
		} else {
			console.log("unable to send message to " + connection);
		}
	},
	recv: function(channel, message) {
		return JSON.parse(message).data;
	},
	event: 'data stream data'
};



/* init - starts WebRTC connection, called after username is entered */
function init() {

  if(!PeerConnection) {
	display_error();
	return;
  }
  
  /* the room # is taken from the url */
  var room = window.location.hash.slice(1);
  
  /* Add an entry to the username list at id=0 with your name */
  create_or_clear_container(0,username);
  
  if (room != 0) {
	  
	  /* the important call */
	  rtc.connect("ws:rtccopy.com:8000", room, username); /* TODO: Make wss */

	  /* fire when ready to init chat & communication! */
	  rtc.on('ready', function(my_socket, usernames) {
		
		/* first, print out the usernames in the room */
		var username_arr = [];//convert to array
		for (var x in usernames) {
			if (x != my_socket) {//no reason to print yourself
				username_arr.push(usernames[x]);
			}
		}
		usernames_list = username_arr.join(",");//then join
		$('#pleasewait').hide();
		$('#chatinput').show();//show the text input box now
		accept_inbound_files();
		if (username_arr.length > 0) {
			systemMessage("Other users currently in the room: " + usernames_list);
		} else {
			systemMessage("There are no other users currently in this room!");
		}
	  });
	  
	  /* when a new user's data channel is opened and we are offering a file, tell them */
	  rtc.on('data stream open', function(id, username) {
	    /* add to usernames list */
		create_or_clear_container(id, username);
		/* log a message */
		systemMessage('now connected to ' + username);
		/* if we have a file, send it their way */
		send_meta(id);
	  });
	  
	  /* when another user disconnects */
	  rtc.on('disconnect stream', function(disconnecting_socket, disconnecting_username) {
		systemMessage(disconnecting_username + " has left the room");
		remove_container(disconnecting_socket);
	  });
	  
	  /* start the chat box */
	  initChat();
	  
	  /* add welcome message */
	  var roomname = document.getElementById('roomname');
	  roomname.innerHTML = '<span class="small">room</span> ' + room + ' <span class="small">username</span> ' + username + ' <span class="small">&nbsp;&nbsp;&nbsp;&nbsp;Drag files into the browser to upload to other users in this room or </i>';
  }
}

/* start the chat box */
function initChat() {
  var chat;

  console.log('initializing data channel chat');
  chat = dataChannelChat;
  
  var input = document.getElementById("chatinput");
  var room = window.location.hash.slice(1);
  var color = "#" + ((1 << 24) * Math.random() | 0).toString(16);

  input.addEventListener('keydown', function(event) {
    var key = event.which || event.keyCode;
    if(key === 13) {
      chat.broadcast(JSON.stringify({
        "eventName": "chat_msg",
        "data": {
          "messages": input.value,
          "room": room,
          "color": color
        }
      }));
      addToChat(username+": "+input.value);
      input.value = "";
    }
  }, false);
  
  /* this function is called with every data packet recieved */
  rtc.on(chat.event, function(conn, data, id, username) {
    /* decode and append to data */
    data = chat.recv.apply(this, arguments);
	data.id = id;
	data.username = username;
	
	/* pass data along */
	if (data.messages) {
		/* chat */
		addToChat(data.username+": "+data.messages, data.color.toString(16));
	} else {
		/* data */
	    process_data(data);
	}
  }); 
}

window.onresize = function(event) {
  //onresize - do nothing
};

/* show (C) notice, etc */
function show_question() {
	$.colorbox({href:"#show_question", inline:true, open:true, transition:'none', width:"640px", height:"300px"});
}
