# mediaconversion

Convert videos using ffmpeg

# Grabbing raw v4l stream

```javascript
var options,
    output,
    conv;

options = {
    input_type : 'video4linux2',
    profile    : 'copy'
};

// Create the conversion instance
conv = new MediaConversion();

// Set the correct input path
conv.setInput('/dev/some/video/device');

// Create a passthrough output stream
output = conv.createStream();

// Start the "conversion"
conv.start(output, options);
```

