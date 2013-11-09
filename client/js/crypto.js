
/***************
	crypto/otr functionality
	
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


/* your crypto information */

this.myKey; //setup in init function
this.buddy_crypto_streams = [];
this.buddy_crypto_recieve_symetric_keys = [];
this.buddy_crypto_send_symetric_keys = [];
this.buddy_crypto_verified = []; /* this WILL NOT be set to true until SMP is verified */
var request_chunk_decrypt_rand = []; /* this is the decryption key we sent when requesting an encrypted file chunk */
var hashed_message = [];

/***************
	OTR functions 
	Steps 1,2,3,4 are labeled below
****************/

function otr_init_function() {
	console.log("Generating otr crypto key!");
	myKey = new DSA();
	console.log("Done generating otr crypto key!");
}

function otr_connect_buddy(id) {

	//removed: fragment_size: 140, send_interval: 200 <-- might need to readd send_interval?
	var options = {
		fragment_size: 1000,
		priv: this.myKey
	}

	this.buddy_crypto_verified[id] = false; /* do not allow sending or recieving outside of this file yet */
	this.buddy_crypto_streams[id] = new OTR(options);
	this.buddy_crypto_streams[id].ALLOW_V2 = false; /* We need V3 b/c we want the symetric key generated for file transfers */
	this.buddy_crypto_streams[id].REQUIRE_ENCRYPTION = true;

	/* recieve function */
	this.buddy_crypto_streams[id].on('ui', function (msg, encrypted) {
		if (encrypted) {
			//console.log("message to display to the user: " + msg);
			if (buddy_crypto_verified[id]) { /* do NOT pass along packet until connection is verified via SMP */
				packet_inbound(id,msg);
			}
		} else {
			console.error("Attempted to send non-encrypted message, not allowing to send!");
		}
	});

	/* Send function */
	this.buddy_crypto_streams[id].on('io', function (msg) {
		//console.log("message to send to buddy "+id+": " + msg);
		var channel = rtc.dataChannels[id];
		channel.send(msg);
	});

	/* error function */
	this.buddy_crypto_streams[id].on('error', function (err) {
		console.error("error occurred: " + err);
	});
	
	this.buddy_crypto_streams[id].on('status', function (state) {
	if (state === OTR.CONST.STATUS_AKE_SUCCESS) {
		console.log('AKE SUCCESS');
		/* once we have AKE Success, do file transaction if we have not yet */
		if (!buddy_crypto_send_symetric_keys[id]) {
			/* Step 2) Send blank file to share symmetric crypto key */
			this.sendFile('test'); /* send a non-real filename registering a pre-shared private key */
		}
	}

	if (state === OTR.CONST.STATUS_END_OTR) {
		console.error('OTR disconnect :(');
	}

	});
	
	this.buddy_crypto_streams[id].on('file', function (type, key, filename) {
		if (type === 'send') {
			buddy_crypto_send_symetric_keys[id] = key;
			console.log('send message key: '+key);
		}else if (type === 'receive') {
			buddy_crypto_recieve_symetric_keys[id] = key;
			console.log('receive message key: '+key);
		} else {
			console.error('unrecognized otr file type: '+type);
		}
		
		/* these are equal, so lets compare them to verify */
		if (buddy_crypto_recieve_symetric_keys[id] && buddy_crypto_send_symetric_keys[id]){
			if (buddy_crypto_send_symetric_keys[id] != buddy_crypto_recieve_symetric_keys[id]) {
				console.error("ERROR - non-matching crypto keys!");
			} else {
				/* if they are equal, then we can also want to verify identity using SMP */
				
				/* Step 3) Socialist Millionaire Protocol 
				 * ONLY A SINGLE HOST CAN START THIS! 
				 * We have no concept of host/initiator, so choose host with lowest ID to start 
				 * Can't use localCompare becuase Firefox doesn't offically support it?...
                 * So we are going to compare the numbers in our ID strings
				 * (ID's are psudo random number/lettter string, ie. 5bc7a87d-7b5b-5ab4-c187-0c9b2390cc7a)
				 */
				var me = rtc._me.replace ( /[^\d-]/g, '' ); /* remove letters and -'s */
				var other =id.replace ( /[^\d-]/g, '' );
				if (parseInt(me,10) > parseInt(other,10)) {
					console.log("starting smpSecret, other user must respond for connection");
					this.smpSecret(encryption_key);
				} else {
					console.log("waiting for other user to send SMP message out");
				}
			}
		}
	});
	
	this.buddy_crypto_streams[id].on('smp', function (type, data, act) {
		switch (type) {
			case 'question':
				console.log("Anwsering question:"+encryption_key);
				this.smpSecret(encryption_key);
			break
			case 'trust':
				if (!data){
					/* TODO - handle this better? */
					console.error("OTR NEGOATION FAILED!");
				}
				if (data){
					console.log("OTR Socialist Millionaire Protocol success.");
					systemMessage('now securely connected to ' + rtc.usernames[id]);
					/* Step 4) do not send messages until reached here! */
					buddy_crypto_verified[id] = true;
					/* if we have a file, send it their way */
					setTimeout(function(){send_meta(id);}, 3000); //sometimes this gets there before the other side is ready, let's delay a second just to make sure
				}
			break
			case 'abort':
				/* TODO - handle this better? */
				console.error("OTR NEGOATION FAILED!");
			default:
				console.log("type:"+type);
				throw new Error('Unknown type.');
		}
	});

	/* Step 1) start the AKE! */
	this.buddy_crypto_streams[id].sendQueryMsg();
}

