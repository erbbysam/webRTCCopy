
/***************
	FILE TRANSACTIONS
	
	Copyright 2013 Samuel Erb

	This file is part of webRTCCopy.

	webRTCCopy is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	webRTCCopy is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.

	You should have received a copy of the GNU General Public License
	along with webRTCCopy.  If not, see <http://www.gnu.org/licenses/>.

	http://www.tldrlegal.com/license/gnu-general-public-license-v3-(gpl-3)
	
****************/

window.requestFileSystem = window.requestFileSystem ||
                           window.webkitRequestFileSystem;
window.URL = window.URL || window.webkitURL;

/* sending functionality, only allow 1 file to be sent out at a time */
this.chunks = {};
this.meta = {};
this.numOfChunksInFile = 10; /* set to some arbitrarily low number for right now */

function get_chunk_size() {
	if (is_chrome) {
		/* chrome can only queue up a smaller packet. This is the only way atm I can see to garuntee
		   SCTP queue is empty before trying to send again (SCTP queue being too full results in 
		   failure to send). */
		 
		 if (encryption_type != "NONE") {
			/* encrypted size - expands after base64 conversion neccessary for RC4Drop cipher */
			return 30000;
		} else {
			/* no encryption size */
			
			return 100000; /* this seems to maximize our TPut without causing failure :) - https://code.google.com/p/webrtc/issues/detail?id=2270 */
		}
	} else {
		/* We don't want to make this infinite b/c we don't want to risk crashing the sending browser by loading a huge arraybuffer into memory.
		 * This is espcially true on the FF recieving side as well b/c filesystem is not supported there so we can't write to file :( 
		 * Also, the browser kind of hangs when sending a huge file.
		 */
		return 1000000; /* ~1MB - FF can support larger transfers now :) */
	}
}

this.timeout = 1000; /* time before resending request for next chunk */
this.chunk_time_between = 100; /* UNSUPPORTED currently it appears - time between checking if chunk has emptied out of sctp data queue */

/* Used in Chrome to handle larger files (and firefox with idb.filesystem.js) */
window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
var file_to_upload;    /* "pointer" to external file */
var fs = [];           /* hold our filesystems for download files (Chrome only atm) */
var saved_fileEntry = []; /* holds temporary fileEntry's during last encryption hash check */

/* recieving functionality, allow multiple at the same time! */
this.downloading = [];
this.recieved_chunks = []; //not currently used
this.recieved_meta = [];


/* stop the uploading! */
function upload_stop() {
	/* remove data */
	this.chunks = {};
	this.meta = {};
	
	/* send a kill message */
	dataChannelChat.broadcast(JSON.stringify({
		"eventName": "kill_msg",
		"data": {
			"kill": true
		}
	}));
	
	/* also clear the container */
	create_or_clear_container(0,username);
	
	/* firefox and chrome specific I think, but clear the file input */
	document.getElementById('select_file').value='';
}

/* write a peice of a file to a file on the filesystem... allows for unlimited file size!
 * FF does have a limitation in that we cannot load files directly out of idb.filesystem.js, we must first load them into RAM :(
 */
function write_to_file(user_id, user_username, chunk_data, chunk_num, hash) {
/* massive thanks to http://stackoverflow.com/questions/10720704/filesystem-api-upload-from-local-drive-to-local-filesystem */
	fs[user_id].root.getFile(
		this.recieved_meta[user_id].name,
		{ create: true },
		function(fileEntry) {
			// create a writer that can put data in the file
			fileEntry.createWriter(function(writer) {
				writer.onwriteend = function() {
					// request the next chunk
					request_chunk(user_id, chunk_num+1, hash);
				};
				writer.onerror = FSerrorHandler;

				// this will read the contents of the current file
				var builder = new Blob([chunk_data], [this.recieved_meta[user_id].type]);
				writer.seek(chunk_num * get_chunk_size());
				//console.log('recived: '+_arrayBufferToBase64(chunk_data));
				writer.write(builder);
				if (recieved_meta[user_id].numOfChunksInFile == (chunk_num + 1)) {
					console.log("done downloading file!");
						
					/* stop accepting file info */
					this.downloading[user_id] = false;
					
					/* on encrypted completion here, send hash back to other user who verifies it, then sends the OK to finish back */
					if (encryption_type != "NONE") {
						saved_fileEntry[user_id] = fileEntry;
						request_chunk(user_id, chunk_num+1, hash); /* this chunk doesn't exist, but we need the hash of the last chunk to be verified */
					} else {
						if (is_chrome) {
							create_file_link (recieved_meta[user_id], user_id, user_username, fileEntry);
						} else {
							/* one little idb.filesystem.js quirk */
							fileEntry.file(function(file) { 
								create_file_link (recieved_meta[user_id], user_id, user_username, file); /* <-- file, not fileEntry */
							});
						}
					}
				}
			}, FSerrorHandler);
		}, FSerrorHandler);
}

