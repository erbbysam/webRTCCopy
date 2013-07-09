# webRTCCopy - http://www.rtccopy.com
Using the library https://raw.github.com/erbbysam/webRTC-data.io to create a IM/filesharing website.
Tested & working in Chrome Canary, Chrome stable & Firefox nightly

### Install
(currently hosted on Ubuntu, but any linux server will likely work)

Copy client directory to web server public directory (ie. /var/www/)

Copy the server directory to a non-public folder (ie. your user folder ~/)

To start the server:
```
npm install ws express
node ~/server/site/server.js (or use the forever node.js module to keep it running)
```

That's it!


### LICENSE 
Copyright (C) 2013 [Samuel Erb] (http://erbbysam.com)

This work is licensed under a [Creative Commons Attribution-ShareAlike 3.0 Unported License] (http://creativecommons.org/licenses/by-sa/3.0/deed.en_US).

Originally based on [webrtc.io-demo] (https://github.com/webRTC/webrtc.io-demo) developed by: @dennismatensson @cavedweller @sarenji
