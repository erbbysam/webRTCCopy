var express = require('express');
var https = require('https');
var fs = require('fs');
var webRTC = require('webrtc.io');

// This line is from the Node.js HTTPS documentation.
var options = {
  key: fs.readFileSync('/root/rtccopy.key'),
  cert: fs.readFileSync('/root/sec/rtccopy_com.crt')
};

// Create a service (the app object is just a callback).
var app = express();

// Create an HTTPS service identical to the HTTP service.
var server = https.createServer(options, app);

/* WebRTC! */
webRTC.listen(server);

server.listen(8001);