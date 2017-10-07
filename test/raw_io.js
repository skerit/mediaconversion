var assert  = require('assert'),
    libpath = require('path'),
    fs      = require('fs');

if (!global.MC) {
	global.MC = require('../index');
}

describe('Raw output/input', function() {

	var raw_total,
	    gray_count = 0,
	    gray_info,
	    rgb_info;

	this.timeout(0);
	this.slow(2000);

	it('should output raw video', function(done) {

		var conv = new MC.MediaConversion({debug: false}),
		    total = 0,
		    count = 0,
		    f = 0;

		let input = conv.addInput(fs.createReadStream(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4')));

		// This also tests multiple outputs!
		let output = conv.addOutput();

		output.setMany({
			disable_audio : true,
			video_codec   : 'rawvideo',
			format        : 'data',
			deadline      : 'realtime',
			preset        : 'ultrafast',
			bufsize       : '128k',
			video_size    : '320x280',
			framerate     : 15,
			arguments     : [
				// Change format to RGBA
				//'-pix_fmt', 'rgba',

				// Use nearest neighbor resampling (fastest, but lq)
				'-sws_flags', 'neighbor',

				// Needed for raw video mapping
				'-map', '0'
			]
		});

		output.on('data', function onData(data) {
			total += data.length;
		});

		output.on('end', function onEnd() {
			raw_total = total;
			assert.equal(total, 52012800, 'Total raw output size should have been 52012800');
			done();
		});

		conv.start();
	});

	it('raw output should be recognized', function(done) {

		var conv = new MC.MediaConversion({debug: false}),
		    total = 0,
		    count = 0,
		    f = 0;

		let input = conv.addInput(fs.createReadStream(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4')));

		// This also tests multiple outputs!
		let output = conv.addOutput();

		output.setMany({
			disable_audio : true,
			video_codec   : 'rawvideo',
			format        : 'data',
			deadline      : 'realtime',
			preset        : 'ultrafast',
			bufsize       : '128k',
			video_size    : '320x280',
			framerate     : 15,
			arguments     : [
				// Change format to RGBA
				//'-pix_fmt', 'rgba',

				// Use nearest neighbor resampling (fastest, but lq)
				'-sws_flags', 'neighbor',

				// Needed for raw video mapping
				'-map', '0'
			]
		});

		conv.start();

		let second = new MC.MediaConversion({debug: false});

		let sinput = second.addInput(output);
		let soutput = second.addOutput();
		let stotal = 0;

		soutput.useProfile('jsmpeg');
		soutput.setFramerate(16)

		soutput.on('data', function onData(c) {
			stotal += c.length;
		});

		soutput.on('end', function onEnd() {
			assert.equal(stotal < raw_total, true, 'JSmpeg output was not smaller than the raw output');
			assert.equal(stotal > 3200000, true, 'JSmpeg output was too small');
			done();
		});

		second.start();
	});

});