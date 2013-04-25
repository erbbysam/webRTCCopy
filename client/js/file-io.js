
/***************
	FILE UPLOADING
	(c) 2013 Samuel Erb
****************/

/* sending functionality, only allow 1 file to be sent out at a time */
this.chunks = {};
this.meta = {};
this.numOfChunksInFile = 10; /* set to some arbitrarily low number for right now */
this.CHUNK_SIZE = 1000;
this.timeout = 1000; /* time before resending request for next chunk */

/* recieving functionality, allow multiple at the same time! */
this.recieved_chunks = [];
this.recieved_meta = [];
this.recieved_timeout = [];

/* Document bind's to accept files copied. Don't accept until we have a connection */
function accept_inbound_files() {

	$(document).bind('drop dragover dragenter', function (e) {
		// todo: CSS signal?
		e.preventDefault();
	});

	/* drop a file on the page! */
	$(document).bind('drop', function (e) {
		var file = e.originalEvent.dataTransfer.files[0];

		reader = new FileReader();
		systemMessage("now processing "+file.name);
		//send out once FileReader reads in file
		reader.onload = function (event) {
			chunkify(event.target.result, file);
			systemMessage("now uploading "+file.name);
			send_meta();
			systemMessage("file ready to send");
		};
		reader.readAsDataURL(file);
	});
}

/* recursive re-request callback function for passing parameters through setTimeout */
function resend_chunk_request_CB(id, chunk_num) {
  return function(){
    resend_chunk_request(id, chunk_num);
  };
}

/* recursivly re-request the next chunk until we get it, it isn't perfect, but it works */
function resend_chunk_request(id, chunk_num) {
	console.log("re-requesting chunk " + chunk_num + " from " + id);
	/* request the next chunk */
	request_chunk(id, chunk_num);
	/* reset the timeout */
	clearTimeout(this.recieved_timeout[id]);
	this.recieved_timeout[id] = setTimeout(resend_chunk_request_CB(id, chunk_num),this.timeout);
}

/* inbound - recieve data */
function process_data(data) {
	window.URL = window.webkitURL || window.URL;
	
	if (data.file) {
		//if it has file_params, we are reciving a file chunk */
		var chunk_length = this.recieved_chunks[data.id].length;
		this.recieved_chunks[data.id][data.chunk] = data.file;
		//request the next chunk, if we just didn't get the last
		if (this.recieved_meta[data.id].numOfChunksInFile > (data.chunk + 1)) {
			/* only send the request for the next chunk if the number of chunks we have went up (ie. we saw a new chunk) */
			if (chunk_length < this.recieved_chunks[data.id].length) {
				/* update the cointainer % */
				update_container_percentage(data.id, data.chunk, this.recieved_meta[data.id].numOfChunksInFile, this.recieved_meta[data.id].size);
				/* request the next chunk */
				request_chunk(data.id, (data.chunk + 1));
				/* reset the timeout */
				clearTimeout(this.recieved_timeout[data.id]);
				this.recieved_timeout[data.id] = setTimeout(resend_chunk_request_CB(data.id, (data.chunk + 1)),this.timeout);
			}
		} else {
			console.log("done downloading file!");
			/* reset the timeout so we don't recieve the same packet twice */
			clearTimeout(this.recieved_timeout[data.id]);
			/* now combine the chunks and form a link! */
			var combine_chunks = '';
            for (var i = 0; i < this.recieved_meta[data.id].numOfChunksInFile; i++) {
				if (this.recieved_chunks[data.id][i] == ''){
					console.log("missing chunk! " + i);
				}
                combine_chunks += this.recieved_chunks[data.id][i];
            }
			create_file_link (combine_chunks,this.recieved_meta[data.id], data.id, data.username);
		}
		
	} else if (data.file_meta) {
		/* if it contains file_meta, must be meta data! */
		this.recieved_meta[data.id] = data.file_meta;
		console.log(this.recieved_meta[data.id]);
		this.recieved_chunks[data.id] = []; //clear out our chunks
		
		/* create a download link */
		create_pre_file_link(this.recieved_meta[data.id], data.id, data.username);
		
		/* if auto-download, start the process */
		if ($("#auto_download").prop('checked')) {
			download_file(data.id);
		}
	} else {
		/* if it does not have file_params, must be request for next chunk, send it, don't broadcast */
		sendchunk(data.id, data.chunk);
	}
}