/* delete a file - should be called when cancel is requested or kill is called */
function delete_file(user_id) {
	if (fs[user_id]) {
		fs[user_id].root.getFile(this.recieved_meta[user_id].name, {create: false}, function(fileEntry) {
			fileEntry.remove(function() {
				console.log('File removed.');
			}, FSerrorHandler);
		}, FSerrorHandler);
	}
	
}

/* process local inbound files */
function process_inbound_files(file) {

	file_to_upload = file;
	
	this.meta.name = file.name;
	this.meta.size = file.size;
	this.meta.filetype = file.type;
	this.numOfChunksInFile = Math.ceil(file.size / get_chunk_size());
	this.meta.numOfChunksInFile = numOfChunksInFile;
	console.log(this.meta);
	
	send_meta();
	systemMessage("file ready to send");
	/* user 0 is this user! */
	create_upload_stop_link(file_to_upload.name, 0, username);
}


/* Document bind's to accept files copied. Don't accept until we have a connection */
function accept_inbound_files() {

	$(document).bind('drop dragover dragenter', function (e) {
		// TODO: CSS signal?
		e.preventDefault();
	});

	/* drop a file on the page! */
	$(document).bind('drop', function (e) {
		var file = e.originalEvent.dataTransfer.files[0];
		
		/* firefox and chrome specific I think, but clear the file input */
		document.getElementById('select_file').value='';
	
		process_inbound_files(file);
	});
	
	document.getElementById('select_file').addEventListener('change', function(e) {
		if (e.target.files.length == 1) {
			var file = e.target.files[0];
			process_inbound_files(file);
		}
	}, false);
}

function send_chunk_if_queue_empty(id, chunk_num, rand, hash) {
	
	if ( chunk_num > this.meta.numOfChunksInFile) { /* allow numOfChunksInFile+1 in for last encrpytion hash verification */
		return;
	}
	
	/* we have to wait for the sctp buffer to clear out */
	if (rtc.dataChannels[id].bufferedAmount == 0) {
		sendchunk(id, chunk_num, rand, hash);
		//setTimeout(send_chunk_if_queue_empty(id, chunk_num + 1), this.chunk_time_between);
	} else {
		/* if this was supported, we wouldn't have to do this by waiting for the other side to send us back notificaiton */
		console.log("Waiting to send, bufferedAmount = ".rtc.dataChannels[id].bufferedAmount);
		setTimeout(function(){send_chunk_if_queue_empty(id, chunk_num, rand, hash);}, this.chunk_time_between);
	}
}


/* inbound - recieve binary data (from a file)
 * we are going to have an expectation that these packets arrive in order (requires reliable datachannel)
 */
function process_binary(id,message,hash) {
	if (!this.downloading[id]) {
		return;
	}

	if (0) { 
		//THIS IS DEAD CODE - it is used to save chunks into an array, something we don't have to do anymore!
		// save it 
		/*this.recieved_chunks[id][this.recieved_chunks[id].length] = message; // save it as a uint8Array so we can easily convert it to a blob later :)
		
		// request next if we have to 
		if (this.recieved_meta[id].numOfChunksInFile > this.recieved_chunks[id].length) {
			// update the cointainer %
			update_container_percentage(id, rtc.usernames[id], this.recieved_chunks[id].length - 1, this.recieved_meta[id].numOfChunksInFile, this.recieved_meta[id].size);
			request_chunk(id, this.recieved_chunks[id].length);
		} else {
			console.log("done downloading file!");
			// stop accepting file info 
			this.downloading[id] = false;
			// now combine the chunks and form a link! - only if not chrome 
			for (var i = 0; i < this.recieved_meta[id].numOfChunksInFile; i++) {
				if (this.recieved_chunks[id][i] == ''){
					console.log("missing chunk! " + i);
				} 
				this.recieved_chunks[id][i] = new Uint8Array(this.recieved_chunks[id][i]);

			}
			
			//let's not pass around this.recieved_chunks so we avoid replicating large arrays by accident 
			create_file_link (this.recieved_meta[id], id, rtc.usernames[id]);
		} */
	} else {
		/* We can write to a file using FileSystem! Chrome has native support, FF uses idb.filesystem.js library */
		/* Note that decrypted file packets are passed here by file_decrypt, we don't have to do any decryption here */
		
		write_to_file(id, rtc.usernames[id], message, this.recieved_meta[id].chunks_recieved, hash);
		this.recieved_meta[id].chunks_recieved++;
		
		if (this.recieved_meta[id].numOfChunksInFile > this.recieved_meta[id].chunks_recieved) {
			update_container_percentage(id, rtc.usernames[id], this.recieved_meta[id].chunks_recieved - 1, this.recieved_meta[id].numOfChunksInFile, this.recieved_meta[id].size);
		} else {
			console.log("done downloading file!");
			/* stop accepting file info */
			this.downloading[id] = false;
			/* creating the download link is handled by write_to_file */
		}
	}
}

