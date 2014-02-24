## webRTCCopy

https://www.rtccopy.com

https://chrome.google.com/webstore/detail/webrtc-copy/fhafbipndpjocogeohkfbmnoiokloged

Using the library https://raw.github.com/erbbysam/webRTC-data.io to create a IM/filesharing website & chrome app.
Tested & working in Chrome, Firefox & Opera.

### WebRTC Connection Note
This website does require a reliable WebRTC connection, which is only supported in Chrome, Firefox & Opera.

Communication between Chrome & Opera is working.

Communication between Firefox and Chrome/Opera is working.

### File IO note
At no point is data stored in the browsers memory. This code will write and read directly from disk, except Firefox which cannot write directly to disk.
This is because we must use [idb.filesystem.js] (https://github.com/ebidel/idb.filesystem.js) to mimic the HTML5 FileSystem API for Firefox. It's one limitation is that we cannot provide the user with a file link directly from this (like we can with Chrome). So we must instead write to it, then grab the file as a blob and place it into JS memory so the user can then download it to their local file system.

### WebRTC datachannel note
Each chunk of a file is requested by the receiving end (a file is divided into many chunks), only after the previous chunk has been received (each chunk is sent over in smaller peices). This is done this way because, there is no way easily send large amounts of data without first deviding it up further, see:

https://code.google.com/p/webrtc/issues/detail?id=2270#c35

https://code.google.com/p/webrtc/issues/detail?id=2279#c18

http://tools.ietf.org/html/draft-ietf-rtcweb-data-channel-07#section-6.6

### Additional crypto/OTR information
OTR has been disabled on rtccopy.com. It is not safe to trust a 3rd party server to deliever cryptographic code. In order to use this feature, please either host the client portion of the site yourself or download the chrome app here - https://chrome.google.com/webstore/detail/webrtc-copy/fhafbipndpjocogeohkfbmnoiokloged

For details on the implementation see:

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
Copyright (C) 2013-2014 [Samuel Erb] (http://erbbysam.com)

    webRTCCopy is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    webRTCCopy is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
    
http://www.tldrlegal.com/license/gnu-general-public-license-v3-(gpl-3)

Prior to 11/9/2013 this work was licensed under a [Creative Commons Attribution-ShareAlike 3.0 Unported License] (http://creativecommons.org/licenses/by-sa/3.0/deed.en_US).
This is an incorrect license to use for a software project (see https://github.com/erbbysam/webRTCCopy/issues/9 ).

Originally based on [webrtc.io-demo] (https://github.com/webRTC/webrtc.io-demo) developed by: @dennismatensson @cavedweller @sarenji
