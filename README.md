# webRTCCopy - http://www.rtccopy.com
Using the library https://raw.github.com/erbbysam/webRTC-data.io to create a IM/filesharing website.
Tested & working in Chrome Canary & Firefox nightly.

### WebRTC Connection Note
This website does require a reliable WebRTC connection, which can only be supported in Chrome & Firefox. There is a bug that is preventing this from working in anything before Chrome Canary currently.
Communication between Firefox and Chrome is not supported yet, but that is suppose to land before Chrome 31 becomes the stable branch (the only fix that would have to be done on this site would be to set the chunk sizes in file-io.js to be the same for both browsers).

### File IO note
At no point is data stored in the browsers memory. Thie code will write and read directly from disk, except Firefox which cannot write directly to disk.
This is because we must use [idb.filesystem.js] (https://github.com/ebidel/idb.filesystem.js) to mimic the HTML5 FileSystem API for Firefox. It's one limitation is that we cannot provide the user with a file link directly from this (like we can with Chrome). So we must instead write to it, then grab the file as a blob and place it into JS memory so the user can then download it to their local file system.

### Additional crypto/OTR information
https://rtccopy.com/white_paper.html

### Install
(currently hosted on Ubuntu, but any linux server will likely work)

Copy client directory to web server public directory (ie. /var/www/)

Copy the server directory to a non-public folder (ie. your user folder ~/)

To start the server:
```
npm install ws express
node ~/server/site/server.js (or use the forever node.js module to keep it running)
or for secure/wss: 
node ~/server/site/server-secure.js (or use the forever node.js module to keep it running)
```

That's it!


### LICENSE 
Copyright (C) 2013 [Samuel Erb] (http://erbbysam.com)

This work is licensed under a [Creative Commons Attribution-ShareAlike 3.0 Unported License] (http://creativecommons.org/licenses/by-sa/3.0/deed.en_US).

Originally based on [webrtc.io-demo] (https://github.com/webRTC/webrtc.io-demo) developed by: @dennismatensson @cavedweller @sarenji