/* inbound - recieve data
 * note that data.chunk refers to the incoming chunk #
 */
function process_data(data) {
	
	if (data.file_meta) {
		/* we are recieving file meta data */
	
		/* if it contains file_meta, must be meta data! */
		this.recieved_meta[data.id] = data.file_meta;
		this.recieved_meta[data.id].name = sanitize(this.recieved_meta[data.id].name);
		
		//console.log(this.recieved_meta[data.id]);
		this.recieved_chunks[data.id] = []; //clear out our chunks
		
		/* we are not downloading anymore if we just got meta data from a user
		 * call to create_pre_file_link is reliant on this to not display [c] button on new file information
		*/
		this.downloading[data.id] = false;
		delete_file(data.id);
		
		
		/* create a download link */
		create_pre_file_link(this.recieved_meta[data.id], data.id, data.username);
		
		/* if auto-download, start the process */
		if ($("#auto_download").prop('checked')) {
			download_file(data.id);
		}
	} else if (data.kill) {
		/* if it is a kill msg, then the user on the other end has stopped uploading! */
		
		this.recieved_chunks[data.id] = []; //clear out our chunks
		this.downloading[data.id] = false;
		delete_file(data.id);
		if (this.recieved_meta[data.id]) {
			this.recieved_meta[data.id].chunks_recieved = 0;
		}
		create_or_clear_container(data.id, data.username);
		
	} else if (data.ok_to_download) {
		/* if we recieve an ok to download message from other host, our last file hash checks out and we can now offer the file up to the user */
		
		if (is_chrome) {
			create_file_link (recieved_meta[data.id], data.id, data.username, saved_fileEntry[data.id]);
		} else {
			/* one little idb.filesystem.js quirk */
			saved_fileEntry[data.id].file(function(file) { 
				create_file_link (recieved_meta[data.id], data.id, data.username, file); /* <-- file, not fileEntry */
			});
		}
	} else {
		/* otherwise, we are going to assume that if we have reached here, this is a request to download our file */
		
		send_chunk_if_queue_empty(data.id, data.chunk, data.rand, data.hash);
	}
}

/* request chunk # chunk_num from id, at this point just used to request the first chunk */
function request_chunk(id, chunk_num, hash) {
	//console.log("requesting chunk " + chunk_num + " from " + id);
	if (encryption_type != "NONE") {
		request_chunk_decrypt_rand[id] = generate_second_half_RC4_random();
		dataChannelChat.send(id, JSON.stringify({
			"eventName": "request_chunk",
			"data": {
				"chunk": chunk_num,
				"rand": request_chunk_decrypt_rand[id],
				"hash": hash
			}
		}));
	} else {
		dataChannelChat.send(id, JSON.stringify({
			"eventName": "request_chunk",
			"data": {
				"chunk": chunk_num
			}
		}));
	}
}

/* request id's file by sending request for block 0 */
function download_file(id) {

	window.requestFileSystem(window.TEMPORARY, this.recieved_meta[id].size, function(filesystem) {
		fs[data.id] = filesystem;
		downloading[id] = true; /* accept file info from user */
		request_chunk(id, 0, 0);
	});
	
	this.recieved_meta[id].chunks_recieved = 0;
}

/* cancel incoming file */
function cancel_file(id) {
	this.downloading[id] = false; /* deny file info from user */
	delete_file(id);
	this.recieved_meta[id].chunks_recieved = 0;
	this.recieved_chunks[id] = []; //clear out our chunks
	/* create a new download link */
	create_pre_file_link(this.recieved_meta[id], id, rtc.usernames[id]);
}

