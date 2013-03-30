# webRTCCopy - http://www.rtccopy.com
Using the library https://raw.github.com/erbbysam/webRTC-data.io to create a IM/filesharing website.
Tested & working in Chrome Canary & Chrome stable

### Install

Copy client directory to web server public directory (ie. /var/www/)

The server itself is identical to the one found in [webrtc.io-demo] (https://github.com/webRTC/webrtc.io-demo), however, the webrtc.io library was modified to support usernames.
Therefore, it is probably best to follow the instalation directions on [webrtc.io-demo] (https://github.com/webRTC/webrtc.io-demo) and replace the webrtc.io server file(with the [webrtc-data.io] (https://github.com/erbbysam/webRTC-data.io) one included in that folder).
To start the server:
```
node server.js
```

That's it!


### LICENSE 
Copyright (C) 2013 [Samuel Erb] (http://erbbysam.com)

This work is licensed under a [Creative Commons Attribution-ShareAlike 3.0 Unported License] (http://creativecommons.org/licenses/by-sa/3.0/deed.en_US).

Originally based on [webrtc.io-demo] (https://github.com/webRTC/webrtc.io-demo) developed by: @dennismatensson @cavedweller @sarenji