/* request chunk # chunk_num from id */
function request_chunk(id, chunk_num) {
	//console.log("requesting chunk " + chunk_num + " from " + id);
	dataChannelChat.send(id, JSON.stringify({
		"eventName": "request_chunk",
		"data": {
			"chunk": chunk_num
		}
	}));
}

/* request id's file by sending request for block 0 */
function download_file(id) {
	request_chunk(id, 0);
}

/* creates an entry in our filelist for a user, if it doesn't exist already */
function create_or_clear_container(id, username) {
	var filelist = document.getElementById('filelist_cointainer');
	var filecontainer = document.getElementById(id);
	
	if (!filecontainer) {
		/* if filecontainer doesn't exist, create it */
		var fs = '<div id="' + id + '">' + username + ': </div>';
		filelist.innerHTML = filelist.innerHTML + fs;
	} else {
		/* if filecontainer does exist, clear it */
		filecontainer.innerHTML = username + ": ";
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
function create_pre_file_link(meta, id, username) {
	
	//create a place to store this if it does not already
	create_or_clear_container(id, username);
	var filecontainer = document.getElementById(id);
	
	//create the link
	var a = document.createElement('a');
	a.download = meta.name;
	a.id = id + '-download';
	a.href = 'javascript:void(0);';
	a.textContent = 'download ' + meta.name + ' ' + getReadableFileSizeString(meta.size);
	a.draggable = true;
	
	//onclick, download the file! 
	a.setAttribute('onclick','javascript:download_file("' + id + '");');
	
	//append link!
	var messages = document.getElementById('messages');
	filecontainer.appendChild(a);

	//append to chat
	systemMessage(username +" is now offering file " + meta.name);
}

/* update a file container with a DL % */
function update_container_percentage(id, chunk_num, chunk_total, total_size) {

	create_or_clear_container(id, username);
	var filecontainer = document.getElementById(id);

	/* create file % based on chunk # downloaded */
	var percentage = (chunk_num / chunk_total) * 100;
	filecontainer.innerHTML = filecontainer.innerHTML + percentage.toFixed(1) + "% of " + getReadableFileSizeString(total_size); 
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
function create_file_link (combine_chunks, meta, id, username) {
	//grab the file type, should probably use a pattern match...
	var remove_base = meta.filetype.split(";");
	var remove_data = remove_base[0].split(":");
	var filetype = remove_data[1];

	//now handle the data
	var debase64_data = base64.decode(combine_chunks);
	var bb = new Blob([new Uint8Array(debase64_data)], {type: filetype});

	//create a place to store this if it does not already
	create_or_clear_container(id, username);
	var filecontainer = document.getElementById(id);
	
	//create the link
	var a = document.createElement('a');
	a.download = meta.name;
	a.href = window.URL.createObjectURL(bb);
	a.textContent = 'save ' + meta.name;
	a.dataset.downloadurl = [filetype, a.download, a.href].join(':');
	a.draggable = true;

	//append link!
	var messages = document.getElementById('messages');
	filecontainer.appendChild(a);
	
	//append to chat
	systemMessage(username +"'s file " + meta.name + " is ready to save locally");
}

/* devide the base64'd file into chunks, also process meta data */
function chunkify(result, file) {
	var split = result.split(',');
	
	/* meta data */
	this.meta.name = file.name;
	this.meta.size = file.size;
	this.meta.filetype = split[0];
	
	/*chunkify */
	var file = split[1];//base64
	this.numOfChunksInFile = Math.ceil(file.length / this.CHUNK_SIZE);
	this.meta.numOfChunksInFile = numOfChunksInFile;
	console.log("number of chunks to send:"+this.numOfChunksInFile);
	
	for (var i = 0; i < this.numOfChunksInFile; i++) {
		var start = i * this.CHUNK_SIZE;
		this.chunks[i] = file.slice(start, start + this.CHUNK_SIZE);
	}
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
function sendchunk(id, chunk_num) {
	/* uncomment the following 6 lines and set breakpoints on them to similar an impaired connection */
	/* if (chunk_num == 30) { 
		console.log("30 reached, breakpoint this line"); 
	}
	if (chunk_num == 50) { 
		console.log("30 reached"); 
	}*/
	//console.log("sending chunk " + chunk_num + " to " + id);
	dataChannelChat.send(id, JSON.stringify({
		"eventName": "data_msg",
		"data": {
			"chunk": chunk_num,
			"file": this.chunks[chunk_num]
		}
	}));
}