/* creates an entry in our filelist for a user, if it doesn't exist already - TODO: move this to script.js? */
function create_or_clear_container(id, username) {
	var filelist = document.getElementById('filelist_cointainer');
	var filecontainer = document.getElementById(id);
	username = sanitize(username);
	
	/* if the user is downloading something from this person, we should only clear the inside span to save the cancel button */
	if (this.downloading[id] == true) {
		var span = document.getElementById(id + "-span");
		if (!span) {
			filecontainer.innerHTML = username+': <span id="'+id+'-span"></span>';
			/* add cancel button */
			var a = document.createElement('a');
			a.download = meta.name;
			a.id = id + '-cancel';
			a.href = 'javascript:void(0);';
			a.style.cssText = 'color:red;';
			a.textContent = '[c]';
			a.draggable = true;
			//onclick, cancel!
			a.setAttribute('onclick','javascript:cancel_file("' + id + '");');
			//append link!
			filecontainer.appendChild(a);
		} else {
			span.innerHTML="";
		}
		return;
	}
	
	if (!filecontainer) {
		/* if filecontainer doesn't exist, create it */
		var fs = '<div id="' + id + '">' + username + '</div>';
		filelist.innerHTML = filelist.innerHTML + fs;
	} else {
		/* if filecontainer does exist, clear it */
		filecontainer.innerHTML = username;
	}
}

/* creates an entry in our filelist for a user, if it doesn't exist already */
function remove_container(id) {
	var filecontainer = document.getElementById(id);
	if (filecontainer) {
		filecontainer.remove();
	}
}

/* create a link that will let the user start the download */
function create_upload_stop_link(filename, id, username) {
	
	//create a place to store this if it does not already
	create_or_clear_container(id, username);
	var filecontainer = document.getElementById(id);
	
	//create the link
	var span = document.createElement('span');
	span.textContent = ': '+filename + ' ';
	
	var a = document.createElement('a');
	a.download = meta.name;
	a.id = 'upload_stop';
	a.href = 'javascript:void(0);';
	a.textContent = '[stop upload]';
	a.style.cssText = 'color:red;';
	a.draggable = true;
	
	//onclick, download the file! 
	a.setAttribute('onclick','javascript:upload_stop();');
	
	//append link!
	filecontainer.appendChild(span);
	filecontainer.appendChild(a);
}

/* create a link that will let the user start the download */
function create_pre_file_link(meta, id, username) {
	
	//create a place to store this if it does not already
	create_or_clear_container(id, username);
	var filecontainer = document.getElementById(id);
	
	//create the link
	var span = document.createElement('span');
	span.textContent = ': ';
	
	var a = document.createElement('a');
	a.download = meta.name;
	a.id = id + '-download';
	a.href = 'javascript:void(0);';
	a.textContent = 'download ' + meta.name + ' ' + getReadableFileSizeString(meta.size);
	a.draggable = true;
	
	//onclick, download the file! 
	a.setAttribute('onclick','javascript:download_file("' + id + '");');
	
	//append link!
	filecontainer.appendChild(span);
	filecontainer.appendChild(a);

	//append to chat
	systemMessage(username +" is now offering file " + meta.name);
}

/* update a file container with a DL % */
function update_container_percentage(id, username, chunk_num, chunk_total, total_size) {

	create_or_clear_container(id, username);
	var span = document.getElementById(id+'-span');

	/* create file % based on chunk # downloaded */
	var percentage = (chunk_num / chunk_total) * 100;
	span.innerHTML = percentage.toFixed(1) + "% of " + getReadableFileSizeString(total_size) + ' ';
	
}

/* -h */
function getReadableFileSizeString(fileSizeInBytes) {
	var i = -1;
	var byteUnits = [' kB', ' MB', ' GB', ' TB', 'PB', 'EB', 'ZB', 'YB'];
	do {
		fileSizeInBytes = fileSizeInBytes / 1024;
		i++;
	} while (fileSizeInBytes > 1024);
	return Math.max(fileSizeInBytes, 0.1).toFixed(1) + byteUnits[i];
};