function otr_send_msg(id,msg) {
	if (this.buddy_crypto_verified[id]) {
		/* do NOT pass along packet until connection is verified via SMP */
		this.buddy_crypto_streams[id].sendMsg(msg);
	}
}

function otr_rcv_msg(id,msg) {
	//console.log("message recieved from buddy "+id+": " + msg);
	this.buddy_crypto_streams[id].receiveMsg(msg);
}

/***************
	Crypto-JS functions 
	note: we had to redefine CryptoJS's namespace to not conflict with OTR CryptoJS code. No other changes were made.
			TODO - bring Rabbit's functionality into OTR's CryptoJS namespace
decrpyt & encrypt: file chunks QUICKLY using CryptoJS's Rabbit stream cipher
key:We are going to combine the symetric key that was created during our OTR initiation with a randomly generated value.
    That second random bit is to avoid sending the the same encrypted text multiple times. As we're sending this random value over our OTR channel
    when we request a chunk, we should be able to assume it's safe to use.
****************/

function generate_second_half_RC4_random() {
	var wordArray = RabbitCryptoJS.lib.WordArray.random(128/8); /* want this to be fast, so let's just grab 128 bits */
	return RabbitCryptoJS.enc.Base64.stringify(wordArray);
}

/* decrypt an inbound file peice */
function file_decrypt(id, message) {
	if (this.buddy_crypto_verified[id]) {
		hash = CryptoJS.SHA256(message).toString(CryptoJS.enc.Base64); //console.log(hash);
		
		message = RabbitCryptoJS.Rabbit.decrypt(JSON.parse(message),buddy_crypto_recieve_symetric_keys[id] + request_chunk_decrypt_rand[id]).toString(CryptoJS.enc.Utf8);
		process_binary(id, base64DecToArr(message).buffer, hash); /* send back a hash as well to send back to the original host with the next request */
	}
}
	
/* encrypt and send out a peice of a file */
function file_encrypt_and_send(id, message, additional_key, chunk_num) {
	/* MUST have completed OTR first */
	if (this.buddy_crypto_verified[id]) {
		message = _arrayBufferToBase64(message);
		message = JSON.stringify(RabbitCryptoJS.Rabbit.encrypt(message, buddy_crypto_send_symetric_keys[id] + additional_key));
		
		if (chunk_num == 0) {
			hashed_message[id] = [];
		}
		hashed_message[id][chunk_num] = CryptoJS.SHA256(message).toString(CryptoJS.enc.Base64); //console.log(hashed_message[id][chunk_num]);
		
		/* This is the one other place we can send directly! */
		var channel = rtc.dataChannels[id];
		if (rtc.connection_ok_to_send[id]) {
			channel.send(message);
		} else {
			console.error("somehow downloading encrypted file without datachannel online?");
		}
	}
}

/* check if the previous hash sent back matches up */
function check_previous_hash(id,chunk_num,hash) {
	if (chunk_num != 0) {
		//console.log("hash comparing:"+hashed_message[id][chunk_num - 1]+" "+hash);
		if (hashed_message[id][chunk_num - 1] == hash) {
			return true; /* ok */
		} else {
			return false; /*not ok */
		}
	}
	return true; /* skip for 1st chunk */
}


/***************
	base 64 functionaility for crypto operations
****************/

/* credit to http://stackoverflow.com/questions/9267899/arraybuffer-to-base64-encoded-string */
function _arrayBufferToBase64( buffer ) {
    var binary = ''
    var bytes = new Uint8Array( buffer )
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode( bytes[ i ] )
    }
    return window.btoa( binary );
}

/* credit to https://developer.mozilla.org/en-US/docs/Web/JavaScript/Base64_encoding_and_decoding#Solution_.232_.E2.80.93_rewriting_atob%28%29_and_btoa%28%29_using_TypedArrays_and_UTF-8 */
function base64DecToArr (sBase64, nBlocksSize) {
  var
    sB64Enc = sBase64.replace(/[^A-Za-z0-9\+\/]/g, ""), nInLen = sB64Enc.length,
    nOutLen = nBlocksSize ? Math.ceil((nInLen * 3 + 1 >> 2) / nBlocksSize) * nBlocksSize : nInLen * 3 + 1 >> 2, taBytes = new Uint8Array(nOutLen);

  for (var nMod3, nMod4, nUint24 = 0, nOutIdx = 0, nInIdx = 0; nInIdx < nInLen; nInIdx++) {
    nMod4 = nInIdx & 3;
    nUint24 |= b64ToUint6(sB64Enc.charCodeAt(nInIdx)) << 18 - 6 * nMod4;
    if (nMod4 === 3 || nInLen - nInIdx === 1) {
      for (nMod3 = 0; nMod3 < 3 && nOutIdx < nOutLen; nMod3++, nOutIdx++) {
        taBytes[nOutIdx] = nUint24 >>> (16 >>> nMod3 & 24) & 255;
      }
      nUint24 = 0;

    }
  }
  return taBytes;
}
function b64ToUint6 (nChr) {
  return nChr > 64 && nChr < 91 ?
      nChr - 65
    : nChr > 96 && nChr < 123 ?
      nChr - 71
    : nChr > 47 && nChr < 58 ?
      nChr + 4
    : nChr === 43 ?
      62
    : nChr === 47 ?
      63
    :
      0;
}

