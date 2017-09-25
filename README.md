# mediaconversion

Convert videos using ffmpeg

# Grabbing raw v4l stream

```javascript
var MC = require('mediaconversion');

// Create the conversion instance
let conv = new MC.MediaConversion();

// Set the correct input path
let input = conv.addInput('/dev/some/video/device');

// Set the input type
input.setVideoCodec('video4linux');

// Create a passthrough output stream
let output = conv.addOutput();

// Enable the copy profile
output.useProfile('copy');

// Start the "conversion"
conv.start();
```

