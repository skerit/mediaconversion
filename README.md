# mediaconversion

[![NPM version](http://img.shields.io/npm/v/mediaconversion.svg)](https://npmjs.org/package/mediaconversion) 
[![Build Status](https://travis-ci.org/skerit/mediaconversion.svg?branch=master)](https://travis-ci.org/skerit/mediaconversion)
[![Coverage Status](https://coveralls.io/repos/github/skerit/mediaconversion/badge.svg?branch=master)](https://coveralls.io/github/skerit/mediaconversion?branch=master)

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