/* create a link to this file */
function create_file_link (meta, id, username, fileEntry) {
	//grab the file type, should probably use a pattern match...
	var remove_base = meta.filetype.split(";");
	var remove_data = remove_base[0].split(":");
	var filetype = remove_data[1];
	var debase64_data;
	
	//create a place to store this if it does not already
	create_or_clear_container(id, username);
	var filecontainer = document.getElementById(id);
	
	//create the link
	var span = document.createElement('span');
	span.textContent = ': ';
	var a = document.createElement('a');
	a.download = meta.name;
	/* One difference with Chrome & FF :( */
	if (is_chrome) {
		/* we are going to link to our local file system */
		a.href = fileEntry.toURL();
	} else {
		/* fileEntry is actually not a FileEntry, but a blob in Chrome */
		a.href = window.URL.createObjectURL(fileEntry);
	}
	a.textContent = 'save ' + meta.name;
	a.dataset.downloadurl = [filetype, a.download, a.href].join(':');
	a.draggable = true;

	//append link!
	var messages = document.getElementById('messages');
	filecontainer.appendChild(span);
	filecontainer.appendChild(a);
	
	/* make delete button */
	filecontainer.innerHTML = filecontainer.innerHTML+ " ";
	/* add cancel button */
	var can = document.createElement('a');
	can.download = meta.name;
	can.id = id + '-cancel';
	can.href = 'javascript:void(0);';
	can.style.cssText = 'color:red;';
	can.textContent = '[d]';
	can.draggable = true;
	//onclick, cancel!
	can.setAttribute('onclick','javascript:cancel_file("' + id + '");');
	//append link!
	filecontainer.appendChild(can);
	
	//append to chat
	systemMessage(username +"'s file " + meta.name + " is ready to save locally");
}

/* send out meta data, allow for id to be empty = broadcast */
function send_meta(id) {
	if (jQuery.isEmptyObject(this.meta)) {
		return;
	}
	console.log("sending meta data");
	console.log(this.meta);
	if (!id) {
		dataChannelChat.broadcast(JSON.stringify({
			"eventName": "data_msg",
			"data": {
				"file_meta": this.meta
			}
		}));
	} else {
		dataChannelChat.send(id, JSON.stringify({
			"eventName": "data_msg",
			"data": {
				"file_meta": this.meta
			}
		}));
	}
}

/* Please note that this works by sending a chunk, then waiting for a request for the next one */
function sendchunk(id, chunk_num, rand, hash) {
	/* uncomment the following lines and set breakpoints on them to similar an impaired connection */
	/* if (chunk_num == 30) { console.log("30 reached, breakpoint this line");}
	if (chunk_num == 50) { console.log("30 reached"); }*/
	//console.log("sending chunk " + chunk_num + " to " + id);
	
	/* need to check hash of previous encrpytion if received */
	if (encryption_type != "NONE") {
		if (!check_previous_hash(id,chunk_num,hash)){
			console.error("bad hash seen, requesting download stop!");
			/* make download stop by sending a kill message */
			dataChannelChat.send(id, JSON.stringify({
				"eventName": "kill_msg",
				"data": {
					"kill": true
				}
			}));
			/*resend that user the file meta data (after a second) */
			setTimeout(function(){send_meta(id);}, 1000);
			return; /* and not sending out any more data, making user request download */
		}
		
		/* if we get a request beyond the file length, this must be a request to ONLY verify the hash of the last chunk, 
		 * we just did that above, so we can safely send back an OK to download back now!
		 * RETURN here so that we don't try an invalid file access.
		 */
		if (this.meta.numOfChunksInFile == chunk_num ) {
			//console.log("last chunk verification observed, sending OK to download");
			dataChannelChat.send(id, JSON.stringify({
				"eventName": "ok_to_download",
				"data": {
					"ok_to_download": true
				}
			}));
			return;
		}
	}

	var reader = new FileReader;
	var upper_limit = (chunk_num + 1) * get_chunk_size();
	if (upper_limit > this.meta.size) { upper_limit = this.meta.size; }
	
	var blob = file_to_upload.slice(chunk_num * get_chunk_size(), upper_limit);
	reader.onload = function(event) { 
		if (reader.readyState == FileReader.DONE) {
			//console.log('sending: '+chunk_num);
			
			if (encryption_type != "NONE") {
				msg = file_encrypt_and_send(id, event.target.result, rand, chunk_num);
			} else {
				dataChannelChat.send(id, event.target.result);
			}
		}
		
		
	}
	reader.readAsArrayBuffer(blob);
}

/***** File System Errors *****/
//credit - http://www.html5rocks.com/en/tutorials/file/filesystem/
function FSerrorHandler(e) {
  var msg = '';
  switch (e.code) {
    case FileError.QUOTA_EXCEEDED_ERR:
      msg = 'QUOTA_EXCEEDED_ERR';
      break;
    case FileError.NOT_FOUND_ERR:
      msg = 'NOT_FOUND_ERR';
      break;
    case FileError.SECURITY_ERR:
      msg = 'SECURITY_ERR';
      break;
    case FileError.INVALID_MODIFICATION_ERR:
      msg = 'INVALID_MODIFICATION_ERR';
      break;
    case FileError.INVALID_STATE_ERR:
      msg = 'INVALID_STATE_ERR';
      break;
    default:
      msg = 'Unknown Error';
      break;
  };
  console.error('Error: ' + msg);
}
